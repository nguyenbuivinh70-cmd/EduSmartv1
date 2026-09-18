import { deleteDoc, deleteField, doc, getDoc, getDocs, getCountFromServer, collection, limit, onSnapshot, orderBy, query, runTransaction, serverTimestamp, setDoc, Timestamp, updateDoc, where, writeBatch } from 'firebase/firestore';
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
  PreLessonSubmission,
  TeachingSession,
  LessonActivityV3,
  LessonRetakeAttempt,
  LessonAccessMode,
  SelfStudyScope,
  ScoreTrackingConfig,
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
import { calculateFairAssessmentScore, mergeSectionProgressMonotonic } from '../utils/learningScoreEngine';
import { firebaseErrorCode } from '../utils/firebaseErrors';

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
const legacyPreLessonSubmissionRef = (userId: string, lessonId: string) => doc(school(), 'preLessonSubmissions', `${userId}_${lessonId}`);
const lessonPreparationSubmissionsCollection = (lessonId: string) => collection(firestoreDb, 'schools', FIREBASE_SCHOOL_ID, 'lessons', lessonId, 'preparationSubmissions');
const lessonPreparationSubmissionRef = (lessonId: string, authUid: string, revision: number) => doc(lessonPreparationSubmissionsCollection(lessonId), `${clean(authUid)}_r${Math.max(1, Math.floor(Number(revision || 1)))}`);
const lessonDeletionJobRef = (lessonId: string) => doc(school(), 'lessonDeletionJobs', clean(lessonId));
const archivedGradeRecordRef = (lessonId: string, progressId: string) => doc(school(), 'archivedGradeRecords', `${clean(lessonId)}__${clean(progressId)}`);
const retakesCollection = (progressId: string) => collection(firestoreDb, 'schools', FIREBASE_SCHOOL_ID, 'learningProgress', progressId, 'retakes');
const retakeRef = (progressId: string, attemptId: string) => doc(firestoreDb, 'schools', FIREBASE_SCHOOL_ID, 'learningProgress', progressId, 'retakes', attemptId);
const reviewContentRef = (reviewId: string) => doc(firestoreDb, 'schools', FIREBASE_SCHOOL_ID, 'reviewPractices', reviewId, 'content', 'main');
const userAISecretRef = (authUid: string) => doc(school(), 'userAISecrets', clean(authUid));
let identityCache: { uid: string; expiresAt: number; value: any } | null = null;
let identityPromise: { uid: string; value: Promise<any> } | null = null;
let bootstrapCache: { uid: string; expiresAt: number; value: Record<string, any[]> } | null = null;
let bootstrapPromise: { uid: string; value: Promise<Record<string, any[]>> } | null = null;
let lessonPublishRulesVerifiedKey = '';
let selfStudyRulesVerifiedKey = '';
const LESSON_PUBLISH_CAPABILITY = 'lesson_publish_v2';
const LESSON_PUBLISH_RULES_LABEL = 'V6.88.17';
const CLASS_SCOPED_SELF_STUDY_CAPABILITY = 'class_scoped_self_study_v5';

function clean(value: unknown) { return value == null ? '' : String(value).trim(); }
function sameGrade(left: unknown, right: unknown) { return clean(left).replace(/\.0+$/, '') === clean(right).replace(/\.0+$/, ''); }
function classComparable(value: unknown) { return clean(value).toLowerCase().replace(/[^a-z0-9]/g, ''); }
function sameClassId(left: unknown, right: unknown) {
  const a = classComparable(left); const b = classComparable(right);
  if (!a || !b) return a === b;
  return a === b || a.endsWith(b) || b.endsWith(a);
}
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
  const matchesMetadata = (!requiredClass || sameClassId(requiredClass, currentClass))
    && (!requiredGrade || sameGrade(requiredGrade, currentGrade));
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
  lessonPublishRulesVerifiedKey = '';
  selfStudyRulesVerifiedKey = '';
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
    access_mode: data.access_mode === 'self_study' ? 'self_study' : 'teacher_controlled',
    self_study_scope: data.self_study_scope === 'classes' || data.self_study_scope === 'all' || data.self_study_scope === 'none'
      ? data.self_study_scope
      : (data.access_mode === 'self_study' ? 'all' : 'none'),
    self_study_class_ids: cleanStringList(data.self_study_class_ids),
    self_study_class_access_keys: cleanStringList(data.self_study_class_access_keys),
    self_study_access_version: Number.isFinite(Number(data.self_study_access_version)) ? Number(data.self_study_access_version) : undefined,
    allow_retake_after_completion: data.allow_retake_after_completion === true,
    locked_at: clean(data.locked_at), locked_by_uid: clean(data.locked_by_uid), locked_by_name: clean(data.locked_by_name),
    intro_video_url: clean(data.intro_video_url), intro_video_embed_url: clean(data.intro_video_embed_url),
    pre_lesson_enabled: data.pre_lesson_enabled !== false && Boolean(clean(data.intro_video_url || data.intro_video_embed_url)),
    pre_lesson_allow_when_locked: data.pre_lesson_allow_when_locked !== false,
    pre_lesson_required: data.pre_lesson_required === true,
    pre_lesson_completion_threshold: Number.isFinite(Number(data.pre_lesson_completion_threshold)) ? Number(data.pre_lesson_completion_threshold) : 80,
    pre_lesson_deadline: clean(data.pre_lesson_deadline),
    pre_lesson_video_revision: Number.isFinite(Number(data.pre_lesson_video_revision)) ? Math.max(1, Math.floor(Number(data.pre_lesson_video_revision))) : 1,
    // V6.79.0: theo dõi chuẩn bị độc lập, không tính vào điểm bài học.
    pre_lesson_score_enabled: false,
    pre_lesson_score_weight: 0,
    content_schema_version: clean(data.content_schema_version || data.lesson_schema_version) as any,
    builder_settings: data.builder_settings && typeof data.builder_settings === 'object' ? data.builder_settings as any : undefined,
    created_at: clean(data.created_at), updated_at: clean(data.updated_at),
  };
}


function resolveSelfStudyScope(data: any): SelfStudyScope {
  if (data?.self_study_scope === 'classes' || data?.self_study_scope === 'all' || data?.self_study_scope === 'none') return data.self_study_scope;
  return clean(data?.access_mode) === 'self_study' ? 'all' : 'none';
}

function selfStudyEnabledForClass(data: any, classId: unknown) {
  const scope = resolveSelfStudyScope(data);
  if (scope === 'all') return true;
  if (scope !== 'classes') return false;
  const normalizedClass = clean(classId);
  const configured = [
    ...cleanStringList(data?.self_study_class_ids),
    ...cleanStringList(data?.self_study_class_access_keys),
  ];
  return Boolean(normalizedClass && configured.some((item) => sameClassId(item, normalizedClass)));
}

function rowForViewer(data: any, id: string, me: any): LessonRow {
  const base = row(data, id);
  if (me?.role !== 'student') return base;
  const enabled = selfStudyEnabledForClass(data, me.classId);
  return {
    ...base,
    access_mode: enabled ? 'self_study' : 'teacher_controlled',
    self_study_scope: resolveSelfStudyScope(data),
    self_study_class_ids: cleanStringList(data?.self_study_class_ids),
    self_study_class_access_keys: cleanStringList(data?.self_study_class_access_keys),
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
    lesson: rowForViewer(item.data(), item.id, me),
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
    if (me.role === 'student') {
      if (source.content_status === 'preparing') return false;
      // V6.88.10: một lớp được giáo viên mở tự học là một phạm vi truy cập rõ
      // ràng. Không để metadata lớp/khối legacy trên lesson/member làm thẻ bài bị
      // ẩn dù giáo viên đã chọn đúng lớp trong Quản lý tự học.
      if (!matchesMemberAudience(source, me) && !selfStudyEnabledForClass(source, me.classId)) return false;
    }
    return true;
  }).map(({ lesson }) => lesson)
    .sort((left, right) => clean(right.updated_at).localeCompare(clean(left.updated_at)));
}


