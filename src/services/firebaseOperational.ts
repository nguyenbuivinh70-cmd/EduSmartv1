import { deleteDoc, deleteField, doc, getDoc, getDocs, collection, limit, onSnapshot, orderBy, query, runTransaction, serverTimestamp, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore';
import type { CollectionReference, DocumentData, DocumentReference, QueryDocumentSnapshot } from 'firebase/firestore';
import type {
  Account,
  CoLearningSession,
  LearningResultModerationPayload,
  LearningResultModerationSummary,
  LessonComment,
  LessonComposerValues,
  LessonContentResponse,
  LessonProgressRecord,
  LessonRow,
} from '../types';
import {
  FIREBASE_SCHOOL_ID,
  firebaseAuth,
  firebaseErrorMessage,
  firebaseInternalEmailForUsername,
  loadValidatedCurrentFirebaseMember,
  firestoreDb,
} from './firebase';
import { resolveLessonSaveState } from '../utils/lessonWorkflow';
import { buildLessonTitle, normalizeLessonName, normalizeLessonNumber, resolveLessonIdentity } from '../utils/lessonCatalog';

const MAX_LESSON_DOCUMENT_BYTES = 750 * 1024;
const IDENTITY_CACHE_TTL_MS = 5 * 60 * 1000;
const school = () => doc(firestoreDb, 'schools', FIREBASE_SCHOOL_ID);
const lessons = () => collection(school(), 'lessons');
const namedCollection = (name: string) => collection(school(), name);
const lessonContentRef = (lessonId: string) => doc(firestoreDb, 'schools', FIREBASE_SCHOOL_ID, 'lessons', lessonId, 'content', 'main');
const reviewContentRef = (reviewId: string) => doc(firestoreDb, 'schools', FIREBASE_SCHOOL_ID, 'reviewPractices', reviewId, 'content', 'main');
let identityCache: { uid: string; expiresAt: number; value: any } | null = null;
let identityPromise: { uid: string; value: Promise<any> } | null = null;
let bootstrapCache: { uid: string; expiresAt: number; value: Record<string, any[]> } | null = null;
let bootstrapPromise: { uid: string; value: Promise<Record<string, any[]>> } | null = null;

function clean(value: unknown) { return value == null ? '' : String(value).trim(); }
function cleanStringList(value: unknown) {
  return Array.isArray(value) ? value.map(clean).filter(Boolean) : [];
}

function getCoLearningParticipants(session: any) {
  const userIds = cleanStringList(session?.participant_user_ids);
  const uids = cleanStringList(session?.participant_uids);
  const names = cleanStringList(session?.participant_names);
  const participants = userIds
    .map((userId, index) => ({ userId, uid: uids[index] || '', name: names[index] || userId }))
    .filter((item) => item.userId && item.uid);

  if (!participants.length) {
    participants.push(
      { userId: clean(session?.host_user_id), uid: clean(session?.host_uid || session?.ownerUid), name: clean(session?.host_name || session?.host_user_id) },
      { userId: clean(session?.partner_user_id), uid: clean(session?.partner_uid), name: clean(session?.partner_name || session?.partner_user_id) },
    );
  }

  return participants
    .filter((item) => item.userId && item.uid)
    .filter((item, index, source) => source.findIndex((candidate) => candidate.userId === item.userId) === index)
    .slice(0, 6);
}
function audienceKeys(grade: unknown, classId: unknown) {
  const normalizedClass = clean(classId);
  const normalizedGrade = clean(grade);
  if (normalizedClass) return [`class:${normalizedClass}`];
  if (normalizedGrade) return [`grade:${normalizedGrade}`];
  return ['all'];
}

function lessonRegistryKey(source: { nam_hoc?: unknown; hoc_ky?: unknown; mon_id?: unknown; khoi?: unknown; lesson_number?: unknown; tieu_de?: unknown }) {
  const identity = resolveLessonIdentity(source);
  if (!identity.lessonNumber) return '';
  const encode = (value: unknown) => encodeURIComponent(clean(value).toLowerCase());
  return [
    encode(source.nam_hoc || 'unknown-year'),
    encode(source.hoc_ky || 'HK1'),
    encode(source.mon_id),
    `g${encode(source.khoi)}`,
    `n${identity.lessonNumber}`,
  ].join('__');
}

function registryClassMap(data: any): Record<string, string> {
  if (!data?.classLessonIds || typeof data.classLessonIds !== 'object' || Array.isArray(data.classLessonIds)) return {};
  return Object.fromEntries(Object.entries(data.classLessonIds).map(([key, value]) => [clean(key), clean(value)]).filter(([key, value]) => key && value));
}

function removeLessonFromRegistry(data: any, lessonId: string) {
  const nextClassMap = registryClassMap(data);
  Object.keys(nextClassMap).forEach((classId) => {
    if (clean(nextClassMap[classId]) === lessonId) delete nextClassMap[classId];
  });
  return {
    ...data,
    allLessonId: clean(data?.allLessonId) === lessonId ? '' : clean(data?.allLessonId),
    classLessonIds: nextClassMap,
  };
}

function registryHasAnyLesson(data: any) {
  return Boolean(clean(data?.allLessonId) || Object.keys(registryClassMap(data)).length);
}

function assertLessonNumberAvailable(registryData: any, lessonId: string, classId: string, title: string) {
  const normalized = removeLessonFromRegistry(registryData || {}, lessonId);
  const allLessonId = clean(normalized.allLessonId);
  const classMap = registryClassMap(normalized);
  const hasClassConflict = classId ? Boolean(clean(classMap[classId])) : Object.values(classMap).some(Boolean);
  if (allLessonId || hasClassConflict) {
    throw new Error(`${title} đã tồn tại trong phạm vi khối/lớp đã chọn. Hãy chọn số bài khác hoặc chỉnh sửa bài hiện có.`);
  }
}
function memberAudienceKeys(member: any) {
  return Array.from(new Set([
    'all',
    ...(clean(member?.grade) ? [`grade:${clean(member.grade)}`] : []),
    ...(clean(member?.classId) ? [`class:${clean(member.classId)}`] : []),
  ]));
}
function matchesMemberAudience(data: any, member: any) {
  const requiredClass = clean(data?.lop_id);
  const requiredGrade = clean(data?.khoi);
  const currentClass = clean(member?.classId);
  const currentGrade = clean(member?.grade);
  const matchesMetadata = (!requiredClass || requiredClass === currentClass)
    && (!requiredGrade || requiredGrade === currentGrade);
  if (requiredClass || requiredGrade) return matchesMetadata;

  // Tài liệu dùng chung toàn trường và tài liệu cũ chưa có audienceKeys.
  const allowedKeys = new Set(memberAudienceKeys(member));
  const configuredKeys = Array.isArray(data?.audienceKeys)
    ? data.audienceKeys.map(clean).filter(Boolean)
    : [];
  return !configuredKeys.length || configuredKeys.some((key: string) => allowedKeys.has(key));
}
function id(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
function withoutUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map(withoutUndefined) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, withoutUndefined(item)])) as T;
  }
  return value;
}
function assertSafeDocument(value: unknown, label: string, maxBytes = MAX_LESSON_DOCUMENT_BYTES) {
  const bytes = new TextEncoder().encode(JSON.stringify(withoutUndefined(value))).length;
  if (bytes > maxBytes) throw new Error(`${label} khoảng ${Math.ceil(bytes / 1024)} KB, vượt ngưỡng an toàn ${Math.floor(maxBytes / 1024)} KB của gói Spark.`);
}
async function identity() {
  const current = firebaseAuth.currentUser;
  if (!current) throw new Error('Bạn cần đăng nhập Firebase để sử dụng kho dữ liệu mới.');
  if (identityCache?.uid === current.uid && identityCache.expiresAt > Date.now()) {
    return identityCache.value;
  }
  if (identityPromise?.uid === current.uid) return identityPromise.value;
  const task = (async () => {
    // Luôn xác thực dữ liệu member thật (kể cả phiên được khôi phục từ localStorage).
    // Hàm này đồng thời tự sửa schoolId/authUid bị thiếu ở hồ sơ legacy khi Rules
    // V6.67.0 đã được Publish, tránh đăng nhập được nhưng collection phía sau bị chặn.
    const value = await loadValidatedCurrentFirebaseMember();
    identityCache = { uid: current.uid, expiresAt: Date.now() + IDENTITY_CACHE_TTL_MS, value };
    return value;
  })();
  identityPromise = { uid: current.uid, value: task };
  try {
    return await task;
  } finally {
    if (identityPromise?.value === task) identityPromise = null;
  }
}

export function clearFirebaseIdentityCache() {
  identityCache = null;
  identityPromise = null;
  bootstrapCache = null;
  bootstrapPromise = null;
}

