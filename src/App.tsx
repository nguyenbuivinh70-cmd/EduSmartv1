import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft,
  BookOpen,
  BookOpenCheck,
  CheckSquare,
  Database,
  Eye,
  Filter,
  FolderKanban,
  GraduationCap,
  Download,
  MonitorPlay,
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
  LessonCloseSnapshot,
  LessonComment,
  LessonRow,
  ReviewPracticeAttempt,
  ReviewPracticeConfig,
  ReviewPracticeContentResponse,
  ReviewPracticeResultStudent,
  ReviewPracticeResultSummary,
  ReviewPracticeRow,
  InteractivePracticeManifest,
  QuizQuestion,
  LearningStepProgress,
  SchoolYear,
  LessonProgressRecord,
  LessonRetakeAttempt,
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
import { getLessonScheduleAccess, getPreLessonVideoAccess } from './utils/lessonAccess';
import { applyProgressScoreModelV3, finalizeProgressScore } from './utils/learningScoreEngine';
import { formatPracticeDateTime, getPracticeAccessState, practiceAttemptSummary, resolvePracticeConfig } from './utils/practiceAccess';
import { canManageGrade, formatManagedGrades, getManagedGradeScope, teacherManagesAllGrades } from './utils/gradeScope';
import {
  createAccountApi,
  createClassApi,
  createLessonApi,
  createReviewPracticeApi,
  createInteractivePracticeApi,
  updateInteractivePracticeApi,
  createSchoolYearApi,
  createSubjectApi,
  deleteAccountApi,
  batchDeleteAccountsApi,
  batchResetPasswordsApi,
  batchDeleteClassesApi,
  deleteLessonApi,
  analyzeLessonPurgeApi,
  purgeLessonApi,
  continueLessonPurgeApi,
  repairLessonIntegrityApi,
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
  listMyReviewAttemptsApi,
  listPendingSharesApi,
  listLessonCommentsApi,
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
  setLessonAccessModeApi,
  setLessonSelfStudyAccessApi,
  startLessonRetakeApi,
  saveLessonRetakeApi,
  finalizeOfficialLessonRetakeApi,
  finalizeDeadlineZerosApi,
  listLessonRetakesApi,
  setCurrentSchoolYearApi,
  transferSchoolYearApi,
  maskApiKey,
  moderateLearningResultApi,
  startCoLearningSessionApi,
  updateCoLearningSessionApi,
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
import { clearFirebaseIdentityCache, subscribeFirebaseLessonAccess, subscribeFirebaseLearningProgress, subscribeFirebasePreLessonSubmissionChanges } from './services/firebaseOperational';
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
import ConfirmDialog, { type AccountOperationCredentials } from './components/ConfirmDialog';
import ProfileFormModal from './components/ProfileFormModal';
import WelcomeVideoModal from './components/WelcomeVideoModal';
import VideoConfigPanel from './components/VideoConfigPanel';
import CoLearningModal from './components/CoLearningModal';
import SchoolYearConfigPanel from './components/SchoolYearConfigPanel';
import SchoolYearTransferModal from './components/SchoolYearTransferModal';

const AIConfigModal = lazy(() => import('./components/AIConfigModal'));
const AIAssistant = lazy(() => import('./components/AIAssistant'));
const LessonViewer = lazy(() => import('./components/LessonViewer'));
const PreLessonVideoModal = lazy(() => import('./components/PreLessonVideoModal'));
const LessonComposer = lazy(() => import('./components/LessonComposer'));
const ReviewPracticeModal = lazy(() => import('./components/ReviewPracticeModal'));
const ReviewPracticeViewer = lazy(() => import('./components/ReviewPracticeViewer'));
const ReviewPracticeResultsModal = lazy(() => import('./components/ReviewPracticeResultsModal'));
const InteractivePracticeImportModal = lazy(() => import('./components/InteractivePracticeImportModal'));
const InteractivePracticeViewer = lazy(() => import('./components/InteractivePracticeViewer'));
const PracticeSettingsModal = lazy(() => import('./components/PracticeSettingsModal'));
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
    access_mode: row.access_mode === 'self_study' ? 'self_study' : 'teacher_controlled',
    self_study_scope: row.self_study_scope === 'classes' || row.self_study_scope === 'all' || row.self_study_scope === 'none'
      ? row.self_study_scope
      : (row.access_mode === 'self_study' ? 'all' : 'none'),
    self_study_class_ids: Array.isArray(row.self_study_class_ids) ? row.self_study_class_ids.filter(Boolean) : [],
    allow_retake_after_completion: row.allow_retake_after_completion === true,
    locked_at: row.locked_at || '',
    locked_by_uid: row.locked_by_uid || '',
    locked_by_name: row.locked_by_name || '',
    intro_video_url: row.intro_video_url || '',
    intro_video_embed_url: row.intro_video_embed_url || '',
    pre_lesson_enabled: row.pre_lesson_enabled !== false && Boolean(row.intro_video_url || row.intro_video_embed_url),
    pre_lesson_allow_when_locked: row.pre_lesson_allow_when_locked !== false,
    pre_lesson_required: row.pre_lesson_required === true,
    pre_lesson_completion_threshold: Number(row.pre_lesson_completion_threshold || 80),
    pre_lesson_deadline: row.pre_lesson_deadline || '',
    pre_lesson_video_revision: Number(row.pre_lesson_video_revision || 1),
    pre_lesson_score_enabled: false,
    pre_lesson_score_weight: 0,
    content_schema_version: row.content_schema_version || undefined,
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
    case 'archived':
      return 'Đã lưu trữ';
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
  if (!user.user_id || !user.ten_dang_nhap || !user.ho_ten || !user.vai_tro) return null;
  return {
    user_id: String(user.user_id),
    ten_dang_nhap: String(user.ten_dang_nhap),
    ho_ten: String(user.ho_ten),
    vai_tro: user.vai_tro,
    // V6.78.0: Firebase ID token không còn được lưu trong localStorage.
    // Token được khôi phục từ Firebase Auth persistence khi ứng dụng khởi động.
    token: '',
    lop_id: normalizeClassIdValue(user.lop_id),
    khoi: normalizeGradeValue(user.khoi),
    khoi_phu_trach: getManagedGradeScope(user),
    tat_ca_khoi: teacherManagesAllGrades(user),
    quyen_admin: hasAdminPermission(user),
    auth_provider: user.auth_provider === 'firebase' ? 'firebase' : 'legacy',
    firebase_uid: String(user.firebase_uid || '').trim(),
  };
}

function serializeStoredUser(user: User) {
  const { token: _token, ...safeUser } = user;
  return safeUser;
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
  accountOperation?: 'delete' | 'reset';
  onConfirm: (credentials?: AccountOperationCredentials) => Promise<void> | void;
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

type LessonPurgeMode = 'preserve_grades' | 'purge_all';

interface LessonPurgeProgressState {
  lessonId: string;
  lessonTitle: string;
  mode: LessonPurgeMode;
  status: 'running' | 'retryable' | 'completed';
  phase: string;
  processed: number;
  total: number;
  archivedGrades: number;
  error?: string;
}

function lessonPurgePhaseLabel(phase: string) {
  const labels: Record<string, string> = {
    preparation_submissions: 'Kết quả chuẩn bị bài',
    legacy_prelesson_submissions: 'Kết quả chuẩn bị bài cũ',
    legacy_prelesson: 'Tiến độ video cũ',
    learning_actions: 'Lịch sử xử lý kết quả',
    comments: 'Bình luận/Câu hỏi',
    colearning_consents: 'Xác nhận học cùng',
    colearning_sessions: 'Phiên học cùng',
    teaching_sessions: 'Phiên dạy học',
    slides_prompts: 'Dữ liệu trình chiếu AI',
    review_practices: 'Bài luyện tập liên kết',
    learning_progress: 'Tiến độ và điểm học sinh',
    activities: 'Hoạt động bài học',
    content: 'Nội dung bài học',
    score_tracking: 'Cấu hình mốc điểm',
    registry_cleanup: 'Danh mục số bài',
    lesson_finalize: 'Thông tin bài học',
    completed: 'Hoàn tất',
  };
  return labels[phase] || phase || 'Đang xử lý';
}


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
    nam_hoc: String(raw.nam_hoc || ''),
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
    assessment_score: raw.assessment_score === undefined || raw.assessment_score === null ? undefined : Number(raw.assessment_score),
    section_scores: raw.section_scores && typeof raw.section_scores === 'object' ? raw.section_scores as Record<string, number> : {},
    learning_process_score: raw.learning_process_score === undefined ? undefined : Number(raw.learning_process_score),
    final_quiz_score: raw.final_quiz_score === undefined ? undefined : Number(raw.final_quiz_score),
    current_score: raw.current_score === undefined ? undefined : Number(raw.current_score),
    score_status: raw.score_status === 'finalized' ? 'finalized' : raw.score_status === 'retake_pending' ? 'retake_pending' : raw.score_status === 'not_applicable' ? 'not_applicable' : 'in_progress',
    score_calculated_at: String(raw.score_calculated_at || ''),
    last_closed_at: String(raw.last_closed_at || ''),
    save_state: raw.save_state === 'save_failed' ? 'save_failed' : raw.save_state === 'saving' ? 'saving' : 'saved',
    result_state: raw.result_state === 'cancelled_retake' || raw.result_state === 'invalid_cheating'
      ? raw.result_state
      : 'valid',
    result_group_id: String(raw.result_group_id || ''),
    result_version: Number(raw.result_version || 0),
    retake_allowed: raw.retake_allowed !== false,
    official_retake_remaining: Number(raw.official_retake_remaining || 0),
    official_retake_grant_id: String(raw.official_retake_grant_id || ''),
    official_retake_granted_at: String(raw.official_retake_granted_at || ''),
    official_retake_granted_by_uid: String(raw.official_retake_granted_by_uid || ''),
    official_retake_granted_by_name: String(raw.official_retake_granted_by_name || ''),
    official_retake_last_consumed_at: String(raw.official_retake_last_consumed_at || ''),
    official_retake_count: Number(raw.official_retake_count || 0),
    previous_official_score: raw.previous_official_score === undefined ? undefined : Number(raw.previous_official_score),
    previous_official_completed_at: String(raw.previous_official_completed_at || ''),
    score_reason: String(raw.score_reason || ''),
    deadline_status: String(raw.deadline_status || ''),
    deadline_finalized_at: String(raw.deadline_finalized_at || ''),
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
    pre_lesson_status: raw.pre_lesson_status === 'completed' ? 'completed' : raw.pre_lesson_status === 'in_progress' ? 'in_progress' : 'not_started',
    pre_lesson_watch_percent: Number(raw.pre_lesson_watch_percent || 0),
    pre_lesson_watched_seconds: Number(raw.pre_lesson_watched_seconds || 0),
    pre_lesson_completed_at: String(raw.pre_lesson_completed_at || ''),
    pre_lesson_completed_before_deadline: raw.pre_lesson_completed_before_deadline === true,
    pre_lesson_last_watched_at: String(raw.pre_lesson_last_watched_at || ''),
    pre_lesson_preparation_status: ['in_progress', 'prepared', 'late_completed'].includes(String(raw.pre_lesson_preparation_status || ''))
      ? raw.pre_lesson_preparation_status as any
      : 'not_started',
    preparation_score: raw.preparation_score === undefined ? undefined : Number(raw.preparation_score),
    preparation_weight: raw.preparation_weight === undefined ? undefined : Number(raw.preparation_weight),
    learning_component_weight: raw.learning_component_weight === undefined ? undefined : Number(raw.learning_component_weight),
    final_component_weight: raw.final_component_weight === undefined ? undefined : Number(raw.final_component_weight),
    score_model_version: raw.score_model_version === undefined ? undefined : Number(raw.score_model_version),
    scored_section_count: raw.scored_section_count === undefined ? undefined : Number(raw.scored_section_count),
    scorable_section_count: raw.scorable_section_count === undefined ? undefined : Number(raw.scorable_section_count),
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


const PENDING_LEARNING_PROGRESS_STORAGE_PREFIX = 'edusmart:pending-learning-progress:v1:';

function pendingLearningProgressStorageKey(userId: string) {
  return `${PENDING_LEARNING_PROGRESS_STORAGE_PREFIX}${String(userId || '').trim()}`;
}

function readPendingLearningProgress(userId: string): LessonProgressRecord[] {
  try {
    const raw = JSON.parse(localStorage.getItem(pendingLearningProgressStorageKey(userId)) || '[]');
    return sanitizeStoredProgressRecords(raw);
  } catch {
    return [];
  }
}

function writePendingLearningProgress(userId: string, records: LessonProgressRecord[]) {
  try {
    const deduped = new Map<string, LessonProgressRecord>();
    records.forEach((record) => {
      const current = deduped.get(record.progress_id);
      if (!current || Number(record.result_version || 0) >= Number(current.result_version || 0)
        || getProgressTimeValue(record.updated_at) >= getProgressTimeValue(current.updated_at)) {
        deduped.set(record.progress_id, record);
      }
    });
    localStorage.setItem(pendingLearningProgressStorageKey(userId), JSON.stringify(Array.from(deduped.values())));
  } catch { /* local backup is best effort */ }
}

function queuePendingLearningProgress(userId: string, record: LessonProgressRecord) {
  const current = readPendingLearningProgress(userId).filter((item) => item.progress_id !== record.progress_id);
  writePendingLearningProgress(userId, [...current, { ...record, save_state: 'save_failed' }]);
}

function removePendingLearningProgress(userId: string, progressId: string) {
  const next = readPendingLearningProgress(userId).filter((item) => item.progress_id !== progressId);
  writePendingLearningProgress(userId, next);
}

function lessonAllowsLateSubmission(lesson?: Lesson | null) {
  const value = lesson?.cho_phep_nop_sau_han;
  return value === true || String(value ?? '').trim().toLowerCase() === 'true' || String(value ?? '').trim() === '1';
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
    nam_hoc: lesson.nam_hoc || getComputedSchoolYear(),
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
    let percent = Number(detail.percent || 0);

    if (stageKey === 'luyen_tap') {
      const sectionItems = Object.values(detail.sectionProgress || {}) as SectionLearningProgress[];
      const sectionAverage = sectionItems.length
        ? sectionItems.reduce((sum, item) => sum + Math.max(0, Math.min(100, Number(item.completionPercent ?? (item.status === 'completed' ? 100 : 0)))), 0) / sectionItems.length
        : 0;
      const total = Number(detail.quizTotal || 0);
      const answered = Number(detail.quizAnswered || 0);
      const quizProgress = total > 0 ? Math.min(100, (answered / total) * 100) : 0;
      // Tiến độ nội dung phải tăng khi thời gian/mức hoàn thành mục tăng, không chỉ khi trả lời câu hỏi.
      percent = sectionItems.length ? Math.round(sectionAverage * 0.8 + quizProgress * 0.2) : Math.round(quizProgress);
      const allSectionsCompleted = !sectionItems.length || sectionItems.every((item) => item.status === 'completed');
      const finalExamStatus = String(detail.finalExam?.status || '');
      const finalExamExists = Number(detail.finalExam?.total_count || 0) > 0;
      const finalExamSubmitted = ['submitted', 'auto_submitted', 'expired'].includes(finalExamStatus);
      detail.viewedComplete = allSectionsCompleted;
      // V6.79.0: trả lời hết câu cuối bài chưa đồng nghĩa hoàn thành; phải bấm Nộp bài.
      detail.completed = allSectionsCompleted && (finalExamExists ? finalExamSubmitted : (total === 0 || answered >= total));
    } else {
      percent = detail.viewedComplete ? 100 : Math.max(0, Number(detail.percent || 0));
      detail.completed = Boolean(detail.viewedComplete);
    }

    detail.percent = Math.max(0, Math.min(100, Math.round(percent)));
    stepDetails[stageKey] = detail;
    weighted += (detail.percent / 100) * STAGE_WEIGHTS[stageKey];
    if (detail.completed) completedSteps += 1;
  });

  const quizTotal = stepDetails.luyen_tap.quizTotal || 0;
  const quizCorrect = stepDetails.luyen_tap.quizCorrect || 0;
  const quizAnswered = stepDetails.luyen_tap.quizAnswered || 0;
  const rawCompletionPercent = Math.min(100, Math.round(weighted));
  const allTrackedStagesCompleted = completedSteps >= Object.keys(STAGE_WEIGHTS).length;
  // Không hiển thị 100% khi vẫn còn một bước bắt buộc chưa được chốt.
  const completionPercent = allTrackedStagesCompleted ? 100 : Math.min(99, rawCompletionPercent);
  const updatedAt = new Date().toISOString();
  const finalExam = stepDetails.luyen_tap.finalExam;
  const finalExamSubmitted = ['submitted', 'auto_submitted', 'expired'].includes(String(finalExam?.status || ''));
  const sectionScores = {};
  const learningProcessScore = undefined;
  const finalQuizScore = finalExamSubmitted && Number.isFinite(Number(finalExam?.score)) ? Math.max(0, Math.min(10, Number(finalExam?.score))) : undefined;

  return sanitizeProgressRecord({
    ...record,
    step_details: stepDetails,
    completed_steps: completedSteps,
    completion_percent: completionPercent,
    status: allTrackedStagesCompleted ? 'completed' : completionPercent > 0 ? 'in_progress' : 'not_started',
    updated_at: updatedAt,
    quiz_total: quizTotal,
    quiz_answered: quizAnswered,
    quiz_correct: quizCorrect,
    quiz_percent: quizTotal > 0 ? Math.round((quizCorrect / quizTotal) * 100) : 0,
    section_scores: sectionScores,
    learning_process_score: learningProcessScore,
    final_quiz_score: finalQuizScore,
    assessment_score: record.assessment_score,
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
    case 'practice':
      return ['lessons', 'reviews'];
    case 'create_lesson':
      return ['lessons'];
    case 'learning':
    case 'arena':
      // V6.78.0: học sinh vẫn cần tiến độ cá nhân ngay khi mở thư viện.
      // Giáo viên/Admin không full-scan progress ở đây; Analytics sẽ query theo scope.
      return currentUser.vai_tro === 'student'
        ? ['lessons', 'reviews', 'progress']
        : ['lessons', 'reviews'];
    case 'analytics':
      return canManage ? ['accounts', 'lessons'] : ['lessons', 'progress'];
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
  const [lessonDeletingId, setLessonDeletingId] = useState('');
  const [lessonPurgeProgress, setLessonPurgeProgress] = useState<LessonPurgeProgressState | null>(null);
  const [lessonIntegrityRepairing, setLessonIntegrityRepairing] = useState(false);
  const [lessonLibraryView, setLessonLibraryView] = useState<'grid' | 'list'>('grid');
  const [lessonLibraryPage, setLessonLibraryPage] = useState(1);

  const [practiceSearch, setPracticeSearch] = useState('');
  const [practiceYearFilter, setPracticeYearFilter] = useState('Tất cả');
  const [practiceSemesterFilter, setPracticeSemesterFilter] = useState('Tất cả');
  const [practiceGradeFilter, setPracticeGradeFilter] = useState('Tất cả');
  const [practiceClassFilter, setPracticeClassFilter] = useState('Tất cả');
  const [practiceSubjectFilter, setPracticeSubjectFilter] = useState('Tất cả');
  const [practiceStatusFilter, setPracticeStatusFilter] = useState('Tất cả');

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
  const discovered = sortGrades(classes.map((item) => normalizeGradeValue(item.khoi)));
  const schoolGrades = discovered.length > 0 ? discovered : DEFAULT_ACTIVE_GRADES;
  if (!user || currentUserIsAdmin) return schoolGrades;
  if (user.vai_tro === 'teacher') {
    if (teacherManagesAllGrades(user)) return schoolGrades;
    const scope = getManagedGradeScope(user);
    return scope.length ? scope.filter((grade) => schoolGrades.includes(grade)) : (user.khoi ? [String(user.khoi)] : []);
  }
  if (user.khoi) return [String(user.khoi)];
  return schoolGrades;
}, [classes, user, currentUserIsAdmin]);