export async function getFirebaseLesson(lessonId: string, selfStudyRetry = 0): Promise<LessonContentResponse | null> {
  const me = await identity();
  let metadataSnap;
  try {
    metadataSnap = await getDoc(doc(lessons(), lessonId));
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: unknown }).code || '') : '';
    if (code === 'permission-denied' || code === 'firestore/permission-denied') {
      throw Object.assign(new Error('Chưa thể mở bài học lúc này. Em hãy tải lại danh sách bài học và thử lại.'), { diagnosticCode: 'LESSON_METADATA_READ_DENIED' });
    }
    throw error;
  }
  if (!metadataSnap.exists()) return null;
  const data = metadataSnap.data() as any;
  const lesson = rowForViewer(data, metadataSnap.id, me);
  if (me.role === 'student') {
    const selfStudyAccess = selfStudyEnabledForClass(data, me.classId);
    if (!matchesMemberAudience(data, me) && !selfStudyAccess) {
      throw new Error('Bài học hiện chưa được mở cho lớp của em. Em hãy tải lại danh sách bài học hoặc liên hệ giáo viên.');
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
        const selfStudy = selfStudyEnabledForClass(data, me.classId);
        const classId = clean(me.classId);
        // V6.84.11: tự học không phụ thuộc teachingSession hoặc learningProgress.
        // Hai document này thuộc luồng giáo viên điều khiển/xem lại kết quả; đọc chúng
        // trước activity vừa tốn Firestore reads vừa khiến hồ sơ legacy dễ phát sinh
        // permission-denied không liên quan đến quyền tự học.
        const session = !selfStudy && classId
          ? await getFirebaseTeachingSession(lessonId, classId).catch(() => null)
          : null;
        let completedOfficialAccess = false;
        if (!selfStudy && clean(me.userId)) {
          const officialSnap = await getDoc(doc(school(), 'learningProgress', `${clean(me.userId)}_${clean(lessonId)}`)).catch(() => null);
          const official = officialSnap?.exists() ? officialSnap.data() as any : null;
          completedOfficialAccess = Boolean(official && (
            clean(official.score_status) === 'finalized'
            || (clean(official.status) === 'completed' && Number.isFinite(Number(official.assessment_score)))
          ));
        }
        const releasedIds = new Set((session?.released_activity_ids || []).map(clean).filter(Boolean));
        const selfStudyLoadErrors: string[] = [];
        const activityDocs = await Promise.all(manifest.map(async (activity, index) => {
          const activityId = clean(activity?.activity_id) || `A${index + 1}`;
          const canOpen = selfStudy || completedOfficialAccess || releasedIds.has(activityId);
          if (!canOpen) return { ...activity, activity_id: activityId, released: false, locked: true, pages: [], interactions: [] };
          try {
            const snap = await getDoc(lessonActivityRef(lessonId, activityId));
            if (snap.exists()) return { ...snap.data(), activity_id: activityId, released: true, locked: false };
            // Manifest lesson_v3 chỉ chứa tiêu đề/tóm tắt. Với tự học, thiếu activity
            // document là dữ liệu không đầy đủ và không được giả vờ hiển thị bài rỗng.
            if (selfStudy) selfStudyLoadErrors.push(`${activityId}:missing`);
            return { ...activity, activity_id: activityId, released: true, locked: false };
          } catch (error) {
            if (selfStudy) {
              const code = typeof error === 'object' && error && 'code' in error
                ? String((error as { code?: unknown }).code || '')
                : 'load-failed';
              selfStudyLoadErrors.push(`${activityId}:${code || 'load-failed'}`);
            }
            return { ...activity, activity_id: activityId, released: false, locked: true, pages: [], interactions: [] };
          }
        }));
        if (selfStudy && selfStudyLoadErrors.length) {
          const denied = selfStudyLoadErrors.filter((item) => item.includes('permission-denied'));
          if (denied.length === selfStudyLoadErrors.length) {
            // V6.88.17: một lần làm mới danh tính/token trước khi kết luận quyền tự học
            // bị từ chối. Điều này xử lý phiên học sinh còn cache classId cũ sau khi
            // roster/member vừa được đồng bộ mà không làm lặp request vô hạn.
            if (selfStudyRetry < 1) {
              try {
                clearFirebaseIdentityCache();
                await firebaseAuth.currentUser?.getIdToken(true);
                await identity();
                return await getFirebaseLesson(lessonId, selfStudyRetry + 1);
              } catch (retryError) {
                console.warn('[EduSmart][SelfStudy] Identity refresh retry did not restore activity access', {
                  lessonId,
                  error: firebaseErrorMessage(retryError),
                });
              }
            }
            throw Object.assign(new Error('Chưa thể mở đầy đủ nội dung tự học lúc này. Em hãy tải lại bài học và thử lại.'), {
              diagnosticCode: 'SELF_STUDY_ACTIVITY_READ_DENIED',
              technicalDetail: [
                selfStudyLoadErrors.join(', '),
                `class=${clean(me.classId)}`,
                `scope=${resolveSelfStudyScope(data)}`,
                `ids=${cleanStringList(data.self_study_class_ids).join('|')}`,
                `keys=${cleanStringList(data.self_study_class_access_keys).join('|')}`,
                `accessV=${Number(data.self_study_access_version || 0)}`,
              ].join('; '),
            });
          }
          throw Object.assign(new Error('Một số nội dung của bài học chưa tải xong. Em hãy tải lại bài học và thử lại.'), { diagnosticCode: 'SELF_STUDY_ACTIVITY_LOAD_INCOMPLETE', technicalDetail: selfStudyLoadErrors.join(', ') });
        }
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
      throw Object.assign(new Error('Nội dung bài học chưa tải được đầy đủ. Em hãy tải lại bài học và thử lại.'), { diagnosticCode: 'LESSON_CONTENT_READ_DENIED' });
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

async function verifyClassScopedSelfStudyRulesCapability(uid: string, grade: unknown) {
  const normalizedUid = clean(uid);
  const normalizedGrade = clean(grade).replace(/\.0+$/, '');
  if (!normalizedUid || !normalizedGrade) {
    throw new Error('Không xác định được tài khoản/khối để kiểm tra quyền mở tự học theo lớp.');
  }
  const capabilityKey = `${normalizedUid}|${normalizedGrade}|${CLASS_SCOPED_SELF_STUDY_CAPABILITY}`;
  if (selfStudyRulesVerifiedKey === capabilityKey) return;

  const probeRef = doc(school(), 'rulesProbes', normalizedUid);
  try {
    await setDoc(probeRef, {
      schoolId: FIREBASE_SCHOOL_ID,
      ownerUid: normalizedUid,
      capability: CLASS_SCOPED_SELF_STUDY_CAPABILITY,
      purpose: 'class-scoped-self-study-capability',
      schemaVersion: 1,
      khoi: normalizedGrade,
      updatedAt: serverTimestamp(),
    }, { merge: false });
    selfStudyRulesVerifiedKey = capabilityKey;
  } catch (error) {
    if (firebaseErrorCode(error).includes('permission-denied')) {
      throw Object.assign(new Error('Chưa thể cập nhật phạm vi tự học theo lớp. Vui lòng tải lại và thử lại.'), { diagnosticCode: 'SELF_STUDY_RULES_CAPABILITY_DENIED' });
    }
    throw error;
  }

  try {
    await deleteDoc(probeRef);
  } catch (cleanupError) {
    console.warn('[EduSmart][SelfStudy] Capability probe cleanup skipped', {
      capability: CLASS_SCOPED_SELF_STUDY_CAPABILITY,
      grade: normalizedGrade,
      error: firebaseErrorMessage(cleanupError),
    });
  }
}

async function resolveSelfStudyClassAccessKeys(classIds: string[]) {
  const keys = new Set<string>();
  const normalizedIds = Array.from(new Set(classIds.map(clean).filter(Boolean)));
  await Promise.all(normalizedIds.map(async (classId) => {
    keys.add(classId);
    // Alias rút gọn phổ biến: L9_C3 -> 9C3. Chỉ dùng làm khóa tương thích,
    // không thay ID kỹ thuật đang lưu trong dữ liệu.
    const compact = classId.toUpperCase().match(/^L?(\d+)[_\-\s]*C?(\d+)$/);
    if (compact) keys.add(`${compact[1]}C${compact[2]}`);
    try {
      const classSnap = await getDoc(doc(school(), 'classes', classId));
      if (!classSnap.exists()) return;
      const classData = classSnap.data() as any;
      [classData?.lop_id, classData?.ten_lop].map(clean).filter(Boolean).forEach((value) => keys.add(value));
    } catch { /* alias lookup is best effort; ID canonical vẫn được giữ */ }
  }));
  return Array.from(keys);
}

export async function setFirebaseLessonSelfStudyAccess(lessonId: string, scope: SelfStudyScope, classIds: string[] = []) {
  const me = await identity();
  const target = doc(lessons(), clean(lessonId));
  const snap = await getDoc(target);
  if (!snap.exists()) throw new Error('Không tìm thấy bài học cần cập nhật.');
  const current = snap.data() as any;
  if (me.role === 'teacher' && me.adminPermission !== true) assertTeacherCanManageGrade(me, current.khoi);
  const isOwnerTeacher = me.role === 'teacher' && clean(current.createdByUid) === clean(me.uid);
  if (!(me.role === 'admin' || me.adminPermission === true || isOwnerTeacher)) {
    throw new Error('Bạn không có quyền thay đổi phạm vi tự học của bài học này.');
  }
  const normalizedScope: SelfStudyScope = scope === 'all' ? 'all' : scope === 'classes' ? 'classes' : 'none';
  const normalizedClassIds = Array.from(new Set((classIds || []).map(clean).filter(Boolean)));
  if (normalizedScope === 'classes' && !normalizedClassIds.length) throw new Error('Hãy chọn ít nhất một lớp để mở tự học.');
  if (normalizedScope === 'classes') {
    await verifyClassScopedSelfStudyRulesCapability(me.uid, current.khoi);
  }
  const classAccessKeys = normalizedScope === 'classes'
    ? await resolveSelfStudyClassAccessKeys(normalizedClassIds)
    : [];
  const now = new Date().toISOString();
  const patch = withoutUndefined({
    self_study_scope: normalizedScope,
    self_study_class_ids: normalizedScope === 'classes' ? normalizedClassIds : [],
    self_study_class_access_keys: classAccessKeys,
    self_study_access_version: 5,
    access_mode: normalizedScope === 'all' ? 'self_study' : 'teacher_controlled',
    updated_at: now,
    updatedAt: serverTimestamp(),
  });
  await updateDoc(target, patch);
  return row({ ...current, ...patch }, snap.id);
}

export async function setFirebaseLessonAccessMode(lessonId: string, mode: LessonAccessMode) {
  return setFirebaseLessonSelfStudyAccess(lessonId, mode === 'self_study' ? 'all' : 'none', []);
}

export function subscribeFirebaseLessonAccess(
  lessonId: string,
  onChange: (lesson: LessonRow | null) => void,
  onError?: (message: string) => void,
) {
  let cancelled = false;
  let unsubscribe: (() => void) | null = null;
  void identity().then((me) => {
    if (cancelled) return;
    const target = doc(lessons(), clean(lessonId));
    unsubscribe = onSnapshot(target, (snapshot) => {
      onChange(snapshot.exists() ? rowForViewer(snapshot.data(), snapshot.id, me) : null);
    }, (error) => onError?.(firebaseErrorMessage(error)));
  }).catch((error) => onError?.(firebaseErrorMessage(error)));
  return () => { cancelled = true; unsubscribe?.(); };
}

type LessonPublishStage = 'PUBLISH_PREFLIGHT' | 'REGISTRY_RESERVE' | 'LESSON_CREATE' | 'CONTENT_CREATE' | 'PUBLISH_RUNTIME' | 'REGISTRY_ROLLBACK' | 'LESSON_UPDATE';

type LessonPublishDiagnosticCode =
  | 'PUBLISH_AUTH_REQUIRED'
  | 'PUBLISH_ACCOUNT_INACTIVE'
  | 'PUBLISH_PROFILE_INVALID'
  | 'PUBLISH_ROLE_DENIED'
  | 'PUBLISH_GRADE_SCOPE_DENIED'
  | 'PUBLISH_RULES_CAPABILITY_DENIED'
  | 'PUBLISH_NETWORK_ERROR'
  | 'REGISTRY_PERMISSION_DENIED'
  | 'LESSON_CREATE_DENIED'
  | 'CONTENT_CREATE_DENIED'
  | 'LESSON_UPDATE_DENIED';

const LESSON_PUBLISH_STAGE_LABELS: Record<LessonPublishStage, string> = {
  PUBLISH_PREFLIGHT: 'Kiểm tra quyền xuất bản',
  REGISTRY_RESERVE: 'Kiểm tra và giữ số bài',
  LESSON_CREATE: 'Tạo thông tin bài học',
  CONTENT_CREATE: 'Tạo nội dung bài học',
  PUBLISH_RUNTIME: 'Xử lý quy trình xuất bản',
  REGISTRY_ROLLBACK: 'Khôi phục dữ liệu xuất bản',
  LESSON_UPDATE: 'Cập nhật bài học',
};

function lessonPublishDiagnosticCode(error: unknown): string {
  const seen = new Set<unknown>();
  let current: any = error;
  while (current && !seen.has(current)) {
    seen.add(current);
    const value = clean(current.diagnosticCode);
    if (value) return value;
    current = current.cause;
  }
  return '';
}

function lessonPublishDiagnosticError(code: LessonPublishDiagnosticCode, message: string, cause?: unknown) {
  const error = new Error(`${message} [${code}]`);
  (error as any).diagnosticCode = code;
  if (cause !== undefined) (error as any).cause = cause;
  return error;
}

function isLessonPublishNetworkError(error: unknown) {
  const code = firebaseErrorCode(error);
  return ['unavailable', 'deadline-exceeded', 'cancelled', 'network-request-failed'].includes(code)
    || /network|offline|mạng|kết nối/i.test(String((error as any)?.message || ''));
}

function lessonPublishPermissionError(stage: LessonPublishStage, error: unknown, grade: unknown) {
  if (lessonPublishDiagnosticCode(error)) return error;
  const code = firebaseErrorCode(error);
  if (isLessonPublishNetworkError(error)) {
    return lessonPublishDiagnosticError(
      'PUBLISH_NETWORK_ERROR',
      'Không kết nối ổn định với Firestore. Dữ liệu chưa được xác nhận là đã xuất bản; hãy kiểm tra Internet rồi thử lại.',
      error,
    );
  }
  if (!code.includes('permission-denied')) return error;
  const normalizedGrade = clean(grade).replace(/\.0+$/, '');
  if (stage === 'CONTENT_CREATE') {
    return lessonPublishDiagnosticError(
      'CONTENT_CREATE_DENIED',
      `Firestore từ chối tạo nội dung bài học${normalizedGrade ? ` khối ${normalizedGrade}` : ''}. Hãy xác minh Firestore Rules hiện hành và quyền quản lý khối của tài khoản.`,
      error,
    );
  }
  if (stage === 'LESSON_UPDATE') {
    return lessonPublishDiagnosticError(
      'LESSON_UPDATE_DENIED',
      `Firestore từ chối cập nhật bài học${normalizedGrade ? ` khối ${normalizedGrade}` : ''}. Hãy xác minh quyền sở hữu/quản lý khối và Firestore Rules hiện hành.`,
      error,
    );
  }
  if (stage === 'LESSON_CREATE') {
    return lessonPublishDiagnosticError(
      'LESSON_CREATE_DENIED',
      `Firestore từ chối tạo thông tin bài học${normalizedGrade ? ` khối ${normalizedGrade}` : ''}. Hãy xác minh Firestore Rules hiện hành và quyền quản lý khối của tài khoản.`,
      error,
    );
  }
  return lessonPublishDiagnosticError(
    'REGISTRY_PERMISSION_DENIED',
    `Firestore từ chối giữ số bài hoặc tạo metadata trong giao dịch xuất bản${normalizedGrade ? ` khối ${normalizedGrade}` : ''}. Hãy xác minh Firestore Rules hiện hành và quyền quản lý khối của tài khoản.`,
    error,
  );
}

function lessonPublishStageError(stage: LessonPublishStage, error: unknown) {
  const existingStage = clean((error as any)?.stage) as LessonPublishStage;
  if (existingStage && LESSON_PUBLISH_STAGE_LABELS[existingStage] && error instanceof Error) return error;
  const detail = firebaseErrorMessage(error);
  const message = `${LESSON_PUBLISH_STAGE_LABELS[stage]} không thành công. ${detail} [${stage}]`;
  const wrapped = new Error(message);
  (wrapped as any).stage = stage;
  const diagnosticCode = lessonPublishDiagnosticCode(error);
  if (diagnosticCode) (wrapped as any).diagnosticCode = diagnosticCode;
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
  const diagnosticCode = lessonPublishDiagnosticCode(original);
  if (diagnosticCode) (wrapped as any).diagnosticCode = diagnosticCode;
  (wrapped as any).rollbackStage = 'REGISTRY_ROLLBACK';
  (wrapped as any).cause = original;
  return wrapped;
}

async function verifyLessonPublishRulesCapability(uid: string, grade: unknown) {
  const normalizedUid = clean(uid);
  const normalizedGrade = clean(grade).replace(/\.0+$/, '');
  if (!normalizedUid) {
    throw lessonPublishDiagnosticError('PUBLISH_AUTH_REQUIRED', 'Không xác định được Firebase UID để kiểm tra quyền xuất bản.');
  }
  if (!normalizedGrade) {
    throw lessonPublishDiagnosticError('PUBLISH_PROFILE_INVALID', 'Bài học chưa có khối hợp lệ để kiểm tra quyền xuất bản.');
  }

  // V6.88.4: cache theo UID + khối. Capability probe phải xác minh đúng phạm vi
  // giáo viên đang xuất bản, không chỉ xác minh một chuỗi số phiên bản Rules.
  const capabilityKey = `${normalizedUid}|${normalizedGrade}|${LESSON_PUBLISH_CAPABILITY}`;
  if (lessonPublishRulesVerifiedKey === capabilityKey) return;

  const probeRef = doc(school(), 'rulesProbes', normalizedUid);
  try {
    await setDoc(probeRef, {
      schoolId: FIREBASE_SCHOOL_ID,
      ownerUid: normalizedUid,
      capability: LESSON_PUBLISH_CAPABILITY,
      purpose: 'lesson-publish-capability',
      schemaVersion: 1,
      khoi: normalizedGrade,
      updatedAt: serverTimestamp(),
    }, { merge: false });
  } catch (error) {
    if (isLessonPublishNetworkError(error)) {
      throw lessonPublishDiagnosticError(
        'PUBLISH_NETWORK_ERROR',
        'Không thể kiểm tra quyền xuất bản vì kết nối Firestore không ổn định. Hãy kiểm tra Internet rồi thử lại.',
        error,
      );
    }
    if (firebaseErrorCode(error).includes('permission-denied')) {
      throw lessonPublishDiagnosticError(
        'PUBLISH_RULES_CAPABILITY_DENIED',
        `Firestore Rules đang hoạt động chưa xác nhận capability ${LESSON_PUBLISH_CAPABILITY} cho khối ${normalizedGrade}. Hãy deploy gói Rules ${LESSON_PUBLISH_RULES_LABEL} cho project ${FIREBASE_SCHOOL_ID}, chờ Rules cập nhật rồi đăng nhập lại.`,
        error,
      );
    }
    throw lessonPublishDiagnosticError(
      'PUBLISH_RULES_CAPABILITY_DENIED',
      `Không xác minh được capability xuất bản trên project ${FIREBASE_SCHOOL_ID}. ${firebaseErrorMessage(error)}`,
      error,
    );
  }

  // Ghi probe thành công là bằng chứng capability đã được Rules chấp nhận. Việc
  // dọn probe chỉ là best-effort và tuyệt đối không được làm thất bại phiên xuất bản.
  lessonPublishRulesVerifiedKey = capabilityKey;
  try {
    await deleteDoc(probeRef);
  } catch (cleanupError) {
    console.warn('[EduSmart][LessonPublish] Capability probe cleanup skipped', {
      capability: LESSON_PUBLISH_CAPABILITY,
      grade: normalizedGrade,
      error: firebaseErrorMessage(cleanupError),
    });
  }
}

async function freshLessonPublishIdentity(grade: unknown) {
  try {
    const current = firebaseAuth.currentUser;
    if (!current) {
      throw lessonPublishDiagnosticError('PUBLISH_AUTH_REQUIRED', 'Bạn cần đăng nhập Firebase để xuất bản bài học.');
    }

    // Luôn đọc lại member thật trước thao tác xuất bản, không dùng cache 5 phút.
    let member: any;
    try {
      member = await loadValidatedCurrentFirebaseMember();
    } catch (error) {
      const text = String((error as any)?.message || '');
      if (/bị khóa|chưa kích hoạt|inactive/i.test(text)) {
        throw lessonPublishDiagnosticError('PUBLISH_ACCOUNT_INACTIVE', 'Tài khoản thành viên đang bị khóa hoặc chưa kích hoạt.', error);
      }
      if (isLessonPublishNetworkError(error)) {
        throw lessonPublishDiagnosticError('PUBLISH_NETWORK_ERROR', 'Không thể tải hồ sơ tài khoản từ Firestore. Hãy kiểm tra Internet rồi thử lại.', error);
      }
      throw lessonPublishDiagnosticError('PUBLISH_PROFILE_INVALID', `Không xác minh được hồ sơ Firebase dùng để xuất bản. ${firebaseErrorMessage(error)}`, error);
    }

    identityCache = { uid: current.uid, expiresAt: Date.now() + IDENTITY_CACHE_TTL_MS, value: member };
    if (member.role !== 'admin' && member.role !== 'teacher') {
      throw lessonPublishDiagnosticError('PUBLISH_ROLE_DENIED', 'Tài khoản hiện tại không có vai trò quản trị viên hoặc giáo viên để xuất bản bài học.');
    }
    if (!teacherCanManageGrade(member, grade)) {
      const scope = teacherManagedGrades(member);
      throw lessonPublishDiagnosticError(
        'PUBLISH_GRADE_SCOPE_DENIED',
        `Giáo viên không được phân công khối ${clean(grade) || '-'}. Phạm vi hiện tại: ${scope.length ? scope.join(', ') : 'chưa cấu hình'}.`,
      );
    }

    await verifyLessonPublishRulesCapability(current.uid, grade);
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
  if (!['teacher_controlled', 'self_study'].includes(clean(data?.access_mode || 'teacher_controlled'))) problems.push('access_mode không hợp lệ');
  if (data?.allow_retake_after_completion !== undefined && typeof data.allow_retake_after_completion !== 'boolean') problems.push('allow_retake_after_completion phải là boolean');

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
    const nextIntroVideoUrl = clean(normalizedPayload.intro_video_url || lessonJson?.intro_video_url || lessonJson?.intro_video_embed_url);
    const previousIntroVideoUrl = clean(existingData?.intro_video_url || existingData?.intro_video_embed_url);
    const previousVideoRevision = Number.isFinite(Number(existingData?.pre_lesson_video_revision))
      ? Math.max(1, Math.floor(Number(existingData.pre_lesson_video_revision)))
      : 1;
    const nextVideoRevision = existingData && nextIntroVideoUrl !== previousIntroVideoUrl
      ? previousVideoRevision + 1
      : previousVideoRevision;
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
      self_study_scope: existingData
        ? resolveSelfStudyScope(existingData)
        : (normalizedPayload.access_mode === 'self_study' ? 'all' : 'none'),
      self_study_class_ids: existingData ? cleanStringList(existingData.self_study_class_ids) : [],
      self_study_class_access_keys: existingData ? cleanStringList(existingData.self_study_class_access_keys) : [],
      self_study_access_version: existingData && Number.isFinite(Number(existingData.self_study_access_version))
        ? Number(existingData.self_study_access_version)
        : (existingData && resolveSelfStudyScope(existingData) === 'classes' ? 4 : 5),
      access_mode: existingData && resolveSelfStudyScope(existingData) === 'classes'
        ? 'teacher_controlled'
        : (normalizedPayload.access_mode === 'self_study' ? 'self_study' : 'teacher_controlled'),
      allow_retake_after_completion: normalizedPayload.allow_retake_after_completion === true,
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
      intro_video_url: nextIntroVideoUrl,
      intro_video_embed_url: clean(lessonJson?.intro_video_embed_url || ''),
      pre_lesson_video_revision: nextVideoRevision,
      pre_lesson_enabled: normalizedPayload.pre_lesson_enabled !== false && Boolean(clean(normalizedPayload.intro_video_url || lessonJson?.intro_video_url || lessonJson?.intro_video_embed_url)),
      pre_lesson_allow_when_locked: normalizedPayload.pre_lesson_allow_when_locked !== false,
      pre_lesson_required: normalizedPayload.pre_lesson_required === true,
      pre_lesson_completion_threshold: Math.max(50, Math.min(100, Number(normalizedPayload.pre_lesson_completion_threshold || 80))),
      pre_lesson_deadline: clean(normalizedPayload.pre_lesson_deadline || normalizedPayload.thoi_gian_bat_dau),
      pre_lesson_deadline_at: lessonScheduleTimestamp(normalizedPayload.pre_lesson_deadline || normalizedPayload.thoi_gian_bat_dau),
      pre_lesson_score_enabled: false,
      pre_lesson_score_weight: 0,
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
      throw lessonPublishStageError('LESSON_UPDATE', lessonPublishPermissionError('LESSON_UPDATE', error, normalizedPayload.khoi));
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
      throw lessonPublishStageError('REGISTRY_RESERVE', lessonPublishPermissionError('REGISTRY_RESERVE', error, normalizedPayload.khoi));
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
      throw lessonPublishStageError('CONTENT_CREATE', lessonPublishPermissionError('CONTENT_CREATE', error, normalizedPayload.khoi));
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
    retakes?: number;
    preparationSubmissions?: number;
    coLearningConsents?: number;
    scoreTrackingConfigs?: number;
    archivedGradeRecords?: number;
  };
};

export type LessonPermanentDeleteMode = 'preserve_grades' | 'purge_all';

export type LessonPermanentDeletePhase =
  | 'preparation_submissions' | 'legacy_prelesson_submissions' | 'legacy_prelesson' | 'learning_actions' | 'comments'
  | 'colearning_consents' | 'colearning_sessions' | 'teaching_sessions' | 'slides_prompts'
  | 'review_practices' | 'learning_progress' | 'activities' | 'content'
  | 'score_tracking' | 'registry_cleanup' | 'lesson_finalize' | 'completed';

export interface LessonPermanentDeleteAnalysis {
  lesson_id: string;
  lesson_title: string;
  mode?: LessonPermanentDeleteMode;
  counts: Record<string, number>;
  total_records: number;
  student_data_records: number;
  has_student_data: boolean;
}

export interface LessonPermanentDeleteJobState {
  lesson_id: string;
  mode: LessonPermanentDeleteMode;
  status: 'ready' | 'running' | 'retryable' | 'completed';
  phase: LessonPermanentDeletePhase;
  processed_records: number;
  total_records: number;
  deleted_counts: Record<string, number>;
  archived_grade_records: number;
  last_error?: string;
}


export type LessonIntegrityRepairSummary = {
  scanned_registries: number;
  repaired_registries: number;
  deleted_empty_registries: number;
  removed_orphan_references: number;
  normalized_registries: number;
  normalized_lessons: number;
  lesson_schema_issues: number;
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
    normalized_lessons: 0,
    lesson_schema_issues: 0,
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

  // V6.88.0: chuẩn hóa metadata video chuẩn bị cũ. Submission mới không phụ
  // thuộc các trường này để được ghi, nhưng chuẩn hóa giúp UI/analytics thống
  // nhất và tránh dữ liệu "80"/80, revision rỗng, boolean dạng chuỗi.
  const lessonSnap = await getDocs(lessons());
  for (const lessonDoc of lessonSnap.docs) {
    const data = lessonDoc.data() as any;
    if (clean(data?.trang_thai) === 'archived') continue;
    const rawThreshold = Number(data?.pre_lesson_completion_threshold ?? 80);
    const threshold = Number.isFinite(rawThreshold) ? Math.max(50, Math.min(100, Math.round(rawThreshold))) : 80;
    const rawRevision = Number(data?.pre_lesson_video_revision ?? 1);
    const revision = Number.isFinite(rawRevision) ? Math.max(1, Math.floor(rawRevision)) : 1;
    const hasVideo = Boolean(clean(data?.intro_video_url || data?.intro_video_embed_url));
    const normalizeBooleanValue = (value: unknown, fallback: boolean) => {
      if (typeof value === 'boolean') return value;
      const raw = clean(value).toLowerCase();
      if (!raw) return fallback;
      return ['true', '1', 'yes', 'y', 'on'].includes(raw);
    };
    const enabled = normalizeBooleanValue(data?.pre_lesson_enabled, hasVideo) && hasVideo;
    const allowWhenLocked = normalizeBooleanValue(data?.pre_lesson_allow_when_locked, true);
    const required = normalizeBooleanValue(data?.pre_lesson_required, false);
    const deadlineText = clean(data?.pre_lesson_deadline);
    const deadlineDate = deadlineText ? new Date(deadlineText) : null;
    const deadlineAt = deadlineDate && !Number.isNaN(deadlineDate.getTime()) ? Timestamp.fromDate(deadlineDate) : null;
    const needs = Number(data?.pre_lesson_completion_threshold) !== threshold
      || Number(data?.pre_lesson_video_revision) !== revision
      || data?.pre_lesson_enabled !== enabled
      || data?.pre_lesson_allow_when_locked !== allowWhenLocked
      || data?.pre_lesson_required !== required
      || (deadlineAt && !(data?.pre_lesson_deadline_at?.toDate instanceof Function));
    if (!needs) continue;
    summary.lesson_schema_issues += 1;
    await updateDoc(lessonDoc.ref, withoutUndefined({
      pre_lesson_completion_threshold: threshold,
      pre_lesson_video_revision: revision,
      pre_lesson_enabled: enabled,
      pre_lesson_allow_when_locked: allowWhenLocked,
      pre_lesson_required: required,
      pre_lesson_deadline_at: deadlineAt || deleteField(),
      updated_at: new Date().toISOString(),
      updatedAt: serverTimestamp(),
    }));
    summary.normalized_lessons += 1;
  }
  return summary;
}

function reviewLessonIds(data: any) {
  const raw = data?.lesson_ids;
  const ids = Array.isArray(raw)
    ? raw.map(clean).filter(Boolean)
    : clean(raw).split(',').map(item => item.trim()).filter(Boolean);
  const single = clean(data?.lesson_id);
  if (single && !ids.includes(single)) ids.push(single);
  return Array.from(new Set(ids));
}

function reviewReferencesLesson(data: any, lessonId: string) {
  return reviewLessonIds(data).includes(clean(lessonId));
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
async function legacyCascadeDeleteFirebaseLesson(lessonId: string): Promise<LessonCascadeDeleteSummary | false> {
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

  // V6.84.1: Firestore không tự xóa subcollection khi xóa parent. Dọn toàn bộ
  // phiên học lại trước learningProgress để tránh document mồ côi.
  const retakeSnaps = await Promise.all(progressSnap.docs.map((item) => getDocs(retakesCollection(item.id))));

  const dependencyRefs: DocumentReference<DocumentData>[] = [];
  retakeSnaps.forEach((snap) => snap.docs.forEach((item) => dependencyRefs.push(item.ref)));
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


/**
 * V6.88.0: thao tác "Xóa bài học" mặc định là lưu trữ an toàn.
 * Không quét/xóa hàng loạt dữ liệu học sinh trong cùng một request, vì cách cũ
 * dễ chạm quota Spark và có thể làm mất lịch sử điểm. Card được ẩn ngay khỏi
 * thư viện hoạt động, số bài được giải phóng, còn metadata bài học được giữ làm
 * tombstone để các kết quả lịch sử vẫn có thể đối chiếu.
 */
export async function deleteFirebaseLesson(lessonId: string): Promise<(LessonCascadeDeleteSummary & { mode: 'archived'; archived: true }) | false> {
  const me = await identity();
  const normalizedLessonId = clean(lessonId);
  if (!normalizedLessonId) return false;
  const target = doc(lessons(), normalizedLessonId);
  const snap = await getDoc(target);
  if (!snap.exists()) return false;
  const data = snap.data() as any;
  const isAdminUser = me.role === 'admin' || me.adminPermission === true;
  if (!isAdminUser && me.role === 'teacher') {
    assertTeacherCanManageGrade(me, data?.khoi);
    if (clean(data?.createdByUid) !== clean(me.uid)) throw new Error('Bạn chỉ được lưu trữ bài học do chính mình tạo.');
  }

  const registryKey = clean(data?.lesson_key) || lessonRegistryKey(data);
  const registryRef = registryKey ? doc(school(), 'lessonNumberRegistry', registryKey) : null;
  await runTransaction(firestoreDb, async (transaction) => {
    const registrySnap = registryRef ? await transaction.get(registryRef) : null;
    if (registrySnap?.exists()) {
      const cleaned = removeLessonFromRegistry(registrySnap.data(), normalizedLessonId);
      if (registryHasAnyLesson(cleaned)) transaction.set(registryRef!, normalizeRegistryForWrite(cleaned, me.uid, clean(data?.khoi)), { merge: false });
      else transaction.delete(registryRef!);
    }
    transaction.set(lessonDeletionJobRef(normalizedLessonId), {
      schoolId: FIREBASE_SCHOOL_ID,
      schemaVersion: 1,
      lesson_id: normalizedLessonId,
      ownerUid: clean(data?.createdByUid),
      requestedByUid: me.uid,
      requestedByUserId: clean(me.userId),
      grade: clean(data?.khoi),
      status: 'archived',
      phase: 'preserve_history',
      policy: 'safe_archive_v1',
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    }, { merge: true });
    transaction.update(target, {
      trang_thai: 'archived',
      pham_vi: 'private',
      is_locked: true,
      deletion_status: 'archived',
      archived_at: new Date().toISOString(),
      archivedAt: serverTimestamp(),
      archived_by_uid: me.uid,
      archived_by_user_id: clean(me.userId),
      updated_at: new Date().toISOString(),
      updatedAt: serverTimestamp(),
    });
  });

  return {
    lesson_id: normalizedLessonId,
    deleted: true,
    mode: 'archived',
    archived: true,
    deleted_counts: {
      lesson: 0, content: 0, registry: registryRef ? 1 : 0, learningProgress: 0,
      learningResultActions: 0, lessonComments: 0, coLearningSessions: 0,
      slidesPrompts: 0, reviewPractices: 0, reviewAttempts: 0, reviewContents: 0,
      preLessonProgress: 0, teachingSessions: 0, activities: 0,
    },
  };
}

/**
 * V6.88.2: xóa vĩnh viễn bài học theo job có thể tiếp tục.
 * Admin được phép xóa cả bài đã phát sinh dữ liệu nhưng dữ liệu được dọn theo
 * batch nhỏ. Nếu quota/mạng gián đoạn, phase hiện tại được giữ trong
 * lessonDeletionJobs/{lessonId} và lần sau tiếp tục đúng vị trí.
 */
const LESSON_PURGE_BATCH_SIZE = 60;
const LESSON_PURGE_PHASES: LessonPermanentDeletePhase[] = [
  'preparation_submissions', 'legacy_prelesson_submissions', 'legacy_prelesson', 'learning_actions', 'comments',
  'colearning_consents', 'colearning_sessions', 'teaching_sessions', 'slides_prompts',
  'review_practices', 'learning_progress', 'activities', 'content',
  'score_tracking', 'registry_cleanup', 'lesson_finalize', 'completed',
];

function nextLessonPurgePhase(phase: LessonPermanentDeletePhase): LessonPermanentDeletePhase {
  const index = LESSON_PURGE_PHASES.indexOf(phase);
  return LESSON_PURGE_PHASES[Math.min(LESSON_PURGE_PHASES.length - 1, Math.max(0, index + 1))];
}

function normalizeDeleteCounts(value: any): Record<string, number> {
  const output: Record<string, number> = {};
  Object.entries(value || {}).forEach(([key, count]) => { output[key] = Math.max(0, Number(count || 0)); });
  return output;
}

function normalizeLessonPurgeJob(data: any, lessonId: string): LessonPermanentDeleteJobState {
  const rawMode = clean(data?.mode);
  const rawStatus = clean(data?.status);
  const rawPhase = clean(data?.phase) as LessonPermanentDeletePhase;
  return {
    lesson_id: clean(data?.lesson_id) || clean(lessonId),
    mode: rawMode === 'purge_all' ? 'purge_all' : 'preserve_grades',
    status: rawStatus === 'completed' ? 'completed' : rawStatus === 'retryable' ? 'retryable' : rawStatus === 'ready' ? 'ready' : 'running',
    phase: LESSON_PURGE_PHASES.includes(rawPhase) ? rawPhase : 'preparation_submissions',
    processed_records: Math.max(0, Number(data?.processed_records || 0)),
    total_records: Math.max(0, Number(data?.total_records || 0)),
    deleted_counts: normalizeDeleteCounts(data?.deleted_counts),
    archived_grade_records: Math.max(0, Number(data?.archived_grade_records || 0)),
    last_error: clean(data?.last_error) || undefined,
  };
}

async function writeLessonPurgeJob(jobRef: DocumentReference<DocumentData>, job: LessonPermanentDeleteJobState) {
  const payload = {
    schoolId: FIREBASE_SCHOOL_ID,
    schemaVersion: 2,
    lesson_id: job.lesson_id,
    mode: job.mode,
    status: job.status,
    phase: job.phase,
    processed_records: job.processed_records,
    total_records: job.total_records,
    deleted_counts: job.deleted_counts,
    archived_grade_records: job.archived_grade_records,
    last_error: job.last_error || '',
    updated_at: new Date().toISOString(),
    updatedAt: serverTimestamp(),
  };
  await setDoc(jobRef, payload, { merge: true });
  return job;
}

function countValue(snapshot: Awaited<ReturnType<typeof getCountFromServer>>) {
  return Math.max(0, Number(snapshot.data().count || 0));
}

async function countRetakesForProgressDocs(progressDocs: QueryDocumentSnapshot<DocumentData>[]) {
  let count = 0;
  for (const item of progressDocs) {
    try { count += countValue(await getCountFromServer(retakesCollection(item.id))); } catch { /* best effort */ }
  }
  return count;
}

function scoreTrackingReferencesLesson(data: any, lessonId: string) {
  const fields = ['midterm1_lesson_ids', 'finalterm1_lesson_ids', 'midterm2_lesson_ids', 'finalterm2_lesson_ids', 'annual_lesson_ids'];
  return fields.some(field => cleanStringList(data?.[field]).includes(clean(lessonId)));
}

export async function analyzeFirebaseArchivedLessonPurge(lessonId: string): Promise<LessonPermanentDeleteAnalysis | false> {
  const me = await identity();
  if (!(me.role === 'admin' || me.adminPermission === true)) throw new Error('Chỉ quản trị viên mới được phân tích xóa vĩnh viễn bài học.');
  const normalizedLessonId = clean(lessonId);
  if (!normalizedLessonId) return false;
  const lessonRef = doc(lessons(), normalizedLessonId);
  const lessonSnap = await getDoc(lessonRef);
  if (!lessonSnap.exists()) return false;
  const lesson = lessonSnap.data() as any;
  if (clean(lesson?.trang_thai) !== 'archived') throw new Error('Hãy lưu trữ bài học trước khi xóa vĩnh viễn.');

  const [
    preparationSubmissions, legacyPreLesson, learningProgressCount, learningActions,
    comments, consents, sessions, teachingSessions, slidesPrompts, activities,
  ] = await Promise.all([
    getCountFromServer(lessonPreparationSubmissionsCollection(normalizedLessonId)),
    getCountFromServer(query(namedCollection('preLessonProgress'), where('lesson_id', '==', normalizedLessonId))),
    getCountFromServer(query(namedCollection('learningProgress'), where('lesson_id', '==', normalizedLessonId))),
    getCountFromServer(query(namedCollection('learningResultActions'), where('lesson_id', '==', normalizedLessonId))),
    getCountFromServer(query(namedCollection('lessonComments'), where('lesson_id', '==', normalizedLessonId))),
    getCountFromServer(query(namedCollection('coLearningConsents'), where('lessonId', '==', normalizedLessonId))),
    getCountFromServer(query(namedCollection('coLearningSessions'), where('lesson_id', '==', normalizedLessonId))),
    getCountFromServer(query(namedCollection('teachingSessions'), where('lesson_id', '==', normalizedLessonId))),
    getCountFromServer(query(namedCollection('slidesPrompts'), where('lesson_id', '==', normalizedLessonId))),
    getCountFromServer(lessonActivitiesCollection(normalizedLessonId)),
  ]);

  const progressDocs = (await getDocs(query(namedCollection('learningProgress'), where('lesson_id', '==', normalizedLessonId)))).docs;
  const retakes = await countRetakesForProgressDocs(progressDocs);
  const reviewDocs = (await getDocs(namedCollection('reviewPractices'))).docs.filter(item => reviewReferencesLesson(item.data(), normalizedLessonId));
  let reviewAttempts = 0;
  let reviewContents = 0;
  for (const review of reviewDocs) {
    const linkedIds = reviewLessonIds(review.data());
    // Bài luyện gắn nhiều bài chỉ bỏ liên kết tới lesson đang xóa; attempts/content
    // vẫn thuộc bài luyện còn sống nên không tính vào lượng dữ liệu sẽ xóa.
    if (linkedIds.length > 1) continue;
    try { reviewAttempts += countValue(await getCountFromServer(query(namedCollection('reviewAttempts'), where('review_id', '==', review.id)))); } catch { /* best effort */ }
    try { if ((await getDoc(reviewContentRef(review.id))).exists()) reviewContents += 1; } catch { /* best effort */ }
  }
  const scoreConfigs = (await getDocs(namedCollection('scoreTrackingConfigs'))).docs.filter(item => scoreTrackingReferencesLesson(item.data(), normalizedLessonId));
  const registries = (await getDocs(namedCollection('lessonNumberRegistry'))).docs.filter(item => registryLessonIds(item.data()).includes(normalizedLessonId));
  const contentExists = (await getDoc(lessonContentRef(normalizedLessonId))).exists() ? 1 : 0;

  const counts: Record<string, number> = {
    preparationSubmissions: countValue(preparationSubmissions),
    legacyPreLessonSubmissions: countValue(await getCountFromServer(query(namedCollection('preLessonSubmissions'), where('lesson_id', '==', normalizedLessonId)))),
    preLessonProgress: countValue(legacyPreLesson),
    learningProgress: countValue(learningProgressCount),
    retakes,
    learningResultActions: countValue(learningActions),
    lessonComments: countValue(comments),
    coLearningConsents: countValue(consents),
    coLearningSessions: countValue(sessions),
    teachingSessions: countValue(teachingSessions),
    slidesPrompts: countValue(slidesPrompts),
    reviewPractices: reviewDocs.length,
    reviewAttempts,
    reviewContents,
    activities: countValue(activities),
    content: contentExists,
    scoreTrackingConfigs: scoreConfigs.length,
    registry: registries.length,
    lesson: 1,
  };
  const totalRecords = Object.values(counts).reduce((sum, value) => sum + Math.max(0, Number(value || 0)), 0);
  const studentDataRecords = counts.preparationSubmissions + counts.legacyPreLessonSubmissions + counts.preLessonProgress + counts.learningProgress
    + counts.retakes + counts.learningResultActions + counts.lessonComments + counts.coLearningConsents
    + counts.coLearningSessions + counts.teachingSessions + counts.reviewAttempts;
  return {
    lesson_id: normalizedLessonId,
    lesson_title: clean(lesson?.tieu_de) || normalizedLessonId,
    counts,
    total_records: totalRecords,
    student_data_records: studentDataRecords,
    has_student_data: studentDataRecords > 0,
  };
}

export async function startFirebaseArchivedLessonPurge(lessonId: string, mode: LessonPermanentDeleteMode = 'preserve_grades'): Promise<LessonPermanentDeleteJobState | false> {
  const me = await identity();
  if (!(me.role === 'admin' || me.adminPermission === true)) throw new Error('Chỉ quản trị viên mới được xóa vĩnh viễn bài học.');
  const normalizedLessonId = clean(lessonId);
  if (!normalizedLessonId) return false;
  const lessonRef = doc(lessons(), normalizedLessonId);
  const lessonSnap = await getDoc(lessonRef);
  if (!lessonSnap.exists()) return false;
  const lesson = lessonSnap.data() as any;
  if (clean(lesson?.trang_thai) !== 'archived') throw new Error('Hãy lưu trữ bài học trước khi xóa vĩnh viễn.');
  const jobRef = lessonDeletionJobRef(normalizedLessonId);
  const existing = await getDoc(jobRef);
  if (existing.exists() && Number(existing.data()?.schemaVersion || 0) >= 2) {
    const previous = normalizeLessonPurgeJob(existing.data(), normalizedLessonId);
    if (previous.status !== 'completed') {
      if (previous.mode !== mode) throw new Error('Bài học đang có một tiến trình xóa với chế độ khác. Hãy tiếp tục tiến trình hiện tại.');
      if (previous.status === 'retryable') {
        previous.status = 'running'; previous.last_error = undefined;
        await writeLessonPurgeJob(jobRef, previous);
      }
      return previous;
    }
  }

  const analysis = await analyzeFirebaseArchivedLessonPurge(normalizedLessonId);
  if (!analysis) return false;
  const job: LessonPermanentDeleteJobState = {
    lesson_id: normalizedLessonId,
    mode,
    status: 'running',
    phase: 'preparation_submissions',
    processed_records: 0,
    total_records: analysis.total_records,
    deleted_counts: {},
    archived_grade_records: 0,
  };
  await setDoc(jobRef, {
    schoolId: FIREBASE_SCHOOL_ID,
    schemaVersion: 2,
    lesson_id: normalizedLessonId,
    ownerUid: clean(lesson?.createdByUid),
    requestedByUid: me.uid,
    requestedByUserId: clean(me.userId),
    grade: clean(lesson?.khoi),
    lesson_title: clean(lesson?.tieu_de),
    mode,
    status: 'running',
    phase: job.phase,
    policy: 'resumable_permanent_delete_v2',
    processed_records: 0,
    total_records: analysis.total_records,
    deleted_counts: {},
    archived_grade_records: 0,
    analysis_snapshot: analysis.counts,
    last_error: '',
    created_at: new Date().toISOString(),
    createdAt: serverTimestamp(),
    updated_at: new Date().toISOString(),
    updatedAt: serverTimestamp(),
  }, { merge: true });
  await updateDoc(lessonRef, {
    deletion_status: 'purging',
    purge_mode: mode,
    purge_requested_by_uid: me.uid,
    purge_requested_at: new Date().toISOString(),
    is_locked: true,
    pham_vi: 'private',
    updated_at: new Date().toISOString(),
    updatedAt: serverTimestamp(),
  });
  return job;
}

async function deleteQueryBatch(baseQuery: any, batchSize = LESSON_PURGE_BATCH_SIZE) {
  const snap = await getDocs(query(baseQuery, limit(batchSize)));
  if (!snap.empty) await commitDeleteRefs(snap.docs.map(item => item.ref));
  return { deleted: snap.size, exhausted: snap.size < batchSize };
}

async function updateJobProgress(
  jobRef: DocumentReference<DocumentData>,
  job: LessonPermanentDeleteJobState,
  countKey: string,
  processed: number,
  exhausted: boolean,
) {
  const next: LessonPermanentDeleteJobState = {
    ...job,
    processed_records: job.processed_records + Math.max(0, processed),
    deleted_counts: { ...job.deleted_counts, [countKey]: (job.deleted_counts[countKey] || 0) + Math.max(0, processed) },
    phase: exhausted ? nextLessonPurgePhase(job.phase) : job.phase,
    status: 'running',
    last_error: undefined,
  };
  return writeLessonPurgeJob(jobRef, next);
}

function archivedScoreSnapshot(lesson: any, progressId: string, data: any, me: any) {
  const officialScore = Number.isFinite(Number(data?.assessment_score))
    ? Number(data.assessment_score)
    : (Number.isFinite(Number(data?.previous_official_score)) ? Number(data.previous_official_score) : undefined);
  if (!Number.isFinite(Number(officialScore))) return null;
  return withoutUndefined({
    schoolId: FIREBASE_SCHOOL_ID,
    schemaVersion: 1,
    source: 'lesson_permanent_delete_preserve_grades',
    original_progress_id: progressId,
    lesson_id: clean(lesson?.lesson_id),
    lesson_number: Number(lesson?.lesson_number || 0) || undefined,
    lesson_title: clean(lesson?.tieu_de || data?.lesson_title),
    subject_id: clean(lesson?.mon_id),
    subject_name: clean(data?.mon_hoc),
    grade: clean(data?.khoi || lesson?.khoi),
    class_id: clean(data?.lop_id),
    user_id: clean(data?.user_id),
    ownerUid: clean(data?.ownerUid),
    official_score: Number(officialScore),
    score_status: clean(data?.score_status),
    completion_percent: Number(data?.completion_percent || 0),
    completed_at: clean(data?.score_calculated_at || data?.completed_at || data?.updated_at),
    archived_by_uid: me.uid,
    archived_by_user_id: clean(me.userId),
    archived_at: new Date().toISOString(),
    archivedAt: serverTimestamp(),
  });
}

async function processReviewPracticePurge(job: LessonPermanentDeleteJobState, jobRef: DocumentReference<DocumentData>) {
  const reviewDocs = (await getDocs(namedCollection('reviewPractices'))).docs;
  const linked = reviewDocs.find(item => reviewReferencesLesson(item.data(), job.lesson_id));
  if (!linked) {
    const next = { ...job, phase: nextLessonPurgePhase(job.phase), status: 'running' as const };
    return writeLessonPurgeJob(jobRef, next);
  }
  const data = linked.data() as any;
  const ids = reviewLessonIds(data);
  if (ids.length > 1) {
    const remaining = ids.filter(idValue => idValue !== job.lesson_id);
    await updateDoc(linked.ref, {
      lesson_ids: remaining,
      lesson_id: clean(data?.lesson_id) === job.lesson_id ? (remaining[0] || '') : clean(data?.lesson_id),
      updated_at: new Date().toISOString(), updatedAt: serverTimestamp(),
    });
    return updateJobProgress(jobRef, job, 'reviewPracticesUnlinked', 1, false);
  }
  const attempts = await getDocs(query(namedCollection('reviewAttempts'), where('review_id', '==', linked.id), limit(LESSON_PURGE_BATCH_SIZE)));
  if (!attempts.empty) {
    await commitDeleteRefs(attempts.docs.map(item => item.ref));
    return updateJobProgress(jobRef, job, 'reviewAttempts', attempts.size, false);
  }
  await deleteDoc(reviewContentRef(linked.id)).catch(() => undefined);
  await deleteDoc(linked.ref);
  const nextCounts = { ...job.deleted_counts, reviewContents: (job.deleted_counts.reviewContents || 0) + 1, reviewPractices: (job.deleted_counts.reviewPractices || 0) + 1 };
  const next = { ...job, processed_records: job.processed_records + 2, deleted_counts: nextCounts, status: 'running' as const };
  return writeLessonPurgeJob(jobRef, next);
}

async function processLearningProgressPurge(job: LessonPermanentDeleteJobState, jobRef: DocumentReference<DocumentData>, lesson: any, me: any) {
  const progressSnap = await getDocs(query(namedCollection('learningProgress'), where('lesson_id', '==', job.lesson_id), limit(1)));
  if (progressSnap.empty) {
    if (job.mode === 'purge_all') {
      const archived = await getDocs(query(namedCollection('archivedGradeRecords'), where('lesson_id', '==', job.lesson_id), limit(LESSON_PURGE_BATCH_SIZE)));
      if (!archived.empty) {
        await commitDeleteRefs(archived.docs.map(item => item.ref));
        return updateJobProgress(jobRef, job, 'archivedGradeRecords', archived.size, false);
      }
    }
    const next = { ...job, phase: nextLessonPurgePhase(job.phase), status: 'running' as const };
    return writeLessonPurgeJob(jobRef, next);
  }
  const progressDoc = progressSnap.docs[0];
  const retakes = await getDocs(query(retakesCollection(progressDoc.id), limit(LESSON_PURGE_BATCH_SIZE)));
  if (!retakes.empty) {
    await commitDeleteRefs(retakes.docs.map(item => item.ref));
    return updateJobProgress(jobRef, job, 'retakes', retakes.size, false);
  }
  let archived = 0;
  if (job.mode === 'preserve_grades') {
    const snapshot = archivedScoreSnapshot(lesson, progressDoc.id, progressDoc.data(), me);
    if (snapshot) {
      await setDoc(archivedGradeRecordRef(job.lesson_id, progressDoc.id), snapshot, { merge: true });
      archived = 1;
    }
  }
  await deleteDoc(progressDoc.ref);
  const next: LessonPermanentDeleteJobState = {
    ...job,
    processed_records: job.processed_records + 1,
    deleted_counts: { ...job.deleted_counts, learningProgress: (job.deleted_counts.learningProgress || 0) + 1 },
    archived_grade_records: job.archived_grade_records + archived,
    status: 'running',
  };
  return writeLessonPurgeJob(jobRef, next);
}

async function processScoreTrackingReferences(job: LessonPermanentDeleteJobState, jobRef: DocumentReference<DocumentData>, me: any) {
  const configs = (await getDocs(namedCollection('scoreTrackingConfigs'))).docs;
  const linked = configs.find(item => scoreTrackingReferencesLesson(item.data(), job.lesson_id));
  if (!linked) {
    const next = { ...job, phase: nextLessonPurgePhase(job.phase), status: 'running' as const };
    return writeLessonPurgeJob(jobRef, next);
  }
  const data = linked.data() as any;
  const patch: Record<string, unknown> = { updatedByUid: me.uid, updated_at: new Date().toISOString(), updatedAt: serverTimestamp() };
  ['midterm1_lesson_ids', 'finalterm1_lesson_ids', 'midterm2_lesson_ids', 'finalterm2_lesson_ids', 'annual_lesson_ids'].forEach(field => {
    patch[field] = cleanStringList(data?.[field]).filter(idValue => idValue !== job.lesson_id);
  });
  await updateDoc(linked.ref, patch);
  return updateJobProgress(jobRef, job, 'scoreTrackingConfigs', 1, false);
}

async function processRegistryReferences(job: LessonPermanentDeleteJobState, jobRef: DocumentReference<DocumentData>, me: any, lesson: any) {
  const registries = (await getDocs(namedCollection('lessonNumberRegistry'))).docs;
  const linked = registries.find(item => registryLessonIds(item.data()).includes(job.lesson_id));
  if (!linked) {
    const next = { ...job, phase: nextLessonPurgePhase(job.phase), status: 'running' as const };
    return writeLessonPurgeJob(jobRef, next);
  }
  const cleaned = removeLessonFromRegistry(linked.data(), job.lesson_id);
  if (registryHasAnyLesson(cleaned)) await setDoc(linked.ref, normalizeRegistryForWrite(cleaned, me.uid, clean(lesson?.khoi)), { merge: false });
  else await deleteDoc(linked.ref);
  return updateJobProgress(jobRef, job, 'registry', 1, false);
}

export async function continueFirebaseArchivedLessonPurge(lessonId: string): Promise<LessonPermanentDeleteJobState | false> {
  const me = await identity();
  if (!(me.role === 'admin' || me.adminPermission === true)) throw new Error('Chỉ quản trị viên mới được tiếp tục xóa vĩnh viễn bài học.');
  const normalizedLessonId = clean(lessonId);
  if (!normalizedLessonId) return false;
  const jobRef = lessonDeletionJobRef(normalizedLessonId);
  const jobSnap = await getDoc(jobRef);
  if (!jobSnap.exists()) throw new Error('Chưa có tiến trình xóa vĩnh viễn cho bài học này.');
  let job = normalizeLessonPurgeJob(jobSnap.data(), normalizedLessonId);
  if (job.status === 'completed') return job;
  const lessonRef = doc(lessons(), normalizedLessonId);
  const lessonSnap = await getDoc(lessonRef);
  const lesson = lessonSnap.exists() ? lessonSnap.data() as any : { lesson_id: normalizedLessonId };
  if (job.status === 'retryable') {
    job = { ...job, status: 'running', last_error: undefined };
    await writeLessonPurgeJob(jobRef, job);
  }

  try {
    if (job.phase === 'preparation_submissions') {
      const result = await deleteQueryBatch(lessonPreparationSubmissionsCollection(normalizedLessonId));
      return updateJobProgress(jobRef, job, 'preparationSubmissions', result.deleted, result.exhausted);
    }
    if (job.phase === 'legacy_prelesson_submissions') {
      const result = await deleteQueryBatch(query(namedCollection('preLessonSubmissions'), where('lesson_id', '==', normalizedLessonId)));
      return updateJobProgress(jobRef, job, 'legacyPreLessonSubmissions', result.deleted, result.exhausted);
    }
    if (job.phase === 'legacy_prelesson') {
      const result = await deleteQueryBatch(query(namedCollection('preLessonProgress'), where('lesson_id', '==', normalizedLessonId)));
      return updateJobProgress(jobRef, job, 'preLessonProgress', result.deleted, result.exhausted);
    }
    if (job.phase === 'learning_actions') {
      const result = await deleteQueryBatch(query(namedCollection('learningResultActions'), where('lesson_id', '==', normalizedLessonId)));
      return updateJobProgress(jobRef, job, 'learningResultActions', result.deleted, result.exhausted);
    }
    if (job.phase === 'comments') {
      const result = await deleteQueryBatch(query(namedCollection('lessonComments'), where('lesson_id', '==', normalizedLessonId)));
      return updateJobProgress(jobRef, job, 'lessonComments', result.deleted, result.exhausted);
    }
    if (job.phase === 'colearning_consents') {
      const result = await deleteQueryBatch(query(namedCollection('coLearningConsents'), where('lessonId', '==', normalizedLessonId)));
      return updateJobProgress(jobRef, job, 'coLearningConsents', result.deleted, result.exhausted);
    }
    if (job.phase === 'colearning_sessions') {
      const result = await deleteQueryBatch(query(namedCollection('coLearningSessions'), where('lesson_id', '==', normalizedLessonId)));
      return updateJobProgress(jobRef, job, 'coLearningSessions', result.deleted, result.exhausted);
    }
    if (job.phase === 'teaching_sessions') {
      const result = await deleteQueryBatch(query(namedCollection('teachingSessions'), where('lesson_id', '==', normalizedLessonId)));
      return updateJobProgress(jobRef, job, 'teachingSessions', result.deleted, result.exhausted);
    }
    if (job.phase === 'slides_prompts') {
      const result = await deleteQueryBatch(query(namedCollection('slidesPrompts'), where('lesson_id', '==', normalizedLessonId)));
      return updateJobProgress(jobRef, job, 'slidesPrompts', result.deleted, result.exhausted);
    }
    if (job.phase === 'review_practices') return processReviewPracticePurge(job, jobRef);
    if (job.phase === 'learning_progress') return processLearningProgressPurge(job, jobRef, lesson, me);
    if (job.phase === 'activities') {
      const result = await deleteQueryBatch(lessonActivitiesCollection(normalizedLessonId));
      return updateJobProgress(jobRef, job, 'activities', result.deleted, result.exhausted);
    }
    if (job.phase === 'content') {
      const contentRef = lessonContentRef(normalizedLessonId);
      const contentSnap = await getDoc(contentRef);
      let deleted = 0;
      if (contentSnap.exists()) { await deleteDoc(contentRef); deleted = 1; }
      return updateJobProgress(jobRef, job, 'content', deleted, true);
    }
    if (job.phase === 'score_tracking') return processScoreTrackingReferences(job, jobRef, me);
    if (job.phase === 'registry_cleanup') return processRegistryReferences(job, jobRef, me, lesson);
    if (job.phase === 'lesson_finalize') {
      const lessonDeleted = lessonSnap.exists() ? 1 : 0;
      const next: LessonPermanentDeleteJobState = {
        ...job,
        status: 'completed', phase: 'completed',
        processed_records: job.processed_records + lessonDeleted,
        deleted_counts: { ...job.deleted_counts, lesson: (job.deleted_counts.lesson || 0) + lessonDeleted },
        last_error: undefined,
      };
      // Parent lesson và trạng thái completed phải commit nguyên tử. Nếu quota/mạng
      // làm batch thất bại, lesson vẫn còn để card Admin có thể Tiếp tục xóa.
      const batch = writeBatch(firestoreDb);
      if (lessonSnap.exists()) batch.delete(lessonRef);
      batch.set(jobRef, {
        schoolId: FIREBASE_SCHOOL_ID, schemaVersion: 2, lesson_id: normalizedLessonId,
        mode: next.mode, status: 'completed', phase: 'completed',
        processed_records: next.processed_records, total_records: next.total_records,
        deleted_counts: next.deleted_counts, archived_grade_records: next.archived_grade_records,
        last_error: '', completed_at: new Date().toISOString(), completedAt: serverTimestamp(),
        updated_at: new Date().toISOString(), updatedAt: serverTimestamp(),
      }, { merge: true });
      await batch.commit();
      return next;
    }
    return job;
  } catch (error) {
    const message = firebaseErrorMessage(error);
    const retryable: LessonPermanentDeleteJobState = { ...job, status: 'retryable', last_error: message };
    try { await writeLessonPurgeJob(jobRef, retryable); } catch { /* giữ phase đã commit gần nhất */ }
    return retryable;
  }
}

/**
 * Wrapper tương thích tên API cũ. V6.88.2 bắt đầu job thay vì từ chối bài đã có dữ liệu.
 */
export async function purgeFirebaseArchivedLesson(lessonId: string, mode: LessonPermanentDeleteMode = 'preserve_grades'): Promise<LessonPermanentDeleteJobState | false> {
  return startFirebaseArchivedLessonPurge(lessonId, mode);
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

function preLessonSyncError(code: string, message: string, cause?: unknown) {
  const error = new Error(message);
  (error as any).diagnosticCode = code;
  if ((cause as any)?.code) (error as any).code = (cause as any).code;
  (error as any).cause = cause;
  return error;
}

function preLessonVideoId(value: unknown) {
  const raw = clean(value);
  if (!raw) return '';
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{6,})/i,
    /[?&]v=([A-Za-z0-9_-]{6,})/i,
  ];
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match?.[1]) return match[1];
  }
  return raw.slice(0, 120);
}

function preLessonSubmissionDeadline(lessonData: any) {
  const raw = clean(lessonData?.pre_lesson_deadline || lessonData?.thoi_gian_bat_dau);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizePreLessonSubmissionData(
  submissionId: string,
  data: any,
  context: { lessonId?: string; lessonData?: any; memberData?: any } = {},
): PreLessonSubmission {
  const submittedAt = data?.submittedAt?.toDate instanceof Function
    ? data.submittedAt.toDate().toISOString()
    : clean(data?.submitted_at || data?.client_submitted_at);
  const lessonData = context.lessonData || {};
  const member = context.memberData || {};
  const lessonId = clean(data?.lessonId || data?.lesson_id || context.lessonId);
  const revision = Math.max(1, Math.floor(Number(data?.videoRevision ?? data?.video_revision ?? lessonData?.pre_lesson_video_revision ?? 1)));
  const threshold = Math.max(50, Math.min(100, Number(data?.requiredPercent ?? data?.required_percent ?? lessonData?.pre_lesson_completion_threshold ?? 80) || 80));
  const percent = Math.max(0, Math.min(100, Number(data?.watchPercent ?? data?.watch_percent ?? 0)));
  const watched = Math.max(0, Number(data?.watchedSeconds ?? data?.watched_seconds ?? 0));
  const duration = Math.max(0, Number(data?.durationSeconds ?? data?.duration_seconds ?? 0));
  const deadline = preLessonSubmissionDeadline(lessonData);
  const submittedDate = submittedAt ? new Date(submittedAt) : null;
  const onTime = !deadline || !submittedDate || Number.isNaN(submittedDate.getTime()) || submittedDate.getTime() <= deadline.getTime();
  return {
    submission_id: submissionId,
    lesson_id: lessonId,
    user_id: clean(data?.user_id || member?.userId || member?.user_id || member?.studentCode || member?.ma_hoc_sinh),
    ownerUid: clean(data?.ownerUid),
    schoolId: clean(data?.schoolId || FIREBASE_SCHOOL_ID),
    khoi: clean(data?.khoi || member?.grade || member?.khoi || lessonData?.khoi),
    lop_id: clean(data?.lop_id || member?.classId || member?.lop_id || member?.class_id),
    video_id: clean(data?.videoId || data?.video_id),
    video_revision: revision,
    required_percent: threshold,
    watch_percent: percent,
    watched_seconds: watched,
    duration_seconds: duration,
    preparation_status: onTime ? 'prepared' : 'late_completed',
    submitted_at: submittedAt,
    completed_before_deadline: onTime,
    schemaVersion: Math.max(1, Number(data?.schemaVersion || 1)),
  };
}

export async function getFirebasePreLessonSubmission(lessonId: string): Promise<PreLessonSubmission | null> {
  const me = await identity();
  if (me.role !== 'student') return null;
  const normalizedLessonId = clean(lessonId);
  const lessonSnap = await getDoc(doc(lessons(), normalizedLessonId));
  if (!lessonSnap.exists()) return null;
  const lessonData = lessonSnap.data() as any;
  const videoRevision = Math.max(1, Math.floor(Number(lessonData?.pre_lesson_video_revision || 1)));
  const ref = lessonPreparationSubmissionRef(normalizedLessonId, me.uid, videoRevision);
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) return normalizePreLessonSubmissionData(snap.id, snap.data() as any, { lessonId: normalizedLessonId, lessonData, memberData: me });

    // Tương thích kết quả V6.86/V6.87 đã lưu ở collection chung. Chỉ dùng để đọc,
    // mọi submission mới từ V6.88.0 đi vào subcollection của bài học.
    const legacy = await getDoc(legacyPreLessonSubmissionRef(clean(me.userId), normalizedLessonId));
    if (!legacy.exists()) return null;
    const normalized = normalizePreLessonSubmissionData(legacy.id, legacy.data() as any, { lessonId: normalizedLessonId, lessonData, memberData: me });
    return normalized.video_revision === videoRevision ? normalized : null;
  } catch (error) {
    const code = String((error as any)?.code || '').toLowerCase();
    if (code.includes('permission-denied')) throw preLessonSyncError('PRELESSON_SUBMISSION_LOAD_DENIED', 'Chưa tải được trạng thái kết quả chuẩn bị bài. Tiến độ xem của em vẫn được giữ.', error);
    if (code.includes('unavailable') || code.includes('network') || code.includes('offline')) throw preLessonSyncError('PRELESSON_NETWORK', 'Kết nối đang gián đoạn. Tiến độ xem của em vẫn được giữ.', error);
    throw error;
  }
}

