import { deleteDoc, deleteField, doc, getDoc, getDocs, collection, limit, onSnapshot, orderBy, query, runTransaction, serverTimestamp, setDoc, Timestamp, updateDoc, where, writeBatch } from 'firebase/firestore';
import type { CollectionReference, DocumentData, DocumentReference, QueryDocumentSnapshot, Transaction } from 'firebase/firestore';
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
  PreLessonProgress,
  TeachingSession,
  LessonActivityV3,
} from '../types';
import {
  FIREBASE_SCHOOL_ID,
  firebaseAuth,
  firebaseErrorMessage,
  firebaseInternalEmailForUsername,
  loadValidatedCurrentFirebaseMember,
  firestoreDb,
} from './firebase';
import { getAllQueryDocs } from './firebaseQueries';
import { resolveLessonSaveState } from '../utils/lessonWorkflow';
import { buildLessonTitle, normalizeLessonName, normalizeLessonNumber, resolveLessonIdentity } from '../utils/lessonCatalog';
import { getLessonScheduleAccess } from '../utils/lessonAccess';
import { calculateWeightedAssessmentScore, mergeSectionProgressMonotonic } from '../utils/learningScoreEngine';

const MAX_LESSON_DOCUMENT_BYTES = 750 * 1024;
const IDENTITY_CACHE_TTL_MS = 5 * 60 * 1000;
const school = () => doc(firestoreDb, 'schools', FIREBASE_SCHOOL_ID);
const lessons = () => collection(school(), 'lessons');
const namedCollection = (name: string) => collection(school(), name);
const lessonContentRef = (lessonId: string) => doc(firestoreDb, 'schools', FIREBASE_SCHOOL_ID, 'lessons', lessonId, 'content', 'main');
const lessonActivitiesCollection = (lessonId: string) => collection(firestoreDb, 'schools', FIREBASE_SCHOOL_ID, 'lessons', lessonId, 'activities');
const lessonActivityRef = (lessonId: string, activityId: string) => doc(firestoreDb, 'schools', FIREBASE_SCHOOL_ID, 'lessons', lessonId, 'activities', activityId);
const teachingSessionRef = (lessonId: string, classId: string) => doc(school(), 'teachingSessions', `${lessonId}__${classId || 'all'}`);
const preLessonProgressRef = (userId: string, lessonId: string) => doc(school(), 'preLessonProgress', `${userId}_${lessonId}`);
const reviewContentRef = (reviewId: string) => doc(firestoreDb, 'schools', FIREBASE_SCHOOL_ID, 'reviewPractices', reviewId, 'content', 'main');
let identityCache: { uid: string; expiresAt: number; value: any } | null = null;
let identityPromise: { uid: string; value: Promise<any> } | null = null;
let bootstrapCache: { uid: string; expiresAt: number; value: Record<string, any[]> } | null = null;
let bootstrapPromise: { uid: string; value: Promise<Record<string, any[]>> } | null = null;
let lessonPublishRulesVerifiedUid = '';

function clean(value: unknown) { return value == null ? '' : String(value).trim(); }
function sameGrade(left: unknown, right: unknown) { return clean(left).replace(/\.0+$/, '') === clean(right).replace(/\.0+$/, ''); }
function cleanStringList(value: unknown) {
  return Array.isArray(value) ? value.map(clean).filter(Boolean) : [];
}

function cleanGradeScopes(value: unknown, fallbackGrade: unknown = '') {
  const source = Array.isArray(value)
    ? value
    : clean(value).split(/[;,|\s]+/).filter(Boolean);
  const grades = Array.from(new Set(source.map(clean).map((item) => item.replace(/\.0+$/, '')).filter(Boolean)))
    .sort((a, b) => Number(a) - Number(b) || a.localeCompare(b, 'vi'));
  const fallback = clean(fallbackGrade).replace(/\.0+$/, '');
  if (!grades.length && fallback) grades.push(fallback);
  return grades;
}

function teacherManagedGrades(member: any) {
  return cleanGradeScopes(member?.gradeScopes ?? member?.khoi_phu_trach ?? member?.grade_scope, member?.grade);
}

function teacherManagesAllGrades(member: any) {
  return member?.role === 'admin' || member?.adminPermission === true || member?.allGrades === true || clean(member?.tat_ca_khoi).toLowerCase() === 'true';
}

function teacherCanManageGrade(member: any, grade: unknown) {
  if (!member || member.role !== 'teacher') return true;
  if (teacherManagesAllGrades(member)) return true;
  const normalizedGrade = clean(grade).replace(/\.0+$/, '');
  if (!normalizedGrade) return true;
  return teacherManagedGrades(member).includes(normalizedGrade);
}

function assertTeacherCanManageGrade(member: any, grade: unknown) {
  if (!member || member.role !== 'teacher' || member.adminPermission === true) return;
  if (!teacherCanManageGrade(member, grade)) {
    const scope = teacherManagedGrades(member);
    throw new Error(`Giáo viên chỉ được thao tác dữ liệu thuộc ${scope.length ? `khối ${scope.join(', ')}` : 'các khối đã được phân công'}.`);
  }
}

const DEFAULT_SCHOOL_GRADES = ['6', '7', '8', '9'];

/**
 * Firestore Rules không phải bộ lọc. Vì vậy kể cả giáo viên có allGrades=true,
 * các truy vấn dữ liệu theo học sinh/bài học/tiến độ vẫn phải mang điều kiện
 * `grade/khoi == <khối>` để Rules chứng minh toàn bộ result set hợp lệ.
 * Hàm này biến "Tất cả khối" thành danh sách khối thật của trường và chỉ dùng
 * 6-9 làm fallback khi catalog chưa tải được.
 */
async function teacherQueryGrades(member: any) {
  if (!member || member.role !== 'teacher' || member.adminPermission === true) return [];
  if (!teacherManagesAllGrades(member)) return teacherManagedGrades(member);

  const discovered = new Set<string>();
  try {
    const bootstrap = await getFirebaseBootstrap();
    (bootstrap.classes || []).forEach((item: any) => {
      const grade = clean(item?.khoi ?? item?.grade).replace(/\.0+$/, '');
      if (grade) discovered.add(grade);
    });
    (bootstrap.subjects || []).forEach((item: any) => {
      clean(item?.khoi_ap_dung ?? item?.grades).split(/[;,|\s]+/).filter(Boolean).forEach((raw) => {
        const grade = clean(raw).replace(/\.0+$/, '');
        if (grade) discovered.add(grade);
      });
    });
  } catch {
    // Catalog chỉ giúp khám phá khối. Query dữ liệu vẫn có fallback an toàn bên dưới.
  }
  const grades = Array.from(discovered).sort((a, b) => Number(a) - Number(b) || a.localeCompare(b, 'vi'));
  return grades.length ? grades : DEFAULT_SCHOOL_GRADES;
}

function lessonScheduleTimestamp(value: unknown) {
  const raw = clean(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : Timestamp.fromDate(parsed);
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

function registryClassOwnerMap(data: any): Record<string, string> {
  if (!data?.classOwnerUids || typeof data.classOwnerUids !== 'object' || Array.isArray(data.classOwnerUids)) return {};
  return Object.fromEntries(Object.entries(data.classOwnerUids).map(([key, value]) => [clean(key), clean(value)]).filter(([key, value]) => key && value));
}

function registryLessonIds(data: any) {
  return Array.from(new Set([
    clean(data?.allLessonId),
    ...Object.values(registryClassMap(data)).map(clean),
  ].filter(Boolean)));
}

function removeLessonFromRegistry(data: any, lessonId: string) {
  const nextClassMap = registryClassMap(data);
  const nextOwnerMap = registryClassOwnerMap(data);
  Object.keys(nextClassMap).forEach((classId) => {
    if (clean(nextClassMap[classId]) === lessonId) {
      delete nextClassMap[classId];
      delete nextOwnerMap[classId];
    }
  });
  const removeAll = clean(data?.allLessonId) === lessonId;
  return {
    ...data,
    allLessonId: removeAll ? '' : clean(data?.allLessonId),
    allOwnerUid: removeAll ? '' : clean(data?.allOwnerUid),
    classLessonIds: nextClassMap,
    classOwnerUids: nextOwnerMap,
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

function registryConflictLessonIds(registryData: any, lessonId: string, classId: string) {
  const normalized = removeLessonFromRegistry(registryData || {}, lessonId);
  const classMap = registryClassMap(normalized);
  return Array.from(new Set([
    clean(normalized.allLessonId),
    ...(classId ? [clean(classMap[classId])] : Object.values(classMap).map(clean)),
  ].filter(Boolean)));
}

/**
 * V6.77.0: registry cũ có thể còn trỏ tới lesson đã bị xóa từ các phiên bản trước.
 * Khi reserve số bài, kiểm tra các lesson đang gây xung đột. Reference nào trỏ tới
 * document không còn tồn tại sẽ được loại khỏi registry ngay trong cùng transaction;
 * reference còn tồn tại vẫn được coi là xung đột hợp lệ.
 */
async function repairOrAssertLessonNumberAvailable(
  transaction: Transaction,
  registryData: any,
  lessonId: string,
  classId: string,
  title: string,
) {
  let normalized = removeLessonFromRegistry(registryData || {}, lessonId);
  const candidateIds = registryConflictLessonIds(normalized, lessonId, classId);
  if (!candidateIds.length) return { registryData: normalized, removedOrphanIds: [] as string[] };

  const snapshots = await Promise.all(candidateIds.map((candidateId) => transaction.get(doc(lessons(), candidateId))));
  const orphanIds: string[] = [];
  const liveIds: string[] = [];
  snapshots.forEach((snapshot, index) => {
    const candidateId = candidateIds[index];
    if (snapshot.exists()) liveIds.push(candidateId);
    else orphanIds.push(candidateId);
  });

  orphanIds.forEach((orphanId) => { normalized = removeLessonFromRegistry(normalized, orphanId); });
  const remainingConflictIds = registryConflictLessonIds(normalized, lessonId, classId);
  if (remainingConflictIds.length || liveIds.length) {
    throw new Error(`${title} đã tồn tại trong phạm vi khối/lớp đã chọn. Hãy chọn số bài khác hoặc chỉnh sửa bài hiện có.`);
  }
  return { registryData: normalized, removedOrphanIds: orphanIds };
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
    // V6.68.0 đã được Publish, tránh đăng nhập được nhưng collection phía sau bị chặn.
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
  lessonPublishRulesVerifiedUid = '';
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
        ownerUid: clean(current.createdByUid),
        createdByUid: clean(current.createdByUid),
        khoi: clean(current.khoi),
        lop_id: clean(current.lop_id),
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
    arena_question_count: Number.isFinite(Number(data.arena_question_count)) ? Math.max(0, Number(data.arena_question_count)) : undefined,
    arena_ready: data.arena_ready === true ? true : data.arena_ready === false ? false : undefined,
    lop_id: clean(data.lop_id), khoi: clean(data.khoi), mon_id: clean(data.mon_id),
    nguoi_tao_id: clean(data.nguoi_tao_id), pham_vi: data.pham_vi === 'shared' ? 'shared' : 'private',
    trang_thai: clean(data.trang_thai), source_file_id: clean(data.source_file_id), json_file_id: clean(data.json_file_id),
    tom_tat: clean(data.tom_tat), tu_khoa: clean(data.tu_khoa), nam_hoc: clean(data.nam_hoc), hoc_ky: clean(data.hoc_ky),
    thoi_gian_bat_dau: clean(data.thoi_gian_bat_dau), thoi_gian_ket_thuc: clean(data.thoi_gian_ket_thuc),
    cho_phep_hoc_sau_han: data.cho_phep_hoc_sau_han, cho_phep_nop_sau_han: data.cho_phep_nop_sau_han,
    is_locked: data.is_locked === true,
    locked_at: clean(data.locked_at), locked_by_uid: clean(data.locked_by_uid), locked_by_name: clean(data.locked_by_name),
    intro_video_url: clean(data.intro_video_url), intro_video_embed_url: clean(data.intro_video_embed_url),
    pre_lesson_enabled: data.pre_lesson_enabled !== false && Boolean(clean(data.intro_video_url || data.intro_video_embed_url)),
    pre_lesson_allow_when_locked: data.pre_lesson_allow_when_locked !== false,
    pre_lesson_required: data.pre_lesson_required === true,
    pre_lesson_completion_threshold: Number.isFinite(Number(data.pre_lesson_completion_threshold)) ? Number(data.pre_lesson_completion_threshold) : 80,
    pre_lesson_deadline: clean(data.pre_lesson_deadline),
    pre_lesson_score_enabled: data.pre_lesson_score_enabled !== false && data.pre_lesson_enabled !== false,
    pre_lesson_score_weight: Math.max(0, Math.min(30, Number(data.pre_lesson_score_weight ?? 10))),
    content_schema_version: clean(data.content_schema_version || data.lesson_schema_version) as any,
    builder_settings: data.builder_settings && typeof data.builder_settings === 'object' ? data.builder_settings as any : undefined,
    created_at: clean(data.created_at), updated_at: clean(data.updated_at),
  };
}

export async function listFirebaseLessons(filters: Record<string, unknown> = {}) {
  const me = await identity();
  let snapshots: Awaited<ReturnType<typeof getAllQueryDocs>>[] = [];

  if (me.role === 'admin' || me.adminPermission === true) {
    snapshots = [await getAllQueryDocs(query(lessons(), orderBy('updated_at', 'desc')))];
  } else if (me.role === 'teacher') {
    // V6.74.2: kể cả allGrades=true cũng query từng khối thật. Không query rộng
    // toàn collection rồi lọc client, vì Firestore Rules không phải bộ lọc.
    const grades = await teacherQueryGrades(me);
    if (!grades.length) return [];

    const buildTeacherQueries = (grade: string) => [
      getAllQueryDocs(query(lessons(), where('khoi', '==', grade), where('pham_vi', '==', 'shared'))),
      getAllQueryDocs(query(lessons(), where('khoi', '==', grade), where('createdByUid', '==', me.uid))),
    ];

    snapshots = await Promise.all(grades.flatMap(grade => buildTeacherQueries(grade)));
  } else {
    snapshots = [await getAllQueryDocs(query(
      lessons(),
      where('pham_vi', '==', 'shared'),
      where('trang_thai', '==', 'approved_shared')
    ))];
  }
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
    if (me.role === 'teacher') {
      if (!teacherCanManageGrade(me, item.khoi)) return false;
      if (item.pham_vi !== 'shared' && item.nguoi_tao_id !== clean(me.userId)) return false;
    }
    if (me.role === 'student' && (source.content_status === 'preparing' || !matchesMemberAudience(source, me))) return false;
    return true;
  }).map(({ lesson }) => lesson)
    .sort((left, right) => clean(right.updated_at).localeCompare(clean(left.updated_at)));
}

export async function getFirebaseLesson(lessonId: string): Promise<LessonContentResponse | null> {
  const me = await identity();
  let metadataSnap;
  try {
    metadataSnap = await getDoc(doc(lessons(), lessonId));
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: unknown }).code || '') : '';
    if (code === 'permission-denied' || code === 'firestore/permission-denied') {
      throw new Error('Firestore đã cho thấy bài trong danh sách nhưng từ chối đọc metadata bài theo ID. Hãy Publish Rules V6.78.2; bản này tương thích hồ sơ legacy lop_id/khoi và khối kiểu số/chuỗi.');
    }
    throw error;
  }
  if (!metadataSnap.exists()) return null;
  const data = metadataSnap.data() as any;
  const lesson = row(data, metadataSnap.id);
  if (me.role === 'student') {
    if (!matchesMemberAudience(data, me)) {
      throw new Error(`Bài học không khớp phạm vi tài khoản hiện tại (học sinh: khối ${clean(me.grade) || '-'}, lớp ${clean(me.classId) || '-'}; bài: khối ${clean(data.khoi) || '-'}, lớp ${clean(data.lop_id) || 'dùng chung'}).`);
    }
    if (lesson.is_locked === true) {
      throw new Error('Bài học hiện đang được giáo viên khóa. Em hãy chờ giáo viên mở bài rồi thử lại.');
    }
    const scheduleAccess = getLessonScheduleAccess(lesson);
    if (scheduleAccess.blocked) {
      throw new Error(`${scheduleAccess.message} Em chưa thể tải nội dung bài học lúc này.`);
    }
  }
  try {
    const contentSnap = await getDoc(lessonContentRef(lessonId));
    const contentData = contentSnap.exists() ? contentSnap.data() as any : null;
    let lessonJson = contentData?.lesson_json ?? data.lesson_json;
    if (lessonJson?.schema_version === 'lesson_v3' && Array.isArray(lessonJson.activities)) {
      const manifest = lessonJson.activities as any[];
      if (me.role === 'student') {
        const classId = clean(me.classId);
        const session = classId ? await getFirebaseTeachingSession(lessonId, classId).catch(() => null) : null;
        const releasedIds = new Set((session?.released_activity_ids || []).map(clean).filter(Boolean));
        const activityDocs = await Promise.all(manifest.map(async (activity, index) => {
          const activityId = clean(activity?.activity_id) || `A${index + 1}`;
          if (!releasedIds.has(activityId)) return { ...activity, activity_id: activityId, released: false, locked: true, pages: [], interactions: [] };
          try {
            const snap = await getDoc(lessonActivityRef(lessonId, activityId));
            return snap.exists() ? { ...snap.data(), activity_id: activityId, released: true, locked: false } : { ...activity, activity_id: activityId, released: true, locked: false };
          } catch {
            return { ...activity, activity_id: activityId, released: false, locked: true, pages: [], interactions: [] };
          }
        }));
        lessonJson = { ...lessonJson, activities: activityDocs, teaching_session: session };
      } else {
        const activitySnap = await getDocs(lessonActivitiesCollection(lessonId));
        const byId = new Map(activitySnap.docs.map((item) => [item.id, item.data()]));
        lessonJson = {
          ...lessonJson,
          activities: manifest.map((activity, index) => {
            const activityId = clean(activity?.activity_id) || `A${index + 1}`;
            const activityData = (byId.get(activityId) || {}) as Record<string, unknown>;
            return { ...activity, ...activityData, activity_id: activityId, released: true, locked: false };
          }),
        };
      }
    }
    return { lesson, content: lessonJson };
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: unknown }).code || '') : '';
    if (code === 'permission-denied' || code === 'firestore/permission-denied') {
      throw new Error('Firestore đã cho phép đọc metadata nhưng từ chối document nội dung. Hãy Publish Rules V6.78.2. Bản này xử lý access_start_at/access_end_at legacy không phải Timestamp và cờ cho phép học sau hạn dạng cũ.');
    }
    throw error;
  }
}

