import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft,
  BookOpen,
  BookOpenCheck,
  CheckSquare,
  Eye,
  Filter,
  FolderKanban,
  GraduationCap,
  Download,
  LayoutDashboard,
  LayoutGrid,
  List,
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Settings,
  Sparkles,
  Trash2,
  UploadCloud,
  UserCog,
  Users,
  XCircle,
  Trophy,
  Unlock,
} from 'lucide-react';
import {
  AIConfig,
  AIConfigOpenReason,
  Account,
  CatalogClass,
  CatalogResponse,
  CoLearningSession,
  Lesson,
  LessonComposerValues,
  LessonContent,
  LessonContentResponse,
  LessonComment,
  LessonRow,
  ReviewPracticeAttempt,
  ReviewPracticeConfig,
  ReviewPracticeContentResponse,
  ReviewPracticeResultStudent,
  ReviewPracticeResultSummary,
  ReviewPracticeRow,
  QuizQuestion,
  LearningStepProgress,
  SchoolYear,
  LessonProgressRecord,
  LearningResultModerationPayload,
  LessonQuestionAnswerState,
  MoveStudentsPayload,
  SectionLearningProgress,
  LessonStageKey,
  PendingShareItem,
  StudentLearningAnalyticsRow,
  Subject,
  SystemDiagnostics,
  ToastType,
  User,
  VideoPopupConfig,
} from './types';
import { AI_MODELS, DEFAULT_ACTIVE_GRADES, DEFAULT_VIDEO_POPUP_CONFIG, VIDEO_POPUP_VIEW_STORAGE_KEY, sortGrades } from './constants';
import { compareStructuredLessons, resolveLessonIdentity } from './utils/lessonCatalog';
import {
  createAccountApi,
  createClassApi,
  createLessonApi,
  createReviewPracticeApi,
  createSchoolYearApi,
  createSubjectApi,
  deleteAccountApi,
  batchDeleteAccountsApi,
  batchResetPasswordsApi,
  batchDeleteClassesApi,
  deleteLessonApi,
  deleteReviewPracticeApi,
  deleteSubjectApi,
  getCurrentUserApi,
  deleteUserConfigApi,
  getLessonContentApi,
  getReviewPracticeApi,
  getReviewPracticeResultsApi,
  getSystemDiagnosticsApi,
  getUserConfigApi,
  getVideoConfigApi,
  importClassesBatchApi,
  importStudentAccountsBatchApi,
  listAccountsApi,
  listClassmatesForStudyApi,
  listCatalogApi,
  listLearningProgressApi,
  listLessonsApi,
  listReviewPracticesApi,
  listPendingSharesApi,
  listLessonCommentsApi,
  listProfileClassesApi,
  listSchoolYearsApi,
  logoutApi,
  moveClassStudentsApi,
  moveStudentsBetweenClassesApi,
  reviewSharedLessonApi,
  saveLearningProgressApi,
  addLessonCommentApi,
  updateLessonCommentApi,
  saveUserConfigApi,
  saveVideoConfigApi,
  setLessonLockApi,
  setCurrentSchoolYearApi,
  transferSchoolYearApi,
  maskApiKey,
  moderateLearningResultApi,
  startCoLearningSessionApi,
  submitLessonReviewApi,
  submitReviewPracticeApi,
  updateAccountApi,
  updateClassApi,
  updateLessonApi,
  updateSchoolYearApi,
  updateSubjectApi,
  updateProfileApi,
} from './services/api';
import {
  getFirebaseIdToken,
  signOutFirebase,
  updateOwnFirebasePassword,
  updateOwnFirebaseMemberProfile,
  waitForFirebaseUser,
} from './services/firebase';
import { clearFirebaseIdentityCache, subscribeFirebaseLessonAccess } from './services/firebaseOperational';
import { downloadTemplate, exportClassesToExcel } from './utils/templateDownloader';
import type { ImportEntity, ImportPreviewResult } from './utils/importValidators';
import Login from './components/Login';
import Layout from './components/Layout';
import LessonCard from './components/LessonCard';
import LoadingOverlay from './components/LoadingOverlay';
import Toast from './components/Toast';
import DataToolbar from './components/DataToolbar';
import AccountFormModal from './components/AccountFormModal';
import ClassFormModal from './components/ClassFormModal';
import SubjectFormModal from './components/SubjectFormModal';
import ConfirmDialog from './components/ConfirmDialog';
import ProfileFormModal from './components/ProfileFormModal';
import WelcomeVideoModal from './components/WelcomeVideoModal';
import VideoConfigPanel from './components/VideoConfigPanel';
import CoLearningModal from './components/CoLearningModal';
import SchoolYearConfigPanel from './components/SchoolYearConfigPanel';
import SchoolYearTransferModal from './components/SchoolYearTransferModal';

const AIConfigModal = lazy(() => import('./components/AIConfigModal'));
const AIAssistant = lazy(() => import('./components/AIAssistant'));
const LessonViewer = lazy(() => import('./components/LessonViewer'));
const LessonComposer = lazy(() => import('./components/LessonComposer'));
const ReviewPracticeModal = lazy(() => import('./components/ReviewPracticeModal'));
const ReviewPracticeViewer = lazy(() => import('./components/ReviewPracticeViewer'));
const ReviewPracticeResultsModal = lazy(() => import('./components/ReviewPracticeResultsModal'));
const ImportDataModal = lazy(() => import('./components/ImportDataModal'));
const KnowledgeArena = lazy(() => import('./components/KnowledgeArena'));
const LearningAnalyticsPanel = lazy(() => import('./components/LearningAnalyticsPanel'));

function mapLessonRow(
  row: LessonRow,
  subjects: Subject[],
  classes: CatalogClass[],
  accounts: Account[],
  currentUser: User | null,
): Lesson {
  const subjectName = subjects.find((item) => item.mon_id === row.mon_id)?.ten_mon || row.mon_id || 'Chưa xác định';
  const className = classes.find((item) => item.lop_id === row.lop_id)?.ten_lop || row.lop_id || '';
  const ownerName =
    accounts.find((item) => item.user_id === row.nguoi_tao_id)?.ho_ten ||
    (currentUser?.user_id === row.nguoi_tao_id ? currentUser.ho_ten : row.nguoi_tao_id || 'Không rõ');

  const identity = resolveLessonIdentity(row);
  return {
    id: row.lesson_id,
    lesson_id: row.lesson_id,
    tieu_de: identity.title || row.tieu_de,
    lesson_number: identity.lessonNumber,
    lesson_name: identity.lessonName,
    lesson_key: row.lesson_key || '',
    arena_question_count: row.arena_question_count,
    arena_ready: row.arena_ready,
    mo_ta: row.tom_tat || 'Bài học được tạo từ học liệu tải lên.',
    mon_id: row.mon_id,
    mon_hoc: subjectName,
    khoi: row.khoi,
    lop_id: row.lop_id || '',
    lop: className,
    trang_thai: row.trang_thai,
    nguoi_tao_id: row.nguoi_tao_id,
    nguoi_tao: ownerName,
    ngay_tao: row.created_at || '',
    updated_at: row.updated_at || '',
    pham_vi: row.pham_vi,
    nam_hoc: row.nam_hoc || '',
    hoc_ky: row.hoc_ky || '',
    thoi_gian_bat_dau: row.thoi_gian_bat_dau || '',
    thoi_gian_ket_thuc: row.thoi_gian_ket_thuc || '',
    cho_phep_hoc_sau_han: row.cho_phep_hoc_sau_han,
    cho_phep_nop_sau_han: row.cho_phep_nop_sau_han,
    is_locked: row.is_locked === true,
    locked_at: row.locked_at || '',
    locked_by_uid: row.locked_by_uid || '',
    locked_by_name: row.locked_by_name || '',
    raw: row,
  };
}

function getFriendlyStatus(status: string) {
  switch (status) {
    case 'ready_private':
      return 'Riêng tư';
    case 'approved_shared':
      return 'Dùng chung';
    case 'pending_review':
      return 'Chờ admin duyệt';
    case 'draft':
      return 'Nháp';
    case 'rejected':
      return 'Bị từ chối';
    default:
      return status || 'Không rõ';
  }
}

function getFriendlyScope(scope: string) {
  return scope === 'shared' ? 'Dùng chung' : 'Riêng tư';
}

function getFriendlyState(value?: string) {
  if (!value) return '-';
  return value === 'active' ? 'Hoạt động' : value === 'inactive' ? 'Tạm khóa' : value;
}

function normalizeText(value?: string) {
  return String(value || '').toLowerCase().trim();
}

function normalizeGradeValue(value?: string | number | null) {
  return String(value ?? '').trim().replace(/\.0+$/, '');
}

function hasAdminPermission(account?: Partial<User | Account> | null) {
  if (!account) return false;
  if (account.vai_tro === 'admin') return true;
  const delegated = String((account as { quyen_admin?: boolean | string }).quyen_admin ?? '').trim().toLowerCase();
  return account.vai_tro === 'teacher' && ['true', '1', 'yes', 'y', 'on', 'co', 'có'].includes(delegated);
}

function getRoleLabel(account?: Partial<User | Account> | null) {
  if (!account) return '-';
  if (account.vai_tro === 'admin') return 'Quản trị viên';
  if (hasAdminPermission(account)) return 'Giáo viên + quyền admin';
  if (account.vai_tro === 'teacher') return 'Giáo viên';
  return 'Học sinh';
}

function normalizeClassIdValue(value?: string | null) {
  return String(value ?? '').trim().toUpperCase();
}

function getComputedSchoolYear() {
  const now = new Date();
  const start = now.getMonth() + 1 >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return `${start}-${start + 1}`;
}

function sanitizeStoredUser(raw: unknown): User | null {
  if (!raw || typeof raw !== 'object') return null;
  const user = raw as Partial<User>;
  if (!user.token || !user.user_id || !user.ten_dang_nhap || !user.ho_ten || !user.vai_tro) return null;
  return {
    user_id: String(user.user_id),
    ten_dang_nhap: String(user.ten_dang_nhap),
    ho_ten: String(user.ho_ten),
    vai_tro: user.vai_tro,
    token: String(user.token),
    lop_id: normalizeClassIdValue(user.lop_id),
    khoi: normalizeGradeValue(user.khoi),
    quyen_admin: hasAdminPermission(user),
    auth_provider: user.auth_provider === 'firebase' ? 'firebase' : 'legacy',
    firebase_uid: String(user.firebase_uid || '').trim(),
  };
}


function sanitizeStoredAIConfig(raw: unknown): AIConfig {
  if (!raw || typeof raw !== 'object') return { apiKey: '', model: AI_MODELS[0] };
  const config = raw as Partial<AIConfig>;
  const apiKey = String(config.apiKey || '').trim();
  const apiKeyMasked = String(config.apiKeyMasked || '').trim();
  return {
    apiKey,
    model: String(config.model || AI_MODELS[0]).trim() || AI_MODELS[0],
    apiKeyMasked: apiKey ? `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}` : apiKeyMasked,
    hasServerKey: Boolean(config.hasServerKey || apiKey),
    updatedAt: String(config.updatedAt || '').trim(),
  };
}

function mergeAIConfig(primary?: Partial<AIConfig> | null, fallback?: Partial<AIConfig> | null): AIConfig {
  const first = sanitizeStoredAIConfig(primary || {});
  const second = sanitizeStoredAIConfig(fallback || {});
  const apiKey = first.apiKey || second.apiKey || '';
  const model = first.model || second.model || AI_MODELS[0];
  const apiKeyMasked = first.apiKeyMasked || (apiKey ? `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}` : second.apiKeyMasked || '');
  return {
    apiKey,
    model,
    apiKeyMasked,
    hasServerKey: Boolean(first.hasServerKey || first.apiKey || second.hasServerKey || second.apiKey),
    updatedAt: first.updatedAt || second.updatedAt || '',
  };
}