export async function submitFirebasePreLessonSubmission(
  lessonId: string,
  payload: Pick<PreLessonSubmission, 'watch_percent' | 'watched_seconds' | 'duration_seconds'>,
): Promise<PreLessonSubmission> {
  const me = await identity();
  if (me.role !== 'student') throw preLessonSyncError('PRELESSON_SUBMIT_ROLE_INVALID', 'Chỉ học sinh mới gửi kết quả chuẩn bị bài.');
  const normalizedLessonId = clean(lessonId);
  const lessonSnap = await getDoc(doc(lessons(), normalizedLessonId));
  if (!lessonSnap.exists()) throw preLessonSyncError('PRELESSON_LESSON_NOT_FOUND', 'Không tìm thấy bài học.');
  const lessonData = lessonSnap.data() as any;
  if (!matchesMemberAudience(lessonData, me)) throw preLessonSyncError('PRELESSON_AUDIENCE_DENIED', 'Video chuẩn bị không thuộc phạm vi lớp/khối của em.');
  if (lessonData.pre_lesson_enabled === false || !clean(lessonData.intro_video_url || lessonData.intro_video_embed_url)) {
    throw preLessonSyncError('PRELESSON_DISABLED', 'Bài học chưa bật nhiệm vụ video chuẩn bị.');
  }

  const threshold = Math.max(50, Math.min(100, Number(lessonData.pre_lesson_completion_threshold || 80) || 80));
  const duration = Math.max(0, Math.round(Number(payload.duration_seconds || 0)));
  const watched = Math.max(0, Math.round(Number(payload.watched_seconds || 0)));
  const percent = Math.max(0, Math.min(100, Number(payload.watch_percent || 0)));
  const minimumWatched = duration > 0 ? Math.floor((duration * threshold) / 100) : 0;
  if (duration <= 0 || percent + 0.001 < threshold || watched + 1 < minimumWatched) {
    throw preLessonSyncError('PRELESSON_NOT_ELIGIBLE', `Em cần xem đủ ít nhất ${threshold}% nội dung video trước khi gửi kết quả chuẩn bị bài.`);
  }

  const videoRevision = Math.max(1, Math.floor(Number(lessonData.pre_lesson_video_revision || 1)));
  const ref = lessonPreparationSubmissionRef(normalizedLessonId, me.uid, videoRevision);
  const current = await getDoc(ref);
  if (current.exists()) {
    return normalizePreLessonSubmissionData(current.id, current.data() as any, { lessonId: normalizedLessonId, lessonData, memberData: me });
  }

  // V6.88.6: security envelope thực sự tối giản và gắn với Firebase Auth UID.
  // Không lặp lại user_id/lớp/khối/deadline/status từ client. Trước đây schema v3
  // vẫn ghi user_id rồi Rules so sánh với member.userId; hồ sơ legacy có kiểu/field
  // khác nhau có thể đọc bài bình thường nhưng bị permission-denied khi nộp kết quả.
  // Teacher analytics suy ra user_id/lớp/khối từ member document bằng ownerUid.
  // V6.88.12: làm sạch các giá trị primitive trước, sau đó mới gắn
  // serverTimestamp() để FieldValue của Firestore không bị duyệt đệ quy.
  const data = {
    ...withoutUndefined({
      schemaVersion: 4,
      lessonId: normalizedLessonId,
      ownerUid: clean(me.uid),
      videoRevision,
      watchPercent: percent,
      watchedSeconds: watched,
      durationSeconds: duration,
    }),
    submittedAt: serverTimestamp(),
  };

  try {
    await setDoc(ref, data, { merge: false });
  } catch (error) {
    const code = String((error as any)?.code || '').toLowerCase();
    // Idempotent: nếu request đầu đã commit nhưng client nhận lỗi/timeout, đọc lại
    // canonical document và coi là thành công thay vì yêu cầu học sinh nộp lần nữa.
    try {
      const after = await getDoc(ref);
      if (after.exists()) return normalizePreLessonSubmissionData(after.id, after.data() as any, { lessonId: normalizedLessonId, lessonData, memberData: me });
    } catch { /* giữ lỗi gốc */ }
    if (code.includes('permission-denied')) throw preLessonSyncError('PRELESSON_SUBMIT_RULES_DENIED', 'Chưa gửi được kết quả chuẩn bị bài. Tiến độ xem của em vẫn được giữ an toàn; hãy thử gửi lại.', error);
    if (code.includes('unavailable') || code.includes('network') || code.includes('offline')) throw preLessonSyncError('PRELESSON_NETWORK', 'Mạng chưa ổn định khi gửi kết quả chuẩn bị bài.', error);
    throw error;
  }

  try {
    const verify = await getDoc(ref);
    if (!verify.exists()) throw preLessonSyncError('PRELESSON_SUBMIT_VERIFY_FAILED', 'Kết quả đang được đồng bộ. Tiến độ xem của em vẫn được giữ an toàn.');
    const result = normalizePreLessonSubmissionData(verify.id, verify.data() as any, { lessonId: normalizedLessonId, lessonData, memberData: me });
    if (result.video_revision !== videoRevision || Number(result.watch_percent || 0) + 0.001 < threshold) {
      throw preLessonSyncError('PRELESSON_SUBMIT_VERIFY_FAILED', 'Kết quả chuẩn bị bài đang được đồng bộ. Vui lòng thử lại sau ít phút.');
    }
    return result;
  } catch (error) {
    if ((error as any)?.diagnosticCode) throw error;
    const code = String((error as any)?.code || '').toLowerCase();
    if (code.includes('permission-denied')) throw preLessonSyncError('PRELESSON_SUBMIT_VERIFY_DENIED', 'Kết quả chuẩn bị bài đang được đồng bộ. Vui lòng tải lại và kiểm tra sau ít phút.', error);
    if (code.includes('unavailable') || code.includes('network') || code.includes('offline')) throw preLessonSyncError('PRELESSON_NETWORK', 'Đã gửi kết quả nhưng kết nối đang gián đoạn. Vui lòng tải lại và kiểm tra sau ít phút.', error);
    throw preLessonSyncError('PRELESSON_SUBMIT_VERIFY_FAILED', 'Kết quả chuẩn bị bài chưa được xác nhận. Vui lòng thử lại.', error);
  }
}