export async function setFirebaseLessonLock(lessonId: string, locked: boolean) {
  const me = await identity();
  const target = doc(lessons(), clean(lessonId));
  const snap = await getDoc(target);
  if (!snap.exists()) throw new Error('Không tìm thấy bài học cần cập nhật.');
  const current = snap.data() as any;
  if (me.role === 'teacher' && me.adminPermission !== true) {
    assertTeacherCanManageGrade(me, current.khoi);
  }
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

type LessonPublishStage = 'PUBLISH_PREFLIGHT' | 'REGISTRY_RESERVE' | 'LESSON_CREATE' | 'CONTENT_CREATE' | 'PUBLISH_RUNTIME' | 'REGISTRY_ROLLBACK' | 'LESSON_UPDATE';

const LESSON_PUBLISH_STAGE_LABELS: Record<LessonPublishStage, string> = {
  PUBLISH_PREFLIGHT: 'Kiểm tra quyền xuất bản',
  REGISTRY_RESERVE: 'Kiểm tra và giữ số bài',
  LESSON_CREATE: 'Tạo thông tin bài học',
  CONTENT_CREATE: 'Tạo nội dung bài học',
  PUBLISH_RUNTIME: 'Xử lý quy trình xuất bản',
  REGISTRY_ROLLBACK: 'Khôi phục dữ liệu xuất bản',
  LESSON_UPDATE: 'Cập nhật bài học',
};

function lessonPublishStageError(stage: LessonPublishStage, error: unknown) {
  const existingStage = clean((error as any)?.stage) as LessonPublishStage;
  if (existingStage && LESSON_PUBLISH_STAGE_LABELS[existingStage] && error instanceof Error) return error;
  const detail = firebaseErrorMessage(error);
  const message = `${LESSON_PUBLISH_STAGE_LABELS[stage]} không thành công. ${detail} [${stage}]`;
  const wrapped = new Error(message);
  (wrapped as any).stage = stage;
  (wrapped as any).cause = error;
  return wrapped;
}

function lessonPublishErrorWithRollback(error: unknown, rollbackMessages: string[]) {
  const original = error instanceof Error
    ? error
    : lessonPublishStageError('PUBLISH_RUNTIME', error);
  if (!rollbackMessages.length) return original;
  const stage = clean((original as any)?.stage) || 'PUBLISH_RUNTIME';
  const wrapped = new Error(`${original.message} Rollback chưa hoàn tất: ${rollbackMessages.join('; ')}. [REGISTRY_ROLLBACK]`);
  (wrapped as any).stage = stage;
  (wrapped as any).rollbackStage = 'REGISTRY_ROLLBACK';
  (wrapped as any).cause = original;
  return wrapped;
}

async function verifyLessonPublishRulesCapability(uid: string) {
  const normalizedUid = clean(uid);
  if (!normalizedUid) throw new Error('Không xác định được Firebase UID để kiểm tra quyền xuất bản.');
  if (lessonPublishRulesVerifiedUid === normalizedUid) return;

  const probeRef = doc(school(), 'rulesProbes', normalizedUid);
  try {
    await setDoc(probeRef, {
      schoolId: FIREBASE_SCHOOL_ID,
      ownerUid: normalizedUid,
      rulesVersion: '6.78.2',
      purpose: 'lesson-publish-probe',
      updatedAt: serverTimestamp(),
    }, { merge: false });
    await deleteDoc(probeRef);
    lessonPublishRulesVerifiedUid = normalizedUid;
  } catch (error) {
    throw new Error(`Chưa xác minh được Firestore Rules V6.78.2 trên project ${FIREBASE_SCHOOL_ID}. Hãy deploy file firestore.rules của bộ V6.78.2 trước khi xuất bản bài học. ${firebaseErrorMessage(error)}`);
  }
}

async function freshLessonPublishIdentity(grade: unknown) {
  try {
    const current = firebaseAuth.currentUser;
    if (!current) throw new Error('Bạn cần đăng nhập Firebase để xuất bản bài học.');
    // V6.77.0: luôn đọc lại member thật trước thao tác xuất bản, không dùng cache 5 phút.
    const member = await loadValidatedCurrentFirebaseMember();
    identityCache = { uid: current.uid, expiresAt: Date.now() + IDENTITY_CACHE_TTL_MS, value: member };
    if (member.role !== 'admin' && member.role !== 'teacher') {
      throw new Error('Tài khoản hiện tại không có quyền tạo hoặc xuất bản bài học.');
    }
    assertTeacherCanManageGrade(member, grade);
    await verifyLessonPublishRulesCapability(current.uid);
    return member;
  } catch (error) {
    throw lessonPublishStageError('PUBLISH_PREFLIGHT', error);
  }
}

function buildLessonRegistryDocument(
  registryData: any,
  lessonId: string,
  payload: LessonComposerValues,
  registryKey: string,
  lessonNumber: number,
  uid: string,
  now: string,
) {
  const nextRegistry = removeLessonFromRegistry(registryData || {}, lessonId);
  const classMap = registryClassMap(nextRegistry);
  const classOwnerMap = registryClassOwnerMap(nextRegistry);
  const classId = clean(payload.lop_id);
  if (classId) {
    classMap[classId] = lessonId;
    classOwnerMap[classId] = uid;
  }
  return withoutUndefined({
    schoolId: FIREBASE_SCHOOL_ID,
    schemaVersion: 2,
    registryKey,
    lessonNumber,
    subjectId: clean(payload.mon_id),
    grade: clean(payload.khoi),
    academicYear: clean(payload.nam_hoc),
    semester: clean(payload.hoc_ky || 'HK1'),
    allLessonId: classId ? clean(nextRegistry.allLessonId) : lessonId,
    allOwnerUid: classId ? clean(nextRegistry.allOwnerUid) : uid,
    classLessonIds: classId ? classMap : {},
    classOwnerUids: classId ? classOwnerMap : {},
    updatedByUid: uid,
    updated_at: now,
    updatedAt: serverTimestamp(),
  });
}

function lessonActivitySummary(activity: any, index: number) {
  return withoutUndefined({
    activity_id: clean(activity?.activity_id) || `A${index + 1}`,
    title: clean(activity?.title) || `Hoạt động ${index + 1}`,
    objective: clean(activity?.objective),
    activity_type: clean(activity?.activity_type || 'knowledge'),
    estimated_minutes: Number(activity?.estimated_minutes || 0) || undefined,
    summary: clean(activity?.summary),
    pages: [],
    interactions: [],
    released: false,
    locked: true,
  });
}

function buildLessonManifestJson(lessonJson: any) {
  if (!lessonJson || lessonJson.schema_version !== 'lesson_v3' || !Array.isArray(lessonJson.activities)) return lessonJson;
  return {
    ...lessonJson,
    // Không để các field tương thích lesson_v2 làm rò toàn bộ nội dung activity
    // vào content/main. Học sinh chỉ nhận nội dung đầy đủ từ /activities/{id}
    // sau khi giáo viên release activity cho đúng lớp.
    sections: [],
    hinh_thanh_kien_thuc: [],
    activities: lessonJson.activities.map(lessonActivitySummary),
  };
}

function buildLessonContentDocument(
  lessonId: string,
  lessonJson: any,
  payload: LessonComposerValues,
  ownerUid: string,
  now: string,
) {
  return withoutUndefined({
    lesson_json: buildLessonManifestJson(lessonJson),
    schoolId: FIREBASE_SCHOOL_ID,
    lessonId,
    ownerUid,
    createdByUid: ownerUid,
    khoi: clean(payload.khoi),
    lop_id: clean(payload.lop_id),
    schemaVersion: 2,
    updated_at: now,
    updatedAt: serverTimestamp(),
  });
}

function buildLessonActivityDocument(lessonId: string, activity: LessonActivityV3, index: number, payload: LessonComposerValues, ownerUid: string, now: string) {
  const activityId = clean(activity?.activity_id) || `A${index + 1}`;
  return {
    activityId,
    data: withoutUndefined({
      ...activity,
      activity_id: activityId,
      lessonId,
      schoolId: FIREBASE_SCHOOL_ID,
      ownerUid,
      createdByUid: ownerUid,
      khoi: clean(payload.khoi),
      lop_id: clean(payload.lop_id),
      schemaVersion: 3,
      updated_at: now,
      updatedAt: serverTimestamp(),
    }),
  };
}

async function syncLessonActivityDocuments(lessonId: string, lessonJson: any, payload: LessonComposerValues, ownerUid: string, now: string) {
  const existing = await getDocs(lessonActivitiesCollection(lessonId));
  const nextActivities = lessonJson?.schema_version === 'lesson_v3' && Array.isArray(lessonJson.activities)
    ? lessonJson.activities.map((activity: LessonActivityV3, index: number) => buildLessonActivityDocument(lessonId, activity, index, payload, ownerUid, now))
    : [];
  const nextIds = new Set(nextActivities.map((item: any) => item.activityId));
  if (!nextActivities.length && existing.empty) return;
  const batch = writeBatch(firestoreDb);
  nextActivities.forEach((item: any) => batch.set(lessonActivityRef(lessonId, item.activityId), item.data, { merge: true }));
  existing.docs.forEach((item) => { if (!nextIds.has(item.id)) batch.delete(item.ref); });
  await batch.commit();
}

async function deleteLessonActivityDocuments(lessonId: string) {
  const snapshot = await getDocs(lessonActivitiesCollection(lessonId));
  if (!snapshot.empty) await commitDeleteRefs(snapshot.docs.map((item) => item.ref));
  return snapshot.size;
}

function assertCanonicalLessonMetadataForWrite(data: any, lessonId: string, expectedOwnerUid: string) {
  const problems: string[] = [];
  const lessonNumber = Number(data?.lesson_number);
  if (clean(data?.lesson_id) !== clean(lessonId)) problems.push('lesson_id không khớp document path');
  if (clean(data?.schoolId) !== FIREBASE_SCHOOL_ID) problems.push(`schoolId phải là ${FIREBASE_SCHOOL_ID}`);
  if (Number(data?.schemaVersion) !== 2) problems.push('schemaVersion phải bằng 2');
  if (clean(data?.createdByUid) !== clean(expectedOwnerUid)) problems.push('createdByUid không khớp Firebase UID của người tạo');
  if (!Number.isInteger(lessonNumber) || lessonNumber < 1 || lessonNumber > 999) problems.push('lesson_number phải là số nguyên từ 1 đến 999');
  if (!clean(data?.lesson_name)) problems.push('lesson_name bị trống');
  if (!clean(data?.lesson_key)) problems.push('lesson_key bị trống');
  if (!clean(data?.tieu_de)) problems.push('tieu_de bị trống');
  if (!clean(data?.mon_id)) problems.push('mon_id bị trống');
  if (!clean(data?.khoi)) problems.push('khoi bị trống');
  if (!clean(data?.nam_hoc)) problems.push('nam_hoc bị trống');
  if (!clean(data?.hoc_ky)) problems.push('hoc_ky bị trống');
  if (data?.arena_question_count !== undefined) {
    const count = Number(data.arena_question_count);
    if (!Number.isFinite(count) || count < 0 || count > 5000) problems.push('arena_question_count không hợp lệ');
  }
  if (data?.arena_ready !== undefined && typeof data.arena_ready !== 'boolean') problems.push('arena_ready phải là boolean');

  if (problems.length) {
    const error = new Error(`Thông tin bài học chưa đạt chuẩn trước khi ghi Firestore: ${problems.join('; ')}.`);
    (error as any).stage = 'LESSON_CREATE';
    throw error;
  }
}

function lessonCreateSecurityDiagnostic(data: any, me: any, lessonId: string) {
  return {
    lessonId,
    authenticatedUid: clean(firebaseAuth.currentUser?.uid),
    memberUid: clean(me?.uid),
    memberAuthUid: clean(me?.authUid),
    memberRole: clean(me?.role),
    memberStatus: clean(me?.status),
    memberSchoolId: clean(me?.schoolId),
    adminPermission: me?.adminPermission === true,
    allGrades: me?.allGrades === true,
    gradeScopes: Array.isArray(me?.gradeScopes) ? me.gradeScopes.map(clean) : [],
    lessonSchoolId: clean(data?.schoolId),
    lessonCreatedByUid: clean(data?.createdByUid),
    lessonGrade: clean(data?.khoi),
    lessonNumber: data?.lesson_number,
    lessonNumberType: typeof data?.lesson_number,
    lessonIdField: clean(data?.lesson_id),
    schemaVersion: data?.schemaVersion,
    monId: clean(data?.mon_id),
    academicYear: clean(data?.nam_hoc),
    semester: clean(data?.hoc_ky),
  };
}

async function rollbackLessonRegistryReservation(registryRef: DocumentReference<DocumentData>, lessonId: string) {
  await runTransaction(firestoreDb, async (transaction) => {
    const snapshot = await transaction.get(registryRef);
    if (!snapshot.exists()) return;
    const cleaned = removeLessonFromRegistry(snapshot.data(), lessonId);
    if (registryHasAnyLesson(cleaned)) {
      transaction.set(registryRef, {
        ...cleaned,
        updatedByUid: firebaseAuth.currentUser?.uid,
        updated_at: new Date().toISOString(),
        updatedAt: serverTimestamp(),
      }, { merge: false });
    } else {
      transaction.delete(registryRef);
    }
  });
}

export async function saveFirebaseLesson(payload: LessonComposerValues, updating = false) {
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

  const me = await freshLessonPublishIdentity(normalizedPayload.khoi);
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
  const arenaQuestionCount = lessonJson ? (Array.isArray(lessonJson?.luyen_tap?.trac_nghiem) ? lessonJson.luyen_tap.trac_nghiem.length : 0) : undefined;
  const arenaReady = arenaQuestionCount === undefined ? undefined : arenaQuestionCount > 0;

  const createMetadata = (existingData: any = null) => {
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
    const { lesson_json: _lessonJson, source_file: _sourceFile, keep_editor_open: _keepEditorOpen, ...metadataPayload } = normalizedPayload;
    const data = withoutUndefined({
      ...metadataPayload,
      lesson_id: lessonId,
      lesson_number: lessonNumber,
      lesson_name: lessonName,
      lesson_key: registryKey,
      arena_question_count: arenaQuestionCount === undefined ? existingData?.arena_question_count : arenaQuestionCount,
      arena_ready: arenaReady === undefined ? existingData?.arena_ready : arenaReady,
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
      source_file_name: sourceFileName || clean(existingData?.source_file_name),
      source_file_type: sourceFileType || clean(existingData?.source_file_type),
      source_file_size: sourceFileName ? sourceFileSize : Number(existingData?.source_file_size || 0),
      source_file_retained: existingData ? existingData.source_file_retained === true : false,
      audienceKeys: audienceKeys(normalizedPayload.khoi, normalizedPayload.lop_id),
      access_start_at: lessonScheduleTimestamp(normalizedPayload.thoi_gian_bat_dau),
      access_end_at: lessonScheduleTimestamp(normalizedPayload.thoi_gian_ket_thuc),
      contentPath: `lessons/${lessonId}/content/main`,
      content_schema_version: clean(lessonJson?.schema_version || 'lesson_v2'),
      intro_video_url: clean(normalizedPayload.intro_video_url || lessonJson?.intro_video_url || lessonJson?.intro_video_embed_url),
      intro_video_embed_url: clean(lessonJson?.intro_video_embed_url || ''),
      pre_lesson_enabled: normalizedPayload.pre_lesson_enabled !== false && Boolean(clean(normalizedPayload.intro_video_url || lessonJson?.intro_video_url || lessonJson?.intro_video_embed_url)),
      pre_lesson_allow_when_locked: normalizedPayload.pre_lesson_allow_when_locked !== false,
      pre_lesson_required: normalizedPayload.pre_lesson_required === true,
      pre_lesson_completion_threshold: Math.max(50, Math.min(100, Number(normalizedPayload.pre_lesson_completion_threshold || 80))),
      pre_lesson_deadline: clean(normalizedPayload.pre_lesson_deadline || normalizedPayload.thoi_gian_bat_dau),
      pre_lesson_deadline_at: lessonScheduleTimestamp(normalizedPayload.pre_lesson_deadline || normalizedPayload.thoi_gian_bat_dau),
      pre_lesson_score_enabled: normalizedPayload.pre_lesson_score_enabled !== false && normalizedPayload.pre_lesson_enabled !== false,
      pre_lesson_score_weight: Math.max(0, Math.min(30, Number(normalizedPayload.pre_lesson_score_weight ?? 10))),
      content_status: existingData ? (existingData.content_status || 'ready') : 'preparing',
      created_at: existingData ? clean(existingData.created_at) : now,
      updated_at: now,
      updatedAt: serverTimestamp(),
    });
    assertSafeDocument(data, 'Thông tin bài học', 200 * 1024);
    return data;
  };

  // UPDATE: giữ transaction nguyên tử vì parent lesson đã tồn tại và Rules có thể
  // đối chiếu ownership trực tiếp. V6.77.0 vẫn ghi metadata bảo mật vào content.
  if (updating) {
    try {
      // V6.77.0: activity documents được cập nhật trong cùng transaction với
      // lesson metadata + content manifest để tránh trạng thái manifest mới nhưng
      // activity cũ nếu mạng lỗi giữa hai bước. Danh sách ID hiện tại được đọc
      // trước transaction; mọi write vẫn diễn ra nguyên tử trong transaction.
      const existingActivitySnapshot = await getDocs(lessonActivitiesCollection(lessonId));
      const updatedRow = await runTransaction(firestoreDb, async (transaction) => {
        const existing = await transaction.get(target);
        if (!existing.exists()) return null;
        const existingData = existing.data() as any;
        assertTeacherCanManageGrade(me, existingData.khoi);
        const oldRegistryKey = clean(existingData.lesson_key) || lessonRegistryKey(existingData);
        const oldRegistryRef = oldRegistryKey && oldRegistryKey !== registryKey
          ? doc(school(), 'lessonNumberRegistry', oldRegistryKey)
          : null;

        const registrySnap = await transaction.get(registryRef);
        const oldRegistrySnap = oldRegistryRef ? await transaction.get(oldRegistryRef) : null;
        const registryData = registrySnap.exists() ? registrySnap.data() as any : {};
        const registryCheck = await repairOrAssertLessonNumberAvailable(
          transaction,
          registryData,
          lessonId,
          clean(normalizedPayload.lop_id),
          normalizedPayload.tieu_de,
        );

        const data = createMetadata(existingData);
        assertCanonicalLessonMetadataForWrite(data, lessonId, clean(existingData.createdByUid) || me.uid);
        if (oldRegistryRef && oldRegistrySnap?.exists()) {
          const cleanedOld = removeLessonFromRegistry(oldRegistrySnap.data(), lessonId);
          if (registryHasAnyLesson(cleanedOld)) {
            transaction.set(oldRegistryRef, { ...cleanedOld, updatedByUid: me.uid, updated_at: now, updatedAt: serverTimestamp() }, { merge: false });
          } else {
            transaction.delete(oldRegistryRef);
          }
        }

        transaction.set(
          registryRef,
          buildLessonRegistryDocument(registryCheck.registryData, lessonId, normalizedPayload, registryKey, lessonNumber, me.uid, now),
          { merge: false },
        );
        transaction.set(target, { ...data, lesson_json: deleteField() }, { merge: true });
        transaction.set(
          lessonContentRef(lessonId),
          buildLessonContentDocument(lessonId, withoutUndefined(lessonJson), normalizedPayload, clean(existingData.createdByUid) || me.uid, now),
          { merge: true },
        );

        const ownerUid = clean(existingData.createdByUid) || me.uid;
        const nextActivities = lessonJson?.schema_version === 'lesson_v3' && Array.isArray(lessonJson.activities)
          ? lessonJson.activities.map((activity: LessonActivityV3, index: number) => buildLessonActivityDocument(lessonId, activity, index, normalizedPayload, ownerUid, now))
          : [];
        const nextActivityIds = new Set(nextActivities.map((item: any) => item.activityId));
        nextActivities.forEach((item: any) => transaction.set(lessonActivityRef(lessonId, item.activityId), item.data, { merge: true }));
        existingActivitySnapshot.docs.forEach((item) => { if (!nextActivityIds.has(item.id)) transaction.delete(item.ref); });
        return row(data, lessonId);
      });
      return updatedRow;
    } catch (error) {
      throw lessonPublishStageError('LESSON_UPDATE', error);
    }
  }

  // V6.77.0: reserve + metadata are atomic. A concurrent publisher never sees
  // a live reservation whose parent is missing. Content still reads an existing parent.
  let registryReserved = false;
  let lessonMetadataCreated = false;
  let lessonContentCreated = false;
  let metadataData: any = null;
  let currentStage: LessonPublishStage = 'REGISTRY_RESERVE';

  try {
    try {
      currentStage = 'REGISTRY_RESERVE';
      await runTransaction(firestoreDb, async (transaction) => {
        const registrySnap = await transaction.get(registryRef);
        const registryData = registrySnap.exists() ? registrySnap.data() as any : {};
        const registryCheck = await repairOrAssertLessonNumberAvailable(
          transaction,
          registryData,
          lessonId,
          clean(normalizedPayload.lop_id),
          normalizedPayload.tieu_de,
        );
        transaction.set(
          registryRef,
          buildLessonRegistryDocument(registryCheck.registryData, lessonId, normalizedPayload, registryKey, lessonNumber, me.uid, now),
          { merge: false },
        );
        metadataData = createMetadata(null);
        assertCanonicalLessonMetadataForWrite(metadataData, lessonId, me.uid);
        transaction.set(target, metadataData);
      });
      registryReserved = true;
      lessonMetadataCreated = true;
    } catch (error) {
      throw lessonPublishStageError('REGISTRY_RESERVE', error);
    }

    try {
      currentStage = 'CONTENT_CREATE';
      const contentData = buildLessonContentDocument(lessonId, withoutUndefined(lessonJson), normalizedPayload, me.uid, now);
      await setDoc(lessonContentRef(lessonId), contentData);
      lessonContentCreated = true;
      await syncLessonActivityDocuments(lessonId, withoutUndefined(lessonJson), normalizedPayload, me.uid, now);
      await updateDoc(target, { content_status: 'ready', updatedAt: serverTimestamp() });
      metadataData.content_status = 'ready';
    } catch (error) {
      throw lessonPublishStageError('CONTENT_CREATE', error);
    }

    return row(metadataData, lessonId);
  } catch (error) {
    const rollbackMessages: string[] = [];
    const originalError = clean((error as any)?.stage)
      ? error
      : lessonPublishStageError('PUBLISH_RUNTIME', error || new Error(`Lỗi không xác định tại ${currentStage}.`));

    // V6.77.0: rollback không được phép che mất lỗi gốc. Theo dõi riêng metadata/content
    // đã tạo để dọn theo đúng trạng thái thực của pipeline.
    if (lessonMetadataCreated) {
      if (lessonContentCreated) {
        try { await deleteLessonActivityDocuments(lessonId); } catch { /* best-effort */ }
        try {
          await deleteDoc(lessonContentRef(lessonId));
          lessonContentCreated = false;
        } catch (rollbackError) {
          rollbackMessages.push(`không xóa được nội dung bài dở dang: ${firebaseErrorMessage(rollbackError)}`);
        }
      } else {
        // setDoc(content) có thể thất bại sau khi request đã rời client; thử dọn best-effort
        // nhưng không xem việc document không tồn tại là lỗi rollback nghiêm trọng.
        try {
          await deleteDoc(lessonContentRef(lessonId));
        } catch {
          // Không làm mất lỗi gốc chỉ vì bước dọn content best-effort thất bại.
        }
      }

      try {
        await deleteDoc(target);
        lessonMetadataCreated = false;
      } catch (rollbackError) {
        rollbackMessages.push(`không xóa được thông tin bài dở dang: ${firebaseErrorMessage(rollbackError)}`);
      }
    }

    if (registryReserved) {
      try {
        await rollbackLessonRegistryReservation(registryRef, lessonId);
        registryReserved = false;
      } catch (rollbackError) {
        rollbackMessages.push(`không khôi phục được danh mục số bài: ${firebaseErrorMessage(rollbackError)}`);
      }
    }

    console.error('[EduSmart][LessonPublish]', {
      lessonId,
      currentStage,
      registryReserved,
      lessonMetadataCreated,
      lessonContentCreated,
      rollbackMessages,
      error: originalError,
    });
    throw lessonPublishErrorWithRollback(originalError, rollbackMessages);
  }
}

type LessonCascadeDeleteSummary = {
  lesson_id: string;
  deleted: boolean;
  deleted_counts: {
    lesson: number;
    content: number;
    registry: number;
    learningProgress: number;
    learningResultActions: number;
    lessonComments: number;
    coLearningSessions: number;
    slidesPrompts: number;
    reviewPractices: number;
    reviewAttempts: number;
    reviewContents: number;
    preLessonProgress: number;
    teachingSessions: number;
    activities: number;
  };
};

export type LessonIntegrityRepairSummary = {
  scanned_registries: number;
  repaired_registries: number;
  deleted_empty_registries: number;
  removed_orphan_references: number;
  normalized_registries: number;
  orphan_lesson_ids: string[];
};

function normalizeRegistryForWrite(data: any, uid: string, fallbackGrade = '') {
  const directLessonNumber = Number(data?.lessonNumber || 0);
  const keyMatch = clean(data?.registryKey).match(/__n(\d+)$/i);
  const keyLessonNumber = keyMatch ? Number(keyMatch[1]) : 0;
  const lessonNumber = Number.isInteger(directLessonNumber) && directLessonNumber > 0
    ? directLessonNumber
    : (Number.isInteger(keyLessonNumber) && keyLessonNumber > 0 ? keyLessonNumber : 1);
  return withoutUndefined({
    ...data,
    schoolId: FIREBASE_SCHOOL_ID,
    schemaVersion: 2,
    grade: clean(data?.grade) || clean(fallbackGrade),
    lessonNumber,
    allOwnerUid: clean(data?.allOwnerUid),
    classOwnerUids: registryClassOwnerMap(data),
    updatedByUid: uid,
    updated_at: new Date().toISOString(),
    updatedAt: serverTimestamp(),
  });
}

/**
 * V6.77.0: công cụ Admin dọn registry mồ côi từ các phiên bản cũ.
 * Chỉ loại reference trỏ tới lesson không còn tồn tại; registry còn reference
 * hợp lệ được giữ lại và chuẩn hóa schemaVersion=2/owner metadata khi có thể.
 */
export async function repairFirebaseLessonIntegrity(): Promise<LessonIntegrityRepairSummary> {
  const me = await identity();
  if (me.role !== 'admin' && me.adminPermission !== true) {
    throw new Error('Chỉ quản trị viên mới được chạy công cụ kiểm tra và sửa dữ liệu bài học toàn trường.');
  }

  const registrySnap = await getDocs(namedCollection('lessonNumberRegistry'));
  const summary: LessonIntegrityRepairSummary = {
    scanned_registries: registrySnap.size,
    repaired_registries: 0,
    deleted_empty_registries: 0,
    removed_orphan_references: 0,
    normalized_registries: 0,
    orphan_lesson_ids: [],
  };

  for (const registryDoc of registrySnap.docs) {
    const original = registryDoc.data() as any;
    const ids = registryLessonIds(original);
    if (!ids.length) {
      await deleteDoc(registryDoc.ref);
      summary.deleted_empty_registries += 1;
      summary.repaired_registries += 1;
      continue;
    }

    const lessonSnaps = await Promise.all(ids.map((lessonId) => getDoc(doc(lessons(), lessonId))));
    const liveById = new Map<string, any>();
    lessonSnaps.forEach((snapshot, index) => {
      if (snapshot.exists()) liveById.set(ids[index], snapshot.data());
    });
    const orphanIds = ids.filter((lessonId) => !liveById.has(lessonId));
    let cleaned = original;
    orphanIds.forEach((lessonId) => { cleaned = removeLessonFromRegistry(cleaned, lessonId); });

    // Bổ sung owner metadata cho các reference còn sống để registry mới tự mô tả rõ ownership.
    const classMap = registryClassMap(cleaned);
    const ownerMap = registryClassOwnerMap(cleaned);
    Object.entries(classMap).forEach(([classId, linkedLessonId]) => {
      const live = liveById.get(clean(linkedLessonId));
      if (live?.createdByUid) ownerMap[classId] = clean(live.createdByUid);
    });
    const allLessonId = clean(cleaned.allLessonId);
    const allOwnerUid = allLessonId ? clean(liveById.get(allLessonId)?.createdByUid || cleaned.allOwnerUid) : '';
    cleaned = { ...cleaned, classOwnerUids: ownerMap, allOwnerUid };

    summary.removed_orphan_references += orphanIds.length;
    summary.orphan_lesson_ids.push(...orphanIds);

    if (!registryHasAnyLesson(cleaned)) {
      await deleteDoc(registryDoc.ref);
      summary.deleted_empty_registries += 1;
      summary.repaired_registries += 1;
      continue;
    }

    const needsNormalization = Number(original.schemaVersion || 0) !== 2
      || clean(original.allOwnerUid) !== allOwnerUid
      || JSON.stringify(registryClassOwnerMap(original)) !== JSON.stringify(ownerMap);
    if (orphanIds.length || needsNormalization) {
      await setDoc(registryDoc.ref, normalizeRegistryForWrite(cleaned, me.uid, clean(cleaned.grade)), { merge: false });
      summary.repaired_registries += 1;
      if (needsNormalization) summary.normalized_registries += 1;
    }
  }

  summary.orphan_lesson_ids = Array.from(new Set(summary.orphan_lesson_ids));
  return summary;
}

function reviewReferencesLesson(data: any, lessonId: string) {
  const raw = data?.lesson_ids;
  const ids = Array.isArray(raw)
    ? raw.map(clean).filter(Boolean)
    : clean(raw).split(',').map(item => item.trim()).filter(Boolean);
  return ids.includes(clean(lessonId));
}

async function commitDeleteRefs(refs: DocumentReference<DocumentData>[]) {
  const unique = Array.from(new Map(refs.map(ref => [ref.path, ref])).values());
  for (let offset = 0; offset < unique.length; offset += 350) {
    const batch = writeBatch(firestoreDb);
    unique.slice(offset, offset + 350).forEach(ref => batch.delete(ref));
    await batch.commit();
  }
  return unique.length;
}

/**
 * V6.71.2: xóa bài học theo thứ tự an toàn.
 * Dữ liệu phụ được xóa trước khi xóa metadata bài học để Firestore Rules vẫn
 * có thể xác minh quyền sở hữu của giáo viên. Lesson document luôn bị xóa cuối.
 */
export async function deleteFirebaseLesson(lessonId: string): Promise<LessonCascadeDeleteSummary | false> {
  const me = await identity();
  const normalizedLessonId = clean(lessonId);
  if (!normalizedLessonId) return false;

  const target = doc(lessons(), normalizedLessonId);
  const lessonSnap = await getDoc(target);
  const lessonExists = lessonSnap.exists();
  const lessonData = lessonExists ? lessonSnap.data() as any : null;
  const isAdminUser = me.role === 'admin' || me.adminPermission === true;

  // Giáo viên chỉ cascade bài thật sự còn tồn tại và do chính mình tạo.
  // Registry mồ côi lịch sử được xử lý tự động khi reserve hoặc bằng công cụ repair Admin.
  if (!lessonExists && !isAdminUser) return false;
  if (lessonExists && me.role === 'teacher' && me.adminPermission !== true) {
    assertTeacherCanManageGrade(me, lessonData?.khoi);
    if (clean(lessonData?.createdByUid) !== clean(me.uid)) {
      throw new Error('Bạn chỉ được xóa bài học do chính mình tạo.');
    }
  }

  const deletedCounts: LessonCascadeDeleteSummary['deleted_counts'] = {
    lesson: 0,
    content: 0,
    registry: 0,
    learningProgress: 0,
    learningResultActions: 0,
    lessonComments: 0,
    coLearningSessions: 0,
    slidesPrompts: 0,
    reviewPractices: 0,
    reviewAttempts: 0,
    reviewContents: 0,
    preLessonProgress: 0,
    teachingSessions: 0,
    activities: 0,
  };

  const lessonGrade = clean(lessonData?.khoi);
  const progressQuery = !isAdminUser && me.role === 'teacher'
    ? query(namedCollection('learningProgress'), where('lesson_id', '==', normalizedLessonId), where('khoi', '==', lessonGrade))
    : query(namedCollection('learningProgress'), where('lesson_id', '==', normalizedLessonId));
  const resultActionQuery = !isAdminUser && me.role === 'teacher'
    ? query(namedCollection('learningResultActions'), where('lesson_id', '==', normalizedLessonId), where('khoi', '==', lessonGrade))
    : query(namedCollection('learningResultActions'), where('lesson_id', '==', normalizedLessonId));
  const [progressSnap, resultActionSnap, commentSnap, coLearningSnap, consentSnap, preLessonSnap, teachingSessionSnap] = await Promise.all([
    getDocs(progressQuery),
    getDocs(resultActionQuery),
    getDocs(query(namedCollection('lessonComments'), where('lesson_id', '==', normalizedLessonId))),
    getDocs(query(namedCollection('coLearningSessions'), where('lesson_id', '==', normalizedLessonId))),
    getDocs(query(namedCollection('coLearningConsents'), where('lessonId', '==', normalizedLessonId))),
    getDocs(query(namedCollection('preLessonProgress'), where('lesson_id', '==', normalizedLessonId))),
    getDocs(query(namedCollection('teachingSessions'), where('lesson_id', '==', normalizedLessonId))),
  ]);

  const promptSnap = isAdminUser
    ? await getDocs(query(namedCollection('slidesPrompts'), where('lesson_id', '==', normalizedLessonId)))
    : await getDocs(query(namedCollection('slidesPrompts'), where('ownerUid', '==', me.uid)));
  const promptDocs = promptSnap.docs.filter(item => clean(item.data().lesson_id) === normalizedLessonId);

  let reviewDocs: QueryDocumentSnapshot<DocumentData>[] = [];
  if (isAdminUser) {
    reviewDocs = (await getDocs(namedCollection('reviewPractices'))).docs;
  } else if (me.role === 'teacher') {
    reviewDocs = (await getDocs(query(
      namedCollection('reviewPractices'),
      where('ownerUid', '==', me.uid),
      where('khoi', '==', lessonGrade),
    ))).docs;
  }
  const relatedReviews = reviewDocs.filter(item => reviewReferencesLesson(item.data(), normalizedLessonId));
  const relatedReviewIds = relatedReviews.map(item => item.id);
  const attemptSnaps = await Promise.all(relatedReviewIds.map(reviewId =>
    getDocs(query(namedCollection('reviewAttempts'), where('review_id', '==', reviewId))),
  ));

  const dependencyRefs: DocumentReference<DocumentData>[] = [];
  progressSnap.docs.forEach(item => dependencyRefs.push(item.ref));
  resultActionSnap.docs.forEach(item => dependencyRefs.push(item.ref));
  commentSnap.docs.forEach(item => dependencyRefs.push(item.ref));
  coLearningSnap.docs.forEach(item => dependencyRefs.push(item.ref));
  consentSnap.docs.forEach(item => dependencyRefs.push(item.ref));
  preLessonSnap.docs.forEach(item => dependencyRefs.push(item.ref));
  teachingSessionSnap.docs.forEach(item => dependencyRefs.push(item.ref));
  promptDocs.forEach(item => dependencyRefs.push(item.ref));
  attemptSnaps.forEach(snap => snap.docs.forEach(item => dependencyRefs.push(item.ref)));
  relatedReviews.forEach(item => {
    dependencyRefs.push(reviewContentRef(item.id));
    dependencyRefs.push(item.ref);
  });

  deletedCounts.learningProgress = progressSnap.size;
  deletedCounts.learningResultActions = resultActionSnap.size;
  deletedCounts.lessonComments = commentSnap.size;
  deletedCounts.coLearningSessions = coLearningSnap.size;
  deletedCounts.preLessonProgress = preLessonSnap.size;
  deletedCounts.teachingSessions = teachingSessionSnap.size;
  deletedCounts.slidesPrompts = promptDocs.length;
  deletedCounts.reviewAttempts = attemptSnaps.reduce((sum, snap) => sum + snap.size, 0);
  deletedCounts.reviewPractices = relatedReviews.length;
  deletedCounts.reviewContents = relatedReviews.length;

  // Dependency xóa trước để Rules vẫn có parent lesson xác minh quyền sở hữu.
  if (dependencyRefs.length) await commitDeleteRefs(dependencyRefs);

  deletedCounts.activities = await deleteLessonActivityDocuments(normalizedLessonId);

  // Xác định registry liên quan trước bước finalization nguyên tử.
  const registryCollection = namedCollection('lessonNumberRegistry');
  let registryItems: Array<{ ref: DocumentReference<DocumentData>; data: () => DocumentData }> = [];
  if (isAdminUser) {
    const registrySnap = await getDocs(registryCollection);
    registryItems = registrySnap.docs.filter(item => registryLessonIds(item.data()).includes(normalizedLessonId));
  } else if (lessonData) {
    const registryKey = clean(lessonData.lesson_key) || lessonRegistryKey(lessonData);
    if (registryKey) {
      const registrySnap = await getDoc(doc(school(), 'lessonNumberRegistry', registryKey));
      if (registrySnap.exists() && registryLessonIds(registrySnap.data()).includes(normalizedLessonId)) {
        registryItems = [registrySnap];
      }
    }
  }

  // V6.77.0: registry + content + parent lesson được finalization trong cùng transaction.
  // Không còn trạng thái card biến mất nhưng registry vẫn giữ số bài.
  await runTransaction(firestoreDb, async (transaction) => {
    const freshRegistrySnaps = [];
    for (const item of registryItems) {
      freshRegistrySnaps.push(await transaction.get(item.ref));
    }

    freshRegistrySnaps.forEach((snapshot, index) => {
      if (!snapshot.exists()) return;
      const cleaned = removeLessonFromRegistry(snapshot.data(), normalizedLessonId);
      const ref = registryItems[index].ref;
      if (registryHasAnyLesson(cleaned)) {
        transaction.set(ref, normalizeRegistryForWrite(cleaned, me.uid, lessonGrade), { merge: false });
      } else {
        transaction.delete(ref);
      }
    });

    // Firestore transaction commit là nguyên tử: content/metadata và registry cùng thành công hoặc cùng rollback.
    transaction.delete(lessonContentRef(normalizedLessonId));
    if (lessonExists) transaction.delete(target);
  });

  deletedCounts.registry = registryItems.length;
  deletedCounts.content = 1;
  deletedCounts.lesson = lessonExists ? 1 : 0;

  // DELETE_VERIFY: xác nhận không registry nào vừa xử lý còn tham chiếu tới lesson ID.
  for (const item of registryItems) {
    const verify = await getDoc(item.ref);
    if (verify.exists() && registryLessonIds(verify.data()).includes(normalizedLessonId)) {
      throw new Error('[DELETE_REGISTRY_VERIFY] Registry vẫn còn tham chiếu bài học sau khi xóa. Hãy chạy công cụ “Kiểm tra dữ liệu bài học”.');
    }
  }
  const verifyLesson = await getDoc(target);
  if (verifyLesson.exists()) {
    throw new Error('[DELETE_LESSON_VERIFY] Thông tin bài học vẫn còn tồn tại sau thao tác xóa.');
  }

  return {
    lesson_id: normalizedLessonId,
    deleted: lessonExists || dependencyRefs.length > 0 || registryItems.length > 0,
    deleted_counts: deletedCounts,
  };
}

function parsePreLessonRanges(value: unknown, fallbackSeconds = 0) {
  const set = new Set<number>();
  if (Array.isArray(value)) {
    value.forEach((token) => {
      const match = clean(token).match(/^(\d+)-(\d+)$/);
      if (!match) return;
      const start = Math.max(0, Number(match[1]));
      const end = Math.max(start, Number(match[2]));
      if (!Number.isFinite(start) || !Number.isFinite(end) || end - start > 21600) return;
      for (let second = start; second <= end; second += 1) set.add(second);
    });
  }
  if (!set.size && fallbackSeconds > 0) {
    const count = Math.max(0, Math.min(21600, Math.floor(Number(fallbackSeconds || 0))));
    for (let second = 0; second < count; second += 1) set.add(second);
  }
  return set;
}

function serializePreLessonRanges(seconds: Set<number>) {
  const values = Array.from(seconds).filter((value) => Number.isInteger(value) && value >= 0).sort((a, b) => a - b);
  if (!values.length) return [] as string[];
  const ranges: string[] = [];
  let start = values[0];
  let end = values[0];
  for (let index = 1; index < values.length; index += 1) {
    const value = values[index];
    if (value <= end + 1) end = value;
    else { ranges.push(`${start}-${end}`); start = value; end = value; }
  }
  ranges.push(`${start}-${end}`);
  return ranges;
}

function mergePreLessonRanges(...sets: Array<Set<number>>) {
  const merged = new Set<number>();
  sets.forEach((set) => set.forEach((value) => merged.add(value)));
  return merged;
}

function preLessonCoveredSeconds(seconds: Set<number>, duration: number) {
  if (duration <= 0) return seconds.size;
  const maxSecond = Math.max(0, Math.ceil(duration) - 1);
  let count = 0;
  seconds.forEach((value) => { if (value <= maxSecond) count += 1; });
  return Math.min(Math.ceil(duration), count);
}

function preLessonPercent(seconds: Set<number>, duration: number, fallbackPercent = 0) {
  if (duration <= 0) return Math.max(0, Math.min(100, Number(fallbackPercent || 0)));
  return Math.max(0, Math.min(100, Math.max(Number(fallbackPercent || 0), Math.round((preLessonCoveredSeconds(seconds, duration) / duration) * 1000) / 10)));
}

function normalizePreLessonProgressData(progressId: string, data: any): PreLessonProgress {
  const duration = Math.max(0, Number(data?.duration_seconds || 0));
  const ranges = parsePreLessonRanges(data?.watched_ranges, Number(data?.watched_seconds || 0));
  const watched = preLessonCoveredSeconds(ranges, duration);
  const percent = preLessonPercent(ranges, duration, Number(data?.watch_percent || 0));
  const preparationStatus = clean(data?.preparation_status) || (data?.video_status === 'completed'
    ? (data?.completed_before_deadline === false ? 'late_completed' : 'prepared')
    : percent > 0 ? 'in_progress' : 'not_started');
  return {
    progress_id: progressId,
    ...data,
    duration_seconds: duration,
    watched_seconds: watched,
    watch_percent: percent,
    playback_seconds: Math.max(Number(data?.playback_seconds || 0), watched),
    last_position_seconds: Math.max(0, Number(data?.last_position_seconds || 0)),
    watched_ranges: serializePreLessonRanges(ranges),
    coverage_model: 'unique_seconds_v1',
    preparation_status: preparationStatus,
    schemaVersion: 4,
  } as unknown as PreLessonProgress;
}

export async function getFirebasePreLessonProgress(lessonId: string): Promise<PreLessonProgress | null> {
  const me = await identity();
  if (me.role !== 'student') return null;
  const normalizedLessonId = clean(lessonId);
  const canonicalRef = preLessonProgressRef(clean(me.userId), normalizedLessonId);
  const candidates: Array<{ id: string; data: any }> = [];

  // V6.78.2: ưu tiên GET canonical document. Rules cho phép chính user sửa document
  // canonical legacy kể cả khi ownerUid/user_id cũ bị thiếu, miễn path vẫn thuộc user.
  try {
    const canonicalSnap = await getDoc(canonicalRef);
    if (canonicalSnap.exists()) candidates.push({ id: canonicalSnap.id, data: canonicalSnap.data() as any });
  } catch {
    // Tiếp tục query legacy theo user_id; không làm playback bị chặn.
  }

  try {
    const snap = await getDocs(query(namedCollection('preLessonProgress'), where('user_id', '==', clean(me.userId))));
    snap.docs
      .filter((item) => clean((item.data() as any).lesson_id) === normalizedLessonId)
      .forEach((item) => {
        if (!candidates.some((candidate) => candidate.id === item.id)) candidates.push({ id: item.id, data: item.data() as any });
      });
  } catch {
    // Canonical GET phía trên vẫn đủ cho dữ liệu mới; legacy query chỉ là fallback/migration.
  }

  if (!candidates.length) return null;
  const normalized = candidates.map((item) => normalizePreLessonProgressData(item.id, item.data));
  normalized.sort((a, b) => Number(b.watch_percent || 0) - Number(a.watch_percent || 0)
    || Number(b.watched_seconds || 0) - Number(a.watched_seconds || 0));
  return normalized[0];
}

export async function saveFirebasePreLessonProgress(lessonId: string, patch: Partial<PreLessonProgress>): Promise<PreLessonProgress> {
  const me = await identity();
  if (me.role !== 'student') throw new Error('Chỉ học sinh mới ghi tiến độ video trước bài.');
  const normalizedLessonId = clean(lessonId);
  const lessonSnap = await getDoc(doc(lessons(), normalizedLessonId));
  if (!lessonSnap.exists()) throw new Error('Không tìm thấy bài học.');
  const lessonData = lessonSnap.data() as any;
  if (!matchesMemberAudience(lessonData, me)) throw new Error('Video trước bài không thuộc phạm vi lớp/khối của em.');
  if (lessonData.pre_lesson_enabled === false || !clean(lessonData.intro_video_url || lessonData.intro_video_embed_url)) throw new Error('Bài học chưa bật nhiệm vụ video trước bài.');

  const now = new Date().toISOString();
  const threshold = Math.max(50, Math.min(100, Number(lessonData.pre_lesson_completion_threshold || 80)));
  const deadlineRaw = clean(lessonData.pre_lesson_deadline || lessonData.thoi_gian_bat_dau);
  const deadlineMs = deadlineRaw ? new Date(deadlineRaw).getTime() : NaN;
  const ref = preLessonProgressRef(clean(me.userId), normalizedLessonId);

  let canonicalData: any = {};
  try {
    const canonicalSnap = await getDoc(ref);
    if (canonicalSnap.exists()) canonicalData = canonicalSnap.data() as any;
  } catch { /* Rules V6.78.2 vẫn cho create nếu document chưa tồn tại. */ }

  let legacyBest: any = {};
  try {
    const ownedProgressSnap = await getDocs(query(namedCollection('preLessonProgress'), where('user_id', '==', clean(me.userId))));
    const matchingProgress = ownedProgressSnap.docs
      .filter((item) => clean((item.data() as any).lesson_id) === normalizedLessonId)
      .sort((a, b) => Number((b.data() as any).watch_percent || 0) - Number((a.data() as any).watch_percent || 0)
        || Number((b.data() as any).watched_seconds || 0) - Number((a.data() as any).watched_seconds || 0));
    legacyBest = matchingProgress[0]?.data() as any || {};
  } catch { /* no-op */ }

  const currentData = Number(canonicalData.watch_percent || 0) >= Number(legacyBest.watch_percent || 0) ? canonicalData : legacyBest;
  const duration = Math.max(Number(currentData.duration_seconds || 0), Number(patch.duration_seconds || 0));
  const currentRanges = parsePreLessonRanges(currentData.watched_ranges, Number(currentData.watched_seconds || 0));
  const patchRanges = parsePreLessonRanges(patch.watched_ranges, Number(patch.watched_seconds || 0));
  const mergedRanges = mergePreLessonRanges(currentRanges, patchRanges);
  const watched = preLessonCoveredSeconds(mergedRanges, duration);
  const percent = preLessonPercent(mergedRanges, duration, Math.max(Number(currentData.watch_percent || 0), Number(patch.watch_percent || 0)));
  const wasCompleted = currentData.video_status === 'completed' || Number(currentData.watch_percent || 0) >= threshold;
  const completed = wasCompleted || percent >= threshold || patch.video_status === 'completed';
  const firstCompletionBeforeDeadline = Number.isNaN(deadlineMs) ? true : Date.now() <= deadlineMs;
  const completedBeforeDeadline = wasCompleted
    ? currentData.completed_before_deadline !== false
    : completed ? firstCompletionBeforeDeadline : false;
  const preparationStatus = completed
    ? (completedBeforeDeadline ? 'prepared' : 'late_completed')
    : percent > 0 ? 'in_progress' : 'not_started';

  const data = withoutUndefined({
    ...canonicalData,
    ...currentData,
    schoolId: FIREBASE_SCHOOL_ID,
    schemaVersion: 4,
    lesson_id: normalizedLessonId,
    user_id: clean(me.userId),
    ownerUid: clean(me.uid),
    khoi: clean(me.grade),
    lop_id: clean(me.classId),
    video_status: completed ? 'completed' : percent > 0 ? 'in_progress' : 'not_started',
    preparation_status: preparationStatus,
    duration_seconds: duration,
    watched_seconds: watched,
    watch_percent: percent,
    playback_seconds: Math.max(Number(canonicalData.playback_seconds || 0), Number(currentData.playback_seconds || 0), Number(patch.playback_seconds || 0), watched),
    last_position_seconds: Math.max(0, Number(patch.last_position_seconds ?? currentData.last_position_seconds ?? canonicalData.last_position_seconds ?? 0)),
    watched_ranges: serializePreLessonRanges(mergedRanges),
    coverage_model: 'unique_seconds_v1',
    started_at: clean(currentData.started_at) || clean(canonicalData.started_at) || clean(patch.started_at) || (percent > 0 ? now : ''),
    last_watched_at: now,
    completed_at: completed ? (clean(currentData.completed_at) || clean(canonicalData.completed_at) || now) : '',
    completed_before_deadline: completed ? completedBeforeDeadline : false,
    updated_at: now,
    updatedAt: serverTimestamp(),
  });
  await setDoc(ref, data, { merge: true });
  return normalizePreLessonProgressData(ref.id, data);
}

export async function listFirebasePreLessonProgress(filters: Record<string, unknown> = {}): Promise<PreLessonProgress[]> {
  const me = await identity();
  const base = namedCollection('preLessonProgress');
  let docs: QueryDocumentSnapshot<DocumentData>[] = [];
  const filterLessonId = clean(filters.lesson_id);
  const filterUserId = clean(filters.user_id);
  const filterClassId = clean(filters.lop_id);
  const filterGrade = clean(filters.khoi);

  if (me.role === 'admin' || me.adminPermission === true) {
    let target: any = base;
    if (filterUserId) target = query(base, where('user_id', '==', filterUserId));
    else if (filterLessonId) target = query(base, where('lesson_id', '==', filterLessonId));
    else if (filterClassId) target = query(base, where('lop_id', '==', filterClassId));
    else if (filterGrade) target = query(base, where('khoi', '==', filterGrade));
    docs = (await getAllQueryDocs(target as any)).docs;
  } else if (me.role === 'teacher') {
    let grades = await teacherQueryGrades(me);
    if (filterGrade) grades = grades.filter((grade) => sameGrade(grade, filterGrade));
    const snaps = await Promise.all(grades.map((grade) => {
      const constraints: any[] = [where('khoi', '==', grade)];
      if (filterUserId) constraints.push(where('user_id', '==', filterUserId));
      else if (filterLessonId) constraints.push(where('lesson_id', '==', filterLessonId));
      else if (filterClassId) constraints.push(where('lop_id', '==', filterClassId));
      return getAllQueryDocs(query(base, ...constraints));
    }));
    const merged = new Map<string, QueryDocumentSnapshot<DocumentData>>();
    snaps.forEach((snap) => snap.docs.forEach((item) => merged.set(item.id, item)));
    docs = Array.from(merged.values());
  } else {
    docs = (await getAllQueryDocs(query(base, where('user_id', '==', clean(me.userId))))).docs;
  }
  const filtered = docs.map((item) => normalizePreLessonProgressData(item.id, item.data() as any)).filter((item) => {
    if (filterLessonId && clean(item.lesson_id) !== filterLessonId) return false;
    if (filterUserId && clean(item.user_id) !== filterUserId) return false;
    if (filterClassId && clean(item.lop_id) !== filterClassId) return false;
    if (filterGrade && !sameGrade(item.khoi, filterGrade)) return false;
    return true;
  });
  // Dữ liệu legacy có thể có nhiều document cho cùng user + lesson. Chỉ giữ
  // bản ghi tiến độ cao nhất để thống kê giáo viên không bị nhân đôi học sinh.
  const deduped = new Map<string, PreLessonProgress>();
  filtered.forEach((item) => {
    const key = `${clean(item.user_id)}::${clean(item.lesson_id)}`;
    const previous = deduped.get(key);
    if (!previous
      || Number(item.watch_percent || 0) > Number(previous.watch_percent || 0)
      || (Number(item.watch_percent || 0) === Number(previous.watch_percent || 0)
        && Number(item.watched_seconds || 0) > Number(previous.watched_seconds || 0))) {
      deduped.set(key, item);
    }
  });
  return Array.from(deduped.values());
}

export async function getFirebaseTeachingSession(lessonId: string, classId?: string): Promise<TeachingSession | null> {
  const me = await identity();
  const resolvedClassId = clean(classId || me.classId);
  if (!resolvedClassId) return null;
  const snap = await getDoc(teachingSessionRef(clean(lessonId), resolvedClassId));
  return snap.exists() ? ({ session_id: snap.id, ...snap.data() } as unknown as TeachingSession) : null;
}

export function subscribeFirebaseTeachingSession(lessonId: string, classId: string, onChange: (session: TeachingSession | null) => void, onError?: (error: unknown) => void) {
  return onSnapshot(teachingSessionRef(clean(lessonId), clean(classId)), (snapshot) => {
    onChange(snapshot.exists() ? ({ session_id: snapshot.id, ...snapshot.data() } as unknown as TeachingSession) : null);
  }, (error) => onError?.(error));
}

export async function saveFirebaseTeachingSession(lessonId: string, classId: string, patch: Partial<TeachingSession>): Promise<TeachingSession> {
  const me = await identity();
  if (me.role === 'student') throw new Error('Học sinh không được điều khiển hoạt động dạy học.');
  const lessonSnap = await getDoc(doc(lessons(), clean(lessonId)));
  if (!lessonSnap.exists()) throw new Error('Không tìm thấy bài học.');
  const lessonData = lessonSnap.data() as any;
  if (me.role === 'teacher' && me.adminPermission !== true) assertTeacherCanManageGrade(me, lessonData.khoi);
  const resolvedClassId = clean(classId || lessonData.lop_id);
  if (!resolvedClassId) throw new Error('Hãy chọn lớp trước khi bắt đầu điều khiển hoạt động.');
  const now = new Date().toISOString();
  const ref = teachingSessionRef(clean(lessonId), resolvedClassId);
  const currentSnap = await getDoc(ref);
  const current = currentSnap.exists() ? currentSnap.data() as any : {};
  const released = Array.isArray(patch.released_activity_ids)
    ? Array.from(new Set(patch.released_activity_ids.map(clean).filter(Boolean)))
    : Array.from(new Set((Array.isArray(current.released_activity_ids) ? current.released_activity_ids : []).map(clean).filter(Boolean)));
  const data = withoutUndefined({
    ...current,
    ...patch,
    schoolId: FIREBASE_SCHOOL_ID,
    schemaVersion: 3,
    lesson_id: clean(lessonId),
    class_id: resolvedClassId,
    grade: clean(lessonData.khoi),
    status: patch.status || current.status || 'live',
    released_activity_ids: released,
    started_at: clean(current.started_at) || now,
    updated_at: now,
    updated_by_uid: clean(me.uid),
    updated_by_name: clean(me.displayName || me.username || me.userId),
    updatedAt: serverTimestamp(),
  });
  await setDoc(ref, data, { merge: true });
  return { session_id: ref.id, ...data } as unknown as TeachingSession;
}

export async function setFirebaseTeachingActivityAccess(lessonId: string, classId: string, activityId: string, open: boolean, pageId = ''): Promise<TeachingSession> {
  const me = await identity();
  if (me.role === 'student') throw new Error('Học sinh không được mở hoặc khóa mục học tập.');
  const lessonSnap = await getDoc(doc(lessons(), clean(lessonId)));
  if (!lessonSnap.exists()) throw new Error('Không tìm thấy bài học.');
  const lessonData = lessonSnap.data() as any;
  if (me.role === 'teacher' && me.adminPermission !== true) assertTeacherCanManageGrade(me, lessonData.khoi);
  const resolvedClassId = clean(classId || lessonData.lop_id);
  const normalizedActivityId = clean(activityId);
  if (!resolvedClassId || !normalizedActivityId) throw new Error('Thiếu lớp hoặc mục học tập cần cập nhật.');
  const ref = teachingSessionRef(clean(lessonId), resolvedClassId);
  const currentSnap = await getDoc(ref);
  const current = currentSnap.exists() ? currentSnap.data() as any : {};
  const released = new Set((Array.isArray(current.released_activity_ids) ? current.released_activity_ids : []).map(clean).filter(Boolean));
  if (open) released.add(normalizedActivityId); else released.delete(normalizedActivityId);
  const currentActivity = clean(current.current_activity_id);
  const nextCurrentActivity = open ? normalizedActivityId : (currentActivity === normalizedActivityId ? '' : currentActivity);
  const now = new Date().toISOString();
  const data = withoutUndefined({
    ...current,
    schoolId: FIREBASE_SCHOOL_ID,
    schemaVersion: 3,
    lesson_id: clean(lessonId),
    class_id: resolvedClassId,
    grade: clean(lessonData.khoi),
    status: 'live',
    current_activity_id: nextCurrentActivity,
    current_page_id: nextCurrentActivity ? (open ? clean(pageId) : clean(current.current_page_id)) : '',
    released_activity_ids: Array.from(released),
    started_at: clean(current.started_at) || now,
    updated_at: now,
    updated_by_uid: clean(me.uid),
    updated_by_name: clean(me.displayName || me.username || me.userId),
    updatedAt: serverTimestamp(),
  });
  await setDoc(ref, data, { merge: true });
  return { session_id: ref.id, ...data } as unknown as TeachingSession;
}

export async function submitFirebaseLessonReview(lessonId: string) {
  const me = await identity();
  const target = doc(lessons(), lessonId);
  const snap = await getDoc(target);
  if (!snap.exists()) return null;
  const current = snap.data() as any;
  if (me.role === 'teacher' && me.adminPermission !== true) {
    assertTeacherCanManageGrade(me, current.khoi);
    if (clean(current.createdByUid) !== clean(me.uid)) {
      throw new Error('Bạn chỉ được gửi duyệt bài học do chính mình tạo.');
    }
  }
  const now = new Date().toISOString();
  await updateDoc(target, { trang_thai: 'pending_review', pham_vi: 'shared', updated_at: now, updatedAt: serverTimestamp() });
  return row({ ...snap.data(), trang_thai: 'pending_review', pham_vi: 'shared', updated_at: now }, lessonId);
}

export async function listFirebaseProgress(filters: Record<string, unknown> = {}) {
  const me = await identity();
  const base = collection(school(), 'learningProgress');
  let docs: QueryDocumentSnapshot<DocumentData>[] = [];

  const filterUserId = clean(filters.user_id);
  const filterLessonId = clean(filters.lesson_id);
  const filterClassId = clean(filters.lop_id);
  const filterGrade = clean(filters.khoi);

  if (me.role === 'admin' || me.adminPermission === true) {
    // V6.78.2: ưu tiên query theo phạm vi đã chọn thay vì full-scan toàn trường.
    // Chỉ khi không có bất kỳ scope nào mới dùng danh sách đầy đủ (phục vụ các
    // tác vụ quản trị đặc biệt có chủ ý).
    let target: any = query(base, orderBy('updated_at', 'desc'));
    if (filterUserId) target = query(base, where('user_id', '==', filterUserId));
    else if (filterLessonId) target = query(base, where('lesson_id', '==', filterLessonId));
    else if (filterClassId) target = query(base, where('lop_id', '==', filterClassId));
    else if (filterGrade) target = query(base, where('khoi', '==', filterGrade));
    const snap = await getAllQueryDocs(target);
    docs = snap.docs;
  } else if (me.role === 'teacher') {
    let grades = await teacherQueryGrades(me);
    if (filterGrade) grades = grades.filter((grade) => sameGrade(grade, filterGrade));
    if (!grades.length) return [];

    const snapshots = await Promise.all(grades.map((grade) => {
      const constraints: any[] = [where('khoi', '==', grade)];
      if (filterUserId) constraints.push(where('user_id', '==', filterUserId));
      else if (filterLessonId) constraints.push(where('lesson_id', '==', filterLessonId));
      else if (filterClassId) constraints.push(where('lop_id', '==', filterClassId));
      return getAllQueryDocs(query(base, ...constraints));
    }));
    const merged = new Map<string, QueryDocumentSnapshot<DocumentData>>();
    snapshots.forEach(snapshot => snapshot.docs.forEach(item => merged.set(item.id, item)));
    docs = Array.from(merged.values()).sort((left, right) =>
      clean((right.data() as any).updated_at).localeCompare(clean((left.data() as any).updated_at)),
    );
  } else {
    const snap = await getAllQueryDocs(query(base, where('ownerUid', '==', me.uid), orderBy('updated_at', 'desc')));
    docs = snap.docs;
  }

  const learningItems = docs.map(item => ({ progress_id: item.id, ...item.data() } as unknown as LessonProgressRecord)).filter(item => {
    if (me.role === 'teacher' && me.adminPermission !== true && !teacherCanManageGrade(me, item.khoi)) return false;
    if (filterUserId && clean(item.user_id) !== filterUserId) return false;
    if (filterLessonId && clean(item.lesson_id) !== filterLessonId) return false;
    if (filterClassId && clean(item.lop_id) !== filterClassId) return false;
    if (filterGrade && !sameGrade(item.khoi, filterGrade)) return false;
    return true;
  });
  const preItems = await listFirebasePreLessonProgress(filters).catch(() => []);
  const byKey = new Map(learningItems.map((item) => [`${clean(item.user_id)}__${clean(item.lesson_id)}`, item]));
  preItems.forEach((pre) => {
    const key = `${clean(pre.user_id)}__${clean(pre.lesson_id)}`;
    const existing = byKey.get(key);
    const patch = {
      pre_lesson_status: pre.video_status,
      pre_lesson_watch_percent: Number(pre.watch_percent || 0),
      pre_lesson_watched_seconds: Number(pre.watched_seconds || 0),
      pre_lesson_completed_at: clean(pre.completed_at),
      pre_lesson_completed_before_deadline: pre.completed_before_deadline === true,
      pre_lesson_preparation_status: pre.preparation_status,
    };
    if (existing) Object.assign(existing, patch);
    else byKey.set(key, {
      progress_id: `PRE_${pre.progress_id}`,
      user_id: clean(pre.user_id),
      lesson_id: clean(pre.lesson_id),
      lesson_title: '', mon_hoc: '', khoi: clean(pre.khoi), lop_id: clean(pre.lop_id),
      status: 'not_started', completion_percent: 0, completed_steps: 0, total_steps: 0,
      updated_at: clean(pre.last_watched_at || pre.completed_at || pre.started_at),
      step_details: {} as any,
      result_state: 'valid',
      ...patch,
    } as LessonProgressRecord);
  });
  return Array.from(byKey.values());
}

function mergeProgressPayloadMonotonic(current: any, incoming: LessonProgressRecord) {
  const currentSteps = current?.step_details || {};
  const incomingSteps = incoming?.step_details || {};
  const stageKeys = ['khoi_dong', 'hinh_thanh_kien_thuc', 'luyen_tap', 'van_dung', 'tong_ket'];
  const mergedSteps: Record<string, any> = {};
  stageKeys.forEach((stage) => {
    const a = currentSteps?.[stage] || {};
    const b = incomingSteps?.[stage] || {};
    mergedSteps[stage] = {
      ...a,
      ...b,
      opened: Boolean(a.opened || b.opened),
      viewedComplete: Boolean(a.viewedComplete || b.viewedComplete),
      completed: Boolean(a.completed || b.completed),
      percent: Math.max(Number(a.percent || 0), Number(b.percent || 0)),
      quizAnswered: Math.max(Number(a.quizAnswered || 0), Number(b.quizAnswered || 0)),
      quizTotal: Math.max(Number(a.quizTotal || 0), Number(b.quizTotal || 0)),
      quizAnswers: { ...(a.quizAnswers || {}), ...(b.quizAnswers || {}) },
      sectionProgress: stage === 'luyen_tap'
        ? mergeSectionProgressMonotonic(a.sectionProgress || {}, b.sectionProgress || {})
        : (b.sectionProgress || a.sectionProgress),
      finalExam: b.finalExam || a.finalExam,
      lastVisitedAt: clean(b.lastVisitedAt) || clean(a.lastVisitedAt),
    };
  });
  const mergedSectionScores = { ...(current?.section_scores || {}), ...(incoming.section_scores || {}) };
  return withoutUndefined({
    ...current,
    ...incoming,
    step_details: mergedSteps,
    completion_percent: Math.max(Number(current?.completion_percent || 0), Number(incoming.completion_percent || 0)),
    completed_steps: Math.max(Number(current?.completed_steps || 0), Number(incoming.completed_steps || 0)),
    quiz_answered: Math.max(Number(current?.quiz_answered || 0), Number(incoming.quiz_answered || 0)),
    quiz_total: Math.max(Number(current?.quiz_total || 0), Number(incoming.quiz_total || 0)),
    section_scores: mergedSectionScores,
    learning_process_score: Math.max(Number(current?.learning_process_score || 0), Number(incoming.learning_process_score || 0)),
    current_score: Number.isFinite(Number(incoming.current_score)) ? Number(incoming.current_score) : current?.current_score,
    assessment_score: Number.isFinite(Number(incoming.assessment_score)) ? Number(incoming.assessment_score) : current?.assessment_score,
    score_calculated_at: clean(incoming.score_calculated_at) || clean(current?.score_calculated_at),
    last_closed_at: clean(incoming.last_closed_at) || clean(current?.last_closed_at),
  });
}

async function saveFirebaseProgressNow(payload: LessonProgressRecord) {
  const me = await identity();
  const progressId = clean(payload.progress_id) || `${clean(payload.user_id || me.userId)}_${clean(payload.lesson_id)}`;
  const now = new Date().toISOString();
  const resultVersion = Math.max(Number(payload.result_version || 0) + 1, Date.now());
  const commonIncoming = withoutUndefined({
    ...payload,
    progress_id: progressId,
    user_id: clean(payload.user_id || me.userId),
    ownerUid: me.uid,
    khoi: clean(me.grade || payload.khoi),
    lop_id: clean(me.classId || payload.lop_id),
    result_state: 'valid',
    retake_allowed: true,
    result_version: resultVersion,
    schoolId: FIREBASE_SCHOOL_ID,
    schemaVersion: 2,
    storageProvider: 'firebase',
    updated_at: now,
    save_state: 'saved',
  }) as unknown as LessonProgressRecord;

  const sessionId = clean(payload.co_learning_session_id);
  if (payload.study_mode === 'co_learning' && sessionId) {
    const sessionRef = doc(school(), 'coLearningSessions', sessionId);
    const sessionSnap = await getDoc(sessionRef);
    if (!sessionSnap.exists()) throw new Error('Phiên học cùng không còn tồn tại. Hãy mở lại bài học và xác nhận bạn học cùng.');
    const session = sessionSnap.data() as any;
    if (clean(session.lesson_id) !== clean(payload.lesson_id)) throw new Error('Phiên học cùng không thuộc bài học đang mở.');
    if (!['active', 'completed', 'cancelled_retake'].includes(clean(session.status) || 'active')) throw new Error('Phiên học cùng đã bị khóa và không thể tiếp tục.');
    const participants = getCoLearningParticipants(session);
    if (participants.length < 2) throw new Error('Phiên học cùng chưa có đủ thông tin thành viên. Hãy đóng bài và tạo nhóm mới.');
    if (!participants.some((item) => item.uid === clean(me.uid) && item.userId === clean(me.userId))) throw new Error('Tài khoản hiện tại không thuộc nhóm học đã lưu.');

    const participantIds = participants.map((item) => item.userId);
    const participantNames = participants.map((item) => item.name);
    const common = withoutUndefined({
      ...commonIncoming,
      result_group_id: sessionId,
      co_learning_session_id: sessionId,
      co_learner_ids: participantIds.join(','),
      co_learner_user_ids: participantIds,
      co_learner_names: participantNames,
      study_mode: 'co_learning',
    }) as unknown as LessonProgressRecord;
    // V6.78.2: không GET learningProgress của bạn học bằng phiên của host. Rules chỉ
    // cho mỗi học sinh đọc kết quả của chính mình; GET các bạn là nguyên nhân làm
    // thao tác đóng bài học cùng thất bại. Host chỉ đọc document của mình, còn bạn
    // học được batch.set merge trực tiếp với kết quả chung và điểm chuẩn bị cá nhân.
    const ownIndex = participants.findIndex((participant) => participant.uid === clean(me.uid));
    const ownCurrentSnap = ownIndex >= 0
      ? await getDoc(doc(school(), 'learningProgress', `${participants[ownIndex].userId}_${clean(payload.lesson_id)}`)).catch(() => null)
      : null;
    const preparationStatuses = Array.isArray(session.participant_preparation_statuses) ? session.participant_preparation_statuses : [];
    const preparationScores = Array.isArray(session.participant_preparation_scores) ? session.participant_preparation_scores : [];
    const preparationPercents = Array.isArray(session.participant_preparation_watch_percents) ? session.participant_preparation_watch_percents : [];
    const finalStatus = clean(payload.step_details?.luyen_tap?.finalExam?.status);
    const finalSubmitted = ['submitted', 'auto_submitted', 'expired'].includes(finalStatus);
    const preparationWeight = Math.max(0, Math.min(30, Number(payload.preparation_weight || 0)));
    const baseLearningWeight = Math.max(0, Number(payload.learning_component_weight || 40));
    const baseFinalWeight = Math.max(0, Number(payload.final_component_weight || 60));
    const participantAssessmentScores: number[] = [];
    const batch = writeBatch(firestoreDb);
    let ownProgress: LessonProgressRecord | null = null;
    participants.forEach((participant, index) => {
      const participantProgressId = `${participant.userId}_${clean(payload.lesson_id)}`;
      const currentData = participant.uid === clean(me.uid) && ownCurrentSnap?.exists() ? ownCurrentSnap.data() : {};
      const snapshotStatus = clean(preparationStatuses[index]) || (participant.uid === clean(me.uid) ? clean(payload.pre_lesson_preparation_status) : 'unknown');
      // Nhóm legacy chưa có snapshot chuẩn bị được coi là neutral 10/10 để không
      // trừ oan. Nhóm schema 5 trở đi luôn có snapshot do từng bạn tự xác nhận.
      const snapshotScore = Number.isFinite(Number(preparationScores[index]))
        ? Math.max(0, Math.min(10, Number(preparationScores[index])))
        : snapshotStatus === 'prepared' || snapshotStatus === 'unknown' ? 10 : 0;
      const weighted = calculateWeightedAssessmentScore({
        learningProcessScore: Number(payload.learning_process_score || 0),
        finalQuizScore: Number(payload.final_quiz_score || 0),
        finalSubmitted,
        // payload lưu component weights sau khi đã phân bổ preparationWeight; khôi
        // phục tỷ lệ quá trình/cuối bài từ cấu hình nếu có, fallback 40/60.
        learningWeight: Number(baseLearningWeight || 40),
        finalWeight: Number(baseFinalWeight || 60),
        preparationWeight,
        preparationScore: snapshotScore,
      });
      participantAssessmentScores[index] = weighted.score;
      const incoming = {
        ...common,
        progress_id: participantProgressId,
        user_id: participant.userId,
        ownerUid: participant.uid,
        pre_lesson_preparation_status: snapshotStatus === 'unknown' ? undefined : snapshotStatus,
        pre_lesson_status: snapshotStatus === 'prepared' || snapshotStatus === 'late_completed'
          ? 'completed'
          : snapshotStatus === 'in_progress' ? 'in_progress' : snapshotStatus === 'not_started' ? 'not_started' : undefined,
        pre_lesson_completed_before_deadline: snapshotStatus === 'prepared' ? true : snapshotStatus === 'late_completed' ? false : undefined,
        pre_lesson_watch_percent: Number(preparationPercents[index] || 0),
        preparation_score: snapshotScore,
        preparation_weight: preparationWeight,
        learning_component_weight: weighted.learningComponentWeight,
        final_component_weight: weighted.finalComponentWeight,
        current_score: weighted.score,
        assessment_score: weighted.score,
      } as LessonProgressRecord;
      const participantData = participant.uid === clean(me.uid)
        ? mergeProgressPayloadMonotonic(currentData, incoming) as LessonProgressRecord
        : incoming as LessonProgressRecord;
      participantData.section_scores = { ...(incoming.section_scores || {}) };
      participantData.learning_process_score = incoming.learning_process_score;
      participantData.final_quiz_score = incoming.final_quiz_score;
      participantData.current_score = weighted.score;
      participantData.assessment_score = weighted.score;
      participantData.preparation_score = snapshotScore;
      participantData.preparation_weight = preparationWeight;
      participantData.learning_component_weight = weighted.learningComponentWeight;
      participantData.final_component_weight = weighted.finalComponentWeight;
      participantData.score_status = incoming.score_status;
      participantData.score_calculated_at = incoming.score_calculated_at;
      batch.set(doc(school(), 'learningProgress', participantProgressId), { ...participantData, updatedAt: serverTimestamp() }, { merge: true });
      if (participant.uid === clean(me.uid)) ownProgress = participantData;
    });
    batch.set(sessionRef, withoutUndefined({
      status: payload.status === 'completed' ? 'completed' : 'active',
      result_group_id: sessionId,
      result_version: resultVersion,
      assessment_score: ownProgress?.assessment_score ?? payload.assessment_score,
      participant_assessment_scores: participantAssessmentScores,
      completion_percent: payload.completion_percent,
      last_active_by_uid: me.uid,
      last_active_at: now,
      updatedAt: serverTimestamp(),
    }), { merge: true });
    await batch.commit();
    return ownProgress || common;
  }

  const ref = doc(school(), 'learningProgress', progressId);
  const currentSnap = await getDoc(ref);
  const currentData = currentSnap.exists() ? currentSnap.data() : {};
  const incoming = withoutUndefined({
    ...commonIncoming,
    result_group_id: clean(payload.result_group_id) || `${clean(payload.user_id || me.userId)}_${clean(payload.lesson_id)}`,
  }) as unknown as LessonProgressRecord;
  const data = mergeProgressPayloadMonotonic(currentData, incoming) as LessonProgressRecord;
  await setDoc(ref, { ...data, updatedAt: serverTimestamp() }, { merge: true });
  return data;
}

const progressSaveQueues = new Map<string, Promise<unknown>>();

export async function saveFirebaseProgress(payload: LessonProgressRecord) {
  const queueKey = clean(payload.co_learning_session_id) || clean(payload.progress_id) || `${clean(payload.user_id)}_${clean(payload.lesson_id)}`;
  const previous = progressSaveQueues.get(queueKey) || Promise.resolve();
  const task = previous.catch(() => undefined).then(() => saveFirebaseProgressNow(payload));
  const tail = task.then(() => undefined, () => undefined);
  progressSaveQueues.set(queueKey, tail);
  try {
    return await task;
  } finally {
    if (progressSaveQueues.get(queueKey) === tail) progressSaveQueues.delete(queueKey);
  }
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
  if (me.role === 'teacher' && me.adminPermission !== true) {
    assertTeacherCanManageGrade(me, target.khoi);
  }
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
    const grades = await teacherQueryGrades(me);
    if (!grades.length) return [me];
    const snapshots = await Promise.all(grades.map(grade => getDocs(query(namedCollection('members'), where('grade', '==', grade)))));
    const byUid = new Map<string, any>();
    snapshots.forEach(snap => snap.docs.forEach(item => byUid.set(item.id, { uid: item.id, ...item.data() })));
    const rows = Array.from(byUid.values());
    if (!rows.some((item: any) => clean(item.uid) === clean(me.uid))) rows.unshift(me);
    return rows;
  }
  const snap = await getDocs(namedCollection('members'));
  return snap.docs.map(item => ({ uid: item.id, ...item.data() }));
}