const classLabelById = useMemo(() => new Map(classes.map((item) => [item.lop_id, item.ten_lop || item.lop_id])), [classes]);

const accountClassFilterOptions = useMemo(() => {
  const source = classes
    .filter((item) => accountGradeFilter === 'Tất cả' || String(item.khoi || '') === accountGradeFilter)
    .sort((a, b) => String(a.ten_lop || '').localeCompare(String(b.ten_lop || ''), 'vi'));
  return source.map((item) => ({ value: item.lop_id, label: `${item.ten_lop || item.lop_id} • ${item.lop_id}` }));
}, [classes, accountGradeFilter]);

const practiceClassOptions = useMemo(() => classes
  .filter((item) => practiceGradeFilter === 'Tất cả' || String(item.khoi || '') === practiceGradeFilter)
  .sort((a, b) => String(a.ten_lop || a.lop_id).localeCompare(String(b.ten_lop || b.lop_id), 'vi'))
  .map((item) => ({ value: item.lop_id, label: item.ten_lop || item.lop_id })), [classes, practiceGradeFilter]);

useEffect(() => {
  if (practiceClassFilter === 'Tất cả') return;
  if (!practiceClassOptions.some((item) => item.value === practiceClassFilter)) setPracticeClassFilter('Tất cả');
}, [practiceClassFilter, practiceClassOptions]);

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
  const [lessonViewerMode, setLessonViewerMode] = useState<'official' | 'retake' | 'review'>('official');
  const [activeRetakeAttempt, setActiveRetakeAttempt] = useState<LessonRetakeAttempt | null>(null);
  const activeRetakeAttemptRef = useRef<LessonRetakeAttempt | null>(null);
  const retakeSaveTimerRef = useRef<number | null>(null);
  const [retakeChoiceLesson, setRetakeChoiceLesson] = useState<Lesson | null>(null);
  const [retakeHistory, setRetakeHistory] = useState<LessonRetakeAttempt[]>([]);
  const [lessonAccessModeUpdatingId, setLessonAccessModeUpdatingId] = useState('');
  const [selfStudyAccessLesson, setSelfStudyAccessLesson] = useState<Lesson | null>(null);
  const [selfStudySelectedClassIds, setSelfStudySelectedClassIds] = useState<string[]>([]);
  const [selfStudyAccessSaving, setSelfStudyAccessSaving] = useState(false);
  const [isPreLessonVideoOpen, setIsPreLessonVideoOpen] = useState(false);
  const [preLessonVideoLesson, setPreLessonVideoLesson] = useState<Lesson | null>(null);
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
  const [isInteractivePracticeImportOpen, setIsInteractivePracticeImportOpen] = useState(false);
  const [isInteractivePracticeViewerOpen, setIsInteractivePracticeViewerOpen] = useState(false);
  const [selectedInteractivePractice, setSelectedInteractivePractice] = useState<ReviewPracticeRow | null>(null);
  const [selectedInteractiveManifest, setSelectedInteractiveManifest] = useState<InteractivePracticeManifest | null>(null);
  const [selectedInteractiveAllowRetry, setSelectedInteractiveAllowRetry] = useState(true);
  const [selectedInteractiveConfig, setSelectedInteractiveConfig] = useState<ReviewPracticeConfig | undefined>(undefined);
  const [selectedInteractiveAttemptCount, setSelectedInteractiveAttemptCount] = useState(0);
  const [myReviewAttempts, setMyReviewAttempts] = useState<ReviewPracticeAttempt[]>([]);
  const [isPracticeSettingsOpen, setIsPracticeSettingsOpen] = useState(false);
  const [practiceSettingsReview, setPracticeSettingsReview] = useState<ReviewPracticeRow | null>(null);
  const [practiceSettingsConfig, setPracticeSettingsConfig] = useState<ReviewPracticeConfig | undefined>(undefined);
  const [pendingInteractivePractice, setPendingInteractivePractice] = useState<ReviewPracticeContentResponse | null>(null);
  const [activePracticeCoLearningSession, setActivePracticeCoLearningSession] = useState<CoLearningSession | null>(null);
  const [coLearningPurpose, setCoLearningPurpose] = useState<'lesson' | 'practice'>('lesson');

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
  const analyticsDefaultSubjectAppliedRef = useRef(false);
  const [analyticsSchoolYearFilter, setAnalyticsSchoolYearFilter] = useState(getComputedSchoolYear());
  const [isAnalyticsProgressLoading, setIsAnalyticsProgressLoading] = useState(false);
  const [analyticsProgressError, setAnalyticsProgressError] = useState('');
  const deadlineSyncSignatureRef = useRef('');

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

  useEffect(() => { activeRetakeAttemptRef.current = activeRetakeAttempt; }, [activeRetakeAttempt]);

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
          if (parsed) {
            if (isMounted) {
              setLoadingMessage('Đang khôi phục phiên đăng nhập...');
              setIsLoading(true);
            }
            // V6.78.0 chỉ khôi phục tự động phiên Firebase. Legacy token không còn
            // được lưu trên thiết bị để giảm rủi ro lộ thông tin phiên qua XSS.
            if (parsed.auth_provider !== 'firebase') {
              localStorage.removeItem('user');
              if (isMounted) setUser(null);
            } else {
              const firebaseUser = await waitForFirebaseUser();
              if (!firebaseUser) {
                localStorage.removeItem('user');
                if (isMounted) setUser(null);
              } else {
                const freshToken = await getFirebaseIdToken(false);
                const currentUserRes = await getCurrentUserApi(freshToken);
                if (currentUserRes.ok && currentUserRes.data) {
                  const restoredUser: User = {
                    ...parsed,
                    ...currentUserRes.data,
                    token: freshToken,
                  };
                  if (isMounted) {
                    setAIConfig({ apiKey: '', model: AI_MODELS[0] });
                    // Khôi phục đúng workspace theo vai trò trước khi setUser để tránh
                    // tải nhầm domain `learning` của giáo viên trong một nhịp render đầu.
                    setActiveMenu(restoredUser.vai_tro === 'admin' ? 'overview' : restoredUser.vai_tro === 'teacher' ? 'lessons' : 'learning');
                    setUser(restoredUser);
                  }
                  localStorage.setItem('user', JSON.stringify(serializeStoredUser(restoredUser)));
                } else {
                  localStorage.removeItem('user');
                }
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
    if (user.vai_tro === 'teacher' && !['lessons', 'arena', 'analytics', 'ai_config', 'profile'].includes(activeMenu)) return;
    if (user.vai_tro === 'admin' && activeMenu === 'learning') return;
    void loadMenuData(activeMenu);
  }, [activeMenu, user?.user_id, user?.vai_tro]);

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
    // V6.74.2: giáo viên luôn dùng đúng 5 màn hình chung với Admin.
    // Quyền admin ủy quyền chỉ mở rộng dữ liệu/thao tác, không mở thêm menu quản trị.
    if (user.vai_tro === 'teacher') {
      const teacherMenus = ['lessons', 'arena', 'analytics', 'ai_config', 'profile'];
      if (!teacherMenus.includes(activeMenu)) setActiveMenu('lessons');
      return;
    }
    if (user.vai_tro === 'admin' && activeMenu === 'learning') {
      setActiveMenu('analytics');
      return;
    }
    if (user.vai_tro === 'student' && ['my_lessons', 'create_lesson', 'lessons', 'approvals', 'accounts', 'classes', 'subjects', 'analytics', 'overview', 'video_config', 'school_years'].includes(activeMenu)) {
      setActiveMenu('learning');
    }
  }, [user?.vai_tro, user?.quyen_admin, activeMenu]);

  useEffect(() => {
    if (activeMenu !== 'analytics') {
      analyticsDefaultSubjectAppliedRef.current = false;
      return;
    }
    if (analyticsDefaultSubjectAppliedRef.current || !subjects.length) return;
    const tinHoc = subjects.find((item) => String(item.ten_mon || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') === 'tin hoc');
    if (tinHoc?.mon_id) setAnalyticsSubjectFilter(tinHoc.mon_id);
    analyticsDefaultSubjectAppliedRef.current = true;
  }, [activeMenu, subjects]);

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
  // Nếu giáo viên khóa bài, viewer đóng ngay và Rules hiện hành đồng thời chặn đọc content.
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
        const latestAccessMode = latest.access_mode === 'self_study' ? 'self_study' : 'teacher_controlled';
        const accessModeChanged = (selectedLesson.access_mode === 'self_study' ? 'self_study' : 'teacher_controlled') !== latestAccessMode;
        setLessonRows((current) => current.map((item) => item.lesson_id === latest.lesson_id ? { ...item, ...latest } : item));
        setSelectedLesson((current) => current?.lesson_id === latest.lesson_id ? {
          ...current,
          is_locked: latest.is_locked,
          access_mode: latestAccessMode,
          allow_retake_after_completion: latest.allow_retake_after_completion === true,
          locked_at: latest.locked_at,
          locked_by_uid: latest.locked_by_uid,
          locked_by_name: latest.locked_by_name,
        } : current);
        // V6.80.0: đổi teacher-controlled <-> self-study phải có hiệu lực ngay
        // với học sinh đang mở Viewer, không bắt buộc đóng/mở lại bài.
        if (accessModeChanged && latest.is_locked !== true) {
          void getLessonContentApi(user.token, latest.lesson_id).then(async (res) => {
            if (!res.ok || !res.data?.content) return;
            const { normalizeLessonContent } = await import('./services/gemini');
            setSelectedLessonContent(normalizeLessonContent(res.data.content));
          });
        }
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
  }, [user?.user_id, user?.vai_tro, user?.token, isLessonViewerOpen, selectedLesson?.lesson_id, selectedLesson?.access_mode]);

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
        const pendingProgress = user.vai_tro === 'student' ? readPendingLearningProgress(user.user_id) : [];
        const mergedLocalProgress = mergeProgressCollections(cachedProgress, pendingProgress);
        const mergedItems = mergeProgressCollections(remoteItems, mergedLocalProgress);
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

  const analyticsHasServerScope = analyticsLessonFilter !== 'Tất cả'
    || analyticsClassFilter !== 'Tất cả'
    || analyticsGradeFilter !== 'Tất cả';

  const loadScopedAnalyticsProgress = useCallback(async () => {
    if (!user || user.vai_tro === 'student') return;
    if (!analyticsHasServerScope) {
      setProgressRecordsSync([]);
      setIsAnalyticsProgressLoading(false);
      return;
    }

    const payload: Record<string, unknown> = {};
    if (analyticsLessonFilter !== 'Tất cả') payload.lesson_id = analyticsLessonFilter;
    if (analyticsClassFilter !== 'Tất cả') payload.lop_id = analyticsClassFilter;
    if (analyticsGradeFilter !== 'Tất cả') payload.khoi = analyticsGradeFilter;

    setIsAnalyticsProgressLoading(true);
    try {
      const res = await listLearningProgressApi(user.token, payload);
      if (!res.ok) throw new Error(res.message || 'Không tải được tiến trình theo phạm vi đã chọn.');
      const scoped = (res.data?.items || [])
        .map((item) => sanitizeProgressRecord(item))
        .filter(Boolean) as LessonProgressRecord[];
      setProgressRecordsSync(scoped);
      setAnalyticsProgressError('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Không tải được tiến trình theo phạm vi đã chọn.';
      setAnalyticsProgressError(message);
      if (!handleSessionError(message)) showToast(message, 'error');
      // Giữ dữ liệu gần nhất thay vì biến lỗi Firestore thành 0%.
    } finally {
      setIsAnalyticsProgressLoading(false);
    }
  }, [user?.user_id, user?.token, user?.vai_tro, analyticsHasServerScope, analyticsLessonFilter, analyticsClassFilter, analyticsGradeFilter, setProgressRecordsSync]);

  useEffect(() => {
    if (!user || user.vai_tro === 'student') return;
    if (activeMenu !== 'analytics' && activeMenu !== 'learning') return;
    void loadScopedAnalyticsProgress();
  }, [activeMenu, user?.user_id, user?.vai_tro, loadScopedAnalyticsProgress]);

  // preLessonProgress là collection riêng nên listener learningProgress không
  // nhận thay đổi video. Chỉ refresh phạm vi giáo viên đang xem mỗi 60 giây.
  useEffect(() => {
    if (!user || user.vai_tro === 'student' || activeMenu !== 'analytics' || !analyticsHasServerScope) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadScopedAnalyticsProgress();
    }, 60000);
    return () => window.clearInterval(timer);
  }, [activeMenu, user?.user_id, user?.vai_tro, analyticsHasServerScope, loadScopedAnalyticsProgress]);


  // V6.88.3: preparationSubmissions là nguồn sự thật độc lập với learningProgress.
  // Khi học sinh bấm Gửi kết quả, listener này reload ngay phạm vi analytics đang mở.
  useEffect(() => {
    if (!user || user.vai_tro === 'student' || activeMenu !== 'analytics' || !analyticsHasServerScope) return;
    const payload: Record<string, unknown> = {};
    if (analyticsLessonFilter !== 'Tất cả') payload.lesson_id = analyticsLessonFilter;
    if (analyticsClassFilter !== 'Tất cả') payload.lop_id = analyticsClassFilter;
    if (analyticsGradeFilter !== 'Tất cả') payload.khoi = analyticsGradeFilter;
    return subscribeFirebasePreLessonSubmissionChanges(payload, () => {
      if (document.visibilityState === 'visible') void loadScopedAnalyticsProgress();
    }, (error) => {
      console.warn('Realtime preparation submission listener failed:', error);
      setAnalyticsProgressError('Không thể theo dõi realtime kết quả chuẩn bị bài. Dữ liệu gần nhất vẫn được giữ.');
    });
  }, [activeMenu, user?.user_id, user?.vai_tro, analyticsHasServerScope, analyticsLessonFilter, analyticsClassFilter, analyticsGradeFilter, loadScopedAnalyticsProgress]);

  useEffect(() => {
    if (!user || user.vai_tro === 'student') return;
    if (activeMenu !== 'analytics' && activeMenu !== 'learning') return;
    if (!analyticsHasServerScope) return;
    const payload: Record<string, unknown> = {};
    if (analyticsLessonFilter !== 'Tất cả') payload.lesson_id = analyticsLessonFilter;
    if (analyticsClassFilter !== 'Tất cả') payload.lop_id = analyticsClassFilter;
    if (analyticsGradeFilter !== 'Tất cả') payload.khoi = analyticsGradeFilter;
    const unsubscribe = subscribeFirebaseLearningProgress(payload, (liveItems) => {
      const normalized = liveItems.map((item) => sanitizeProgressRecord(item)).filter(Boolean) as LessonProgressRecord[];
      setProgressRecordsSync((current) => {
        const currentById = new Map<string, LessonProgressRecord>(current.map((item) => [item.progress_id, item] as [string, LessonProgressRecord]));
        const currentPreOnly = current.filter((item) => item.progress_id.startsWith('PRE_'));
        const mergedLive = normalized.map((item) => ({ ...(currentById.get(item.progress_id) || {}), ...item } as LessonProgressRecord));
        const realKeys = new Set(mergedLive.map((item) => `${item.user_id}__${item.lesson_id}`));
        const retainedPreOnly = currentPreOnly.filter((item) => !realKeys.has(`${item.user_id}__${item.lesson_id}`));
        return [...mergedLive, ...retainedPreOnly];
      });
    }, (error) => {
      console.warn('Realtime analytics progress listener failed:', error);
    });
    return unsubscribe;
  }, [activeMenu, user?.user_id, user?.vai_tro, analyticsHasServerScope, analyticsLessonFilter, analyticsClassFilter, analyticsGradeFilter, setProgressRecordsSync]);

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
        const inManagedGrade = canManageGrade(user, lesson.khoi);
        return inManagedGrade && (isOwner || lesson.trang_thai === 'approved_shared');
      }
      const sameGrade = !lesson.khoi || !user.khoi || String(lesson.khoi) === String(user.khoi);
      const classMatches = !lesson.lop_id || !user.lop_id || lesson.lop_id === user.lop_id;
      const isSharedForStudent = lesson.trang_thai === 'approved_shared' && sameGrade && classMatches;
      return isSharedForStudent;
    });
  }, [lessons, user, currentUserIsAdmin]);

  const lessonSourcePool = useMemo(() => {
    if (!currentUserIsAdmin && ['learning', 'lessons', 'arena', 'my_lessons', 'create_lesson', 'analytics'].includes(activeMenu)) {
      return visibleLessonsForCurrentUser;
    }
    return lessons;
  }, [currentUserIsAdmin, activeMenu, visibleLessonsForCurrentUser, lessons]);

  useEffect(() => {
    if (!user || user.vai_tro === 'student' || activeMenu !== 'analytics') return;
    if (analyticsSubjectFilter === 'Tất cả') return;
    if (analyticsGradeFilter === 'Tất cả' && analyticsClassFilter === 'Tất cả') return;
    const signature = [analyticsSchoolYearFilter, analyticsSemesterFilter, analyticsGradeFilter, analyticsClassFilter, analyticsSubjectFilter].join('|');
    if (deadlineSyncSignatureRef.current === signature) return;
    const timer = window.setTimeout(async () => {
      const subject = subjects.find((item) => String(item.mon_id) === String(analyticsSubjectFilter));
      const scoped = lessonSourcePool.filter((lesson) => {
        const subjectMatch = String(lesson.mon_id) === String(analyticsSubjectFilter) || String(lesson.mon_hoc) === String(subject?.ten_mon || analyticsSubjectFilter);
        const yearMatch = !lesson.nam_hoc || String(lesson.nam_hoc) === String(analyticsSchoolYearFilter);
        const semesterMatch = analyticsSemesterFilter === 'ALL' || !lesson.hoc_ky || String(lesson.hoc_ky) === String(analyticsSemesterFilter);
        const gradeMatch = analyticsGradeFilter === 'Tất cả' || String(lesson.khoi) === String(analyticsGradeFilter);
        const classMatch = analyticsClassFilter === 'Tất cả' || !lesson.lop_id || String(lesson.lop_id) === String(analyticsClassFilter);
        return subjectMatch && yearMatch && semesterMatch && gradeMatch && classMatch;
      });
      const scopedStudents = accounts.filter((item) => item.vai_tro === 'student'
        && (analyticsGradeFilter === 'Tất cả' || String(item.khoi) === String(analyticsGradeFilter))
        && (analyticsClassFilter === 'Tất cả' || String(item.lop_id) === String(analyticsClassFilter)));
      if (!scoped.length || !scopedStudents.length) { deadlineSyncSignatureRef.current = signature; return; }
      const res = await finalizeDeadlineZerosApi(user.token, scoped, scopedStudents);
      if (res.ok) {
        deadlineSyncSignatureRef.current = signature;
        if (Number(res.data?.finalized || 0) > 0) await loadScopedAnalyticsProgress();
      }
    }, 700);
    return () => window.clearTimeout(timer);
  }, [user?.user_id, user?.vai_tro, activeMenu, analyticsSchoolYearFilter, analyticsSemesterFilter, analyticsGradeFilter, analyticsClassFilter, analyticsSubjectFilter, lessonSourcePool, accounts, subjects, loadScopedAnalyticsProgress]);

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
      const matchesStatus = lessonStatusFilter === 'Tất cả' ? lesson.trang_thai !== 'archived' : lesson.trang_thai === lessonStatusFilter;
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
      if (!currentUserIsAdmin && user.vai_tro === 'teacher') {
        if (!canManageGrade(user, review.khoi)) return false;
        if (review.nguoi_tao_id && review.nguoi_tao_id !== user.user_id && review.pham_vi !== 'shared') return false;
      }
      if (user.vai_tro === 'student') {
        const sameGrade = !review.khoi || !user.khoi || String(review.khoi) === String(user.khoi);
        const targetClasses = Array.isArray(review.target_class_ids) ? review.target_class_ids : [];
        const sameClass = targetClasses.length
          ? Boolean(user.lop_id && targetClasses.includes(user.lop_id))
          : (!review.lop_id || !user.lop_id || review.lop_id === user.lop_id);
        if (!sameGrade || !sameClass || String(review.trang_thai || 'active') !== 'active') return false;
      }
      const practiceView = activeMenu === 'practice';
      const matchesSearch = practiceView || !lessonSearch || normalizeText(review.tieu_de).includes(normalizeText(lessonSearch)) || normalizeText(review.source_lesson_titles).includes(normalizeText(lessonSearch));
      const subjectName = subjects.find((item) => item.mon_id === review.mon_id)?.ten_mon || review.mon_hoc || review.mon_id;
      const matchesSubject = practiceView || lessonSubjectFilter === 'Tất cả' || subjectName === lessonSubjectFilter;
      const matchesGrade = practiceView || lessonGradeFilter === 'Tất cả'
        || String(review.khoi) === lessonGradeFilter
        || (user.vai_tro === 'student' && !review.khoi);
      const matchesScope = practiceView || lessonScopeFilter === 'Tất cả' || review.pham_vi === lessonScopeFilter;
      return matchesSearch && matchesSubject && matchesGrade && matchesScope;
    });
  }, [reviewPractices, user, currentUserIsAdmin, activeMenu, lessonSearch, lessonSubjectFilter, lessonGradeFilter, lessonScopeFilter, subjects]);

  const interactivePractices = useMemo(() => visibleReviewPractices.filter((review) => {
    if (!(review.source_type === 'interactive_html' || review.loai_on_tap === 'interactive_file')) return false;
    const subjectName = subjects.find((item) => item.mon_id === review.mon_id)?.ten_mon || review.mon_hoc || review.mon_id || '';
    const classIds = Array.isArray(review.target_class_ids) ? review.target_class_ids : [];
    const config = resolvePracticeConfig(review, undefined);
    const access = practiceClassFilter === 'Tất cả' ? null : getPracticeAccessState(review, config, practiceClassFilter, 0);
    const now = Date.now();
    const startMs = config.available_from ? new Date(config.available_from).getTime() : NaN;
    const endMs = config.available_until ? new Date(config.available_until).getTime() : NaN;
    const aggregateStatus = String(review.trang_thai || 'active') !== 'active' ? 'draft'
      : Number.isFinite(startMs) && now < startMs ? 'scheduled'
      : Number.isFinite(endMs) && now > endMs ? 'closed'
      : config.locked_class_ids.length && config.target_class_ids.length && config.locked_class_ids.length >= config.target_class_ids.length ? 'locked'
      : 'open';
    const matchesSearch = !practiceSearch || normalizeText(review.tieu_de).includes(normalizeText(practiceSearch)) || normalizeText(review.source_lesson_titles).includes(normalizeText(practiceSearch)) || normalizeText(review.source_file_name).includes(normalizeText(practiceSearch));
    const matchesYear = practiceYearFilter === 'Tất cả' || String(review.nam_hoc || '') === practiceYearFilter;
    const matchesSemester = practiceSemesterFilter === 'Tất cả' || String(review.hoc_ky || '') === practiceSemesterFilter;
    const matchesGrade = practiceGradeFilter === 'Tất cả' || String(review.khoi || '') === practiceGradeFilter;
    const matchesClass = practiceClassFilter === 'Tất cả' || !classIds.length || classIds.includes(practiceClassFilter);
    const matchesSubject = practiceSubjectFilter === 'Tất cả' || subjectName === practiceSubjectFilter;
    const statusKey = access?.key || aggregateStatus;
    const matchesStatus = practiceStatusFilter === 'Tất cả'
      || practiceStatusFilter === statusKey
      || (practiceStatusFilter === 'draft' && String(review.trang_thai || '') !== 'active');
    return matchesSearch && matchesYear && matchesSemester && matchesGrade && matchesClass && matchesSubject && matchesStatus;
  }), [visibleReviewPractices, subjects, practiceSearch, practiceYearFilter, practiceSemesterFilter, practiceGradeFilter, practiceClassFilter, practiceSubjectFilter, practiceStatusFilter]);
  const standardReviewPractices = useMemo(() => visibleReviewPractices.filter((review) => review.source_type !== 'interactive_html' && review.loai_on_tap !== 'interactive_file'), [visibleReviewPractices]);


  useEffect(() => {
    if (!user || user.vai_tro !== 'student' || activeMenu !== 'practice') return;
    let cancelled = false;
    void listMyReviewAttemptsApi(user.token).then((res) => {
      if (!cancelled && res.ok) setMyReviewAttempts(res.data?.items || []);
    });
    return () => { cancelled = true; };
  }, [user?.user_id, user?.token, activeMenu]);

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
          official_retake_remaining: record.official_retake_remaining,
          official_retake_grant_id: record.official_retake_grant_id,
          official_retake_count: record.official_retake_count,
          previous_official_score: record.previous_official_score,
          score_reason: record.score_reason,
          deadline_status: record.deadline_status,
          deadline_finalized_at: record.deadline_finalized_at,
          study_mode: record.study_mode,
          co_learning_session_id: record.co_learning_session_id,
          co_learner_ids: record.co_learner_ids,
          co_learner_user_ids: record.co_learner_user_ids,
          co_learner_names: record.co_learner_names,
          invalidated_reason: record.invalidated_reason,
          invalidated_at: record.invalidated_at,
          invalidated_by_name: record.invalidated_by_name,
          last_stage: record.last_stage,
          pre_lesson_status: record.pre_lesson_status,
          pre_lesson_watch_percent: record.pre_lesson_watch_percent,
          pre_lesson_watched_seconds: record.pre_lesson_watched_seconds,
          pre_lesson_completed_at: record.pre_lesson_completed_at,
          pre_lesson_completed_before_deadline: record.pre_lesson_completed_before_deadline,
          pre_lesson_preparation_status: record.pre_lesson_preparation_status,
          preparation_score: record.preparation_score,
          preparation_weight: record.preparation_weight,
          learning_process_score: record.learning_process_score,
          final_quiz_score: record.final_quiz_score,
          current_score: record.current_score,
          score_status: record.score_status,
          score_model_version: record.score_model_version,
          scored_section_count: record.scored_section_count,
          scorable_section_count: record.scorable_section_count,
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
    await loadScopedAnalyticsProgress();
    showToast(res.message || 'Đã xử lý kết quả học tập.', 'success');
    return true;
  }, [user, loadScopedAnalyticsProgress]);

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
      const matchesGrade = accountGradeFilter === 'Tất cả'
        || (item.vai_tro === 'teacher' ? canManageGrade(item, accountGradeFilter) : item.khoi === accountGradeFilter);
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
    localStorage.setItem('user', JSON.stringify(serializeStoredUser(userData)));
    // Giáo viên vào thẳng màn hình Bài học dùng chung giao diện quản lý với Admin.
    // Kể cả giáo viên có quyen_admin vẫn giữ workspace nghiệp vụ dành cho giáo viên.
    setActiveMenu(userData.vai_tro === 'admin' ? 'overview' : userData.vai_tro === 'teacher' ? 'lessons' : 'learning');
  };

  const openProfileModal = async () => {
    if (!user) return;
    // Học sinh chỉ được xem khối/lớp hiện tại; không cần tải danh sách lớp để chỉnh sửa.
    // Các vai trò khác vẫn dùng danh mục lớp hiện có khi mở hồ sơ.
    setProfileClasses(classes);
    setIsProfileModalOpen(true);
  };

  const handleProfileSubmit = async (payload: { ho_ten: string; khoi?: string; lop_id?: string; mat_khau?: string }) => {
    if (!user) return;
    const isStudentProfile = user.vai_tro === 'student';
    const hasManagedAssignment = user.vai_tro === 'student' || user.vai_tro === 'teacher';
    const safePayload = hasManagedAssignment
      ? { ho_ten: payload.ho_ten, mat_khau: payload.mat_khau }
      : payload;
    setIsSubmitting(true);
    let updatedUser: User;
    try {
      updatedUser = await withLoading('Đang cập nhật hồ sơ cá nhân...', async () => {
        if (user.auth_provider === 'firebase') {
          if (safePayload.mat_khau) await updateOwnFirebasePassword(safePayload.mat_khau);
          await updateOwnFirebaseMemberProfile(hasManagedAssignment
            ? { displayName: safePayload.ho_ten }
            : {
                displayName: safePayload.ho_ten,
                grade: payload.khoi,
                classId: payload.lop_id,
              });
          clearFirebaseIdentityCache();
          return {
            ...user,
            ho_ten: safePayload.ho_ten,
            ...(hasManagedAssignment ? {} : {
              khoi: payload.khoi || '',
              lop_id: payload.lop_id || '',
            }),
          };
        }
        const res = await updateProfileApi(user.token, safePayload as Record<string, unknown>);
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
    localStorage.setItem('user', JSON.stringify(serializeStoredUser(updatedUser)));
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

  const handleRunSystemDiagnostics = useCallback(async () => {
    if (!user?.token || !currentUserIsAdmin) return;
    setIsSubmitting(true);
    try {
      const res = await getSystemDiagnosticsApi(user.token);
      if (!res.ok || !res.data) throw new Error(res.message || 'Không quét được dữ liệu hỗ trợ hệ thống.');
      setSystemDiagnostics(res.data);
      showToast(res.data.summary.total_issues > 0
        ? `Đã quét xong: có ${res.data.summary.total_issues} vấn đề cần rà soát.`
        : 'Đã quét xong. Không phát hiện lỗi chéo trong dữ liệu hỗ trợ.',
        res.data.summary.total_issues > 0 ? 'info' : 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Không quét được dữ liệu hỗ trợ hệ thống.';
      if (!handleSessionError(message)) showToast(message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  }, [user?.token, currentUserIsAdmin]);

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

  const handleSaveAIConfig = async (config: AIConfig): Promise<boolean> => {
    const normalizedAccountConfig = sanitizeStoredAIConfig(config);

    if (!user) {
      setAIConfig(normalizedAccountConfig);
      return true;
    }

    const res = await saveUserConfigApi(user.token, normalizedAccountConfig);
    if (!res.ok || !res.data) {
      if (!handleSessionError(res.message)) showToast(res.message || 'Không lưu được cấu hình AI.', 'error');
      return false;
    }

    const nextConfig = sanitizeStoredAIConfig(res.data);
    setAIConfig(nextConfig);
    localStorage.removeItem('aiConfig');
    showToast('Đã lưu cấu hình AI theo tài khoản. Bạn có thể tiếp tục chức năng đang mở.', 'success');
    return true;
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

  const persistProgressRecord = useCallback(async (record: LessonProgressRecord, silent = true): Promise<boolean> => {
    if (!user || user.vai_tro !== 'student') return false;
    const activeSessionMatches = activeCoLearningSession && activeCoLearningSession.lesson_id === record.lesson_id;
    const queuedCoLearningRecord = record.study_mode === 'co_learning' && Boolean(String(record.co_learning_session_id || '').trim());
    // V6.84.1: tiến trình của học sinh phải luôn mang lớp/khối của tài khoản hiện tại.
    // Bài dùng chung theo khối thường có lesson.lop_id trống; nếu giữ giá trị đó thì
    // bảng Theo dõi lọc theo lớp sẽ không nhận được kết quả vừa nộp.
    const scopedRecord: LessonProgressRecord = {
      ...record,
      khoi: String(user.khoi || record.khoi || selectedLesson?.khoi || '').trim(),
      lop_id: String(user.lop_id || record.lop_id || '').trim(),
    };
    const payload: LessonProgressRecord = activeSessionMatches
      ? {
          ...scopedRecord,
          study_mode: 'co_learning',
          co_learning_session_id: activeCoLearningSession.co_learning_session_id,
          co_learner_ids: getCoLearningSessionUserIds(activeCoLearningSession).join(','),
          co_learner_user_ids: getCoLearningSessionUserIds(activeCoLearningSession),
          co_learner_names: getCoLearningSessionNames(activeCoLearningSession),
          result_group_id: activeCoLearningSession.co_learning_session_id,
        }
      : queuedCoLearningRecord
        ? { ...scopedRecord }
        : { ...scopedRecord, study_mode: 'single', co_learning_session_id: '', co_learner_ids: '', co_learner_user_ids: [], co_learner_names: [], result_group_id: `${record.user_id}_${record.lesson_id}` };
    const res = await saveLearningProgressApi(user.token, payload);
    if (!res.ok) {
      queuePendingLearningProgress(user.user_id, payload);
      setProgressRecordsSync((current) => current.map((item) => item.progress_id === record.progress_id ? { ...item, ...payload, save_state: 'save_failed' } : item));
      if (!silent && !handleSessionError(res.message)) showToast(res.message || 'Không lưu được tiến trình học lên hệ thống.', 'error');
      return false;
    }
    removePendingLearningProgress(user.user_id, record.progress_id);
    delete progressPendingRecordsRef.current[record.progress_id];
    if (res.data) {
      const saved = sanitizeProgressRecord({ ...res.data, save_state: 'saved' })!;
      setProgressRecordsSync((current) => mergeProgressCollections(current.filter((item) => item.progress_id !== saved.progress_id), [saved]));
    } else {
      setProgressRecordsSync((current) => current.map((item) => item.progress_id === record.progress_id ? { ...item, ...payload, save_state: 'saved' } : item));
    }
    return true;
  }, [user, selectedLesson, activeCoLearningSession]);

  useEffect(() => {
    if (!user || user.vai_tro !== 'student') return;
    let cancelled = false;
    let retrying = false;
    const retryStoredProgress = async () => {
      if (cancelled || retrying || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;
      const pending = readPendingLearningProgress(user.user_id);
      if (!pending.length) return;
      retrying = true;
      try {
        for (const record of pending) {
          if (cancelled) break;
          const ok = await persistProgressRecord({ ...record, save_state: 'saving' }, true);
          if (!ok && typeof navigator !== 'undefined' && navigator.onLine === false) break;
        }
      } finally {
        retrying = false;
      }
    };
    void retryStoredProgress();
    window.addEventListener('online', retryStoredProgress);
    const retryTimer = window.setInterval(() => { void retryStoredProgress(); }, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(retryTimer);
      window.removeEventListener('online', retryStoredProgress);
    };
  }, [user?.user_id, user?.vai_tro, persistProgressRecord]);

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

  const persistActiveRetake = useCallback(async (attempt: LessonRetakeAttempt, silent = false) => {
    if (!user || user.vai_tro !== 'student') return false;
    const res = await saveLessonRetakeApi(user.token, attempt);
    if (!res.ok || !res.data) {
      if (!silent && !handleSessionError(res.message)) showToast(res.message || 'Không lưu được phiên học lại.', 'error');
      return false;
    }
    setActiveRetakeAttempt(res.data);
    activeRetakeAttemptRef.current = res.data;
    return true;
  }, [user]);

  const applyProgressUpdate = useCallback((lesson: Lesson, updater: (record: LessonProgressRecord) => LessonProgressRecord | null) => {
    if (!user || user.vai_tro !== 'student') return;
    if (lessonViewerMode === 'review') return;
    if (lessonViewerMode === 'retake' && activeRetakeAttemptRef.current?.lesson_id === lesson.lesson_id) {
      const attempt = activeRetakeAttemptRef.current;
      const existing = sanitizeProgressRecord(attempt.progress) || createEmptyProgressRecord(user.user_id, lesson);
      const cloned: LessonProgressRecord = { ...existing, step_details: JSON.parse(JSON.stringify(existing.step_details)) };
      const updated = updater(cloned);
      if (!updated) return;
      const recomputedRecord = recomputeProgress(updated);
      const assessmentConfig = selectedLessonContent?.assessment as any;
      const learningWeight = Number(assessmentConfig?.learning_process_weight ?? assessmentConfig?.interactive_weight ?? selectedLessonContent?.settings?.interactive_weight ?? 40);
      const finalWeight = Number(assessmentConfig?.final_quiz_weight ?? selectedLessonContent?.settings?.final_quiz_weight ?? 60);
      const liveSectionProgress = recomputedRecord.step_details?.luyen_tap?.sectionProgress || {};
      const contentFinalQuizExists = Number(selectedLessonContent?.final_quiz?.length || 0) > 0;
      const recordFinalQuizExists = Number(recomputedRecord.step_details?.luyen_tap?.finalExam?.total_count || 0) > 0;
      const nextProgress = applyProgressScoreModelV3(recomputedRecord, {
        learningWeight,
        finalWeight,
        finalQuizExists: contentFinalQuizExists || recordFinalQuizExists,
        allRequiredSectionsCompleted: Object.values(liveSectionProgress).every((item) => item.status === 'completed'),
      });
      const nextAttempt: LessonRetakeAttempt = { ...attempt, progress: nextProgress, completion_percent: nextProgress.completion_percent, score_status: nextProgress.score_status, reference_score: nextProgress.score_status === 'finalized' ? nextProgress.assessment_score : nextProgress.current_score, updated_at: new Date().toISOString() };
      setActiveRetakeAttempt(nextAttempt);
      activeRetakeAttemptRef.current = nextAttempt;
      if (retakeSaveTimerRef.current) window.clearTimeout(retakeSaveTimerRef.current);
      const checkpoint = nextProgress.status === 'completed' || nextProgress.completed_steps > existing.completed_steps;
      retakeSaveTimerRef.current = window.setTimeout(() => { retakeSaveTimerRef.current = null; void persistActiveRetake(nextAttempt, true); }, checkpoint ? 500 : 30000);
      return;
    }
    const currentItems = progressRecordsRef.current;
    const existing = sanitizeProgressRecord(currentItems.find((item) => item.progress_id === `${user.user_id}_${lesson.lesson_id}`)) || createEmptyProgressRecord(user.user_id, lesson);
    const cloned: LessonProgressRecord = {
      ...existing,
      step_details: JSON.parse(JSON.stringify(existing.step_details)),
    };
    const updated = updater(cloned);
    if (!updated) return;
    const recomputedRecord = recomputeProgress(updated);
    const assessmentConfig = selectedLessonContent?.assessment as any;
    const learningWeight = Number(assessmentConfig?.learning_process_weight ?? assessmentConfig?.interactive_weight ?? selectedLessonContent?.settings?.interactive_weight ?? 40);
    const finalWeight = Number(assessmentConfig?.final_quiz_weight ?? selectedLessonContent?.settings?.final_quiz_weight ?? 60);
    const liveSectionProgress = recomputedRecord.step_details?.luyen_tap?.sectionProgress || {};
    const contentFinalQuizExists = Number(selectedLessonContent?.final_quiz?.length || 0) > 0;
    const recordFinalQuizExists = Number(recomputedRecord.step_details?.luyen_tap?.finalExam?.total_count || 0) > 0;
    const isLegacyFinalizedResult = Number(existing.score_model_version || 0) < 4
      && existing.status === 'completed'
      && Number.isFinite(Number(existing.assessment_score));
    // Không tự viết lại điểm lịch sử V6.78.x chỉ vì học sinh mở lại bài để xem.
    // Kết quả đã chốt bằng Score Model cũ được giữ nguyên; chỉ lượt học/thi mới dùng V4.
    const baseRecord = isLegacyFinalizedResult
      ? { ...recomputedRecord, assessment_score: existing.assessment_score, current_score: existing.current_score, final_quiz_score: existing.final_quiz_score, learning_process_score: existing.learning_process_score, section_scores: existing.section_scores, score_status: existing.score_status, score_model_version: existing.score_model_version }
      : applyProgressScoreModelV3(recomputedRecord, {
          learningWeight,
          finalWeight,
          finalQuizExists: contentFinalQuizExists || recordFinalQuizExists,
          allRequiredSectionsCompleted: Object.values(liveSectionProgress).every((item) => item.status === 'completed'),
        });
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
    }, isCheckpoint ? 400 : 30000);
  }, [user, activeCoLearningSession, selectedLessonContent, persistProgressRecord, setProgressRecordsSync, lessonViewerMode, persistActiveRetake]);

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

  const handleLessonViewerFinalExamSubmit = useCallback(async (snapshot: LessonCloseSnapshot) => {
    if (!user || user.vai_tro !== 'student' || !selectedLesson) return false;
    if (lessonViewerMode === 'review') return true;

    const assessmentConfig = selectedLessonContent?.assessment as any;
    const learningWeight = Number(assessmentConfig?.learning_process_weight ?? assessmentConfig?.interactive_weight ?? selectedLessonContent?.settings?.interactive_weight ?? 40);
    const finalWeight = Number(assessmentConfig?.final_quiz_weight ?? selectedLessonContent?.settings?.final_quiz_weight ?? 60);

    // Học lại: chấm ngay khi Nộp bài nhưng chỉ lưu vào retakes, tuyệt đối không
    // chạm vào learningProgress chính thức.
    if (lessonViewerMode === 'retake' && activeRetakeAttemptRef.current) {
      if (retakeSaveTimerRef.current) { window.clearTimeout(retakeSaveTimerRef.current); retakeSaveTimerRef.current = null; }
      const attempt = activeRetakeAttemptRef.current;
      const existing = sanitizeProgressRecord(attempt.progress) || createEmptyProgressRecord(user.user_id, selectedLesson);
      const record: LessonProgressRecord = { ...existing, step_details: JSON.parse(JSON.stringify(existing.step_details || {})) };
      const detail = record.step_details.luyen_tap || createEmptyStepDetail();
      record.step_details.luyen_tap = {
        ...detail,
        opened: true,
        quizAnswered: snapshot.answered,
        quizCorrect: snapshot.correct,
        quizTotal: snapshot.total,
        quizAnswers: snapshot.answers,
        sectionProgress: snapshot.sectionProgress,
        finalExam: snapshot.finalExam || detail.finalExam,
        lastVisitedAt: new Date().toISOString(),
      };
      const recomputed = recomputeProgress(record);
      const finalQuizExists = Number(selectedLessonContent?.final_quiz?.length || 0) > 0 || Number(snapshot.finalExam?.total_count || 0) > 0;
      const scored = applyProgressScoreModelV3(recomputed, {
        learningWeight,
        finalWeight,
        finalQuizExists,
        allRequiredSectionsCompleted: Object.values(snapshot.sectionProgress || {}).every((item) => item.status === 'completed'),
      });
      const finalAttempt: LessonRetakeAttempt = {
        ...attempt,
        progress: scored,
        completion_percent: scored.completion_percent,
        score_status: scored.score_status,
        reference_score: scored.score_status === 'finalized' ? scored.assessment_score : scored.current_score,
        status: scored.score_status === 'finalized' ? 'completed' : 'in_progress',
        completed_at: scored.score_status === 'finalized' ? new Date().toISOString() : attempt.completed_at,
        updated_at: new Date().toISOString(),
      };
      setActiveRetakeAttempt(finalAttempt);
      activeRetakeAttemptRef.current = finalAttempt;
      const saved = await persistActiveRetake(finalAttempt, false);
      if (!saved) return false;
      const officialUpdate = finalAttempt.is_official === true || finalAttempt.retake_mode === 'official_update';
      if (officialUpdate) {
        const promoted = await finalizeOfficialLessonRetakeApi(user.token, finalAttempt);
        if (!promoted.ok || !promoted.data) {
          if (!handleSessionError(promoted.message)) showToast(promoted.message || 'Đã lưu lượt học lại nhưng chưa cập nhật được điểm chính thức.', 'error');
          return false;
        }
        const official = sanitizeProgressRecord(promoted.data);
        if (official) setProgressRecordsSync((current) => mergeProgressCollections(current.filter((item) => item.progress_id !== official.progress_id), [official]));
        showToast(`Đã cập nhật điểm chính thức thành ${Number(promoted.data.assessment_score || 0).toFixed(1)}/10. Điểm cũ được giữ trong lịch sử.`, 'success');
        return true;
      }
      showToast(`Đã lưu điểm học lại tham khảo ${Number(finalAttempt.reference_score || 0).toFixed(1)}/10. Điểm chính thức không thay đổi.`, 'success');
      return true;
    }

    const progressId = `${user.user_id}_${selectedLesson.lesson_id}`;
    if (progressSaveTimersRef.current[progressId]) {
      window.clearTimeout(progressSaveTimersRef.current[progressId]);
      delete progressSaveTimersRef.current[progressId];
    }
    const existing = sanitizeProgressRecord(progressRecordsRef.current.find((item) => item.progress_id === progressId)) || createEmptyProgressRecord(user.user_id, selectedLesson);
    // V6.84.1: không ghi đè kết quả chính thức đã nộp trước đó. Riêng điểm 0
    // được hệ thống tự chốt vì quá hạn có thể được thay thế khi bài cho phép nộp
    // sau hạn; trước đây guard này trả true quá sớm nên học sinh nộp xong nhưng
    // bảng Theo dõi vẫn giữ 0.
    const hasFinalizedOfficialScore = existing.score_status === 'finalized'
      && Number.isFinite(Number(existing.assessment_score));
    const deadlineMs = Date.parse(String(selectedLesson.thoi_gian_ket_thuc || ''));
    const finalAttemptStartedMs = Date.parse(String(snapshot.finalExam?.started_at || ''));
    const attemptStartedBeforeDeadline = Number.isFinite(deadlineMs)
      && Number.isFinite(finalAttemptStartedMs)
      && finalAttemptStartedMs <= deadlineMs;
    const replacingDeadlineZero = hasFinalizedOfficialScore
      && String(existing.score_reason || '') === 'deadline_missed'
      && (lessonAllowsLateSubmission(selectedLesson) || attemptStartedBeforeDeadline);
    if (hasFinalizedOfficialScore && !replacingDeadlineZero) return true;

    const record: LessonProgressRecord = { ...existing, step_details: JSON.parse(JSON.stringify(existing.step_details || {})) };
    const detail = record.step_details.luyen_tap || createEmptyStepDetail();
    record.step_details.luyen_tap = {
      ...detail,
      opened: true,
      quizAnswered: snapshot.answered,
      quizCorrect: snapshot.correct,
      quizTotal: snapshot.total,
      quizAnswers: snapshot.answers,
      sectionProgress: snapshot.sectionProgress,
      finalExam: snapshot.finalExam || detail.finalExam,
      lastVisitedAt: new Date().toISOString(),
    };
    const recomputed = recomputeProgress(record);
    const finalQuizExists = Number(selectedLessonContent?.final_quiz?.length || 0) > 0 || Number(snapshot.finalExam?.total_count || 0) > 0;
    let finalRecord = applyProgressScoreModelV3(recomputed, {
      learningWeight,
      finalWeight,
      finalQuizExists,
      allRequiredSectionsCompleted: Object.values(snapshot.sectionProgress || {}).every((item) => item.status === 'completed'),
    });
    finalRecord = {
      ...finalRecord,
      // Một bài nộp thật phải thay dấu vết `deadline_missed` cũ; nếu không
      // merge Firestore sẽ tiếp tục coi record như điểm 0 do quá hạn.
      score_reason: finalRecord.score_status === 'finalized' ? 'submitted' : finalRecord.score_reason,
      deadline_status: replacingDeadlineZero ? 'overridden' : finalRecord.deadline_status,
      deadline_finalized_at: replacingDeadlineZero ? '' : finalRecord.deadline_finalized_at,
      score_calculated_at: snapshot.finalExam?.submitted_at || new Date().toISOString(),
      save_state: 'saving',
    };
    if (activeCoLearningSession && activeCoLearningSession.lesson_id === selectedLesson.lesson_id) {
      finalRecord = {
        ...finalRecord,
        study_mode: 'co_learning',
        co_learning_session_id: activeCoLearningSession.co_learning_session_id,
        co_learner_ids: getCoLearningSessionUserIds(activeCoLearningSession).join(','),
        co_learner_user_ids: getCoLearningSessionUserIds(activeCoLearningSession),
        co_learner_names: getCoLearningSessionNames(activeCoLearningSession),
        result_group_id: activeCoLearningSession.co_learning_session_id,
      };
    }

    progressPendingRecordsRef.current[progressId] = finalRecord;
    setProgressRecordsSync((current) => mergeProgressCollections(current.filter((item) => item.progress_id !== progressId), [finalRecord]));
    queuePendingLearningProgress(user.user_id, finalRecord);
    const saved = await persistProgressRecord(finalRecord, false);
    if (saved) {
      const officialScore = Number(finalRecord.assessment_score);
      showToast(Number.isFinite(officialScore)
        ? `Đã nộp bài. Điểm chính thức ${officialScore.toFixed(1)}/10 đã cập nhật vào bảng theo dõi của giáo viên.`
        : 'Đã nộp bài và cập nhật kết quả lên hệ thống.', 'success');
    }
    return saved;
  }, [user, selectedLesson, selectedLessonContent, lessonViewerMode, activeCoLearningSession, persistActiveRetake, persistProgressRecord, setProgressRecordsSync]);

  const handleCloseLessonViewer = useCallback(async (snapshot?: LessonCloseSnapshot) => {
    if (!user || !selectedLesson) {
      setIsLessonViewerOpen(false);
      setActiveCoLearningSession(null);
      return;
    }
    if (user.vai_tro !== 'student') {
      setIsLessonViewerOpen(false);
      return;
    }
    if (lessonViewerMode === 'review') {
      setIsLessonViewerOpen(false);
      setSelectedLesson(null);
      setSelectedLessonContent(null);
      return;
    }
    if (lessonViewerMode === 'retake' && activeRetakeAttemptRef.current) {
      if (retakeSaveTimerRef.current) { window.clearTimeout(retakeSaveTimerRef.current); retakeSaveTimerRef.current = null; }
      const attempt = activeRetakeAttemptRef.current;
      const record: LessonProgressRecord = { ...(sanitizeProgressRecord(attempt.progress) || createEmptyProgressRecord(user.user_id, selectedLesson)), step_details: JSON.parse(JSON.stringify(attempt.progress.step_details || {})) };
      if (snapshot) {
        const detail = record.step_details.luyen_tap || createEmptyStepDetail();
        record.step_details.luyen_tap = { ...detail, opened: true, quizAnswered: snapshot.answered, quizCorrect: snapshot.correct, quizTotal: snapshot.total, quizAnswers: snapshot.answers, sectionProgress: snapshot.sectionProgress, finalExam: snapshot.finalExam || detail.finalExam, lastVisitedAt: new Date().toISOString() };
      }
      const assessmentConfig = selectedLessonContent?.assessment as any;
      const learningWeight = Number(assessmentConfig?.learning_process_weight ?? assessmentConfig?.interactive_weight ?? selectedLessonContent?.settings?.interactive_weight ?? 40);
      const finalWeight = Number(assessmentConfig?.final_quiz_weight ?? selectedLessonContent?.settings?.final_quiz_weight ?? 60);
      const recomputed = recomputeProgress(record);
      const sectionProgress = recomputed.step_details?.luyen_tap?.sectionProgress || {};
      const finalQuizExists = Number(selectedLessonContent?.final_quiz?.length || 0) > 0 || Number(snapshot?.finalExam?.total_count ?? recomputed.step_details?.luyen_tap?.finalExam?.total_count ?? 0) > 0;
      const finalProgress = finalizeProgressScore(recomputed, new Date().toISOString(), { learningWeight, finalWeight, finalQuizExists, allRequiredSectionsCompleted: Object.values(sectionProgress).every((item) => item.status === 'completed') });
      const finalAttempt: LessonRetakeAttempt = { ...attempt, progress: finalProgress, completion_percent: finalProgress.completion_percent, score_status: finalProgress.score_status, reference_score: finalProgress.score_status === 'finalized' ? finalProgress.assessment_score : finalProgress.current_score, status: finalProgress.score_status === 'finalized' ? 'completed' : 'in_progress', completed_at: finalProgress.score_status === 'finalized' ? new Date().toISOString() : attempt.completed_at, updated_at: new Date().toISOString() };
      const saved = await persistActiveRetake(finalAttempt, false);
      setIsLessonViewerOpen(false);
      setActiveRetakeAttempt(null); activeRetakeAttemptRef.current = null; setLessonViewerMode('official');
      if (saved) showToast(finalProgress.score_status === 'finalized' ? `Đã lưu điểm học lại tham khảo ${Number(finalProgress.assessment_score || 0).toFixed(1)}/10. Điểm chính thức không thay đổi.` : 'Đã lưu tiến độ phiên học lại. Em có thể tiếp tục sau.', 'success');
      return;
    }

    const progressId = `${user.user_id}_${selectedLesson.lesson_id}`;
    if (progressSaveTimersRef.current[progressId]) {
      window.clearTimeout(progressSaveTimersRef.current[progressId]);
      delete progressSaveTimersRef.current[progressId];
    }
    const existing = sanitizeProgressRecord(progressRecordsRef.current.find((item) => item.progress_id === progressId)) || createEmptyProgressRecord(user.user_id, selectedLesson);
    const record: LessonProgressRecord = {
      ...existing,
      step_details: JSON.parse(JSON.stringify(existing.step_details)),
    };
    if (snapshot) {
      const detail = record.step_details.luyen_tap || createEmptyStepDetail();
      record.step_details.luyen_tap = {
        ...detail,
        opened: true,
        quizAnswered: snapshot.answered,
        quizCorrect: snapshot.correct,
        quizTotal: snapshot.total,
        quizAnswers: snapshot.answers,
        sectionProgress: snapshot.sectionProgress,
        finalExam: snapshot.finalExam || detail.finalExam,
        lastVisitedAt: new Date().toISOString(),
      };
    }
    const assessmentConfig = selectedLessonContent?.assessment as any;
    const learningWeight = Number(assessmentConfig?.learning_process_weight ?? assessmentConfig?.interactive_weight ?? selectedLessonContent?.settings?.interactive_weight ?? 40);
    const finalWeight = Number(assessmentConfig?.final_quiz_weight ?? selectedLessonContent?.settings?.final_quiz_weight ?? 60);
    const sectionProgress = record.step_details?.luyen_tap?.sectionProgress || {};
    const allRequiredSectionsCompleted = Object.values(sectionProgress).every((item) => item.status === 'completed');
    const finalQuizExists = Number(selectedLessonContent?.final_quiz?.length || 0) > 0
      || Number(snapshot?.finalExam?.total_count ?? record.step_details?.luyen_tap?.finalExam?.total_count ?? 0) > 0;
    const recomputedOnClose = recomputeProgress(record);
    const isLegacyFinalizedResult = Number(existing.score_model_version || 0) < 4
      && existing.status === 'completed'
      && Number.isFinite(Number(existing.assessment_score));
    let finalRecord = isLegacyFinalizedResult
      ? {
          ...recomputedOnClose,
          assessment_score: existing.assessment_score,
          current_score: existing.current_score,
          final_quiz_score: existing.final_quiz_score,
          learning_process_score: existing.learning_process_score,
          section_scores: existing.section_scores,
          score_status: existing.score_status,
          score_model_version: existing.score_model_version,
          last_closed_at: new Date().toISOString(),
          save_state: 'saving' as const,
        }
      : finalizeProgressScore(recomputedOnClose, new Date().toISOString(), {
          learningWeight,
          finalWeight,
          finalQuizExists,
          allRequiredSectionsCompleted,
        });
    if (activeCoLearningSession && activeCoLearningSession.lesson_id === selectedLesson.lesson_id) {
      finalRecord = {
        ...finalRecord,
        study_mode: 'co_learning',
        co_learning_session_id: activeCoLearningSession.co_learning_session_id,
        co_learner_ids: getCoLearningSessionUserIds(activeCoLearningSession).join(','),
        co_learner_user_ids: getCoLearningSessionUserIds(activeCoLearningSession),
        co_learner_names: getCoLearningSessionNames(activeCoLearningSession),
        result_group_id: activeCoLearningSession.co_learning_session_id,
      };
    }
    progressPendingRecordsRef.current[progressId] = finalRecord;
    setProgressRecordsSync((current) => mergeProgressCollections(current.filter((item) => item.progress_id !== progressId), [finalRecord]));
    const wasCoLearning = Boolean(activeCoLearningSession && activeCoLearningSession.lesson_id === selectedLesson.lesson_id);
    // V6.78.0: chốt một bản sao local TRƯỚC khi gọi Firestore. Việc đóng Viewer
    // không còn phụ thuộc vào tốc độ mạng hoặc permission tạm thời. Cloud save vẫn
    // được thử ngay; nếu quá 2,5 giây thì đóng bài và hàng đợi sẽ tự đồng bộ lại.
    queuePendingLearningProgress(user.user_id, finalRecord);
    showToast('Đang lưu tiến độ và cập nhật kết quả bài học...', 'info');
    const cloudSavePromise = persistProgressRecord(finalRecord, true);
    const saved = await Promise.race<boolean>([
      cloudSavePromise,
      new Promise<boolean>((resolve) => window.setTimeout(() => resolve(false), 2500)),
    ]);
    setIsLessonViewerOpen(false);
    setActiveCoLearningSession(null);
    setLessonViewerMode('official');
    setActiveRetakeAttempt(null);
    activeRetakeAttemptRef.current = null;
    if (!saved) {
      showToast('Đã đóng bài. Kết quả đã được giữ an toàn trên thiết bị và hệ thống sẽ tự đồng bộ lại.', 'info');
      return;
    }
    showToast(wasCoLearning ? 'Đã lưu kết quả chung của nhóm; trạng thái chuẩn bị được ghi nhận riêng từng học sinh và không tính điểm.' : 'Đã lưu kết quả và tiến độ bài học.', 'success');
  }, [user, selectedLesson, selectedLessonContent, activeCoLearningSession, persistProgressRecord, setProgressRecordsSync, lessonViewerMode, persistActiveRetake]);

  const flushProgressBeforeStudyModeChange = useCallback(async (lessonId: string): Promise<boolean> => {
    if (!user || user.vai_tro !== 'student') return true;
    const progressId = `${user.user_id}_${lessonId}`;
    if (progressSaveTimersRef.current[progressId]) {
      window.clearTimeout(progressSaveTimersRef.current[progressId]);
      delete progressSaveTimersRef.current[progressId];
    }
    const pending = progressPendingRecordsRef.current[progressId]
      || sanitizeProgressRecord(progressRecordsRef.current.find((item) => item.progress_id === progressId));
    if (!pending) return true;
    return persistProgressRecord({ ...pending, save_state: 'saving' }, false);
  }, [user, persistProgressRecord]);

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

  const openLessonDirect = async (lesson: Lesson, coSession: CoLearningSession | null = null, mode: 'official' | 'retake' | 'review' = 'official', retakeAttempt: LessonRetakeAttempt | null = null) => {
    if (!user) return;
    if (user.vai_tro === 'student') {
      if (lesson.is_locked === true) {
        showToast(`Bài “${lesson.tieu_de}” đang được giáo viên khóa. Em hãy chờ giáo viên mở bài.`, 'error');
        return;
      }
      const scheduleAccess = getLessonScheduleAccess(lesson);
      if (scheduleAccess.blocked) {
        showToast(`${scheduleAccess.message} Em chưa thể mở bài “${lesson.tieu_de}” lúc này.`, 'error');
        return;
      }
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
    setActiveCoLearningSession(mode === 'retake' ? null : coSession);
    setLessonViewerMode(mode);
    setActiveRetakeAttempt(retakeAttempt);
    activeRetakeAttemptRef.current = retakeAttempt;
    setIsLessonViewerOpen(true);
    void loadLessonComments(lesson.lesson_id);
  };

  const openCoLearningChoice = async (lesson: Lesson, preferredSession: CoLearningSession | null = null, purpose: 'lesson' | 'practice' = 'lesson') => {
    if (!user) return;
    setCoLearningPurpose(purpose);
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
      setCoLearningError(`${res.message || 'Không tải được danh sách bạn cùng lớp.'} Em vẫn có thể chọn “Học một mình” để mở bài ngay.`);
      return;
    }
    const items = res.data?.items || [];
    const reusable = preferredSession || res.data?.reusable_session || null;
    setCoLearningClassmates(items);
    setReusableCoLearningSession(reusable);
    if (reusable) {
      const availableIds = new Set(items.map((item) => item.user_id));
      setCoLearningSelectedUserIds((reusable.participant_user_ids || []).filter((userId) => userId !== user.user_id && availableIds.has(userId)).slice(0, 5));
    }
  };

  const handleManageActiveCoLearning = useCallback(() => {
    if (!selectedLesson || !activeCoLearningSession || user?.vai_tro !== 'student') return;
    void openCoLearningChoice(selectedLesson, activeCoLearningSession);
  }, [selectedLesson, activeCoLearningSession, user?.vai_tro]);

  const openLesson = async (lesson: Lesson) => {
    if (!user) return;
    if (user.vai_tro === 'student') {
      const currentProgress = currentStudentProgressByLesson[lesson.lesson_id];
      const officialFinalized = currentProgress && (currentProgress.score_status === 'finalized' || (currentProgress.status === 'completed' && Number.isFinite(Number(currentProgress.assessment_score))));
      const officialRetakeGranted = Boolean(currentProgress
        && Number(currentProgress.official_retake_remaining || 0) > 0
        && currentProgress.official_retake_grant_id
        && (currentProgress.score_status === 'retake_pending' || officialFinalized));

      // V6.84.1: quyền học lại cập nhật điểm do giáo viên cấp là ngoại lệ có kiểm soát.
      // Mở lựa chọn trước guard lịch/khóa để học sinh có thể làm bù sau deadline.
      if (officialRetakeGranted) {
        setRetakeChoiceLesson(lesson);
        void listLessonRetakesApi(user.token, lesson.lesson_id).then((history) => setRetakeHistory(history.ok ? history.data || [] : []));
        return;
      }

      const scheduleAccess = getLessonScheduleAccess(lesson);
      const preLessonAccess = getPreLessonVideoAccess(lesson, scheduleAccess);
      if (preLessonAccess.canWatchNow) {
        setPreLessonVideoLesson(lesson);
        setIsPreLessonVideoOpen(true);
        return;
      }
      if (lesson.is_locked === true) {
        showToast(`Bài “${lesson.tieu_de}” đang được giáo viên khóa. Em chưa thể vào học lúc này.`, 'error');
        return;
      }
      if (scheduleAccess.blocked) {
        showToast(`${scheduleAccess.message} Em chưa thể vào học lúc này.`, 'error');
        return;
      }
      if (currentProgress?.result_state === 'invalid_cheating' && currentProgress.retake_allowed === false) {
        showToast(`Kết quả bài “${lesson.tieu_de}” đã bị hủy do gian lận và giáo viên không cho phép làm lại.`, 'error');
        return;
      }
      if (officialFinalized && lesson.allow_retake_after_completion === true) {
        setRetakeChoiceLesson(lesson);
        void listLessonRetakesApi(user.token, lesson.lesson_id).then((history) => setRetakeHistory(history.ok ? history.data || [] : []));
        return;
      }
      if (officialFinalized) {
        await openLessonDirect(lesson, null, 'review', null);
        return;
      }
      await openCoLearningChoice(lesson);
      return;
    }
    await openLessonDirect(lesson, null);
  };

  const handleReviewOfficialLesson = async () => {
    const lesson = retakeChoiceLesson;
    if (!lesson) return;
    setRetakeChoiceLesson(null);
    await openLessonDirect(lesson, null, 'review', null);
  };

  const handleStartReferenceRetake = async () => {
    const lesson = retakeChoiceLesson;
    if (!lesson || !user) return;
    const official = currentStudentProgressByLesson[lesson.lesson_id];
    if (!official) { showToast('Không tìm thấy kết quả chính thức để học lại.', 'error'); return; }
    const res = await withLoading('Đang chuẩn bị phiên học lại...', () => startLessonRetakeApi(user.token, lesson.lesson_id, official));
    if (!res.ok || !res.data) { if (!handleSessionError(res.message)) showToast(res.message || 'Không bắt đầu được phiên học lại.', 'error'); return; }
    setRetakeChoiceLesson(null);
    await openLessonDirect(lesson, null, 'retake', res.data);
    showToast(`Phiên học lại #${res.data.attempt_number}. Điểm lần này chỉ mang tính tham khảo và không thay đổi điểm chính thức.`, 'info');
  };

  const handleStartOfficialRetake = async () => {
    const lesson = retakeChoiceLesson;
    if (!lesson || !user) return;
    const official = currentStudentProgressByLesson[lesson.lesson_id];
    if (!official || Number(official.official_retake_remaining || 0) < 1) {
      showToast('Quyền học lại cập nhật điểm không còn hiệu lực.', 'error');
      return;
    }
    const res = await withLoading('Đang chuẩn bị lượt học lại cập nhật điểm...', () => startLessonRetakeApi(user.token, lesson.lesson_id, official, 'official_update'));
    if (!res.ok || !res.data) { if (!handleSessionError(res.message)) showToast(res.message || 'Không bắt đầu được lượt học lại cập nhật điểm.', 'error'); return; }
    setRetakeChoiceLesson(null);
    await openLessonDirect(lesson, null, 'retake', res.data);
    showToast(`Lượt học lại chính thức #${res.data.attempt_number}. Bài đang ở trạng thái chờ học lại; điểm mới sẽ được ghi khi em nộp bài.`, 'info');
  };

  const openLessonTeacherMode = async (lesson: Lesson) => {
    if (!user || user.vai_tro === 'student') return;
    await openLessonDirect(lesson, null);
  };

  const handleStudyAlone = async () => {
    const lesson = coLearningLesson;
    const editingActiveSession = Boolean(isLessonViewerOpen && selectedLesson?.lesson_id === lesson?.lesson_id);
    if (!lesson) { closeCoLearningModal(); return; }
    if (editingActiveSession && activeCoLearningSession) {
      setIsCoLearningSubmitting(true);
      const flushed = await flushProgressBeforeStudyModeChange(lesson.lesson_id);
      setIsCoLearningSubmitting(false);
      if (!flushed) {
        setCoLearningError('Chưa thể chuyển sang học một mình vì tiến độ nhóm hiện tại chưa được lưu. Hãy kiểm tra kết nối và thử lại.');
        return;
      }
      closeCoLearningModal();
      setActiveCoLearningSession(null);
      showToast('Đã chốt tiến độ nhóm và chuyển sang học một mình.', 'success');
      return;
    }
    closeCoLearningModal();
    if (coLearningPurpose === 'practice' && pendingInteractivePractice?.practice_manifest) {
      launchInteractivePractice(pendingInteractivePractice, null);
      return;
    }
    await openLessonDirect(lesson, null);
  };

  const handleToggleCoLearningClassmate = useCallback((userId: string) => {
    // V6.79.0: chọn/bỏ chọn hoàn toàn bằng state cục bộ. Không gọi Firestore ở
    // bước chọn bạn và luôn dùng functional updater để nhiều click liên tiếp
    // không bị ghi đè bởi state cũ.
    setCoLearningSelectedUserIds((current) => {
      if (current.includes(userId)) return current.filter((item) => item !== userId);
      if (current.length >= 5) return current;
      return [...current, userId];
    });
    // Giữ mật khẩu đã nhập trong phiên modal nếu người dùng lỡ bỏ/chọn lại bạn;
    // dữ liệu này chỉ ở memory và bị xóa khi đóng modal.
    setCoLearningError('');
  }, []);

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
    const previouslyConfirmed = new Set((reusableCoLearningSession?.participant_user_ids || []).filter((id) => id !== user.user_id));
    const newlyAdded = selectedClassmates.filter((student) => !previouslyConfirmed.has(student.user_id));
    const credentials = newlyAdded.map((student) => ({
      user_id: student.user_id,
      identifier: student.ma_hoc_sinh || student.ten_dang_nhap,
      password: coLearningPasswords[student.user_id] || '',
    }));
    if (credentials.some((item) => !item.password.trim())) {
      setCoLearningError('Bạn mới thêm vào nhóm cần nhập mật khẩu xác nhận một lần.');
      return;
    }
    const editingActiveSession = Boolean(isLessonViewerOpen && selectedLesson?.lesson_id === coLearningLesson.lesson_id);
    setIsCoLearningSubmitting(true);
    setCoLearningError('');
    startLoading(reusableCoLearningSession ? 'Đang chuẩn bị cập nhật nhóm học cùng...' : `Đang chuẩn bị tạo nhóm ${selectedClassmates.length + 1} học sinh...`);
    let res;
    try {
      if (reusableCoLearningSession && editingActiveSession && activeCoLearningSession?.co_learning_session_id === reusableCoLearningSession.co_learning_session_id) {
        setLoadingMessage('Đang chốt tiến độ nhóm hiện tại trước khi thay đổi thành viên...');
        const flushed = await flushProgressBeforeStudyModeChange(coLearningLesson.lesson_id);
        if (!flushed) {
          setCoLearningError('Chưa thể thay đổi thành viên vì tiến độ nhóm hiện tại chưa được lưu. Hãy kiểm tra kết nối và thử lại.');
          return;
        }
      }
      const reportProgress = (message: string) => setLoadingMessage(message);
      res = reusableCoLearningSession
        ? await updateCoLearningSessionApi(user.token, coLearningLesson.lesson_id, reusableCoLearningSession.co_learning_session_id, coLearningSelectedUserIds, credentials, reportProgress)
        : await startCoLearningSessionApi(user.token, coLearningLesson.lesson_id, selectedClassmates.map((student) => ({
            user_id: student.user_id,
            identifier: student.ma_hoc_sinh || student.ten_dang_nhap,
            password: coLearningPasswords[student.user_id] || '',
          })), reportProgress);
    } finally {
      stopLoading();
      setIsCoLearningSubmitting(false);
    }
    if (!res.ok || !res.data) {
      if (handleSessionError(res.message)) return;
      setCoLearningError(res.message || 'Không xác nhận được phiên học cùng.');
      return;
    }
    const lesson = coLearningLesson;
    const session = res.data;
    closeCoLearningModal();
    if (coLearningPurpose === 'practice' && pendingInteractivePractice?.practice_manifest) {
      launchInteractivePractice(pendingInteractivePractice, session);
      showToast(`Đã xác nhận nhóm ${getCoLearningSessionUserIds(session).length} học sinh để luyện tập cùng.`, 'success');
      return;
    }
    setActiveCoLearningSession(session);
    showToast(reusableCoLearningSession ? `Đã cập nhật nhóm ${getCoLearningSessionUserIds(session).length} học sinh. Từ lần lưu tiếp theo, tiến độ và điểm dùng nhóm mới.` : `Đã xác nhận nhóm ${getCoLearningSessionUserIds(session).length} học sinh. Tiến độ và điểm sẽ được đồng bộ cho cả nhóm.`, 'success');
    if (!editingActiveSession) await openLessonDirect(lesson, session);
  };

  const handleResumeCoLearning = async () => {
    if (!coLearningLesson || !reusableCoLearningSession) return;
    const lesson = coLearningLesson;
    const session = reusableCoLearningSession;
    const editingActiveSession = Boolean(isLessonViewerOpen && selectedLesson?.lesson_id === lesson.lesson_id);
    closeCoLearningModal();
    if (coLearningPurpose === 'practice' && pendingInteractivePractice?.practice_manifest) {
      launchInteractivePractice(pendingInteractivePractice, session);
      showToast(`Đang luyện tập cùng nhóm ${getCoLearningSessionUserIds(session).length} học sinh đã xác nhận.`, 'success');
      return;
    }
    setActiveCoLearningSession(session);
    showToast(`Đang tiếp tục với nhóm ${getCoLearningSessionUserIds(session).length} học sinh đã xác nhận.`, 'success');
    if (!editingActiveSession) await openLessonDirect(lesson, session);
  };

  const handleArenaSelectLesson = async (lesson: Lesson) => {
    if (!user) return;
    if (user.vai_tro === 'student' && lesson.is_locked === true) {
      showToast(`Bài “${lesson.tieu_de}” đang được giáo viên khóa. Em chưa thể vào Đấu trường lúc này.`, 'error');
      return;
    }
    if (user.vai_tro === 'student') {
      const scheduleAccess = getLessonScheduleAccess(lesson);
      if (scheduleAccess.blocked) {
        showToast(`${scheduleAccess.message} Em chưa thể dùng bài này trong Đấu trường lúc này.`, 'error');
        return;
      }
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
    // V6.75.2: publish thành công được phản ánh ngay trên UI. Không tải lại toàn
    // bộ app vì một domain phụ lỗi có thể khiến giáo viên tưởng rằng publish thất bại.
    if (savedRow) {
      setLessonRows((current) => {
        const exists = current.some((item) => item.lesson_id === savedRow.lesson_id);
        if (exists) return current.map((item) => item.lesson_id === savedRow.lesson_id ? { ...item, ...savedRow } : item);
        return [savedRow, ...current];
      });
      // Đồng bộ lại riêng domain bài học ở nền; lỗi refresh không đảo ngược kết quả publish.
      void loadDataDomain('lessons', true).catch(() => undefined);
    }

    if (!savingDraft && !values.lesson_id && savedRow && values.lesson_json) {
      setSelectedLesson(mapLessonRow(savedRow, subjects, classes, accounts, user));
      setSelectedLessonContent(values.lesson_json);
      setViewerStage('khoi_dong');
      setActiveMenu(user?.vai_tro === 'teacher' || currentUserIsAdmin ? 'lessons' : 'my_lessons');
      setIsLessonViewerOpen(true);
      setIsComposerOpen(false);
      showToast('Đã tạo bài học mới và mở ở chế độ giảng dạy.', 'success');
      return;
    }

    if (values.lesson_id && values.keep_editor_open) {
      showToast(savingDraft ? 'Đã lưu thay đổi vào bản nháp.' : 'Đã lưu thay đổi bài học.', 'success');
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

  const openInteractivePracticeCreator = () => {
    if (user?.vai_tro === 'student') {
      showToast('Học sinh không có quyền tải bài luyện tập lên hệ thống.', 'error');
      return;
    }
    setIsInteractivePracticeImportOpen(true);
  };

  const handleCreateInteractivePractice = async (payload: Record<string, unknown>) => {
    if (!user || user.vai_tro === 'student') return;
    setIsSubmitting(true);
    const res = await withLoading('Đang lưu bài luyện tập tương tác...', () => createInteractivePracticeApi(user.token, payload));
    setIsSubmitting(false);
    if (!res.ok) {
      if (!handleSessionError(res.message)) showToast(res.message || 'Không tạo được bài luyện tập.', 'error');
      return;
    }
    setIsInteractivePracticeImportOpen(false);
    await loadDataDomain('reviews', true);
    showToast('Đã nhập và phát hành bài luyện tập tương tác.', 'success');
  };


  const openPracticeSettings = async (review: ReviewPracticeRow) => {
    if (!user || user.vai_tro === 'student') return;
    const res = await withLoading('Đang tải cấu hình luyện tập...', () => getReviewPracticeApi(user.token, review.review_id));
    if (!res.ok || !res.data) { showToast(res.message || 'Không tải được cấu hình luyện tập.', 'error'); return; }
    setPracticeSettingsReview(res.data.review || review);
    setPracticeSettingsConfig(res.data.config);
    setIsPracticeSettingsOpen(true);
  };

  const handleSavePracticeSettings = async (payload: Record<string, unknown>) => {
    if (!user || !practiceSettingsReview) return;
    setIsSubmitting(true);
    const res = await updateInteractivePracticeApi(user.token, practiceSettingsReview.review_id, payload);
    setIsSubmitting(false);
    if (!res.ok) { if (!handleSessionError(res.message)) showToast(res.message || 'Không lưu được cấu hình luyện tập.', 'error'); return; }
    setIsPracticeSettingsOpen(false);
    setPracticeSettingsReview(null);
    setPracticeSettingsConfig(undefined);
    await loadDataDomain('reviews', true);
    showToast('Đã cập nhật cấu hình luyện tập.', 'success');
  };

  const launchInteractivePractice = (payload: ReviewPracticeContentResponse, session: CoLearningSession | null = null) => {
    if (!payload.practice_manifest) { showToast('Bài luyện tập chưa có Practice Manifest hợp lệ.', 'error'); return; }
    const ownAttempts = user?.vai_tro === 'student' ? myReviewAttempts.filter((item) => item.review_id === payload.review.review_id) : [];
    const resolved = resolvePracticeConfig(payload.review, payload.config);
    setSelectedInteractivePractice(payload.review);
    setSelectedInteractiveManifest(payload.practice_manifest);
    setSelectedInteractiveConfig(resolved);
    setSelectedInteractiveAttemptCount(ownAttempts.length);
    setSelectedInteractiveAllowRetry(resolved.max_attempts === 0 || ownAttempts.length < resolved.max_attempts);
    setActivePracticeCoLearningSession(session);
    setIsInteractivePracticeViewerOpen(true);
  };

  const openInteractivePractice = async (review: ReviewPracticeRow) => {
    if (!user) return;
    const ownAttempts = user.vai_tro === 'student' ? myReviewAttempts.filter((item) => item.review_id === review.review_id) : [];
    if (user.vai_tro === 'student') {
      const access = getPracticeAccessState(review, undefined, user.lop_id || '', ownAttempts.length);
      if (!access.canStart) { showToast(access.reason || access.label, 'info'); return; }
    }
    const res = await withLoading('Đang mở bài luyện tập...', () => getReviewPracticeApi(user.token, review.review_id));
    if (!res.ok || !res.data) {
      if (!handleSessionError(res.message)) showToast(res.message || 'Không mở được bài luyện tập.', 'error');
      return;
    }
    const payload = res.data as ReviewPracticeContentResponse;
    if (!payload.practice_manifest) { showToast('Bài luyện tập chưa có dữ liệu tương tác chuẩn hóa.', 'error'); return; }
    if (user.vai_tro !== 'student') { launchInteractivePractice(payload, null); return; }
    const resolved = resolvePracticeConfig(payload.review, payload.config);
    const access = getPracticeAccessState(payload.review, resolved, user.lop_id || '', ownAttempts.length);
    if (!access.canStart) { showToast(access.reason || access.label, 'info'); return; }
    const linkedLessonId = payload.review.lesson_id || payload.practice_manifest.lessonId || String(payload.review.lesson_ids || '').split(',')[0];
    const linkedLesson = lessonsById.get(linkedLessonId);
    if (!resolved.allow_co_learning && resolved.allow_solo) { launchInteractivePractice(payload, null); return; }
    if (!linkedLesson) {
      if (!resolved.allow_solo) { showToast('Không tìm thấy bài học liên kết để mở chế độ luyện cùng.', 'error'); return; }
      showToast('Không tìm thấy bài học liên kết. Hệ thống sẽ mở luyện một mình.', 'info');
      launchInteractivePractice(payload, null);
      return;
    }
    setPendingInteractivePractice(payload);
    if (!resolved.allow_solo && resolved.allow_co_learning) {
      await openCoLearningChoice(linkedLesson, null, 'practice');
      return;
    }
    await openCoLearningChoice(linkedLesson, null, 'practice');
  };

  const handleSubmitInteractivePractice = async (result: Record<string, unknown>) => {
    if (!user) return;
    const res = await submitReviewPracticeApi(user.token, result);
    if (!res.ok) {
      if (!handleSessionError(res.message)) showToast(res.message || 'Không lưu được kết quả luyện tập.', 'error');
      throw new Error(res.message || 'Không lưu được kết quả luyện tập.');
    }
    if (user.vai_tro === 'student') {
      const refreshed = await listMyReviewAttemptsApi(user.token);
      if (refreshed.ok) setMyReviewAttempts(refreshed.data?.items || []);
    }
    showToast('Đã lưu kết quả luyện tập.', 'success');
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
      title: 'Lưu trữ an toàn bài học',
      description: `Bài “${lesson.tieu_de}” sẽ được khóa và ẩn khỏi thư viện hoạt động. Hệ thống không quét/xóa hàng loạt tiến trình hoặc điểm học sinh, vì vậy không làm mất lịch sử và không gây lỗi quota. Số bài được giải phóng để có thể tạo lại.`,
      confirmLabel: 'Lưu trữ bài học',
      cancelLabel: 'Hủy',
      variant: 'danger',
      onConfirm: async () => {
        if (!user || lessonDeletingId) return;
        const lessonId = lesson.lesson_id;
        setConfirmDialog(DEFAULT_CONFIRM);
        setLessonDeletingId(lessonId);
        showToast('Đang lưu trữ an toàn bài học...', 'info');
        try {
          const res = await deleteLessonApi(user.token, lessonId);
          if (!res.ok) {
            if (!handleSessionError(res.message)) showToast(res.message || 'Không lưu trữ được bài học.', 'error');
            return;
          }
          setLessonRows((current) => current.map((item) => item.lesson_id === lessonId ? { ...item, trang_thai: 'archived', pham_vi: 'private', is_locked: true } : item));
          setSelectedLesson((current) => current?.lesson_id === lessonId ? null : current);
          setSelectedLessonContent((current) => selectedLesson?.lesson_id === lessonId ? null : current);
          setArenaLesson((current) => current?.lesson_id === lessonId ? null : current);
          setArenaLessonContent((current) => arenaLesson?.lesson_id === lessonId ? null : current);
          showToast('Đã lưu trữ an toàn bài học. Lịch sử điểm/kết quả vẫn được giữ nguyên.', 'success');
          void loadAppData().catch(() => undefined);
        } catch (error) {
          showToast(error instanceof Error ? error.message : 'Không lưu trữ được bài học.', 'error');
        } finally {
          setLessonDeletingId('');
        }
      },
    });
  };

  const runLessonPermanentPurge = async (lesson: Lesson, mode: LessonPurgeMode, totalHint = 0) => {
    if (!user || !currentUserIsAdmin || lessonDeletingId) return;
    const lessonId = lesson.lesson_id;
    setLessonDeletingId(lessonId);
    setLessonPurgeProgress((current) => current?.lessonId === lessonId
      ? { ...current, status: 'running', error: undefined }
      : {
          lessonId,
          lessonTitle: lesson.tieu_de,
          mode,
          status: 'running',
          phase: 'preparation_submissions',
          processed: 0,
          total: totalHint,
          archivedGrades: 0,
        });
    try {
      const startRes = await purgeLessonApi(user.token, lessonId, mode);
      if (!startRes.ok || !startRes.data) {
        showToast(startRes.message || 'Không thể bắt đầu xóa vĩnh viễn bài học.', 'error');
        setLessonPurgeProgress((current) => current ? { ...current, status: 'retryable', error: startRes.message } : current);
        return;
      }
      let job: any = startRes.data;
      const reflect = (value: any) => setLessonPurgeProgress({
        lessonId,
        lessonTitle: lesson.tieu_de,
        mode: value.mode === 'purge_all' ? 'purge_all' : 'preserve_grades',
        status: value.status === 'completed' ? 'completed' : value.status === 'retryable' ? 'retryable' : 'running',
        phase: String(value.phase || 'preparation_submissions'),
        processed: Number(value.processed_records || 0),
        total: Number(value.total_records || totalHint || 0),
        archivedGrades: Number(value.archived_grade_records || 0),
        error: String(value.last_error || ''),
      });
      reflect(job);

      // Mỗi vòng xử lý tối đa một batch/phase. Job tự lưu phase nên refresh hoặc
      // quota/mất mạng không làm mất vị trí. Khoảng nghỉ ngắn tránh dồn request.
      for (let round = 0; round < 240 && job.status !== 'completed' && job.status !== 'retryable'; round += 1) {
        const step = await continueLessonPurgeApi(user.token, lessonId);
        if (!step.ok || !step.data) {
          const message = step.message || 'Tiến trình xóa bị gián đoạn.';
          setLessonPurgeProgress((current) => current ? { ...current, status: 'retryable', error: message } : current);
          showToast(`${message} Dữ liệu đã xử lý được giữ nguyên; có thể bấm Tiếp tục xóa.`, 'error');
          return;
        }
        job = step.data;
        reflect(job);
        if (job.status === 'retryable') {
          showToast('Tiến trình xóa tạm dừng. Hệ thống đã lưu vị trí hiện tại; hãy bấm Tiếp tục xóa khi quota/mạng ổn định.', 'error');
          return;
        }
        if (job.status === 'completed') {
          setLessonRows((current) => current.filter((item) => item.lesson_id !== lessonId));
          setSelectedLesson((current) => current?.lesson_id === lessonId ? null : current);
          setSelectedLessonContent((current) => selectedLesson?.lesson_id === lessonId ? null : current);
          showToast(mode === 'preserve_grades'
            ? `Đã xóa vĩnh viễn bài học và lưu ${Number(job.archived_grade_records || 0)} bản ghi điểm lịch sử.`
            : 'Đã xóa vĩnh viễn bài học và toàn bộ dữ liệu liên quan.', 'success');
          void loadAppData().catch(() => undefined);
          return;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 60));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Không thể tiếp tục xóa vĩnh viễn bài học.';
      setLessonPurgeProgress((current) => current ? { ...current, status: 'retryable', error: message } : current);
      showToast(`${message} Tiến trình có thể tiếp tục từ vị trí đã lưu.`, 'error');
    } finally {
      setLessonDeletingId('');
    }
  };

  const askPurgeLesson = async (lesson: Lesson, mode: LessonPurgeMode = 'preserve_grades') => {
    if (!currentUserIsAdmin || !user || lessonDeletingId) return;
    setLessonDeletingId(lesson.lesson_id);
    showToast('Đang phân tích dữ liệu liên quan trước khi xóa...', 'info');
    const analysisRes = await analyzeLessonPurgeApi(user.token, lesson.lesson_id);
    setLessonDeletingId('');
    if (!analysisRes.ok || !analysisRes.data) {
      showToast(analysisRes.message || 'Không thể phân tích dữ liệu bài học.', 'error');
      return;
    }
    const analysis: any = analysisRes.data;
    const counts = analysis.counts || {};
    const studentRecords = Number(analysis.student_data_records || 0);
    const total = Number(analysis.total_records || 0);
    const summary = [
      `${Number(counts.learningProgress || 0)} tiến độ/điểm`,
      `${Number(counts.preparationSubmissions || 0) + Number(counts.legacyPreLessonSubmissions || 0) + Number(counts.preLessonProgress || 0)} kết quả chuẩn bị`,
      `${Number(counts.retakes || 0)} lượt học lại`,
      `${Number(counts.lessonComments || 0)} bình luận`,
      `${Number(counts.coLearningSessions || 0)} phiên học cùng`,
      `${Number(counts.reviewPractices || 0)} bài luyện liên kết`,
    ].join(' • ');
    const modeText = mode === 'preserve_grades'
      ? 'Điểm chính thức sẽ được chụp sang kho lịch sử trước khi xóa tiến độ gốc.'
      : 'TOÀN BỘ tiến độ, điểm và dữ liệu học sinh liên quan sẽ bị xóa.';
    setConfirmDialog({
      isOpen: true,
      title: mode === 'preserve_grades' ? 'Xóa vĩnh viễn – giữ lịch sử điểm' : 'Xóa vĩnh viễn – xóa toàn bộ dữ liệu',
      description: `Bài “${lesson.tieu_de}” có khoảng ${total} bản ghi/tham chiếu liên quan (${studentRecords} dữ liệu học sinh). ${summary}. ${modeText} Hệ thống sẽ xóa theo batch nhỏ và có thể tiếp tục nếu quota hoặc mạng gián đoạn.`,
      confirmLabel: mode === 'preserve_grades' ? 'Xóa và giữ điểm' : 'Xóa toàn bộ vĩnh viễn',
      cancelLabel: 'Hủy',
      variant: 'danger',
      requiredText: 'XOA VINH VIEN',
      requiredTextLabel: 'Nhập XOA VINH VIEN để xác nhận thao tác không thể hoàn tác',
      onConfirm: async () => {
        setConfirmDialog(DEFAULT_CONFIRM);
        await runLessonPermanentPurge(lesson, mode, total);
      },
    });
  };

  const resumeLessonPermanentPurge = async () => {
    if (!lessonPurgeProgress) return;
    const lesson = lessons.find((item) => item.lesson_id === lessonPurgeProgress.lessonId);
    if (!lesson) {
      setLessonPurgeProgress(null);
      return;
    }
    await runLessonPermanentPurge(lesson, lessonPurgeProgress.mode, lessonPurgeProgress.total);
  };

  const handleRepairLessonIntegrity = async () => {
    if (!user || !currentUserIsAdmin || lessonIntegrityRepairing) return;
    setLessonIntegrityRepairing(true);
    showToast('Đang kiểm tra registry và dữ liệu bài học cũ...', 'info');
    try {
      const res = await repairLessonIntegrityApi(user.token);
      if (!res.ok || !res.data) {
        if (!handleSessionError(res.message)) showToast(res.message || 'Không thể kiểm tra dữ liệu bài học.', 'error');
        return;
      }
      const summary = res.data as any;
      const orphanFixed = Number(summary.removed_orphan_references || 0);
      const lessonFixed = Number(summary.normalized_lessons || 0);
      showToast(
        orphanFixed > 0 || lessonFixed > 0
          ? `Kiểm tra hoàn tất: sửa ${orphanFixed} tham chiếu mồ côi và chuẩn hóa ${lessonFixed} bài học/video chuẩn bị.`
          : 'Kiểm tra hoàn tất: registry và metadata video chuẩn bị đều hợp lệ.',
        'success',
      );
      await loadAppData();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Không thể sửa dữ liệu bài học.', 'error');
    } finally {
      setLessonIntegrityRepairing(false);
    }
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

  const selfStudyClassOptionsForLesson = (lesson: Lesson) => {
    if (lesson.lop_id) return classes.filter((item) => item.lop_id === lesson.lop_id);
    return classes
      .filter((item) => String(item.khoi || '').replace(/\.0+$/, '') === String(lesson.khoi || '').replace(/\.0+$/, ''))
      .sort((a, b) => String(a.ten_lop || a.lop_id).localeCompare(String(b.ten_lop || b.lop_id), 'vi'));
  };

  const openSelfStudyAccessModal = (lesson: Lesson) => {
    const options = selfStudyClassOptionsForLesson(lesson);
    const scope = lesson.self_study_scope || (lesson.access_mode === 'self_study' ? 'all' : 'none');
    const selected = scope === 'all'
      ? options.map((item) => item.lop_id)
      : scope === 'classes'
        ? (lesson.self_study_class_ids || []).filter((id) => options.some((item) => item.lop_id === id))
        : [];
    setSelfStudyAccessLesson(lesson);
    setSelfStudySelectedClassIds(selected);
  };

  const saveSelfStudyAccess = async () => {
    if (!user || !selfStudyAccessLesson || selfStudyAccessSaving) return;
    const options = selfStudyClassOptionsForLesson(selfStudyAccessLesson);
    const allIds = options.map((item) => item.lop_id);
    const selected: string[] = Array.from(new Set<string>(selfStudySelectedClassIds.filter((id) => allIds.includes(id))));
    const scope = selected.length === 0 ? 'none' : selected.length === allIds.length ? 'all' : 'classes';
    setSelfStudyAccessSaving(true);
    setLessonAccessModeUpdatingId(selfStudyAccessLesson.lesson_id);
    const res = await setLessonSelfStudyAccessApi(user.token, selfStudyAccessLesson.lesson_id, scope, selected);
    setSelfStudyAccessSaving(false);
    setLessonAccessModeUpdatingId('');
    if (!res.ok || !res.data) {
      if (!handleSessionError(res.message)) showToast(res.message || 'Không cập nhật được phạm vi tự học theo lớp.', 'error');
      return;
    }
    const saved = mapLessonRow(res.data, subjects, classes, accounts, user);
    setLessonRows((current) => current.map((item) => item.lesson_id === saved.lesson_id ? { ...item, ...res.data } : item));
    setSelectedLesson((current) => current?.lesson_id === saved.lesson_id ? { ...current, ...saved } : current);
    setSelfStudyAccessLesson(null);
    setSelfStudySelectedClassIds([]);
    showToast(res.message || 'Đã cập nhật phạm vi tự học theo lớp.', 'success');
  };

  // Tương thích hành vi cũ: nút nhanh nay mở trình quản lý phạm vi theo lớp.
  const handleToggleLessonAccessMode = async (lesson: Lesson) => {
    openSelfStudyAccessModal(lesson);
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

  const refreshAfterAccountDeletion = async () => {
    await Promise.allSettled(Array.from(domainLoadPromisesRef.current.values()));
    loadedDataDomainsRef.current.clear();
    setLessonRows([]);
    setReviewPractices([]);
    setPendingShares([]);
    setProgressRecordsSync([]);
    await loadAppData();
  };

  const askDeleteAccount = (account: Account) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Xóa tài khoản',
      description: `Bạn có chắc muốn xóa tài khoản “${account.ho_ten}” (${account.ten_dang_nhap})? Dữ liệu cá nhân như cấu hình AI, tiến trình, bình luận và kết quả ôn tập sẽ bị xóa. Bài học do tài khoản tạo và dữ liệu liên quan sẽ được dọn. Danh tính Firebase được xóa bằng mật khẩu hiện tại hoặc do bạn hoàn tất trong Firebase Console; tệp Drive chuyển vào Thùng rác.`,
      confirmLabel: 'Xóa tài khoản',
      cancelLabel: 'Hủy',
      variant: 'danger',
      accountOperation: 'delete',
      onConfirm: async (credentials) => {
        if (!user) return;
        setIsSubmitting(true);
        const res = await withLoading('Đang xóa tài khoản...', async () => {
          const firebaseIdToken = user.auth_provider === 'firebase' ? await getFirebaseIdToken(true) : '';
          return deleteAccountApi(user.token, account.user_id, firebaseIdToken, credentials);
        });
        setIsSubmitting(false);
        if (!res.ok) {
          if (!handleSessionError(res.message)) showToast(res.message, 'error');
          return;
        }
        setConfirmDialog(DEFAULT_CONFIRM);
        setSelectedAccountIds((current) => current.filter((id) => id !== account.user_id));
        setAccounts((current) => current.filter((item) => item.user_id !== account.user_id));
        await refreshAfterAccountDeletion();
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
      description: `Bạn có chắc muốn xóa các tài khoản đã chọn: ${previewNames}${moreText}? Dữ liệu ứng dụng và bài học do các tài khoản tạo sẽ được dọn; tệp Drive chuyển vào Thùng rác. Danh tính Firebase cần được xóa bằng xác thực hoặc hoàn tất trong Firebase Console. Các tác vụ chưa hoàn tất có thể được thực hiện lại.`,
      confirmLabel: 'Xóa các tài khoản đã chọn',
      cancelLabel: 'Hủy',
      variant: 'danger',
      accountOperation: 'delete',
      onConfirm: async (credentials) => {
        if (!user) return;
        const ids = selectedAccounts.map((item) => item.user_id);
        setIsSubmitting(true);
        const res = await withLoading('Đang xóa các tài khoản đã chọn...', async () => {
          const firebaseIdToken = user.auth_provider === 'firebase' ? await getFirebaseIdToken(true) : '';
          return batchDeleteAccountsApi(user.token, ids, firebaseIdToken, credentials);
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
        await refreshAfterAccountDeletion();
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
      description: `Bạn sắp reset mật khẩu các tài khoản đã chọn: ${previewNames}${moreText}. ${passwordPolicyText}. Chỉ tài khoản xác thực được bằng mật khẩu hiện tại mới được đổi mật khẩu. Các tài khoản còn lại sẽ báo lỗi riêng.`,
      confirmLabel: 'Reset mật khẩu mặc định',
      cancelLabel: 'Hủy',
      variant: 'primary',
      accountOperation: 'reset',
      onConfirm: async (credentials) => {
        if (!user) return;
        const ids = selectedAccounts.map((item) => item.user_id);
        setIsSubmitting(true);
        const res = await withLoading('Đang reset mật khẩu các tài khoản đã chọn...', async () => {
          const firebaseIdToken = user.auth_provider === 'firebase' ? await getFirebaseIdToken(true) : '';
          return batchResetPasswordsApi(user.token, ids, '123456', firebaseIdToken, credentials);
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
        showToast(res.message || `Đã reset ${resetCount} tài khoản, ${failedCount} tài khoản chưa hoàn tất.`, failedCount > 0 ? 'info' : 'success');
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
              { value: 'archived', label: 'Đã lưu trữ' },
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

    if (lessonDeletingId === lesson.lesson_id) {
      return (
        <div className="lesson-library-action-row">
          <div className="flex w-full items-center justify-center gap-2 rounded-xl bg-rose-50 px-3 py-2.5 text-xs font-bold text-rose-700 ring-1 ring-rose-100">
            <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Đang xóa và kiểm tra dữ liệu...
          </div>
        </div>
      );
    }

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
              {canModify ? (
                <button onClick={(event) => { stopTileAction(event); event.currentTarget.closest('details')?.removeAttribute('open'); void handleToggleLessonAccessMode(lesson); }} disabled={Boolean(lessonAccessModeUpdatingId)} className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold disabled:cursor-wait disabled:opacity-60 ${lesson.access_mode === 'self_study' ? 'text-violet-700 hover:bg-violet-50' : 'text-indigo-700 hover:bg-indigo-50'}`}>
                  {lessonAccessModeUpdatingId === lesson.lesson_id ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <BookOpenCheck className="h-3.5 w-3.5" />}
                  Quản lý tự học theo lớp
                </button>
              ) : null}
              {canSubmitReview ? (
                <button onClick={(event) => { stopTileAction(event); event.currentTarget.closest('details')?.removeAttribute('open'); void handleSubmitReview(lesson); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold text-amber-700 hover:bg-amber-50">
                  <UploadCloud className="h-3.5 w-3.5" /> Gửi admin duyệt
                </button>
              ) : null}
              {canModify ? <div className="my-1 border-t border-slate-100" /> : null}
              {canModify && lesson.trang_thai !== 'archived' ? (
                <button disabled={Boolean(lessonDeletingId)} onClick={(event) => { stopTileAction(event); event.currentTarget.closest('details')?.removeAttribute('open'); askDeleteLesson(lesson); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-wait disabled:opacity-60">
                  {lessonDeletingId === lesson.lesson_id ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} {lessonDeletingId === lesson.lesson_id ? 'Đang lưu trữ...' : 'Lưu trữ bài học'}
                </button>
              ) : null}
              {currentUserIsAdmin && lesson.trang_thai === 'archived' ? (
                <>
                  <button disabled={Boolean(lessonDeletingId)} onClick={(event) => { stopTileAction(event); event.currentTarget.closest('details')?.removeAttribute('open'); void askPurgeLesson(lesson, 'preserve_grades'); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold text-rose-800 hover:bg-rose-100 disabled:cursor-wait disabled:opacity-60">
                    <Trash2 className="h-3.5 w-3.5" /> Xóa vĩnh viễn • giữ điểm
                  </button>
                  <button disabled={Boolean(lessonDeletingId)} onClick={(event) => { stopTileAction(event); event.currentTarget.closest('details')?.removeAttribute('open'); void askPurgeLesson(lesson, 'purge_all'); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:cursor-wait disabled:opacity-60">
                    <XCircle className="h-3.5 w-3.5" /> Xóa toàn bộ dữ liệu
                  </button>
                </>
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
            onClick={(event) => { stopCardAction(event); currentUserIsAdmin || user.vai_tro === 'teacher' ? void openLessonTeacherMode(lesson) : void openLesson(lesson); }}
            className="lesson-action-button bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
            aria-label={currentUserIsAdmin || user.vai_tro === 'teacher' ? 'Mở chế độ giảng dạy' : 'Mở bài học'}
            title={currentUserIsAdmin || user.vai_tro === 'teacher' ? 'Mở chế độ giảng dạy' : 'Mở bài học'}
          >
            {currentUserIsAdmin || user.vai_tro === 'teacher' ? <MonitorPlay className="h-3.5 w-3.5 shrink-0" /> : <Eye className="h-3.5 w-3.5 shrink-0" />}<span className="lesson-action-label">{currentUserIsAdmin || user.vai_tro === 'teacher' ? 'Giảng dạy' : 'Mở'}</span>
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
          {canModify && (
            <button
              onClick={(event) => { stopCardAction(event); void handleToggleLessonAccessMode(lesson); }}
              disabled={Boolean(lessonAccessModeUpdatingId)}
              className={`lesson-action-button disabled:cursor-wait disabled:opacity-60 ${lesson.access_mode === 'self_study' ? 'bg-violet-50 text-violet-700 hover:bg-violet-100' : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'}`}
              aria-label="Quản lý tự học theo lớp"
              title="Quản lý tự học theo lớp"
            >
              {lessonAccessModeUpdatingId === lesson.lesson_id ? <RefreshCw className="h-3.5 w-3.5 shrink-0 animate-spin" /> : <BookOpenCheck className="h-3.5 w-3.5 shrink-0" />}
              <span className="lesson-action-label">Tự học theo lớp</span>
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
                {canModify && lesson.trang_thai !== 'archived' && (
                  <button disabled={Boolean(lessonDeletingId)} onClick={(event) => { stopCardAction(event); event.currentTarget.closest('details')?.removeAttribute('open'); askDeleteLesson(lesson); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-wait disabled:opacity-60">
                    {lessonDeletingId === lesson.lesson_id ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} {lessonDeletingId === lesson.lesson_id ? 'Đang lưu trữ...' : 'Lưu trữ bài học'}
                  </button>
                )}
                {currentUserIsAdmin && lesson.trang_thai === 'archived' && (
                  <>
                    <button disabled={Boolean(lessonDeletingId)} onClick={(event) => { stopCardAction(event); event.currentTarget.closest('details')?.removeAttribute('open'); void askPurgeLesson(lesson, 'preserve_grades'); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-rose-800 transition hover:bg-rose-100 disabled:cursor-wait disabled:opacity-60">
                      <Trash2 className="h-3.5 w-3.5" /> Xóa vĩnh viễn • giữ điểm
                    </button>
                    <button disabled={Boolean(lessonDeletingId)} onClick={(event) => { stopCardAction(event); event.currentTarget.closest('details')?.removeAttribute('open'); void askPurgeLesson(lesson, 'purge_all'); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-wait disabled:opacity-60">
                      <XCircle className="h-3.5 w-3.5" /> Xóa toàn bộ dữ liệu
                    </button>
                  </>
                )}
              </div>
            </details>
          )}
        </div>
      );
    }

    return (
      <div className="flex flex-wrap gap-2">
        <button onClick={(event) => { stopCardAction(event); currentUserIsAdmin || user.vai_tro === 'teacher' ? void openLessonTeacherMode(lesson) : void openLesson(lesson); }} className="rounded-full bg-white px-3 py-2 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50">
          {currentUserIsAdmin || user.vai_tro === 'teacher' ? <span className="inline-flex items-center gap-1"><MonitorPlay className="h-3.5 w-3.5" /> Giảng dạy</span> : 'Xem bài'}
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
          <button disabled={Boolean(lessonDeletingId)} onClick={(event) => { stopCardAction(event); askDeleteLesson(lesson); }} className="rounded-full bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-wait disabled:opacity-60">
            <span className="inline-flex items-center gap-1">{lessonDeletingId === lesson.lesson_id ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} {lessonDeletingId === lesson.lesson_id ? 'Đang xóa...' : 'Xóa'}</span>
          </button>
        )}
      </div>
    );
  };

  const renderReviewPracticeSection = () => {
    if (activeMenu === 'approvals' || !standardReviewPractices.length) return null;
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
          <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600">{standardReviewPractices.length} bài ôn tập phù hợp</span>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {standardReviewPractices.map((review) => {
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

  const renderInteractivePracticeHub = () => {
    const canCreate = user?.vai_tro !== 'student';
    const yearOptions = Array.from(new Set(reviewPractices.map((item) => String(item.nam_hoc || '')).filter(Boolean))).sort().reverse();
    const semesterOptions = Array.from(new Set(reviewPractices.map((item) => String(item.hoc_ky || '')).filter(Boolean))).sort();
    const subjectOptions = Array.from(new Set(subjects.map((item) => String(item.ten_mon || '')).filter(Boolean))).sort((a,b)=>a.localeCompare(b,'vi'));
    return (
      <div className="space-y-5">
        <section className="rounded-[30px] bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 p-6 text-white shadow-xl shadow-indigo-100 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <p className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-black uppercase tracking-[0.14em]"><BookOpenCheck className="h-4 w-4" /> Luyện tập tương tác</p>
              <h2 className="mt-3 text-2xl font-black sm:text-3xl">Quản lý luyện tập theo từng bài học</h2>
              <p className="mt-2 text-sm leading-6 text-white/85">Cấu hình thời gian, số lượt, điểm đạt và quyền truy cập theo lớp. Học sinh xem điểm tốt nhất ngay trên thư viện luyện tập.</p>
            </div>
            {canCreate ? <button type="button" onClick={openInteractivePracticeCreator} className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-black text-indigo-700 shadow-lg shadow-indigo-950/10"><UploadCloud className="h-4 w-4" /> Tải file bài tập</button> : null}
          </div>
        </section>

        <DataToolbar
          title="Danh sách bài luyện tập"
          description="Tìm kiếm và lọc theo năm học, học kỳ, khối, lớp, môn và trạng thái truy cập."
          searchValue={practiceSearch}
          onSearchChange={setPracticeSearch}
          searchPlaceholder="Tìm bài luyện tập, bài học, file nguồn..."
          compact
          filters={[
            { key: 'year', label: 'Năm học', value: practiceYearFilter, onChange: setPracticeYearFilter, options: ['Tất cả', ...yearOptions].map((value)=>({value,label:value==='Tất cả'?'Tất cả năm học':value})) },
            { key: 'semester', label: 'Học kỳ', value: practiceSemesterFilter, onChange: setPracticeSemesterFilter, options: ['Tất cả', ...semesterOptions].map((value)=>({value,label:value==='Tất cả'?'Tất cả học kỳ':value})) },
            { key: 'grade', label: 'Khối', value: practiceGradeFilter, onChange: setPracticeGradeFilter, options: ['Tất cả', ...gradeFilterOptions].map((value)=>({value,label:value==='Tất cả'?'Tất cả khối':`Khối ${value}`})) },
            { key: 'class', label: 'Lớp', value: practiceClassFilter, onChange: setPracticeClassFilter, options: [{value:'Tất cả',label:'Tất cả lớp'}, ...practiceClassOptions] },
            { key: 'subject', label: 'Môn', value: practiceSubjectFilter, onChange: setPracticeSubjectFilter, options: ['Tất cả', ...subjectOptions].map((value)=>({value,label:value==='Tất cả'?'Tất cả môn học':value})) },
            { key: 'status', label: 'Trạng thái', value: practiceStatusFilter, onChange: setPracticeStatusFilter, options: [
              {value:'Tất cả',label:'Tất cả trạng thái'},{value:'open',label:'Đang mở'},{value:'locked',label:'Đang khóa'},{value:'scheduled',label:'Chưa đến giờ'},{value:'closed',label:'Đã kết thúc'},{value:'draft',label:'Bản nháp'},
            ] },
          ]}
        />

        {interactivePractices.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {interactivePractices.map((practice) => {
              const subjectName = subjects.find((item) => item.mon_id === practice.mon_id)?.ten_mon || practice.mon_hoc || practice.mon_id || 'Môn học';
              const linkedLesson = lessonsById.get(practice.lesson_id || String(practice.lesson_ids || '').split(',')[0]);
              const canModify = currentUserIsAdmin || (user?.vai_tro === 'teacher' && practice.nguoi_tao_id === user.user_id);
              const config = resolvePracticeConfig(practice, undefined);
              const ownAttempts = user?.vai_tro === 'student' ? myReviewAttempts.filter((item) => item.review_id === practice.review_id) : [];
              const summary = practiceAttemptSummary(ownAttempts);
              const studentAccess = user?.vai_tro === 'student' ? getPracticeAccessState(practice, config, user.lop_id || '', summary.count) : null;
              const selectedClassAccess = user?.vai_tro !== 'student' && practiceClassFilter !== 'Tất cả' ? getPracticeAccessState(practice, config, practiceClassFilter, 0) : null;
              const lockedCount = config.target_class_ids.filter((id) => config.locked_class_ids.includes(id)).length;
              const accessLabel = studentAccess?.label || selectedClassAccess?.label || (String(practice.trang_thai || 'active') !== 'active' ? 'Bản nháp' : lockedCount ? `${lockedCount} lớp đang khóa` : 'Đang mở');
              const accessTone = studentAccess?.key === 'open' || (!studentAccess && !selectedClassAccess && !lockedCount && String(practice.trang_thai || 'active') === 'active') ? 'bg-emerald-50 text-emerald-700' : studentAccess?.key === 'locked' || selectedClassAccess?.key === 'locked' || lockedCount ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700';
              const passed = summary.best !== null && summary.best >= config.pass_score;
              return (
                <article key={practice.review_id} className="rounded-[26px] border border-indigo-100 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
                  <div className="flex items-start justify-between gap-3">
                    <span className="rounded-full bg-indigo-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-indigo-700">Bài {linkedLesson?.lesson_number || '-'} • Khối {practice.khoi}</span>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${accessTone}`}>{accessLabel}</span>
                  </div>
                  <h3 className="mt-3 line-clamp-2 text-lg font-black text-slate-900">{practice.tieu_de}</h3>
                  <p className="mt-2 text-sm font-semibold text-slate-500">{subjectName} • {practice.hoc_ky || 'HK1'} • {practice.nam_hoc || '-'}</p>
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">Gắn với: {linkedLesson?.tieu_de || practice.source_lesson_titles || 'Bài học liên kết'}</p>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold">
                    <span className="rounded-full bg-slate-50 px-3 py-1.5 text-slate-600">{Number(practice.so_cau || 0)} mục</span>
                    <span className="rounded-full bg-slate-50 px-3 py-1.5 text-slate-600">⏱ {config.time_limit_minutes ? `${config.time_limit_minutes} phút` : 'Không giới hạn'}</span>
                    <span className="rounded-full bg-slate-50 px-3 py-1.5 text-slate-600">🔁 {config.max_attempts || '∞'} lượt</span>
                    <span className="rounded-full bg-slate-50 px-3 py-1.5 text-slate-600">🎯 Đạt {config.pass_score}/10</span>
                  </div>
                  {user?.vai_tro === 'student' ? <div className="mt-4 rounded-2xl bg-slate-50 p-3 text-sm">
                    {summary.count ? <><div className="flex items-center justify-between"><span className="font-bold text-slate-600">Điểm tốt nhất</span><span className={`text-lg font-black ${passed?'text-emerald-600':'text-amber-600'}`}>{summary.best?.toFixed(summary.best % 1 === 0 ? 0 : 1)}/10</span></div><p className="mt-1 text-xs font-semibold text-slate-500">Gần nhất: {summary.latest ?? '-'} • Đã làm {summary.count}/{config.max_attempts || '∞'} lượt • {passed?'✅ Đạt':'🟠 Chưa đạt'}</p></> : <p className="font-bold text-slate-500">Chưa luyện tập</p>}
                    {studentAccess && !studentAccess.canStart ? <p className="mt-2 text-xs font-bold text-rose-600">{studentAccess.reason}</p> : null}
                  </div> : <div className="mt-4 rounded-2xl bg-slate-50 p-3 text-xs font-semibold text-slate-600"><p>{config.target_class_ids.length || classes.filter(c=>String(c.khoi||'')===String(practice.khoi||'')).length} lớp áp dụng • {lockedCount} lớp đang khóa</p>{config.available_from?<p className="mt-1">Mở: {formatPracticeDateTime(config.available_from)}</p>:null}{config.available_until?<p>Đóng: {formatPracticeDateTime(config.available_until)}</p>:null}</div>}
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                    <button type="button" disabled={user?.vai_tro === 'student' && studentAccess?.canStart === false} onClick={() => void openInteractivePractice(practice)} className="rounded-full bg-indigo-600 px-4 py-2 text-xs font-black text-white shadow-md shadow-indigo-100 hover:bg-indigo-700 disabled:bg-slate-300 disabled:shadow-none">{user?.vai_tro === 'student' ? 'Luyện tập' : 'Xem thử'}</button>
                    {user?.vai_tro !== 'student' ? <button type="button" onClick={() => void openReviewPracticeResults(practice)} className="rounded-full bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100">Kết quả</button> : null}
                    {canModify ? <button type="button" onClick={() => void openPracticeSettings(practice)} className="rounded-full bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-100"><Settings className="mr-1 inline h-3.5 w-3.5" />Cấu hình</button> : null}
                    {canModify ? <button type="button" onClick={() => askDeleteReviewPractice(practice)} className="rounded-full bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100">Xóa</button> : null}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="rounded-[28px] border border-dashed border-slate-200 bg-white px-6 py-14 text-center shadow-sm"><BookOpenCheck className="mx-auto h-10 w-10 text-slate-300" /><h3 className="mt-3 font-black text-slate-800">Chưa có bài luyện tập phù hợp</h3><p className="mt-2 text-sm text-slate-500">{canCreate ? 'Thay đổi bộ lọc hoặc tải file HTML bài tập tương tác để bắt đầu.' : 'Giáo viên chưa phát hành bài luyện tập phù hợp cho lớp của em.'}</p></div>
        )}
      </div>
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

  const renderAnalyticsScopeNotice = () => (
    <div className={`rounded-2xl border px-4 py-3 text-sm ${analyticsProgressError ? 'border-rose-200 bg-rose-50 text-rose-800' : analyticsHasServerScope ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
      <div className="flex flex-wrap items-center gap-2 font-semibold">
        {isAnalyticsProgressLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
        {isAnalyticsProgressLoading
          ? 'Đang tải tiến trình đúng phạm vi đã chọn...'
          : analyticsProgressError
            ? 'Không tải được dữ liệu tiến độ mới nhất từ Firestore.'
            : analyticsHasServerScope
              ? 'Đang dùng truy vấn theo phạm vi để tiết kiệm Firestore Spark.'
              : 'Chưa tải tiến trình toàn trường để bảo vệ hạn mức Firestore Spark.'}
      </div>
      <p className="mt-1 text-xs leading-5 opacity-85">
        {analyticsProgressError
          ? `${analyticsProgressError} Dữ liệu gần nhất được giữ nguyên; hệ thống không quy lỗi tải thành 0%.`
          : analyticsHasServerScope
            ? 'Thay đổi Khối, Lớp hoặc Bài học sẽ chỉ tải nhóm dữ liệu cần thiết. Tiến độ video được làm mới tự động khoảng 60 giây khi màn hình này đang mở.'
            : 'Hãy chọn ít nhất Khối, Lớp hoặc Bài học. Hệ thống sẽ không tự quét toàn bộ learningProgress khi chưa có phạm vi.'}
      </p>
    </div>
  );

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
      .filter((item) => Number(item.score_model_version || 0) < 3 || item.score_status === 'finalized')
      .map((item) => item.assessment_score)
      .filter((score): score is number => score !== undefined && Number.isFinite(Number(score)));
    const studentAverageScore = validStudentScores.length
      ? validStudentScores.reduce((sum, score) => sum + Number(score), 0) / validStudentScores.length
      : undefined;
    const availableStudentLessons = isStudent
      ? visibleLessonsForCurrentUser.filter((lesson) => lesson.is_locked !== true && !getLessonScheduleAccess(lesson).blocked)
      : [];
    const inProgressStudentCount = studentProgressItems.filter((item) => item.status === 'in_progress').length;
    const completedStudentCount = studentProgressItems.filter((item) => item.status === 'completed').length;
    const primaryLesson = isStudent
      ? featuredLearningLessons.find((lesson) => lesson.is_locked !== true && !getLessonScheduleAccess(lesson).blocked && currentStudentProgressByLesson[lesson.lesson_id]?.status === 'in_progress')
        || featuredLearningLessons.find((lesson) => lesson.is_locked !== true && !getLessonScheduleAccess(lesson).blocked)
        || featuredLearningLessons[0]
      : featuredLearningLessons[0];
    const primaryLessonScheduleAccess = isStudent && primaryLesson ? getLessonScheduleAccess(primaryLesson) : null;
    const primaryLessonBlocked = Boolean(primaryLesson && (primaryLesson.is_locked === true || primaryLessonScheduleAccess?.blocked));

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
                      onClick={() => !primaryLessonBlocked && void openLesson(primaryLesson)}
                      disabled={primaryLessonBlocked}
                      className="shrink-0 rounded-xl bg-white px-3.5 py-2 text-xs font-black text-indigo-700 shadow-sm transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-white/65"
                    >
                      {primaryLesson.is_locked === true
                        ? 'Đang khóa'
                        : primaryLessonScheduleAccess?.reason === 'before_start'
                          ? 'Chưa đến giờ'
                          : primaryLessonScheduleAccess?.reason === 'after_end'
                            ? 'Đã hết giờ'
                            : currentStudentProgressByLesson[primaryLesson.lesson_id]?.status === 'in_progress'
                              ? 'Tiếp tục học'
                              : 'Mở bài'}
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

        {renderAnalyticsScopeNotice()}

        <LearningAnalyticsPanel
          rows={analyticsRows}
          schoolYears={schoolYears}
          availableGrades={gradeFilterOptions}
          onRefresh={async () => { await loadAppData(); await loadScopedAnalyticsProgress(); }}
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
    <div className="space-y-4">
      {renderAnalyticsScopeNotice()}
      <LearningAnalyticsPanel
      rows={analyticsRows}
      schoolYears={schoolYears}
      availableGrades={gradeFilterOptions}
      onRefresh={async () => { await loadAppData(); await loadScopedAnalyticsProgress(); }}
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
    </div>
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
                  <Eye className="h-4 w-4" /> Mở bài
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
                <td className="px-5 py-4 text-sm text-slate-600">{item.vai_tro === 'student' ? (item.ten_lop_hien_thi || `${item.khoi ? `Khối ${item.khoi}` : ''}${item.lop_id ? ` • Lớp ${classLabelById.get(item.lop_id) || item.lop_id}` : ''}`) : item.vai_tro === 'teacher' ? formatManagedGrades(item) : '-'}</td>
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
                  {currentUserIsAdmin && (
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => void handleRunSystemDiagnostics()}
                      className="mt-2 inline-flex items-center gap-2 rounded-xl bg-slate-800 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-slate-900 disabled:cursor-wait disabled:opacity-60"
                    >
                      <RefreshCw className={`h-4 w-4 ${isSubmitting ? 'animate-spin' : ''}`} />
                      {isSubmitting ? 'Đang quét...' : 'Quét chẩn đoán dữ liệu hỗ trợ'}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {currentUserIsAdmin && systemDiagnostics && (
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.95fr_1.05fr]">
                <div className="rounded-[28px] bg-white p-8 shadow-sm ring-1 ring-slate-100">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-bold text-slate-900">Chẩn đoán dữ liệu hệ thống</h2>
                      <p className="mt-2 text-sm leading-6 text-slate-500">Khối này quét lớp dữ liệu Google Sheet/legacy hỗ trợ để phát hiện nhanh các bản ghi lệch logic giữa tài khoản, lớp, môn, bài học và tiến trình học tập.</p>
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
            {currentUserIsAdmin ? (
              <button disabled={lessonIntegrityRepairing} onClick={() => void handleRepairLessonIntegrity()} className="inline-flex items-center gap-2 rounded-xl bg-slate-700 px-3.5 py-2.5 text-xs font-bold text-white shadow-md shadow-slate-700/15 disabled:cursor-wait disabled:opacity-60" title="Quét và sửa registry bài học mồ côi">
                <RefreshCw className={`h-4 w-4 ${lessonIntegrityRepairing ? 'animate-spin' : ''}`} /> {lessonIntegrityRepairing ? 'Đang kiểm tra...' : 'Kiểm tra dữ liệu'}
              </button>
            ) : null}
            <button onClick={openReviewPracticeCreator} className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-3.5 py-2.5 text-xs font-bold text-white shadow-md shadow-amber-600/15"><BookOpenCheck className="h-4 w-4" /> Tạo bài ôn tập</button>
            <button onClick={openComposerForCreate} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-3.5 py-2.5 text-xs font-bold text-white shadow-md shadow-indigo-600/15">
              <Plus className="h-4 w-4" /> Tạo bài học
            </button>
          </div>,
        );

      case 'practice':
        return renderInteractivePracticeHub();

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
                    ['Khối', user.vai_tro === 'teacher' ? formatManagedGrades(user) : (user.khoi || '-')],
                    ['Lớp', user.vai_tro === 'teacher' ? 'Không áp dụng' : (user.lop_id || '-')],
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
        onToggleClassmate={handleToggleCoLearningClassmate}
        onPasswordChange={(userId, password) => {
          setCoLearningPasswords((current) => ({ ...current, [userId]: password }));
          setCoLearningError('');
        }}
        onStudyAlone={handleStudyAlone}
        onResumeCoLearning={handleResumeCoLearning}
        onStartCoLearning={handleStartCoLearning}
        onClose={closeCoLearningModal}
      />

      {selfStudyAccessLesson ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/55 p-4" onClick={() => !selfStudyAccessSaving && setSelfStudyAccessLesson(null)}>
          <div className="w-full max-w-xl overflow-hidden rounded-3xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-5 text-white">
              <div><p className="text-xs font-black uppercase tracking-[0.18em] text-indigo-100">Quản lý tự học theo lớp</p><h3 className="mt-1 text-xl font-black">{selfStudyAccessLesson.tieu_de}</h3><p className="mt-1 text-sm text-indigo-100">Chọn một hoặc nhiều lớp được phép tự mở toàn bộ hoạt động.</p></div>
              <button type="button" disabled={selfStudyAccessSaving} onClick={() => setSelfStudyAccessLesson(null)} className="rounded-xl bg-white/15 p-2 hover:bg-white/25 disabled:opacity-50"><XCircle className="h-5 w-5" /></button>
            </div>
            <div className="p-6">
              {(() => {
                const options = selfStudyClassOptionsForLesson(selfStudyAccessLesson);
                const allSelected = options.length > 0 && options.every((item) => selfStudySelectedClassIds.includes(item.lop_id));
                return <>
                  <div className="mb-4 flex flex-wrap gap-2">
                    <button type="button" onClick={() => setSelfStudySelectedClassIds(options.map((item) => item.lop_id))} className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100"><Unlock className="mr-1 inline h-3.5 w-3.5" />Mở tất cả lớp</button>
                    <button type="button" onClick={() => setSelfStudySelectedClassIds([])} className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700 hover:bg-amber-100"><Lock className="mr-1 inline h-3.5 w-3.5" />Khóa tất cả lớp</button>
                    <span className="ml-auto rounded-full bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600">{selfStudySelectedClassIds.length}/{options.length} lớp đang mở</span>
                  </div>
                  <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                    {options.map((item) => {
                      const checked = selfStudySelectedClassIds.includes(item.lop_id);
                      return <label key={item.lop_id} className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-3 ${checked ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
                        <input type="checkbox" checked={checked} onChange={() => setSelfStudySelectedClassIds((current) => checked ? current.filter((id) => id !== item.lop_id) : [...current, item.lop_id])} className="h-4 w-4" />
                        <div className="min-w-0 flex-1"><p className="font-bold text-slate-800">{item.ten_lop || item.lop_id}</p><p className="text-xs text-slate-500">{item.lop_id} • Khối {item.khoi}</p></div>
                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${checked ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{checked ? 'TỰ HỌC' : 'GV ĐIỀU KHIỂN'}</span>
                      </label>;
                    })}
                    {!options.length ? <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-700">Chưa tìm thấy lớp phù hợp với khối của bài học.</div> : null}
                  </div>
                  <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-xs leading-5 text-slate-600">Khóa tự học không phải khóa toàn bài. Lớp chưa được mở tự học vẫn có thể học theo các hoạt động giáo viên mở từng mục. {allSelected ? 'Hiện tất cả lớp đều được tự học.' : ''}</div>
                </>;
              })()}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
              <button type="button" disabled={selfStudyAccessSaving} onClick={() => setSelfStudyAccessLesson(null)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600">Hủy</button>
              <button type="button" disabled={selfStudyAccessSaving} onClick={() => void saveSelfStudyAccess()} className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-200 disabled:opacity-60">{selfStudyAccessSaving ? 'Đang lưu...' : 'Lưu phạm vi tự học'}</button>
            </div>
          </div>
        </div>
      ) : null}

      <PreLessonVideoModal
        isOpen={isPreLessonVideoOpen}
        lesson={preLessonVideoLesson}
        user={user}
        onClose={() => { setIsPreLessonVideoOpen(false); setPreLessonVideoLesson(null); }}
        onProgressChange={(preProgress) => {
          setProgressRecordsSync((current) => {
            const key = `${preProgress.user_id}_${preProgress.lesson_id}`;
            const existingIndex = current.findIndex((item) => `${item.user_id}_${item.lesson_id}` === key);
            const patch = {
              pre_lesson_status: preProgress.video_status,
              pre_lesson_watch_percent: preProgress.watch_percent,
              pre_lesson_watched_seconds: preProgress.watched_seconds,
              pre_lesson_completed_at: preProgress.completed_at,
              pre_lesson_completed_before_deadline: preProgress.completed_before_deadline,
              pre_lesson_preparation_status: preProgress.preparation_status,
            };
            if (existingIndex >= 0) {
              return current.map((item, index) => index === existingIndex ? { ...item, ...patch } : item);
            }
            const lessonMeta = lessonsById.get(preProgress.lesson_id);
            return [...current, {
              progress_id: `${preProgress.user_id}_${preProgress.lesson_id}`,
              user_id: preProgress.user_id,
              lesson_id: preProgress.lesson_id,
              ownerUid: preProgress.ownerUid || '',
              khoi: preProgress.khoi,
              lop_id: preProgress.lop_id || '',
              status: 'not_started',
              study_mode: 'single',
              completion_percent: 0,
              completed_steps: 0,
              total_steps: 0,
              quiz_correct: 0,
              quiz_total: 0,
              quiz_percent: 0,
              result_state: 'valid',
              lesson_title: lessonMeta?.tieu_de || '',
              mon_hoc: lessonMeta?.mon_hoc || '',
              updated_at: preProgress.last_watched_at || preProgress.completed_at || preProgress.started_at || new Date().toISOString(),
              step_details: {} as any,
              ...patch,
            } as LessonProgressRecord];
          });
        }}
      />

      {isLessonViewerOpen && <LessonViewer
        isOpen={isLessonViewerOpen}
        lesson={selectedLesson}
        content={selectedLessonContent}
        aiConfig={aiConfig}
        onOpenConfig={openAIConfigModal}
        onClose={handleCloseLessonViewer}
        onStageChange={setViewerStage}
        progress={selectedLesson && user.vai_tro === 'student' ? (lessonViewerMode === 'retake' ? activeRetakeAttempt?.progress || null : currentStudentProgressByLesson[selectedLesson.lesson_id] || null) : null}
        attemptMode={lessonViewerMode}
        officialScore={selectedLesson && user.vai_tro === 'student' ? currentStudentProgressByLesson[selectedLesson.lesson_id]?.assessment_score : undefined}
        retakeAttemptNumber={activeRetakeAttempt?.attempt_number}
        retakeIsOfficial={activeRetakeAttempt?.is_official === true || activeRetakeAttempt?.retake_mode === 'official_update'}
        onStepOpened={handleLessonViewerStepOpened}
        onStepViewedComplete={handleLessonViewerStepViewedComplete}
        onQuizMetricsChange={handleLessonViewerQuizMetricsChange}
        onFinalExamSubmit={handleLessonViewerFinalExamSubmit}
        coLearningGroupSize={activeCoLearningSession && selectedLesson?.lesson_id === activeCoLearningSession.lesson_id ? getCoLearningSessionUserIds(activeCoLearningSession).length : 1}
        onManageCoLearning={handleManageActiveCoLearning}
        onOpenPreLessonVideo={user.vai_tro === 'student' && selectedLesson ? () => {
          setPreLessonVideoLesson(selectedLesson);
          setIsPreLessonVideoOpen(true);
        } : undefined}
        comments={lessonComments}
        isCommentsLoading={isLessonCommentsLoading}
        currentUserRole={user.vai_tro}
        currentUser={user}
        classes={classes}
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

      {isInteractivePracticeViewerOpen && selectedInteractivePractice && selectedInteractiveManifest && user && <InteractivePracticeViewer
        isOpen={isInteractivePracticeViewerOpen}
        review={selectedInteractivePractice}
        manifest={selectedInteractiveManifest}
        currentUser={user}
        coLearningSession={activePracticeCoLearningSession}
        allowRetry={selectedInteractiveAllowRetry}
        config={selectedInteractiveConfig}
        initialAttemptCount={selectedInteractiveAttemptCount}
        previewOnly={user.vai_tro !== 'student'}
        onClose={() => {
          setIsInteractivePracticeViewerOpen(false);
          setSelectedInteractivePractice(null);
          setSelectedInteractiveManifest(null);
          setSelectedInteractiveConfig(undefined);
          setSelectedInteractiveAttemptCount(0);
          setActivePracticeCoLearningSession(null);
          setPendingInteractivePractice(null);
          setCoLearningPurpose('lesson');
        }}
        onSubmit={handleSubmitInteractivePractice}
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

      {user.vai_tro !== 'student' && isInteractivePracticeImportOpen && (
      <InteractivePracticeImportModal
        isOpen={isInteractivePracticeImportOpen}
        lessons={lessonSourcePool}
        subjects={subjects}
        classes={classes}
        isSubmitting={isSubmitting}
        onClose={() => setIsInteractivePracticeImportOpen(false)}
        onSubmit={handleCreateInteractivePractice}
      />
      )}

      {user.vai_tro !== 'student' && isPracticeSettingsOpen && (
      <PracticeSettingsModal
        isOpen={isPracticeSettingsOpen}
        review={practiceSettingsReview}
        config={practiceSettingsConfig}
        classes={classes}
        isSubmitting={isSubmitting}
        onClose={() => { setIsPracticeSettingsOpen(false); setPracticeSettingsReview(null); setPracticeSettingsConfig(undefined); }}
        onSave={handleSavePracticeSettings}
      />
      )}

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

      <AnimatePresence>
        {lessonPurgeProgress ? (
          <div className="fixed inset-0 z-[12600] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.96, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 10 }} className="relative z-10 w-full max-w-xl overflow-hidden rounded-[30px] bg-white shadow-2xl">
              <div className="bg-gradient-to-r from-rose-600 to-red-500 px-6 py-5 text-white">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-white/80">Xóa vĩnh viễn bài học</p>
                    <h3 className="mt-2 text-xl font-black">{lessonPurgeProgress.lessonTitle}</h3>
                    <p className="mt-1 text-sm text-white/85">{lessonPurgeProgress.mode === 'preserve_grades' ? 'Giữ snapshot điểm chính thức' : 'Xóa toàn bộ dữ liệu học sinh'}</p>
                  </div>
                  {lessonPurgeProgress.status !== 'running' ? (
                    <button type="button" onClick={() => setLessonPurgeProgress(null)} className="rounded-full bg-white/15 p-2 hover:bg-white/25" aria-label="Đóng"><XCircle className="h-5 w-5" /></button>
                  ) : null}
                </div>
              </div>
              <div className="space-y-5 p-6">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Tiến độ</p><p className="mt-1 text-2xl font-black text-slate-900">{lessonPurgeProgress.status === 'completed' ? 100 : Math.min(99, Math.round((lessonPurgeProgress.processed / Math.max(1, lessonPurgeProgress.total)) * 100))}%</p></div>
                  <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Đã xử lý</p><p className="mt-1 text-2xl font-black text-slate-900">{lessonPurgeProgress.processed}<span className="text-sm text-slate-400">/{lessonPurgeProgress.total || '?'}</span></p></div>
                  <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Điểm lưu</p><p className="mt-1 text-2xl font-black text-slate-900">{lessonPurgeProgress.archivedGrades}</p></div>
                </div>
                <div>
                  <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-gradient-to-r from-rose-500 to-orange-500 transition-all duration-300" style={{ width: `${lessonPurgeProgress.status === 'completed' ? 100 : Math.min(99, Math.max(3, Math.round((lessonPurgeProgress.processed / Math.max(1, lessonPurgeProgress.total)) * 100)))}%` }} />
                  </div>
                  <p className="mt-3 text-sm font-bold text-slate-700">{lessonPurgeProgress.status === 'completed' ? 'Đã hoàn tất xóa vĩnh viễn.' : `Đang xử lý: ${lessonPurgePhaseLabel(lessonPurgeProgress.phase)}`}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">Tiến trình được lưu sau từng batch. Có thể tiếp tục nếu mạng hoặc quota Firestore gián đoạn.</p>
                </div>
                {lessonPurgeProgress.status === 'retryable' ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                    <b>Tiến trình đang tạm dừng.</b> {lessonPurgeProgress.error || 'Hãy thử lại khi kết nối/quota ổn định.'}
                  </div>
                ) : null}
              </div>
              <div className="flex justify-end gap-3 border-t border-slate-100 px-6 py-4">
                {lessonPurgeProgress.status === 'retryable' ? (
                  <>
                    <button type="button" onClick={() => setLessonPurgeProgress(null)} className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50">Đóng</button>
                    <button type="button" disabled={Boolean(lessonDeletingId)} onClick={() => void resumeLessonPermanentPurge()} className="inline-flex items-center gap-2 rounded-2xl bg-rose-600 px-4 py-2.5 text-sm font-black text-white hover:bg-rose-700 disabled:opacity-60">
                      {lessonDeletingId ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Tiếp tục xóa
                    </button>
                  </>
                ) : lessonPurgeProgress.status === 'completed' ? (
                  <button type="button" onClick={() => setLessonPurgeProgress(null)} className="rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white hover:bg-emerald-700">Hoàn tất</button>
                ) : (
                  <span className="inline-flex items-center gap-2 text-sm font-bold text-slate-500"><RefreshCw className="h-4 w-4 animate-spin" /> Đang xóa an toàn theo từng batch…</span>
                )}
              </div>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>

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
        accountOperation={confirmDialog.accountOperation}
        onConfirm={(credentials) => void confirmDialog.onConfirm(credentials)}
      />

      <AnimatePresence>
        {retakeChoiceLesson ? (
          <div className="fixed inset-0 z-[12500] flex items-center justify-center p-4">
            <motion.button type="button" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setRetakeChoiceLesson(null)} className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm" aria-label="Đóng" />
            <motion.div initial={{ opacity: 0, scale: 0.96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 8 }} className="relative z-10 w-full max-w-xl rounded-[28px] bg-white p-6 shadow-2xl">
              <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-violet-600">Bài đã hoàn thành</p><h3 className="mt-2 text-xl font-black text-slate-900">{retakeChoiceLesson.tieu_de}</h3></div><button type="button" onClick={() => setRetakeChoiceLesson(null)} className="rounded-xl bg-slate-100 p-2 text-slate-500 hover:bg-slate-200"><XCircle className="h-5 w-5" /></button></div>
              {Number(currentStudentProgressByLesson[retakeChoiceLesson.lesson_id]?.official_retake_remaining || 0) > 0 ? (
                <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-900"><b>Giáo viên đã cấp 1 lượt học lại cập nhật điểm.</b> Điểm cũ đã được chuyển vào lịch sử và tạm ẩn khỏi bảng điểm. Khi em nộp lượt mới, điểm mới sẽ trở thành điểm chính thức.</div>
              ) : (
                <div className="mt-5 rounded-2xl border border-violet-100 bg-violet-50 p-4 text-sm leading-6 text-violet-900"><b>Học lại để luyện tập.</b> Điểm học lại được lưu riêng và không thay thế điểm chính thức{Number.isFinite(Number(currentStudentProgressByLesson[retakeChoiceLesson.lesson_id]?.assessment_score)) ? ` ${Number(currentStudentProgressByLesson[retakeChoiceLesson.lesson_id]?.assessment_score).toFixed(1)}/10` : ''}.</div>
              )}
              {retakeHistory.length ? <p className="mt-3 text-xs font-semibold text-slate-500">Đã có {retakeHistory.length} phiên học lại{retakeHistory[0]?.reference_score !== undefined ? ` • gần nhất ${Number(retakeHistory[0].reference_score).toFixed(1)}/10` : ''}.</p> : null}
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <button type="button" onClick={() => void handleReviewOfficialLesson()} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 hover:bg-slate-50">Xem lại bài chính thức</button>
                {Number(currentStudentProgressByLesson[retakeChoiceLesson.lesson_id]?.official_retake_remaining || 0) > 0 ? <button type="button" onClick={() => void handleStartOfficialRetake()} className="rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-black text-white shadow-lg shadow-emerald-200 hover:bg-emerald-700">Học lại để cập nhật điểm</button> : null}
                {retakeChoiceLesson.allow_retake_after_completion === true ? <button type="button" onClick={() => void handleStartReferenceRetake()} className="rounded-2xl bg-violet-600 px-4 py-3 text-sm font-black text-white shadow-lg shadow-violet-200 hover:bg-violet-700">Học lại luyện tập</button> : null}
              </div>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>

      {isAIConfigOpen && <AIConfigModal
        isOpen={isAIConfigOpen}
        onClose={closeAIConfigModal}
        config={aiConfig}
        user={user}
        onSave={handleSaveAIConfig}
        onDelete={handleDeleteAIConfig}
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