export async function listFirebasePreLessonSubmissions(filters: Record<string, unknown> = {}): Promise<PreLessonSubmission[]> {
  const me = await identity();
  const filterLessonId = clean(filters.lesson_id);
  const filterUserId = clean(filters.user_id);
  const filterClassId = clean(filters.lop_id);
  const filterGrade = clean(filters.khoi);

  if (me.role === 'student') {
    if (!filterLessonId) return [];
    const own = await getFirebasePreLessonSubmission(filterLessonId);
    return own ? [own] : [];
  }

  const candidateLessons = filterLessonId
    ? (await Promise.all([getDoc(doc(lessons(), filterLessonId))])).filter((item) => item.exists()).map((item) => row(item.data(), item.id))
    : await listFirebaseLessons(filterGrade ? { khoi: filterGrade } : {});
  const eligibleLessons = candidateLessons.filter((lesson) => {
    if (clean(lesson.trang_thai) === 'archived') return false;
    if (filterGrade && !sameGrade(lesson.khoi, filterGrade)) return false;
    if (filterClassId && clean(lesson.lop_id) && clean(lesson.lop_id) !== filterClassId) return false;
    return true;
  });

  const lessonDataById = new Map<string, LessonRow>(eligibleLessons.map((lesson) => [lesson.lesson_id, lesson]));
  const submissionDocs = await Promise.all(eligibleLessons.map(async (lesson) => {
    try {
      const snap = await getAllQueryDocs(lessonPreparationSubmissionsCollection(lesson.lesson_id));
      return snap.docs.map((item) => ({ item, lesson }));
    } catch (error) {
      const code = String((error as any)?.code || '').toLowerCase();
      if (code.includes('permission-denied')) throw error;
      return [];
    }
  }));
  const flattened = submissionDocs.flat();
  const memberCache = new Map<string, any>();
  const memberLoadErrors: string[] = [];
  const uniqueUids: string[] = Array.from(new Set<string>(flattened.map(({ item }) => clean((item.data() as any)?.ownerUid)).filter(Boolean)));
  await Promise.all(uniqueUids.map(async (uid) => {
    try {
      const memberSnap = await getDoc(doc(school(), 'members', uid));
      if (memberSnap.exists()) memberCache.set(uid, memberSnap.data());
      else memberLoadErrors.push(`${uid}:missing-member`);
    } catch (error) {
      memberLoadErrors.push(`${uid}:${String((error as any)?.code || 'member-load-failed')}`);
    }
  }));

  const merged = new Map<string, PreLessonSubmission>();
  flattened.forEach(({ item, lesson }) => {
    const raw = item.data() as any;
    const ownerUid = clean(raw?.ownerUid);
    const member = memberCache.get(ownerUid) || {};
    const normalized = normalizePreLessonSubmissionData(item.id, raw, { lessonId: lesson.lesson_id, lessonData: lesson, memberData: member });
    if (normalized.video_revision !== Math.max(1, Number(lesson.pre_lesson_video_revision || 1))) return;
    const identityKey = ownerUid ? `uid:${ownerUid}` : `user:${clean(normalized.user_id)}`;
    merged.set(`${identityKey}__${lesson.lesson_id}`, normalized);
  });

  // Tương thích submissions cũ: chỉ đọc best-effort, dữ liệu V6.88.0 luôn ưu tiên.
  try {
    const legacyBase = namedCollection('preLessonSubmissions');
    let legacyTarget: any = legacyBase;
    if (filterLessonId) legacyTarget = query(legacyBase, where('lesson_id', '==', filterLessonId));
    else if (filterUserId) legacyTarget = query(legacyBase, where('user_id', '==', filterUserId));
    else if (filterGrade) legacyTarget = query(legacyBase, where('khoi', '==', filterGrade));
    const legacySnap = await getAllQueryDocs(legacyTarget);
    legacySnap.docs.forEach((item) => {
      const raw = item.data() as any;
      const lessonId = clean(raw?.lesson_id);
      const lesson = lessonDataById.get(lessonId);
      if (!lesson) return;
      const normalized = normalizePreLessonSubmissionData(item.id, raw, { lessonId, lessonData: lesson });
      const key = `user:${clean(normalized.user_id)}__${lessonId}`;
      const alreadyCanonical = Array.from(merged.values()).some((value) => clean(value.lesson_id) === lessonId
        && ((clean(value.ownerUid) && clean(value.ownerUid) === clean(normalized.ownerUid))
          || (clean(value.user_id) && clean(value.user_id) === clean(normalized.user_id))));
      if (!alreadyCanonical && normalized.video_revision === Math.max(1, Number(lesson.pre_lesson_video_revision || 1))) merged.set(key, normalized);
    });
  } catch { /* legacy không được phép làm hỏng analytics mới */ }

  const filtered = Array.from(merged.values()).filter((item) => {
    if (filterLessonId && clean(item.lesson_id) !== filterLessonId) return false;
    if (filterUserId && clean(item.user_id) !== filterUserId) return false;
    if (filterClassId && !sameClassId(item.lop_id, filterClassId)) return false;
    if (filterGrade && !sameGrade(item.khoi, filterGrade)) return false;
    if (me.role === 'teacher' && me.adminPermission !== true && !teacherCanManageGrade(me, item.khoi)) return false;
    return true;
  });
  if (!filtered.length && flattened.length > 0 && memberLoadErrors.length > 0 && (filterClassId || filterUserId)) {
    throw preLessonSyncError('PRELESSON_MEMBER_LOOKUP_FAILED', `Có ${memberLoadErrors.length} kết quả chuẩn bị chưa ghép được với hồ sơ học sinh. Hệ thống không hiển thị 0 giả cho phạm vi đang chọn.`, memberLoadErrors);
  }
  return filtered;
}