function renderInfoTable(title: string, columns: string[], rows: string[][]) {
  return (
    <div className="rounded-[28px] bg-white p-6 shadow-sm ring-1 ring-slate-100">
      <h2 className="mb-4 text-lg font-bold text-slate-900">{title}</h2>
      {rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-slate-500">
                {columns.map((column) => (
                  <th key={column} className="px-3 py-3 font-semibold">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index} className="border-b border-slate-50 last:border-0">
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className="px-3 py-3 text-slate-700">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-slate-500">Chưa có dữ liệu.</p>
      )}
    </div>
  );
}

const STAGE_LABELS: Record<LessonStageKey, string> = {
  khoi_dong: 'Khởi động',
  hinh_thanh_kien_thuc: 'Hình thành kiến thức',
  luyen_tap: 'Luyện tập',
  van_dung: 'Vận dụng',
  tong_ket: 'Tổng kết',
};

interface ConfirmDialogState {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  variant: 'danger' | 'primary';
  requiredText?: string;
  requiredTextLabel?: string;
  onConfirm: () => Promise<void> | void;
}

const DEFAULT_CONFIRM: ConfirmDialogState = {
  isOpen: false,
  title: '',
  description: '',
  confirmLabel: 'Xác nhận',
  cancelLabel: 'Hủy',
  variant: 'danger',
  requiredText: '',
  requiredTextLabel: '',
  onConfirm: async () => {},
};


const PROGRESS_STORAGE_KEY = 'edu_smart_learning_progress_v1';
const STAGE_WEIGHTS: Record<LessonStageKey, number> = {
  khoi_dong: 15,
  hinh_thanh_kien_thuc: 25,
  luyen_tap: 30,
  van_dung: 20,
  tong_ket: 10,
};

function parseProgressDate(value?: string | null) {
  if (!value) return null;
  const text = String(value).trim();
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text) ? text.replace(' ', 'T') + '+07:00' : text;
  const parsed = new Date(normalized);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  const fallback = new Date(text);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function formatProgressDisplayTime(value?: string | null) {
  const parsed = parseProgressDate(value);
  if (!parsed) return value ? String(value) : '';
  const pad = (num: number) => String(num).padStart(2, '0');
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())} ${pad(parsed.getHours())}:${pad(parsed.getMinutes())}:${pad(parsed.getSeconds())}`;
}

function getProgressTimeValue(value?: string | null) {
  const parsed = parseProgressDate(value);
  return parsed ? parsed.getTime() : 0;
}

function createEmptyStepDetail(): LearningStepProgress {
  return { opened: false, viewedComplete: false, completed: false, percent: 0, quizAnswered: 0, quizCorrect: 0, quizTotal: 0, quizAnswers: {}, lastVisitedAt: '' };
}

function sanitizeProgressRecord(raw: Partial<LessonProgressRecord> | null | undefined): LessonProgressRecord | null {
  if (!raw?.progress_id || !raw?.user_id || !raw?.lesson_id) return null;
  const updatedAt = (parseProgressDate(raw.updated_at || '') || new Date()).toISOString();
  const stepDetails = {
    khoi_dong: { ...createEmptyStepDetail(), ...(raw.step_details?.khoi_dong || {}) },
    hinh_thanh_kien_thuc: { ...createEmptyStepDetail(), ...(raw.step_details?.hinh_thanh_kien_thuc || {}) },
    luyen_tap: { ...createEmptyStepDetail(), ...(raw.step_details?.luyen_tap || {}) },
    van_dung: { ...createEmptyStepDetail(), ...(raw.step_details?.van_dung || {}) },
    tong_ket: { ...createEmptyStepDetail(), ...(raw.step_details?.tong_ket || {}) },
  } as Record<LessonStageKey, LearningStepProgress>;

  return {
    progress_id: String(raw.progress_id),
    user_id: String(raw.user_id),
    lesson_id: String(raw.lesson_id),
    lesson_title: String(raw.lesson_title || ''),
    mon_hoc: String(raw.mon_hoc || ''),
    khoi: String(raw.khoi || '').replace(/\.0+$/, ''),
    lop_id: String(raw.lop_id || '').toUpperCase(),
    status: raw.status || 'not_started',
    completion_percent: Number(raw.completion_percent || 0),
    completed_steps: Number(raw.completed_steps || 0),
    total_steps: Number(raw.total_steps || 5),
    last_stage: raw.last_stage || 'khoi_dong',
    updated_at: updatedAt,
    updated_at_display: raw.updated_at_display || formatProgressDisplayTime(updatedAt),
    updated_at_ts: Number(raw.updated_at_ts || getProgressTimeValue(updatedAt) || 0),
    step_details: stepDetails,
    quiz_total: Number(raw.quiz_total || 0),
    quiz_answered: Number(raw.quiz_answered || 0),
    quiz_correct: Number(raw.quiz_correct || 0),
    quiz_percent: Number(raw.quiz_percent || 0),
    assessment_score: raw.assessment_score === undefined || raw.assessment_score === null
      ? undefined
      : Number(raw.assessment_score),
    result_state: raw.result_state === 'cancelled_retake' || raw.result_state === 'invalid_cheating'
      ? raw.result_state
      : 'valid',
    result_group_id: String(raw.result_group_id || ''),
    result_version: Number(raw.result_version || 0),
    retake_allowed: raw.retake_allowed !== false,
    invalidated_reason: String(raw.invalidated_reason || ''),
    invalidated_at: String(raw.invalidated_at || ''),
    invalidated_by_uid: String(raw.invalidated_by_uid || ''),
    invalidated_by_name: String(raw.invalidated_by_name || ''),
    last_result_action_id: String(raw.last_result_action_id || ''),
    study_mode: raw.study_mode === 'co_learning' ? 'co_learning' : 'single',
    co_learning_session_id: String(raw.co_learning_session_id || ''),
    co_learner_ids: String(raw.co_learner_ids || ''),
    co_learner_user_ids: Array.isArray(raw.co_learner_user_ids)
      ? raw.co_learner_user_ids.map((item) => String(item || '').trim()).filter(Boolean)
      : String(raw.co_learner_ids || '').split(',').map((item) => item.trim()).filter(Boolean),
    co_learner_names: Array.isArray(raw.co_learner_names)
      ? raw.co_learner_names.map((item) => String(item || '').trim()).filter(Boolean)
      : [],
  };
}

function getCoLearningSessionUserIds(session?: CoLearningSession | null) {
  const source = Array.isArray(session?.participant_user_ids) && session.participant_user_ids.length
    ? session.participant_user_ids
    : [session?.host_user_id, session?.partner_user_id];
  return Array.from(new Set(source.map((item) => String(item || '').trim()).filter(Boolean))).slice(0, 6);
}

function getCoLearningSessionNames(session?: CoLearningSession | null) {
  const names = Array.isArray(session?.participant_names) ? session.participant_names : [];
  if (names.length) return names.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 6);
  return [session?.host_user_id, session?.partner_name || session?.partner_user_id]
    .map((item) => String(item || '').trim())
    .filter(Boolean);
}

function sanitizeStoredProgressRecords(raw: unknown) {
  if (!Array.isArray(raw)) return [] as LessonProgressRecord[];
  return raw.map((item) => sanitizeProgressRecord(item as LessonProgressRecord)).filter(Boolean) as LessonProgressRecord[];
}

function createEmptyProgressRecord(userId: string, lesson: Lesson): LessonProgressRecord {
  return sanitizeProgressRecord({
    progress_id: `${userId}_${lesson.lesson_id}`,
    user_id: userId,
    lesson_id: lesson.lesson_id,
    lesson_title: lesson.tieu_de,
    mon_hoc: lesson.mon_hoc,
    khoi: lesson.khoi,
    lop_id: lesson.lop_id || '',
    status: 'not_started',
    completion_percent: 0,
    completed_steps: 0,
    total_steps: 5,
    last_stage: 'khoi_dong',
    updated_at: new Date().toISOString(),
    step_details: {
      khoi_dong: createEmptyStepDetail(),
      hinh_thanh_kien_thuc: createEmptyStepDetail(),
      luyen_tap: { ...createEmptyStepDetail(), quizAnswered: 0, quizCorrect: 0, quizTotal: 0 },
      van_dung: createEmptyStepDetail(),
      tong_ket: createEmptyStepDetail(),
    },
    quiz_total: 0,
    quiz_answered: 0,
    quiz_correct: 0,
    quiz_percent: 0,
    study_mode: 'single',
    co_learning_session_id: '',
    co_learner_ids: '',
    result_state: 'valid',
    result_group_id: `${userId}_${lesson.lesson_id}`,
    result_version: 0,
    retake_allowed: true,
  })!;
}

function recomputeProgress(record: LessonProgressRecord): LessonProgressRecord {
  const stepDetails = { ...record.step_details };
  let weighted = 0;
  let completedSteps = 0;

  (Object.keys(STAGE_WEIGHTS) as LessonStageKey[]).forEach((stageKey) => {
    const detail = { ...createEmptyStepDetail(), ...(stepDetails[stageKey] || {}) };
    let percent = detail.percent || 0;

    if (stageKey === 'luyen_tap') {
      const total = detail.quizTotal || 0;
      const answered = detail.quizAnswered || 0;
      const correct = detail.quizCorrect || 0;
      if (total > 0) {
        percent = Math.round((answered / total) * 100);
        detail.viewedComplete = answered >= total;
      } else if (detail.viewedComplete) {
        percent = 100;
      } else {
        percent = 0;
      }
      const sectionProgressItems = Object.values(detail.sectionProgress || {}) as SectionLearningProgress[];
      const hasSectionProgress = sectionProgressItems.length > 0;
      const allSectionsCompleted = !hasSectionProgress || sectionProgressItems.every((item) => item.status === 'completed');
      detail.completed = total > 0 ? answered >= total && allSectionsCompleted : Boolean(detail.viewedComplete) && allSectionsCompleted;
    } else {
      percent = detail.viewedComplete ? 100 : 0;
      detail.completed = Boolean(detail.viewedComplete);
    }

    detail.percent = percent;
    stepDetails[stageKey] = detail;
    weighted += (percent / 100) * STAGE_WEIGHTS[stageKey];
    if (detail.completed) completedSteps += 1;
  });

  const quizTotal = stepDetails.luyen_tap.quizTotal || 0;
  const quizCorrect = stepDetails.luyen_tap.quizCorrect || 0;
  const quizAnswered = stepDetails.luyen_tap.quizAnswered || 0;
  const completionPercent = Math.min(100, Math.round(weighted));
  const updatedAt = new Date().toISOString();
  const finalExam = stepDetails.luyen_tap.finalExam;
  const finalExamSubmitted = ['submitted', 'auto_submitted', 'expired'].includes(String(finalExam?.status || ''));
  const assessmentScore = finalExamSubmitted && Number.isFinite(Number(finalExam?.total_score))
    ? Math.max(0, Math.min(10, Number(finalExam?.total_score)))
    : record.assessment_score;

  return sanitizeProgressRecord({
    ...record,
    step_details: stepDetails,
    completed_steps: completedSteps,
    completion_percent: completionPercent,
    status: completionPercent >= 100 ? 'completed' : completionPercent > 0 ? 'in_progress' : 'not_started',
    updated_at: updatedAt,
    quiz_total: quizTotal,
    quiz_answered: quizAnswered,
    quiz_correct: quizCorrect,
    quiz_percent: quizTotal > 0 ? Math.round((quizCorrect / quizTotal) * 100) : 0,
    assessment_score: assessmentScore,
    result_state: record.result_state === 'invalid_cheating' ? 'invalid_cheating' : 'valid',
    retake_allowed: record.result_state === 'invalid_cheating' ? false : true,
  })!;
}

function formatStageLabel(stage?: LessonStageKey) {
  if (!stage) return '-';
  const map: Record<LessonStageKey, string> = {
    khoi_dong: 'Khởi động',
    hinh_thanh_kien_thuc: 'Hình thành kiến thức',
    luyen_tap: 'Luyện tập',
    van_dung: 'Vận dụng',
    tong_ket: 'Tổng kết',
  };
  return map[stage] || stage;
}

function mergeProgressCollections(remoteItems: LessonProgressRecord[], localItems: LessonProgressRecord[]) {
  const merged = new Map<string, LessonProgressRecord>();
  [...remoteItems, ...localItems]
    .map((item) => sanitizeProgressRecord(item))
    .filter(Boolean)
    .forEach((item) => {
      const normalizedItem = item as LessonProgressRecord;
      const current = merged.get(normalizedItem.progress_id);
      if (!current || Number(normalizedItem.updated_at_ts || 0) > Number(current.updated_at_ts || 0)) {
        merged.set(normalizedItem.progress_id, normalizedItem);
      }
    });
  return Array.from(merged.values()).sort((a, b) => Number(b.updated_at_ts || 0) - Number(a.updated_at_ts || 0));
}


function sanitizeVideoConfig(raw?: Partial<VideoPopupConfig> | null): VideoPopupConfig {
  const source = raw || {};
  const normalizedTargets = (Array.isArray(source.targetRoles)
    ? Array.from(new Set(source.targetRoles.filter(Boolean)))
    : [...DEFAULT_VIDEO_POPUP_CONFIG.targetRoles]) as VideoPopupConfig['targetRoles'];
  return {
    enabled: Boolean(source.enabled ?? DEFAULT_VIDEO_POPUP_CONFIG.enabled),
    youtubeUrl: String(source.youtubeUrl || DEFAULT_VIDEO_POPUP_CONFIG.youtubeUrl || '').trim(),
    embedUrl: String(source.embedUrl || DEFAULT_VIDEO_POPUP_CONFIG.embedUrl || '').trim(),
    title1: String(source.title1 || DEFAULT_VIDEO_POPUP_CONFIG.title1 || '').trim(),
    title2: String(source.title2 || DEFAULT_VIDEO_POPUP_CONFIG.title2 || '').trim(),
    title3: String(source.title3 || DEFAULT_VIDEO_POPUP_CONFIG.title3 || '').trim(),
    description: String(source.description || DEFAULT_VIDEO_POPUP_CONFIG.description || '').trim(),
    displayMode: (['every_visit', 'session_once', 'daily_once'].includes(String(source.displayMode || ''))
      ? source.displayMode
      : DEFAULT_VIDEO_POPUP_CONFIG.displayMode) as VideoPopupConfig['displayMode'],
    targetRoles: normalizedTargets.length ? normalizedTargets : ([...DEFAULT_VIDEO_POPUP_CONFIG.targetRoles] as VideoPopupConfig['targetRoles']),
    dismissible: source.dismissible !== false,
    primaryButtonLabel: String(source.primaryButtonLabel || DEFAULT_VIDEO_POPUP_CONFIG.primaryButtonLabel || '').trim(),
    secondaryButtonLabel: String(source.secondaryButtonLabel || DEFAULT_VIDEO_POPUP_CONFIG.secondaryButtonLabel || '').trim(),
    updatedAt: String(source.updatedAt || '').trim(),
    updatedBy: String(source.updatedBy || '').trim(),
  };
}

function getVideoConfigVersion(config: VideoPopupConfig) {
  return config.updatedAt || [config.youtubeUrl, config.embedUrl, config.title1, config.title2, config.title3].join('|');
}

function canShowWelcomeVideo(config: VideoPopupConfig, currentUser: User | null) {
  if (!currentUser) return false;
  if (!config.enabled || !config.embedUrl) return false;
  if (Array.isArray(config.targetRoles) && config.targetRoles.length > 0 && !config.targetRoles.includes(currentUser.vai_tro)) {
    return false;
  }
  const version = getVideoConfigVersion(config);
  const baseKey = `${VIDEO_POPUP_VIEW_STORAGE_KEY}:${currentUser.user_id}:${version}`;
  if (config.displayMode === 'session_once') {
    return sessionStorage.getItem(baseKey) !== 'seen';
  }
  if (config.displayMode === 'daily_once') {
    const today = new Date().toISOString().slice(0, 10);
    return localStorage.getItem(baseKey) !== today;
  }
  return true;
}

function markWelcomeVideoSeen(config: VideoPopupConfig, currentUser: User | null) {
  if (!currentUser) return;
  const version = getVideoConfigVersion(config);
  const baseKey = `${VIDEO_POPUP_VIEW_STORAGE_KEY}:${currentUser.user_id}:${version}`;
  if (config.displayMode === 'session_once') {
    sessionStorage.setItem(baseKey, 'seen');
    return;
  }
  if (config.displayMode === 'daily_once') {
    localStorage.setItem(baseKey, new Date().toISOString().slice(0, 10));
  }
}

type AppDataDomain = 'accounts' | 'lessons' | 'reviews' | 'shares' | 'progress';

const CORE_DATA_CACHE_PREFIX = 'edusmart_core_v664';

function requiredDataDomains(menu: string, currentUser: User, isAdmin: boolean): AppDataDomain[] {
  const canManage = isAdmin || currentUser.vai_tro === 'teacher';
  switch (menu) {
    case 'overview':
      return [...(canManage ? ['accounts' as const] : []), 'lessons', ...(isAdmin ? ['shares' as const] : [])];
    case 'accounts':
      return canManage ? ['accounts'] : [];
    case 'lessons':
    case 'my_lessons':
      return ['lessons', 'reviews'];
    case 'create_lesson':
      return ['lessons'];
    case 'learning':
    case 'arena':
      return ['lessons', 'reviews', 'progress', ...(canManage ? ['accounts' as const] : [])];
    case 'analytics':
      return canManage ? ['accounts', 'lessons', 'progress'] : ['lessons', 'progress'];
    case 'approvals':
      return isAdmin ? ['lessons', 'shares'] : ['lessons'];
    default:
      return [];
  }
}

function DataModuleSkeleton({ message }: { message: string }) {
  return (
    <div className="space-y-4" aria-live="polite" aria-busy="true">
      <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-indigo-100 bg-white px-3.5 py-2 text-xs font-bold text-indigo-700 shadow-sm">
        <RefreshCw className="h-4 w-4 shrink-0 animate-spin" />
        <span className="truncate">{message}</span>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div key={item} className="animate-pulse rounded-[24px] bg-white p-5 shadow-sm ring-1 ring-slate-100">
            <div className="h-4 w-2/5 rounded-full bg-slate-100" />
            <div className="mt-4 h-8 rounded-xl bg-slate-100" />
            <div className="mt-3 h-3.5 w-4/5 rounded-full bg-slate-100" />
            <div className="mt-2.5 h-3.5 w-3/5 rounded-full bg-slate-100" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshingData, setIsRefreshingData] = useState(false);
  const [isCoreDataLoading, setIsCoreDataLoading] = useState(false);
  const [isMenuDataLoading, setIsMenuDataLoading] = useState(false);
  const [menuLoadingMessage, setMenuLoadingMessage] = useState('Đang tải dữ liệu chức năng...');
  const [loadingMessage, setLoadingMessage] = useState('Đang tải...');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  const [activeMenu, setActiveMenu] = useState('learning');
  const [isAIConfigOpen, setIsAIConfigOpen] = useState(false);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [isAssistantReady, setIsAssistantReady] = useState(false);

  const [aiConfig, setAIConfig] = useState<AIConfig>({ apiKey: '', model: AI_MODELS[0] });
  const [aiConfigOpenReason, setAIConfigOpenReason] = useState<AIConfigOpenReason>('manual');
  const [videoConfig, setVideoConfig] = useState<VideoPopupConfig>(sanitizeVideoConfig(DEFAULT_VIDEO_POPUP_CONFIG as Partial<VideoPopupConfig>));
  const [welcomeVideoModalConfig, setWelcomeVideoModalConfig] = useState<VideoPopupConfig>(sanitizeVideoConfig(DEFAULT_VIDEO_POPUP_CONFIG as Partial<VideoPopupConfig>));
  const [isWelcomeVideoOpen, setIsWelcomeVideoOpen] = useState(false);
  const [isWelcomeVideoPreview, setIsWelcomeVideoPreview] = useState(false);
  const welcomeVideoSignatureRef = useRef('');
  const appDataLoadedRef = useRef(false);
  const coreDataLoadedRef = useRef(false);
  const coreLoadPromiseRef = useRef<Promise<void> | null>(null);
  const loadedDataDomainsRef = useRef<Set<AppDataDomain>>(new Set());
  const domainLoadPromisesRef = useRef<Map<AppDataDomain, Promise<void>>>(new Map());
  const menuLoadGenerationRef = useRef(0);
  const [allowedModels, setAllowedModels] = useState<string[]>(AI_MODELS);
  const [classes, setClasses] = useState<CatalogClass[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [lessonRows, setLessonRows] = useState<LessonRow[]>([]);
  const [reviewPractices, setReviewPractices] = useState<ReviewPracticeRow[]>([]);
  const [pendingShares, setPendingShares] = useState<PendingShareItem[]>([]);
  const [systemDiagnostics, setSystemDiagnostics] = useState<SystemDiagnostics | null>(null);
  const [schoolYears, setSchoolYears] = useState<SchoolYear[]>([]);

  const [lessonSearch, setLessonSearch] = useState('');
  const [lessonSubjectFilter, setLessonSubjectFilter] = useState('Tất cả');
  const [lessonGradeFilter, setLessonGradeFilter] = useState('Tất cả');
  const [lessonStatusFilter, setLessonStatusFilter] = useState('Tất cả');
  const [lessonScopeFilter, setLessonScopeFilter] = useState('Tất cả');
  const [lessonAccessFilter, setLessonAccessFilter] = useState('Tất cả');
  const [lessonLockUpdatingId, setLessonLockUpdatingId] = useState('');
  const [lessonLibraryView, setLessonLibraryView] = useState<'grid' | 'list'>('grid');
  const [lessonLibraryPage, setLessonLibraryPage] = useState(1);

  const [accountQuery, setAccountQuery] = useState('');
  const [accountRoleFilter, setAccountRoleFilter] = useState('Tất cả');
  const [accountGradeFilter, setAccountGradeFilter] = useState('Tất cả');
  const [accountClassFilter, setAccountClassFilter] = useState('Tất cả');
  const [accountStatusFilter, setAccountStatusFilter] = useState('Tất cả');
  const [accountPage, setAccountPage] = useState(1);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [accountImportProgress, setAccountImportProgress] = useState<{ processed: number; total: number; created: number; updated: number; failed: number } | null>(null);
  const [accountImportResult, setAccountImportResult] = useState<{ created: number; updated: number; failed: number; failures: Array<{ source_row: number; ma_hoc_sinh?: string; ho_ten?: string; reason: string }> } | null>(null);

  const [classQuery, setClassQuery] = useState('');
  const [classGradeFilter, setClassGradeFilter] = useState('Tất cả');
  const [classStatusFilter, setClassStatusFilter] = useState('Tất cả');
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);

  const [subjectQuery, setSubjectQuery] = useState('');
  const [subjectGradeFilter, setSubjectGradeFilter] = useState('Tất cả');
  const [subjectStatusFilter, setSubjectStatusFilter] = useState('Tất cả');

  const currentUserIsAdmin = hasAdminPermission(user);

  useEffect(() => {
    setLessonLibraryPage(1);
  }, [lessonSearch, lessonSubjectFilter, lessonGradeFilter, lessonStatusFilter, lessonScopeFilter, lessonAccessFilter, lessonLibraryView, activeMenu]);

const gradeFilterOptions = useMemo(() => {
  if (user?.khoi && !currentUserIsAdmin) return [String(user.khoi)];

  const discovered = sortGrades(classes.map((item) => normalizeGradeValue(item.khoi)));
  return discovered.length > 0 ? discovered : DEFAULT_ACTIVE_GRADES;
}, [classes, user, currentUserIsAdmin]);

const classLabelById = useMemo(() => new Map(classes.map((item) => [item.lop_id, item.ten_lop || item.lop_id])), [classes]);

const accountClassFilterOptions = useMemo(() => {
  const source = classes
    .filter((item) => accountGradeFilter === 'Tất cả' || String(item.khoi || '') === accountGradeFilter)
    .sort((a, b) => String(a.ten_lop || '').localeCompare(String(b.ten_lop || ''), 'vi'));
  return source.map((item) => ({ value: item.lop_id, label: `${item.ten_lop || item.lop_id} • ${item.lop_id}` }));
}, [classes, accountGradeFilter]);

useEffect(() => {
  if (accountClassFilter === 'Tất cả') return;
  if (!accountClassFilterOptions.some((item) => item.value === accountClassFilter)) {
    setAccountClassFilter('Tất cả');
  }
}, [accountClassFilter, accountClassFilterOptions]);

  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [selectedLessonContent, setSelectedLessonContent] = useState<LessonContent | null>(null);
  const [arenaLesson, setArenaLesson] = useState<Lesson | null>(null);
  const [arenaLessonContent, setArenaLessonContent] = useState<LessonContent | null>(null);
  const [isLessonViewerOpen, setIsLessonViewerOpen] = useState(false);
  const [viewerStage, setViewerStage] = useState<LessonStageKey>('khoi_dong');
  const [coLearningLesson, setCoLearningLesson] = useState<Lesson | null>(null);
  const [coLearningClassmates, setCoLearningClassmates] = useState<Account[]>([]);
  const [coLearningSelectedUserIds, setCoLearningSelectedUserIds] = useState<string[]>([]);
  const [coLearningPasswords, setCoLearningPasswords] = useState<Record<string, string>>({});
  const [reusableCoLearningSession, setReusableCoLearningSession] = useState<CoLearningSession | null>(null);
  const [coLearningError, setCoLearningError] = useState('');
  const [isCoLearningModalOpen, setIsCoLearningModalOpen] = useState(false);
  const [isCoLearningLoading, setIsCoLearningLoading] = useState(false);
  const [isCoLearningSubmitting, setIsCoLearningSubmitting] = useState(false);
  const [activeCoLearningSession, setActiveCoLearningSession] = useState<CoLearningSession | null>(null);
  const [editingLesson, setEditingLesson] = useState<Lesson | null>(null);
  const [editingContent, setEditingContent] = useState<LessonContent | null>(null);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [isReviewViewerOpen, setIsReviewViewerOpen] = useState(false);
  const [selectedReviewPractice, setSelectedReviewPractice] = useState<ReviewPracticeRow | null>(null);
  const [selectedReviewQuestions, setSelectedReviewQuestions] = useState<QuizQuestion[]>([]);
  const [selectedReviewConfig, setSelectedReviewConfig] = useState<ReviewPracticeConfig | undefined>(undefined);
  const [isReviewResultsOpen, setIsReviewResultsOpen] = useState(false);
  const [reviewResultsPractice, setReviewResultsPractice] = useState<ReviewPracticeRow | null>(null);
  const [reviewResultAttempts, setReviewResultAttempts] = useState<ReviewPracticeAttempt[]>([]);
  const [reviewResultStudents, setReviewResultStudents] = useState<ReviewPracticeResultStudent[]>([]);
  const [reviewResultSummary, setReviewResultSummary] = useState<ReviewPracticeResultSummary | null>(null);
  const [isReviewResultsLoading, setIsReviewResultsLoading] = useState(false);

  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [isSchoolYearTransferOpen, setIsSchoolYearTransferOpen] = useState(false);
  const [isClassModalOpen, setIsClassModalOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<CatalogClass | null>(null);
  const [isSubjectModalOpen, setIsSubjectModalOpen] = useState(false);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [profileClasses, setProfileClasses] = useState<CatalogClass[]>([]);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importEntity, setImportEntity] = useState<ImportEntity>('account');
  const [confirmDialog, setConfirmDialog] = useState(DEFAULT_CONFIRM);
  const [progressRecords, setProgressRecords] = useState<LessonProgressRecord[]>([]);
  const progressRecordsRef = useRef<LessonProgressRecord[]>([]);
  const progressSaveTimersRef = useRef<Record<string, number>>({});
  const progressPendingRecordsRef = useRef<Record<string, LessonProgressRecord>>({});
  const progressCacheHydratedUserRef = useRef('');
  const setProgressRecordsSync = useCallback((value: LessonProgressRecord[] | ((current: LessonProgressRecord[]) => LessonProgressRecord[])) => {
    setProgressRecords((current) => {
      const base = progressRecordsRef.current.length ? progressRecordsRef.current : current;
      const next = typeof value === 'function' ? (value as (current: LessonProgressRecord[]) => LessonProgressRecord[])(base) : value;
      progressRecordsRef.current = next;
      return next;
    });
  }, []);
  const [analyticsQuery, setAnalyticsQuery] = useState('');
  const [analyticsGradeFilter, setAnalyticsGradeFilter] = useState('Tất cả');
  const [analyticsLessonFilter, setAnalyticsLessonFilter] = useState('Tất cả');
  const [analyticsStatusFilter, setAnalyticsStatusFilter] = useState('Tất cả');
  const [analyticsSemesterFilter, setAnalyticsSemesterFilter] = useState('HK1');
  const [analyticsClassFilter, setAnalyticsClassFilter] = useState('Tất cả');
  const [analyticsSubjectFilter, setAnalyticsSubjectFilter] = useState('Tất cả');
  const [analyticsSchoolYearFilter, setAnalyticsSchoolYearFilter] = useState(getComputedSchoolYear());

  useEffect(() => {
    const ensureCreatedGrade = (value: string, setter: (next: string) => void) => {
      if (value === 'Tất cả') return;
      if (!gradeFilterOptions.includes(value)) setter('Tất cả');
    };
    ensureCreatedGrade(lessonGradeFilter, setLessonGradeFilter);
    ensureCreatedGrade(accountGradeFilter, setAccountGradeFilter);
    ensureCreatedGrade(classGradeFilter, setClassGradeFilter);
    ensureCreatedGrade(subjectGradeFilter, setSubjectGradeFilter);
    ensureCreatedGrade(analyticsGradeFilter, setAnalyticsGradeFilter);
  }, [gradeFilterOptions, lessonGradeFilter, accountGradeFilter, classGradeFilter, subjectGradeFilter, analyticsGradeFilter]);

  const [lessonComments, setLessonComments] = useState<LessonComment[]>([]);
  const [isLessonCommentsLoading, setIsLessonCommentsLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const restoreAuth = async () => {
      localStorage.removeItem('aiConfig');

      const savedVideoConfig = localStorage.getItem('edu_smart_system_video_config_v1');
      if (savedVideoConfig) {
        try {
          if (isMounted) { const restoredVideoConfig = sanitizeVideoConfig(JSON.parse(savedVideoConfig) as Partial<VideoPopupConfig>); setVideoConfig(restoredVideoConfig); setWelcomeVideoModalConfig(restoredVideoConfig); }
        } catch {
          localStorage.removeItem('edu_smart_system_video_config_v1');
        }
      }

      const savedUser = localStorage.getItem('user');
      if (savedUser) {
        try {
          const parsed = sanitizeStoredUser(JSON.parse(savedUser));
          if (parsed?.token) {
            if (isMounted) {
              setLoadingMessage('Đang khôi phục phiên đăng nhập...');
              setIsLoading(true);
            }
            const requiresFirebase = parsed.auth_provider === 'firebase';
            const firebaseUser = requiresFirebase ? await waitForFirebaseUser() : null;
            if (requiresFirebase && !firebaseUser) {
              localStorage.removeItem('user');
              if (isMounted) setUser(null);
            } else {
              const currentUserRes = await getCurrentUserApi(parsed.token);
              if (currentUserRes.ok && currentUserRes.data) {
                const restoredUser: User = {
                  ...parsed,
                  ...currentUserRes.data,
                  token: parsed.token,
                };
                if (isMounted) {
                  setAIConfig({ apiKey: '', model: AI_MODELS[0] });
                  setUser(restoredUser);
                }
                localStorage.setItem('user', JSON.stringify(restoredUser));
              } else {
                localStorage.removeItem('user');
              }
            }
          } else {
            localStorage.removeItem('user');
          }
        } catch {
          localStorage.removeItem('user');
        } finally {
          if (isMounted) setIsLoading(false);
        }
      }

      if (isMounted) setIsAuthReady(true);
    };

    void restoreAuth();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    progressRecordsRef.current = progressRecords;
    if (user?.vai_tro === 'student' && progressCacheHydratedUserRef.current === user.user_id) {
      localStorage.setItem(`${PROGRESS_STORAGE_KEY}:${user.user_id}`, JSON.stringify(progressRecords.filter((item) => item.user_id === user.user_id)));
    }
  }, [progressRecords, user?.user_id, user?.vai_tro]);

  useEffect(() => {
    appDataLoadedRef.current = false;
    coreDataLoadedRef.current = false;
    coreLoadPromiseRef.current = null;
    loadedDataDomainsRef.current.clear();
    domainLoadPromisesRef.current.clear();
    progressCacheHydratedUserRef.current = '';
    if (!user) return;
    if (user.vai_tro === 'student') {
      try {
        const savedProgress = localStorage.getItem(`${PROGRESS_STORAGE_KEY}:${user.user_id}`);
        setProgressRecordsSync(savedProgress ? sanitizeStoredProgressRecords(JSON.parse(savedProgress)) : []);
      } catch {
        setProgressRecordsSync([]);
      }
      progressCacheHydratedUserRef.current = user.user_id;
    } else {
      setProgressRecordsSync([]);
    }
    const cacheKey = `${CORE_DATA_CACHE_PREFIX}:${user.user_id}`;
    let restoredCoreCache = false;
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null');
      if (cached && Date.now() - Number(cached.savedAt || 0) < 12 * 60 * 60 * 1000) {
        if (Array.isArray(cached.classes)) setClasses(cached.classes);
        if (Array.isArray(cached.subjects)) setSubjects(cached.subjects);
        if (Array.isArray(cached.schoolYears)) setSchoolYears(cached.schoolYears);
        if (cached.videoConfig) {
          const restored = sanitizeVideoConfig(cached.videoConfig);
          setVideoConfig(restored);
          setWelcomeVideoModalConfig(restored);
        }
        coreDataLoadedRef.current = true;
        restoredCoreCache = true;
      }
    } catch {
      localStorage.removeItem(cacheKey);
    }
    void loadCoreData(restoredCoreCache);
  }, [user?.user_id]);

  useEffect(() => {
    if (!user) return;
    if (currentUserIsAdmin && activeMenu === 'learning') return;
    void loadMenuData(activeMenu);
  }, [activeMenu, user?.user_id, currentUserIsAdmin]);

  useEffect(() => {
    setIsAssistantReady(false);
    if (!user) return;
    if (isLessonViewerOpen || activeMenu === 'ai_config') {
      setIsAssistantReady(true);
      return;
    }
    const timer = window.setTimeout(() => setIsAssistantReady(true), 8000);
    return () => window.clearTimeout(timer);
  }, [user?.user_id, activeMenu, isLessonViewerOpen]);

  useEffect(() => {
    if (!user || !videoConfig.enabled || !videoConfig.embedUrl) return;
    if (isWelcomeVideoOpen || isWelcomeVideoPreview || isAIConfigOpen || isLessonViewerOpen) return;

    const signature = [user.user_id, getVideoConfigVersion(videoConfig), videoConfig.displayMode, videoConfig.targetRoles.join(',')].join('|');
    if (welcomeVideoSignatureRef.current === signature) return;
    welcomeVideoSignatureRef.current = signature;

    if (canShowWelcomeVideo(videoConfig, user)) {
      setWelcomeVideoModalConfig(videoConfig);
      setIsWelcomeVideoPreview(false);
      setIsWelcomeVideoOpen(true);
    }
  }, [user, videoConfig, isWelcomeVideoOpen, isWelcomeVideoPreview, isAIConfigOpen, isLessonViewerOpen]);

  useEffect(() => {
    if (!user) return;
    if (currentUserIsAdmin && activeMenu === 'learning') {
      setActiveMenu('analytics');
      return;
    }
    if (user.vai_tro === 'student' && ['my_lessons', 'create_lesson', 'lessons', 'approvals', 'accounts', 'classes', 'subjects', 'analytics', 'overview', 'video_config', 'school_years'].includes(activeMenu)) {
      setActiveMenu('learning');
    }
  }, [user?.vai_tro, user?.quyen_admin, activeMenu, currentUserIsAdmin]);

  useEffect(() => {
    if (!user) return;
    if (user.vai_tro === 'student') {
      // Học sinh chỉ dùng các bộ lọc phù hợp với thư viện cá nhân.
      // Reset các filter quản trị đang bị ẩn để chúng không âm thầm làm mất bài.
      setLessonGradeFilter(user.khoi || 'Tất cả');
      setLessonSubjectFilter('Tất cả');
      setLessonStatusFilter('Tất cả');
      setLessonScopeFilter('Tất cả');
      setLessonAccessFilter('Tất cả');
      setLessonSearch('');
    }
  }, [user?.user_id]);

  const showToast = (message: string, type: ToastType) => setToast({ message, type });

  // Khi học sinh đang ở trong bài, theo dõi metadata bài học theo thời gian thực.
  // Nếu giáo viên khóa bài, viewer đóng ngay và Rules V6.68.0 đồng thời chặn đọc content.
  useEffect(() => {
    if (!user || user.vai_tro !== 'student' || !isLessonViewerOpen || !selectedLesson?.lesson_id) return;
    return subscribeFirebaseLessonAccess(
      selectedLesson.lesson_id,
      (latest) => {
        if (!latest) {
          setIsLessonViewerOpen(false);
          setSelectedLessonContent(null);
          setActiveCoLearningSession(null);
          setToast({ message: 'Bài học không còn tồn tại hoặc em không còn quyền truy cập.', type: 'error' });
          return;
        }
        setLessonRows((current) => current.map((item) => item.lesson_id === latest.lesson_id ? { ...item, ...latest } : item));
        setSelectedLesson((current) => current?.lesson_id === latest.lesson_id ? { ...current, is_locked: latest.is_locked, locked_at: latest.locked_at, locked_by_uid: latest.locked_by_uid, locked_by_name: latest.locked_by_name } : current);
        if (latest.is_locked === true) {
          setIsLessonViewerOpen(false);
          setSelectedLessonContent(null);
          setActiveCoLearningSession(null);
          setToast({ message: 'Giáo viên vừa khóa bài học này. Em đã được đưa về danh sách bài học.', type: 'error' });
        }
      },
      () => {
        // Không làm gián đoạn phiên chỉ vì listener tạm mất kết nối; lần đọc content tiếp theo
        // vẫn được Firestore Rules kiểm tra.
      },
    );
  }, [user?.user_id, user?.vai_tro, isLessonViewerOpen, selectedLesson?.lesson_id]);

  // Đấu trường dùng cùng trạng thái is_locked với Bài học. Nếu giáo viên khóa bài
  // trong lúc học sinh đang chọn/chơi, đóng ngay phiên đấu trường và trở về danh sách.
  useEffect(() => {
    if (!user || user.vai_tro !== 'student' || activeMenu !== 'arena' || !arenaLesson?.lesson_id) return;
    return subscribeFirebaseLessonAccess(
      arenaLesson.lesson_id,
      (latest) => {
        if (!latest) {
          setArenaLesson(null);
          setArenaLessonContent(null);
          setToast({ message: 'Bài học không còn tồn tại hoặc em không còn quyền truy cập Đấu trường.', type: 'error' });
          return;
        }
        setLessonRows((current) => current.map((item) => item.lesson_id === latest.lesson_id ? { ...item, ...latest } : item));
        setArenaLesson((current) => current?.lesson_id === latest.lesson_id ? {
          ...current,
          is_locked: latest.is_locked,
          locked_at: latest.locked_at,
          locked_by_uid: latest.locked_by_uid,
          locked_by_name: latest.locked_by_name,
        } : current);
        if (latest.is_locked === true) {
          setArenaLesson(null);
          setArenaLessonContent(null);
          setToast({ message: 'Giáo viên vừa khóa bài học này. Em đã được đưa về danh sách Đấu trường tri thức.', type: 'error' });
        }
      },
      () => {
        // Firestore Rules vẫn là lớp bảo vệ cuối cùng nếu listener tạm mất kết nối.
      },
    );
  }, [user?.user_id, user?.vai_tro, activeMenu, arenaLesson?.lesson_id]);

  const startLoading = (message = 'Đang tải...') => {
    setLoadingMessage(message);
    setIsLoading(true);
  };

  const stopLoading = () => setIsLoading(false);

  const openAIConfigModal = useCallback((reason: AIConfigOpenReason = 'manual') => {
    setAIConfigOpenReason(reason);
    setIsAIConfigOpen(true);
  }, []);

  const closeAIConfigModal = useCallback(() => {
    setIsAIConfigOpen(false);
    setAIConfigOpenReason('manual');
  }, []);

  const withLoading = async <T,>(message: string, task: () => Promise<T>) => {
    startLoading(message);
    try {
      return await task();
    } finally {
      stopLoading();
    }
  };

  const handleSessionError = (message?: string) => {
    const normalized = String(message || '').toLowerCase();
    if (normalized.includes('het han') || normalized.includes('khong con hop le') || normalized.includes('vui long dang nhap lai')) {
      handleLogout({ showMessage: false, revokeRemote: false });
      showToast('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.', 'error');
      return true;
    }
    return false;
  };

  const syncBaseCatalogAfterMutation = async () => {
    // Firestore là nguồn vận hành chính. Không tự nhập ngược dữ liệu cũ từ
    // Google Sheet sau thao tác CRUD vì có thể khôi phục bản ghi vừa xóa.
    return true;
  };

  const loadCoreData = async (force = false) => {
    if (!user) return;
    if (coreDataLoadedRef.current && !force) return;
    if (coreLoadPromiseRef.current) return coreLoadPromiseRef.current;

    const coldLoad = !coreDataLoadedRef.current;
    if (coldLoad) setIsCoreDataLoading(true);
    else setIsRefreshingData(true);

    const task = (async () => {
      const [catalogRes, schoolYearsRes, userConfigRes, videoConfigRes] = await Promise.all([
        listCatalogApi(user.token),
        listSchoolYearsApi(user.token),
        getUserConfigApi(user.token),
        getVideoConfigApi(user.token),
      ]);

      if (!catalogRes.ok || !catalogRes.data) {
        if (!handleSessionError(catalogRes.message)) showToast(catalogRes.message, 'error');
        return;
      }

      const catalog = catalogRes.data as CatalogResponse;
      const nextClasses = catalog.classes || [];
      const nextSubjects = catalog.subjects || [];
      setClasses(nextClasses);
      setSubjects(nextSubjects);
      setAllowedModels(catalog.allowed_models?.length ? catalog.allowed_models : AI_MODELS);

      let nextSchoolYears: SchoolYear[] = [];
      if (schoolYearsRes.ok && schoolYearsRes.data) {
        nextSchoolYears = schoolYearsRes.data.items || [];
        setSchoolYears(nextSchoolYears);
        const currentYear = schoolYearsRes.data.current?.ten_nam_hoc
          || nextSchoolYears.find((item) => item.la_hien_hanh === true || String(item.la_hien_hanh).toLowerCase() === 'true')?.ten_nam_hoc
          || getComputedSchoolYear();
        setAnalyticsSchoolYearFilter((prev) => prev || currentYear);
      } else if (!handleSessionError(schoolYearsRes.message)) {
        showToast('Không tải được năm học từ Firebase. Dữ liệu đã lưu trên thiết bị vẫn được giữ nguyên.', 'info');
      }

      if (userConfigRes.ok && userConfigRes.data) {
        setAIConfig(sanitizeStoredAIConfig(userConfigRes.data));
      } else if (!handleSessionError(userConfigRes.message)) {
        setAIConfig({ apiKey: '', model: AI_MODELS[0] });
      }
      localStorage.removeItem('aiConfig');

      let nextVideoConfig = videoConfig;
      if (videoConfigRes.ok && videoConfigRes.data) {
        nextVideoConfig = sanitizeVideoConfig(videoConfigRes.data);
        setVideoConfig(nextVideoConfig);
        setWelcomeVideoModalConfig(nextVideoConfig);
      }

      try {
        localStorage.setItem(`${CORE_DATA_CACHE_PREFIX}:${user.user_id}`, JSON.stringify({
          savedAt: Date.now(),
          classes: nextClasses,
          subjects: nextSubjects,
          schoolYears: nextSchoolYears,
          videoConfig: nextVideoConfig,
        }));
      } catch {
        // Cache tăng tốc là tùy chọn; Firestore vẫn là nguồn dữ liệu chuẩn.
      }
      coreDataLoadedRef.current = true;
    })();

    coreLoadPromiseRef.current = task;
    try {
      await task;
    } finally {
      coreLoadPromiseRef.current = null;
      setIsCoreDataLoading(false);
      setIsRefreshingData(false);
    }
  };

  const loadDataDomain = async (domain: AppDataDomain, force = false) => {
    if (!user) return;
    if (loadedDataDomainsRef.current.has(domain) && !force) return;
    const pending = domainLoadPromisesRef.current.get(domain);
    if (pending) return pending;

    const task = (async () => {
      if (domain === 'lessons') {
        const res = await listLessonsApi(user.token);
        if (!res.ok) throw new Error(res.message);
        setLessonRows(res.data?.items || []);
      } else if (domain === 'reviews') {
        const res = await listReviewPracticesApi(user.token);
        if (!res.ok) throw new Error(res.message);
        setReviewPractices(res.data?.items || []);
      } else if (domain === 'accounts') {
        if (!currentUserIsAdmin && user.vai_tro !== 'teacher') {
          setAccounts([]);
        } else {
          const res = await listAccountsApi(user.token);
          if (!res.ok) throw new Error(res.message);
          setAccounts(res.data?.items || []);
        }
      } else if (domain === 'shares') {
        if (!currentUserIsAdmin) {
          setPendingShares([]);
        } else {
          const res = await listPendingSharesApi(user.token);
          if (!res.ok) throw new Error(res.message);
          setPendingShares(res.data?.items || []);
        }
        setSystemDiagnostics(null);
      } else if (domain === 'progress') {
        const res = await listLearningProgressApi(user.token);
        if (!res.ok) throw new Error(res.message);
        const cachedProgress = (() => {
          try {
            const saved = user.vai_tro === 'student' ? localStorage.getItem(`${PROGRESS_STORAGE_KEY}:${user.user_id}`) : null;
            return saved ? sanitizeStoredProgressRecords(JSON.parse(saved)) : [];
          } catch {
            return [] as LessonProgressRecord[];
          }
        })();
        const remoteItems = res.data?.items || [];
        const mergedItems = mergeProgressCollections(remoteItems, cachedProgress);
        setProgressRecordsSync(mergedItems);
        if (user.vai_tro === 'student') {
          const remoteMap = new Map(remoteItems.map((item) => [item.progress_id, Number(item.updated_at_ts || 0)]));
          mergedItems.filter((item) => item.user_id === user.user_id).forEach((item) => {
            if (Number(remoteMap.get(item.progress_id) || 0) !== Number(item.updated_at_ts || 0)) {
              void saveLearningProgressApi(user.token, item);
            }
          });
        }
      }
      loadedDataDomainsRef.current.add(domain);
    })();

    domainLoadPromisesRef.current.set(domain, task);
    try {
      await task;
    } finally {
      domainLoadPromisesRef.current.delete(domain);
    }
  };

  const loadMenuData = async (menu = activeMenu, force = false) => {
    if (!user) return;
    const domains = requiredDataDomains(menu, user, currentUserIsAdmin);
    if (!domains.length) {
      setIsMenuDataLoading(false);
      appDataLoadedRef.current = true;
      return;
    }
    const coldLoad = domains.some((domain) => !loadedDataDomainsRef.current.has(domain));
    const generation = ++menuLoadGenerationRef.current;
    const menuLabels: Record<string, string> = {
      accounts: 'Đang tải tài khoản từ Firebase...',
      lessons: 'Đang tải kho bài học từ Firebase...',
      learning: 'Đang tải bài học và tiến trình...',
      analytics: 'Đang tổng hợp dữ liệu học tập...',
      approvals: 'Đang tải danh sách chờ duyệt...',
      arena: 'Đang chuẩn bị đấu trường...',
    };
    setMenuLoadingMessage(menuLabels[menu] || 'Đang tải dữ liệu chức năng...');
    if (coldLoad) setIsMenuDataLoading(true);
    else setIsRefreshingData(true);

    const results = await Promise.allSettled(domains.map((domain) => loadDataDomain(domain, force)));
    const firstFailure = results.find((result) => result.status === 'rejected') as PromiseRejectedResult | undefined;
    if (firstFailure && generation === menuLoadGenerationRef.current) {
      const message = firstFailure.reason instanceof Error ? firstFailure.reason.message : 'Không tải được dữ liệu chức năng.';
      if (!handleSessionError(message)) showToast(message, 'error');
    }
    if (generation === menuLoadGenerationRef.current) {
      setIsMenuDataLoading(false);
      setIsRefreshingData(false);
    }
    appDataLoadedRef.current = true;
  };

  const loadAppData = async () => {
    if (!user) return;
    // Mỗi tầng tải tự quản lý trạng thái của chính nó. Không bật cờ refresh tổng
    // trước cold-load để tránh hiển thị đồng thời skeleton và badge đồng bộ nền.
    await loadCoreData(true);
    await loadMenuData(activeMenu, true);
  };

  const lessons = useMemo(
    () => lessonRows.map((row) => mapLessonRow(row, subjects, classes, accounts, user)),
    [lessonRows, subjects, classes, accounts, user],
  );

  const lessonsById = useMemo(() => {
    const map = new Map<string, Lesson>();
    lessons.forEach((lesson) => map.set(lesson.lesson_id, lesson));
    return map;
  }, [lessons]);

  const visibleLessonsForCurrentUser = useMemo(() => {
    if (!user || currentUserIsAdmin) return lessons;

    return lessons.filter((lesson) => {
      const isOwner = lesson.nguoi_tao_id === user.user_id;
      if (user.vai_tro === 'teacher') {
        return isOwner || lesson.trang_thai === 'approved_shared';
      }
      const sameGrade = !lesson.khoi || !user.khoi || String(lesson.khoi) === String(user.khoi);
      const classMatches = !lesson.lop_id || !user.lop_id || lesson.lop_id === user.lop_id;
      const isSharedForStudent = lesson.trang_thai === 'approved_shared' && sameGrade && classMatches;
      return isSharedForStudent;
    });
  }, [lessons, user, currentUserIsAdmin]);

  const lessonSourcePool = useMemo(() => {
    if (!currentUserIsAdmin && ['learning', 'arena', 'my_lessons', 'create_lesson', 'analytics'].includes(activeMenu)) {
      return visibleLessonsForCurrentUser;
    }
    return lessons;
  }, [currentUserIsAdmin, activeMenu, visibleLessonsForCurrentUser, lessons]);

  const availableSubjects = useMemo(() => {
    const names = lessonSourcePool.map((item) => item.mon_hoc).filter(Boolean);
    return Array.from(new Set(names));
  }, [lessonSourcePool]);

  const baseFilteredLessons = useMemo(() => {
    return lessonSourcePool.filter((lesson) => {
      const matchesSearch =
        !lessonSearch ||
        normalizeText(lesson.tieu_de).includes(normalizeText(lessonSearch)) ||
        normalizeText(lesson.mo_ta).includes(normalizeText(lessonSearch)) ||
        normalizeText(lesson.mon_hoc).includes(normalizeText(lessonSearch));
      const matchesSubject = lessonSubjectFilter === 'Tất cả' || lesson.mon_hoc === lessonSubjectFilter;
      const matchesGrade = lessonGradeFilter === 'Tất cả'
        || lesson.khoi === lessonGradeFilter
        || (user?.vai_tro === 'student' && !lesson.khoi);
      const matchesStatus = lessonStatusFilter === 'Tất cả' || lesson.trang_thai === lessonStatusFilter;
      const matchesScope = lessonScopeFilter === 'Tất cả' || lesson.pham_vi === lessonScopeFilter;
      const matchesAccess = lessonAccessFilter === 'Tất cả'
        || (lessonAccessFilter === 'unlocked' && lesson.is_locked !== true)
        || (lessonAccessFilter === 'locked' && lesson.is_locked === true);
      return matchesSearch && matchesSubject && matchesGrade && matchesStatus && matchesScope && matchesAccess;
    }).sort(compareStructuredLessons);
  }, [lessonSourcePool, lessonSearch, lessonSubjectFilter, lessonGradeFilter, lessonStatusFilter, lessonScopeFilter, lessonAccessFilter, user?.vai_tro]);

  const filteredLessons = useMemo(() => {
    if (activeMenu === 'my_lessons') return baseFilteredLessons.filter((lesson) => lesson.nguoi_tao_id === user?.user_id);
    if (activeMenu === 'approvals') return baseFilteredLessons.filter((lesson) => lesson.trang_thai === 'pending_review');
    return baseFilteredLessons;
  }, [activeMenu, baseFilteredLessons, user?.user_id]);

  const visibleReviewPractices = useMemo(() => {
    return reviewPractices.filter((review) => {
      if (!user) return false;
      if (!currentUserIsAdmin && user.vai_tro === 'teacher' && review.nguoi_tao_id && review.nguoi_tao_id !== user.user_id && review.pham_vi !== 'shared') return false;
      if (user.vai_tro === 'student') {
        const sameGrade = !review.khoi || !user.khoi || String(review.khoi) === String(user.khoi);
        const sameClass = !review.lop_id || !user.lop_id || review.lop_id === user.lop_id;
        if (!sameGrade || !sameClass || String(review.trang_thai || 'active') !== 'active') return false;
      }
      const matchesSearch = !lessonSearch || normalizeText(review.tieu_de).includes(normalizeText(lessonSearch)) || normalizeText(review.source_lesson_titles).includes(normalizeText(lessonSearch));
      const subjectName = subjects.find((item) => item.mon_id === review.mon_id)?.ten_mon || review.mon_hoc || review.mon_id;
      const matchesSubject = lessonSubjectFilter === 'Tất cả' || subjectName === lessonSubjectFilter;
      const matchesGrade = lessonGradeFilter === 'Tất cả'
        || String(review.khoi) === lessonGradeFilter
        || (user.vai_tro === 'student' && !review.khoi);
      const matchesScope = lessonScopeFilter === 'Tất cả' || review.pham_vi === lessonScopeFilter;
      return matchesSearch && matchesSubject && matchesGrade && matchesScope;
    });
  }, [reviewPractices, user, currentUserIsAdmin, lessonSearch, lessonSubjectFilter, lessonGradeFilter, lessonScopeFilter, subjects]);

  const pendingLessonCards = useMemo(() => {
    return pendingShares
      .map((item) => ({
        share: item.share,
        lesson: item.lesson ? lessonsById.get(item.lesson.lesson_id) || mapLessonRow(item.lesson, subjects, classes, accounts, user) : null,
      }))
      .filter((item) => item.lesson);
  }, [pendingShares, lessonsById, subjects, classes, accounts, user]);

  const filteredPendingLessonCards = useMemo(() => {
    return pendingLessonCards.filter(({ lesson }) => {
      if (!lesson) return false;
      const matchesSearch =
        !lessonSearch ||
        normalizeText(lesson.tieu_de).includes(normalizeText(lessonSearch)) ||
        normalizeText(lesson.mo_ta).includes(normalizeText(lessonSearch)) ||
        normalizeText(lesson.mon_hoc).includes(normalizeText(lessonSearch));
      const matchesSubject = lessonSubjectFilter === 'Tất cả' || lesson.mon_hoc === lessonSubjectFilter;
      const matchesGrade = lessonGradeFilter === 'Tất cả' || lesson.khoi === lessonGradeFilter;
      return matchesSearch && matchesSubject && matchesGrade;
    });
  }, [pendingLessonCards, lessonSearch, lessonSubjectFilter, lessonGradeFilter]);

  const featuredLearningLessons = useMemo(() => {
    return [...visibleLessonsForCurrentUser].sort((a, b) => String(b.updated_at || b.ngay_tao).localeCompare(String(a.updated_at || a.ngay_tao))).slice(0, 6);
  }, [visibleLessonsForCurrentUser]);

  const currentStudentProgressByLesson = useMemo(() => {
    if (!user || user.vai_tro !== 'student') return {} as Record<string, LessonProgressRecord>;
    return progressRecords
      .filter((item) => item.user_id === user.user_id)
      .reduce((acc, item) => {
        acc[item.lesson_id] = item;
        return acc;
      }, {} as Record<string, LessonProgressRecord>);
  }, [progressRecords, user]);

  const analyticsRows = useMemo(() => {
    const visibleUsers = accounts.filter((item) => item.vai_tro === 'student');
    return progressRecords
      .map((record): StudentLearningAnalyticsRow => {
        const account = visibleUsers.find((item) => item.user_id === record.user_id);
        const lessonMeta = lessonsById.get(record.lesson_id);
        return {
          user_id: record.user_id,
          ho_ten: account?.ho_ten || record.user_id,
          vai_tro: account?.vai_tro || 'student',
          // Ưu tiên snapshot tại thời điểm học để kết chuyển năm học không làm sai lịch sử.
          khoi: record.khoi || account?.khoi,
          lop_id: record.lop_id || account?.lop_id,
          lesson_id: record.lesson_id,
          lesson_title: record.lesson_title,
          mon_hoc: record.mon_hoc,
          status: record.status,
          completion_percent: record.completion_percent,
          completed_steps: record.completed_steps,
          total_steps: record.total_steps,
          quiz_percent: record.quiz_percent,
          quiz_correct: record.quiz_correct,
          quiz_total: record.quiz_total,
          assessment_score: record.assessment_score,
          result_state: record.result_state || 'valid',
          result_group_id: record.result_group_id,
          retake_allowed: record.retake_allowed,
          study_mode: record.study_mode,
          co_learning_session_id: record.co_learning_session_id,
          co_learner_ids: record.co_learner_ids,
          co_learner_user_ids: record.co_learner_user_ids,
          co_learner_names: record.co_learner_names,
          invalidated_reason: record.invalidated_reason,
          invalidated_at: record.invalidated_at,
          invalidated_by_name: record.invalidated_by_name,
          last_stage: record.last_stage,
          updated_at: record.updated_at_display || record.updated_at,
          updated_at_display: record.updated_at_display || record.updated_at,
          updated_at_ts: record.updated_at_ts || getProgressTimeValue(record.updated_at),
          nam_hoc: record.nam_hoc || lessonMeta?.nam_hoc || lessonMeta?.raw?.nam_hoc || getComputedSchoolYear(),
        };
      })
      .filter((item) => {
        if (user?.vai_tro === 'teacher') {
          return lessonSourcePool.some((lesson) => lesson.lesson_id === item.lesson_id);
        }
        return true;
      });
  }, [progressRecords, accounts, user?.vai_tro, lessonSourcePool, lessonsById]);

  const filteredAnalyticsRows = useMemo(() => {
    return analyticsRows.filter((row) => {
      const matchesQuery =
        !analyticsQuery ||
        normalizeText(row.ho_ten).includes(normalizeText(analyticsQuery)) ||
        normalizeText(row.lesson_title).includes(normalizeText(analyticsQuery)) ||
        normalizeText(row.mon_hoc).includes(normalizeText(analyticsQuery));
      const matchesGrade = analyticsGradeFilter === 'Tất cả' || String(row.khoi || '') === String(analyticsGradeFilter);
      const lessonMeta = lessonsById.get(row.lesson_id);
      const matchesClass = analyticsClassFilter === 'Tất cả' || String(row.lop_id || '') === String(analyticsClassFilter);
      const matchesSubject = analyticsSubjectFilter === 'Tất cả' || String(lessonMeta?.mon_id || row.mon_hoc || '') === String(analyticsSubjectFilter) || String(row.mon_hoc || '') === String(analyticsSubjectFilter);
      const matchesLesson = analyticsLessonFilter === 'Tất cả' || row.lesson_id === analyticsLessonFilter;
      const matchesStatus = analyticsStatusFilter === 'Tất cả' || row.status === analyticsStatusFilter;
      return matchesQuery && matchesGrade && matchesClass && matchesSubject && matchesLesson && matchesStatus;
    });
  }, [analyticsRows, analyticsQuery, analyticsGradeFilter, analyticsClassFilter, analyticsSubjectFilter, analyticsLessonFilter, analyticsStatusFilter, lessonsById]);


  const loadLessonComments = useCallback(async (lessonId: string) => {
    if (!user?.token || !lessonId || lessonId === 'Tất cả') {
      setLessonComments([]);
      return;
    }
    setLessonComments([]);
    setIsLessonCommentsLoading(true);
    const res = await listLessonCommentsApi(user.token, lessonId);
    setIsLessonCommentsLoading(false);
    if (!res.ok) {
      setLessonComments([]);
      if (!handleSessionError(res.message)) showToast(res.message || 'Không tải được bình luận bài học', 'error');
      return;
    }
    setLessonComments(res.data?.items || []);
  }, [user?.token]);

  const handleAddLessonAnalyticsComment = useCallback(async (payload: { lesson_id: string; noi_dung: string; parent_id?: string; loai?: string }) => {
    if (!user?.token) return false;
    const res = await addLessonCommentApi(user.token, payload);
    if (!res.ok) {
      if (!handleSessionError(res.message)) showToast(res.message || 'Không gửi được bình luận', 'error');
      return false;
    }
    await loadLessonComments(payload.lesson_id);
    showToast(payload.parent_id ? 'Đã trả lời bình luận' : 'Đã gửi phản hồi', 'success');
    return true;
  }, [user?.token, loadLessonComments]);

  const handleUpdateLessonAnalyticsComment = useCallback(async (payload: { comment_id: string; trang_thai?: string; noi_dung?: string }) => {
    if (!user?.token) return false;
    const res = await updateLessonCommentApi(user.token, payload);
    if (!res.ok) {
      if (!handleSessionError(res.message)) showToast(res.message || 'Không cập nhật được bình luận', 'error');
      return false;
    }
    const reloadLessonId = analyticsLessonFilter !== 'Tất cả' ? analyticsLessonFilter : selectedLesson?.lesson_id || '';
    if (reloadLessonId) await loadLessonComments(reloadLessonId);
    showToast(payload.trang_thai === 'hidden' ? 'Đã ẩn bình luận' : 'Đã cập nhật bình luận', 'success');
    return true;
  }, [user?.token, analyticsLessonFilter, selectedLesson?.lesson_id, loadLessonComments]);

  const handleModerateLearningResult = useCallback(async (payload: LearningResultModerationPayload) => {
    if (!user?.token || user.vai_tro === 'student') return false;
    const res = await moderateLearningResultApi(user.token, payload);
    if (!res.ok) {
      if (!handleSessionError(res.message)) showToast(res.message || 'Không xử lý được kết quả học tập.', 'error');
      return false;
    }
    const progressRes = await listLearningProgressApi(user.token);
    if (progressRes.ok) {
      const refreshed = (progressRes.data?.items || [])
        .map((item) => sanitizeProgressRecord(item))
        .filter(Boolean) as LessonProgressRecord[];
      setProgressRecordsSync(refreshed);
    }
    showToast(res.message || 'Đã xử lý kết quả học tập.', 'success');
    return true;
  }, [user, setProgressRecordsSync]);

  const assistantSuggestions = useMemo(() => {
    if (!selectedLessonContent) return undefined;
    const helper = selectedLessonContent.tro_ly_ai || {};
    const byStage = helper[viewerStage as keyof typeof helper];
    return Array.isArray(byStage) && byStage.length > 0 ? byStage : undefined;
  }, [selectedLessonContent, viewerStage]);

  const filteredAccounts = useMemo(() => {
    return accounts.filter((item) => {
      const normalizedQuery = normalizeText(accountQuery);
      const matchesQuery =
        !accountQuery ||
        normalizeText(item.user_id).includes(normalizedQuery) ||
        normalizeText(item.ma_hoc_sinh).includes(normalizedQuery) ||
        normalizeText(item.ho_ten).includes(normalizedQuery) ||
        normalizeText(item.ten_dang_nhap).includes(normalizedQuery) ||
        normalizeText(item.so_dien_thoai).includes(normalizedQuery) ||
        normalizeText(item.tai_khoan_dinh_danh).includes(normalizedQuery);
      const matchesRole = accountRoleFilter === 'Tất cả' || item.vai_tro === accountRoleFilter;
      const matchesGrade = accountGradeFilter === 'Tất cả' || item.khoi === accountGradeFilter;
      const matchesClass = accountClassFilter === 'Tất cả' || item.lop_id === accountClassFilter;
      const matchesStatus = accountStatusFilter === 'Tất cả' || item.trang_thai === accountStatusFilter;
      return matchesQuery && matchesRole && matchesGrade && matchesClass && matchesStatus;
    });
  }, [accounts, accountQuery, accountRoleFilter, accountGradeFilter, accountClassFilter, accountStatusFilter]);

  const accountPageSize = 50;
  const accountTotalPages = Math.max(1, Math.ceil(filteredAccounts.length / accountPageSize));
  const pagedAccounts = useMemo(
    () => filteredAccounts.slice((accountPage - 1) * accountPageSize, accountPage * accountPageSize),
    [filteredAccounts, accountPage],
  );

  useEffect(() => {
    setAccountPage(1);
  }, [accountQuery, accountRoleFilter, accountGradeFilter, accountClassFilter, accountStatusFilter]);

  useEffect(() => {
    if (accountPage > accountTotalPages) setAccountPage(accountTotalPages);
  }, [accountPage, accountTotalPages]);

  const selectedAccountIdSet = useMemo(() => new Set(selectedAccountIds), [selectedAccountIds]);
  const selectedAccounts = useMemo(() => accounts.filter((item) => selectedAccountIdSet.has(item.user_id)), [accounts, selectedAccountIdSet]);
  const selectableFilteredAccounts = useMemo(() => pagedAccounts.filter((item) => currentUserIsAdmin && user && item.user_id !== user.user_id), [pagedAccounts, user, currentUserIsAdmin]);
  const allVisibleAccountsSelected = selectableFilteredAccounts.length > 0 && selectableFilteredAccounts.every((item) => selectedAccountIdSet.has(item.user_id));

  useEffect(() => {
    setSelectedAccountIds((current) => current.filter((id) => accounts.some((item) => item.user_id === id)));
  }, [accounts]);

  const toggleSelectAccount = (account: Account) => {
    if (!user || !currentUserIsAdmin || account.user_id === user.user_id) return;
    setSelectedAccountIds((current) => current.includes(account.user_id) ? current.filter((id) => id !== account.user_id) : [...current, account.user_id]);
  };

  const toggleSelectVisibleAccounts = () => {
    const visibleIds = selectableFilteredAccounts.map((item) => item.user_id);
    if (!visibleIds.length) return;
    setSelectedAccountIds((current) => {
      const next = new Set(current);
      if (visibleIds.every((id) => next.has(id))) {
        visibleIds.forEach((id) => next.delete(id));
      } else {
        visibleIds.forEach((id) => next.add(id));
      }
      return Array.from(next);
    });
  };

  const filteredClasses = useMemo(() => {
    return classes.filter((item) => {
      const matchesQuery = !classQuery || normalizeText(item.lop_id).includes(normalizeText(classQuery)) || normalizeText(item.ten_lop).includes(normalizeText(classQuery));
      const matchesGrade = classGradeFilter === 'Tất cả' || item.khoi === classGradeFilter;
      const matchesStatus = classStatusFilter === 'Tất cả' || item.trang_thai === classStatusFilter;
      return matchesQuery && matchesGrade && matchesStatus;
    });
  }, [classes, classQuery, classGradeFilter, classStatusFilter]);

  const selectedClassIdSet = useMemo(() => new Set(selectedClassIds), [selectedClassIds]);
  const selectedClasses = useMemo(() => classes.filter((item) => selectedClassIdSet.has(item.lop_id)), [classes, selectedClassIdSet]);
  const allVisibleClassesSelected = filteredClasses.length > 0 && filteredClasses.every((item) => selectedClassIdSet.has(item.lop_id));

  useEffect(() => {
    setSelectedClassIds((current) => current.filter((id) => classes.some((item) => item.lop_id === id)));
  }, [classes]);

  const toggleSelectClass = (item: CatalogClass) => {
    if (!user || !currentUserIsAdmin) return;
    setSelectedClassIds((current) => current.includes(item.lop_id) ? current.filter((id) => id !== item.lop_id) : [...current, item.lop_id]);
  };

  const toggleSelectVisibleClasses = () => {
    const visibleIds = filteredClasses.map((item) => item.lop_id);
    if (!visibleIds.length) return;
    setSelectedClassIds((current) => {
      const next = new Set(current);
      if (visibleIds.every((id) => next.has(id))) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return Array.from(next);
    });
  };

  const filteredSubjects = useMemo(() => {
    return subjects.filter((item) => {
      const matchesQuery = !subjectQuery || normalizeText(item.mon_id).includes(normalizeText(subjectQuery)) || normalizeText(item.ten_mon).includes(normalizeText(subjectQuery));
      const matchesGrade = subjectGradeFilter === 'Tất cả' || String(item.khoi_ap_dung || '').split(',').map((grade) => grade.trim()).includes(subjectGradeFilter);
      const matchesStatus = subjectStatusFilter === 'Tất cả' || item.trang_thai === subjectStatusFilter;
      return matchesQuery && matchesGrade && matchesStatus;
    });
  }, [subjects, subjectQuery, subjectGradeFilter, subjectStatusFilter]);

  const handleLoginSuccess = (userData: User) => {
    localStorage.removeItem('aiConfig');
    setAIConfig({ apiKey: '', model: AI_MODELS[0] });
    setUser(userData);
    localStorage.setItem('user', JSON.stringify(userData));
    setActiveMenu(hasAdminPermission(userData) ? 'overview' : 'learning');
  };

  const openProfileModal = async () => {
    if (!user) return;
    if (user.vai_tro === 'student') {
      const res = await listProfileClassesApi(user.token);
      if (res.ok) {
        setProfileClasses(res.data?.items || []);
      } else {
        setProfileClasses(classes);
      }
    } else {
      setProfileClasses(classes);
    }
    setIsProfileModalOpen(true);
  };

  const handleProfileSubmit = async (payload: { ho_ten: string; khoi?: string; lop_id?: string; mat_khau?: string }) => {
    if (!user) return;
    setIsSubmitting(true);
    let updatedUser: User;
    try {
      updatedUser = await withLoading('Đang cập nhật hồ sơ cá nhân...', async () => {
        if (user.auth_provider === 'firebase') {
          if (payload.mat_khau) await updateOwnFirebasePassword(payload.mat_khau);
          await updateOwnFirebaseMemberProfile({
            displayName: payload.ho_ten,
            grade: payload.khoi,
            classId: payload.lop_id,
          });
          clearFirebaseIdentityCache();
          return {
            ...user,
            ho_ten: payload.ho_ten,
            khoi: payload.khoi || '',
            lop_id: payload.lop_id || '',
          };
        }
        const res = await updateProfileApi(user.token, payload as Record<string, unknown>);
        if (!res.ok || !res.data) throw new Error(res.message || 'Không cập nhật được hồ sơ cá nhân.');
        return { ...user, ...res.data, token: user.token };
      });
    } catch (error) {
      setIsSubmitting(false);
      showToast(error instanceof Error ? error.message : 'Không cập nhật được hồ sơ cá nhân.', 'error');
      return;
    }
    setIsSubmitting(false);
    setUser(updatedUser);
    localStorage.setItem('user', JSON.stringify(updatedUser));
    setIsProfileModalOpen(false);
    setProfileClasses([]);
    showToast('Đã cập nhật hồ sơ cá nhân', 'success');
  };


  const handleTransferSchoolYear = async (payload: {
    source_nam_hoc: string;
    target_nam_hoc: string;
    grade_scope?: string[];
    class_ids?: string[];
    include_classes?: boolean;
    include_students?: boolean;
    graduate_final_grade?: boolean;
    set_target_current?: boolean;
    archive_source_classes?: boolean;
  }) => {
    if (!user) return;
    setIsSubmitting(true);
    const res = await transferSchoolYearApi(user.token, payload);
    setIsSubmitting(false);
    if (!res.ok || !res.data) {
      if (!handleSessionError(res.message)) showToast(res.message || 'Không kết chuyển được năm học.', 'error');
      return;
    }
    setIsSchoolYearTransferOpen(false);
    await syncBaseCatalogAfterMutation();
    await loadAppData();
    const summary = res.data;
    showToast(`Đã kết chuyển năm học: ${summary.students_moved || 0} học sinh, ${summary.classes_created || 0} lớp mới, ${summary.classes_updated || 0} lớp cập nhật.`, 'success');
  };

  const handleMoveStudentsBetweenClasses = async (payload: MoveStudentsPayload) => {
    if (!user) return false;
    setIsSubmitting(true);
    const res = await moveStudentsBetweenClassesApi(user.token, payload);
    setIsSubmitting(false);
    if (!res.ok || !res.data) {
      if (!handleSessionError(res.message)) showToast(res.message || 'Không chuyển được học sinh sang lớp mới.', 'error');
      return false;
    }
    await loadAppData();
    showToast(`Đã chuyển ${res.data.moved_accounts || 0} học sinh sang lớp ${res.data.target_ten_lop || res.data.target_lop_id}.`, 'success');
    return true;
  };

  const handleCreateSchoolYear = async (payload: Partial<SchoolYear>) => {
    if (!user?.token) return false;
    setIsSubmitting(true);
    const res = await createSchoolYearApi(user.token, payload);
    setIsSubmitting(false);
    if (!res.ok) {
      if (!handleSessionError(res.message)) showToast(res.message || 'Không tạo được năm học', 'error');
      return false;
    }
    await syncBaseCatalogAfterMutation();
    await loadAppData();
    showToast('Đã tạo năm học', 'success');
    return true;
  };

  const handleUpdateSchoolYear = async (payload: Partial<SchoolYear>) => {
    if (!user?.token) return false;
    setIsSubmitting(true);
    const res = await updateSchoolYearApi(user.token, payload);
    setIsSubmitting(false);
    if (!res.ok) {
      if (!handleSessionError(res.message)) showToast(res.message || 'Không cập nhật được năm học', 'error');
      return false;
    }
    await syncBaseCatalogAfterMutation();
    await loadAppData();
    showToast('Đã cập nhật năm học', 'success');
    return true;
  };

  const handleSetCurrentSchoolYear = async (namHocId: string) => {
    if (!user?.token) return false;
    setIsSubmitting(true);
    const res = await setCurrentSchoolYearApi(user.token, namHocId);
    setIsSubmitting(false);
    if (!res.ok || !res.data) {
      if (!handleSessionError(res.message)) showToast(res.message || 'Không đặt được năm học hiện hành', 'error');
      return false;
    }
    await syncBaseCatalogAfterMutation();
    await loadAppData();
    setAnalyticsSchoolYearFilter(res.data.ten_nam_hoc || getComputedSchoolYear());
    showToast(`Đã đặt năm học ${res.data.ten_nam_hoc} là hiện hành`, 'success');
    return true;
  };

  const clearAuthState = useCallback((showMessage = true) => {
    setUser(null);
    setSelectedLesson(null);
    setSelectedLessonContent(null);
    setArenaLesson(null);
    setArenaLessonContent(null);
    setLessonRows([]);
    setAccounts([]);
    setClasses([]);
    setSubjects([]);
    setSchoolYears([]);
    setPendingShares([]);
    setSystemDiagnostics(null);
    setAIConfig({ apiKey: '', model: AI_MODELS[0] });
    setIsWelcomeVideoOpen(false);
    setIsWelcomeVideoPreview(false);
    setWelcomeVideoModalConfig(sanitizeVideoConfig(DEFAULT_VIDEO_POPUP_CONFIG as Partial<VideoPopupConfig>));
    welcomeVideoSignatureRef.current = '';
    clearFirebaseIdentityCache();
    localStorage.removeItem('user');
    localStorage.removeItem('aiConfig');
    if (showMessage) showToast('Đã đăng xuất', 'success');
  }, []);

  const handleLogout = useCallback((options?: { showMessage?: boolean; revokeRemote?: boolean }) => {
    const currentToken = user?.token;
    const showMessage = options?.showMessage !== false;
    const revokeRemote = options?.revokeRemote !== false;
    clearAuthState(showMessage);
    if (revokeRemote && currentToken) {
      void logoutApi(currentToken);
    } else {
      void signOutFirebase().catch(() => undefined);
    }
  }, [user?.token, clearAuthState]);

  const handleSaveAIConfig = async (config: AIConfig) => {
    const normalizedAccountConfig = sanitizeStoredAIConfig(config);

    if (!user) {
      setAIConfig(normalizedAccountConfig);
      return;
    }

    const res = await saveUserConfigApi(user.token, normalizedAccountConfig);
    if (!res.ok || !res.data) {
      if (!handleSessionError(res.message)) showToast(res.message || 'Không lưu được cấu hình AI.', 'error');
      return;
    }

    const nextConfig = sanitizeStoredAIConfig(res.data);
    setAIConfig(nextConfig);
    localStorage.removeItem('aiConfig');
    showToast('Đã lưu cấu hình AI theo tài khoản', 'success');
  };

  const handleDeleteAIConfig = async () => {
    if (!user) {
      setAIConfig({ apiKey: '', model: AI_MODELS[0] });
      localStorage.removeItem('aiConfig');
      return;
    }
    const res = await deleteUserConfigApi(user.token, aiConfig.model || AI_MODELS[0]);
    if (!res.ok || !res.data) {
      if (!handleSessionError(res.message)) showToast(res.message || 'Không xóa được API key của tài khoản.', 'error');
      return;
    }
    setAIConfig(sanitizeStoredAIConfig(res.data));
    localStorage.removeItem('aiConfig');
    showToast('Đã xóa API key của tài khoản hiện tại', 'success');
  };

  const handleSaveVideoConfig = async (config: VideoPopupConfig) => {
    const normalizedConfig = sanitizeVideoConfig({
      ...config,
      updatedAt: new Date().toISOString(),
      updatedBy: user?.user_id || '',
    });

    if (!user) {
      setVideoConfig(normalizedConfig);
      setWelcomeVideoModalConfig(normalizedConfig);
      localStorage.setItem('edu_smart_system_video_config_v1', JSON.stringify(normalizedConfig));
      showToast('Đã lưu cấu hình video trên trình duyệt hiện tại.', 'success');
      return;
    }

    setIsSubmitting(true);
    const res = await saveVideoConfigApi(user.token, normalizedConfig);
    setIsSubmitting(false);

    if (!res.ok || !res.data) {
      if (!handleSessionError(res.message)) showToast(res.message || 'Không lưu được cấu hình video.', 'error');
      return;
    }

    const nextConfig = sanitizeVideoConfig(res.data);
    setVideoConfig(nextConfig);
    setWelcomeVideoModalConfig(nextConfig);
    localStorage.setItem('edu_smart_system_video_config_v1', JSON.stringify(nextConfig));
    showToast(res.message || 'Đã lưu cấu hình video.', res.message?.toLowerCase().includes('trình duyệt') ? 'info' : 'success');
  };

  const openWelcomeVideoPreview = (config?: VideoPopupConfig) => {
    setWelcomeVideoModalConfig(sanitizeVideoConfig((config || videoConfig) as Partial<VideoPopupConfig>));
    setIsWelcomeVideoPreview(true);
    setIsWelcomeVideoOpen(true);
  };

  const handleCloseWelcomeVideo = () => {
    if (!isWelcomeVideoPreview) {
      markWelcomeVideoSeen(videoConfig, user);
    }
    setIsWelcomeVideoPreview(false);
    setIsWelcomeVideoOpen(false);
    setWelcomeVideoModalConfig(videoConfig);
  };

  const persistProgressRecord = useCallback(async (record: LessonProgressRecord, silent = true) => {
    if (!user || user.vai_tro !== 'student') return;
    const payload: LessonProgressRecord = activeCoLearningSession && activeCoLearningSession.lesson_id === record.lesson_id
      ? {
          ...record,
          study_mode: 'co_learning',
          co_learning_session_id: activeCoLearningSession.co_learning_session_id,
          co_learner_ids: getCoLearningSessionUserIds(activeCoLearningSession).join(','),
          co_learner_user_ids: getCoLearningSessionUserIds(activeCoLearningSession),
          co_learner_names: getCoLearningSessionNames(activeCoLearningSession),
          result_group_id: activeCoLearningSession.co_learning_session_id,
        }
      : { ...record, study_mode: 'single', co_learning_session_id: '', co_learner_ids: '', co_learner_user_ids: [], co_learner_names: [], result_group_id: `${record.user_id}_${record.lesson_id}` };
    const res = await saveLearningProgressApi(user.token, payload);
    if (!res.ok) {
      if (!silent && !handleSessionError(res.message)) showToast(res.message || 'Không lưu được tiến trình học lên hệ thống.', 'error');
      return;
    }
    if (res.data) {
      delete progressPendingRecordsRef.current[record.progress_id];
      setProgressRecordsSync((current) => mergeProgressCollections(current.filter((item) => item.progress_id !== res.data!.progress_id), [sanitizeProgressRecord(res.data!)! ]));
    }
  }, [user, activeCoLearningSession]);

  useEffect(() => {
    const flushPendingProgress = () => {
      (Object.values(progressSaveTimersRef.current) as number[]).forEach(timer => window.clearTimeout(timer));
      progressSaveTimersRef.current = {};
      Object.values(progressPendingRecordsRef.current).forEach(record => {
        void persistProgressRecord(record, true);
      });
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') flushPendingProgress();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pagehide', flushPendingProgress);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pagehide', flushPendingProgress);
    };
  }, [persistProgressRecord]);

  const applyProgressUpdate = useCallback((lesson: Lesson, updater: (record: LessonProgressRecord) => LessonProgressRecord | null) => {
    if (!user || user.vai_tro !== 'student') return;
    const currentItems = progressRecordsRef.current;
    const existing = sanitizeProgressRecord(currentItems.find((item) => item.progress_id === `${user.user_id}_${lesson.lesson_id}`)) || createEmptyProgressRecord(user.user_id, lesson);
    const cloned: LessonProgressRecord = {
      ...existing,
      step_details: JSON.parse(JSON.stringify(existing.step_details)),
    };
    const updated = updater(cloned);
    if (!updated) return;
    const baseRecord = recomputeProgress(updated);
    const nextRecord: LessonProgressRecord = activeCoLearningSession && activeCoLearningSession.lesson_id === lesson.lesson_id
      ? {
          ...baseRecord,
          study_mode: 'co_learning',
          co_learning_session_id: activeCoLearningSession.co_learning_session_id,
          co_learner_ids: getCoLearningSessionUserIds(activeCoLearningSession).join(','),
          co_learner_user_ids: getCoLearningSessionUserIds(activeCoLearningSession),
          co_learner_names: getCoLearningSessionNames(activeCoLearningSession),
          result_group_id: activeCoLearningSession.co_learning_session_id,
        }
      : { ...baseRecord, study_mode: 'single', co_learning_session_id: '', co_learner_ids: '', co_learner_user_ids: [], co_learner_names: [], result_group_id: `${baseRecord.user_id}_${baseRecord.lesson_id}` };
    setProgressRecordsSync((current) => mergeProgressCollections(current.filter((item) => item.progress_id !== nextRecord.progress_id), [nextRecord]));
    const timerKey = nextRecord.progress_id;
    progressPendingRecordsRef.current[timerKey] = nextRecord;
    if (progressSaveTimersRef.current[timerKey]) window.clearTimeout(progressSaveTimersRef.current[timerKey]);
    const isCheckpoint = nextRecord.status === 'completed' || nextRecord.completed_steps > existing.completed_steps;
    progressSaveTimersRef.current[timerKey] = window.setTimeout(() => {
      delete progressSaveTimersRef.current[timerKey];
      void persistProgressRecord(nextRecord, true);
    }, isCheckpoint ? 400 : 12000);
  }, [user, activeCoLearningSession, persistProgressRecord, setProgressRecordsSync]);

  const markStepOpened = useCallback((lesson: Lesson, stage: LessonStageKey) => {
    applyProgressUpdate(lesson, (record) => {
      const detail = record.step_details[stage] || createEmptyStepDetail();
      if (detail.opened && record.last_stage === stage) return null;
      record.step_details[stage] = {
        ...detail,
        opened: true,
        lastVisitedAt: new Date().toISOString(),
      };
      record.last_stage = stage;
      return record;
    });
  }, [applyProgressUpdate]);

  const markStepViewedComplete = useCallback((lesson: Lesson, stage: LessonStageKey) => {
    applyProgressUpdate(lesson, (record) => {
      const detail = record.step_details[stage] || createEmptyStepDetail();
      if (detail.viewedComplete) return null;
      record.step_details[stage] = {
        ...detail,
        opened: true,
        viewedComplete: true,
        completed: stage === 'luyen_tap' ? detail.completed : true,
        lastVisitedAt: new Date().toISOString(),
        percent: stage === 'luyen_tap' && (detail.quizTotal || 0) > 0 ? detail.percent || 100 : 100,
      };
      record.last_stage = stage;
      return record;
    });
  }, [applyProgressUpdate]);

  const updateQuizMetrics = useCallback((lesson: Lesson, stage: LessonStageKey, metrics: { answered: number; correct: number; total: number; answers?: Record<string, LessonQuestionAnswerState>; sectionProgress?: Record<string, SectionLearningProgress>; finalExam?: LearningStepProgress['finalExam'] }) => {
    applyProgressUpdate(lesson, (record) => {
      const detail = record.step_details[stage] || createEmptyStepDetail();
      const nextAnswers = metrics.answers || detail.quizAnswers || {};
      const sameAnswers = JSON.stringify(detail.quizAnswers || {}) === JSON.stringify(nextAnswers || {});
      const sameFinalExam = JSON.stringify(detail.finalExam || {}) === JSON.stringify(metrics.finalExam || detail.finalExam || {});
      if (
        Number(detail.quizAnswered || 0) === Number(metrics.answered || 0) &&
        Number(detail.quizCorrect || 0) === Number(metrics.correct || 0) &&
        Number(detail.quizTotal || 0) === Number(metrics.total || 0) &&
        sameAnswers &&
        JSON.stringify(detail.sectionProgress || {}) === JSON.stringify(metrics.sectionProgress || {}) &&
        sameFinalExam
      ) {
        return null;
      }
      record.step_details[stage] = {
        ...detail,
        opened: true,
        viewedComplete: metrics.total > 0 ? metrics.answered >= metrics.total : detail.viewedComplete,
        completed: metrics.total > 0 ? metrics.answered >= metrics.total && (metrics.correct / Math.max(1, metrics.total)) >= 0.6 : detail.completed,
        quizAnswered: metrics.answered,
        quizCorrect: metrics.correct,
        quizTotal: metrics.total,
        quizAnswers: nextAnswers,
        sectionProgress: metrics.sectionProgress || detail.sectionProgress || {},
        finalExam: metrics.finalExam || detail.finalExam,
        lastVisitedAt: new Date().toISOString(),
      };
      record.last_stage = stage;
      return record;
    });
  }, [applyProgressUpdate]);

  const handleLessonViewerStepOpened = useCallback((stage: LessonStageKey) => {
    if (selectedLesson && user?.vai_tro === 'student') {
      markStepOpened(selectedLesson, stage);
    }
  }, [selectedLesson, user, markStepOpened]);

  const handleLessonViewerStepViewedComplete = useCallback((stage: LessonStageKey) => {
    if (selectedLesson && user?.vai_tro === 'student') {
      markStepViewedComplete(selectedLesson, stage);
    }
  }, [selectedLesson, user, markStepViewedComplete]);

  const handleLessonViewerQuizMetricsChange = useCallback((stage: LessonStageKey, metrics: { answered: number; correct: number; total: number; answers?: Record<string, LessonQuestionAnswerState>; sectionProgress?: Record<string, SectionLearningProgress>; finalExam?: LearningStepProgress['finalExam'] }) => {
    if (selectedLesson && user?.vai_tro === 'student') {
      updateQuizMetrics(selectedLesson, stage, metrics);
    }
  }, [selectedLesson, user, updateQuizMetrics]);

  const closeCoLearningModal = useCallback(() => {
    setIsCoLearningModalOpen(false);
    setCoLearningLesson(null);
    setCoLearningClassmates([]);
    setCoLearningSelectedUserIds([]);
    setCoLearningPasswords({});
    setReusableCoLearningSession(null);
    setCoLearningError('');
    setIsCoLearningLoading(false);
    setIsCoLearningSubmitting(false);
  }, []);

  const openLessonDirect = async (lesson: Lesson, coSession: CoLearningSession | null = null) => {
    if (!user) return;
    if (user.vai_tro === 'student' && lesson.is_locked === true) {
      showToast(`Bài “${lesson.tieu_de}” đang được giáo viên khóa. Em hãy chờ giáo viên mở bài.`, 'error');
      return;
    }
    const res = await withLoading('Đang mở bài học...', () => getLessonContentApi(user.token, lesson.lesson_id));
    if (!res.ok) {
      if (!handleSessionError(res.message)) showToast(res.message, 'error');
      return;
    }

    const payload = res.data as LessonContentResponse;
    const { normalizeLessonContent } = await import('./services/gemini');
    setSelectedLesson(lesson);
    setSelectedLessonContent(payload?.content ? normalizeLessonContent(payload.content) : null);
    setViewerStage('khoi_dong');
    setActiveCoLearningSession(coSession);
    setIsLessonViewerOpen(true);
    void loadLessonComments(lesson.lesson_id);
  };

  const openCoLearningChoice = async (lesson: Lesson) => {
    if (!user) return;
    setCoLearningLesson(lesson);
    setCoLearningClassmates([]);
    setCoLearningSelectedUserIds([]);
    setCoLearningPasswords({});
    setReusableCoLearningSession(null);
    setCoLearningError('');
    setIsCoLearningModalOpen(true);
    setIsCoLearningLoading(true);
    const res = await listClassmatesForStudyApi(user.token, lesson.lesson_id);
    setIsCoLearningLoading(false);
    if (!res.ok) {
      if (handleSessionError(res.message)) return;
      setCoLearningError(res.message || 'Không tải được danh sách bạn cùng lớp.');
      return;
    }
    setCoLearningClassmates(res.data?.items || []);
    setReusableCoLearningSession(res.data?.reusable_session || null);
  };

  const openLesson = async (lesson: Lesson) => {
    if (!user) return;
    if (user.vai_tro === 'student') {
      if (lesson.is_locked === true) {
        showToast(`Bài “${lesson.tieu_de}” đang được giáo viên khóa. Em chưa thể vào học lúc này.`, 'error');
        return;
      }
      const currentProgress = currentStudentProgressByLesson[lesson.lesson_id];
      if (currentProgress?.result_state === 'invalid_cheating' && currentProgress.retake_allowed === false) {
        showToast(`Kết quả bài “${lesson.tieu_de}” đã bị hủy do gian lận và giáo viên không cho phép làm lại.`, 'error');
        return;
      }
      await openCoLearningChoice(lesson);
      return;
    }
    await openLessonDirect(lesson, null);
  };

  const handleStudyAlone = async () => {
    const lesson = coLearningLesson;
    closeCoLearningModal();
    if (lesson) await openLessonDirect(lesson, null);
  };

  const handleStartCoLearning = async () => {
    if (!user || !coLearningLesson) return;
    if (!coLearningSelectedUserIds.length) {
      setCoLearningError('Vui lòng chọn ít nhất một bạn học cùng.');
      return;
    }
    const selectedClassmates = coLearningSelectedUserIds
      .map((userId) => coLearningClassmates.find((item) => item.user_id === userId))
      .filter((item): item is Account => Boolean(item));
    if (selectedClassmates.length !== coLearningSelectedUserIds.length) {
      setCoLearningError('Danh sách bạn học đã thay đổi. Vui lòng chọn lại.');
      return;
    }
    const credentials = selectedClassmates.map((student) => ({
      user_id: student.user_id,
      identifier: student.ma_hoc_sinh || student.ten_dang_nhap,
      password: coLearningPasswords[student.user_id] || '',
    }));
    if (credentials.some((item) => !item.password.trim())) {
      setCoLearningError('Vui lòng nhập mật khẩu xác nhận của tất cả bạn đã chọn.');
      return;
    }
    setIsCoLearningSubmitting(true);
    setCoLearningError('');
    const res = await startCoLearningSessionApi(user.token, coLearningLesson.lesson_id, credentials);
    setIsCoLearningSubmitting(false);
    if (!res.ok || !res.data) {
      if (handleSessionError(res.message)) return;
      setCoLearningError(res.message || 'Không xác nhận được phiên học cùng.');
      return;
    }
    const lesson = coLearningLesson;
    const session = res.data;
    closeCoLearningModal();
    showToast(`Đã xác nhận nhóm ${getCoLearningSessionUserIds(session).length} học sinh. Tiến độ và điểm sẽ được đồng bộ cho cả nhóm.`, 'success');
    await openLessonDirect(lesson, session);
  };

  const handleResumeCoLearning = async () => {
    if (!coLearningLesson || !reusableCoLearningSession) return;
    const lesson = coLearningLesson;
    const session = reusableCoLearningSession;
    closeCoLearningModal();
    showToast(`Đang tiếp tục với nhóm ${getCoLearningSessionUserIds(session).length} học sinh đã xác nhận.`, 'success');
    await openLessonDirect(lesson, session);
  };

  const handleArenaSelectLesson = async (lesson: Lesson) => {
    if (!user) return;
    if (user.vai_tro === 'student' && lesson.is_locked === true) {
      showToast(`Bài “${lesson.tieu_de}” đang được giáo viên khóa. Em chưa thể vào Đấu trường lúc này.`, 'error');
      return;
    }
    if (user.vai_tro === 'student' && lesson.arena_ready === false) {
      showToast(`Bài “${lesson.tieu_de}” chưa có câu hỏi luyện tập để thi đấu.`, 'error');
      return;
    }
    const res = await withLoading('Đang chuẩn bị đấu trường tri thức...', () => getLessonContentApi(user.token, lesson.lesson_id));
    if (!res.ok) {
      if (!handleSessionError(res.message)) showToast(res.message, 'error');
      return;
    }

    const payload = res.data as LessonContentResponse;
    const { normalizeLessonContent } = await import('./services/gemini');
    setArenaLesson(lesson);
    setArenaLessonContent(payload?.content ? normalizeLessonContent(payload.content) : null);
    setActiveMenu('arena');
  };

  const openComposerForCreate = () => {
    if (user?.vai_tro === 'student') {
      showToast('Học sinh không có quyền tạo bài học. Em hãy chọn bài giáo viên đã chia sẻ để học.', 'error');
      return;
    }
    setEditingLesson(null);
    setEditingContent(null);
    setIsComposerOpen(true);
  };

  const openComposerForEdit = async (lesson: Lesson) => {
    if (!user) return;
    const res = await withLoading('Đang tải dữ liệu bài học để chỉnh sửa...', () => getLessonContentApi(user.token, lesson.lesson_id));
    if (!res.ok) {
      if (!handleSessionError(res.message)) showToast(res.message, 'error');
      return;
    }
    setEditingLesson(lesson);
    const loadedContent = (res.data as LessonContentResponse).content;
    const { normalizeLessonContent } = await import('./services/gemini');
    setEditingContent(loadedContent ? normalizeLessonContent(loadedContent) : null);
    setIsComposerOpen(true);
  };

  const handleComposerSave = async (values: LessonComposerValues) => {
    if (!user) return;
    if (user.vai_tro === 'student') {
      showToast('Học sinh không có quyền tạo hoặc chỉnh sửa bài học.', 'error');
      return;
    }
    const savingDraft = values.save_mode === 'draft';
    const payload = {
      ...values,
      share_now: !savingDraft && values.pham_vi === 'shared',
      lop_id: values.lop_id,
      pham_vi: savingDraft ? 'private' as const : values.pham_vi,
    };

    const res = await withLoading(savingDraft ? 'Đang lưu bản nháp...' : values.lesson_id ? 'Đang cập nhật bài học...' : 'Đang xuất bản bài học mới...', () =>
      values.lesson_id ? updateLessonApi(user.token, payload) : createLessonApi(user.token, payload),
    );
    if (!res.ok) {
      if (!handleSessionError(res.message)) throw new Error(res.message);
      return;
    }

    const savedRow = res.data as LessonRow | undefined;
    await loadAppData();

    if (!savingDraft && !values.lesson_id && savedRow && values.lesson_json) {
      setSelectedLesson(mapLessonRow(savedRow, subjects, classes, accounts, user));
      setSelectedLessonContent(values.lesson_json);
      setViewerStage('khoi_dong');
      setActiveMenu(currentUserIsAdmin ? 'lessons' : 'my_lessons');
      setIsLessonViewerOpen(true);
      setIsComposerOpen(false);
      showToast('Đã tạo bài học mới và mở để xem ngay.', 'success');
      return;
    }

    setIsComposerOpen(false);
    showToast(savingDraft ? 'Đã lưu bản nháp bài học' : values.lesson_id ? 'Đã cập nhật và xuất bản bài học' : 'Đã xuất bản bài học mới', 'success');
  };

  const openReviewPracticeCreator = () => {
    if (user?.vai_tro === 'student') {
      showToast('Học sinh không có quyền tạo bài ôn tập.', 'error');
      return;
    }
    setIsReviewModalOpen(true);
  };

  const handleCreateReviewPractice = async (payload: Record<string, unknown>) => {
    if (!user) return;
    if (user.vai_tro === 'student') {
      showToast('Học sinh không có quyền tạo bài ôn tập.', 'error');
      return;
    }
    setIsSubmitting(true);
    const res = await withLoading('Đang tạo bài ôn tập...', () => createReviewPracticeApi(user.token, payload));
    setIsSubmitting(false);
    if (!res.ok) {
      if (!handleSessionError(res.message)) showToast(res.message, 'error');
      return;
    }
    setIsReviewModalOpen(false);
    await loadAppData();
    showToast('Đã tạo bài ôn tập tổng hợp từ nhiều bài học.', 'success');
  };

  const openReviewPractice = async (review: ReviewPracticeRow) => {
    if (!user) return;
    const res = await withLoading('Đang mở bài ôn tập...', () => getReviewPracticeApi(user.token, review.review_id));
    if (!res.ok || !res.data) {
      if (!handleSessionError(res.message)) showToast(res.message || 'Không mở được bài ôn tập.', 'error');
      return;
    }
    const payload = res.data as ReviewPracticeContentResponse;
    setSelectedReviewPractice(payload.review);
    setSelectedReviewQuestions(payload.questions || []);
    setSelectedReviewConfig(payload.config);
    setIsReviewViewerOpen(true);
  };

  const handleSubmitReviewPractice = async (result: { review_id: string; diem: number; so_cau_dung: number; tong_so_cau: number; answers_json: string; started_at?: string; submitted_at?: string; auto_submitted?: boolean; time_spent_seconds?: number }) => {
    if (!user) return;
    const res = await submitReviewPracticeApi(user.token, result);
    if (!res.ok) {
      if (!handleSessionError(res.message)) showToast(res.message || 'Không lưu được kết quả ôn tập.', 'error');
      return;
    }
    await loadAppData();
    showToast('Đã lưu kết quả bài ôn tập.', 'success');
  };

  const loadReviewPracticeResults = async (review: ReviewPracticeRow) => {
    if (!user || user.vai_tro === 'student') return;
    setIsReviewResultsLoading(true);
    const classId = review.lop_id || (analyticsClassFilter !== 'Tất cả' ? analyticsClassFilter : '');
    const res = await getReviewPracticeResultsApi(user.token, { review_id: review.review_id, lop_id: classId });
    setIsReviewResultsLoading(false);
    if (!res.ok || !res.data) {
      setReviewResultAttempts([]);
      setReviewResultStudents([]);
      setReviewResultSummary(null);
      if (!handleSessionError(res.message)) showToast(res.message || 'Không tải được kết quả bài ôn tập.', 'error');
      return;
    }
    setReviewResultsPractice(res.data.review || review);
    setReviewResultAttempts(res.data.attempts || res.data.items || []);
    setReviewResultStudents(res.data.students || []);
    setReviewResultSummary(res.data.summary || null);
  };

  const openReviewPracticeResults = async (review: ReviewPracticeRow) => {
    if (!user || user.vai_tro === 'student') return;
    setReviewResultsPractice(review);
    setReviewResultAttempts([]);
    setReviewResultStudents([]);
    setReviewResultSummary(null);
    setIsReviewResultsOpen(true);
    await loadReviewPracticeResults(review);
  };

  const askDeleteReviewPractice = (review: ReviewPracticeRow) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Xóa bài ôn tập',
      description: `Bạn có chắc muốn xóa bài ôn tập “${review.tieu_de}”? Kết quả ôn tập đã nộp vẫn có thể được giữ trong dữ liệu theo dõi nếu backend cấu hình lưu lịch sử.`,
      confirmLabel: 'Xóa bài ôn tập',
      cancelLabel: 'Hủy',
      variant: 'danger',
      onConfirm: async () => {
        if (!user) return;
        setIsSubmitting(true);
        const res = await withLoading('Đang xóa bài ôn tập...', () => deleteReviewPracticeApi(user.token, review.review_id));
        setIsSubmitting(false);
        if (!res.ok) {
          if (!handleSessionError(res.message)) showToast(res.message, 'error');
          return;
        }
        setConfirmDialog(DEFAULT_CONFIRM);
        await loadAppData();
        showToast('Đã xóa bài ôn tập', 'success');
      },
    });
  };

  const askDeleteLesson = (lesson: Lesson) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Xóa bài học',
      description: `Bạn có chắc muốn xóa bài học “${lesson.tieu_de}”? Hệ thống sẽ xóa bài học, nội dung, tiến trình, bình luận, phiên học cùng, nhật ký xử lý kết quả, prompt trình chiếu và các bài ôn tập được tạo từ bài này.`,
      confirmLabel: 'Xóa bài học',
      cancelLabel: 'Hủy',
      variant: 'danger',
      onConfirm: async () => {
        if (!user) return;
        const lessonId = lesson.lesson_id;

        // V6.71.2: đóng hộp thoại ngay khi người dùng xác nhận. Firestore có thể
        // cập nhật snapshot cục bộ trước khi server ACK; nếu giữ modal chờ Promise
        // sẽ tạo cảm giác popup bị treo dù card đã biến mất khỏi danh sách.
        setConfirmDialog(DEFAULT_CONFIRM);
        setIsSubmitting(false);

        // Cập nhật UI lạc quan. Nếu xóa thất bại, loadAppData() bên dưới sẽ phục hồi
        // lại dữ liệu thật từ Firestore.
        setLessonRows((current) => current.filter((item) => item.lesson_id !== lessonId));
        setProgressRecords((current) => current.filter((item) => item.lesson_id !== lessonId));
        setLessonComments((current) => current.filter((item) => item.lesson_id !== lessonId));
        setReviewPractices((current) => current.filter((review) => {
          const raw = review.lesson_ids;
          const ids = Array.isArray(raw) ? raw : String(raw || '').split(',');
          return !ids.map((id) => String(id || '').trim()).includes(lessonId);
        }));
        setSelectedLesson((current) => current?.lesson_id === lessonId ? null : current);
        setSelectedLessonContent((current) => selectedLesson?.lesson_id === lessonId ? null : current);
        setArenaLesson((current) => current?.lesson_id === lessonId ? null : current);
        setArenaLessonContent((current) => arenaLesson?.lesson_id === lessonId ? null : current);

        showToast('Đang xóa bài học và toàn bộ dữ liệu liên quan...', 'info');
        try {
          const res = await deleteLessonApi(user.token, lessonId);
          if (!res.ok) {
            await loadAppData();
            if (!handleSessionError(res.message)) showToast(res.message || 'Không xóa được bài học.', 'error');
            return;
          }

          const counts = (res.data as any)?.deleted_counts || {};
          const relatedDeleted = [
            counts.learningProgress,
            counts.learningResultActions,
            counts.lessonComments,
            counts.coLearningSessions,
            counts.slidesPrompts,
            counts.reviewPractices,
            counts.reviewAttempts,
          ].reduce((sum: number, value: unknown) => sum + Math.max(0, Number(value || 0)), 0);

          // Đồng bộ lại các danh sách liên quan sau cascade, nhưng không khóa giao diện
          // bằng popup xác nhận trong thời gian chờ network/server ACK.
          await loadAppData();
          showToast(
            relatedDeleted > 0
              ? `Đã xóa bài học và ${relatedDeleted} bản ghi dữ liệu liên quan.`
              : 'Đã xóa bài học và hoàn tất dọn dữ liệu liên quan.',
            'success',
          );
        } catch (error) {
          await loadAppData().catch(() => undefined);
          showToast(error instanceof Error ? error.message : 'Không xóa được bài học.', 'error');
        }
      },
    });
  };

  const handleToggleLessonLock = async (lesson: Lesson) => {
    if (!user || lessonLockUpdatingId) return;
    const nextLocked = lesson.is_locked !== true;
    setLessonLockUpdatingId(lesson.lesson_id);
    const res = await setLessonLockApi(user.token, lesson.lesson_id, nextLocked);
    setLessonLockUpdatingId('');
    if (!res.ok || !res.data) {
      if (!handleSessionError(res.message)) showToast(res.message || 'Không cập nhật được trạng thái khóa bài học.', 'error');
      return;
    }
    setLessonRows((current) => current.map((item) => item.lesson_id === lesson.lesson_id ? { ...item, ...res.data } : item));
    setArenaLesson((current) => current?.lesson_id === lesson.lesson_id ? { ...current, ...res.data } : current);
    setSelectedLesson((current) => current?.lesson_id === lesson.lesson_id ? { ...current, ...res.data } : current);
    showToast(nextLocked ? `Đã khóa “${lesson.tieu_de}” đối với Học tập và Đấu trường tri thức.` : `Đã mở khóa “${lesson.tieu_de}” cho Học tập và Đấu trường tri thức.`, 'success');
  };

  const handleSubmitReview = async (lesson: Lesson) => {
    if (!user) return;
    const res = await withLoading('Đang gửi bài học để admin duyệt...', () => submitLessonReviewApi(user.token, lesson.lesson_id));
    if (!res.ok) {
      if (!handleSessionError(res.message)) showToast(res.message, 'error');
      return;
    }
    await loadAppData();
    showToast('Đã gửi admin duyệt bài học', 'success');
  };

  const handleReviewShare = async (lessonId: string, approve: boolean) => {
    if (!user) return;
    const note = window.prompt(approve ? 'Ghi chú duyệt (không bắt buộc):' : 'Lý do từ chối / góp ý cho học sinh:', '') || '';
    const res = await withLoading(approve ? 'Đang duyệt bài học...' : 'Đang từ chối bài học...', () => reviewSharedLessonApi(user.token, lessonId, approve, note));
    if (!res.ok) {
      if (!handleSessionError(res.message)) showToast(res.message, 'error');
      return;
    }
    await loadAppData();
    showToast(approve ? 'Đã duyệt bài học dùng chung' : 'Đã từ chối bài học chia sẻ', 'success');
  };


  const openImportModal = (entity: ImportEntity) => {
    setImportEntity(entity);
    setAccountImportProgress(null);
    setAccountImportResult(null);
    setIsImportModalOpen(true);
  };

  const mergeClassesIntoState = (items: CatalogClass[]) => {
    setClasses((current) => {
      const merged = new Map<string, CatalogClass>(current.map(item => [item.lop_id, item] as [string, CatalogClass]));
      items.forEach(item => merged.set(item.lop_id, item));
      return Array.from(merged.values()).sort((a, b) => {
        const gradeCompare = Number(a.khoi || 0) - Number(b.khoi || 0);
        return gradeCompare || String(a.ten_lop || '').localeCompare(String(b.ten_lop || ''), 'vi');
      });
    });
  };

  const handleImportConfirm = async (preview: ImportPreviewResult) => {
    if (!user) return;
    if (!preview.validRows.length) {
      showToast('Không có dữ liệu hợp lệ để nhập.', 'error');
      return;
    }

    setIsSubmitting(true);
    const label = preview.entity === 'account' ? 'tài khoản' : preview.entity === 'class' ? 'lớp học' : 'môn học';

    if (preview.entity === 'account' && preview.sourceType === 'vnedu_student_roster') {
      const progress = { processed: 0, total: preview.validRows.length, created: 0, updated: 0, failed: 0 };
      const failures: Array<{ source_row: number; ma_hoc_sinh?: string; ho_ten?: string; reason: string }> = [];
      setAccountImportProgress({ ...progress });
      setAccountImportResult(null);
      let fatalMessage = '';
      let workingAccounts = [...accounts];

      for (let offset = 0; offset < preview.validRows.length; offset += 20) {
        const batch = preview.validRows.slice(offset, offset + 20);
        const rows = batch.map((row) => {
          const payload = { ...row, source_row: row.__rowNumber } as Record<string, unknown>;
          delete payload.__rowNumber;
          delete payload.__mode;
          delete payload.auto_create_class;
          delete payload.ten_lop_hien_thi;
          if (row.__mode === 'update') {
            delete payload.mat_khau;
            delete payload.mat_khau_khoi_tao;
            delete payload.da_doi_mat_khau;
          }
          return payload;
        });
        const response = await importStudentAccountsBatchApi(user.token, rows, '', workingAccounts);
        if (!response.ok || !response.data) {
          fatalMessage = response.message || 'Kết nối nhập tài khoản bị gián đoạn.';
          break;
        }
        if (response.data.accounts?.length) {
          const merged = new Map<string, Account>();
          workingAccounts.forEach(item => merged.set(item.firebase_uid || item.user_id, item));
          response.data.accounts.forEach(item => merged.set(item.firebase_uid || item.user_id, item));
          workingAccounts = Array.from(merged.values());
          // Hiển thị ngay các tài khoản vừa lưu, không chờ tải lại toàn hệ thống.
          setAccounts(workingAccounts);
        }
        progress.processed += batch.length;
        progress.created += Number(response.data.created_count || 0);
        progress.updated += Number(response.data.updated_count || 0);
        progress.failed += Number(response.data.failed_count || 0);
        failures.push(...(response.data.failed || []));
        setAccountImportProgress({ ...progress });
        if (response.data.retry_required) break;
      }

      setIsSubmitting(false);
      const result = { created: progress.created, updated: progress.updated, failed: progress.failed, failures };
      setAccountImportResult(result);
      setAccountQuery('');
      setAccountRoleFilter('student');
      setAccountGradeFilter('Tất cả');
      setAccountClassFilter('Tất cả');
      setAccountStatusFilter('Tất cả');
      setAccountPage(1);
      try {
        await loadDataDomain('accounts', true);
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'Đã nhập dữ liệu nhưng chưa tải lại được danh sách.', 'info');
      }
      if (fatalMessage) {
        showToast(`${fatalMessage} Đã xử lý ${progress.processed}/${progress.total}; có thể tải lại cùng file để tiếp tục mà không tạo trùng.`, 'error');
        return;
      }
      if (progress.failed > 0) {
        showToast(`Đã tạo ${progress.created}, cập nhật ${progress.updated}; còn ${progress.failed} tài khoản cần kiểm tra.`, 'info');
        return;
      }
      setIsImportModalOpen(false);
      setAccountImportProgress(null);
      showToast(`Đã thêm ${progress.created} và cập nhật ${progress.updated} hồ sơ học sinh. Tài khoản đăng nhập sẽ tự kích hoạt ở lần đầu.`, 'success');
      return;
    }

    const res = await (async () => {
      if (preview.entity === 'class') {
        const rows = preview.validRows.map((row) => {
          const payload = { ...row } as Record<string, unknown>;
          delete payload.__rowNumber;
          delete payload.__mode;
          return payload;
        });
        return importClassesBatchApi(user.token, rows);
      }
      const firebaseIdToken = preview.entity === 'account' && user.auth_provider === 'firebase'
        ? await getFirebaseIdToken(true)
        : '';
      for (const row of preview.validRows) {
        if (preview.entity === 'account') {
          const payload = { ...row } as Record<string, unknown>;
          delete payload.__rowNumber;
          delete payload.__mode;
          if (!payload.mat_khau) delete payload.mat_khau;
          const action = row.__mode === 'update' ? updateAccountApi : createAccountApi;
          const response = await action(user.token, payload, firebaseIdToken);
          if (!response.ok) return response;
          continue;
        }

        const payload = { ...row } as Record<string, unknown>;
        delete payload.__rowNumber;
        delete payload.__mode;
        const action = row.__mode === 'update' ? updateSubjectApi : createSubjectApi;
        const response = await action(user.token, payload);
        if (!response.ok) return response;
      }
      return { ok: true as const };
    })();
    setIsSubmitting(false);

    if (!res.ok) {
      if (!handleSessionError((res as { message?: string }).message)) {
        showToast((res as { message?: string }).message || 'Không nhập được dữ liệu từ file.', 'error');
      }
      return;
    }

    setIsImportModalOpen(false);
    if (preview.entity === 'class') {
      mergeClassesIntoState(((res as { data?: { items?: CatalogClass[] } }).data?.items || []));
    } else {
      await loadAppData();
    }
    showToast(`Đã nhập ${preview.validRows.length} dòng ${label}.`, 'success');
  };

  const handleAccountSubmit = async (payload: Record<string, unknown>) => {
    if (!user) return;
    setIsSubmitting(true);
    const sanitizedPayload = { ...payload };
    if (!sanitizedPayload.mat_khau) delete sanitizedPayload.mat_khau;
    const action = payload.user_id ? updateAccountApi : createAccountApi;
    const res = await withLoading(payload.user_id ? 'Đang cập nhật tài khoản...' : 'Đang tạo tài khoản...', async () => {
      const firebaseIdToken = user.auth_provider === 'firebase' ? await getFirebaseIdToken(true) : '';
      return action(user.token, sanitizedPayload, firebaseIdToken);
    });
    setIsSubmitting(false);
    if (!res.ok) {
      if (!handleSessionError(res.message)) showToast(res.message, 'error');
      return;
    }
    setIsAccountModalOpen(false);
    setEditingAccount(null);
    await loadAppData();
    showToast(payload.user_id ? 'Đã cập nhật tài khoản' : 'Đã tạo tài khoản mới', 'success');
  };

  const askDeleteAccount = (account: Account) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Xóa tài khoản',
      description: `Bạn có chắc muốn xóa tài khoản “${account.ho_ten}” (${account.ten_dang_nhap})? Dữ liệu cá nhân như cấu hình AI, tiến trình, bình luận và kết quả ôn tập sẽ bị xóa. Bài học và nội dung dùng chung sẽ được chuyển cho quản trị viên đang thao tác.`,
      confirmLabel: 'Xóa tài khoản',
      cancelLabel: 'Hủy',
      variant: 'danger',
      onConfirm: async () => {
        if (!user) return;
        setIsSubmitting(true);
        const res = await withLoading('Đang xóa tài khoản...', async () => {
          const firebaseIdToken = user.auth_provider === 'firebase' ? await getFirebaseIdToken(true) : '';
          return deleteAccountApi(user.token, account.user_id, firebaseIdToken);
        });
        setIsSubmitting(false);
        if (!res.ok) {
          if (!handleSessionError(res.message)) showToast(res.message, 'error');
          return;
        }
        setConfirmDialog(DEFAULT_CONFIRM);
        setSelectedAccountIds((current) => current.filter((id) => id !== account.user_id));
        setAccounts((current) => current.filter((item) => item.user_id !== account.user_id));
        await loadDataDomain('accounts', true);
        showToast(res.message || 'Đã xóa tài khoản', res.data?.firebaseCleanupPending ? 'info' : 'success');
      },
    });
  };

  const askDeleteSelectedAccounts = () => {
    if (!user || !currentUserIsAdmin || selectedAccounts.length === 0) return;
    const previewNames = selectedAccounts.slice(0, 5).map((item) => `${item.ho_ten} (${item.ten_dang_nhap})`).join(', ');
    const moreText = selectedAccounts.length > 5 ? ` và ${selectedAccounts.length - 5} tài khoản khác` : '';
    setConfirmDialog({
      isOpen: true,
      title: `Xóa ${selectedAccounts.length} tài khoản đã chọn`,
      description: `Bạn có chắc muốn xóa các tài khoản đã chọn: ${previewNames}${moreText}? Dữ liệu cá nhân sẽ bị xóa; bài học và nội dung dùng chung được chuyển cho quản trị viên. Hệ thống chỉ bỏ qua tài khoản đang đăng nhập hoặc tài khoản không hợp lệ.`,
      confirmLabel: 'Xóa các tài khoản đã chọn',
      cancelLabel: 'Hủy',
      variant: 'danger',
      onConfirm: async () => {
        if (!user) return;
        const ids = selectedAccounts.map((item) => item.user_id);
        setIsSubmitting(true);
        const res = await withLoading('Đang xóa các tài khoản đã chọn...', async () => {
          const firebaseIdToken = user.auth_provider === 'firebase' ? await getFirebaseIdToken(true) : '';
          return batchDeleteAccountsApi(user.token, ids, firebaseIdToken);
        });
        setIsSubmitting(false);
        if (!res.ok) {
          if (!handleSessionError(res.message)) showToast(res.message || 'Không xóa được các tài khoản đã chọn.', 'error');
          return;
        }
        setConfirmDialog(DEFAULT_CONFIRM);
        const deletedIds = new Set((res.data?.deleted || []).map((item) => item.user_id));
        setSelectedAccountIds((current) => current.filter((id) => !deletedIds.has(id)));
        setAccounts((current) => current.filter((item) => !deletedIds.has(item.user_id)));
        await loadDataDomain('accounts', true);
        const deletedCount = res.data?.deleted_count || 0;
        const failedCount = res.data?.failed_count || 0;
        showToast(res.message || (failedCount > 0 ? `Đã xóa ${deletedCount} tài khoản, giữ lại ${failedCount} tài khoản.` : `Đã xóa ${deletedCount} tài khoản đã chọn.`), failedCount > 0 || res.data?.firebaseCleanupPending ? 'info' : 'success');
      },
    });
  };

  const askResetSelectedPasswords = () => {
    if (!user || !currentUserIsAdmin || selectedAccounts.length === 0) return;
    const previewNames = selectedAccounts.slice(0, 5).map((item) => `${item.ho_ten} (${item.ten_dang_nhap})`).join(', ');
    const moreText = selectedAccounts.length > 5 ? ` và ${selectedAccounts.length - 5} tài khoản khác` : '';
    const studentCount = selectedAccounts.filter((item) => item.vai_tro === 'student').length;
    const otherCount = selectedAccounts.length - studentCount;
    const passwordPolicyText = [
      studentCount ? `${studentCount} học sinh sẽ dùng chính Mã học sinh` : '',
      otherCount ? `${otherCount} tài khoản giáo viên/quản trị dùng mật khẩu mặc định hệ thống` : '',
    ].filter(Boolean).join('; ');
    setConfirmDialog({
      isOpen: true,
      title: `Reset mật khẩu ${selectedAccounts.length} tài khoản`,
      description: `Bạn sắp reset mật khẩu các tài khoản đã chọn: ${previewNames}${moreText}. ${passwordPolicyText}. Các phiên đăng nhập cũ sẽ bị thu hồi và trạng thái đổi mật khẩu sẽ chuyển về Chưa đổi.`,
      confirmLabel: 'Reset mật khẩu mặc định',
      cancelLabel: 'Hủy',
      variant: 'primary',
      onConfirm: async () => {
        if (!user) return;
        const ids = selectedAccounts.map((item) => item.user_id);
        setIsSubmitting(true);
        const res = await withLoading('Đang reset mật khẩu các tài khoản đã chọn...', async () => {
          const firebaseIdToken = user.auth_provider === 'firebase' ? await getFirebaseIdToken(true) : '';
          return batchResetPasswordsApi(user.token, ids, '123456', firebaseIdToken);
        });
        setIsSubmitting(false);
        if (!res.ok) {
          if (!handleSessionError(res.message)) showToast(res.message || 'Không reset được mật khẩu.', 'error');
          return;
        }
        setConfirmDialog(DEFAULT_CONFIRM);
        await loadAppData();
        const resetCount = res.data?.reset_count || 0;
        const failedCount = res.data?.failed_count || 0;
        showToast(failedCount > 0 ? `Đã reset ${resetCount} tài khoản, ${failedCount} tài khoản không reset được.` : `Đã reset mật khẩu ${resetCount} tài khoản; học sinh dùng chính mã học sinh.`, failedCount > 0 ? 'info' : 'success');
      },
    });
  };

  const askDeleteSelectedClasses = () => {
    if (!user || !currentUserIsAdmin || selectedClasses.length === 0) return;
    const classDescriptions = selectedClasses.map((item) => {
      const studentCount = accounts.filter((account) => account.vai_tro === 'student' && account.lop_id === item.lop_id).length;
      return `${item.ten_lop || item.lop_id}: ${studentCount} học sinh`;
    });
    const previewText = classDescriptions.slice(0, 8).join('; ');
    const moreText = classDescriptions.length > 8 ? `; và ${classDescriptions.length - 8} lớp khác` : '';
    setConfirmDialog({
      isOpen: true,
      title: `Xóa ${selectedClasses.length} lớp đã chọn`,
      description: `Bạn sắp xóa ${selectedClasses.length} lớp: ${previewText}${moreText}. Hệ thống chỉ xóa lớp không còn học sinh và bài học; lớp đang có dữ liệu sẽ được giữ lại kèm lý do để tránh mất dữ liệu.`,
      confirmLabel: 'Xóa lớp trống',
      cancelLabel: 'Hủy',
      variant: 'danger',
      requiredText: 'XOA',
      requiredTextLabel: 'Nhập XOA để xác nhận xóa lớp',
      onConfirm: async () => {
        if (!user) return;
        const ids = selectedClasses.map((item) => item.lop_id);
        setIsSubmitting(true);
        const res = await batchDeleteClassesApi(user.token, ids, 'XOA');
        setIsSubmitting(false);
        if (!res.ok) {
          if (!handleSessionError(res.message)) showToast(res.message || 'Không xóa được lớp đã chọn.', 'error');
          return;
        }
        setConfirmDialog(DEFAULT_CONFIRM);
        const deletedIds = new Set((res.data?.deleted || []).map((item) => item.lop_id));
        setSelectedClassIds((current) => current.filter((id) => !deletedIds.has(id)));
        setClasses((current) => current.filter((item) => !deletedIds.has(item.lop_id)));
        const deletedCount = res.data?.deleted_count || 0;
        const failedCount = res.data?.failed_count || 0;
        const deletedStudents = res.data?.deleted_students || 0;
        showToast(failedCount > 0 ? `Đã xóa ${deletedCount} lớp và ${deletedStudents} học sinh; ${failedCount} lớp không xóa được.` : `Đã xóa ${deletedCount} lớp và ${deletedStudents} học sinh thuộc lớp.`, failedCount > 0 ? 'info' : 'success');
      },
    });
  };

  const handleClassSubmit = async (payload: Record<string, unknown>) => {
    if (!user) return;
    setIsSubmitting(true);
    const action = payload.lop_id ? updateClassApi : createClassApi;
    const res = await action(user.token, payload);
    setIsSubmitting(false);
    if (!res.ok) {
      if (!handleSessionError(res.message)) showToast(res.message, 'error');
      return;
    }
    setIsClassModalOpen(false);
    setEditingClass(null);
    if (res.data) mergeClassesIntoState([res.data]);
    showToast(payload.lop_id ? 'Đã cập nhật lớp học' : 'Đã tạo lớp học mới', 'success');
  };

  const askDeleteClass = (item: CatalogClass) => {
    const studentCount = accounts.filter((account) => account.vai_tro === 'student' && account.lop_id === item.lop_id).length;
    setConfirmDialog({
      isOpen: true,
      title: 'Xóa lớp học',
      description: `Bạn sắp xóa lớp “${item.ten_lop || item.lop_id}”. Lớp hiện có ${studentCount} học sinh. Hệ thống chỉ xóa khi lớp không còn học sinh và bài học; nếu còn dữ liệu, lớp sẽ được giữ lại để tránh mất dữ liệu.`,
      confirmLabel: 'Xóa lớp trống',
      cancelLabel: 'Hủy',
      variant: 'danger',
      requiredText: 'XOA',
      requiredTextLabel: 'Nhập XOA để xác nhận xóa lớp',
      onConfirm: async () => {
        if (!user) return;
        setIsSubmitting(true);
        const res = await batchDeleteClassesApi(user.token, [item.lop_id], 'XOA');
        setIsSubmitting(false);
        if (!res.ok) {
          if (!handleSessionError(res.message)) showToast(res.message, 'error');
          return;
        }
        setConfirmDialog(DEFAULT_CONFIRM);
        const deletedIds = new Set((res.data?.deleted || []).map((deletedItem) => deletedItem.lop_id));
        setSelectedClassIds((current) => current.filter((id) => !deletedIds.has(id)));
        setClasses((current) => current.filter((classItem) => !deletedIds.has(classItem.lop_id)));
        const deletedStudents = res.data?.deleted_students || 0;
        const failedReason = res.data?.failed?.[0]?.reason;
        showToast(failedReason || `Đã xóa lớp học và ${deletedStudents} học sinh thuộc lớp.`, failedReason ? 'info' : 'success');
      },
    });
  };

  const askMoveClassStudents = (sourceClass: CatalogClass) => {
    if (!user) return;
    const sameGradeClasses = classes
      .filter((item) => item.lop_id !== sourceClass.lop_id && String(item.khoi || '') === String(sourceClass.khoi || ''))
      .sort((a, b) => String(a.ten_lop || '').localeCompare(String(b.ten_lop || ''), 'vi'));

    if (!sameGradeClasses.length) {
      showToast('Chưa có lớp cùng khối để chuyển học sinh sang.', 'error');
      return;
    }

    const optionsText = sameGradeClasses.map((item) => `${item.lop_id} - ${item.ten_lop}`).join('\n');
    const targetLopId = window.prompt(
      `Nhập mã lớp đích để chuyển toàn bộ học sinh từ lớp “${sourceClass.ten_lop}”.\n\nCác lớp cùng khối có thể chọn:\n${optionsText}`,
      sameGradeClasses[0]?.lop_id || '',
    );
    if (!targetLopId) return;

    const targetClass = sameGradeClasses.find((item) => item.lop_id.toUpperCase() === targetLopId.trim().toUpperCase());
    if (!targetClass) {
      showToast('Mã lớp đích không hợp lệ hoặc không cùng khối.', 'error');
      return;
    }

    setConfirmDialog({
      isOpen: true,
      title: 'Dọn/chuyển lớp sai',
      description: `Chuyển toàn bộ hồ sơ học sinh từ lớp “${sourceClass.ten_lop}” sang lớp “${targetClass.ten_lop}”. Tiến độ và phiên học cùng đã phát sinh được giữ nguyên như snapshot lịch sử; lớp nguồn chỉ bị xóa khi không còn dữ liệu lịch sử ràng buộc. Bạn có chắc muốn thực hiện?`,
      confirmLabel: 'Chuyển học sinh',
      cancelLabel: 'Hủy',
      variant: 'danger',
      onConfirm: async () => {
        if (!user) return;
        setIsSubmitting(true);
        const res = await withLoading('Đang chuyển học sinh sang lớp đúng...', () => moveClassStudentsApi(user.token, sourceClass.lop_id, targetClass.lop_id, true));
        setIsSubmitting(false);
        if (!res.ok) {
          if (!handleSessionError(res.message)) showToast(res.message, 'error');
          return;
        }
        setConfirmDialog(DEFAULT_CONFIRM);
        await syncBaseCatalogAfterMutation();
        await loadAppData();
        showToast(`Đã chuyển ${res.data?.moved_accounts || 0} học sinh sang lớp ${targetClass.ten_lop}.`, 'success');
      },
    });
  };

  const handleSubjectSubmit = async (payload: Record<string, unknown>) => {
    if (!user) return;
    setIsSubmitting(true);
    const action = payload.mon_id ? updateSubjectApi : createSubjectApi;
    const res = await withLoading(payload.mon_id ? 'Đang cập nhật môn học...' : 'Đang tạo môn học...', () => action(user.token, payload));
    setIsSubmitting(false);
    if (!res.ok) {
      if (!handleSessionError(res.message)) showToast(res.message, 'error');
      return;
    }
    setIsSubjectModalOpen(false);
    setEditingSubject(null);
    await syncBaseCatalogAfterMutation();
    await loadAppData();
    showToast(payload.mon_id ? 'Đã cập nhật môn học' : 'Đã tạo môn học mới', 'success');
  };

  const askDeleteSubject = (item: Subject) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Xóa môn học',
      description: `Bạn có chắc muốn xóa môn “${item.ten_mon}”? Hệ thống sẽ chặn nếu môn này vẫn còn bài học đang sử dụng.`,
      confirmLabel: 'Xóa môn học',
      cancelLabel: 'Hủy',
      variant: 'danger',
      onConfirm: async () => {
        if (!user) return;
        setIsSubmitting(true);
        const res = await withLoading('Đang xóa môn học...', () => deleteSubjectApi(user.token, item.mon_id));
        setIsSubmitting(false);
        if (!res.ok) {
          if (!handleSessionError(res.message)) showToast(res.message, 'error');
          return;
        }
        setConfirmDialog(DEFAULT_CONFIRM);
        await syncBaseCatalogAfterMutation();
        await loadAppData();
        showToast('Đã xóa môn học', 'success');
      },
    });
  };

  if (!isAuthReady) return <LoadingOverlay isLoading={true} message="Đang khởi tạo ứng dụng..." />;

  if (!user) {
    return (
      <>
        <Login onLoginSuccess={handleLoginSuccess} setLoading={setIsLoading} showToast={showToast} />
        <LoadingOverlay isLoading={isLoading} message={loadingMessage} />
        <AnimatePresence>{toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}</AnimatePresence>
      </>
    );
  }

  const stats = [
    { label: 'Tổng bài học', value: lessons.length, icon: <BookOpen />, color: 'bg-blue-500' },
    { label: 'Chờ duyệt', value: pendingShares.length, icon: <CheckSquare />, color: 'bg-yellow-500' },
    { label: 'Tài khoản', value: currentUserIsAdmin || user.vai_tro === 'teacher' ? accounts.length : 1, icon: <Users />, color: 'bg-green-500' },
    { label: 'Lớp học', value: classes.length, icon: <GraduationCap />, color: 'bg-purple-500' },
  ];

  const diagnosticSections = (systemDiagnostics?.sections || []).filter((section) => section.issue_count > 0);

  const diagnosticSummaryItems = [
    { label: 'Lỗi cần xử lý', value: systemDiagnostics?.summary.error_count || 0, className: 'bg-rose-50 text-rose-700' },
    { label: 'Cảnh báo dữ liệu', value: systemDiagnostics?.summary.warning_count || 0, className: 'bg-amber-50 text-amber-700' },
    { label: 'Bản ghi đã quét', value: (systemDiagnostics?.summary.scanned_accounts || 0) + (systemDiagnostics?.summary.scanned_classes || 0) + (systemDiagnostics?.summary.scanned_subjects || 0) + (systemDiagnostics?.summary.scanned_lessons || 0) + (systemDiagnostics?.summary.scanned_progress || 0) + (systemDiagnostics?.summary.scanned_shares || 0), className: 'bg-slate-100 text-slate-700' },
  ];

  const renderLessonFilters = (extraAction?: ReactNode, titleOverride?: string, descriptionOverride?: string, statsOverride?: ReactNode) => {
    const isStudentLearning = user.vai_tro === 'student' && activeMenu === 'learning';
    const subjectFilter = {
      key: 'subject',
      label: 'Môn học',
      value: lessonSubjectFilter,
      onChange: setLessonSubjectFilter,
      options: [{ value: 'Tất cả', label: 'Tất cả môn học' }, ...availableSubjects.map((subject) => ({ value: subject, label: subject }))],
    };
    const accessFilter = {
      key: 'access',
      label: 'Quyền học',
      value: lessonAccessFilter,
      onChange: setLessonAccessFilter,
      options: [
        { value: 'Tất cả', label: 'Tất cả bài học' },
        { value: 'unlocked', label: 'Có thể học' },
        { value: 'locked', label: 'Đang khóa' },
      ],
    };
    const toolbarFilters = isStudentLearning
      ? [subjectFilter, accessFilter]
      : [
          subjectFilter,
          {
            key: 'grade',
            label: 'Khối',
            value: lessonGradeFilter,
            onChange: setLessonGradeFilter,
            options: [{ value: 'Tất cả', label: 'Tất cả khối' }, ...(gradeFilterOptions.map((grade) => ({ value: grade, label: `Khối ${grade}` })))],
          },
          {
            key: 'status',
            label: 'Trạng thái',
            value: lessonStatusFilter,
            onChange: setLessonStatusFilter,
            options: [
              { value: 'Tất cả', label: 'Tất cả trạng thái' },
              { value: 'ready_private', label: 'Riêng tư' },
              { value: 'draft', label: 'Bản nháp' },
              { value: 'approved_shared', label: 'Dùng chung' },
              { value: 'pending_review', label: 'Chờ duyệt' },
              { value: 'rejected', label: 'Bị từ chối' },
            ],
          },
          {
            key: 'scope',
            label: 'Phạm vi',
            value: lessonScopeFilter,
            onChange: setLessonScopeFilter,
            options: [
              { value: 'Tất cả', label: 'Tất cả phạm vi' },
              { value: 'private', label: 'Riêng tư' },
              { value: 'shared', label: 'Dùng chung' },
            ],
          },
          {
            key: 'access',
            label: 'Quyền học',
            value: lessonAccessFilter,
            onChange: setLessonAccessFilter,
            options: [
              { value: 'Tất cả', label: 'Tất cả quyền học' },
              { value: 'unlocked', label: 'Đang mở' },
              { value: 'locked', label: 'Đã khóa' },
            ],
          },
        ];

    const defaultStats = (
      <div className="flex flex-wrap gap-1.5 text-[10px] font-bold sm:text-[11px]">
        <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-indigo-700">{activeMenu === 'approvals' ? filteredPendingLessonCards.length : filteredLessons.length} bài phù hợp</span>
        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">{lessons.filter((item) => item.trang_thai === 'approved_shared').length} dùng chung</span>
        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">{activeMenu === 'approvals' ? pendingShares.length : lessons.filter((item) => item.trang_thai === 'pending_review').length} chờ duyệt</span>
        <span className="rounded-full bg-rose-50 px-2.5 py-1 text-rose-700">{lessons.filter((item) => item.is_locked === true).length} đang khóa</span>
      </div>
    );

    return (
      <DataToolbar
        compact
        dense={activeMenu === 'lessons' || activeMenu === 'my_lessons' || activeMenu === 'arena' || isStudentLearning}
        icon={activeMenu === 'arena' ? <Trophy className="h-[18px] w-[18px]" /> : <BookOpenCheck className="h-[18px] w-[18px]" />}
        title={titleOverride || (activeMenu === 'approvals' ? 'Bài giáo viên chờ duyệt' : isStudentLearning ? 'Thư viện bài học của em' : activeMenu === 'learning' ? 'Không gian học tập' : activeMenu === 'arena' ? 'Đấu trường tri thức' : activeMenu === 'my_lessons' ? 'Bài học của tôi' : 'Quản lý bài học')}
        description={descriptionOverride || (
          activeMenu === 'approvals'
            ? 'Admin duyệt học liệu do giáo viên gửi chia sẻ trước khi đưa vào kho dùng chung.'
            : activeMenu === 'my_lessons'
              ? 'Tự tạo, chỉnh sửa và gửi duyệt bài học do bạn biên soạn.'
              : activeMenu === 'arena'
                ? 'Chọn bài học phù hợp rồi bước vào các trò chơi ôn tập theo dạng gameshow.'
                : activeMenu === 'lessons'
                  ? 'Quản lý, chia sẻ và kiểm soát quyền học của các bài học.'
                  : isStudentLearning
                    ? 'Tìm nhanh bài theo môn học và trạng thái, sau đó tiếp tục đúng tiến độ của em.'
                    : 'Tìm kiếm, lọc và mở nhanh bài học theo môn, khối và trạng thái dùng chung.'
        )}
        searchValue={lessonSearch}
        onSearchChange={setLessonSearch}
        searchPlaceholder={activeMenu === 'lessons' || activeMenu === 'my_lessons' ? "Tìm theo tên bài, môn học..." : "Tìm theo tên bài, mô tả, môn học..."}
        filters={toolbarFilters}
        action={extraAction}
        stats={statsOverride !== undefined ? statsOverride : (isStudentLearning ? false : defaultStats)}
      />
    );
  };

  const renderLessonTileActions = (lesson: Lesson) => {
    const canModify = currentUserIsAdmin || (user.vai_tro === 'teacher' && lesson.nguoi_tao_id === user.user_id);
    const canSubmitReview = user.vai_tro === 'teacher' && !currentUserIsAdmin && lesson.nguoi_tao_id === user.user_id && ['ready_private', 'rejected'].includes(lesson.trang_thai);
    const stopTileAction = (event: MouseEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
    };
    const openTileAnalytics = (event: MouseEvent<HTMLElement>) => {
      stopTileAction(event);
      setAnalyticsQuery('');
      setAnalyticsLessonFilter(lesson.lesson_id);
      setAnalyticsGradeFilter(lesson.khoi || 'Tất cả');
      setAnalyticsSubjectFilter('Tất cả');
      setAnalyticsClassFilter(lesson.lop_id || 'Tất cả');
      setAnalyticsSemesterFilter(String(lesson.hoc_ky || 'HK1').toUpperCase() === 'HK2' ? 'HK2' : 'HK1');
      setAnalyticsStatusFilter('Tất cả');
      setActiveMenu('analytics');
    };

    return (
      <div className="lesson-library-action-row">
        <button
          type="button"
          onClick={(event) => { stopTileAction(event); openLesson(lesson); }}
          className="lesson-library-open-button"
        >
          <Eye className="h-3.5 w-3.5" /> Mở
        </button>

        {(canModify || canSubmitReview || currentUserIsAdmin || user.vai_tro === 'teacher') ? (
          <details className="lesson-library-menu relative">
            <summary
              onClick={(event) => event.stopPropagation()}
              className="lesson-library-menu-trigger list-none [&::-webkit-details-marker]:hidden"
              title="Thao tác bài học"
              aria-label="Thao tác bài học"
            >
              <MoreHorizontal className="h-4 w-4" />
            </summary>
            <div className="absolute bottom-full right-0 z-50 mb-2 w-48 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 text-left shadow-[0_18px_40px_rgba(15,23,42,0.16)]">
              {canModify ? (
                <button onClick={(event) => { stopTileAction(event); event.currentTarget.closest('details')?.removeAttribute('open'); void openComposerForEdit(lesson); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50">
                  <Pencil className="h-3.5 w-3.5" /> Sửa bài học
                </button>
              ) : null}
              {(currentUserIsAdmin || user.vai_tro === 'teacher') ? (
                <button onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); openTileAnalytics(event); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50">
                  <Trophy className="h-3.5 w-3.5" /> Theo dõi kết quả
                </button>
              ) : null}
              {canModify ? (
                <button onClick={(event) => { stopTileAction(event); event.currentTarget.closest('details')?.removeAttribute('open'); void handleToggleLessonLock(lesson); }} disabled={Boolean(lessonLockUpdatingId)} className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold disabled:cursor-wait disabled:opacity-60 ${lesson.is_locked ? 'text-emerald-700 hover:bg-emerald-50' : 'text-amber-700 hover:bg-amber-50'}`}>
                  {lessonLockUpdatingId === lesson.lesson_id ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : lesson.is_locked ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                  {lesson.is_locked ? 'Mở khóa bài học' : 'Khóa bài học'}
                </button>
              ) : null}
              {canSubmitReview ? (
                <button onClick={(event) => { stopTileAction(event); event.currentTarget.closest('details')?.removeAttribute('open'); void handleSubmitReview(lesson); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold text-amber-700 hover:bg-amber-50">
                  <UploadCloud className="h-3.5 w-3.5" /> Gửi admin duyệt
                </button>
              ) : null}
              {canModify ? <div className="my-1 border-t border-slate-100" /> : null}
              {canModify ? (
                <button onClick={(event) => { stopTileAction(event); event.currentTarget.closest('details')?.removeAttribute('open'); askDeleteLesson(lesson); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold text-rose-700 hover:bg-rose-50">
                  <Trash2 className="h-3.5 w-3.5" /> Xóa bài học
                </button>
              ) : null}
            </div>
          </details>
        ) : null}
      </div>
    );
  };

  const renderLessonActionBar = (lesson: Lesson, compact = false) => {
    const canModify = currentUserIsAdmin || (user.vai_tro === 'teacher' && lesson.nguoi_tao_id === user.user_id);
    const stopCardAction = (event: MouseEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
    };
    const openLessonAnalytics = (event: MouseEvent<HTMLButtonElement>) => {
      stopCardAction(event);
      setAnalyticsQuery('');
      setAnalyticsLessonFilter(lesson.lesson_id);
      setAnalyticsGradeFilter(lesson.khoi || 'Tất cả');
      setAnalyticsSubjectFilter('Tất cả');
      setAnalyticsClassFilter(lesson.lop_id || 'Tất cả');
      setAnalyticsSemesterFilter(String(lesson.hoc_ky || 'HK1').toUpperCase() === 'HK2' ? 'HK2' : 'HK1');
      setAnalyticsStatusFilter('Tất cả');
      setActiveMenu('analytics');
    };
    if (compact) {
      const canSubmitReview = user.vai_tro === 'teacher' && !currentUserIsAdmin && lesson.nguoi_tao_id === user.user_id && ['ready_private', 'rejected'].includes(lesson.trang_thai);
      return (
        <div className="lesson-action-grid">
          <button
            onClick={(event) => { stopCardAction(event); openLesson(lesson); }}
            className="lesson-action-button bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
            aria-label="Mở bài học"
            title="Mở bài học"
          >
            <Eye className="h-3.5 w-3.5 shrink-0" /><span className="lesson-action-label">Mở</span>
          </button>
          {canModify && (
            <button
              onClick={(event) => { stopCardAction(event); void openComposerForEdit(lesson); }}
              className="lesson-action-button bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
              aria-label="Chỉnh sửa bài học"
              title="Chỉnh sửa bài học"
            >
              <Pencil className="h-3.5 w-3.5 shrink-0" /><span className="lesson-action-label">Sửa</span>
            </button>
          )}
          {(currentUserIsAdmin || user.vai_tro === 'teacher') && (
            <button
              onClick={openLessonAnalytics}
              className="lesson-action-button bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
              aria-label="Theo dõi kết quả học tập"
              title="Theo dõi kết quả học tập"
            >
              <Trophy className="h-3.5 w-3.5 shrink-0" /><span className="lesson-action-label">Theo dõi</span>
            </button>
          )}
          {canModify && (
            <button
              onClick={(event) => { stopCardAction(event); void handleToggleLessonLock(lesson); }}
              disabled={Boolean(lessonLockUpdatingId)}
              className={`lesson-action-button disabled:cursor-wait disabled:opacity-60 ${lesson.is_locked ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'}`}
              aria-label={lesson.is_locked ? 'Mở khóa bài học' : 'Khóa bài học'}
              title={lesson.is_locked ? 'Mở khóa bài học' : 'Khóa bài học'}
            >
              {lessonLockUpdatingId === lesson.lesson_id ? <RefreshCw className="h-3.5 w-3.5 shrink-0 animate-spin" /> : lesson.is_locked ? <Unlock className="h-3.5 w-3.5 shrink-0" /> : <Lock className="h-3.5 w-3.5 shrink-0" />}
              <span className="lesson-action-label">{lesson.is_locked ? 'Mở khóa' : 'Khóa'}</span>
            </button>
          )}
          {(canModify || canSubmitReview) && (
            <details className="lesson-action-menu group/menu relative">
              <summary
                onClick={(event) => {
                  // Không gọi preventDefault ở <summary>: preventDefault sẽ chặn hành vi
                  // native mở/đóng <details>, khiến nút ba chấm trông như không hoạt động.
                  event.stopPropagation();
                }}
                className="lesson-action-menu-trigger cursor-pointer list-none bg-white text-slate-500 ring-1 ring-slate-200 transition hover:bg-slate-100 hover:text-slate-800 [&::-webkit-details-marker]:hidden"
                aria-label="Thao tác khác"
                title="Thao tác khác"
              >
                <MoreHorizontal className="h-4 w-4" />
              </summary>
              <div className="absolute bottom-full right-0 z-40 mb-2 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                {canSubmitReview && (
                  <button onClick={(event) => { stopCardAction(event); event.currentTarget.closest('details')?.removeAttribute('open'); void handleSubmitReview(lesson); }} className="flex w-full items-center rounded-lg px-3 py-2 text-left text-xs font-semibold text-amber-700 transition hover:bg-amber-50">Gửi admin duyệt</button>
                )}
                {canModify && (
                  <button onClick={(event) => { stopCardAction(event); event.currentTarget.closest('details')?.removeAttribute('open'); askDeleteLesson(lesson); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-rose-700 transition hover:bg-rose-50">
                    <Trash2 className="h-3.5 w-3.5" /> Xóa bài học
                  </button>
                )}
              </div>
            </details>
          )}
        </div>
      );
    }

    return (
      <div className="flex flex-wrap gap-2">
        <button onClick={(event) => { stopCardAction(event); openLesson(lesson); }} className="rounded-full bg-white px-3 py-2 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50">
          Xem bài
        </button>
        {canModify && (
          <button onClick={(event) => { stopCardAction(event); void openComposerForEdit(lesson); }} className="rounded-full bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100">
            <span className="inline-flex items-center gap-1"><Pencil className="h-3.5 w-3.5" /> Chỉnh sửa</span>
          </button>
        )}
        {user.vai_tro === 'teacher' && !currentUserIsAdmin && lesson.nguoi_tao_id === user.user_id && ['ready_private', 'rejected'].includes(lesson.trang_thai) && (
          <button onClick={(event) => { stopCardAction(event); void handleSubmitReview(lesson); }} className="rounded-full bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100">
            Gửi admin duyệt
          </button>
        )}
        {(currentUserIsAdmin || user.vai_tro === 'teacher') && (
          <button onClick={openLessonAnalytics} className="rounded-full bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100">
            Theo dõi
          </button>
        )}
        {canModify && (
          <button
            onClick={(event) => { stopCardAction(event); void handleToggleLessonLock(lesson); }}
            disabled={Boolean(lessonLockUpdatingId)}
            className={`rounded-full px-3 py-2 text-xs font-semibold transition disabled:cursor-wait disabled:opacity-60 ${lesson.is_locked ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'}`}
          >
            <span className="inline-flex items-center gap-1">
              {lessonLockUpdatingId === lesson.lesson_id ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : lesson.is_locked ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
              {lesson.is_locked ? 'Mở khóa' : 'Khóa'}
            </span>
          </button>
        )}
        {canModify && (
          <button onClick={(event) => { stopCardAction(event); askDeleteLesson(lesson); }} className="rounded-full bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100">
            <span className="inline-flex items-center gap-1"><Trash2 className="h-3.5 w-3.5" /> Xóa</span>
          </button>
        )}
      </div>
    );
  };

  const renderReviewPracticeSection = () => {
    if (activeMenu === 'approvals' || !visibleReviewPractices.length) return null;
    const reviewTypeLabel: Record<string, string> = {
      chapter: 'Ôn tập chương',
      midterm: 'Ôn tập giữa kỳ',
      final: 'Ôn tập cuối kỳ',
      topic: 'Ôn tập chủ đề',
      custom: 'Ôn tập tùy chọn',
    };
    return (
      <section className="rounded-[32px] bg-white p-5 shadow-sm ring-1 ring-slate-100">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-amber-700"><BookOpenCheck className="h-4 w-4" /> Bài ôn tập</p>
            <h3 className="mt-2 text-xl font-black text-slate-900">Ôn tập tổng hợp từ nhiều bài học</h3>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600">{visibleReviewPractices.length} bài ôn tập phù hợp</span>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleReviewPractices.map((review) => {
            const subjectName = subjects.find((item) => item.mon_id === review.mon_id)?.ten_mon || review.mon_hoc || review.mon_id || 'Môn học';
            const canModifyReview = currentUserIsAdmin || (user.vai_tro === 'teacher' && review.nguoi_tao_id === user.user_id);
            return (
              <div key={review.review_id} className="rounded-[26px] border border-amber-100 bg-gradient-to-br from-amber-50 via-white to-fuchsia-50 p-5 shadow-sm">
                <p className="inline-flex rounded-full bg-white px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-amber-700 ring-1 ring-amber-100">{reviewTypeLabel[String(review.loai_on_tap)] || 'Bài ôn tập'}</p>
                <h4 className="mt-3 line-clamp-2 text-lg font-black text-slate-900">{review.tieu_de}</h4>
                <p className="mt-2 text-sm font-semibold text-slate-500">{subjectName} • Khối {review.khoi} • {review.hoc_ky || 'HK1'} • {review.nam_hoc || '-'}</p>
                <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">Nguồn: {review.source_lesson_titles || review.lesson_ids || 'nhiều bài học'}</p>
                <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold">
                  <span className="rounded-full bg-white px-3 py-1.5 text-amber-700 ring-1 ring-amber-100">{Number(review.so_cau || 0)} câu</span>
                  <span className="rounded-full bg-white px-3 py-1.5 text-indigo-700 ring-1 ring-indigo-100">{Number(review.thoi_gian || 0) ? `${review.thoi_gian} phút` : 'Không giới hạn'}</span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2 border-t border-amber-100 pt-4">
                  <button onClick={() => void openReviewPractice(review)} className="rounded-full bg-amber-600 px-3 py-2 text-xs font-black text-white shadow-lg shadow-amber-200 hover:bg-amber-700">Làm bài</button>
                  {(currentUserIsAdmin || user.vai_tro === 'teacher') ? <button onClick={() => void openReviewPracticeResults(review)} className="rounded-full bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100">Kết quả</button> : null}
                  {canModifyReview ? <button onClick={() => askDeleteReviewPractice(review)} className="rounded-full bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100">Xóa</button> : null}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    );
  };

  const renderLessonGrid = (title: string, description: string, items: Lesson[], extraAction?: ReactNode) => {
    const supportsLibraryView = activeMenu === 'lessons' || activeMenu === 'my_lessons';
    const libraryPageSize = 8;
    const libraryPageCount = Math.max(1, Math.ceil(items.length / libraryPageSize));
    const safeLibraryPage = Math.min(Math.max(1, lessonLibraryPage), libraryPageCount);
    const libraryPageItems = items.slice((safeLibraryPage - 1) * libraryPageSize, safeLibraryPage * libraryPageSize);
    const toolbarAction = supportsLibraryView ? (
      <div className="flex flex-wrap items-center justify-end gap-2.5">
        <div className="inline-flex rounded-xl bg-slate-100 p-1 ring-1 ring-slate-200" aria-label="Chế độ hiển thị bài học">
          <button
            type="button"
            onClick={() => setLessonLibraryView('grid')}
            className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-bold transition ${lessonLibraryView === 'grid' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
            title="Xem dạng thư viện 4 cột"
          >
            <LayoutGrid className="h-3.5 w-3.5" /><span className="hidden 2xl:inline">Thư viện</span>
          </button>
          <button
            type="button"
            onClick={() => setLessonLibraryView('list')}
            className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-bold transition ${lessonLibraryView === 'list' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
            title="Xem dạng danh sách"
          >
            <List className="h-3.5 w-3.5" /><span className="hidden 2xl:inline">Danh sách</span>
          </button>
        </div>
        {extraAction}
      </div>
    ) : extraAction;

    return (
      <div className="space-y-4">
        {renderLessonFilters(toolbarAction, title, description)}

        {renderReviewPracticeSection()}

        {items.length > 0 ? (
          supportsLibraryView && lessonLibraryView === 'grid' ? (
            <div className="space-y-5">
              <div className="lesson-library-grid">
                {libraryPageItems.map((lesson, index) => (
                  <LessonCard
                    key={lesson.lesson_id}
                    lesson={lesson}
                    onClick={() => openLesson(lesson)}
                    variant="library"
                    highlight={index === 0 && activeMenu === 'learning'}
                    actions={renderLessonTileActions(lesson)}
                  />
                ))}
              </div>
              {libraryPageCount > 1 ? (
                <nav className="lesson-library-pagination" aria-label="Phân trang bài học">
                  <button type="button" onClick={() => setLessonLibraryPage(Math.max(1, safeLibraryPage - 1))} disabled={safeLibraryPage === 1} className="lesson-library-page-button lesson-library-page-arrow" aria-label="Trang trước">‹</button>
                  {Array.from({ length: libraryPageCount }, (_, pageIndex) => pageIndex + 1).map((page) => (
                    <button
                      key={page}
                      type="button"
                      onClick={() => setLessonLibraryPage(page)}
                      className={`lesson-library-page-button ${page === safeLibraryPage ? 'is-active' : ''}`}
                      aria-current={page === safeLibraryPage ? 'page' : undefined}
                    >
                      {page}
                    </button>
                  ))}
                  <button type="button" onClick={() => setLessonLibraryPage(Math.min(libraryPageCount, safeLibraryPage + 1))} disabled={safeLibraryPage === libraryPageCount} className="lesson-library-page-button lesson-library-page-arrow" aria-label="Trang sau">›</button>
                </nav>
              ) : null}
            </div>
          ) : (
            <div className="lesson-management-grid">
              {items.map((lesson, index) => (
                <LessonCard key={lesson.lesson_id} lesson={lesson} onClick={() => openLesson(lesson)} variant="compact" highlight={index === 0 && activeMenu === 'learning'} actions={renderLessonActionBar(lesson, true)} progress={user?.vai_tro === 'student' ? currentStudentProgressByLesson[lesson.lesson_id] || null : null} />
              ))}
            </div>
          )
        ) : (
          <div className="flex flex-col items-center justify-center rounded-[28px] bg-white py-20 text-center shadow-sm ring-1 ring-slate-100">
            <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <BookOpen className="h-10 w-10" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">Không tìm thấy bài học nào</h3>
            <p className="text-slate-500">Hãy thử thay đổi bộ lọc hoặc tạo bài học mới.</p>
          </div>
        )}
      </div>
    );
  };

  const renderLearningHub = () => {
    const isStudent = user.vai_tro === 'student';
    const lessonOptions = lessonSourcePool.map((lesson) => ({ value: lesson.lesson_id, label: lesson.tieu_de }));
    const studentProgressItems = isStudent
      ? visibleLessonsForCurrentUser
          .map((lesson) => currentStudentProgressByLesson[lesson.lesson_id])
          .filter((item): item is LessonProgressRecord => Boolean(item))
      : [];
    const validStudentScores = studentProgressItems
      .filter((item) => item.result_state !== 'invalid_cheating' && item.result_state !== 'cancelled_retake')
      .map((item) => item.assessment_score)
      .filter((score): score is number => score !== undefined && Number.isFinite(Number(score)));
    const studentAverageScore = validStudentScores.length
      ? validStudentScores.reduce((sum, score) => sum + Number(score), 0) / validStudentScores.length
      : undefined;
    const availableStudentLessons = isStudent ? visibleLessonsForCurrentUser.filter((lesson) => lesson.is_locked !== true) : [];
    const inProgressStudentCount = studentProgressItems.filter((item) => item.status === 'in_progress').length;
    const completedStudentCount = studentProgressItems.filter((item) => item.status === 'completed').length;
    const primaryLesson = isStudent
      ? featuredLearningLessons.find((lesson) => lesson.is_locked !== true && currentStudentProgressByLesson[lesson.lesson_id]?.status === 'in_progress')
        || featuredLearningLessons.find((lesson) => lesson.is_locked !== true)
        || featuredLearningLessons[0]
      : featuredLearningLessons[0];

    if (isStudent) {
      return (
        <div className="space-y-4">
          <section className="overflow-hidden rounded-[26px] bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 px-5 py-5 text-white shadow-[0_16px_38px_rgba(79,70,229,0.22)] sm:px-6">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-[11px] font-bold">
                    <Sparkles className="h-3.5 w-3.5" /> Học theo 4 chặng • AI đồng hành
                  </span>
                  <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-white/85">Khối {user.khoi || '-'}</span>
                  {user.lop_id ? <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-white/85">{user.lop_id}</span> : null}
                </div>
                <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-[30px]">Bài học của em</h1>
                <p className="mt-1.5 max-w-3xl text-sm leading-6 text-white/85">
                  Chọn bài, tiếp tục đúng tiến độ và xem kết quả ngay trên từng bài học.
                </p>
              </div>

              {primaryLesson ? (
                <div className="min-w-0 rounded-[20px] bg-white/12 p-3.5 ring-1 ring-white/15 backdrop-blur-sm xl:w-[360px]">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/70">
                    {currentStudentProgressByLesson[primaryLesson.lesson_id]?.status === 'in_progress' ? 'Tiếp tục đang học' : 'Bài học đề xuất'}
                  </p>
                  <p className="mt-1 truncate text-sm font-black text-white">{primaryLesson.tieu_de}</p>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <span className="truncate text-xs font-semibold text-white/75">{primaryLesson.mon_hoc} • Khối {primaryLesson.khoi}</span>
                    <button
                      type="button"
                      onClick={() => primaryLesson.is_locked !== true && void openLesson(primaryLesson)}
                      disabled={primaryLesson.is_locked === true}
                      className="shrink-0 rounded-xl bg-white px-3.5 py-2 text-xs font-black text-indigo-700 shadow-sm transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-white/65"
                    >
                      {primaryLesson.is_locked === true ? 'Đang khóa' : currentStudentProgressByLesson[primaryLesson.lesson_id]?.status === 'in_progress' ? 'Tiếp tục học' : 'Mở bài'}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
              {[
                { label: 'Có thể học', value: availableStudentLessons.length },
                { label: 'Đang học', value: inProgressStudentCount },
                { label: 'Hoàn thành', value: completedStudentCount },
                { label: 'Điểm trung bình', value: studentAverageScore === undefined ? '-' : studentAverageScore.toFixed(1).replace('.0', '') },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl bg-white/10 px-3.5 py-3 ring-1 ring-white/10">
                  <p className="text-[10px] font-black uppercase tracking-[0.12em] text-white/65">{item.label}</p>
                  <p className="mt-1 text-xl font-black text-white">{item.value}</p>
                </div>
              ))}
            </div>
          </section>

          {renderLessonFilters(
            undefined,
            'Thư viện bài học của em',
            'Tìm nhanh theo môn học hoặc trạng thái. Các bài bị khóa vẫn hiển thị để em biết lịch học.',
            false,
          )}

          {renderReviewPracticeSection()}

          {filteredLessons.length > 0 ? (
            <div className="student-learning-grid">
              {filteredLessons.map((lesson, index) => (
                <LessonCard
                  key={lesson.lesson_id}
                  lesson={lesson}
                  onClick={() => openLesson(lesson)}
                  variant="student"
                  highlight={index === 0 && lesson.is_locked !== true}
                  progress={currentStudentProgressByLesson[lesson.lesson_id] || null}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-[24px] bg-white py-14 text-center shadow-sm ring-1 ring-slate-100">
              <BookOpen className="mx-auto h-10 w-10 text-slate-300" />
              <h3 className="mt-4 text-lg font-bold text-slate-900">Chưa có bài học phù hợp</h3>
              <p className="mt-1 text-sm text-slate-500">Hãy thử thay đổi từ khóa, môn học hoặc trạng thái bài.</p>
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <div className="overflow-hidden rounded-[32px] bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 p-7 text-white shadow-[0_22px_55px_rgba(79,70,229,0.28)] lg:p-8">
          <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
            <div>
              <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">
                <Sparkles className="h-4 w-4" />
                Theo dõi kết quả học tập • nắm bắt tiến độ toàn lớp
              </p>
              <h1 className="text-3xl font-bold lg:text-4xl">Theo dõi học sinh theo bài và theo tiến độ</h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-white/90">
                Xem học sinh đã học đến đâu, đã hoàn thành bao nhiêu bước và kết quả luyện tập ở từng bài để kịp thời hỗ trợ.
              </p>
              {primaryLesson && (
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <button onClick={() => void openLesson(primaryLesson)} className="rounded-2xl bg-white px-5 py-3 text-sm font-bold text-indigo-700 shadow-lg shadow-indigo-950/10">
                    Xem bài “{primaryLesson.tieu_de}”
                  </button>
                  <span className="text-sm text-white/85">{primaryLesson.mon_hoc} • Khối {primaryLesson.khoi}</span>
                </div>
              )}
            </div>
            <div className="grid gap-3 rounded-[28px] bg-white/12 p-5 backdrop-blur-md">
              {[
                { label: 'Tỉ lệ hoàn thành', text: 'Xem từng bài đã học đến đâu' },
                { label: 'Bước học gần nhất', text: 'Biết học sinh đang dừng ở bước nào' },
                { label: 'Luyện tập', text: 'Theo dõi số câu đúng và % đạt' },
                { label: 'Hỗ trợ kịp thời', text: 'Phát hiện học sinh đang học dở' },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl bg-white/10 px-4 py-3">
                  <p className="text-sm font-semibold">{item.label}</p>
                  <p className="text-xs text-white/80">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <LearningAnalyticsPanel
          rows={analyticsRows}
          schoolYears={schoolYears}
          availableGrades={gradeFilterOptions}
          onRefresh={loadAppData}
          filters={{
            query: analyticsQuery,
            onQueryChange: setAnalyticsQuery,
            grade: analyticsGradeFilter,
            onGradeChange: setAnalyticsGradeFilter,
            lessonId: analyticsLessonFilter,
            onLessonIdChange: setAnalyticsLessonFilter,
            status: analyticsStatusFilter,
            onStatusChange: setAnalyticsStatusFilter,
            semester: analyticsSemesterFilter,
            onSemesterChange: setAnalyticsSemesterFilter,
            classId: analyticsClassFilter,
            onClassIdChange: setAnalyticsClassFilter,
            subjectId: analyticsSubjectFilter,
            onSubjectIdChange: setAnalyticsSubjectFilter,
            schoolYear: analyticsSchoolYearFilter,
            onSchoolYearChange: setAnalyticsSchoolYearFilter,
            availableLessons: lessonOptions,
          }}
          students={accounts.filter((item) => item.vai_tro === 'student')}
          lessons={lessonSourcePool}
          classes={classes}
          subjects={subjects}
          comments={lessonComments}
          isCommentsLoading={isLessonCommentsLoading}
          onAddComment={handleAddLessonAnalyticsComment}
          onUpdateComment={handleUpdateLessonAnalyticsComment}
          onModerateResult={handleModerateLearningResult}
        />

        {renderLessonFilters(
          <div className="flex flex-wrap gap-3">
            <button onClick={openReviewPracticeCreator} className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-3.5 py-2.5 text-xs font-bold text-white shadow-md shadow-amber-600/15"><BookOpenCheck className="h-4 w-4" /> Tạo bài ôn tập</button>
            <button onClick={openComposerForCreate} className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20">
              <Plus className="h-4 w-4" /> Tạo bài học mới
            </button>
          </div>,
        )}

        {renderReviewPracticeSection()}

        {filteredLessons.length > 0 ? (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {filteredLessons.map((lesson, index) => (
              <LessonCard key={lesson.lesson_id} lesson={lesson} onClick={() => openLesson(lesson)} highlight={index === 0} actions={renderLessonActionBar(lesson)} />
            ))}
          </div>
        ) : (
          <div className="rounded-[28px] bg-white py-20 text-center shadow-sm ring-1 ring-slate-100">
            <BookOpen className="mx-auto h-10 w-10 text-slate-300" />
            <h3 className="mt-4 text-lg font-bold text-slate-900">Chưa có bài học phù hợp</h3>
            <p className="text-slate-500">Hãy đổi bộ lọc hoặc tạo bài học mới để bắt đầu.</p>
          </div>
        )}
      </div>
    );
  };

  const renderAnalyticsHub = () => (
    <LearningAnalyticsPanel
      rows={analyticsRows}
      schoolYears={schoolYears}
      availableGrades={gradeFilterOptions}
      onRefresh={loadAppData}
      filters={{
        query: analyticsQuery,
        onQueryChange: setAnalyticsQuery,
        grade: analyticsGradeFilter,
        onGradeChange: setAnalyticsGradeFilter,
        lessonId: analyticsLessonFilter,
        onLessonIdChange: setAnalyticsLessonFilter,
        status: analyticsStatusFilter,
        onStatusChange: setAnalyticsStatusFilter,
        availableLessons: lessonSourcePool.map((lesson) => ({ value: lesson.lesson_id, label: lesson.tieu_de })),
        semester: analyticsSemesterFilter,
        onSemesterChange: setAnalyticsSemesterFilter,
        classId: analyticsClassFilter,
        onClassIdChange: setAnalyticsClassFilter,
        subjectId: analyticsSubjectFilter,
        onSubjectIdChange: setAnalyticsSubjectFilter,
        schoolYear: analyticsSchoolYearFilter,
        onSchoolYearChange: setAnalyticsSchoolYearFilter,
      }}
      students={accounts.filter((item) => item.vai_tro === 'student')}
      lessons={lessonSourcePool}
      classes={classes}
      subjects={subjects}
      comments={lessonComments}
      isCommentsLoading={isLessonCommentsLoading}
      onAddComment={handleAddLessonAnalyticsComment}
      onUpdateComment={handleUpdateLessonAnalyticsComment}
      onModerateResult={handleModerateLearningResult}
    />
  );


  const renderSchoolYearManagement = () => (
    <SchoolYearConfigPanel
      items={schoolYears}
      isSubmitting={isSubmitting}
      onCreate={handleCreateSchoolYear}
      onUpdate={handleUpdateSchoolYear}
      onSetCurrent={handleSetCurrentSchoolYear}
    />
  );

  const renderArenaHub = () => {
    const canManageArena = currentUserIsAdmin || user?.vai_tro === 'teacher';
    const arenaReadyCount = filteredLessons.filter((lesson) => lesson.arena_ready === true || Number(lesson.arena_question_count || 0) > 0).length;
    const arenaLockedCount = filteredLessons.filter((lesson) => lesson.is_locked === true).length;
    const arenaOpenCount = Math.max(0, filteredLessons.length - arenaLockedCount);
    const arenaNotReadyCount = filteredLessons.filter((lesson) => {
      const count = Number(lesson.arena_question_count);
      const known = lesson.arena_ready !== undefined || Number.isFinite(count);
      return known && !(lesson.arena_ready === true || count > 0);
    }).length;
    const arenaStats = (
      <div className="flex flex-wrap gap-1.5 text-[10px] font-bold sm:text-[11px]">
        <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-indigo-700">{filteredLessons.length} bài phù hợp</span>
        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">{arenaOpenCount} đang mở</span>
        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">{arenaLockedCount} đang khóa</span>
        <span className="rounded-full bg-fuchsia-50 px-2.5 py-1 text-fuchsia-700">{arenaReadyCount} sẵn sàng</span>
        {canManageArena ? <span className="rounded-full bg-rose-50 px-2.5 py-1 text-rose-700">{arenaNotReadyCount} thiếu câu hỏi</span> : null}
      </div>
    );

    return (
      <div className="space-y-4">
        {!arenaLesson
          ? renderLessonFilters(
              canManageArena ? (
                <div className="inline-flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700 ring-1 ring-amber-100">
                  <Lock className="h-3.5 w-3.5" /> Khóa/Mở đồng bộ với Bài học
                </div>
              ) : null,
              canManageArena ? 'Quản lý Đấu trường tri thức' : 'Đấu trường tri thức',
              canManageArena
                ? 'Quản lý bài thi đấu, trạng thái khóa và mức sẵn sàng ngay trên một thanh điều khiển gọn.'
                : 'Chọn bài học phù hợp rồi bắt đầu một trong ba trò chơi ôn luyện.',
              arenaStats,
            )
          : null}
        <KnowledgeArena
          lessons={filteredLessons}
          selectedLesson={arenaLesson}
          selectedContent={arenaLessonContent}
          analyticsRows={analyticsRows}
          students={accounts.filter((item) => item.vai_tro === 'student')}
          canViewStats={canManageArena}
          canManageLesson={(lesson) => Boolean(currentUserIsAdmin || (user?.vai_tro === 'teacher' && lesson.nguoi_tao_id === user.user_id))}
          lockUpdatingId={lessonLockUpdatingId}
          onToggleLessonLock={(lesson) => void handleToggleLessonLock(lesson)}
          onEditLesson={(lesson) => void openComposerForEdit(lesson)}
          onSelectLesson={(lesson) => void handleArenaSelectLesson(lesson)}
          onClearSelection={() => {
            setArenaLesson(null);
            setArenaLessonContent(null);
          }}
        />
      </div>
    );
  };

  const renderApprovals = () => (
    <div className="space-y-6">
      {renderLessonFilters()}
      {filteredPendingLessonCards.length > 0 ? (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          {filteredPendingLessonCards.map(({ share, lesson }) => (
            <div key={share.share_id} className="rounded-[28px] bg-white p-5 shadow-sm ring-1 ring-slate-100">
              {lesson && <LessonCard lesson={lesson} onClick={() => openLesson(lesson)} />}
              <div className="mt-4 flex flex-wrap gap-3 border-t border-slate-100 pt-4">
                <button onClick={() => void handleReviewShare(share.lesson_id, true)} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white">
                  <UploadCloud className="h-4 w-4" /> Duyệt bài giáo viên
                </button>
                <button onClick={() => void handleReviewShare(share.lesson_id, false)} className="inline-flex items-center gap-2 rounded-2xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white">
                  <XCircle className="h-4 w-4" /> Từ chối
                </button>
                <button onClick={() => lesson && openLesson(lesson)} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">
                  <Eye className="h-4 w-4" /> Xem trước
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-[28px] bg-white py-20 text-center shadow-sm ring-1 ring-slate-100">
          <CheckSquare className="mx-auto h-10 w-10 text-slate-300" />
          <h3 className="mt-4 text-lg font-bold text-slate-900">Chưa có bài học nào cần duyệt</h3>
          <p className="text-slate-500">Khi giáo viên gửi bài học chia sẻ, chúng sẽ xuất hiện tại đây.</p>
        </div>
      )}
    </div>
  );

  const renderTableShell = (children: ReactNode) => (
    <div className="overflow-hidden rounded-[28px] bg-white shadow-sm ring-1 ring-slate-100">
      <div className="overflow-x-auto">{children}</div>
    </div>
  );

  const renderAccountsManagement = () => (
    <div className="space-y-6">
      <DataToolbar
        title="Quản lý tài khoản"
        description="Quản lý riêng học sinh, giáo viên và quản trị viên; hỗ trợ tạo tài khoản trực tiếp từ danh sách học sinh vnEdu."
        searchValue={accountQuery}
        onSearchChange={setAccountQuery}
        searchPlaceholder="Tìm mã học sinh, họ tên, SĐT..."
        filters={[
          {
            key: 'grade',
            label: 'Khối',
            value: accountGradeFilter,
            onChange: setAccountGradeFilter,
            options: [{ value: 'Tất cả', label: 'Tất cả khối' }, ...(gradeFilterOptions.map((grade) => ({ value: grade, label: `Khối ${grade}` })))],
          },
          {
            key: 'class',
            label: 'Lớp',
            value: accountClassFilter,
            onChange: setAccountClassFilter,
            options: [{ value: 'Tất cả', label: 'Tất cả lớp' }, ...accountClassFilterOptions],
          },
          {
            key: 'status',
            label: 'Trạng thái',
            value: accountStatusFilter,
            onChange: setAccountStatusFilter,
            options: [
              { value: 'Tất cả', label: 'Tất cả trạng thái' },
              { value: 'active', label: 'Hoạt động' },
              { value: 'inactive', label: 'Tạm khóa' },
            ],
          },
        ]}
        action={
          <div className="flex flex-wrap gap-3">
            <button onClick={() => downloadTemplate('account')} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50">
              <Download className="h-4 w-4" /> Tải file mẫu
            </button>
            <button onClick={() => openImportModal('account')} className="inline-flex items-center gap-2 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-semibold text-indigo-700 shadow-sm hover:bg-indigo-100">
              <UploadCloud className="h-4 w-4" /> Nhập học sinh vnEdu
            </button>
            {currentUserIsAdmin && (
              <button onClick={() => setIsSchoolYearTransferOpen(true)} className="inline-flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 shadow-sm hover:bg-emerald-100">
                <GraduationCap className="h-4 w-4" /> Kết chuyển năm học
              </button>
            )}
            <button onClick={() => { setEditingAccount(null); setIsAccountModalOpen(true); }} className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20">
              <Plus className="h-4 w-4" /> Thêm tài khoản
            </button>
          </div>
        }
        stats={
          <div className="flex flex-wrap gap-3 text-xs font-semibold">
            <span className="rounded-full bg-indigo-50 px-3 py-1.5 text-indigo-700">{filteredAccounts.length} tài khoản hiển thị</span>
            <span className="rounded-full bg-amber-50 px-3 py-1.5 text-amber-700">{accounts.filter((item) => item.vai_tro === 'student' && !item.lan_dang_nhap_cuoi).length} chưa đăng nhập</span>
            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-700">{classes.length} lớp</span>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { value: 'Tất cả', label: 'Tất cả tài khoản', description: 'Toàn bộ người dùng trong hệ thống', count: accounts.length, icon: LayoutDashboard, activeClass: 'border-indigo-300 bg-indigo-50 text-indigo-700', iconClass: 'bg-indigo-100 text-indigo-700' },
          { value: 'student', label: 'Học sinh', description: 'Theo dõi theo khối và lớp học', count: accounts.filter((item) => item.vai_tro === 'student').length, icon: GraduationCap, activeClass: 'border-emerald-300 bg-emerald-50 text-emerald-700', iconClass: 'bg-emerald-100 text-emerald-700' },
          { value: 'teacher', label: 'Giáo viên', description: 'Giảng dạy và quyền quản trị mở rộng', count: accounts.filter((item) => item.vai_tro === 'teacher').length, icon: Users, activeClass: 'border-sky-300 bg-sky-50 text-sky-700', iconClass: 'bg-sky-100 text-sky-700' },
          { value: 'admin', label: 'Quản trị viên', description: 'Tài khoản quản trị hệ thống', count: accounts.filter((item) => item.vai_tro === 'admin').length, icon: UserCog, activeClass: 'border-violet-300 bg-violet-50 text-violet-700', iconClass: 'bg-violet-100 text-violet-700' },
        ].map((item) => {
          const RoleIcon = item.icon;
          const active = accountRoleFilter === item.value;
          return (
            <button key={item.value} type="button" onClick={() => { setAccountRoleFilter(item.value); setAccountGradeFilter('Tất cả'); setAccountClassFilter('Tất cả'); setSelectedAccountIds([]); }} className={`flex items-center gap-4 rounded-[24px] border bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${active ? item.activeClass : 'border-slate-100 text-slate-700'}`}>
              <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${item.iconClass}`}><RoleIcon className="h-6 w-6" /></span>
              <span className="min-w-0 flex-1"><span className="block text-sm font-bold">{item.label}</span><span className="mt-1 block truncate text-xs opacity-70">{item.description}</span></span>
              <span className="text-2xl font-black">{item.count}</span>
            </button>
          );
        })}
      </div>

      {currentUserIsAdmin && selectedAccountIds.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-rose-100 bg-rose-50 px-5 py-4 text-sm shadow-sm">
          <div>
            <div className="font-bold text-rose-700">Đã chọn {selectedAccountIds.length} tài khoản</div>
            <div className="text-xs text-rose-600">Học sinh được reset về mã học sinh; giáo viên/quản trị dùng mật khẩu mặc định hệ thống. Tài khoản không đủ điều kiện sẽ được giữ lại và báo rõ lý do.</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setSelectedAccountIds([])} className="rounded-2xl border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100">Bỏ chọn</button>
            <button onClick={askResetSelectedPasswords} className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-700">
              <Settings className="h-4 w-4" /> Reset mật khẩu mặc định
            </button>
            <button onClick={askDeleteSelectedAccounts} className="inline-flex items-center gap-2 rounded-2xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-rose-600/20 hover:bg-rose-700">
              <Trash2 className="h-4 w-4" /> Xóa tài khoản đã chọn
            </button>
          </div>
        </div>
      )}

      {filteredAccounts.length > 0 ? renderTableShell(
        <>
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50/80 text-left text-slate-500">
            <tr>
              <th className="w-12 px-5 py-4">
                {currentUserIsAdmin && (
                  <input
                    type="checkbox"
                    checked={allVisibleAccountsSelected}
                    onChange={toggleSelectVisibleAccounts}
                    disabled={selectableFilteredAccounts.length === 0}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    title="Chọn/bỏ chọn các tài khoản đang hiển thị"
                  />
                )}
              </th>
              {['Mã học sinh', 'Họ tên', 'Vai trò', 'Khối/Lớp', 'SĐT', 'Truy cập', 'Trạng thái', 'Thao tác'].map((column) => (
                <th key={column} className="px-5 py-4 font-semibold">{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pagedAccounts.map((item) => {
              const canSelectAccount = currentUserIsAdmin && item.user_id !== user.user_id;
              return (
              <tr key={item.user_id} className={`border-t border-slate-100 text-slate-700 ${item.vai_tro === 'student' ? 'border-l-4 border-l-emerald-400' : item.vai_tro === 'teacher' ? 'border-l-4 border-l-sky-400' : 'border-l-4 border-l-violet-400'} ${selectedAccountIdSet.has(item.user_id) ? 'bg-indigo-50/30' : ''}`}>
                <td className="px-5 py-4">
                  {currentUserIsAdmin && (
                    <input
                      type="checkbox"
                      checked={selectedAccountIdSet.has(item.user_id)}
                      onChange={() => toggleSelectAccount(item)}
                      disabled={!canSelectAccount}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
                      title={canSelectAccount ? 'Chọn tài khoản này' : 'Không thể chọn tài khoản đang đăng nhập'}
                    />
                  )}
                </td>
                <td className="px-5 py-4 font-semibold text-slate-900">
                  <div>{item.ma_hoc_sinh || item.ten_dang_nhap || item.user_id}</div>
                </td>
                <td className="px-5 py-4">
                  <div className="font-semibold text-slate-900">{item.ho_ten}</div>
                  <div className="text-xs text-slate-500">{item.vai_tro === 'student' ? [item.ngay_sinh ? `Ngày sinh: ${item.ngay_sinh}` : '', item.gioi_tinh || ''].filter(Boolean).join(' • ') || 'Chưa có thông tin hồ sơ' : `Cập nhật: ${item.updated_at || '-'}`}</div>
                </td>
                <td className="px-5 py-4">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${hasAdminPermission(item) ? 'bg-violet-50 text-violet-700' : item.vai_tro === 'teacher' ? 'bg-sky-50 text-sky-700' : 'bg-emerald-50 text-emerald-700'}`}>
                    {getRoleLabel(item)}
                  </span>
                </td>
                <td className="px-5 py-4 text-sm text-slate-600">{item.vai_tro === 'student' ? (item.ten_lop_hien_thi || `${item.khoi ? `Khối ${item.khoi}` : ''}${item.lop_id ? ` • Lớp ${classLabelById.get(item.lop_id) || item.lop_id}` : ''}`) : item.vai_tro === 'teacher' ? (item.khoi ? `Khối ${item.khoi}` : 'Theo dõi nhiều khối') : '-'}</td>
                <td className="px-5 py-4 text-sm text-slate-600">{item.so_dien_thoai || '-'}</td>
                <td className="px-5 py-4 text-sm text-slate-600">
                  {item.provisioning_status === 'pending' ? (
                    <><div className="font-semibold text-amber-600">Chưa kích hoạt</div><div className="text-xs text-slate-400">Tự kích hoạt khi đăng nhập lần đầu</div></>
                  ) : (
                    <><div>{Number(item.so_luot_dang_nhap || 0)} lượt</div><div className="text-xs text-slate-400">{item.lan_dang_nhap_cuoi || 'Chưa đăng nhập'}</div></>
                  )}
                </td>
                <td className="px-5 py-4">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${item.trang_thai === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                    {getFriendlyState(item.trang_thai)}
                  </span>
                </td>
                <td className="px-5 py-4">
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => { setEditingAccount(item); setIsAccountModalOpen(true); }} className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100">
                      <Pencil className="h-3.5 w-3.5" /> Sửa
                    </button>
                    {currentUserIsAdmin && item.user_id !== user.user_id && (
                      <button onClick={() => askDeleteAccount(item)} className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100">
                        <Trash2 className="h-3.5 w-3.5" /> Xóa
                      </button>
                    )}
                  </div>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-white px-5 py-4 text-sm text-slate-600">
          <span>
            Hiển thị <strong>{(accountPage - 1) * accountPageSize + 1}-{Math.min(accountPage * accountPageSize, filteredAccounts.length)}</strong> / {filteredAccounts.length} tài khoản
          </span>
          <div className="flex items-center gap-2">
            <button type="button" disabled={accountPage <= 1} onClick={() => setAccountPage((page) => Math.max(1, page - 1))} className="rounded-xl border border-slate-200 px-3 py-2 font-semibold disabled:cursor-not-allowed disabled:opacity-40">Trang trước</button>
            <span className="rounded-xl bg-slate-100 px-3 py-2 font-semibold">{accountPage}/{accountTotalPages}</span>
            <button type="button" disabled={accountPage >= accountTotalPages} onClick={() => setAccountPage((page) => Math.min(accountTotalPages, page + 1))} className="rounded-xl border border-slate-200 px-3 py-2 font-semibold disabled:cursor-not-allowed disabled:opacity-40">Trang sau</button>
          </div>
        </div>
        </>
      ) : (
        <div className="rounded-[28px] bg-white py-20 text-center shadow-sm ring-1 ring-slate-100">
          <UserCog className="mx-auto h-10 w-10 text-slate-300" />
          <h3 className="mt-4 text-lg font-bold text-slate-900">Không tìm thấy tài khoản phù hợp</h3>
          <p className="text-slate-500">Hãy đổi bộ lọc hoặc thêm tài khoản mới cho hệ thống.</p>
        </div>
      )}
    </div>
  );

  const renderClassesManagement = () => (
    <div className="space-y-6">
      <DataToolbar
        title="Quản trị lớp học"
        description="Quản lý lớp trực tiếp trên Firebase, nhập/xuất Excel theo mẫu vnEdu và cập nhật giao diện ngay sau thao tác."
        searchValue={classQuery}
        onSearchChange={setClassQuery}
        searchPlaceholder="Tìm theo mã lớp hoặc tên lớp..."
        filters={[
          {
            key: 'grade',
            label: 'Khối',
            value: classGradeFilter,
            onChange: setClassGradeFilter,
            options: [{ value: 'Tất cả', label: 'Tất cả khối' }, ...(gradeFilterOptions.map((grade) => ({ value: grade, label: `Khối ${grade}` })))],
          },
          {
            key: 'status',
            label: 'Trạng thái',
            value: classStatusFilter,
            onChange: setClassStatusFilter,
            options: [
              { value: 'Tất cả', label: 'Tất cả trạng thái' },
              { value: 'active', label: 'Hoạt động' },
              { value: 'inactive', label: 'Tạm khóa' },
            ],
          },
        ]}
        action={
          <div className="flex flex-wrap gap-3">
            <button onClick={() => void exportClassesToExcel(filteredClasses)} disabled={filteredClasses.length === 0} className="inline-flex items-center gap-2 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-semibold text-indigo-700 shadow-sm hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50">
              <Download className="h-4 w-4" /> Xuất danh sách
            </button>
            <button onClick={() => downloadTemplate('class')} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50">
              <Download className="h-4 w-4" /> Tải file mẫu
            </button>
            <button onClick={() => openImportModal('class')} className="inline-flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 shadow-sm hover:bg-emerald-100">
              <UploadCloud className="h-4 w-4" /> Nhập từ file
            </button>
            <button onClick={() => { setEditingClass(null); setIsClassModalOpen(true); }} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20">
              <Plus className="h-4 w-4" /> Thêm lớp học
            </button>
          </div>
        }
        stats={<div className="flex flex-wrap gap-3 text-xs font-semibold"><span className="rounded-full bg-emerald-50 px-3 py-1.5 text-emerald-700">{filteredClasses.length} lớp hiển thị</span><span className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-700">{classes.filter((item) => item.trang_thai === 'active').length} lớp hoạt động</span></div>}
      />

      {currentUserIsAdmin && selectedClassIds.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-rose-100 bg-rose-50 px-5 py-4 text-sm shadow-sm">
          <div>
            <div className="font-bold text-rose-700">Đã chọn {selectedClassIds.length} lớp</div>
            <div className="text-xs text-rose-600">Có thể xóa nhanh nhiều lớp trống. Lớp còn học sinh hoặc bài học sẽ được giữ lại và báo rõ lý do.</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setSelectedClassIds([])} className="rounded-2xl border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100">Bỏ chọn</button>
            <button onClick={askDeleteSelectedClasses} className="inline-flex items-center gap-2 rounded-2xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-rose-600/20 hover:bg-rose-700">
              <Trash2 className="h-4 w-4" /> Xóa lớp đã chọn
            </button>
          </div>
        </div>
      )}

      {filteredClasses.length > 0 ? renderTableShell(
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50/80 text-left text-slate-500">
            <tr>
              <th className="w-12 px-5 py-4">
                {currentUserIsAdmin && (
                  <input
                    type="checkbox"
                    checked={allVisibleClassesSelected}
                    onChange={toggleSelectVisibleClasses}
                    disabled={filteredClasses.length === 0}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    title="Chọn/bỏ chọn các lớp đang hiển thị"
                  />
                )}
              </th>
              {['Mã lớp', 'Tên lớp', 'Khối', 'Sĩ số', 'GVCN', 'Trạng thái', 'Thao tác'].map((column) => (
                <th key={column} className="px-5 py-4 font-semibold">{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredClasses.map((item) => (
              <tr key={item.lop_id} className="border-t border-slate-100 text-slate-700">
                <td className="px-5 py-4">
                  {currentUserIsAdmin && (
                    <input
                      type="checkbox"
                      checked={selectedClassIdSet.has(item.lop_id)}
                      onChange={() => toggleSelectClass(item)}
                      className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      title="Chọn lớp này"
                    />
                  )}
                </td>
                <td className="px-5 py-4 font-semibold text-slate-900">{item.lop_id}</td>
                <td className="px-5 py-4">{item.ten_lop}</td>
                <td className="px-5 py-4">Khối {item.khoi}</td>
                <td className="px-5 py-4 text-slate-600">{item.si_so || '-'}</td>
                <td className="px-5 py-4 text-slate-600"><div className="font-medium text-slate-700">{item.giao_vien_chu_nhiem || '-'}</div>{item.ten_dang_nhap_gvcn && <div className="mt-1 text-xs text-slate-400">{item.ten_dang_nhap_gvcn}</div>}</td>
                <td className="px-5 py-4"><span className={`rounded-full px-3 py-1 text-xs font-semibold ${item.trang_thai === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{getFriendlyState(item.trang_thai)}</span></td>
                <td className="px-5 py-4">
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => { setEditingClass(item); setIsClassModalOpen(true); }} className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"><Pencil className="h-3.5 w-3.5" /> Sửa</button>
                    <button onClick={() => askMoveClassStudents(item)} className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"><Users className="h-3.5 w-3.5" /> Dọn lớp</button>
                    <button onClick={() => askDeleteClass(item)} className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100"><Trash2 className="h-3.5 w-3.5" /> Xóa</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="rounded-[28px] bg-white py-20 text-center shadow-sm ring-1 ring-slate-100"><GraduationCap className="mx-auto h-10 w-10 text-slate-300" /><h3 className="mt-4 text-lg font-bold text-slate-900">Không tìm thấy lớp học phù hợp</h3><p className="text-slate-500">Hãy điều chỉnh bộ lọc hoặc thêm lớp mới.</p></div>
      )}
    </div>
  );

  const renderSubjectsManagement = () => (
    <div className="space-y-6">
      <DataToolbar
        title="Quản trị môn học"
        description="Quản lý danh mục môn học, khối áp dụng và trạng thái để kho bài học dùng thống nhất."
        searchValue={subjectQuery}
        onSearchChange={setSubjectQuery}
        searchPlaceholder="Tìm theo mã môn hoặc tên môn..."
        filters={[
          {
            key: 'grade',
            label: 'Khối áp dụng',
            value: subjectGradeFilter,
            onChange: setSubjectGradeFilter,
            options: [{ value: 'Tất cả', label: 'Tất cả khối' }, ...(gradeFilterOptions.map((grade) => ({ value: grade, label: `Khối ${grade}` })))],
          },
          {
            key: 'status',
            label: 'Trạng thái',
            value: subjectStatusFilter,
            onChange: setSubjectStatusFilter,
            options: [
              { value: 'Tất cả', label: 'Tất cả trạng thái' },
              { value: 'active', label: 'Hoạt động' },
              { value: 'inactive', label: 'Tạm khóa' },
            ],
          },
        ]}
        action={
          <div className="flex flex-wrap gap-3">
            <button onClick={() => downloadTemplate('subject')} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50">
              <Download className="h-4 w-4" /> Tải file mẫu
            </button>
            <button onClick={() => openImportModal('subject')} className="inline-flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700 shadow-sm hover:bg-amber-100">
              <UploadCloud className="h-4 w-4" /> Nhập từ file
            </button>
            <button onClick={() => { setEditingSubject(null); setIsSubjectModalOpen(true); }} className="inline-flex items-center gap-2 rounded-2xl bg-amber-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-amber-500/20">
              <Plus className="h-4 w-4" /> Thêm môn học
            </button>
          </div>
        }
        stats={<div className="flex flex-wrap gap-3 text-xs font-semibold"><span className="rounded-full bg-amber-50 px-3 py-1.5 text-amber-700">{filteredSubjects.length} môn hiển thị</span><span className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-700">{subjects.filter((item) => item.trang_thai === 'active').length} môn hoạt động</span></div>}
      />

      {filteredSubjects.length > 0 ? renderTableShell(
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50/80 text-left text-slate-500">
            <tr>
              {['Mã môn', 'Tên môn', 'Khối áp dụng', 'Trạng thái', 'Thao tác'].map((column) => (
                <th key={column} className="px-5 py-4 font-semibold">{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredSubjects.map((item) => (
              <tr key={item.mon_id} className="border-t border-slate-100 text-slate-700">
                <td className="px-5 py-4 font-semibold text-slate-900">{item.mon_id}</td>
                <td className="px-5 py-4">{item.ten_mon}</td>
                <td className="px-5 py-4 text-slate-600">{item.khoi_ap_dung || '-'}</td>
                <td className="px-5 py-4"><span className={`rounded-full px-3 py-1 text-xs font-semibold ${item.trang_thai === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{getFriendlyState(item.trang_thai)}</span></td>
                <td className="px-5 py-4">
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => { setEditingSubject(item); setIsSubjectModalOpen(true); }} className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100"><Pencil className="h-3.5 w-3.5" /> Sửa</button>
                    <button onClick={() => askDeleteSubject(item)} className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100"><Trash2 className="h-3.5 w-3.5" /> Xóa</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="rounded-[28px] bg-white py-20 text-center shadow-sm ring-1 ring-slate-100"><BookOpen className="mx-auto h-10 w-10 text-slate-300" /><h3 className="mt-4 text-lg font-bold text-slate-900">Không tìm thấy môn học phù hợp</h3><p className="text-slate-500">Hãy thử thay đổi bộ lọc hoặc thêm môn mới.</p></div>
      )}
    </div>
  );

  const renderContent = () => {
    switch (activeMenu) {
      case 'overview':
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
              {stats.map((stat, i) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="rounded-[28px] bg-white p-6 shadow-sm ring-1 ring-slate-100"
                >
                  <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-2xl text-white ${stat.color}`}>{stat.icon}</div>
                  <p className="text-sm font-medium text-slate-500">{stat.label}</p>
                  <p className="mt-1 text-3xl font-bold text-slate-900">{stat.value}</p>
                </motion.div>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.3fr_1fr]">
              <div className="rounded-[28px] bg-white p-8 shadow-sm ring-1 ring-slate-100">
                <h2 className="text-xl font-bold text-slate-900">Trung tâm quản trị học tập</h2>
                <div className="mt-5 grid gap-4 text-sm leading-7 text-slate-600">
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="font-semibold text-slate-900">Dữ liệu cốt lõi đã được kết nối</p>
                    <p>Firestore là nguồn dữ liệu chính cho tài khoản, danh mục, bài học, tiến trình, bình luận, ôn tập và cấu hình hệ thống.</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="font-semibold text-slate-900">Quản trị nhanh trên một giao diện</p>
                    <p>Apps Script chỉ còn xử lý tác vụ đặc quyền Firebase Authentication và một số luồng tương thích cũ được gọi riêng; dữ liệu màn hình không còn chờ Sheet/Drive khi khởi động.</p>
                  </div>
                </div>
              </div>
              <div className="rounded-[28px] bg-white p-8 shadow-sm ring-1 ring-slate-100">
                <h2 className="text-xl font-bold text-slate-900">Vận hành theo gói Spark miễn phí</h2>
                <div className="mt-5 space-y-3 text-sm text-slate-600">
                  <p>Không dùng Firebase Storage, Cloud Functions, TTL hoặc dịch vụ bắt buộc Blaze.</p>
                  <p>Tệp nguồn chỉ xử lý tạm trên trình duyệt; JSON bài học được giới hạn 750 KB để bảo vệ giới hạn document.</p>
                  <p>Truy vấn được giới hạn theo vai trò, lớp, bài học và người dùng nhằm giảm số lượt đọc Firestore.</p>
                </div>
              </div>
            </div>

            {currentUserIsAdmin && systemDiagnostics && (
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.95fr_1.05fr]">
                <div className="rounded-[28px] bg-white p-8 shadow-sm ring-1 ring-slate-100">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-bold text-slate-900">Chẩn đoán dữ liệu hệ thống</h2>
                      <p className="mt-2 text-sm leading-6 text-slate-500">Khối này giúp phát hiện nhanh những bản ghi lệch logic giữa tài khoản, lớp, môn, bài học và tiến trình học tập.</p>
                    </div>
                    <div className={`rounded-2xl px-4 py-2 text-sm font-semibold ${systemDiagnostics.summary.total_issues > 0 ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                      {systemDiagnostics.summary.total_issues > 0 ? `Có ${systemDiagnostics.summary.total_issues} vấn đề cần rà` : 'Dữ liệu đang ổn định'}
                    </div>
                  </div>
                  <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {diagnosticSummaryItems.map((item) => (
                      <div key={item.label} className={`rounded-2xl px-4 py-4 text-sm font-semibold ${item.className}`}>
                        <div className="text-xs uppercase tracking-wide opacity-80">{item.label}</div>
                        <div className="mt-2 text-2xl font-bold">{item.value}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-5 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    Lần quét gần nhất: <span className="font-semibold text-slate-900">{systemDiagnostics.generated_at || 'Chưa xác định'}</span>
                  </div>
                </div>

                <div className="rounded-[28px] bg-white p-8 shadow-sm ring-1 ring-slate-100">
                  <h2 className="text-xl font-bold text-slate-900">Các điểm cần ưu tiên xử lý</h2>
                  {diagnosticSections.length > 0 ? (
                    <div className="mt-5 space-y-4">
                      {diagnosticSections.slice(0, 4).map((section) => (
                        <div key={section.key} className="rounded-2xl border border-slate-200 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold text-slate-900">{section.label}</p>
                              <p className="mt-1 text-sm text-slate-500">{section.issue_count} vấn đề cần kiểm tra trong nhóm dữ liệu này.</p>
                            </div>
                            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{section.issue_count}</span>
                          </div>
                          <div className="mt-4 space-y-3">
                            {section.issues.slice(0, 2).map((issue, index) => (
                              <div key={`${section.key}-${issue.code}-${index}`} className={`rounded-2xl px-4 py-3 text-sm ${issue.severity === 'error' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}`}>
                                <p className="font-semibold">{issue.title}</p>
                                <p className="mt-1 leading-6 opacity-90">{issue.detail}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-5 rounded-2xl bg-emerald-50 px-5 py-4 text-sm text-emerald-700">
                      Không phát hiện lỗi chéo giữa các nhóm dữ liệu chính. Bạn có thể tiếp tục vận hành hệ thống bình thường.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );

      case 'accounts':
        return renderAccountsManagement();

      case 'classes':
        return renderClassesManagement();

      case 'subjects':
        return renderSubjectsManagement();

      case 'lessons':
        return renderLessonGrid(
          'Quản lý bài học',
          'Quản lý, chia sẻ và kiểm soát quyền học.',
          filteredLessons,
          <div className="flex flex-wrap gap-3">
            <button onClick={openReviewPracticeCreator} className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-3.5 py-2.5 text-xs font-bold text-white shadow-md shadow-amber-600/15"><BookOpenCheck className="h-4 w-4" /> Tạo bài ôn tập</button>
            <button onClick={openComposerForCreate} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-3.5 py-2.5 text-xs font-bold text-white shadow-md shadow-indigo-600/15">
              <Plus className="h-4 w-4" /> Tạo bài học
            </button>
          </div>,
        );

      case 'learning':
        return currentUserIsAdmin ? renderAnalyticsHub() : renderLearningHub();

      case 'arena':
        return renderArenaHub();

      case 'analytics':
        return renderAnalyticsHub();

      case 'my_lessons':
        if (user?.vai_tro === 'student') return renderLearningHub();
        return renderLessonGrid(
          'Bài học của tôi',
          'Tự tạo học liệu, chỉnh sửa rồi gửi admin duyệt để chia sẻ cho toàn khối.',
          filteredLessons,
          <div className="flex flex-wrap gap-3">
            <button onClick={openReviewPracticeCreator} className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-3.5 py-2.5 text-xs font-bold text-white shadow-md shadow-amber-600/15"><BookOpenCheck className="h-4 w-4" /> Tạo bài ôn tập</button>
            <button onClick={openComposerForCreate} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-3.5 py-2.5 text-xs font-bold text-white shadow-md shadow-indigo-600/15">
              <Plus className="h-4 w-4" /> Tạo bài học mới
            </button>
          </div>,
        );

      case 'create_lesson':
        if (user?.vai_tro === 'student') return renderLearningHub();
        return (
          <div className="rounded-[32px] bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 p-8 text-white shadow-[0_22px_55px_rgba(79,70,229,0.28)]">
            <div className="max-w-3xl">
              <p className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">
                <FolderKanban className="h-4 w-4" /> Tạo học liệu cá nhân
              </p>
              <h1 className="mt-4 text-3xl font-bold">Tạo bài học mới bằng AI</h1>
              <p className="mt-3 text-sm leading-7 text-white/90">
                Tải file bài học, để Gemini phân tích và biến thành nội dung học tập theo tiến trình chuẩn. Sau khi lưu, bạn có thể học ngay hoặc gửi admin duyệt chia sẻ.
              </p>
              <button onClick={openComposerForCreate} className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-bold text-indigo-700 shadow-lg shadow-indigo-950/10">
                <Plus className="h-4 w-4" /> Mở trình tạo bài học
              </button>
            </div>
          </div>
        );

      case 'approvals':
        return renderApprovals();

      case 'school_years':
        return renderSchoolYearManagement();

      case 'video_config':
        return (
          <VideoConfigPanel
            config={welcomeVideoModalConfig}
            isSubmitting={isSubmitting}
            onSave={handleSaveVideoConfig}
            onPreview={openWelcomeVideoPreview}
          />
        );

      case 'ai_config':
        return (
          <div className="mx-auto max-w-2xl space-y-6">
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-purple-100 text-purple-600 shadow-lg shadow-purple-600/10">
                <Settings className="h-10 w-10" />
              </div>
              <h1 className="text-2xl font-bold text-slate-900">Cấu hình Trợ lý AI</h1>
              <p className="mt-2 text-slate-500">API Key được lưu trong tài liệu Firestore riêng, chỉ chính tài khoản đang đăng nhập có quyền đọc/ghi và có thể dùng lại trên thiết bị khác.</p>
            </div>

            <div className="rounded-[28px] bg-white p-8 shadow-sm ring-1 ring-slate-100">
              <div className="space-y-5">
                <div>
                  <p className="text-sm font-semibold text-slate-700">Gemini API Key</p>
                  <p className="mt-2 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    {maskApiKey(aiConfig)}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-700">Model hiện tại</p>
                  <p className="mt-2 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">{aiConfig.model}</p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-700">Trạng thái đồng bộ</p>
                  <p className="mt-2 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    {aiConfig.hasServerKey ? 'Đã lưu trên hệ thống' : 'Chưa đồng bộ lên hệ thống'}
                    {aiConfig.updatedAt ? ` · Cập nhật: ${aiConfig.updatedAt}` : ''}
                  </p>
                </div>
                <div>
                  <p className="mb-2 text-sm font-semibold text-slate-700">Model được phép</p>
                  <div className="flex flex-wrap gap-2">
                    {allowedModels.map((model) => (
                      <span key={model} className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
                        {model}
                      </span>
                    ))}
                  </div>
                </div>
                <button onClick={() => openAIConfigModal('manual')} className="rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20">
                  Mở cấu hình AI
                </button>
              </div>
            </div>
          </div>
        );

      case 'profile':
        return (
          <div className="rounded-[28px] bg-white p-6 shadow-sm ring-1 ring-slate-100">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Hồ sơ cá nhân</h2>
                <p className="mt-1 text-sm text-slate-500">Cập nhật thông tin cơ bản của chính bạn mà không ảnh hưởng đến các chức năng quản trị và học tập khác.</p>
              </div>
              <button
                type="button"
                onClick={openProfileModal}
                className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-700"
              >
                <Pencil className="h-4 w-4" /> Chỉnh sửa thông tin
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-slate-500">
                    <th className="px-3 py-3 font-semibold">Thông tin</th>
                    <th className="px-3 py-3 font-semibold">Giá trị</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['Họ tên', user.ho_ten],
                    ['Tên đăng nhập', user.ten_dang_nhap],
                    ['Vai trò', getRoleLabel(user)],
                    ['Khối', user.khoi || '-'],
                    ['Lớp', user.lop_id || '-'],
                  ].map((row) => (
                    <tr key={String(row[0])} className="border-b border-slate-50 last:border-0">
                      <td className="px-3 py-3 font-medium text-slate-700">{row[0]}</td>
                      <td className="px-3 py-3 text-slate-700">{row[1]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );

      default:
        return renderLearningHub();
    }
  };

  return (
    <>
      <Layout user={user} onLogout={handleLogout} activeMenu={activeMenu} setActiveMenu={setActiveMenu}>
        <Suspense fallback={<DataModuleSkeleton message="Đang tải mô-đun chức năng..." />}>
          {(isCoreDataLoading || isMenuDataLoading)
            ? <DataModuleSkeleton message={isCoreDataLoading ? 'Đang đồng bộ danh mục cốt lõi từ Firebase...' : menuLoadingMessage} />
            : renderContent()}
        </Suspense>
      </Layout>

      <WelcomeVideoModal
        isOpen={isWelcomeVideoOpen}
        config={welcomeVideoModalConfig}
        onClose={handleCloseWelcomeVideo}
        previewMode={isWelcomeVideoPreview}
      />

      <Suspense fallback={null}>
      {isAssistantReady && <AIAssistant
        config={aiConfig}
        onOpenConfig={openAIConfigModal}
        isLessonOpen={isLessonViewerOpen}
        lessonContext={isLessonViewerOpen && selectedLesson ? {
          lessonId: selectedLesson.lesson_id,
          title: selectedLesson.tieu_de,
          summary: selectedLesson.mo_ta,
          content: selectedLessonContent,
          stage: viewerStage,
          stageLabel: STAGE_LABELS[viewerStage],
          suggestions: assistantSuggestions,
        } : null}
      />}

      <CoLearningModal
        isOpen={isCoLearningModalOpen}
        lesson={coLearningLesson}
        classmates={coLearningClassmates}
        selectedUserIds={coLearningSelectedUserIds}
        passwords={coLearningPasswords}
        reusableSession={reusableCoLearningSession}
        isLoading={isCoLearningLoading}
        isSubmitting={isCoLearningSubmitting}
        error={coLearningError}
        onToggleClassmate={(userId) => {
          setCoLearningSelectedUserIds((current) => current.includes(userId)
            ? current.filter((item) => item !== userId)
            : current.length < 5 ? [...current, userId] : current);
          setCoLearningPasswords((current) => {
            if (!coLearningSelectedUserIds.includes(userId)) return current;
            const next = { ...current };
            delete next[userId];
            return next;
          });
          setCoLearningError('');
        }}
        onPasswordChange={(userId, password) => setCoLearningPasswords((current) => ({ ...current, [userId]: password }))}
        onStudyAlone={handleStudyAlone}
        onResumeCoLearning={handleResumeCoLearning}
        onStartCoLearning={handleStartCoLearning}
        onClose={closeCoLearningModal}
      />

      {isLessonViewerOpen && <LessonViewer
        isOpen={isLessonViewerOpen}
        lesson={selectedLesson}
        content={selectedLessonContent}
        aiConfig={aiConfig}
        onOpenConfig={openAIConfigModal}
        onClose={() => { setIsLessonViewerOpen(false); setActiveCoLearningSession(null); }}
        onStageChange={setViewerStage}
        progress={selectedLesson && user.vai_tro === 'student' ? currentStudentProgressByLesson[selectedLesson.lesson_id] || null : null}
        onStepOpened={handleLessonViewerStepOpened}
        onStepViewedComplete={handleLessonViewerStepViewedComplete}
        onQuizMetricsChange={handleLessonViewerQuizMetricsChange}
        comments={lessonComments}
        isCommentsLoading={isLessonCommentsLoading}
        currentUserRole={user.vai_tro}
        onAddComment={handleAddLessonAnalyticsComment}
        onUpdateComment={handleUpdateLessonAnalyticsComment}
      />}

      {isReviewViewerOpen && <ReviewPracticeViewer
        isOpen={isReviewViewerOpen}
        review={selectedReviewPractice}
        questions={selectedReviewQuestions}
        config={selectedReviewConfig}
        onClose={() => setIsReviewViewerOpen(false)}
        onSubmit={handleSubmitReviewPractice}
      />}

      {isReviewResultsOpen && <ReviewPracticeResultsModal
        isOpen={isReviewResultsOpen}
        review={reviewResultsPractice}
        students={reviewResultStudents}
        attempts={reviewResultAttempts}
        summary={reviewResultSummary}
        isLoading={isReviewResultsLoading}
        onClose={() => setIsReviewResultsOpen(false)}
        onRefresh={() => reviewResultsPractice ? void loadReviewPracticeResults(reviewResultsPractice) : undefined}
      />}

      {user.vai_tro !== 'student' && isReviewModalOpen && (
      <ReviewPracticeModal
        isOpen={isReviewModalOpen}
        lessons={lessonSourcePool}
        subjects={subjects}
        classes={classes}
        schoolYears={schoolYears}
        currentSchoolYear={schoolYears.find((item) => item.la_hien_hanh === true || String(item.la_hien_hanh).toLowerCase() === 'true')?.ten_nam_hoc || analyticsSchoolYearFilter || getComputedSchoolYear()}
        isSubmitting={isSubmitting}
        onClose={() => setIsReviewModalOpen(false)}
        onSubmit={handleCreateReviewPractice}
      />
      )}

      {user.vai_tro !== 'student' && isComposerOpen && (
      <LessonComposer
        isOpen={isComposerOpen}
        user={user}
        aiConfig={aiConfig}
        subjects={subjects}
        classes={classes}
        existingLessons={lessons}
        currentSchoolYear={schoolYears.find((item) => item.la_hien_hanh === true || String(item.la_hien_hanh).toLowerCase() === 'true')?.ten_nam_hoc || analyticsSchoolYearFilter || getComputedSchoolYear()}
        initialLesson={editingLesson}
        initialContent={editingContent}
        onClose={() => setIsComposerOpen(false)}
        onSave={handleComposerSave}
        onOpenConfig={openAIConfigModal}
      />
      )}

      <SchoolYearTransferModal
        isOpen={isSchoolYearTransferOpen}
        schoolYears={schoolYears}
        classes={classes}
        accounts={accounts}
        isSubmitting={isSubmitting}
        onClose={() => setIsSchoolYearTransferOpen(false)}
        onSubmit={handleTransferSchoolYear}
        onMoveStudents={handleMoveStudentsBetweenClasses}
      />

      <AccountFormModal
        isOpen={isAccountModalOpen}
        classes={classes}
        availableGrades={gradeFilterOptions}
        initialData={editingAccount}
        isSubmitting={isSubmitting}
        onClose={() => {
          setIsAccountModalOpen(false);
          setEditingAccount(null);
        }}
        onSubmit={handleAccountSubmit}
      />

      <ClassFormModal
        isOpen={isClassModalOpen}
        initialData={editingClass}
        availableGrades={gradeFilterOptions}
        isSubmitting={isSubmitting}
        onClose={() => {
          setIsClassModalOpen(false);
          setEditingClass(null);
        }}
        onSubmit={handleClassSubmit}
      />

      <SubjectFormModal
        isOpen={isSubjectModalOpen}
        initialData={editingSubject}
        availableGrades={gradeFilterOptions}
        isSubmitting={isSubmitting}
        onClose={() => {
          setIsSubjectModalOpen(false);
          setEditingSubject(null);
        }}
        onSubmit={handleSubjectSubmit}
      />

      <ProfileFormModal
        isOpen={isProfileModalOpen}
        user={user}
        classes={profileClasses}
        availableGrades={gradeFilterOptions}
        isSubmitting={isSubmitting}
        onClose={() => { setIsProfileModalOpen(false); setProfileClasses([]); }}
        onSubmit={handleProfileSubmit}
      />

      {isImportModalOpen && <ImportDataModal
        isOpen={isImportModalOpen}
        entity={importEntity}
        accounts={accounts}
        classes={classes}
        subjects={subjects}
        isSubmitting={isSubmitting}
        executionProgress={accountImportProgress}
        executionResult={accountImportResult}
        onClose={() => {
          setIsImportModalOpen(false);
          setAccountImportProgress(null);
          setAccountImportResult(null);
        }}
        onConfirm={handleImportConfirm}
      />}

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        description={confirmDialog.description}
        confirmLabel={confirmDialog.confirmLabel}
        cancelLabel={confirmDialog.cancelLabel}
        variant={confirmDialog.variant}
        isSubmitting={isSubmitting}
        requiredText={confirmDialog.requiredText}
        requiredTextLabel={confirmDialog.requiredTextLabel}
        onClose={() => setConfirmDialog(DEFAULT_CONFIRM)}
        onConfirm={() => void confirmDialog.onConfirm()}
      />

      {isAIConfigOpen && <AIConfigModal
        isOpen={isAIConfigOpen}
        onClose={closeAIConfigModal}
        config={aiConfig}
        user={user}
        onSave={handleSaveAIConfig}
        onDelete={handleDeleteAIConfig}
        setLoading={setIsLoading}
        showToast={showToast}
        openReason={aiConfigOpenReason}
      />}
      </Suspense>

      <AnimatePresence>
        {isRefreshingData && !isLoading && !isCoreDataLoading && !isMenuDataLoading && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="fixed right-5 top-5 z-[120] inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-white/95 px-3.5 py-2 text-xs font-bold text-indigo-700 shadow-lg backdrop-blur"
            aria-live="polite"
          >
            <RefreshCw className="h-4 w-4 animate-spin" /> Đang đồng bộ dữ liệu
          </motion.div>
        )}
      </AnimatePresence>
      <LoadingOverlay isLoading={isLoading} message={loadingMessage} />
      <AnimatePresence>{toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}</AnimatePresence>
    </>
  );
}