async function migrateLegacyLessonDocuments(items: Array<{ id: string; data: () => DocumentData }>) {
  const legacy = items.filter(item => item.data().lesson_json !== undefined);
  for (let offset = 0; offset < legacy.length; offset += 180) {
    const batch = writeBatch(firestoreDb);
    legacy.slice(offset, offset + 180).forEach(item => {
      const current = item.data();
      const content = current.lesson_json;
      assertSafeDocument(content, 'Nội dung bài học');
      batch.set(lessonContentRef(item.id), {
        lesson_json: withoutUndefined(content),
        schoolId: FIREBASE_SCHOOL_ID,
        lessonId: item.id,
        schemaVersion: 2,
        updated_at: clean(current.updated_at) || new Date().toISOString(),
        updatedAt: serverTimestamp(),
      }, { merge: true });
      batch.update(doc(lessons(), item.id), {
        lesson_json: deleteField(),
        audienceKeys: Array.isArray(current.audienceKeys) && current.audienceKeys.length
          ? current.audienceKeys
          : audienceKeys(current.khoi, current.lop_id),
        contentPath: `lessons/${item.id}/content/main`,
        schemaVersion: 2,
        updatedAt: serverTimestamp(),
      });
    });
    await batch.commit();
  }
  if (legacy.length) {
    await setDoc(doc(school(), 'migrations', 'storage_v2'), {
      schoolId: FIREBASE_SCHOOL_ID,
      schemaVersion: 1,
      status: 'lessons_completed',
      lastLessonLegacyCount: legacy.length,
      lessonsCompletedAt: new Date().toISOString(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }
  return legacy.length;
}

export async function getFirebaseIdentity() {
  return identity();
}
function row(data: any, lessonId: string): LessonRow {
  const identity = resolveLessonIdentity(data || {});
  return {
    lesson_id: lessonId,
    tieu_de: identity.title || clean(data.tieu_de),
    lesson_number: identity.lessonNumber, lesson_name: identity.lessonName, lesson_key: clean(data.lesson_key),
    lop_id: clean(data.lop_id), khoi: clean(data.khoi), mon_id: clean(data.mon_id),
    nguoi_tao_id: clean(data.nguoi_tao_id), pham_vi: data.pham_vi === 'shared' ? 'shared' : 'private',
    trang_thai: clean(data.trang_thai), source_file_id: clean(data.source_file_id), json_file_id: clean(data.json_file_id),
    tom_tat: clean(data.tom_tat), tu_khoa: clean(data.tu_khoa), nam_hoc: clean(data.nam_hoc), hoc_ky: clean(data.hoc_ky),
    thoi_gian_bat_dau: clean(data.thoi_gian_bat_dau), thoi_gian_ket_thuc: clean(data.thoi_gian_ket_thuc),
    cho_phep_hoc_sau_han: data.cho_phep_hoc_sau_han, cho_phep_nop_sau_han: data.cho_phep_nop_sau_han,
    is_locked: data.is_locked === true,
    locked_at: clean(data.locked_at), locked_by_uid: clean(data.locked_by_uid), locked_by_name: clean(data.locked_by_name),
    created_at: clean(data.created_at), updated_at: clean(data.updated_at),
  };
}

export async function listFirebaseLessons(filters: Record<string, unknown> = {}) {
  const me = await identity();
  const snapshots = me.role === 'admin' || me.adminPermission === true
    ? [await getDocs(query(lessons(), orderBy('updated_at', 'desc'), limit(250)))]
    : me.role === 'teacher'
      ? await Promise.all([
          getDocs(query(lessons(), where('pham_vi', '==', 'shared'), orderBy('updated_at', 'desc'), limit(120))),
          getDocs(query(lessons(), where('createdByUid', '==', me.uid), orderBy('updated_at', 'desc'), limit(120))),
        ])
      : [await getDocs(query(
          lessons(),
          where('pham_vi', '==', 'shared'),
          where('trang_thai', '==', 'approved_shared'),
          limit(250),
        ))];
  if (me.role === 'admin' || me.adminPermission === true) {
    await migrateLegacyLessonDocuments(snapshots.flatMap(snapshot => snapshot.docs));
  }
  const unique = new Map<string, { lesson: LessonRow; source: any }>();
  snapshots.forEach(snap => snap.docs.forEach(item => unique.set(item.id, {
    lesson: row(item.data(), item.id),
    source: item.data(),
  })));
  return Array.from(unique.values()).filter(({ lesson: item, source }) => {
    if (filters.lesson_id && item.lesson_id !== clean(filters.lesson_id)) return false;
    if (filters.mon_id && item.mon_id !== clean(filters.mon_id)) return false;
    if (filters.lop_id && item.lop_id !== clean(filters.lop_id)) return false;
    if (filters.khoi && item.khoi !== clean(filters.khoi)) return false;
    if (filters.nam_hoc && item.nam_hoc !== clean(filters.nam_hoc)) return false;
    if (me.role === 'teacher' && item.pham_vi !== 'shared' && item.nguoi_tao_id !== clean(me.userId)) return false;
    if (me.role === 'student' && !matchesMemberAudience(source, me)) return false;
    return true;
  }).map(({ lesson }) => lesson)
    .sort((left, right) => clean(right.updated_at).localeCompare(clean(left.updated_at)));
}

export async function getFirebaseLesson(lessonId: string): Promise<LessonContentResponse | null> {
  const me = await identity();
  const metadataSnap = await getDoc(doc(lessons(), lessonId));
  if (!metadataSnap.exists()) return null;
  const data = metadataSnap.data() as any;
  const lesson = row(data, metadataSnap.id);
  if (me.role === 'student' && lesson.is_locked === true) {
    throw new Error('Bài học hiện đang được giáo viên khóa. Em hãy chờ giáo viên mở bài rồi thử lại.');
  }
  const contentSnap = await getDoc(lessonContentRef(lessonId));
  const contentData = contentSnap.exists() ? contentSnap.data() as any : null;
  return { lesson, content: contentData?.lesson_json ?? data.lesson_json };
}

export async function setFirebaseLessonLock(lessonId: string, locked: boolean) {
  const me = await identity();
  const target = doc(lessons(), clean(lessonId));
  const snap = await getDoc(target);
  if (!snap.exists()) throw new Error('Không tìm thấy bài học cần cập nhật.');
  const current = snap.data() as any;
  const isOwnerTeacher = me.role === 'teacher' && clean(current.createdByUid) === clean(me.uid);
  if (!(me.role === 'admin' || me.adminPermission === true || isOwnerTeacher)) {
    throw new Error('Bạn không có quyền khóa hoặc mở khóa bài học này.');
  }
  const now = new Date().toISOString();
  const patch = locked
    ? { is_locked: true, locked_at: now, locked_by_uid: me.uid, locked_by_name: clean(me.displayName || me.username || me.userId), updated_at: now, updatedAt: serverTimestamp() }
    : { is_locked: false, locked_at: '', locked_by_uid: '', locked_by_name: '', updated_at: now, updatedAt: serverTimestamp() };
  await updateDoc(target, patch);
  return row({ ...current, ...patch }, snap.id);
}

export function subscribeFirebaseLessonAccess(
  lessonId: string,
  onChange: (lesson: LessonRow | null) => void,
  onError?: (message: string) => void,
) {
  const target = doc(lessons(), clean(lessonId));
  return onSnapshot(target, (snapshot) => {
    onChange(snapshot.exists() ? row(snapshot.data(), snapshot.id) : null);
  }, (error) => {
    onError?.(firebaseErrorMessage(error));
  });
}

export async function saveFirebaseLesson(payload: LessonComposerValues, updating = false) {
  const me = await identity();
  const lessonId = clean(payload.lesson_id) || id('LESSON');
  const target = doc(lessons(), lessonId);
  const lessonNumber = normalizeLessonNumber(payload.lesson_number);
  const lessonName = normalizeLessonName(payload.lesson_name);
  if (!lessonNumber) throw new Error('Bài số phải là số nguyên dương. Ví dụ nhập 1 để tạo Bài 1.');
  if (!lessonName) throw new Error('Tên bài không được để trống.');

  const normalizedPayload: LessonComposerValues = {
    ...payload,
    lesson_number: lessonNumber,
    lesson_name: lessonName,
    tieu_de: buildLessonTitle(lessonNumber, lessonName),
    nam_hoc: clean(payload.nam_hoc),
    hoc_ky: clean(payload.hoc_ky || 'HK1').toUpperCase(),
    mon_id: clean(payload.mon_id),
    khoi: clean(payload.khoi),
    lop_id: clean(payload.lop_id),
  };
  const registryKey = lessonRegistryKey(normalizedPayload);
  if (!registryKey) throw new Error('Không thể xác định khóa danh mục bài học. Hãy kiểm tra lại môn, khối, năm học và bài số.');
  const registryRef = doc(school(), 'lessonNumberRegistry', registryKey);
  const now = new Date().toISOString();
  const sourceFileName = clean(payload.source_file?.name);
  const sourceFileType = clean(payload.source_file?.mimeType);
  const sourceFileSize = Number(payload.source_file?.size || 0);
  const lessonJson = payload.lesson_json
    ? {
        ...payload.lesson_json,
        title: normalizedPayload.tieu_de,
        metadata: {
          ...payload.lesson_json.metadata,
          tieu_de: normalizedPayload.tieu_de,
          lesson_number: lessonNumber,
          lesson_name: lessonName,
          khoi: normalizedPayload.khoi,
        },
      }
    : payload.lesson_json;
  assertSafeDocument(lessonJson, 'Nội dung bài học');

  return runTransaction(firestoreDb, async (transaction) => {
    const existing = await transaction.get(target);
    if (updating && !existing.exists()) return null;

    const existingData = existing.exists() ? existing.data() as any : null;
    const oldRegistryKey = existingData ? (clean(existingData.lesson_key) || lessonRegistryKey(existingData)) : '';
    const oldRegistryRef = oldRegistryKey && oldRegistryKey !== registryKey
      ? doc(school(), 'lessonNumberRegistry', oldRegistryKey)
      : null;

    // Tất cả thao tác đọc của transaction phải hoàn tất trước khi ghi.
    const registrySnap = await transaction.get(registryRef);
    const oldRegistrySnap = oldRegistryRef ? await transaction.get(oldRegistryRef) : null;
    const registryData = registrySnap.exists() ? registrySnap.data() as any : {};

    assertLessonNumberAvailable(registryData, lessonId, clean(normalizedPayload.lop_id), normalizedPayload.tieu_de);

    const saveMode = normalizedPayload.save_mode || '';
    const existingStatus = existingData ? clean(existingData.trang_thai) : '';
    const saveState = resolveLessonSaveState({
      saveMode,
      requestedScope: normalizedPayload.pham_vi,
      shareNow: normalizedPayload.share_now,
      existingStatus,
      role: me.role,
      adminPermission: me.adminPermission,
    });
    const { lesson_json: _lessonJson, source_file: _sourceFile, ...metadataPayload } = normalizedPayload;
    const data = withoutUndefined({
      ...metadataPayload,
      lesson_id: lessonId,
      lesson_number: lessonNumber,
      lesson_name: lessonName,
      lesson_key: registryKey,
      schoolId: FIREBASE_SCHOOL_ID,
      schemaVersion: 2,
      storageProvider: 'firestore_spark_v2',
      nguoi_tao_id: existingData ? clean(existingData.nguoi_tao_id) : clean(me.userId),
      createdByUid: existingData ? clean(existingData.createdByUid) : me.uid,
      tieu_de: normalizedPayload.tieu_de,
      pham_vi: saveState.scope,
      trang_thai: saveState.status,
      is_locked: existingData ? existingData.is_locked === true : false,
      locked_at: existingData ? clean(existingData.locked_at) : '',
      locked_by_uid: existingData ? clean(existingData.locked_by_uid) : '',
      locked_by_name: existingData ? clean(existingData.locked_by_name) : '',
      source_file_id: '',
      source_file_url: '',
      json_file_id: '',
      source_file_name: sourceFileName,
      source_file_type: sourceFileType,
      source_file_size: sourceFileSize,
      source_file_retained: false,
      audienceKeys: audienceKeys(normalizedPayload.khoi, normalizedPayload.lop_id),
      contentPath: `lessons/${lessonId}/content/main`,
      created_at: existingData ? clean(existingData.created_at) : now,
      updated_at: now,
      updatedAt: serverTimestamp(),
    });
    assertSafeDocument(data, 'Thông tin bài học', 200 * 1024);

    // Nếu sửa bài làm thay đổi môn/khối/bài số/năm học/học kỳ, giải phóng registry cũ.
    if (oldRegistryRef && oldRegistrySnap?.exists()) {
      const cleanedOld = removeLessonFromRegistry(oldRegistrySnap.data(), lessonId);
      if (registryHasAnyLesson(cleanedOld)) {
        transaction.set(oldRegistryRef, { ...cleanedOld, updated_at: now, updatedAt: serverTimestamp() }, { merge: true });
      } else {
        transaction.delete(oldRegistryRef);
      }
    }

    const nextRegistry = removeLessonFromRegistry(registryData, lessonId);
    const classMap = registryClassMap(nextRegistry);
    if (clean(normalizedPayload.lop_id)) classMap[clean(normalizedPayload.lop_id)] = lessonId;
    const registryDocument = withoutUndefined({
      schoolId: FIREBASE_SCHOOL_ID,
      schemaVersion: 1,
      registryKey,
      lessonNumber,
      subjectId: clean(normalizedPayload.mon_id),
      grade: clean(normalizedPayload.khoi),
      academicYear: clean(normalizedPayload.nam_hoc),
      semester: clean(normalizedPayload.hoc_ky || 'HK1'),
      allLessonId: clean(normalizedPayload.lop_id) ? clean(nextRegistry.allLessonId) : lessonId,
      classLessonIds: clean(normalizedPayload.lop_id) ? classMap : {},
      updatedByUid: me.uid,
      updated_at: now,
      updatedAt: serverTimestamp(),
    });
    transaction.set(registryRef, registryDocument, { merge: false });

    if (existing.exists()) transaction.set(target, { ...data, lesson_json: deleteField() }, { merge: true });
    else transaction.set(target, data);
    transaction.set(lessonContentRef(lessonId), {
      lesson_json: withoutUndefined(lessonJson),
      schoolId: FIREBASE_SCHOOL_ID,
      lessonId,
      schemaVersion: 2,
      updated_at: now,
      updatedAt: serverTimestamp(),
    });

    return row(data, lessonId);
  });
}

export async function deleteFirebaseLesson(lessonId: string) {
  const target = doc(lessons(), clean(lessonId));
  return runTransaction(firestoreDb, async (transaction) => {
    const snap = await transaction.get(target);
    if (!snap.exists()) return false;
    const data = snap.data() as any;
    const registryKey = clean(data.lesson_key) || lessonRegistryKey(data);
    const registryRef = registryKey ? doc(school(), 'lessonNumberRegistry', registryKey) : null;
    const registrySnap = registryRef ? await transaction.get(registryRef) : null;
    if (registryRef && registrySnap?.exists()) {
      const cleaned = removeLessonFromRegistry(registrySnap.data(), clean(lessonId));
      if (registryHasAnyLesson(cleaned)) transaction.set(registryRef, { ...cleaned, updated_at: new Date().toISOString(), updatedAt: serverTimestamp() }, { merge: true });
      else transaction.delete(registryRef);
    }
    transaction.delete(lessonContentRef(clean(lessonId)));
    transaction.delete(target);
    return true;
  });
}

export async function submitFirebaseLessonReview(lessonId: string) {
  const target = doc(lessons(), lessonId);
  const snap = await getDoc(target);
  if (!snap.exists()) return null;
  const now = new Date().toISOString();
  await updateDoc(target, { trang_thai: 'pending_review', pham_vi: 'shared', updated_at: now, updatedAt: serverTimestamp() });
  return row({ ...snap.data(), trang_thai: 'pending_review', pham_vi: 'shared', updated_at: now }, lessonId);
}

export async function listFirebaseProgress(filters: Record<string, unknown> = {}) {
  const me = await identity();
  const base = collection(school(), 'learningProgress');
  const snap = me.role === 'admin' || me.adminPermission === true
    ? await getDocs(filters.user_id
        ? query(base, where('user_id', '==', clean(filters.user_id)), orderBy('updated_at', 'desc'), limit(250))
        : query(base, orderBy('updated_at', 'desc'), limit(500)))
    : me.role === 'teacher'
      ? await getDocs(filters.user_id
          ? query(base, where('user_id', '==', clean(filters.user_id)), orderBy('updated_at', 'desc'), limit(250))
          : query(base, where('khoi', '==', clean(me.grade)), orderBy('updated_at', 'desc'), limit(500)))
      : await getDocs(query(base, where('ownerUid', '==', me.uid), orderBy('updated_at', 'desc'), limit(80)));
  return snap.docs.map(item => ({ progress_id: item.id, ...item.data() } as unknown as LessonProgressRecord)).filter(item => {
    if (filters.user_id && clean(item.user_id) !== clean(filters.user_id)) return false;
    if (filters.lesson_id && clean(item.lesson_id) !== clean(filters.lesson_id)) return false;
    if (filters.lop_id && clean(item.lop_id) !== clean(filters.lop_id)) return false;
    return true;
  });
}

export async function saveFirebaseProgress(payload: LessonProgressRecord) {
  const me = await identity();
  const progressId = clean(payload.progress_id) || `${clean(payload.user_id || me.userId)}_${clean(payload.lesson_id)}`;
  const now = new Date().toISOString();
  const resultVersion = Math.max(Number(payload.result_version || 0) + 1, Date.now());
  const baseData = withoutUndefined({
    ...payload,
    progress_id: progressId,
    user_id: clean(payload.user_id || me.userId),
    ownerUid: me.uid,
    result_state: 'valid',
    retake_allowed: true,
    result_version: resultVersion,
    schoolId: FIREBASE_SCHOOL_ID,
    schemaVersion: 2,
    storageProvider: 'firebase',
    updated_at: now,
    updatedAt: serverTimestamp(),
  });

  const sessionId = clean(payload.co_learning_session_id);
  if (payload.study_mode === 'co_learning' && sessionId) {
    const sessionRef = doc(school(), 'coLearningSessions', sessionId);
    const sessionSnap = await getDoc(sessionRef);
    if (!sessionSnap.exists()) throw new Error('Phiên học cùng không còn tồn tại. Hãy mở lại bài học và xác nhận bạn học cùng.');
    const session = sessionSnap.data() as any;
    if (clean(session.lesson_id) !== clean(payload.lesson_id)) {
      throw new Error('Phiên học cùng không thuộc bài học đang mở.');
    }
    if (!['active', 'completed', 'cancelled_retake'].includes(clean(session.status) || 'active')) {
      throw new Error('Phiên học cùng đã bị khóa và không thể tiếp tục.');
    }
    const participants = getCoLearningParticipants(session);
    if (participants.length < 2) {
      throw new Error('Phiên học cùng chưa có đủ thông tin thành viên. Hãy đóng bài và tạo nhóm mới.');
    }
    if (!participants.some((item) => item.uid === clean(me.uid) && item.userId === clean(me.userId))) {
      throw new Error('Tài khoản hiện tại không thuộc nhóm học đã lưu.');
    }

    const participantIds = participants.map((item) => item.userId);
    const participantNames = participants.map((item) => item.name);
    const common = withoutUndefined({
      ...baseData,
      result_group_id: sessionId,
      co_learning_session_id: sessionId,
      co_learner_ids: participantIds.join(','),
      co_learner_user_ids: participantIds,
      co_learner_names: participantNames,
      study_mode: 'co_learning',
    });
    const batch = writeBatch(firestoreDb);
    let ownProgress: LessonProgressRecord | null = null;
    participants.forEach((participant) => {
      const participantProgressId = `${participant.userId}_${clean(payload.lesson_id)}`;
      const participantData = {
        ...common,
        progress_id: participantProgressId,
        user_id: participant.userId,
        ownerUid: participant.uid,
      } as unknown as LessonProgressRecord;
      batch.set(doc(school(), 'learningProgress', participantProgressId), participantData, { merge: true });
      if (participant.uid === clean(me.uid)) ownProgress = participantData;
    });
    batch.set(sessionRef, withoutUndefined({
      status: payload.status === 'completed' ? 'completed' : 'active',
      result_group_id: sessionId,
      result_version: resultVersion,
      assessment_score: payload.assessment_score,
      completion_percent: payload.completion_percent,
      last_active_by_uid: me.uid,
      last_active_at: now,
      updatedAt: serverTimestamp(),
    }), { merge: true });
    await batch.commit();
    return ownProgress || common as unknown as LessonProgressRecord;
  }

  const data = withoutUndefined({
    ...baseData,
    result_group_id: clean(payload.result_group_id) || `${clean(payload.user_id || me.userId)}_${clean(payload.lesson_id)}`,
  });
  await setDoc(doc(school(), 'learningProgress', progressId), data, { merge: true });
  return data as unknown as LessonProgressRecord;
}

function emptyProgressSteps() {
  const step = () => ({
    opened: false,
    viewedComplete: false,
    completed: false,
    percent: 0,
    quizAnswered: 0,
    quizCorrect: 0,
    quizTotal: 0,
    quizAnswers: {},
    sectionProgress: {},
    lastVisitedAt: '',
  });
  return {
    khoi_dong: step(),
    hinh_thanh_kien_thuc: step(),
    luyen_tap: step(),
    van_dung: step(),
    tong_ket: step(),
  };
}

function moderationSnapshot(data: any) {
  const finalExam = data?.step_details?.luyen_tap?.finalExam || {};
  return withoutUndefined({
    progress_id: clean(data?.progress_id),
    user_id: clean(data?.user_id),
    lesson_id: clean(data?.lesson_id),
    result_group_id: clean(data?.result_group_id || data?.co_learning_session_id),
    study_mode: clean(data?.study_mode),
    status: clean(data?.status),
    completion_percent: Number(data?.completion_percent || 0),
    quiz_percent: Number(data?.quiz_percent || 0),
    assessment_score: data?.assessment_score == null ? undefined : Number(data.assessment_score),
    final_exam_status: clean(finalExam?.status),
    security_events: finalExam?.security_events || {},
    submitted_at: clean(finalExam?.submitted_at),
    updated_at: clean(data?.updated_at),
  });
}

export async function moderateFirebaseLearningResult(
  payload: LearningResultModerationPayload,
): Promise<LearningResultModerationSummary> {
  const me = await identity();
  if (!(me.role === 'teacher' || me.role === 'admin' || me.adminPermission === true)) {
    throw new Error('Chỉ giáo viên hoặc quản trị viên được xử lý kết quả học tập.');
  }
  const progressId = clean(payload.progress_id);
  if (!progressId) throw new Error('Thiếu mã kết quả học tập cần xử lý.');
  if (!['allow_retake', 'invalidate_cheating'].includes(payload.action)) {
    throw new Error('Hình thức xử lý kết quả không hợp lệ.');
  }
  const reason = clean(payload.reason);
  if (payload.action === 'invalidate_cheating' && !reason) {
    throw new Error('Vui lòng nhập lý do xác nhận gian lận.');
  }

  const targetRef = doc(school(), 'learningProgress', progressId);
  const targetSnap = await getDoc(targetRef);
  if (!targetSnap.exists()) throw new Error('Không tìm thấy kết quả học tập cần xử lý.');
  const target = { progress_id: targetSnap.id, ...targetSnap.data() } as any;
  const resultGroupId = clean(target.result_group_id || target.co_learning_session_id);
  let sessionRef: DocumentReference<DocumentData> | null = null;
  let participantUserIds = [clean(target.user_id)].filter(Boolean);

  if (target.study_mode === 'co_learning' && resultGroupId) {
    sessionRef = doc(school(), 'coLearningSessions', resultGroupId);
    const sessionSnap = await getDoc(sessionRef);
    if (sessionSnap.exists()) {
      const session = sessionSnap.data() as any;
      participantUserIds = getCoLearningParticipants(session).map((item) => item.userId);
    }
  }

  const progressRefs = participantUserIds.map((userId) => doc(school(), 'learningProgress', `${userId}_${clean(target.lesson_id)}`));
  const progressSnaps = await Promise.all(progressRefs.map((ref) => getDoc(ref)));
  const affected = progressSnaps
    .filter((snap) => snap.exists())
    .map((snap) => ({ ref: snap.ref, data: { progress_id: snap.id, ...snap.data() } as any }));
  if (!affected.length) throw new Error('Không còn kết quả hợp lệ để xử lý.');

  const now = new Date().toISOString();
  const actionId = id('RESULT_ACTION');
  const state = payload.action === 'allow_retake' ? 'cancelled_retake' : 'invalid_cheating';
  const batch = writeBatch(firestoreDb);
  batch.set(doc(school(), 'learningResultActions', actionId), withoutUndefined({
    action_id: actionId,
    action: payload.action,
    result_state: state,
    result_group_id: resultGroupId,
    lesson_id: clean(target.lesson_id),
    lesson_title: clean(target.lesson_title),
    khoi: clean(target.khoi),
    lop_id: clean(target.lop_id),
    affected_user_ids: affected.map((item) => clean(item.data.user_id)),
    affected_progress_ids: affected.map((item) => clean(item.data.progress_id)),
    previous_results: affected.map((item) => moderationSnapshot(item.data)),
    reason,
    actorUid: me.uid,
    actor_user_id: clean(me.userId),
    actor_name: clean(me.displayName || me.username || me.userId),
    schoolId: FIREBASE_SCHOOL_ID,
    schemaVersion: 1,
    created_at: now,
    createdAt: serverTimestamp(),
  }));

  affected.forEach(({ ref, data }) => {
    const common = {
      result_state: state,
      retake_allowed: payload.action === 'allow_retake',
      invalidated_reason: reason,
      invalidated_at: now,
      invalidated_by_uid: me.uid,
      invalidated_by_name: clean(me.displayName || me.username || me.userId),
      last_result_action_id: actionId,
      result_version: Math.max(Number(data.result_version || 0) + 1, Date.now()),
      updated_at: now,
      updatedAt: serverTimestamp(),
    };
    if (payload.action === 'allow_retake') {
      batch.update(ref, {
        ...common,
        status: 'not_started',
        completion_percent: 0,
        completed_steps: 0,
        last_stage: 'khoi_dong',
        step_details: emptyProgressSteps(),
        quiz_total: 0,
        quiz_answered: 0,
        quiz_correct: 0,
        quiz_percent: 0,
        assessment_score: deleteField(),
        study_mode: 'single',
        co_learning_session_id: '',
        co_learner_ids: '',
        co_learner_user_ids: [],
        co_learner_names: [],
        result_group_id: '',
      });
    } else {
      batch.update(ref, common);
    }
  });
  if (sessionRef) {
    batch.set(sessionRef, {
      status: state,
      last_result_action_id: actionId,
      invalidated_at: now,
      invalidated_by_uid: me.uid,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }
  await batch.commit();
  return {
    action_id: actionId,
    action: payload.action,
    affected_user_ids: affected.map((item) => clean(item.data.user_id)),
    affected_count: affected.length,
    result_group_id: resultGroupId,
  };
}

export async function listFirebaseComments(lessonId: string) {
  await identity();
  const snap = await getDocs(query(collection(school(), 'lessonComments'), where('lesson_id', '==', clean(lessonId))));
  return snap.docs.map(item => ({ comment_id: item.id, ...item.data() } as unknown as LessonComment))
    .filter(item => clean(item.lesson_id) === clean(lessonId));
}

export async function saveFirebaseComment(payload: Partial<LessonComment>, updating = false) {
  const me = await identity();
  const commentId = clean(payload.comment_id) || id('COMMENT');
  const target = doc(school(), 'lessonComments', commentId);
  const snap = await getDoc(target);
  if (updating && !snap.exists()) return null;
  const now = new Date().toISOString();
  const data = withoutUndefined({ ...payload, comment_id: commentId, user_id: clean(payload.user_id || me.userId), ownerUid: snap.exists() ? clean((snap.data() as any).ownerUid) : me.uid,
    schoolId: FIREBASE_SCHOOL_ID, schemaVersion: 1, storageProvider: 'firebase', created_at: snap.exists() ? clean((snap.data() as any).created_at) : now,
    updated_at: now, updatedAt: serverTimestamp(), trang_thai: clean(payload.trang_thai) || 'visible' });
  await setDoc(target, data, { merge: updating });
  return data as unknown as LessonComment;
}

// Base catalogs -------------------------------------------------------------
type FirebaseBootstrapValue = { academicYears: any[]; classes: any[]; subjects: any[] };

async function readFirebaseCatalogDirect(): Promise<FirebaseBootstrapValue> {
  const [yearsSnap, classesSnap, subjectsSnap] = await Promise.all([
    getDocs(namedCollection('academicYears')),
    getDocs(namedCollection('classes')),
    getDocs(namedCollection('subjects')),
  ]);
  return {
    academicYears: yearsSnap.docs.map(item => ({ id: item.id, ...item.data() })),
    classes: classesSnap.docs.map(item => ({ id: item.id, ...item.data() })),
    subjects: subjectsSnap.docs.map(item => ({ id: item.id, ...item.data() })),
  };
}

async function writeFirebaseBootstrap(value: FirebaseBootstrapValue, me: any) {
  const data = {
    ...value,
    counts: {
      academicYears: value.academicYears.length,
      classes: value.classes.length,
      subjects: value.subjects.length,
    },
    schoolId: FIREBASE_SCHOOL_ID,
    schemaVersion: 2,
    updated_by: clean(me.userId),
    updated_at: new Date().toISOString(),
    updatedAt: serverTimestamp(),
  };
  assertSafeDocument(data, 'Dữ liệu khởi động', 500 * 1024);
  await setDoc(doc(school(), 'appConfig', 'bootstrap_v2'), data);
}

async function rebuildFirebaseBootstrap() {
  const me = await identity();
  const value = await readFirebaseCatalogDirect();
  await writeFirebaseBootstrap(value, me);
  bootstrapCache = { uid: me.uid, expiresAt: Date.now() + 5 * 60 * 1000, value };
  return value;
}

async function refreshFirebaseBootstrapBestEffort() {
  bootstrapCache = null;
  try {
    await rebuildFirebaseBootstrap();
  } catch {
    // bootstrap_v2 chỉ là bộ nhớ đệm tăng tốc. Không được biến lỗi ghi cache,
    // Rules cũ hoặc giới hạn kích thước document thành lỗi CRUD danh mục.
    bootstrapCache = null;
  }
}

async function getFirebaseBootstrap() {
  const me = await identity();
  if (bootstrapCache?.uid === me.uid && bootstrapCache.expiresAt > Date.now()) return bootstrapCache.value;
  if (bootstrapPromise?.uid === me.uid) return bootstrapPromise.value;
  const task = (async () => {
    // Từ V6.63, danh mục dùng appConfig/bootstrap_v2 để giảm lượt đọc. Tuy nhiên
    // nếu riêng document cache bị Rules cũ chặn thì không được làm mất quyền đọc
    // các collection academicYears/classes/subjects vốn vẫn hợp lệ.
    try {
      const snap = await getDoc(doc(school(), 'appConfig', 'bootstrap_v2'));
      if (snap.exists()) {
        const raw = snap.data() as any;
        const value = {
          academicYears: Array.isArray(raw.academicYears) ? raw.academicYears : [],
          classes: Array.isArray(raw.classes) ? raw.classes : [],
          subjects: Array.isArray(raw.subjects) ? raw.subjects : [],
        };
        bootstrapCache = { uid: me.uid, expiresAt: Date.now() + 5 * 60 * 1000, value };
        return value;
      }
    } catch {
      // Fallback xuống collection thật ở ngay dưới.
    }

    const value = await readFirebaseCatalogDirect();
    bootstrapCache = { uid: me.uid, expiresAt: Date.now() + 5 * 60 * 1000, value };

    // Quản trị viên tự khôi phục cache khi có thể, nhưng lỗi ghi cache không
    // được phép làm hỏng việc tải dữ liệu.
    if (me.role === 'admin' || me.adminPermission === true) {
      try { await writeFirebaseBootstrap(value, me); } catch { /* best-effort */ }
    }
    return value;
  })();
  bootstrapPromise = { uid: me.uid, value: task };
  try {
    return await task;
  } finally {
    if (bootstrapPromise?.value === task) bootstrapPromise = null;
  }
}

export async function listFirebaseCollection(name: string) {
  if (name === 'academicYears' || name === 'classes' || name === 'subjects') {
    const bootstrap = await getFirebaseBootstrap();
    return bootstrap[name];
  }
  await identity();
  const snap = await getDocs(namedCollection(name));
  return snap.docs.map(item => ({ id: item.id, ...item.data() }));
}

export async function saveFirebaseCatalog(name: 'academicYears' | 'classes' | 'subjects', documentId: string, payload: Record<string, unknown>, merge = false) {
  const me = await identity();
  const now = new Date().toISOString();
  const data = withoutUndefined({ ...payload, schoolId: FIREBASE_SCHOOL_ID, schemaVersion: 1,
    created_at: clean(payload.created_at) || (merge ? undefined : now), updated_at: now, updatedByUid: me.uid, updatedAt: serverTimestamp() });
  await setDoc(doc(school(), name, documentId), data, { merge });
  await refreshFirebaseBootstrapBestEffort();
  return { id: documentId, ...data };
}

export async function saveFirebaseCatalogBatch(
  name: 'academicYears' | 'classes' | 'subjects',
  rows: Array<{ documentId: string; payload: Record<string, unknown>; merge?: boolean }>,
) {
  const me = await identity();
  const now = new Date().toISOString();
  const saved: Array<Record<string, unknown>> = [];
  for (let offset = 0; offset < rows.length; offset += 400) {
    const batch = writeBatch(firestoreDb);
    rows.slice(offset, offset + 400).forEach(({ documentId, payload, merge }) => {
      const data = withoutUndefined({
        ...payload,
        schoolId: FIREBASE_SCHOOL_ID,
        schemaVersion: 1,
        created_at: clean(payload.created_at) || (merge ? undefined : now),
        updated_at: now,
        updatedByUid: me.uid,
        updatedAt: serverTimestamp(),
      });
      batch.set(doc(school(), name, documentId), data, { merge: Boolean(merge) });
      saved.push({ id: documentId, ...data });
    });
    await batch.commit();
  }
  await refreshFirebaseBootstrapBestEffort();
  return saved;
}

export async function deleteFirebaseCatalog(name: 'academicYears' | 'classes' | 'subjects', documentId: string) {
  await identity();
  await deleteDoc(doc(school(), name, documentId));
  await refreshFirebaseBootstrapBestEffort();
}

export async function deleteFirebaseCatalogBatch(name: 'academicYears' | 'classes' | 'subjects', documentIds: string[]) {
  await identity();
  const uniqueIds = Array.from(new Set(documentIds.map(clean).filter(Boolean)));
  for (let offset = 0; offset < uniqueIds.length; offset += 400) {
    const batch = writeBatch(firestoreDb);
    uniqueIds.slice(offset, offset + 400).forEach(documentId => batch.delete(doc(school(), name, documentId)));
    await batch.commit();
  }
  await refreshFirebaseBootstrapBestEffort();
  return uniqueIds;
}

export async function setFirebaseCurrentAcademicYear(documentId: string) {
  const me = await identity();
  const snap = await getDocs(namedCollection('academicYears'));
  const batch = writeBatch(firestoreDb);
  const now = new Date().toISOString();
  snap.docs.forEach(item => batch.update(item.ref, { la_hien_hanh: item.id === documentId, updated_at: now, updatedByUid: me.uid, updatedAt: serverTimestamp() }));
  await batch.commit();
  await refreshFirebaseBootstrapBestEffort();
  const selected = await getDoc(doc(school(), 'academicYears', documentId));
  return selected.exists() ? { id: selected.id, ...selected.data() } : null;
}

// Thành viên đã kích hoạt nằm trong `members`; hồ sơ học sinh chưa đăng nhập
// nằm trong `studentRoster`. Hai nguồn được hợp nhất để quản trị viên luôn thấy
// đầy đủ danh sách, không cần tạo hàng loạt Firebase Authentication.
export async function listFirebaseMembers() {
  const me = await identity();
  if (me.role === 'student') return [me];
  if (me.role === 'teacher' && me.adminPermission !== true) {
    const snap = await getDocs(query(namedCollection('members'), where('grade', '==', clean(me.grade))));
    return snap.docs.map(item => ({ uid: item.id, ...item.data() }));
  }
  const snap = await getDocs(namedCollection('members'));
  return snap.docs.map(item => ({ uid: item.id, ...item.data() }));
}

export async function listFirebaseAccountDirectory() {
  const me = await identity();
  if (me.role === 'student') return [me];

  const memberQuery = me.role === 'teacher' && me.adminPermission !== true
    ? query(namedCollection('members'), where('grade', '==', clean(me.grade)))
    : namedCollection('members');
  const rosterQuery = me.role === 'teacher' && me.adminPermission !== true
    ? query(namedCollection('studentRoster'), where('grade', '==', clean(me.grade)))
    : namedCollection('studentRoster');
  const [memberSnapshot, rosterSnapshot] = await Promise.all([
    getDocs(memberQuery),
    getDocs(rosterQuery),
  ]);

  const byStudentCode = new Map<string, Record<string, unknown>>();
  const accounts: Record<string, unknown>[] = [];
  rosterSnapshot.docs.forEach(item => {
    const data = item.data();
    const studentCode = clean(data.studentCode || item.id);
    const pending = {
      uid: '',
      authUid: '',
      userId: clean(data.userId) || `HS_${studentCode}`,
      username: studentCode,
      displayName: clean(data.displayName),
      email: clean(data.email) || firebaseInternalEmailForUsername(studentCode),
      role: 'student',
      status: clean(data.status) || 'active',
      adminPermission: false,
      schoolId: FIREBASE_SCHOOL_ID,
      classId: clean(data.classId),
      grade: clean(data.grade),
      studentCode,
      birthDate: clean(data.birthDate),
      gender: clean(data.gender),
      phone: clean(data.phone),
      note: clean(data.note),
      academicYear: clean(data.academicYear),
      source: clean(data.source) || 'vnedu_student_roster',
      created_at: clean(data.created_at),
      updated_at: clean(data.updated_at),
      provisioningStatus: 'pending',
    };
    byStudentCode.set(studentCode.toLowerCase(), pending);
  });

  memberSnapshot.docs.forEach(item => {
    const member = { uid: item.id, ...item.data(), provisioningStatus: 'ready' } as Record<string, unknown>;
    const studentCode = clean(member.studentCode || member.username).toLowerCase();
    if (studentCode && byStudentCode.has(studentCode)) {
      const roster = byStudentCode.get(studentCode) || {};
      accounts.push({ ...roster, ...member, provisioningStatus: 'ready' });
      byStudentCode.delete(studentCode);
    } else {
      accounts.push(member);
    }
  });

  accounts.push(...byStudentCode.values());
  return accounts;
}

export type FirebaseStudentAccountImportFailure = {
  source_row: number;
  ma_hoc_sinh?: string;
  ho_ten?: string;
  reason: string;
};

export type FirebaseStudentAccountImportResult = {
  requested_count: number;
  created_count: number;
  updated_count: number;
  failed_count: number;
  created: Array<{ user_id: string; ma_hoc_sinh: string; ho_ten: string; source_row: number }>;
  updated: Array<{ user_id: string; ma_hoc_sinh: string; ho_ten: string; source_row: number }>;
  failed: FirebaseStudentAccountImportFailure[];
  accounts: Account[];
  password_policy: 'student_code';
  storage: 'firebase_roster';
  retry_required: boolean;
};

type ResolvedStudentImport = {
  sourceRow: number;
  studentCode: string;
  displayName: string;
  account: Account;
  existingAccount: boolean;
  roster: Record<string, unknown>;
  member?: Record<string, unknown>;
};

function studentImportUserId(studentCode: string, existing?: Account) {
  return clean(existing?.user_id) || `HS_${studentCode}`;
}

/**
 * Lưu danh sách học sinh vào Firestore trước. Firebase Authentication chỉ được
 * tạo khi học sinh đăng nhập lần đầu, vì vậy một file lớn không còn chạm giới
 * hạn tạo tài khoản hàng loạt của gói Spark.
 */
export async function importFirebaseStudentAccountsBatch(
  rows: Record<string, unknown>[],
  knownAccounts: Account[] = [],
): Promise<FirebaseStudentAccountImportResult> {
  const me = await identity();
  if (me.role !== 'admin' && me.adminPermission !== true) {
    throw new Error('Chỉ quản trị viên được nhập tài khoản học sinh.');
  }
  if (!rows.length) throw new Error('Nhóm nhập không có dữ liệu học sinh.');
  if (rows.length > 20) throw new Error('Mỗi nhóm chỉ được nhập tối đa 20 học sinh.');

  const byStudentCode = new Map<string, Account>();
  const byUsername = new Map<string, Account>();
  knownAccounts.forEach(account => {
    const code = clean(account.ma_hoc_sinh).toLowerCase();
    const username = clean(account.ten_dang_nhap).toLowerCase();
    if (code) byStudentCode.set(code, account);
    if (username) byUsername.set(username, account);
  });

  const failures: FirebaseStudentAccountImportFailure[] = [];
  const resolved: ResolvedStudentImport[] = [];
  const seen = new Set<string>();
  const now = new Date().toISOString();

  const resolveOne = (source: Record<string, unknown>, index: number) => {
    const sourceRow = Number(source.source_row || source.__rowNumber || index + 1) || index + 1;
    const studentCode = clean(source.ma_hoc_sinh || source.ten_dang_nhap);
    const displayName = clean(source.ho_ten);
    try {
      if (!/^\d{6,}$/.test(studentCode)) throw new Error('Mã học sinh phải có ít nhất 6 chữ số.');
      if (!displayName) throw new Error('Họ tên học sinh không được để trống.');
      const key = studentCode.toLowerCase();
      if (seen.has(key)) throw new Error('Mã học sinh bị lặp trong nhóm nhập.');
      seen.add(key);

      const existing = byStudentCode.get(key) || byUsername.get(key);
      if (existing && existing.vai_tro !== 'student') {
        throw new Error('Tên đăng nhập đã thuộc tài khoản không phải học sinh.');
      }
      const classId = clean(source.lop_id || existing?.lop_id);
      const grade = clean(source.khoi || existing?.khoi);
      if (!classId || !grade) throw new Error('Học sinh chưa được ánh xạ đúng lớp và khối.');

      const existingUid = clean(existing?.firebase_uid);
      const email = clean(existing?.email) || firebaseInternalEmailForUsername(studentCode);
      const userId = studentImportUserId(studentCode, existing);
      const account: Account = {
        user_id: userId,
        firebase_uid: existingUid || undefined,
        email,
        ho_ten: displayName,
        ten_dang_nhap: studentCode,
        vai_tro: 'student',
        lop_id: classId,
        khoi: grade,
        ten_lop: clean(source.ten_lop || existing?.ten_lop),
        ten_lop_hien_thi: clean(source.ten_lop_hien_thi || existing?.ten_lop_hien_thi),
        trang_thai: clean(source.trang_thai || existing?.trang_thai || 'active'),
        created_at: clean(existing?.created_at) || now,
        updated_at: now,
        ghi_chu: clean(source.ghi_chu || existing?.ghi_chu || 'Nhập từ danh sách học sinh vnEdu'),
        ma_hoc_sinh: studentCode,
        ngay_sinh: clean(source.ngay_sinh || existing?.ngay_sinh),
        gioi_tinh: clean(source.gioi_tinh || existing?.gioi_tinh),
        tai_khoan_dinh_danh: clean(source.tai_khoan_dinh_danh || existing?.tai_khoan_dinh_danh),
        so_luot_dang_nhap: Number(existing?.so_luot_dang_nhap || source.so_luot_dang_nhap || 0),
        lan_dang_nhap_cuoi: clean(existing?.lan_dang_nhap_cuoi || source.lan_dang_nhap_cuoi),
        so_dien_thoai: clean(source.so_dien_thoai || existing?.so_dien_thoai),
        nguon_du_lieu: 'vnedu_student_roster',
        da_doi_mat_khau: existing?.da_doi_mat_khau ?? false,
        quyen_admin: false,
        nam_hoc: clean(source.nam_hoc || existing?.nam_hoc),
        provisioning_status: existingUid ? 'ready' : 'pending',
      };
      const roster = {
        ...withoutUndefined({
          userId,
          username: studentCode,
          displayName,
          email,
          role: 'student',
          status: account.trang_thai === 'inactive' ? 'inactive' : 'active',
          adminPermission: false,
          schoolId: FIREBASE_SCHOOL_ID,
          classId,
          grade,
          studentCode,
          birthDate: account.ngay_sinh,
          gender: account.gioi_tinh,
          phone: account.so_dien_thoai,
          note: account.ghi_chu,
          academicYear: account.nam_hoc,
          source: 'vnedu_student_roster',
          schemaVersion: 1,
          created_at: clean(existing?.created_at) || now,
          updated_at: now,
          updatedByUid: me.uid,
        }),
        updatedAt: serverTimestamp(),
      };
      resolved.push({
        sourceRow,
        studentCode,
        displayName,
        account,
        existingAccount: Boolean(existing),
        roster,
        member: existingUid ? {
          ...withoutUndefined({
          authUid: existingUid,
          userId,
          username: studentCode,
          displayName,
          email,
          role: 'student',
          status: account.trang_thai === 'inactive' ? 'inactive' : 'active',
          adminPermission: false,
          schoolId: FIREBASE_SCHOOL_ID,
          classId,
          grade,
          studentCode,
          birthDate: account.ngay_sinh,
          gender: account.gioi_tinh,
          phone: account.so_dien_thoai,
          note: account.ghi_chu,
          academicYear: account.nam_hoc,
          source: 'vnedu_student_roster',
          schemaVersion: 1,
          created_at: account.created_at,
          updated_at: now,
          updatedByUid: me.uid,
          }),
          updatedAt: serverTimestamp(),
        } : undefined,
      });
    } catch (error) {
      failures.push({
        source_row: sourceRow,
        ma_hoc_sinh: studentCode,
        ho_ten: displayName,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  };

  rows.forEach(resolveOne);

  if (resolved.length) {
    const batch = writeBatch(firestoreDb);
    resolved.forEach(item => {
      batch.set(doc(school(), 'studentRoster', item.studentCode), item.roster, { merge: true });
      if (item.member && item.account.firebase_uid) {
        batch.set(doc(school(), 'members', item.account.firebase_uid), item.member, { merge: true });
      }
    });
    try {
      await batch.commit();
    } catch (error) {
      const reason = firebaseErrorMessage(error) || 'Không ghi được hồ sơ Firestore.';
      resolved.forEach(item => failures.push({
        source_row: item.sourceRow,
        ma_hoc_sinh: item.studentCode,
        ho_ten: item.displayName,
        reason: `Không lưu được hồ sơ học sinh vào Firestore: ${reason}`,
      }));
      resolved.length = 0;
    }
  }

  const created = resolved.filter(item => !item.existingAccount).map(item => ({
    user_id: item.account.user_id,
    ma_hoc_sinh: item.studentCode,
    ho_ten: item.displayName,
    source_row: item.sourceRow,
  }));
  const updated = resolved.filter(item => item.existingAccount).map(item => ({
    user_id: item.account.user_id,
    ma_hoc_sinh: item.studentCode,
    ho_ten: item.displayName,
    source_row: item.sourceRow,
  }));
  return {
    requested_count: rows.length,
    created_count: created.length,
    updated_count: updated.length,
    failed_count: failures.length,
    created,
    updated,
    failed: failures,
    accounts: resolved.map(item => item.account),
    password_policy: 'student_code',
    storage: 'firebase_roster',
    retry_required: false,
  };
}

export async function listFirebaseClassmates() {
  const me = await identity();
  if (me.role !== 'student') return [];
  const classId = clean(me.classId);
  const grade = clean(me.grade);
  if (!classId) throw new Error('Tài khoản học sinh chưa được xếp lớp.');
  if (!grade) throw new Error('Tài khoản học sinh chưa có thông tin khối.');

  // V6.67.0: studentRoster là nguồn danh sách lớp đầy đủ. `members` được đọc
  // song song chỉ để bổ sung UID/trạng thái kích hoạt và bao phủ hồ sơ legacy.
  const [rosterSnap, memberSnap] = await Promise.all([
    getDocs(query(
      namedCollection('studentRoster'),
      where('role', '==', 'student'),
      where('classId', '==', classId),
      where('grade', '==', grade),
      where('status', '==', 'active'),
    )),
    getDocs(query(
      namedCollection('members'),
      where('role', '==', 'student'),
      where('classId', '==', classId),
      where('status', '==', 'active'),
    )),
  ]);

  const activatedByStudentCode = new Map<string, any>();
  const activatedByUserId = new Map<string, any>();
  memberSnap.docs.forEach(item => {
    const data = { uid: item.id, ...item.data() } as any;
    const studentCode = clean(data.studentCode || data.username).toLowerCase();
    const userId = clean(data.userId);
    if (studentCode) activatedByStudentCode.set(studentCode, data);
    if (userId) activatedByUserId.set(userId, data);
  });

  const directory = new Map<string, any>();
  rosterSnap.docs.forEach(item => {
    const roster = item.data() as any;
    const studentCode = clean(roster.studentCode || item.id);
    const userId = clean(roster.userId) || `HS_${studentCode}`;
    const member = activatedByStudentCode.get(studentCode.toLowerCase()) || activatedByUserId.get(userId);
    directory.set(userId || studentCode.toLowerCase(), {
      ...roster,
      ...(member || {}),
      uid: clean(member?.uid || member?.authUid || roster.authUid),
      userId,
      studentCode,
      classId: classId,
      grade: grade,
      role: 'student',
      status: 'active',
      provisioningStatus: member ? 'ready' : 'pending',
    });
  });

  // Hồ sơ legacy có member nhưng thiếu studentRoster vẫn được hiển thị để không
  // làm mất bạn cùng lớp trong giai đoạn chuyển đổi dữ liệu.
  memberSnap.docs.forEach(item => {
    const member = { uid: item.id, ...item.data() } as any;
    const studentCode = clean(member.studentCode || member.username);
    const userId = clean(member.userId) || `HS_${studentCode}`;
    const key = userId || studentCode.toLowerCase();
    if (!directory.has(key)) directory.set(key, { ...member, uid: item.id, userId, studentCode, provisioningStatus: 'ready' });
  });

  const myStudentCode = clean(me.studentCode || me.username).toLowerCase();
  const myUserId = clean(me.userId);
  return Array.from(directory.values())
    .filter(item => clean(item.studentCode).toLowerCase() !== myStudentCode && clean(item.userId) !== myUserId)
    .sort((left, right) => clean(left.displayName).localeCompare(clean(right.displayName), 'vi'));
}

export async function findFirebaseReusableCoLearningSession(lessonId: string): Promise<CoLearningSession | null> {
  const me = await identity();
  if (me.role !== 'student' || !clean(lessonId)) return null;
  const sessions = namedCollection('coLearningSessions');
  let snap;
  try {
    snap = await getDocs(query(
      sessions,
      where('participant_uids', 'array-contains', me.uid),
      where('lesson_id', '==', clean(lessonId)),
      limit(12),
    ));
  } catch {
    // Tương thích trong thời gian chỉ mục V6.67.0 đang được Firebase xây dựng.
    snap = await getDocs(query(
      sessions,
      where('participant_uids', 'array-contains', me.uid),
      limit(30),
    ));
  }

  const candidates = snap.docs
    .map((item) => ({ co_learning_session_id: item.id, session_id: item.id, ...item.data() } as unknown as CoLearningSession))
    .filter((item) => clean(item.lesson_id) === clean(lessonId))
    .filter((item) => ['active', 'completed', 'cancelled_retake'].includes(clean(item.status) || 'active'))
    .filter((item) => !clean((item as any).lop_id) || clean((item as any).lop_id) === clean(me.classId))
    .sort((a, b) => clean(b.last_active_at || b.started_at).localeCompare(clean(a.last_active_at || a.started_at)));
  return candidates[0] || null;
}

export type FirebaseAccountDeletionTarget = {
  userId: string;
  uid: string;
  displayName: string;
  username: string;
  studentCode: string;
  rosterId: string;
  provisioningStatus: 'ready' | 'pending';
};

type CleanupOperation = {
  kind: 'delete' | 'update';
  ref: DocumentReference<DocumentData>;
  data?: Record<string, unknown>;
  label: string;
  required?: boolean;
};

export type FirebaseAccountCleanupFailure = {
  label: string;
  path: string;
  reason: string;
};

type CleanupCollectionRead = {
  docs: QueryDocumentSnapshot<DocumentData>[];
  warnings: FirebaseAccountCleanupFailure[];
};

async function readOptionalCleanupCollection(
  label: string,
  source: CollectionReference<DocumentData>,
): Promise<CleanupCollectionRead> {
  try {
    const snapshot = await getDocs(source);
    return { docs: snapshot.docs, warnings: [] };
  } catch (error) {
    return {
      docs: [],
      warnings: [{
        label: `Đọc ${label}`,
        path: source.path,
        reason: firebaseErrorMessage(error),
      }],
    };
  }
}

// Mỗi write trong batch đều phải đọc hồ sơ quản trị để Rules xác nhận isAdmin.
// Firestore giới hạn số document-access calls của một atomic batch; 400 writes
// vì thế có thể bị trả permission-denied dù Rules đúng. Dùng 8 để luôn nằm dưới
// ngưỡng và tự tách đôi nếu một nhóm vẫn thất bại vì dữ liệu cũ khác schema.
const ACCOUNT_DELETE_RULE_SAFE_BATCH_SIZE = 8;

async function commitCleanupOperations(operations: CleanupOperation[]) {
  const failures: FirebaseAccountCleanupFailure[] = [];

  const commitSafely = async (items: CleanupOperation[]): Promise<void> => {
    if (!items.length) return;
    const batch = writeBatch(firestoreDb);
    items.forEach(operation => {
      if (operation.kind === 'delete') batch.delete(operation.ref);
      else batch.update(operation.ref, operation.data || {});
    });
    try {
      await batch.commit();
    } catch (error) {
      if (items.length > 1) {
        const midpoint = Math.ceil(items.length / 2);
        await commitSafely(items.slice(0, midpoint));
        await commitSafely(items.slice(midpoint));
        return;
      }
      const operation = items[0];
      const reason = firebaseErrorMessage(error);
      if (operation.required) {
        throw new Error(`Không thể xóa ${operation.label}: ${reason}`);
      }
      failures.push({ label: operation.label, path: operation.ref.path, reason });
    }
  };

  for (let offset = 0; offset < operations.length; offset += ACCOUNT_DELETE_RULE_SAFE_BATCH_SIZE) {
    await commitSafely(operations.slice(offset, offset + ACCOUNT_DELETE_RULE_SAFE_BATCH_SIZE));
  }
  return failures;
}

export async function prepareFirebaseAccountDeletion(userIds: string[], skipCurrentUser = false): Promise<FirebaseAccountDeletionTarget[]> {
  const me = await identity();
  if (me.role !== 'admin' && me.adminPermission !== true) throw new Error('Bạn không có quyền xóa tài khoản.');
  const targets = new Set(userIds.map(clean).filter(Boolean));
  if (!targets.size) throw new Error('Chưa chọn tài khoản cần xóa.');
  if (targets.has(clean(me.userId))) {
    if (!skipCurrentUser) throw new Error('Không thể xóa tài khoản đang đăng nhập.');
    targets.delete(clean(me.userId));
  }

  const [membersSnap, rosterSnap] = await Promise.all([
    getDocs(namedCollection('members')),
    getDocs(namedCollection('studentRoster')),
  ]);
  const membersByUserId = new Map<string, (typeof membersSnap.docs)[number]>();
  const membersByStudentCode = new Map<string, (typeof membersSnap.docs)[number]>();
  membersSnap.docs.forEach(item => {
    const data = item.data();
    const userId = clean(data.userId);
    const studentCode = clean(data.studentCode || data.username).toLowerCase();
    if (userId) membersByUserId.set(userId, item);
    if (studentCode) membersByStudentCode.set(studentCode, item);
  });

  const rosterByUserId = new Map<string, (typeof rosterSnap.docs)[number]>();
  const rosterByStudentCode = new Map<string, (typeof rosterSnap.docs)[number]>();
  rosterSnap.docs.forEach(item => {
    const data = item.data();
    const userId = clean(data.userId) || `HS_${clean(data.studentCode || item.id)}`;
    const studentCode = clean(data.studentCode || item.id).toLowerCase();
    if (userId) rosterByUserId.set(userId, item);
    if (studentCode) rosterByStudentCode.set(studentCode, item);
  });

  return Array.from(targets).map(requestedUserId => {
    let member = membersByUserId.get(requestedUserId);
    let roster = rosterByUserId.get(requestedUserId);
    const requestedCode = requestedUserId.replace(/^HS_/i, '').toLowerCase();
    if (!member) member = membersByStudentCode.get(requestedCode);
    if (!roster) roster = rosterByStudentCode.get(requestedCode);

    const memberData = member?.data() || {};
    const memberCode = clean(memberData.studentCode || memberData.username).toLowerCase();
    if (!roster && memberCode) roster = rosterByStudentCode.get(memberCode);
    const rosterData = roster?.data() || {};
    const rosterCode = clean(rosterData.studentCode || roster?.id).toLowerCase();
    if (!member && rosterCode) member = membersByStudentCode.get(rosterCode);
    if (!member && !roster) return null;

    const resolvedMemberData = member?.data() || memberData;
    const resolvedRosterData = roster?.data() || rosterData;
    const studentCode = clean(
      resolvedMemberData.studentCode
      || resolvedRosterData.studentCode
      || resolvedMemberData.username
      || resolvedRosterData.username
      || roster?.id,
    );
    return {
      userId: requestedUserId,
      uid: member?.id || '',
      displayName: clean(resolvedMemberData.displayName || resolvedRosterData.displayName),
      username: clean(resolvedMemberData.username || resolvedRosterData.username || studentCode),
      studentCode,
      rosterId: roster?.id || '',
      provisioningStatus: member ? 'ready' : 'pending',
    } satisfies FirebaseAccountDeletionTarget;
  }).filter((item): item is FirebaseAccountDeletionTarget => Boolean(item));
}

export async function cascadeDeleteFirebaseAccountData(
  userIds: string[],
  preparedTargets: FirebaseAccountDeletionTarget[] = [],
) {
  const me = await identity();
  if (me.role !== 'admin' && me.adminPermission !== true) throw new Error('Bạn không có quyền dọn dữ liệu tài khoản.');

  const targetUserIds = new Set(userIds.map(clean).filter(Boolean));
  preparedTargets.forEach(item => targetUserIds.add(clean(item.userId)));
  if (!targetUserIds.size) return { deleted: {}, transferred: {}, totalWrites: 0, cleanupWarnings: [] };
  if (targetUserIds.has(clean(me.userId))) throw new Error('Không thể xóa dữ liệu của tài khoản đang đăng nhập.');

  const targetUids = new Set(preparedTargets.map(item => clean(item.uid)).filter(Boolean));
  const targetRosterIds = new Set(preparedTargets.map(item => clean(item.rosterId)).filter(Boolean));
  const deleted = { members: 0, studentRoster: 0, userAIConfigs: 0, learningProgress: 0, lessonComments: 0, reviewAttempts: 0, coLearningSessions: 0 };
  const transferred = { lessons: 0, reviewPractices: 0, slidesPrompts: 0 };
  const requiredOperations: CleanupOperation[] = [];

  // Các tham chiếu bắt buộc đã được prepareFirebaseAccountDeletion xác minh.
  // Xóa hồ sơ chính trước khi đọc bất kỳ collection phụ nào.
  targetRosterIds.forEach(rosterId => {
    requiredOperations.push({
      kind: 'delete',
      ref: doc(school(), 'studentRoster', rosterId),
      label: `hồ sơ danh sách học sinh ${rosterId}`,
      required: true,
    });
    deleted.studentRoster += 1;
  });

  targetUids.forEach(uid => {
    requiredOperations.push({
      kind: 'delete',
      ref: doc(school(), 'members', uid),
      label: `hồ sơ thành viên ${uid}`,
      required: true,
    });
    deleted.members += 1;
  });

  await commitCleanupOperations(requiredOperations);

  // Mỗi collection phụ được đọc độc lập. Một Rules cũ hoặc collection chưa có
  // quyền đọc chỉ tạo cảnh báo, không được phép chặn việc xóa hồ sơ tài khoản.
  const [lessonRead, progressRead, commentRead, reviewRead, attemptRead, coLearningRead, promptRead] = await Promise.all([
    readOptionalCleanupCollection('bài học', lessons()),
    readOptionalCleanupCollection('tiến trình học tập', namedCollection('learningProgress')),
    readOptionalCleanupCollection('bình luận bài học', namedCollection('lessonComments')),
    readOptionalCleanupCollection('bài ôn tập', namedCollection('reviewPractices')),
    readOptionalCleanupCollection('kết quả ôn tập', namedCollection('reviewAttempts')),
    readOptionalCleanupCollection('phiên học cùng', namedCollection('coLearningSessions')),
    readOptionalCleanupCollection('prompt trình chiếu', namedCollection('slidesPrompts')),
  ]);
  const readWarnings = [lessonRead, progressRead, commentRead, reviewRead, attemptRead, coLearningRead, promptRead]
    .flatMap(item => item.warnings);

  const isTargetIdentity = (data: DocumentData, userIdFields: string[] = [], uidFields: string[] = []) =>
    userIdFields.some(field => targetUserIds.has(clean(data[field])))
    || uidFields.some(field => targetUids.has(clean(data[field])));
  const operations: CleanupOperation[] = [];
  const now = new Date().toISOString();
  const replacementUserId = clean(me.userId);
  const replacementName = clean(me.displayName || me.ho_ten) || 'Quản trị viên';

  lessonRead.docs.forEach(item => {
    if (!isTargetIdentity(item.data(), ['nguoi_tao_id'], ['createdByUid'])) return;
    operations.push({ kind: 'update', ref: item.ref, label: 'quyền sở hữu bài học', data: {
      nguoi_tao_id: replacementUserId,
      createdByUid: me.uid,
      ownershipTransferredAt: now,
      updated_at: now,
      updatedAt: serverTimestamp(),
    } });
    transferred.lessons += 1;
  });

  reviewRead.docs.forEach(item => {
    if (!isTargetIdentity(item.data(), ['nguoi_tao_id'], ['ownerUid'])) return;
    operations.push({ kind: 'update', ref: item.ref, label: 'quyền sở hữu bài ôn tập', data: {
      nguoi_tao_id: replacementUserId,
      ownerUid: me.uid,
      ownershipTransferredAt: now,
      updated_at: now,
      updatedAt: serverTimestamp(),
    } });
    transferred.reviewPractices += 1;
  });

  promptRead.docs.forEach(item => {
    if (!isTargetIdentity(item.data(), ['nguoi_tao_id'], ['ownerUid'])) return;
    operations.push({ kind: 'update', ref: item.ref, label: 'quyền sở hữu prompt trình chiếu', data: {
      nguoi_tao_id: replacementUserId,
      ho_ten_nguoi_tao: replacementName,
      ownerUid: me.uid,
      ownershipTransferredAt: now,
      updated_at: now,
      updatedAt: serverTimestamp(),
    } });
    transferred.slidesPrompts += 1;
  });

  progressRead.docs.forEach(item => {
    if (!isTargetIdentity(item.data(), ['user_id'], ['ownerUid'])) return;
    operations.push({ kind: 'delete', ref: item.ref, label: 'tiến trình học tập' });
    deleted.learningProgress += 1;
  });

  attemptRead.docs.forEach(item => {
    if (!isTargetIdentity(item.data(), ['user_id'], ['ownerUid'])) return;
    operations.push({ kind: 'delete', ref: item.ref, label: 'kết quả ôn tập' });
    deleted.reviewAttempts += 1;
  });

  coLearningRead.docs.forEach(item => {
    if (!isTargetIdentity(item.data(), ['host_user_id', 'partner_user_id'], ['ownerUid'])) return;
    operations.push({ kind: 'delete', ref: item.ref, label: 'phiên học cùng' });
    deleted.coLearningSessions += 1;
  });

  const commentIdsToDelete = new Set<string>();
  commentRead.docs.forEach(item => {
    if (isTargetIdentity(item.data(), ['user_id', 'replied_by'], ['ownerUid'])) commentIdsToDelete.add(item.id);
  });
  let commentsExpanded = true;
  while (commentsExpanded) {
    commentsExpanded = false;
    commentRead.docs.forEach(item => {
      const parentId = clean(item.data().parent_id);
      if (parentId && commentIdsToDelete.has(parentId) && !commentIdsToDelete.has(item.id)) {
        commentIdsToDelete.add(item.id);
        commentsExpanded = true;
      }
    });
  }
  commentRead.docs.forEach(item => {
    if (!commentIdsToDelete.has(item.id)) return;
    operations.push({ kind: 'delete', ref: item.ref, label: 'bình luận bài học' });
    deleted.lessonComments += 1;
  });

  // Admin không được đọc API key của người khác nhưng được phép xóa tài liệu
  // riêng tư theo UID khi xóa hẳn tài khoản.
  targetUids.forEach(uid => {
    operations.push({ kind: 'delete', ref: doc(school(), 'userAIConfigs', uid), label: 'cấu hình AI cá nhân' });
    deleted.userAIConfigs += 1;
  });

  const writeWarnings = await commitCleanupOperations(operations);
  const cleanupWarnings = [...readWarnings, ...writeWarnings];
  return { deleted, transferred, totalWrites: requiredOperations.length + operations.length, cleanupWarnings };
}

export async function moveFirebaseStudents(sourceClassId: string, targetClassId: string, userIds: string[] = [], deleteSource = false) {
  const me = await identity();
  if (me.role !== 'admin' && me.adminPermission !== true) throw new Error('Bạn không có quyền chuyển lớp.');
  const targetSnap = await getDoc(doc(school(), 'classes', targetClassId));
  if (!targetSnap.exists()) throw new Error('Không tìm thấy lớp đích trên Firebase.');
  const target = targetSnap.data() as any;
  const membersSnap = await getDocs(namedCollection('members'));
  const selected = new Set(userIds.map(clean).filter(Boolean));
  const moving = membersSnap.docs.filter(item => {
    const data = item.data() as any;
    return clean(data.role) === 'student' && clean(data.classId) === sourceClassId && (!selected.size || selected.has(clean(data.userId)));
  });
  const movingUserIds = new Set(moving.map(item => clean((item.data() as any).userId)));
  const sourceStudents = membersSnap.docs.filter(item => {
    const data = item.data() as any;
    return clean(data.role) === 'student' && clean(data.classId) === sourceClassId;
  });

  // V6.67.0: learningProgress và coLearningSessions là snapshot lịch sử.
  // Không ghi đè lop_id/khoi/nam_hoc khi chuyển lớp hoặc kết chuyển năm học.
  // Nếu còn dữ liệu lịch sử/bài học/học sinh ở lớp nguồn thì giữ lại danh mục lớp
  // để báo cáo các năm trước vẫn tra được đúng tên lớp.
  let sourcePreservedForHistory = false;
  let historicalProgressCount = 0;
  let historicalCoLearningCount = 0;
  let sourceLessonCount = 0;
  if (deleteSource) {
    const [historyProgressSnap, historyCoLearningSnap, sourceLessonSnap] = await Promise.all([
      getDocs(query(namedCollection('learningProgress'), where('lop_id', '==', sourceClassId), limit(1))),
      getDocs(query(namedCollection('coLearningSessions'), where('lop_id', '==', sourceClassId), limit(1))),
      getDocs(query(lessons(), where('lop_id', '==', sourceClassId), limit(1))),
    ]);
    historicalProgressCount = historyProgressSnap.size;
    historicalCoLearningCount = historyCoLearningSnap.size;
    sourceLessonCount = sourceLessonSnap.size;
    const remainingStudents = Math.max(0, sourceStudents.length - moving.length);
    sourcePreservedForHistory = historicalProgressCount > 0 || historicalCoLearningCount > 0 || sourceLessonCount > 0 || remainingStudents > 0;
  }

  const batch = writeBatch(firestoreDb);
  const now = new Date().toISOString();
  moving.forEach(item => batch.update(item.ref, { classId: targetClassId, grade: clean(target.khoi), academicYear: clean(target.nam_hoc), updated_at: now, updatedAt: serverTimestamp() }));
  const movedProgress = 0;
  const movedSessions = 0;
  const deletedSource = deleteSource && !sourcePreservedForHistory;
  if (deletedSource) batch.delete(doc(school(), 'classes', sourceClassId));
  await batch.commit();
  if (deletedSource) {
    await refreshFirebaseBootstrapBestEffort();
  }
  return {
    movedUserIds: Array.from(movingUserIds),
    movedAccounts: moving.length,
    movedProgress,
    movedSessions,
    targetGrade: clean(target.khoi),
    targetYear: clean(target.nam_hoc),
    deletedSource,
    sourcePreservedForHistory,
    historicalProgressCount,
    historicalCoLearningCount,
    sourceLessonCount,
  };
}

export async function transferFirebaseAcademicYear(payload: any) {
  const me = await identity();
  if (me.role !== 'admin' && me.adminPermission !== true) throw new Error('Bạn không có quyền kết chuyển năm học.');
  const grades = (Array.isArray(payload.grade_scope) ? payload.grade_scope : ['6', '7', '8', '9']).map(clean);
  const selectedClasses = new Set((payload.class_ids || []).map(clean));
  const classesSnap = await getDocs(namedCollection('classes'));
  const sourceClasses = classesSnap.docs.filter(item => {
    const data = item.data() as any;
    return grades.includes(clean(data.khoi)) && (!selectedClasses.size || selectedClasses.has(item.id)) && (!clean(data.nam_hoc) || clean(data.nam_hoc) === clean(payload.source_nam_hoc));
  });
  const now = new Date().toISOString();
  let created = 0; let updated = 0; let movedStudents = 0; let graduated = 0; let skippedClasses = 0; let skippedStudents = 0;
  const logs: string[] = [];
  const classMap = new Map<string, string>();
  for (const item of sourceClasses) {
    const data = item.data() as any;
    const grade = Number(clean(data.khoi));
    if (!grade || grade >= 9) { skippedClasses += 1; continue; }
    const nextGrade = String(grade + 1);
    const targetId = item.id.replace(new RegExp(`^L${grade}_`, 'i'), `L${nextGrade}_`);
    classMap.set(item.id, targetId);
    const targetRef = doc(school(), 'classes', targetId);
    const targetSnap = await getDoc(targetRef);
    if (payload.include_classes !== false) {
      const targetName = clean(data.ten_lop).replace(new RegExp(`^${grade}/`), `${nextGrade}/`);
      await setDoc(targetRef, { ...data, lop_id: targetId, ten_lop: targetName || targetId, khoi: nextGrade, nam_hoc: clean(payload.target_nam_hoc),
        trang_thai: 'active', schoolId: FIREBASE_SCHOOL_ID, schemaVersion: 1, updated_at: now, updatedAt: serverTimestamp() }, { merge: true });
      if (targetSnap.exists()) updated += 1; else created += 1;
    }
    if (payload.archive_source_classes === true) await updateDoc(item.ref, { trang_thai: 'inactive', updated_at: now, updatedAt: serverTimestamp() });
  }
  if (payload.include_students !== false) {
    for (const [sourceId, targetId] of classMap.entries()) {
      const moved = await moveFirebaseStudents(sourceId, targetId, [], false);
      movedStudents += moved.movedAccounts;
    }
    if (payload.graduate_final_grade !== false && grades.includes('9')) {
      const membersSnap = await getDocs(namedCollection('members'));
      const batch = writeBatch(firestoreDb);
      membersSnap.docs.forEach(item => {
        const data = item.data() as any;
        if (clean(data.role) === 'student' && clean(data.grade) === '9' && (!selectedClasses.size || selectedClasses.has(clean(data.classId)))) {
          batch.update(item.ref, { status: 'inactive', academicYear: clean(payload.target_nam_hoc), updated_at: now, updatedAt: serverTimestamp() }); graduated += 1;
        }
      });
      if (graduated) await batch.commit();
    }
  }
  if (payload.set_target_current !== false) {
    const years = await getDocs(namedCollection('academicYears'));
    const batch = writeBatch(firestoreDb);
    years.docs.forEach(item => batch.update(item.ref, { la_hien_hanh: clean(item.data().ten_nam_hoc) === clean(payload.target_nam_hoc), updated_at: now, updatedAt: serverTimestamp() }));
    await batch.commit();
  }
  logs.push(`Đã tạo ${created}, cập nhật ${updated} lớp; chuyển ${movedStudents} học sinh; khóa ${graduated} học sinh cuối cấp.`);
  await refreshFirebaseBootstrapBestEffort();
  return { classesCreated: created, classesUpdated: updated, studentsMoved: movedStudents, studentsGraduated: graduated, skippedStudents, skippedClasses, logs };
}

// Lesson moderation ---------------------------------------------------------
export async function listFirebasePendingLessons() {
  const me = await identity();
  if (me.role !== 'admin' && me.adminPermission !== true) return [];
  const snap = await getDocs(query(lessons(), where('trang_thai', '==', 'pending_review')));
  return snap.docs.map(item => ({ lesson: row(item.data(), item.id), share: {
    share_id: `SHARE_${item.id}`, lesson_id: item.id, nguoi_gui_id: clean(item.data().nguoi_tao_id),
    ngay_gui: clean(item.data().updated_at), trang_thai_duyet: 'pending', admin_duyet_id: '', ngay_duyet: '', ghi_chu_admin: '',
  }}));
}

export async function reviewFirebaseLesson(lessonId: string, approve: boolean, note = '') {
  const me = await identity();
  const target = doc(lessons(), lessonId);
  const snap = await getDoc(target);
  if (!snap.exists()) return null;
  const now = new Date().toISOString();
  const status = approve ? 'approved_shared' : 'rejected';
  await updateDoc(target, { trang_thai: status, pham_vi: approve ? 'shared' : 'private', review_note: clean(note),
    reviewedByUid: me.uid, reviewed_at: now, updated_at: now, updatedAt: serverTimestamp() });
  const lesson = row({ ...snap.data(), trang_thai: status, pham_vi: approve ? 'shared' : 'private', updated_at: now }, lessonId);
  return { lesson, share: { share_id: `SHARE_${lessonId}`, lesson_id: lessonId, nguoi_gui_id: lesson.nguoi_tao_id,
    ngay_gui: clean((snap.data() as any).updated_at), trang_thai_duyet: approve ? 'approved' : 'rejected',
    admin_duyet_id: clean(me.userId), ngay_duyet: now, ghi_chu_admin: clean(note) } };
}

// Review practice and attempts ---------------------------------------------
export async function listFirebaseReviews(filters: Record<string, unknown> = {}) {
  const me = await identity();
  const base = namedCollection('reviewPractices');
  const snapshots = me.role === 'admin' || me.role === 'teacher' || me.adminPermission === true
    ? [await getDocs(query(base, orderBy('updated_at', 'desc'), limit(200)))]
    : [await getDocs(query(
        base,
        where('pham_vi', '==', 'shared'),
        where('trang_thai', '==', 'active'),
        limit(250),
      ))];
  if (me.role === 'admin' || me.adminPermission === true) {
    const legacy = snapshots.flatMap(snapshot => snapshot.docs).filter(item =>
      item.data().questions !== undefined || item.data().questions_json !== undefined || item.data().config !== undefined,
    );
    for (let offset = 0; offset < legacy.length; offset += 180) {
      const batch = writeBatch(firestoreDb);
      legacy.slice(offset, offset + 180).forEach(item => {
        const current = item.data() as any;
        batch.set(reviewContentRef(item.id), withoutUndefined({
          questions: current.questions ?? current.questions_json ?? [],
          config: current.config ?? current.cau_hinh,
          schoolId: FIREBASE_SCHOOL_ID,
          reviewId: item.id,
          schemaVersion: 2,
          updated_at: clean(current.updated_at) || new Date().toISOString(),
          updatedAt: serverTimestamp(),
        }), { merge: true });
        batch.update(item.ref, {
          questions: deleteField(),
          questions_json: deleteField(),
          config: deleteField(),
          cau_hinh: deleteField(),
          audienceKeys: Array.isArray(current.audienceKeys) && current.audienceKeys.length
            ? current.audienceKeys
            : audienceKeys(current.khoi, current.lop_id),
          contentPath: `reviewPractices/${item.id}/content/main`,
          schemaVersion: 2,
          updatedAt: serverTimestamp(),
        });
      });
      await batch.commit();
    }
    if (legacy.length) {
      await setDoc(doc(school(), 'migrations', 'storage_v2'), {
        schoolId: FIREBASE_SCHOOL_ID,
        schemaVersion: 1,
        status: 'completed',
        lastReviewLegacyCount: legacy.length,
        reviewsCompletedAt: new Date().toISOString(),
        updatedAt: serverTimestamp(),
      }, { merge: true });
    }
  }
  return snapshots.flatMap(snap => snap.docs.map(item => ({ review_id: item.id, ...item.data() } as any))).filter(item => {
    if (filters.review_id && item.review_id !== clean(filters.review_id)) return false;
    if (filters.lop_id && clean(item.lop_id) !== clean(filters.lop_id)) return false;
    if (filters.mon_id && clean(item.mon_id) !== clean(filters.mon_id)) return false;
    if (me.role === 'student' && !matchesMemberAudience(item, me)) return false;
    return true;
  }).sort((left, right) => clean(right.updated_at).localeCompare(clean(left.updated_at)));
}

export async function saveFirebaseReview(payload: Record<string, unknown>) {
  const me = await identity();
  const reviewId = clean(payload.review_id) || id('REVIEW');
  const now = new Date().toISOString();
  const { questions, questions_json: questionsJson, config, cau_hinh: configLegacy, ...metadataPayload } = payload;
  const data = withoutUndefined({ ...metadataPayload, review_id: reviewId, ownerUid: me.uid, nguoi_tao_id: clean(payload.nguoi_tao_id || me.userId),
    schoolId: FIREBASE_SCHOOL_ID, schemaVersion: 2, storageProvider: 'firestore_spark_v2', created_at: clean(payload.created_at) || now,
    updated_at: now, updatedAt: serverTimestamp(), trang_thai: clean(payload.trang_thai) || 'active',
    audienceKeys: audienceKeys(payload.khoi, payload.lop_id), contentPath: `reviewPractices/${reviewId}/content/main` });
  const content = withoutUndefined({ questions: questions ?? questionsJson ?? [], config: config ?? configLegacy });
  assertSafeDocument(data, 'Thông tin bài ôn tập', 200 * 1024);
  assertSafeDocument(content, 'Nội dung bài ôn tập');
  const batch = writeBatch(firestoreDb);
  batch.set(
    doc(school(), 'reviewPractices', reviewId),
    payload.review_id ? { ...data, questions: deleteField(), questions_json: deleteField(), config: deleteField(), cau_hinh: deleteField() } : data,
    { merge: Boolean(payload.review_id) },
  );
  batch.set(reviewContentRef(reviewId), { ...content, schoolId: FIREBASE_SCHOOL_ID, reviewId, schemaVersion: 2, updated_at: now, updatedAt: serverTimestamp() });
  await batch.commit();
  return data;
}

export async function getFirebaseReview(reviewId: string) {
  await identity();
  const [snap, contentSnap] = await Promise.all([
    getDoc(doc(school(), 'reviewPractices', reviewId)),
    getDoc(reviewContentRef(reviewId)),
  ]);
  if (!snap.exists()) return null;
  return { review_id: snap.id, ...snap.data(), ...(contentSnap.exists() ? contentSnap.data() : {}) } as any;
}

export async function deleteFirebaseReview(reviewId: string) {
  await identity();
  const attempts = await getDocs(query(namedCollection('reviewAttempts'), where('review_id', '==', reviewId)));
  const batch = writeBatch(firestoreDb);
  attempts.docs.forEach(item => batch.delete(item.ref));
  batch.delete(reviewContentRef(reviewId));
  batch.delete(doc(school(), 'reviewPractices', reviewId));
  await batch.commit();
}

export async function submitFirebaseReviewAttempt(payload: Record<string, unknown>) {
  const me = await identity();
  const attemptId = clean(payload.attempt_id) || id('ATTEMPT');
  const now = new Date().toISOString();
  const reviewId = clean(payload.review_id);
  const reviewSnap = reviewId ? await getDoc(doc(school(), 'reviewPractices', reviewId)) : null;
  if (!reviewSnap?.exists()) throw new Error('Không tìm thấy bài ôn tập trên Firebase.');
  const previousSnap = await getDocs(query(
    namedCollection('reviewAttempts'),
    where('ownerUid', '==', me.uid),
    where('review_id', '==', reviewId),
    limit(20),
  ));
  const previousCount = previousSnap.size;
  const review = reviewSnap.data() as any;
  const data = withoutUndefined({ ...payload, attempt_id: attemptId, ownerUid: me.uid, user_id: clean(payload.user_id || me.userId),
    lop_id: clean(payload.lop_id || me.classId || review.lop_id), nam_hoc: clean(payload.nam_hoc || review.nam_hoc), hoc_ky: clean(payload.hoc_ky || review.hoc_ky || 'HK1'),
    so_lan_lam: previousCount + 1, schoolId: FIREBASE_SCHOOL_ID, schemaVersion: 1, submitted_at: clean(payload.submitted_at) || now, updatedAt: serverTimestamp() });
  assertSafeDocument(data, 'Kết quả ôn tập');
  await setDoc(doc(school(), 'reviewAttempts', attemptId), data);
  return data;
}

export async function listFirebaseReviewAttempts(filters: Record<string, unknown>) {
  const me = await identity();
  const reviewId = clean(filters.review_id);
  const base = namedCollection('reviewAttempts');
  const snap = (me.role === 'admin' || me.role === 'teacher' || me.adminPermission === true)
    ? await getDocs(reviewId ? query(base, where('review_id', '==', reviewId), limit(500)) : query(base, limit(500)))
    : await getDocs(reviewId
        ? query(base, where('ownerUid', '==', me.uid), where('review_id', '==', reviewId), limit(50))
        : query(base, where('ownerUid', '==', me.uid), limit(200)));
  return snap.docs.map(item => ({ attempt_id: item.id, ...item.data() }));
}

// Co-learning sessions ------------------------------------------------------
export async function saveFirebaseCoLearningSession(data: Record<string, unknown>) {
  const me = await identity();
  const sessionId = clean(data.session_id) || id('COLEARN');
  const now = new Date().toISOString();
  const saved = withoutUndefined({ ...data, session_id: sessionId, ownerUid: me.uid, schoolId: FIREBASE_SCHOOL_ID,
    schemaVersion: 2, started_at: clean(data.started_at) || now, verified_at: clean(data.verified_at) || now,
    last_active_at: now, updatedAt: serverTimestamp() });
  await setDoc(doc(school(), 'coLearningSessions', sessionId), saved, { merge: true });
  return saved;
}

// Non-secret configuration -------------------------------------------------
export async function getFirebaseConfig(documentId: string) {
  await identity();
  const snap = await getDoc(doc(school(), 'appConfig', documentId));
  return snap.exists() ? snap.data() : null;
}

export async function saveFirebaseConfig(documentId: string, payload: Record<string, unknown>) {
  const me = await identity();
  const data = withoutUndefined({ ...payload, schoolId: FIREBASE_SCHOOL_ID, schemaVersion: 1,
    updated_by: clean(me.userId), updated_at: new Date().toISOString(), updatedAt: serverTimestamp() });
  assertSafeDocument(data, 'Cấu hình', 200 * 1024);
  await setDoc(doc(school(), 'appConfig', documentId), data, { merge: true });
  return data;
}

export async function deleteFirebaseConfig(documentId: string) {
  await identity();
  await deleteDoc(doc(school(), 'appConfig', documentId));
}

// Cấu hình AI chứa API key nên phải nằm trong tài liệu riêng chỉ chủ tài khoản
// được đọc/ghi. Không lưu khóa này trong member vì giáo viên/admin có quyền đọc
// một số hồ sơ thành viên theo nghiệp vụ quản trị.
export async function getFirebaseUserAIConfig() {
  const me = await identity();
  const snap = await getDoc(doc(school(), 'userAIConfigs', me.uid));
  return snap.exists() ? snap.data() : null;
}

export async function saveFirebaseUserAIConfig(payload: Record<string, unknown>) {
  const me = await identity();
  const now = new Date().toISOString();
  const data = withoutUndefined({
    ...payload,
    ownerUid: me.uid,
    schoolId: FIREBASE_SCHOOL_ID,
    schemaVersion: 1,
    updated_at: now,
    updatedAt: serverTimestamp(),
  });
  assertSafeDocument(data, 'Cấu hình AI cá nhân', 32 * 1024);
  await setDoc(doc(school(), 'userAIConfigs', me.uid), data, { merge: true });
  return data;
}

export async function deleteFirebaseUserAIConfig() {
  const me = await identity();
  await deleteDoc(doc(school(), 'userAIConfigs', me.uid));
}

// Google Slides prompt JSON is stored directly; no Drive DOC/TXT/JSON copies.
export async function saveFirebaseSlidesPrompt(payload: Record<string, unknown>) {
  const me = await identity();
  const promptId = clean(payload.prompt_id) || id('PROMPT');
  const now = new Date().toISOString();
  const data = withoutUndefined({ ...payload, prompt_id: promptId, ownerUid: me.uid, nguoi_tao_id: clean(payload.nguoi_tao_id || me.userId),
    schoolId: FIREBASE_SCHOOL_ID, schemaVersion: 1, storageProvider: 'firestore_spark', prompt_json_file_id: '', doc_file_id: '', txt_file_id: '',
    doc_url: '', txt_url: '', json_url: '', created_at: clean(payload.created_at) || now, updated_at: now, updatedAt: serverTimestamp(), trang_thai: 'active' });
  assertSafeDocument(data, 'Prompt trình chiếu');
  await setDoc(doc(school(), 'slidesPrompts', promptId), data, { merge: Boolean(payload.prompt_id) });
  return data;
}

export async function listFirebaseSlidesPrompts(filters: Record<string, unknown> = {}) {
  const me = await identity();
  const base = namedCollection('slidesPrompts');
  const snap = (me.role === 'admin' || me.adminPermission === true) ? await getDocs(base) : await getDocs(query(base, where('ownerUid', '==', me.uid)));
  return snap.docs.map(item => ({ prompt_id: item.id, ...item.data() } as any)).filter(item => !filters.lesson_id || clean(item.lesson_id) === clean(filters.lesson_id));
}

export async function getFirebaseSlidesPrompt(promptId: string) {
  await identity();
  const snap = await getDoc(doc(school(), 'slidesPrompts', promptId));
  return snap.exists() ? { prompt_id: snap.id, ...snap.data() } : null;
}

export async function deleteFirebaseSlidesPrompt(promptId: string) {
  await identity();
  await deleteDoc(doc(school(), 'slidesPrompts', promptId));
}