export function subscribeFirebasePreLessonSubmissionChanges(
  filters: Record<string, unknown>,
  onChange: () => void,
  onError?: (error: unknown) => void,
) {
  let cancelled = false;
  const unsubscribers: Array<() => void> = [];
  const filterLessonId = clean(filters.lesson_id);
  const filterGrade = clean(filters.khoi);

  void (async () => {
    const me = await identity();
    if (me.role === 'student') return;
    const candidateLessons = filterLessonId
      ? [await getDoc(doc(lessons(), filterLessonId))].filter((snap) => snap.exists()).map((snap) => row(snap.data(), snap.id))
      : await listFirebaseLessons(filterGrade ? { khoi: filterGrade } : {});
    const eligible = candidateLessons.filter((lesson) => clean(lesson.trang_thai) !== 'archived' && (!filterGrade || sameGrade(lesson.khoi, filterGrade)));
    eligible.forEach((lesson) => {
      if (cancelled) return;
      let initialized = false;
      const unsubscribe = onSnapshot(
        lessonPreparationSubmissionsCollection(lesson.lesson_id),
        () => {
          // Snapshot đầu chỉ xác nhận listener. Những snapshot tiếp theo là thay đổi
          // thật và kích hoạt reload phạm vi analytics để join lại với roster.
          if (initialized) onChange();
          initialized = true;
        },
        (error) => onError?.(error),
      );
      unsubscribers.push(unsubscribe);
    });
  })().catch((error) => onError?.(error));

  return () => {
    cancelled = true;
    unsubscribers.splice(0).forEach((unsubscribe) => unsubscribe());
  };
}

export async function getFirebasePreLessonProgress(lessonId: string): Promise<PreLessonProgress | null> {
  const me = await identity();
  if (me.role !== 'student') return null;
  const normalizedLessonId = clean(lessonId);
  const canonicalRef = preLessonProgressRef(clean(me.userId), normalizedLessonId);

  // V6.85.2: canonical GET là đường đọc chính. Chỉ khi canonical chưa tồn tại
  // mới query legacy một lần để khôi phục tiến độ cũ.
  try {
    const canonicalSnap = await getDoc(canonicalRef);
    if (canonicalSnap.exists()) return normalizePreLessonProgressData(canonicalSnap.id, canonicalSnap.data() as any);
  } catch (error) {
    const code = String((error as any)?.code || '').toLowerCase();
    if (code.includes('permission-denied')) throw preLessonSyncError('PRELESSON_LOAD_DENIED', 'Firestore từ chối đọc tiến độ chuẩn bị bài canonical.', error);
    if (code.includes('unavailable') || code.includes('network') || code.includes('offline')) throw preLessonSyncError('PRELESSON_NETWORK', 'Không thể đọc tiến độ chuẩn bị bài do kết nối Firestore chưa ổn định.', error);
    throw error;
  }

  try {
    const snap = await getDocs(query(namedCollection('preLessonProgress'), where('user_id', '==', clean(me.userId))));
    const candidates = snap.docs
      .filter((item) => clean((item.data() as any).lesson_id) === normalizedLessonId)
      .map((item) => normalizePreLessonProgressData(item.id, item.data() as any))
      .sort((a, b) => Number(b.watch_percent || 0) - Number(a.watch_percent || 0)
        || Number(b.watched_seconds || 0) - Number(a.watched_seconds || 0));
    return candidates[0] || null;
  } catch (error) {
    const code = String((error as any)?.code || '').toLowerCase();
    if (code.includes('permission-denied')) throw preLessonSyncError('PRELESSON_LOAD_DENIED', 'Firestore từ chối đọc dữ liệu chuẩn bị bài legacy.', error);
    if (code.includes('unavailable') || code.includes('network') || code.includes('offline')) throw preLessonSyncError('PRELESSON_NETWORK', 'Không thể đọc dữ liệu chuẩn bị bài legacy do kết nối Firestore chưa ổn định.', error);
    throw error;
  }
}

export async function saveFirebasePreLessonProgress(lessonId: string, patch: Partial<PreLessonProgress>): Promise<PreLessonProgress> {
  const me = await identity();
  if (me.role !== 'student') throw preLessonSyncError('PRELESSON_ROLE_INVALID', 'Chỉ học sinh mới ghi tiến độ video trước bài.');
  const normalizedLessonId = clean(lessonId);
  const lessonSnap = await getDoc(doc(lessons(), normalizedLessonId));
  if (!lessonSnap.exists()) throw preLessonSyncError('PRELESSON_LESSON_NOT_FOUND', 'Không tìm thấy bài học.');
  const lessonData = lessonSnap.data() as any;
  if (!matchesMemberAudience(lessonData, me)) throw preLessonSyncError('PRELESSON_AUDIENCE_DENIED', 'Video trước bài không thuộc phạm vi lớp/khối của em.');
  if (lessonData.pre_lesson_enabled === false || !clean(lessonData.intro_video_url || lessonData.intro_video_embed_url)) {
    throw preLessonSyncError('PRELESSON_DISABLED', 'Bài học chưa bật nhiệm vụ video trước bài.');
  }

  const now = new Date().toISOString();
  const threshold = Math.max(50, Math.min(100, Number(lessonData.pre_lesson_completion_threshold || 80)));
  const deadlineRaw = clean(lessonData.pre_lesson_deadline || lessonData.thoi_gian_bat_dau);
  const deadlineMs = deadlineRaw ? new Date(deadlineRaw).getTime() : NaN;
  const ref = preLessonProgressRef(clean(me.userId), normalizedLessonId);

  let canonicalExists = false;
  let canonicalData: any = {};
  try {
    const canonicalSnap = await getDoc(ref);
    canonicalExists = canonicalSnap.exists();
    if (canonicalExists) canonicalData = canonicalSnap.data() as any;
  } catch (error) {
    const code = String((error as any)?.code || '').toLowerCase();
    if (code.includes('permission-denied')) throw preLessonSyncError('PRELESSON_LOAD_DENIED', 'Không đọc được progress canonical trước khi đồng bộ.', error);
    if (code.includes('unavailable') || code.includes('network') || code.includes('offline')) throw preLessonSyncError('PRELESSON_NETWORK', 'Mạng chưa ổn định khi chuẩn bị đồng bộ tiến độ.', error);
    throw error;
  }

  // Chỉ đọc legacy khi canonical chưa tồn tại. Sau lần ghi đầu tiên, mọi cập nhật
  // đi thẳng vào {userId}_{lessonId} để giảm read trên Firestore Spark.
  let legacyBest: any = {};
  if (!canonicalExists) {
    try {
      const ownedProgressSnap = await getDocs(query(namedCollection('preLessonProgress'), where('user_id', '==', clean(me.userId))));
      const matchingProgress = ownedProgressSnap.docs
        .filter((item) => clean((item.data() as any).lesson_id) === normalizedLessonId)
        .sort((a, b) => Number((b.data() as any).watch_percent || 0) - Number((a.data() as any).watch_percent || 0)
          || Number((b.data() as any).watched_seconds || 0) - Number((a.data() as any).watched_seconds || 0));
      legacyBest = matchingProgress[0]?.data() as any || {};
    } catch {
      // Legacy chỉ là nguồn khôi phục; patch hiện tại vẫn đủ để tạo canonical.
    }
  }

  const currentData = canonicalExists
    ? canonicalData
    : (Number(legacyBest.watch_percent || 0) > Number(canonicalData.watch_percent || 0) ? legacyBest : canonicalData);
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

  try {
    await setDoc(ref, data, { merge: true });
  } catch (error) {
    const code = String((error as any)?.code || '').toLowerCase();
    const diag = canonicalExists ? 'PRELESSON_UPDATE_DENIED' : 'PRELESSON_CREATE_DENIED';
    if (code.includes('permission-denied')) throw preLessonSyncError(diag, `Firestore từ chối ${canonicalExists ? 'cập nhật' : 'tạo'} tiến độ chuẩn bị bài.`, error);
    if (code.includes('unavailable') || code.includes('network') || code.includes('offline')) throw preLessonSyncError('PRELESSON_NETWORK', 'Kết nối Firestore bị gián đoạn khi ghi tiến độ chuẩn bị bài.', error);
    throw error;
  }

  // Read-after-write verification: chỉ báo thành công khi canonical document
  // thật sự phản ánh ít nhất độ phủ vừa gửi.
  try {
    const verifySnap = await getDoc(ref);
    if (!verifySnap.exists()) throw preLessonSyncError('PRELESSON_VERIFY_FAILED', 'Đã gửi dữ liệu nhưng chưa đọc lại được progress canonical.');
    const verified = normalizePreLessonProgressData(verifySnap.id, verifySnap.data() as any);
    if (Number(verified.watched_seconds || 0) + 0.001 < watched || Number(verified.watch_percent || 0) + 0.001 < percent) {
      throw preLessonSyncError('PRELESSON_VERIFY_FAILED', 'Firestore chưa phản ánh đầy đủ tiến độ vừa đồng bộ.');
    }
    return verified;
  } catch (error) {
    if ((error as any)?.diagnosticCode) throw error;
    const code = String((error as any)?.code || '').toLowerCase();
    if (code.includes('permission-denied')) throw preLessonSyncError('PRELESSON_VERIFY_DENIED', 'Đã ghi nhưng Firestore từ chối bước xác minh tiến độ.', error);
    if (code.includes('unavailable') || code.includes('network') || code.includes('offline')) throw preLessonSyncError('PRELESSON_NETWORK', 'Đã gửi tiến độ nhưng chưa thể xác minh do kết nối Firestore.', error);
    throw preLessonSyncError('PRELESSON_VERIFY_FAILED', 'Không xác minh được tiến độ sau khi đồng bộ.', error);
  }
}


function scoreTrackingConfigId(academicYear: string, subjectId: string, grade: string, classId = '') {
  const normalizePart = (value: string) => clean(value).replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'all';
  return [normalizePart(academicYear), normalizePart(subjectId), normalizePart(grade), normalizePart(classId || 'all')].join('__');
}

function normalizeScoreTrackingConfig(id: string, raw: any, inherited = false): ScoreTrackingConfig {
  const list = (value: unknown) => Array.from(new Set(cleanStringList(value)));
  return {
    config_id: id,
    academic_year: clean(raw?.academic_year),
    subject_id: clean(raw?.subject_id),
    grade: clean(raw?.grade).replace(/\.0+$/, ''),
    class_id: clean(raw?.class_id),
    midterm1_lesson_ids: list(raw?.midterm1_lesson_ids),
    finalterm1_lesson_ids: list(raw?.finalterm1_lesson_ids),
    midterm2_lesson_ids: list(raw?.midterm2_lesson_ids),
    finalterm2_lesson_ids: list(raw?.finalterm2_lesson_ids),
    annual_mode: raw?.annual_mode === 'manual' ? 'manual' : 'auto',
    annual_lesson_ids: list(raw?.annual_lesson_ids),
    schemaVersion: Number(raw?.schemaVersion || 1),
    schoolId: clean(raw?.schoolId),
    updatedByUid: clean(raw?.updatedByUid),
    updatedByName: clean(raw?.updatedByName),
    updated_at: clean(raw?.updated_at),
    inherited_from_grade: inherited,
    milestone_status: raw?.milestone_status && typeof raw.milestone_status === 'object' ? raw.milestone_status : {},
    milestone_locked_at: raw?.milestone_locked_at && typeof raw.milestone_locked_at === 'object' ? raw.milestone_locked_at : {},
    milestone_locked_by_name: raw?.milestone_locked_by_name && typeof raw.milestone_locked_by_name === 'object' ? raw.milestone_locked_by_name : {},
  };
}

/**
 * V6.84.1: cấu hình các mốc tính điểm được đọc theo document ID xác định,
 * tránh LIST/query toàn collection trên Spark. Nếu lớp chưa có override thì
 * tự kế thừa cấu hình chung theo năm học + môn + khối.
 */
export async function getFirebaseScoreTrackingConfig(scope: { academicYear: string; subjectId: string; grade: string; classId?: string }): Promise<ScoreTrackingConfig | null> {
  const me = await identity();
  const academicYear = clean(scope.academicYear);
  const subjectId = clean(scope.subjectId);
  const grade = clean(scope.grade).replace(/\.0+$/, '');
  const classId = clean(scope.classId);
  if (!academicYear || !subjectId || !grade) return null;
  if (me.role === 'teacher' && me.adminPermission !== true) assertTeacherCanManageGrade(me, grade);

  if (classId) {
    const classIdDoc = scoreTrackingConfigId(academicYear, subjectId, grade, classId);
    const classSnap = await getDoc(doc(school(), 'scoreTrackingConfigs', classIdDoc));
    if (classSnap.exists()) return normalizeScoreTrackingConfig(classSnap.id, classSnap.data());
  }
  const gradeDocId = scoreTrackingConfigId(academicYear, subjectId, grade, '');
  const gradeSnap = await getDoc(doc(school(), 'scoreTrackingConfigs', gradeDocId));
  if (!gradeSnap.exists()) return null;
  return normalizeScoreTrackingConfig(gradeSnap.id, gradeSnap.data(), Boolean(classId));
}