export async function listFirebaseAccountDirectory() {
  const me = await identity();
  if (me.role === 'student') return [me];

  // Giáo viên (kể cả Tất cả khối) chỉ tải directory học sinh bằng query theo khối.
  // Không đọc toàn members/studentRoster vì các collection còn chứa hồ sơ không có grade.
  const teacherRestricted = me.role === 'teacher' && me.adminPermission !== true;
  const grades = teacherRestricted ? await teacherQueryGrades(me) : [];
  if (teacherRestricted && !grades.length) return [];
  let memberDocs: QueryDocumentSnapshot<DocumentData>[] = [];
  let rosterDocs: QueryDocumentSnapshot<DocumentData>[] = [];
  if (teacherRestricted) {
    const [memberSnapshots, rosterSnapshots] = await Promise.all([
      Promise.all(grades.map(grade => getDocs(query(namedCollection('members'), where('grade', '==', grade))))),
      Promise.all(grades.map(grade => getDocs(query(namedCollection('studentRoster'), where('grade', '==', grade))))),
    ]);
    const memberMap = new Map<string, QueryDocumentSnapshot<DocumentData>>();
    const rosterMap = new Map<string, QueryDocumentSnapshot<DocumentData>>();
    memberSnapshots.forEach(snap => snap.docs.forEach(item => memberMap.set(item.id, item)));
    rosterSnapshots.forEach(snap => snap.docs.forEach(item => rosterMap.set(item.id, item)));
    memberDocs = Array.from(memberMap.values());
    rosterDocs = Array.from(rosterMap.values());
  } else {
    const [memberSnapshot, rosterSnapshot] = await Promise.all([
      getDocs(namedCollection('members')),
      getDocs(namedCollection('studentRoster')),
    ]);
    memberDocs = memberSnapshot.docs;
    rosterDocs = rosterSnapshot.docs;
  }

  const byStudentCode = new Map<string, Record<string, unknown>>();
  const accounts: Record<string, unknown>[] = [];
  rosterDocs.forEach(item => {
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

  memberDocs.forEach(item => {
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

  // V6.68.0: studentRoster là nguồn danh sách lớp đầy đủ. `members` được đọc
  // song song chỉ để bổ sung UID/trạng thái kích hoạt và bao phủ hồ sơ legacy.
  // V6.77.0: hồ sơ/roster legacy có thể lưu grade dạng number trong khi
  // identity mới luôn chuẩn hóa thành string. Đọc cả hai kiểu để danh sách học
  // cùng không bị rỗng và vẫn giữ query đủ chặt để Firestore Rules chứng minh.
  const gradeVariants: Array<string | number> = [grade];
  const numericGrade = Number(grade);
  if (Number.isInteger(numericGrade) && String(numericGrade) === grade) gradeVariants.push(numericGrade);
  // Mỗi nhánh directory là best-effort. Một query legacy bị permission-denied
  // không được làm hỏng toàn bộ hộp chọn học cùng. Chỉ báo lỗi khi cả roster lẫn
  // members đều không thể đọc.
  const rosterResults = await Promise.allSettled(Array.from(new Set(gradeVariants)).map((gradeValue) => getDocs(query(
    namedCollection('studentRoster'),
    where('role', '==', 'student'),
    where('classId', '==', classId),
    where('grade', '==', gradeValue),
    where('status', '==', 'active'),
  ))));
  const memberResult = await Promise.allSettled([getDocs(query(
    namedCollection('members'),
    where('role', '==', 'student'),
    where('classId', '==', classId),
    where('status', '==', 'active'),
  ))]);
  const rosterSnapshots = rosterResults
    .filter((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof getDocs>>> => result.status === 'fulfilled')
    .map((result) => result.value);
  const memberSnap = memberResult[0]?.status === 'fulfilled' ? memberResult[0].value : null;
  if (!rosterSnapshots.length && !memberSnap) {
    const firstFailure = [...rosterResults, ...memberResult].find((result) => result.status === 'rejected') as PromiseRejectedResult | undefined;
    throw firstFailure?.reason || new Error('Không thể tải danh sách học sinh cùng lớp.');
  }

  const activatedByStudentCode = new Map<string, any>();
  const activatedByUserId = new Map<string, any>();
  memberSnap?.docs.forEach(item => {
    const data = { uid: item.id, ...item.data() } as any;
    const studentCode = clean(data.studentCode || data.username).toLowerCase();
    const userId = clean(data.userId);
    if (studentCode) activatedByStudentCode.set(studentCode, data);
    if (userId) activatedByUserId.set(userId, data);
  });

  const directory = new Map<string, any>();
  rosterSnapshots.forEach((rosterSnap) => rosterSnap.docs.forEach(item => {
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
  }));

  // Hồ sơ legacy có member nhưng thiếu studentRoster vẫn được hiển thị để không
  // làm mất bạn cùng lớp trong giai đoạn chuyển đổi dữ liệu.
  memberSnap?.docs.forEach(item => {
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
  const snap = await getAllQueryDocs(query(namedCollection('coLearningSessions'),
    where('participant_uids', 'array-contains', me.uid), where('lesson_id', '==', clean(lessonId))));
  const candidates = snap.docs
    .map((item) => ({ co_learning_session_id: item.id, session_id: item.id, ...item.data() } as unknown as CoLearningSession))
    .filter((item) => [3, 4, 5].includes(Number((item as any).schemaVersion || 0)) && clean(item.lesson_id) === clean(lessonId))
    .filter((item) => ['active', 'completed', 'cancelled_retake'].includes(clean(item.status) || 'active'))
    .filter((item) => !clean((item as any).lop_id) || clean((item as any).lop_id) === clean(me.classId))
    .sort((a, b) => clean(b.last_active_at || b.started_at).localeCompare(clean(a.last_active_at || a.started_at)));
  return candidates[0] || null;
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

  // V6.68.0: learningProgress và coLearningSessions là snapshot lịch sử.
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
  let snapshots: Awaited<ReturnType<typeof getAllQueryDocs>>[];
  if (me.role === 'admin' || me.adminPermission === true) {
    snapshots = [await getAllQueryDocs(query(base, orderBy('updated_at', 'desc')))];
  } else if (me.role === 'teacher') {
    const grades = await teacherQueryGrades(me);
    if (!grades.length) return [];
    const buildTeacherQueries = (grade: string) => [
      getAllQueryDocs(query(base, where('khoi', '==', grade), where('pham_vi', '==', 'shared'))),
      getAllQueryDocs(query(base, where('khoi', '==', grade), where('ownerUid', '==', me.uid))),
    ];
    snapshots = await Promise.all(grades.flatMap(grade => buildTeacherQueries(grade)));
  } else {
    snapshots = [await getAllQueryDocs(query(
      base,
      where('pham_vi', '==', 'shared'),
      where('trang_thai', '==', 'active')
    ))];
  }
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
    if (me.role === 'teacher' && me.adminPermission !== true && !teacherCanManageGrade(me, item.khoi)) return false;
    if (me.role === 'student' && !matchesMemberAudience(item, me)) return false;
    return true;
  }).sort((left, right) => clean(right.updated_at).localeCompare(clean(left.updated_at)));
}

export async function saveFirebaseReview(payload: Record<string, unknown>) {
  const me = await identity();
  if (me.role === 'teacher' && me.adminPermission !== true) {
    assertTeacherCanManageGrade(me, payload.khoi);
  }
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
  const me = await identity();
  const reviewRef = doc(school(), 'reviewPractices', reviewId);
  const reviewSnap = await getDoc(reviewRef);
  if (!reviewSnap.exists()) return false;
  const review = reviewSnap.data() as any;
  if (me.role === 'teacher' && me.adminPermission !== true) {
    assertTeacherCanManageGrade(me, review.khoi);
    if (clean(review.ownerUid) !== clean(me.uid)) {
      throw new Error('Bạn chỉ được xóa bài ôn tập do chính mình tạo.');
    }
  }
  const attempts = await getDocs(query(namedCollection('reviewAttempts'), where('review_id', '==', reviewId)));
  const batch = writeBatch(firestoreDb);
  attempts.docs.forEach(item => batch.delete(item.ref));
  batch.delete(reviewContentRef(reviewId));
  batch.delete(reviewRef);
  await batch.commit();
  return true;
}

export async function submitFirebaseReviewAttempt(payload: Record<string, unknown>) {
  const me = await identity();
  const attemptId = clean(payload.attempt_id) || id('ATTEMPT');
  const now = new Date().toISOString();
  const reviewId = clean(payload.review_id);
  const reviewSnap = reviewId ? await getDoc(doc(school(), 'reviewPractices', reviewId)) : null;
  if (!reviewSnap?.exists()) throw new Error('Không tìm thấy bài ôn tập trên Firebase.');
  const previousSnap = await getAllQueryDocs(query(
    namedCollection('reviewAttempts'),
    where('ownerUid', '==', me.uid),
    where('review_id', '==', reviewId),
  ));
  const previousCount = previousSnap.size;
  const review = reviewSnap.data() as any;
  const data = withoutUndefined({ ...payload, attempt_id: attemptId, ownerUid: me.uid, user_id: clean(payload.user_id || me.userId),
    lop_id: clean(payload.lop_id || me.classId || review.lop_id), khoi: clean(payload.khoi || me.grade || review.khoi), nam_hoc: clean(payload.nam_hoc || review.nam_hoc), hoc_ky: clean(payload.hoc_ky || review.hoc_ky || 'HK1'),
    so_lan_lam: previousCount + 1, schoolId: FIREBASE_SCHOOL_ID, schemaVersion: 1, submitted_at: clean(payload.submitted_at) || now, updatedAt: serverTimestamp() });
  assertSafeDocument(data, 'Kết quả ôn tập');
  await setDoc(doc(school(), 'reviewAttempts', attemptId), data);
  return data;
}

export async function listFirebaseReviewAttempts(filters: Record<string, unknown>) {
  const me = await identity();
  const reviewId = clean(filters.review_id);
  const base = namedCollection('reviewAttempts');

  if (me.role === 'admin' || me.adminPermission === true) {
    const snap = await getAllQueryDocs(reviewId
      ? query(base, where('review_id', '==', reviewId))
      : query(base));
    return snap.docs.map(item => ({ attempt_id: item.id, ...item.data() }));
  }

  if (me.role === 'teacher') {
    // Kết quả ôn tập luôn được mở theo một bài ôn tập cụ thể. Xác minh bài đó
    // thuộc phạm vi khối được giao trước khi query attempts để Rules không phải
    // chấp nhận một truy vấn rộng trên toàn trường.
    if (!reviewId) return [];
    const reviewSnap = await getDoc(doc(school(), 'reviewPractices', reviewId));
    if (!reviewSnap.exists()) return [];
    const review = reviewSnap.data() as any;
    assertTeacherCanManageGrade(me, review.khoi);
    if (clean(review.ownerUid) !== clean(me.uid) && clean(review.pham_vi) !== 'shared') {
      throw new Error('Bạn không có quyền xem kết quả của bài ôn tập riêng tư này.');
    }
    const snap = await getAllQueryDocs(query(base, where('review_id', '==', reviewId)));
    return snap.docs.map(item => ({ attempt_id: item.id, ...item.data() }));
  }

  const snap = await getAllQueryDocs(reviewId
    ? query(base, where('ownerUid', '==', me.uid), where('review_id', '==', reviewId))
    : query(base, where('ownerUid', '==', me.uid)));
  return snap.docs.map(item => ({ attempt_id: item.id, ...item.data() }));
}

export async function saveFirebaseHostConsent(sessionId: string, lessonId: string) {
  const me = await identity();
  const preparation = await getFirebasePreLessonProgress(lessonId).catch(() => null);
  const rawPreparationStatus = clean(preparation?.preparation_status);
  const preparationStatus = ['not_started', 'in_progress', 'prepared', 'late_completed'].includes(rawPreparationStatus)
    ? rawPreparationStatus
    : (Number(preparation?.watch_percent || 0) > 0 ? 'in_progress' : 'not_started');
  const preparationScore = preparationStatus === 'prepared' ? 10 : 0;
  await setDoc(doc(school(), 'coLearningConsents', `${sessionId}_${me.uid}`), {
    schoolId: FIREBASE_SCHOOL_ID, schemaVersion: 1, sessionId, lessonId,
    hostUid: me.uid, ownerUid: me.uid, userId: me.userId, classId: me.classId,
    grade: me.grade, approved: true,
    preparationStatus,
    preparationScore,
    preparationWatchPercent: Math.max(0, Math.min(100, Number(preparation?.watch_percent || 0))),
    createdAt: serverTimestamp(),
  });
}

export async function cleanupFirebaseCoLearningConsents(sessionId: string) {
  const me = await identity();
  const snap = await getDocs(query(namedCollection('coLearningConsents'),
    where('hostUid', '==', me.uid), where('sessionId', '==', sessionId)));
  const batch = writeBatch(firestoreDb);
  snap.docs.forEach(item => batch.delete(item.ref));
  if (snap.docs.length) await batch.commit();
}

// Co-learning sessions ------------------------------------------------------
export async function saveFirebaseCoLearningSession(data: Record<string, unknown>) {
  const me = await identity();
  const sessionId = clean(data.session_id) || id('COLEARN');
  const now = new Date().toISOString();
  const saved = withoutUndefined({ ...data, session_id: sessionId, ownerUid: me.uid, schoolId: FIREBASE_SCHOOL_ID,
    schemaVersion: Number(data.schemaVersion || 5), started_at: clean(data.started_at) || now, verified_at: clean(data.verified_at) || now,
    last_active_at: now, updatedAt: serverTimestamp() });
  await setDoc(doc(school(), 'coLearningSessions', sessionId), saved, { merge: true });
  return saved;
}

export async function getFirebaseCoLearningSession(sessionId: string): Promise<CoLearningSession | null> {
  await identity();
  const snap = await getDoc(doc(school(), 'coLearningSessions', clean(sessionId)));
  return snap.exists() ? ({ co_learning_session_id: snap.id, session_id: snap.id, ...snap.data() } as unknown as CoLearningSession) : null;
}

export async function markFirebaseCoLearningSessionSuperseded(sessionId: string, newSessionId: string) {
  const me = await identity();
  const ref = doc(school(), 'coLearningSessions', clean(sessionId));
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data() as any;
  if (!Array.isArray(data.participant_uids) || !data.participant_uids.map(clean).includes(clean(me.uid))) throw new Error('Tài khoản hiện tại không thuộc nhóm học cũ.');
  await updateDoc(ref, withoutUndefined({
    status: 'superseded',
    superseded_by_session_id: clean(newSessionId),
    membership_updated_at: new Date().toISOString(),
    membership_updated_by_uid: clean(me.uid),
    updatedAt: serverTimestamp(),
  }));
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

// V6.78.2: userAIConfigs trong Firestore chỉ còn là vùng legacy để chính
// người dùng đọc một lần và migration API key sang Apps Script PropertiesService.
// Client mới tuyệt đối không ghi raw AI key trở lại Firestore.
export async function getFirebaseUserAIConfig() {
  const me = await identity();
  const snap = await getDoc(doc(school(), 'userAIConfigs', me.uid));
  return snap.exists() ? snap.data() : null;
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