export async function saveFirebaseScoreTrackingConfig(config: Omit<ScoreTrackingConfig, 'config_id' | 'schemaVersion' | 'schoolId' | 'updatedByUid' | 'updatedByName' | 'updated_at' | 'inherited_from_grade'>): Promise<ScoreTrackingConfig> {
  const me = await identity();
  if (!(me.role === 'admin' || me.adminPermission === true || me.role === 'teacher')) throw new Error('Chỉ giáo viên hoặc quản trị viên được cấu hình mốc tính điểm.');
  const academicYear = clean(config.academic_year);
  const subjectId = clean(config.subject_id);
  const grade = clean(config.grade).replace(/\.0+$/, '');
  const classId = clean(config.class_id);
  if (!academicYear || !subjectId || !grade) throw new Error('Hãy chọn năm học, môn học và khối trước khi lưu cấu hình mốc điểm.');
  if (me.role === 'teacher' && me.adminPermission !== true) assertTeacherCanManageGrade(me, grade);
  const id = scoreTrackingConfigId(academicYear, subjectId, grade, classId);
  const unique = (value: unknown) => Array.from(new Set(cleanStringList(value))).slice(0, 100);
  const now = new Date().toISOString();
  const data = {
    schoolId: FIREBASE_SCHOOL_ID,
    schemaVersion: 1,
    academic_year: academicYear,
    subject_id: subjectId,
    grade,
    class_id: classId,
    midterm1_lesson_ids: unique(config.midterm1_lesson_ids),
    finalterm1_lesson_ids: unique(config.finalterm1_lesson_ids),
    midterm2_lesson_ids: unique(config.midterm2_lesson_ids),
    finalterm2_lesson_ids: unique(config.finalterm2_lesson_ids),
    annual_mode: config.annual_mode === 'manual' ? 'manual' : 'auto',
    annual_lesson_ids: unique(config.annual_lesson_ids),
    milestone_status: config.milestone_status || {},
    milestone_locked_at: config.milestone_locked_at || {},
    milestone_locked_by_name: config.milestone_locked_by_name || {},
    updatedByUid: me.uid,
    updatedByName: clean(me.displayName || me.userId),
    updated_at: now,
    updatedAt: serverTimestamp(),
  };
  await setDoc(doc(school(), 'scoreTrackingConfigs', id), data, { merge: true });
  return normalizeScoreTrackingConfig(id, data);
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
    if (filterClassId && clean(item.lop_id) && clean(item.lop_id) !== filterClassId) return false;
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

export async function getFirebaseCurrentMemberClassId(fallbackClassId = ''): Promise<string> {
  const me = await identity();
  return clean(me.classId || fallbackClassId);
}

export async function getFirebaseTeachingSession(lessonId: string, classId?: string): Promise<TeachingSession | null> {
  const me = await identity();
  // V6.80.1: với học sinh luôn ưu tiên classId chuẩn từ hồ sơ Firebase.
  // Trước đây LessonViewer có thể subscribe theo lop_id cache/localStorage khác với
  // member.classId mà Firestore Rules dùng, dẫn tới giáo viên đã mở nhưng học sinh
  // vẫn nghe nhầm teachingSession và nhìn thấy "chưa mở".
  const resolvedClassId = me.role === 'student'
    ? clean(me.classId || classId)
    : clean(classId || me.classId);
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
    schemaVersion: 4,
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
    schemaVersion: 4,
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

export async function startFirebaseLessonRetake(
  lessonId: string,
  officialProgress: LessonProgressRecord,
  mode: 'reference' | 'official_update' = 'reference',
): Promise<LessonRetakeAttempt> {
  const me = await identity();
  if (me.role !== 'student') throw new Error('Chỉ học sinh mới có thể bắt đầu phiên học lại.');
  const normalizedLessonId = clean(lessonId);
  const lessonSnap = await getDoc(doc(lessons(), normalizedLessonId));
  if (!lessonSnap.exists()) throw new Error('Không tìm thấy bài học.');
  const lessonData = lessonSnap.data() as any;
  const officialId = `${clean(me.userId)}_${normalizedLessonId}`;
  const officialRef = doc(school(), 'learningProgress', officialId);
  const officialSnap = await getDoc(officialRef);
  if (!officialSnap.exists()) throw new Error('Chưa có kết quả chính thức để bắt đầu học lại.');
  const officialData = officialSnap.data() as any;
  const officialFinalized = clean(officialData.score_status) === 'finalized'
    || (clean(officialData.status) === 'completed' && Number.isFinite(Number(officialData.assessment_score)));
  const officialRetakePending = clean(officialData.score_status) === 'retake_pending'
    && Number(officialData.official_retake_remaining || 0) > 0
    && clean(officialData.official_retake_grant_id) != ''
    && Number.isFinite(Number(officialData.previous_official_score));

  const officialUpdate = mode === 'official_update';
  if (officialUpdate) {
    if (!(officialFinalized || officialRetakePending)
      || Number(officialData.official_retake_remaining || 0) < 1
      || !clean(officialData.official_retake_grant_id)) {
      throw new Error('Giáo viên chưa cấp quyền học lại để cập nhật điểm hoặc quyền đã được sử dụng.');
    }
  } else {
    if (!officialFinalized) throw new Error('Em cần có điểm chính thức trước khi học lại luyện tập.');
    if (lessonData.allow_retake_after_completion !== true) {
      throw new Error('Bài học này chưa được giáo viên cho phép học lại để luyện tập.');
    }
  }

  // V6.85.1: Firestore Rules are not filters. Student retake reads must
  // explicitly constrain ownerUid so the query is provably authorized.
  const existingSnap = await getDocs(query(
    retakesCollection(officialId),
    where('ownerUid', '==', clean(me.uid)),
    limit(100),
  ));
  const existing = existingSnap.docs.map((item) => item.data() as any);
  const inProgress = existing
    .filter((item) => clean(item.status) === 'in_progress' && clean(item.retake_mode || 'reference') === mode)
    .sort((a, b) => clean(b.updated_at).localeCompare(clean(a.updated_at)))[0];
  if (inProgress) return { ...inProgress, attempt_id: clean(inProgress.attempt_id) } as LessonRetakeAttempt;

  const attemptNumber = Math.max(0, ...existing.map((item) => Number(item.attempt_number || 0))) + 1;
  const attemptId = `RT_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();
  const emptyProgress = {
    ...officialProgress,
    progress_id: officialId,
    status: 'not_started',
    completion_percent: 0,
    completed_steps: 0,
    last_stage: 'khoi_dong',
    updated_at: now,
    step_details: {
      khoi_dong: { opened: false, viewedComplete: false, completed: false, percent: 0, quizAnswered: 0, quizCorrect: 0, quizTotal: 0, quizAnswers: {}, lastVisitedAt: '' },
      hinh_thanh_kien_thuc: { opened: false, viewedComplete: false, completed: false, percent: 0, quizAnswered: 0, quizCorrect: 0, quizTotal: 0, quizAnswers: {}, lastVisitedAt: '' },
      luyen_tap: { opened: false, viewedComplete: false, completed: false, percent: 0, quizAnswered: 0, quizCorrect: 0, quizTotal: 0, quizAnswers: {}, sectionProgress: {}, lastVisitedAt: '' },
      van_dung: { opened: false, viewedComplete: false, completed: false, percent: 0, quizAnswered: 0, quizCorrect: 0, quizTotal: 0, quizAnswers: {}, lastVisitedAt: '' },
      tong_ket: { opened: false, viewedComplete: false, completed: false, percent: 0, quizAnswered: 0, quizCorrect: 0, quizTotal: 0, quizAnswers: {}, lastVisitedAt: '' },
    },
    quiz_total: 0, quiz_answered: 0, quiz_correct: 0, quiz_percent: 0,
    assessment_score: undefined, section_scores: {}, learning_process_score: undefined,
    final_quiz_score: undefined, current_score: undefined, score_status: 'in_progress',
    score_model_version: 4, scored_section_count: 0, scorable_section_count: 0,
    preparation_score: 0, preparation_weight: 0,
    study_mode: 'single', co_learning_session_id: '', co_learner_ids: '', co_learner_user_ids: [], co_learner_names: [],
    result_state: 'valid', result_group_id: `${officialId}__${attemptId}`, result_version: Number(officialData.result_version || 0), retake_allowed: true,
    official_retake_grant_id: officialUpdate ? clean(officialData.official_retake_grant_id) : undefined,
  } as LessonProgressRecord;
  const data = withoutUndefined({
    schoolId: FIREBASE_SCHOOL_ID, schemaVersion: 1, attempt_id: attemptId, attempt_number: attemptNumber,
    lesson_id: normalizedLessonId, user_id: clean(me.userId), ownerUid: clean(me.uid), status: 'in_progress',
    is_official: officialUpdate, retake_mode: mode,
    official_retake_grant_id: officialUpdate ? clean(officialData.official_retake_grant_id) : undefined,
    official_score_snapshot: Number.isFinite(Number(officialData.assessment_score)) ? Number(officialData.assessment_score) : (Number.isFinite(Number(officialData.previous_official_score)) ? Number(officialData.previous_official_score) : undefined),
    completion_percent: 0, score_status: 'in_progress', score_model_version: 4,
    progress: emptyProgress, started_at: now, updated_at: now, updatedAt: serverTimestamp(),
  });
  await setDoc(retakeRef(officialId, attemptId), data, { merge: false });
  return { ...data, progress: emptyProgress } as unknown as LessonRetakeAttempt;
}

export async function saveFirebaseLessonRetake(attempt: LessonRetakeAttempt): Promise<LessonRetakeAttempt> {
  const me = await identity();
  if (me.role !== 'student') throw new Error('Chỉ học sinh mới có thể lưu phiên học lại.');
  const officialId = `${clean(me.userId)}_${clean(attempt.lesson_id)}`;
  const now = new Date().toISOString();
  const progress = withoutUndefined({ ...attempt.progress, preparation_score: 0, preparation_weight: 0, study_mode: 'single' }) as LessonProgressRecord;
  const referenceScore = progress.score_status === 'finalized' && Number.isFinite(Number(progress.assessment_score))
    ? Number(progress.assessment_score)
    : Number.isFinite(Number(progress.current_score)) ? Number(progress.current_score) : undefined;
  const completed = progress.score_status === 'finalized' || progress.status === 'completed';
  const officialUpdate = clean(attempt.retake_mode) === 'official_update' || attempt.is_official === true;
  const data = withoutUndefined({
    ...attempt,
    schoolId: FIREBASE_SCHOOL_ID,
    schemaVersion: 1,
    attempt_id: clean(attempt.attempt_id),
    lesson_id: clean(attempt.lesson_id),
    user_id: clean(me.userId),
    ownerUid: clean(me.uid),
    is_official: officialUpdate,
    retake_mode: officialUpdate ? 'official_update' : 'reference',
    official_retake_grant_id: officialUpdate ? clean(attempt.official_retake_grant_id) : undefined,
    status: completed ? 'completed' : 'in_progress',
    reference_score: referenceScore,
    learning_process_score: progress.learning_process_score,
    final_quiz_score: progress.final_quiz_score,
    completion_percent: Number(progress.completion_percent || 0),
    score_status: progress.score_status,
    score_model_version: 4,
    progress,
    updated_at: now,
    completed_at: completed ? (clean(attempt.completed_at) || now) : '',
    updatedAt: serverTimestamp(),
  });
  await setDoc(retakeRef(officialId, clean(attempt.attempt_id)), data, { merge: true });
  return data as unknown as LessonRetakeAttempt;
}

/** V6.84.1: promote một official retake thành điểm chính thức mới. */
export async function finalizeFirebaseOfficialRetake(attempt: LessonRetakeAttempt): Promise<LessonProgressRecord> {
  const me = await identity();
  if (me.role !== 'student') throw new Error('Chỉ học sinh mới có thể nộp lượt học lại chính thức.');
  if (!(attempt.is_official === true || clean(attempt.retake_mode) === 'official_update')) throw new Error('Đây không phải lượt học lại cập nhật điểm.');
  const progress = attempt.progress;
  if (progress.score_status !== 'finalized' || !Number.isFinite(Number(progress.assessment_score))) throw new Error('Lượt học lại chưa có điểm hợp lệ để cập nhật.');
  const officialId = `${clean(me.userId)}_${clean(attempt.lesson_id)}`;
  const officialRef = doc(school(), 'learningProgress', officialId);
  const attemptRef = retakeRef(officialId, clean(attempt.attempt_id));
  const now = new Date().toISOString();
  const promoted = await runTransaction(firestoreDb, async (tx) => {
    const snap = await tx.get(officialRef);
    if (!snap.exists()) throw new Error('Không tìm thấy kết quả chính thức hiện tại.');
    const current = snap.data() as any;
    const grantId = clean(current.official_retake_grant_id);
    if (Number(current.official_retake_remaining || 0) < 1 || !grantId || grantId !== clean(attempt.official_retake_grant_id)) {
      throw new Error('Quyền học lại cập nhật điểm đã hết hiệu lực.');
    }
    const previousScore = Number.isFinite(Number(current.assessment_score)) ? Number(current.assessment_score) : (Number.isFinite(Number(current.previous_official_score)) ? Number(current.previous_official_score) : undefined);
    const next = withoutUndefined({
      ...progress,
      schoolId: FIREBASE_SCHOOL_ID,
      schemaVersion: 2,
      progress_id: officialId,
      user_id: clean(me.userId),
      ownerUid: clean(current.ownerUid || me.uid),
      lesson_id: clean(attempt.lesson_id),
      result_state: 'valid',
      retake_allowed: true,
      result_version: Math.max(Number(current.result_version || 0) + 1, Date.now()),
      official_retake_remaining: 0,
      official_retake_last_consumed_at: now,
      official_retake_count: Number(current.official_retake_count || 0) + 1,
      previous_official_score: previousScore,
      score_reason: 'official_retake',
      deadline_status: clean(current.deadline_status) === 'missed' ? 'overridden' : clean(current.deadline_status || 'on_time'),
      updated_at: now,
      updatedAt: serverTimestamp(),
    });
    tx.set(officialRef, next, { merge: false });
    tx.set(attemptRef, { status: 'completed', promoted_to_official: true, promoted_at: now, updatedAt: serverTimestamp() }, { merge: true });
    return next as unknown as LessonProgressRecord;
  });
  return promoted;
}

export async function listFirebaseLessonRetakes(lessonId: string): Promise<LessonRetakeAttempt[]> {
  const me = await identity();
  const officialId = `${clean(me.userId)}_${clean(lessonId)}`;
  // V6.85.1: query must carry the same owner constraint required by Rules.
  // Without this filter, Firestore rejects LIST because Rules are not filters.
  const snap = await getDocs(query(
    retakesCollection(officialId),
    where('ownerUid', '==', clean(me.uid)),
    limit(100),
  ));
  return snap.docs.map((item) => ({ attempt_id: item.id, ...item.data() } as unknown as LessonRetakeAttempt))
    .sort((a, b) => Number(b.attempt_number || 0) - Number(a.attempt_number || 0));
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


/**
 * V6.84.1: realtime progress scoped cho bảng Theo dõi của giáo viên/Admin.
 * Listener luôn giữ phạm vi hẹp (khối/lớp/bài) và dùng cùng chiến lược query
 * với listFirebaseProgress để tương thích Rules/Indexes hiện hành.
 */
export function subscribeFirebaseLearningProgress(
  filters: Record<string, unknown>,
  onChange: (items: LessonProgressRecord[]) => void,
  onError?: (error: unknown) => void,
) {
  let cancelled = false;
  const unsubscribers: Array<() => void> = [];
  const latest = new Map<string, LessonProgressRecord[]>();
  const filterUserId = clean(filters.user_id);
  const filterLessonId = clean(filters.lesson_id);
  const filterClassId = clean(filters.lop_id);
  const filterGrade = clean(filters.khoi);

  const emit = () => {
    if (cancelled) return;
    const merged = new Map<string, LessonProgressRecord>();
    latest.forEach((items) => items.forEach((item) => {
      if (filterUserId && clean(item.user_id) !== filterUserId) return;
      if (filterLessonId && clean(item.lesson_id) !== filterLessonId) return;
      if (filterClassId && clean(item.lop_id) && clean(item.lop_id) !== filterClassId) return;
      if (filterGrade && !sameGrade(item.khoi, filterGrade)) return;
      merged.set(item.progress_id, item);
    }));
    onChange(Array.from(merged.values()).sort((a, b) => clean(b.updated_at).localeCompare(clean(a.updated_at))));
  };

  void (async () => {
    const me = await identity();
    if (cancelled) return;
    const base = collection(school(), 'learningProgress');
    const attach = (key: string, target: any) => {
      const unsubscribe = onSnapshot(target, (snapshot) => {
        latest.set(key, snapshot.docs.map((item) => ({ progress_id: item.id, ...item.data() } as unknown as LessonProgressRecord)));
        emit();
      }, (error) => onError?.(error));
      unsubscribers.push(unsubscribe);
    };

    if (me.role === 'admin' || me.adminPermission === true) {
      const constraints: any[] = [];
      if (filterUserId) constraints.push(where('user_id', '==', filterUserId));
      else if (filterLessonId) constraints.push(where('lesson_id', '==', filterLessonId));
      else if (filterClassId) constraints.push(where('lop_id', '==', filterClassId));
      else if (filterGrade) constraints.push(where('khoi', '==', filterGrade));
      // Không mở listener toàn trường trên Spark nếu chưa chọn phạm vi.
      if (!constraints.length) { onChange([]); return; }
      attach('admin', query(base, ...constraints));
      // V6.84.1: đọc thêm progress legacy có lop_id='' để bảng lớp vẫn nhận
      // được điểm cũ. UI sẽ ánh xạ user_id về lớp hiện tại từ danh sách tài khoản.
      if (filterClassId && !filterUserId && !filterLessonId) {
        const legacyConstraints: any[] = [where('lop_id', '==', '')];
        if (filterGrade) legacyConstraints.unshift(where('khoi', '==', filterGrade));
        attach('admin:legacy-empty-class', query(base, ...legacyConstraints));
      }
      return;
    }

    if (me.role === 'teacher') {
      let grades = await teacherQueryGrades(me);
      if (filterGrade) grades = grades.filter((grade) => sameGrade(grade, filterGrade));
      if (!grades.length) { onChange([]); return; }
      grades.forEach((grade) => {
        const constraints: any[] = [where('khoi', '==', grade)];
        if (filterUserId) constraints.push(where('user_id', '==', filterUserId));
        else if (filterLessonId) constraints.push(where('lesson_id', '==', filterLessonId));
        else if (filterClassId) constraints.push(where('lop_id', '==', filterClassId));
        attach(`grade:${grade}`, query(base, ...constraints));
        if (filterClassId && !filterUserId && !filterLessonId) {
          attach(`grade:${grade}:legacy-empty-class`, query(base, where('khoi', '==', grade), where('lop_id', '==', '')));
        }
      });
      return;
    }

    attach('student', query(base, where('ownerUid', '==', me.uid)));
  })().catch((error) => onError?.(error));

  return () => {
    cancelled = true;
    unsubscribers.splice(0).forEach((unsubscribe) => unsubscribe());
  };
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
    // V6.79.0: ưu tiên query theo phạm vi đã chọn thay vì full-scan toàn trường.
    // Chỉ khi không có bất kỳ scope nào mới dùng danh sách đầy đủ (phục vụ các
    // tác vụ quản trị đặc biệt có chủ ý).
    let target: any = query(base, orderBy('updated_at', 'desc'));
    if (filterUserId) target = query(base, where('user_id', '==', filterUserId));
    else if (filterLessonId) target = query(base, where('lesson_id', '==', filterLessonId));
    else if (filterClassId) target = query(base, where('lop_id', '==', filterClassId));
    else if (filterGrade) target = query(base, where('khoi', '==', filterGrade));
    const snap = await getAllQueryDocs(target);
    const merged = new Map<string, QueryDocumentSnapshot<DocumentData>>(snap.docs.map((item) => [item.id, item]));
    if (filterClassId && !filterUserId && !filterLessonId) {
      const legacyTarget = filterGrade
        ? query(base, where('khoi', '==', filterGrade), where('lop_id', '==', ''))
        : query(base, where('lop_id', '==', ''));
      const legacySnap = await getAllQueryDocs(legacyTarget);
      legacySnap.docs.forEach((item) => merged.set(item.id, item));
    }
    docs = Array.from(merged.values());
  } else if (me.role === 'teacher') {
    let grades = await teacherQueryGrades(me);
    if (filterGrade) grades = grades.filter((grade) => sameGrade(grade, filterGrade));
    if (!grades.length) return [];

    const snapshots = await Promise.all(grades.flatMap((grade) => {
      const constraints: any[] = [where('khoi', '==', grade)];
      if (filterUserId) constraints.push(where('user_id', '==', filterUserId));
      else if (filterLessonId) constraints.push(where('lesson_id', '==', filterLessonId));
      else if (filterClassId) constraints.push(where('lop_id', '==', filterClassId));
      const queries = [getAllQueryDocs(query(base, ...constraints))];
      if (filterClassId && !filterUserId && !filterLessonId) {
        queries.push(getAllQueryDocs(query(base, where('khoi', '==', grade), where('lop_id', '==', ''))));
      }
      return queries;
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

  const learningItems = docs.map(item => {
    const row = { progress_id: item.id, ...item.data() } as unknown as LessonProgressRecord;
    // V6.86.0: dữ liệu preLessonProgress cũ không còn là nguồn sự thật của thống kê.
    // Giáo viên chỉ thấy kết quả đã được học sinh chủ động gửi trong preLessonSubmissions.
    row.pre_lesson_status = undefined;
    row.pre_lesson_watch_percent = undefined;
    row.pre_lesson_watched_seconds = undefined;
    row.pre_lesson_completed_at = undefined;
    row.pre_lesson_completed_before_deadline = undefined;
    row.pre_lesson_preparation_status = undefined;
    row.pre_lesson_last_watched_at = undefined;
    return row;
  }).filter(item => {
    if (me.role === 'teacher' && me.adminPermission !== true && !teacherCanManageGrade(me, item.khoi)) return false;
    if (filterUserId && clean(item.user_id) !== filterUserId) return false;
    if (filterLessonId && clean(item.lesson_id) !== filterLessonId) return false;
    if (filterClassId && clean(item.lop_id) && clean(item.lop_id) !== filterClassId) return false;
    if (filterGrade && !sameGrade(item.khoi, filterGrade)) return false;
    return true;
  });
  let preItems: PreLessonSubmission[];
  try {
    preItems = await listFirebasePreLessonSubmissions(filters);
  } catch (error) {
    throw preLessonSyncError('PRELESSON_ANALYTICS_LOAD_FAILED', 'Không tải được kết quả chuẩn bị bài đã gửi từ Firestore; hệ thống không chuyển lỗi thành 0%.', error);
  }
  const byKey = new Map(learningItems.map((item) => [`${clean(item.user_id)}__${clean(item.lesson_id)}`, item]));
  const byUidLesson = new Map<string, LessonProgressRecord>(learningItems
    .filter((item: any) => clean((item as any).ownerUid))
    .map((item: any) => [`${clean(item.ownerUid)}__${clean(item.lesson_id)}`, item] as [string, LessonProgressRecord]));
  preItems.forEach((pre) => {
    const key = `${clean(pre.user_id)}__${clean(pre.lesson_id)}`;
    const uidKey = `${clean(pre.ownerUid)}__${clean(pre.lesson_id)}`;
    const existing = (clean(pre.ownerUid) ? byUidLesson.get(uidKey) : undefined) || byKey.get(key);
    const patch = {
      pre_lesson_status: 'completed' as const,
      pre_lesson_watch_percent: Number(pre.watch_percent || 0),
      pre_lesson_watched_seconds: Number(pre.watched_seconds || 0),
      pre_lesson_completed_at: clean(pre.submitted_at),
      pre_lesson_completed_before_deadline: pre.completed_before_deadline === true,
      pre_lesson_preparation_status: pre.preparation_status,
      pre_lesson_last_watched_at: clean(pre.submitted_at),
    };
    if (existing) {
      Object.assign(existing, { ownerUid: clean(pre.ownerUid) || (existing as any).ownerUid, ...patch });
    } else {
      const syntheticUserId = clean(pre.user_id) || `UID:${clean(pre.ownerUid)}`;
      byKey.set(`${syntheticUserId}__${clean(pre.lesson_id)}`, {
      progress_id: `PRE_${pre.submission_id}`,
      ownerUid: clean(pre.ownerUid),
      user_id: syntheticUserId,
      lesson_id: clean(pre.lesson_id),
      lesson_title: '', mon_hoc: '', khoi: clean(pre.khoi), lop_id: clean(pre.lop_id),
      status: 'not_started', completion_percent: 0, completed_steps: 0, total_steps: 0,
      updated_at: clean(pre.submitted_at),
      step_details: {} as any,
      result_state: 'valid',
      ...patch,
    } as LessonProgressRecord);
    }
  });
  return Array.from(byKey.values());
}

function mergeProgressPayloadMonotonic(current: any, incoming: LessonProgressRecord) {
  const currentSteps = current?.step_details || {};
  const incomingSteps = incoming?.step_details || {};
  const currentFinalized = clean(current?.score_status) === 'finalized' && Number.isFinite(Number(current?.assessment_score));
  const incomingFinalized = clean(incoming?.score_status) === 'finalized' && Number.isFinite(Number(incoming?.assessment_score));
  // V6.88.9: autosave/in-progress packets can arrive after the official submit.
  // Never let such a late packet erase or downgrade a score already finalized on server.
  const preserveOfficialScore = currentFinalized && !incomingFinalized;
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
    section_scores: Number(incoming.score_model_version || 0) >= 3 ? { ...(incoming.section_scores || {}) } : mergedSectionScores,
    learning_process_score: Number(incoming.score_model_version || 0) >= 3
      ? incoming.learning_process_score
      : Math.max(Number(current?.learning_process_score || 0), Number(incoming.learning_process_score || 0)),
    final_quiz_score: preserveOfficialScore
      ? current?.final_quiz_score
      : Number(incoming.score_model_version || 0) >= 3
        ? incoming.final_quiz_score
        : (Number.isFinite(Number(incoming.final_quiz_score)) ? Number(incoming.final_quiz_score) : current?.final_quiz_score),
    current_score: preserveOfficialScore
      ? current?.current_score
      : Number(incoming.score_model_version || 0) >= 3
        ? incoming.current_score
        : (Number.isFinite(Number(incoming.current_score)) ? Number(incoming.current_score) : current?.current_score),
    assessment_score: preserveOfficialScore
      ? current?.assessment_score
      : Number(incoming.score_model_version || 0) >= 3
        ? (incoming.score_status === 'finalized' ? incoming.assessment_score : undefined)
        : (Number.isFinite(Number(incoming.assessment_score)) ? Number(incoming.assessment_score) : current?.assessment_score),
    score_status: preserveOfficialScore ? 'finalized' : (incoming.score_status || current?.score_status),
    status: preserveOfficialScore ? 'completed' : (incoming.status || current?.status),
    score_model_version: Number(incoming.score_model_version || current?.score_model_version || 0) || undefined,
    scored_section_count: incoming.scored_section_count ?? current?.scored_section_count,
    scorable_section_count: incoming.scorable_section_count ?? current?.scorable_section_count,
    preparation_score: Number(incoming.score_model_version || 0) >= 3 ? 0 : incoming.preparation_score ?? current?.preparation_score,
    preparation_weight: Number(incoming.score_model_version || 0) >= 3 ? 0 : incoming.preparation_weight ?? current?.preparation_weight,
    score_calculated_at: preserveOfficialScore ? clean(current?.score_calculated_at) : (clean(incoming.score_calculated_at) || clean(current?.score_calculated_at)),
    last_closed_at: clean(incoming.last_closed_at) || clean(current?.last_closed_at),
  });
}

function progressFirestoreWriteData(data: LessonProgressRecord) {
  const output: Record<string, any> = { ...data, updatedAt: serverTimestamp() };
  if (Number(data.score_model_version || 0) >= 3) {
    // V6.79.0: xóa điểm legacy chưa đủ điều kiện thay vì để điểm cũ tiếp tục hiện.
    if (data.score_status !== 'finalized' || !Number.isFinite(Number(data.assessment_score))) output.assessment_score = deleteField();
    if (!Number.isFinite(Number(data.current_score))) output.current_score = deleteField();
    if (!Number.isFinite(Number(data.learning_process_score))) output.learning_process_score = deleteField();
    if (!Number.isFinite(Number(data.final_quiz_score))) output.final_quiz_score = deleteField();
  }

  if (Number(data.score_model_version || 0) === 4) {
    // V6.84.11: tạo payload Score Model V4 duy nhất, không để trường điểm legacy
    // từ document cũ làm Rules từ chối bài nộp hợp lệ.
    output.section_scores = {};
    output.learning_process_score = deleteField();
    output.preparation_score = 0;
    output.preparation_weight = 0;
    output.learning_component_weight = 0;
    output.scored_section_count = 0;
    output.scorable_section_count = 0;

    const finalExam = data.step_details?.luyen_tap?.finalExam;
    const finalStatus = clean(finalExam?.status);
    const finalSubmitted = ['submitted', 'auto_submitted', 'expired'].includes(finalStatus);
    const finalScore = Number(finalExam?.score ?? data.final_quiz_score);
    const finalQuizExists = Number(finalExam?.total_count || 0) > 0;
    output.final_component_weight = finalQuizExists ? 100 : 0;

    if (data.score_status === 'finalized' && finalSubmitted && finalQuizExists && Number.isFinite(finalScore)) {
      const normalizedScore = Math.round(Math.max(0, Math.min(10, finalScore)) * 10) / 10;
      output.final_quiz_score = normalizedScore;
      output.current_score = normalizedScore;
      output.assessment_score = normalizedScore;
      output.score_status = 'finalized';
      output.score_reason = clean(data.score_reason) || 'submitted';
    }
  }
  return output;
}

async function saveFirebaseProgressNow(payload: LessonProgressRecord) {
  const me = await identity();
  const canonicalUserId = me.role === 'student' ? clean(me.userId) : clean(payload.user_id || me.userId);
  const canonicalLessonId = clean(payload.lesson_id);
  const progressId = payload.study_mode === 'co_learning'
    ? (clean(payload.progress_id) || `${canonicalUserId}_${canonicalLessonId}`)
    : `${canonicalUserId}_${canonicalLessonId}`;
  const now = new Date().toISOString();
  const resultVersion = Math.max(Number(payload.result_version || 0) + 1, Date.now());
  const commonIncoming = withoutUndefined({
    ...payload,
    progress_id: progressId,
    user_id: canonicalUserId,
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
    // V6.79.0: không GET learningProgress của bạn học bằng phiên của host. Rules chỉ
    // cho mỗi học sinh đọc kết quả của chính mình; GET các bạn là nguyên nhân làm
    // thao tác đóng bài học cùng thất bại. Host chỉ đọc document của mình, còn bạn
    // học được batch.set merge trực tiếp với kết quả chung và điểm chuẩn bị cá nhân.
    const ownIndex = participants.findIndex((participant) => participant.uid === clean(me.uid));
    const ownCurrentSnap = ownIndex >= 0
      ? await getDoc(doc(school(), 'learningProgress', `${participants[ownIndex].userId}_${clean(payload.lesson_id)}`)).catch(() => null)
      : null;
    const preparationStatuses = Array.isArray(session.participant_preparation_statuses) ? session.participant_preparation_statuses : [];
    const preparationPercents = Array.isArray(session.participant_preparation_watch_percents) ? session.participant_preparation_watch_percents : [];
    const finalStatus = clean(payload.step_details?.luyen_tap?.finalExam?.status);
    const finalSubmitted = ['submitted', 'auto_submitted', 'expired'].includes(finalStatus);
    const finalQuizExists = Number(payload.step_details?.luyen_tap?.finalExam?.total_count || 0) > 0;
    const sectionItems = Object.values(payload.step_details?.luyen_tap?.sectionProgress || {});
    const allRequiredSectionsCompleted = sectionItems.every((item: any) => clean(item?.status) === 'completed');
    const processAvailable = Number(payload.score_model_version || 0) >= 3
      ? Number(payload.scorable_section_count || 0) > 0
      : Object.keys(payload.section_scores || {}).length > 0;
    const baseLearningWeight = Math.max(0, Number(payload.learning_component_weight || 40));
    const baseFinalWeight = Math.max(0, Number(payload.final_component_weight || 60));
    const groupAssessment = calculateFairAssessmentScore({
      learningProcessScore: payload.learning_process_score,
      learningProcessAvailable: processAvailable,
      finalQuizScore: payload.final_quiz_score,
      finalQuizExists,
      finalSubmitted,
      allRequiredSectionsCompleted,
      learningWeight: baseLearningWeight,
      finalWeight: baseFinalWeight,
    });
    const participantAssessmentScores: number[] = [];
    const batch = writeBatch(firestoreDb);
    let ownProgress: LessonProgressRecord | null = null;
    participants.forEach((participant, index) => {
      const participantProgressId = `${participant.userId}_${clean(payload.lesson_id)}`;
      const currentData = participant.uid === clean(me.uid) && ownCurrentSnap?.exists() ? ownCurrentSnap.data() : {};
      const snapshotStatus = clean(preparationStatuses[index]) || (participant.uid === clean(me.uid) ? clean(payload.pre_lesson_preparation_status) : 'unknown');
      // Snapshot chuẩn bị của nhóm V5 tiếp tục được giữ để báo cáo Có/Chưa chuẩn bị,
      // nhưng từ score model v4 không còn tham gia bất kỳ phép tính điểm nào.
      const visibleGroupScore = groupAssessment.finalScore ?? groupAssessment.currentScore ?? 0;
      participantAssessmentScores[index] = visibleGroupScore;
      const incoming = withoutUndefined({
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
        // Legacy fields giữ bằng 0 để biểu thị rõ video không còn là thành phần điểm.
        preparation_score: 0,
        preparation_weight: 0,
        learning_component_weight: groupAssessment.learningComponentWeight,
        final_component_weight: groupAssessment.finalComponentWeight,
        current_score: groupAssessment.currentScore,
        assessment_score: groupAssessment.finalScore,
        score_status: groupAssessment.scoreStatus,
        score_model_version: 4,
      }) as unknown as LessonProgressRecord;
      const participantData = participant.uid === clean(me.uid)
        ? mergeProgressPayloadMonotonic(currentData, incoming) as LessonProgressRecord
        : incoming as LessonProgressRecord;
      participantData.section_scores = { ...(incoming.section_scores || {}) };
      participantData.learning_process_score = incoming.learning_process_score;
      participantData.final_quiz_score = incoming.final_quiz_score;
      participantData.current_score = groupAssessment.currentScore;
      participantData.assessment_score = groupAssessment.finalScore;
      participantData.preparation_score = 0;
      participantData.preparation_weight = 0;
      participantData.learning_component_weight = groupAssessment.learningComponentWeight;
      participantData.final_component_weight = groupAssessment.finalComponentWeight;
      participantData.score_status = groupAssessment.scoreStatus;
      participantData.score_model_version = 4;
      participantData.score_calculated_at = incoming.score_calculated_at;
      batch.set(doc(school(), 'learningProgress', participantProgressId), progressFirestoreWriteData(participantData), { merge: true });
      if (participant.uid === clean(me.uid)) ownProgress = participantData;
    });
    batch.set(sessionRef, withoutUndefined({
      status: payload.status === 'completed' ? 'completed' : 'active',
      result_group_id: sessionId,
      result_version: resultVersion,
      assessment_score: ownProgress?.score_status === 'finalized' ? ownProgress.assessment_score : undefined,
      participant_assessment_scores: participantAssessmentScores,
      completion_percent: payload.completion_percent,
      last_active_by_uid: me.uid,
      last_active_at: now,
      updatedAt: serverTimestamp(),
    }), { merge: true });
    await batch.commit();
    if (ownIndex >= 0) {
      const ownRef = doc(school(), 'learningProgress', `${participants[ownIndex].userId}_${clean(payload.lesson_id)}`);
      const verifiedOwn = await getDoc(ownRef);
      if (verifiedOwn.exists()) {
        const verified = verifiedOwn.data() as LessonProgressRecord;
        if (clean(ownProgress?.score_status) === 'finalized' && Number.isFinite(Number(ownProgress?.assessment_score))) {
          const expectedScore = Math.round(Math.max(0, Math.min(10, Number(ownProgress?.assessment_score))) * 10) / 10;
          const serverScore = Number(verified.assessment_score);
          if (clean(verified.score_status) !== 'finalized' || !Number.isFinite(serverScore) || Math.abs(serverScore - expectedScore) > 0.001) {
            throw Object.assign(new Error('Điểm bài nộp chưa được ghi nhận đầy đủ. Bài làm của em vẫn được giữ an toàn; hãy thử nộp lại.'), { diagnosticCode: 'LEARNING_SCORE_VERIFY_FAILED' });
          }
        }
        return verified;
      }
      throw Object.assign(new Error('Kết quả đang được đồng bộ. Bài làm của em vẫn được giữ an toàn; hãy thử lại.'), { diagnosticCode: 'LEARNING_RESULT_NOT_CONFIRMED' });
    }
    return ownProgress || common;
  }

  const ref = doc(school(), 'learningProgress', progressId);
  const currentSnap = await getDoc(ref);
  const currentData = currentSnap.exists() ? currentSnap.data() : {};
  const incoming = withoutUndefined({
    ...commonIncoming,
    result_group_id: clean(payload.result_group_id) || `${canonicalUserId}_${canonicalLessonId}`,
  }) as unknown as LessonProgressRecord;
  const data = mergeProgressPayloadMonotonic(currentData, incoming) as LessonProgressRecord;
  await setDoc(ref, progressFirestoreWriteData(data), { merge: true });
  // V6.84.11: read-after-write verification. Chỉ báo lưu thành công khi document
  // chính thức thực sự đọc lại được từ Firestore với version vừa ghi.
  const verifiedSnap = await getDoc(ref);
  if (!verifiedSnap.exists()) throw Object.assign(new Error('Kết quả đang được đồng bộ. Bài làm của em vẫn được giữ an toàn; hãy thử lại.'), { diagnosticCode: 'LEARNING_RESULT_NOT_CONFIRMED' });
  const verified = verifiedSnap.data() as LessonProgressRecord;
  if (Number(verified.result_version || 0) < Number(resultVersion || 0)) {
    throw Object.assign(new Error('Kết quả đang được đồng bộ. Bài làm của em vẫn được giữ an toàn; hãy thử lại.'), { diagnosticCode: 'LEARNING_RESULT_VERSION_NOT_CONFIRMED' });
  }
  if (clean(data.score_status) === 'finalized' && Number.isFinite(Number(data.assessment_score))) {
    const expectedScore = Math.round(Math.max(0, Math.min(10, Number(data.assessment_score))) * 10) / 10;
    const verifiedScore = Number(verified.assessment_score);
    if (clean(verified.score_status) !== 'finalized' || !Number.isFinite(verifiedScore) || Math.abs(verifiedScore - expectedScore) > 0.001) {
      throw Object.assign(new Error('Điểm bài nộp chưa được ghi nhận đầy đủ. Bài làm của em vẫn được giữ an toàn; hãy thử nộp lại.'), { diagnosticCode: 'LEARNING_SCORE_VERIFY_FAILED' });
    }
  }
  return verified;
}

const progressSaveQueues = new Map<string, Promise<unknown>>();

export async function saveFirebaseProgress(payload: LessonProgressRecord) {
  const queueKey = clean(payload.co_learning_session_id) || `${clean(firebaseAuth.currentUser?.uid || payload.user_id)}_${clean(payload.lesson_id)}`;
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

  // V6.84.11: preflight đọc lại dữ liệu thật trước khi tạo batch. Không tin dữ liệu
  // đang hiển thị trong bảng vì progress legacy có thể thiếu khoi/lop_id.
  const selectedRef = doc(school(), 'learningProgress', progressId);
  const selectedSnap = await getDoc(selectedRef);
  if (!selectedSnap.exists()) throw new Error('Không tìm thấy kết quả học tập cần xử lý.');
  const selected = { progress_id: selectedSnap.id, ...selectedSnap.data() } as any;
  const lessonId = clean(selected.lesson_id);
  const targetUserId = clean(selected.user_id);
  if (!lessonId || !targetUserId) {
    throw new Error('Kết quả học tập cũ thiếu mã bài học hoặc mã học sinh. Vui lòng tải lại dữ liệu hoặc chuẩn hóa hồ sơ trước khi cho học lại.');
  }

  // Học lại chính thức luôn sử dụng document canonical {userId}_{lessonId}.
  // Nếu bảng điểm đang trỏ vào một duplicate legacy, ưu tiên canonical để grant
  // xuất hiện đúng nơi học sinh đọc khi bắt đầu official retake.
  const canonicalProgressId = `${targetUserId}_${lessonId}`;
  const canonicalRef = doc(school(), 'learningProgress', canonicalProgressId);
  const canonicalSnap = progressId === canonicalProgressId ? selectedSnap : await getDoc(canonicalRef);
  const canonicalIsValid = canonicalSnap.exists()
    && clean(canonicalSnap.data()?.user_id) === targetUserId
    && clean(canonicalSnap.data()?.lesson_id) === lessonId;
  if (payload.action === 'allow_retake' && !canonicalIsValid) {
    throw new Error('Kết quả học tập đang ở định dạng legacy và chưa có document điểm chính thức chuẩn. Hãy yêu cầu học sinh mở lại bài một lần hoặc chuẩn hóa kết quả trước khi cấp quyền học lại cập nhật điểm.');
  }
  const primarySnap = canonicalIsValid ? canonicalSnap : selectedSnap;
  const primaryRef = canonicalIsValid ? canonicalRef : selectedRef;
  const target = { progress_id: primarySnap.id, ...primarySnap.data() } as any;

  const lessonRef = doc(lessons(), lessonId);
  const lessonSnap = await getDoc(lessonRef);
  if (!lessonSnap.exists()) throw new Error('Không tìm thấy bài học của kết quả cần xử lý.');
  const lessonData = lessonSnap.data() as any;
  const resolvedGrade = clean(target.khoi || lessonData.khoi).replace(/\.0+$/, '');
  const resolvedClassId = clean(target.lop_id || lessonData.lop_id);
  if (me.role === 'teacher' && me.adminPermission !== true) {
    if (!resolvedGrade) throw new Error('Không xác định được khối của bài học nên chưa thể kiểm tra quyền giáo viên.');
    assertTeacherCanManageGrade(me, resolvedGrade);
  }

  const resultGroupId = clean(target.result_group_id || target.co_learning_session_id);
  let sessionRef: DocumentReference<DocumentData> | null = null;
  let participantUserIds = [targetUserId];

  if (target.study_mode === 'co_learning' && resultGroupId) {
    sessionRef = doc(school(), 'coLearningSessions', resultGroupId);
    const sessionSnap = await getDoc(sessionRef);
    if (!sessionSnap.exists()) {
      throw new Error('Không tìm thấy phiên học cùng của kết quả này. Hệ thống chưa thực hiện thay đổi để tránh cập nhật thiếu thành viên.');
    }
    const session = sessionSnap.data() as any;
    const fromSession = getCoLearningParticipants(session).map((item) => clean(item.userId)).filter(Boolean);
    participantUserIds = Array.from(new Set([targetUserId, ...fromSession]));
  }

  // Solo: chỉ cập nhật document canonical chính thức. Học cùng: cập nhật nguyên tử
  // canonical progress của tất cả thành viên; không kéo duplicate legacy vào batch.
  const progressRefs = target.study_mode === 'co_learning' && resultGroupId
    ? participantUserIds.map((userId) => doc(school(), 'learningProgress', `${userId}_${lessonId}`))
    : [primaryRef];
  const progressSnaps = await Promise.all(progressRefs.map((ref) => getDoc(ref)));
  const affected = progressSnaps
    .filter((snap) => snap.exists())
    .map((snap) => ({ ref: snap.ref, data: { progress_id: snap.id, ...snap.data() } as any }))
    .filter((item) => clean(item.data.lesson_id) === lessonId);
  if (!affected.length) throw new Error('Không còn kết quả hợp lệ để xử lý.');

  if (target.study_mode === 'co_learning' && resultGroupId) {
    const foundUserIds = new Set(affected.map((item) => clean(item.data.user_id)).filter(Boolean));
    const missing = participantUserIds.filter((userId) => !foundUserIds.has(userId));
    if (missing.length) {
      throw new Error(`Chưa thể xử lý học cùng vì thiếu kết quả của ${missing.length} thành viên. Không có dữ liệu nào được thay đổi.`);
    }
  }

  if (payload.action === 'allow_retake') {
    const alreadyGranted = affected.filter((item) => Number(item.data.official_retake_remaining || 0) > 0 && clean(item.data.official_retake_grant_id));
    if (alreadyGranted.length === affected.length) {
      throw new Error('Học sinh đã có quyền học lại cập nhật điểm. Hãy yêu cầu học sinh đăng xuất/đăng nhập lại hoặc làm mới dữ liệu để bắt đầu lượt học lại.');
    }
  }

  const now = new Date().toISOString();
  const actionId = id('RESULT_ACTION');
  const state = payload.action === 'allow_retake' ? 'valid' : 'invalid_cheating';
  const actionRef = doc(school(), 'learningResultActions', actionId);

  // V6.84.11: quyền học lại là thao tác chính. Chỉ batch các progress/session cần
  // thay đổi để giảm số Rules evaluator trong một atomic request. Lịch sử xử lý
  // được ghi SAU khi đã xác minh grant/trạng thái thành công; lỗi audit không được
  // phép làm mất quyền học lại vừa cấp.
  const progressBatch = writeBatch(firestoreDb);
  affected.forEach(({ ref, data }) => {
    const nextVersion = Math.max(Number(data.result_version || 0) + 1, Date.now());
    if (payload.action === 'allow_retake') {
      const previousScore = Number.isFinite(Number(data.assessment_score))
        ? Number(data.assessment_score)
        : (Number.isFinite(Number(data.previous_official_score)) ? Number(data.previous_official_score) : undefined);
      if (!Number.isFinite(Number(previousScore))) {
        throw new Error('Kết quả hiện tại chưa có điểm chính thức hợp lệ để chuyển sang trạng thái học lại.');
      }
      progressBatch.update(ref, {
        result_state: 'valid',
        retake_allowed: true,
        official_retake_remaining: 1,
        official_retake_grant_id: actionId,
        official_retake_granted_at: now,
        official_retake_granted_by_uid: me.uid,
        official_retake_granted_by_name: clean(me.displayName || me.username || me.userId),
        previous_official_score: Number(previousScore),
        previous_official_completed_at: clean(data.completed_at || data.last_closed_at || data.updated_at || now),
        score_status: 'retake_pending',
        score_reason: 'official_retake_pending',
        assessment_score: deleteField(),
        current_score: deleteField(),
        final_quiz_score: deleteField(),
        invalidated_reason: reason || '',
        last_result_action_id: actionId,
        result_version: nextVersion,
        updated_at: now,
        updatedAt: serverTimestamp(),
      });
      return;
    }
    progressBatch.update(ref, {
      result_state: 'invalid_cheating',
      retake_allowed: false,
      official_retake_remaining: 0,
      official_retake_grant_id: '',
      invalidated_reason: reason,
      invalidated_at: now,
      invalidated_by_uid: me.uid,
      invalidated_by_name: clean(me.displayName || me.username || me.userId),
      last_result_action_id: actionId,
      result_version: nextVersion,
      updated_at: now,
      updatedAt: serverTimestamp(),
    });
  });
  if (sessionRef && payload.action === 'invalidate_cheating') {
    progressBatch.set(sessionRef, {
      status: state,
      last_result_action_id: actionId,
      invalidated_at: now,
      invalidated_by_uid: me.uid,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }

  try {
    await progressBatch.commit();
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error
      ? clean((error as { code?: unknown }).code)
      : '';
    if (code.includes('permission-denied')) {
      const actionName = payload.action === 'allow_retake' ? 'cấp quyền học lại cập nhật điểm' : 'hủy kết quả do gian lận';
      throw new Error(`Firestore từ chối ${actionName}. Hãy xác minh Firestore Rules hiện hành, tài khoản đang active và giáo viên được phân công khối ${resolvedGrade || '-'}. Hệ thống chưa thay đổi kết quả.`);
    }
    throw error;
  }

  // Read-after-write: chỉ báo grant thành công khi toàn bộ progress đã phản ánh
  // actionId mới. Với học cùng, batch ở trên bảo đảm hoặc tất cả cùng đổi hoặc không ai đổi.
  const verificationSnaps = await Promise.all(affected.map((item) => getDoc(item.ref)));
  const verificationFailed = verificationSnaps.some((snap) => {
    if (!snap.exists()) return true;
    const data = snap.data() as any;
    if (clean(data.last_result_action_id) !== actionId) return true;
    if (payload.action === 'allow_retake') {
      return Number(data.official_retake_remaining || 0) !== 1
        || clean(data.official_retake_grant_id) !== actionId
        || data.retake_allowed !== true
        || clean(data.result_state) !== 'valid'
        || clean(data.score_status) !== 'retake_pending'
        || clean(data.score_reason) !== 'official_retake_pending'
        || !Number.isFinite(Number(data.previous_official_score))
        || data.assessment_score !== undefined
        || data.current_score !== undefined
        || data.final_quiz_score !== undefined;
    }
    return Number(data.official_retake_remaining || 0) !== 0
      || data.retake_allowed !== false
      || clean(data.result_state) !== 'invalid_cheating';
  });
  if (verificationFailed) {
    throw new Error('Firestore đã nhận thao tác nhưng hệ thống chưa xác minh được trạng thái mới. Hãy bấm Làm mới trước khi thao tác lại để tránh cấp trùng quyền học lại.');
  }

  // Audit history is secondary. Never roll back/pretend failure after the grant
  // itself has already been verified on Firestore.
  let auditSaved = true;
  let auditWarning = '';
  try {
    await setDoc(actionRef, withoutUndefined({
      action_id: actionId,
      action: payload.action,
      result_state: state,
      result_group_id: resultGroupId,
      lesson_id: lessonId,
      lesson_title: clean(target.lesson_title || lessonData.tieu_de || lessonData.title),
      khoi: resolvedGrade,
      lop_id: resolvedClassId,
      affected_user_ids: affected.map((item) => clean(item.data.user_id)),
      affected_progress_ids: affected.map((item) => clean(item.data.progress_id)),
      previous_results: affected.map((item) => moderationSnapshot(item.data)),
      reason,
      actorUid: me.uid,
      actor_user_id: clean(me.userId),
      actor_name: clean(me.displayName || me.username || me.userId),
      schoolId: FIREBASE_SCHOOL_ID,
      schemaVersion: 1,
      moderationVersion: 3,
      created_at: now,
      createdAt: serverTimestamp(),
    }));
  } catch (auditError) {
    auditSaved = false;
    auditWarning = firebaseErrorMessage(auditError);
    console.warn('EduSmart moderation audit save failed after verified primary update:', auditError);
  }

  return {
    action_id: actionId,
    action: payload.action,
    affected_user_ids: affected.map((item) => clean(item.data.user_id)),
    affected_count: affected.length,
    result_group_id: resultGroupId,
    audit_saved: auditSaved,
    audit_warning: auditWarning,
  };
}

function boolValue(value: unknown) {
  if (value === true || value === 1) return true;
  const text = clean(value).toLowerCase();
  return text === 'true' || text === '1' || text === 'yes' || text === 'co';
}

function lessonDeadlineMillis(lesson: LessonRow) {
  const raw = clean(lesson.thoi_gian_ket_thuc);
  if (!raw) return 0;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function finalizeFirebaseDeadlineZeros(
  lessonRows: LessonRow[],
  studentRows: Account[],
): Promise<{ finalized: number; skipped: number }> {
  const me = await identity();
  if (!(me.role === 'teacher' || me.role === 'admin' || me.adminPermission === true)) {
    throw new Error('Chỉ giáo viên hoặc quản trị viên được chốt điểm quá hạn.');
  }
  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  let finalized = 0;
  let skipped = 0;
  for (const lesson of lessonRows) {
    const deadlineMs = lessonDeadlineMillis(lesson);
    if (!deadlineMs || deadlineMs >= nowMs || boolValue(lesson.cho_phep_nop_sau_han)) continue;
    if (me.role === 'teacher' && me.adminPermission !== true) assertTeacherCanManageGrade(me, lesson.khoi);
    const lessonId = clean(lesson.lesson_id);
    if (!lessonId) continue;
    const existingSnap = await getDocs(query(namedCollection('learningProgress'), where('lesson_id', '==', lessonId)));
    const existing = new Map<string, { id: string; data: any }>(existingSnap.docs.map((d) => [clean((d.data() as any).user_id), { id: d.id, data: d.data() as any }] as [string, { id: string; data: any }]));
    const eligibleStudents = studentRows.filter((student) => {
      if (student.vai_tro !== 'student') return false;
      if (clean(student.khoi) && clean(lesson.khoi) && clean(student.khoi) !== clean(lesson.khoi)) return false;
      if (clean(lesson.lop_id) && clean(student.lop_id) !== clean(lesson.lop_id)) return false;
      return true;
    });
    for (const student of eligibleStudents) {
      const userId = clean(student.user_id);
      if (!userId) continue;
      const found = existing.get(userId);
      const old = found?.data || {};
      if (clean(old.score_status) === 'finalized' && Number.isFinite(Number(old.assessment_score))) { skipped += 1; continue; }
      if (Number(old.official_retake_remaining || 0) > 0) { skipped += 1; continue; }
      const progressId = `${userId}_${lessonId}`;
      const steps = old.step_details && typeof old.step_details === 'object' ? old.step_details : emptyProgressSteps();
      const zero = withoutUndefined({
        ...old,
        progress_id: progressId,
        user_id: userId,
        ownerUid: clean(old.ownerUid || student.firebase_uid),
        lesson_id: lessonId,
        lesson_title: clean(old.lesson_title || lesson.tieu_de),
        mon_hoc: clean(old.mon_hoc || lesson.mon_id),
        khoi: clean(old.khoi || lesson.khoi),
        lop_id: clean(old.lop_id || student.lop_id || lesson.lop_id),
        nam_hoc: clean(old.nam_hoc || lesson.nam_hoc),
        status: clean(old.status || 'not_started'),
        completion_percent: Number(old.completion_percent || 0),
        completed_steps: Number(old.completed_steps || 0),
        total_steps: Number(old.total_steps || 5),
        last_stage: clean(old.last_stage || 'khoi_dong'),
        step_details: steps,
        quiz_total: Number(old.quiz_total || 0),
        quiz_answered: Number(old.quiz_answered || 0),
        quiz_correct: Number(old.quiz_correct || 0),
        quiz_percent: Number(old.quiz_percent || 0),
        assessment_score: 0,
        final_quiz_score: 0,
        current_score: 0,
        score_status: 'finalized',
        score_model_version: 4,
        section_scores: {},
        scored_section_count: 0,
        scorable_section_count: 0,
        preparation_score: 0,
        preparation_weight: 0,
        learning_component_weight: 0,
        final_component_weight: 100,
        score_calculated_at: now,
        score_reason: 'deadline_missed',
        deadline_status: 'missed',
        deadline_finalized_at: now,
        result_state: 'valid',
        result_version: Math.max(Number(old.result_version || 0) + 1, Date.now()),
        retake_allowed: true,
        study_mode: clean(old.study_mode || 'single'),
        co_learning_session_id: clean(old.co_learning_session_id),
        co_learner_ids: clean(old.co_learner_ids),
        co_learner_user_ids: Array.isArray(old.co_learner_user_ids) ? old.co_learner_user_ids : [],
        co_learner_names: Array.isArray(old.co_learner_names) ? old.co_learner_names : [],
        result_group_id: clean(old.result_group_id),
        schoolId: FIREBASE_SCHOOL_ID,
        schemaVersion: 2,
        updated_at: now,
        updatedAt: serverTimestamp(),
      });
      await setDoc(doc(school(), 'learningProgress', progressId), zero, { merge: true });
      finalized += 1;
    }
  }
  return { finalized, skipped };
}

export async function listFirebaseComments(lessonId: string) {
  await identity();
  const normalizedLessonId = clean(lessonId);
  const [snap, lessonSnap] = await Promise.all([
    getDocs(query(collection(school(), 'lessonComments'), where('lesson_id', '==', normalizedLessonId))),
    getDoc(doc(lessons(), normalizedLessonId)).catch(() => null),
  ]);
  const lessonTitle = lessonSnap?.exists() ? clean((lessonSnap.data() as any)?.tieu_de) : '';
  const rawItems = snap.docs
    .map(item => ({ comment_id: item.id, ...item.data() } as any))
    .filter(item => clean(item.lesson_id) === normalizedLessonId);

  // V6.88.12: comment legacy có thể chưa có họ tên/lớp. Bổ sung từ member
  // theo ownerUid khi đọc để học sinh/giáo viên luôn thấy danh tính đầy đủ.
  const missingAuthorUids = Array.from(new Set(rawItems
    .filter(item => !clean(item.ho_ten) && clean(item.ownerUid))
    .map(item => clean(item.ownerUid))
    .filter(Boolean)));
  const memberMap = new Map<string, any>();
  await Promise.all(missingAuthorUids.map(async (uid) => {
    try {
      const memberSnap = await getDoc(doc(school(), 'members', uid));
      if (memberSnap.exists()) memberMap.set(uid, memberSnap.data());
    } catch { /* fallback về user_id nếu hồ sơ cũ không đọc được */ }
  }));

  return rawItems.map((item) => {
    const member = memberMap.get(clean(item.ownerUid)) || {};
    return {
      ...item,
      ho_ten: clean(item.ho_ten || item.student_name || member.displayName || member.ho_ten),
      student_name: clean(item.student_name || item.ho_ten || member.displayName || member.ho_ten),
      lop_id: clean(item.lop_id || item.class_id || member.classId || member.lop_id),
      class_id: clean(item.class_id || item.lop_id || member.classId || member.lop_id),
      student_code: clean(item.student_code || member.studentCode || member.username),
      lesson_title: clean(item.lesson_title || lessonTitle),
    } as unknown as LessonComment;
  });
}

export async function saveFirebaseComment(payload: Partial<LessonComment>, updating = false) {
  const me = await identity();
  const commentId = clean(payload.comment_id) || id('COMMENT');
  const target = doc(school(), 'lessonComments', commentId);
  const snap = await getDoc(target);
  if (updating && !snap.exists()) return null;
  const existing = snap.exists() ? (snap.data() as any) : {};
  const now = new Date().toISOString();
  const lessonId = clean(payload.lesson_id || existing.lesson_id);
  if (!lessonId) throw new Error('Bình luận chưa gắn với bài học. Vui lòng mở lại bài học và thử lại.');
  const lessonSnap = await getDoc(doc(lessons(), lessonId)).catch(() => null);
  const lessonTitle = lessonSnap?.exists() ? clean((lessonSnap.data() as any)?.tieu_de) : clean(existing.lesson_title);

  // Khi giáo viên xử lý/ẩn bình luận, giữ nguyên tác giả gốc.
  const authorUid = snap.exists() ? clean(existing.ownerUid) : clean(me.uid);
  const authorUserId = snap.exists() ? clean(existing.user_id) : clean(payload.user_id || me.userId);
  const authorName = snap.exists()
    ? clean(existing.ho_ten || existing.student_name)
    : clean(payload.ho_ten || me.displayName || me.username || me.userId);
  const authorClassId = snap.exists()
    ? clean(existing.lop_id || existing.class_id)
    : clean(payload.lop_id || me.classId);
  const studentCode = snap.exists()
    ? clean(existing.student_code)
    : clean((payload as any).student_code || me.studentCode || me.username);

  const safePayload = withoutUndefined({
    ...payload,
    comment_id: commentId,
    lesson_id: lessonId,
    lesson_title: lessonTitle,
    user_id: authorUserId,
    ownerUid: authorUid,
    ho_ten: authorName,
    student_name: authorName,
    student_code: studentCode,
    lop_id: authorClassId,
    class_id: authorClassId,
    schoolId: FIREBASE_SCHOOL_ID,
    schemaVersion: 2,
    storageProvider: 'firebase',
    created_at: snap.exists() ? clean(existing.created_at) : now,
    updated_at: now,
    trang_thai: clean(payload.trang_thai || existing.trang_thai) || 'visible',
  });
  const data = { ...safePayload, updatedAt: serverTimestamp() };
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
  const { questions, questions_json: questionsJson, config, cau_hinh: configLegacy, practice_manifest: practiceManifest, ...metadataPayload } = payload;
  const targetClassIds = cleanStringList((payload as any).target_class_ids);
  const lockedClassIds = cleanStringList((payload as any).locked_class_ids).filter((classId) => !targetClassIds.length || targetClassIds.includes(classId));
  const availableFrom = clean((payload as any).available_from);
  const availableUntil = clean((payload as any).available_until);
  const data = withoutUndefined({ ...metadataPayload,
    target_class_ids: targetClassIds,
    locked_class_ids: lockedClassIds,
    available_from: availableFrom,
    available_until: availableUntil,
    available_from_at: lessonScheduleTimestamp(availableFrom),
    available_until_at: lessonScheduleTimestamp(availableUntil),
    time_limit_minutes: Math.max(0, Number((payload as any).time_limit_minutes ?? (payload as any).thoi_gian ?? 0) || 0),
    max_attempts: Math.max(0, Math.floor(Number((payload as any).max_attempts ?? 0) || 0)),
    pass_score: Math.max(0, Math.min(10, Number((payload as any).pass_score ?? 5) || 5)),
    auto_submit_on_timeout: (payload as any).auto_submit_on_timeout !== false,
    allow_solo: (payload as any).allow_solo !== false,
    allow_co_learning: (payload as any).allow_co_learning !== false,
    show_answers_mode: ['after_submit', 'after_close', 'never'].includes(clean((payload as any).show_answers_mode)) ? clean((payload as any).show_answers_mode) : 'after_submit',
    review_id: reviewId, ownerUid: me.uid, nguoi_tao_id: clean(payload.nguoi_tao_id || me.userId),
    schoolId: FIREBASE_SCHOOL_ID, schemaVersion: 2, storageProvider: 'firestore_spark_v2', created_at: clean(payload.created_at) || now,
    updated_at: now, updatedAt: serverTimestamp(), trang_thai: clean(payload.trang_thai) || 'active',
    audienceKeys: targetClassIds.length ? targetClassIds.map((classId) => `class:${classId}`) : audienceKeys(payload.khoi, payload.lop_id), contentPath: `reviewPractices/${reviewId}/content/main` });
  const content = withoutUndefined({ questions: questions ?? questionsJson ?? [], config: config ?? configLegacy, practice_manifest: practiceManifest });
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
  const classId = clean(me.classId || payload.lop_id || review.lop_id);
  const targets = cleanStringList(review.target_class_ids);
  const locks = cleanStringList(review.locked_class_ids);
  if (me.role === 'student') {
    if (clean(review.trang_thai || 'active') !== 'active') throw new Error('Bài luyện tập chưa được phát hành.');
    if (targets.length && (!classId || !targets.includes(classId))) throw new Error('Bài luyện tập không áp dụng cho lớp hiện tại.');
    if (classId && locks.includes(classId)) throw new Error('Giáo viên đang khóa bài luyện tập cho lớp của em.');
    const startAt = review.available_from_at?.toMillis ? review.available_from_at.toMillis() : (review.available_from ? new Date(review.available_from).getTime() : NaN);
    const endAt = review.available_until_at?.toMillis ? review.available_until_at.toMillis() : (review.available_until ? new Date(review.available_until).getTime() : NaN);
    const nowMs = Date.now();
    if (Number.isFinite(startAt) && nowMs < startAt) throw new Error('Bài luyện tập chưa đến thời gian mở.');
    if (Number.isFinite(endAt) && nowMs > endAt) throw new Error('Bài luyện tập đã hết thời gian thực hiện.');
    const maxAttempts = Math.max(0, Math.floor(Number(review.max_attempts || 0)));
    if (maxAttempts > 0 && previousCount >= maxAttempts) throw new Error(`Em đã sử dụng đủ ${maxAttempts} lượt luyện tập.`);
    const mode = clean(payload.study_mode || 'single');
    if (mode === 'co_learning' && review.allow_co_learning === false) throw new Error('Bài luyện tập này không cho phép luyện cùng bạn.');
    if (mode !== 'co_learning' && review.allow_solo === false) throw new Error('Bài luyện tập này chỉ cho phép luyện cùng bạn.');
  }
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

  const owned = await getAllQueryDocs(reviewId
    ? query(base, where('ownerUid', '==', me.uid), where('review_id', '==', reviewId))
    : query(base, where('ownerUid', '==', me.uid)));
  const participant = me.userId ? await getAllQueryDocs(reviewId
    ? query(base, where('participant_user_ids', 'array-contains', me.userId), where('review_id', '==', reviewId))
    : query(base, where('participant_user_ids', 'array-contains', me.userId))) : { docs: [] } as any;
  const merged = new Map<string, any>();
  [...owned.docs, ...participant.docs].forEach((item: any) => merged.set(item.id, { attempt_id: item.id, ...item.data() }));
  return Array.from(merged.values());
}

export async function saveFirebaseHostConsent(sessionId: string, lessonId: string) {
  const me = await identity();
  // V6.86.0: chuẩn bị bài là nhiệm vụ cá nhân và chỉ được công nhận sau khi
  // học sinh chủ động bấm Gửi kết quả. Không dùng tiến độ xem tạm để chấm chuẩn bị.
  const submission = await getFirebasePreLessonSubmission(lessonId).catch(() => null);
  const preparationStatus = submission?.preparation_status === 'late_completed'
    ? 'late_completed'
    : submission?.preparation_status === 'prepared'
      ? 'prepared'
      : 'not_started';
  const preparationScore = preparationStatus === 'prepared' ? 10 : 0;
  await setDoc(doc(school(), 'coLearningConsents', `${sessionId}_${me.uid}`), {
    schoolId: FIREBASE_SCHOOL_ID, schemaVersion: 1, sessionId, lessonId,
    hostUid: me.uid, ownerUid: me.uid, userId: me.userId, classId: me.classId,
    grade: me.grade, approved: true,
    preparationStatus,
    preparationScore,
    preparationWatchPercent: Math.max(0, Math.min(100, Number(submission?.watch_percent || 0))),
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

// V6.79.0: userAIConfigs trong Firestore chỉ còn là vùng legacy để chính
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

// V6.88.2: cấu hình Gemini API theo tài khoản dùng document bí mật riêng,
// chỉ chính Firebase UID đó được Rules cho phép đọc/ghi. Client cần raw key để
// gọi Gemini trực tiếp, vì vậy không lưu key trong appConfig hay document dùng chung.
export async function getFirebaseUserAISecret() {
  const me = await identity();
  const snap = await getDoc(userAISecretRef(me.uid));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Record<string, unknown>) : null;
}

function maskUserAIKey(apiKey: string) {
  const value = clean(apiKey);
  if (value.length <= 8) return value ? `${value.slice(0, 2)}...${value.slice(-2)}` : '';
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export async function saveFirebaseUserAISecret(apiKey: string, model: string) {
  const me = await identity();
  const normalizedKey = clean(apiKey);
  const normalizedModel = clean(model);
  if (normalizedKey.length < 20 || normalizedKey.length > 512) {
    throw new Error('Gemini API Key không đúng độ dài hợp lệ.');
  }
  if (!normalizedModel || normalizedModel.length > 120) {
    throw new Error('Mô hình AI không hợp lệ.');
  }

  const now = new Date().toISOString();
  const data = {
    schoolId: FIREBASE_SCHOOL_ID,
    ownerUid: clean(me.uid),
    userId: clean(me.userId),
    schemaVersion: 1,
    api_key: normalizedKey,
    api_key_masked: maskUserAIKey(normalizedKey),
    has_api_key: true,
    model_ai: normalizedModel,
    updated_at: now,
    updatedAt: serverTimestamp(),
  };
  assertSafeDocument(data, 'Cấu hình AI theo tài khoản', 16 * 1024);
  const ref = userAISecretRef(me.uid);
  await setDoc(ref, data, { merge: false });

  // Read-after-write: chỉ báo lưu thành công khi Firestore thực sự trả lại đúng
  // document của UID hiện tại. Điều này tránh UI đóng modal dù write bị chặn.
  const verify = await getDoc(ref);
  if (!verify.exists()) throw new Error('Không xác minh được cấu hình AI sau khi lưu.');
  const verified = verify.data() as any;
  if (clean(verified.ownerUid) !== clean(me.uid) || clean(verified.api_key) !== normalizedKey) {
    throw new Error('Cấu hình AI vừa lưu không khớp tài khoản hiện tại.');
  }
  return { id: verify.id, ...verified, updated_at: clean(verified.updated_at) || now };
}

export async function deleteFirebaseUserAISecret() {
  const me = await identity();
  await deleteDoc(userAISecretRef(me.uid));
  const verify = await getDoc(userAISecretRef(me.uid));
  if (verify.exists()) throw new Error('Không xác minh được việc xóa API key của tài khoản hiện tại.');
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
