import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ArrowDownAZ,
  ArrowUpAZ,
  AlertTriangle,
  BarChart3,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Download,
  GraduationCap,
  Layers,
  RefreshCw,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Trophy,
  UserCheck,
  Users,
  UserX,
  ShieldAlert,
  Settings2,
  Save,
  Video,
  X,
} from 'lucide-react';
import { Account, AssessmentMilestoneKey, CatalogClass, LearningResultActionType, LearningResultModerationPayload, Lesson, SchoolYear, ScoreTrackingConfig, StudentLearningAnalyticsRow, Subject } from '../types';
import { DEFAULT_ACTIVE_GRADES, sortGrades } from '../constants';
import { compareStructuredLessons, getLessonColumnLabel, lessonAppliesToStudent } from '../utils/lessonCatalog';
import { getFirebaseScoreTrackingConfig, saveFirebaseScoreTrackingConfig } from '../services/firebaseOperational';

interface LearningAnalyticsPanelProps {
  rows: StudentLearningAnalyticsRow[];
  students: Account[];
  lessons: Lesson[];
  classes: CatalogClass[];
  subjects: Subject[];
  schoolYears?: SchoolYear[];
  availableGrades?: string[];
  comments?: unknown[];
  isCommentsLoading?: boolean;
  onAddComment?: (payload: { lesson_id: string; noi_dung: string; parent_id?: string; loai?: string }) => Promise<boolean>;
  onUpdateComment?: (payload: { comment_id: string; trang_thai?: string; noi_dung?: string }) => Promise<boolean>;
  onRefresh?: () => void;
  onModerateResult?: (payload: LearningResultModerationPayload) => Promise<boolean>;
  filters: {
    query: string;
    onQueryChange: (value: string) => void;
    grade: string;
    onGradeChange: (value: string) => void;
    lessonId: string;
    onLessonIdChange: (value: string) => void;
    status: string;
    onStatusChange: (value: string) => void;
    semester: string;
    onSemesterChange: (value: string) => void;
    classId: string;
    onClassIdChange: (value: string) => void;
    subjectId: string;
    onSubjectIdChange: (value: string) => void;
    schoolYear: string;
    onSchoolYearChange: (value: string) => void;
    availableLessons: { value: string; label: string }[];
  };
}

const STATUS_LABELS: Record<string, string> = {
  not_started: 'Chưa học',
  in_progress: 'Đang học',
  completed: 'Hoàn thành',
};

type GradebookSortMode = 'name_asc' | 'name_desc' | 'score_desc' | 'score_asc' | 'completion_desc' | 'completion_asc';
type AnalyticsTab = 'class' | 'grade' | 'lesson';
type AnalyticsModule = 'results' | 'preparation';
type ResultScoreView = 'lessons' | AssessmentMilestoneKey;

const MILESTONE_LABELS: Record<AssessmentMilestoneKey, string> = {
  midterm1: 'Giữa kỳ 1',
  finalterm1: 'Cuối kỳ 1',
  midterm2: 'Giữa kỳ 2',
  finalterm2: 'Cuối kỳ 2',
  annual: 'Cả năm',
};

const MILESTONE_FIELDS: Record<Exclude<AssessmentMilestoneKey, 'annual'>, keyof ScoreTrackingConfig> = {
  midterm1: 'midterm1_lesson_ids',
  finalterm1: 'finalterm1_lesson_ids',
  midterm2: 'midterm2_lesson_ids',
  finalterm2: 'finalterm2_lesson_ids',
};

function emptyScoreTrackingConfig(academicYear: string, subjectId: string, grade: string, classId = ''): ScoreTrackingConfig {
  return {
    config_id: '',
    academic_year: academicYear,
    subject_id: subjectId,
    grade,
    class_id: classId,
    midterm1_lesson_ids: [],
    finalterm1_lesson_ids: [],
    midterm2_lesson_ids: [],
    finalterm2_lesson_ids: [],
    annual_mode: 'auto',
    annual_lesson_ids: [],
    schemaVersion: 1,
    milestone_status: {},
    milestone_locked_at: {},
    milestone_locked_by_name: {},
  };
}

function getMilestoneLessonIds(config: ScoreTrackingConfig | null, key: AssessmentMilestoneKey) {
  if (!config) return [] as string[];
  if (key === 'annual') {
    if (config.annual_mode === 'manual') return Array.from(new Set(config.annual_lesson_ids || []));
    return Array.from(new Set([
      ...(config.midterm1_lesson_ids || []),
      ...(config.finalterm1_lesson_ids || []),
      ...(config.midterm2_lesson_ids || []),
      ...(config.finalterm2_lesson_ids || []),
    ]));
  }
  return Array.from(new Set((config[MILESTONE_FIELDS[key]] as string[] | undefined) || []));
}

function getPreparationEvaluation(lesson: Lesson, row?: StudentLearningAnalyticsRow) {
  const threshold = Math.max(50, Math.min(100, Number(lesson.pre_lesson_completion_threshold || 80)));
  const watchPercent = Math.max(0, Math.min(100, Math.round(Number(row?.pre_lesson_watch_percent || 0))));
  const completed = row?.pre_lesson_preparation_status === 'prepared'
    || row?.pre_lesson_preparation_status === 'late_completed'
    || row?.pre_lesson_status === 'completed';
  const late = row?.pre_lesson_preparation_status === 'late_completed'
    || (completed && row?.pre_lesson_completed_before_deadline === false);
  const prepared = !late && (row?.pre_lesson_preparation_status === 'prepared'
    || (row?.pre_lesson_status === 'completed' && watchPercent >= threshold));
  const detail = prepared
    ? 'Đạt yêu cầu'
    : late
      ? 'Hoàn thành sau hạn'
      : watchPercent > 0
        ? `Chưa đạt ngưỡng ${threshold}%`
        : 'Chưa xem video';
  return { prepared, watchPercent, threshold, detail };
}


const sortOptions: Array<{ value: GradebookSortMode; label: string; icon: ReactNode }> = [
  { value: 'name_asc', label: 'Tên A-Z', icon: <ArrowDownAZ className="h-4 w-4" /> },
  { value: 'name_desc', label: 'Tên Z-A', icon: <ArrowUpAZ className="h-4 w-4" /> },
  { value: 'score_desc', label: 'Điểm TB cao-thấp', icon: <Trophy className="h-4 w-4" /> },
  { value: 'score_asc', label: 'Điểm TB thấp-cao', icon: <Trophy className="h-4 w-4" /> },
  { value: 'completion_desc', label: 'Hoàn thành nhiều nhất', icon: <CheckCircle2 className="h-4 w-4" /> },
  { value: 'completion_asc', label: 'Hoàn thành ít nhất', icon: <CheckCircle2 className="h-4 w-4" /> },
];

function getComparableScore(value?: number, mode: GradebookSortMode = 'score_desc') {
  if (value === undefined || Number.isNaN(value)) return mode === 'score_asc' ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  return value;
}

function normalizeText(value: unknown) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

const vietnameseNameCollator = new Intl.Collator('vi', { sensitivity: 'base', numeric: true });

function getVietnameseStudentNameKey(fullName: unknown) {
  const normalized = String(fullName || '').trim().replace(/\s+/g, ' ');
  const parts = normalized ? normalized.split(' ') : [];
  return {
    givenName: parts.at(-1) || '',
    remainingName: parts.slice(0, -1).join(' '),
    fullName: normalized,
  };
}

function compareStudentsByGivenName(left: Account, right: Account) {
  const a = getVietnameseStudentNameKey(left.ho_ten);
  const b = getVietnameseStudentNameKey(right.ho_ten);
  return vietnameseNameCollator.compare(a.givenName, b.givenName)
    || vietnameseNameCollator.compare(a.remainingName, b.remainingName)
    || vietnameseNameCollator.compare(a.fullName, b.fullName)
    || vietnameseNameCollator.compare(String(left.ma_hoc_sinh || left.user_id || ''), String(right.ma_hoc_sinh || right.user_id || ''));
}

function cleanScore(value: number | undefined) {
  if (value === undefined || Number.isNaN(value)) return '-';
  return value.toFixed(1).replace('.0', '');
}

function getLessonSemester(lesson: Lesson) {
  return String(lesson.hoc_ky || lesson.raw?.hoc_ky || 'HK1').toUpperCase() === 'HK2' ? 'HK2' : 'HK1';
}

function getCurrentSchoolYear() {
  const now = new Date();
  const start = now.getMonth() + 1 >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return `${start}-${start + 1}`;
}

function getLessonSchoolYear(lesson: Lesson, fallback = getCurrentSchoolYear()) {
  return String(lesson.nam_hoc || lesson.raw?.nam_hoc || fallback).trim() || fallback;
}

function getLessonScore(row?: StudentLearningAnalyticsRow) {
  if (!row) return undefined;
  if (row.result_state === 'cancelled_retake' || row.result_state === 'invalid_cheating') return undefined;
  // Score Model V4: chỉ điểm kiểm tra cuối bài đã chốt mới được đưa vào trung bình/bảng điểm.
  if (Number(row.score_model_version || 0) >= 3) {
    if (row.score_status !== 'finalized') return undefined;
    return row.assessment_score !== undefined && Number.isFinite(Number(row.assessment_score))
      ? Math.max(0, Math.min(10, Number(row.assessment_score)))
      : undefined;
  }
  // Kết quả legacy V6.78.x được giữ nguyên để không làm thay đổi điểm lịch sử.
  if (row.assessment_score !== undefined && Number.isFinite(Number(row.assessment_score))) {
    return Math.max(0, Math.min(10, Number(row.assessment_score)));
  }
  const source = Number(row.quiz_percent || row.completion_percent || 0);
  if (!source) return row.status === 'completed' ? 0 : undefined;
  return Math.max(0, Math.min(10, source / 10));
}

function lessonDeadlineZeroApplies(lesson?: Lesson) {
  if (!lesson?.thoi_gian_ket_thuc) return false;
  const allowLate = lesson.cho_phep_nop_sau_han === true || String(lesson.cho_phep_nop_sau_han).toLowerCase() === 'true' || String(lesson.cho_phep_nop_sau_han) === '1';
  if (allowLate) return false;
  const deadline = new Date(String(lesson.thoi_gian_ket_thuc)).getTime();
  return Number.isFinite(deadline) && Date.now() > deadline;
}

function getLessonScoreWithDeadline(row: StudentLearningAnalyticsRow | undefined, lesson: Lesson) {
  const official = getLessonScore(row);
  if (official !== undefined) return official;
  if (row?.result_state === 'invalid_cheating') return undefined;
  return lessonDeadlineZeroApplies(lesson) ? 0 : undefined;
}

function getProvisionalLessonScore(row?: StudentLearningAnalyticsRow) {
  if (!row || row.score_status !== 'in_progress') return undefined;
  // V6.81.0 / Score Model V4 không có điểm tạm tính: chỉ Nộp kiểm tra cuối bài
  // mới sinh điểm. Chỉ giữ cách đọc cũ cho record V3 chưa chốt để tương thích.
  if (Number(row.score_model_version || 0) >= 4) return undefined;
  if (Number(row.score_model_version || 0) < 3) return undefined;
  return row.current_score !== undefined && Number.isFinite(Number(row.current_score))
    ? Math.max(0, Math.min(10, Number(row.current_score)))
    : undefined;
}

function getLearningResultLabel(row?: StudentLearningAnalyticsRow) {
  if (row?.result_state === 'invalid_cheating') return 'Đã hủy do gian lận';
  if (row?.result_state === 'cancelled_retake') return 'Được phép học lại';
  return STATUS_LABELS[row?.status || 'not_started'] || row?.status || 'Chưa học';
}

function hasStartedMainLesson(row?: StudentLearningAnalyticsRow) {
  if (!row) return false;
  return row.status === 'in_progress' || row.status === 'completed'
    || Number(row.completion_percent || 0) > 0
    || Number(row.completed_steps || 0) > 0
    || Boolean(row.last_stage)
    || Number(row.quiz_total || 0) > 0;
}

function getPreLessonStatusLabel(row?: StudentLearningAnalyticsRow) {
  if (row?.pre_lesson_preparation_status === 'prepared') return 'Có chuẩn bị';
  if (row?.pre_lesson_preparation_status === 'late_completed') return 'Chưa chuẩn bị • Đã xem muộn';
  if (row?.pre_lesson_status === 'completed') return row.pre_lesson_completed_before_deadline === false ? 'Chưa chuẩn bị • Đã xem muộn' : 'Có chuẩn bị';
  if (row?.pre_lesson_preparation_status === 'in_progress' || row?.pre_lesson_status === 'in_progress' || Number(row?.pre_lesson_watch_percent || 0) > 0) return `Chưa chuẩn bị • Đang xem ${Math.round(Number(row?.pre_lesson_watch_percent || 0))}%`;
  return 'Chưa chuẩn bị';
}

function average(values: number[]) {
  const valid = values.filter((item) => typeof item === 'number' && !Number.isNaN(item));
  if (!valid.length) return undefined;
  return valid.reduce((sum, item) => sum + item, 0) / valid.length;
}

function normalizeClassLookupKey(value: unknown) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '');
}

function getStudentClassName(student: Account, classDisplayMap?: Map<string, string>) {
  const candidates = [student.ten_lop_hien_thi, student.ten_lop, student.lop_id];
  for (const candidate of candidates) {
    const raw = String(candidate || '').trim();
    if (!raw) continue;
    const resolved = classDisplayMap?.get(normalizeClassLookupKey(raw));
    if (resolved) return resolved;
    // Nếu dữ liệu đã là tên lớp như 9C1/8C2 thì dùng trực tiếp.
    if (!/^l\d+[_-]c\d+$/i.test(raw)) return raw;
  }
  return String(student.lop_id || '-');
}

function formatDateTime(value?: string) {
  if (!value) return '-';
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.replace('T', ' ').slice(0, 16);
  return text;
}

function getLessonScopeLabel(lesson: Lesson, classMap: Map<string, CatalogClass>) {
  const className = lesson.lop_id ? classMap.get(String(lesson.lop_id))?.ten_lop || lesson.lop || lesson.lop_id : 'Tất cả lớp';
  return `Khối ${lesson.khoi || '-'} • ${className}`;
}

export default function LearningAnalyticsPanel({
  rows,
  students,
  lessons,
  classes,
  subjects,
  schoolYears = [],
  availableGrades,
  onRefresh,
  onModerateResult,
  filters,
}: LearningAnalyticsPanelProps) {
  const fallbackYear = schoolYears.find((item) => item.la_hien_hanh === true || String(item.la_hien_hanh).toLowerCase() === 'true')?.ten_nam_hoc || getCurrentSchoolYear();
  const selectedSchoolYear = filters.schoolYear || fallbackYear;
  const [sortMode, setSortMode] = useState<GradebookSortMode>('name_asc');
  const [sortOpen, setSortOpen] = useState(false);
  const [analyticsModule, setAnalyticsModule] = useState<AnalyticsModule>('results');
  const [resultScoreView, setResultScoreView] = useState<ResultScoreView>('lessons');
  const [preparationStatusFilter, setPreparationStatusFilter] = useState<'all' | 'prepared' | 'not_prepared'>('all');
  const [activeTab, setActiveTab] = useState<AnalyticsTab>('class');
  const [scoreTrackingConfig, setScoreTrackingConfig] = useState<ScoreTrackingConfig | null>(null);
  const [scoreConfigDraft, setScoreConfigDraft] = useState<ScoreTrackingConfig | null>(null);
  const [scoreConfigTab, setScoreConfigTab] = useState<AssessmentMilestoneKey>('midterm1');
  const [isScoreConfigOpen, setIsScoreConfigOpen] = useState(false);
  const [isScoreConfigLoading, setIsScoreConfigLoading] = useState(false);
  const [isScoreConfigSaving, setIsScoreConfigSaving] = useState(false);
  const [scoreConfigMessage, setScoreConfigMessage] = useState('');
  const [moderationTarget, setModerationTarget] = useState<{ student: Account; progress: StudentLearningAnalyticsRow } | null>(null);
  const [moderationAction, setModerationAction] = useState<LearningResultActionType>('allow_retake');
  const [moderationReason, setModerationReason] = useState('');
  const [isModerating, setIsModerating] = useState(false);

  useEffect(() => {
    if (analyticsModule === 'preparation' && filters.lessonId !== 'Tất cả') setActiveTab('lesson');
  }, [analyticsModule, filters.lessonId]);

  useEffect(() => {
    if (analyticsModule === 'results' && activeTab === 'class' && filters.lessonId !== 'Tất cả') {
      filters.onLessonIdChange('Tất cả');
    }
  }, [analyticsModule, activeTab, filters.lessonId]);

  useEffect(() => {
    if (!filters.schoolYear && fallbackYear) filters.onSchoolYearChange(fallbackYear);
  }, [fallbackYear]);

  const gradeOptions = useMemo(() => {
    const fromProps = Array.isArray(availableGrades) ? availableGrades : [];
    const fromClasses = classes.map((item) => String(item.khoi || '').trim().replace(/\.0+$/, '')).filter(Boolean);
    const discovered = sortGrades(fromProps.length ? fromProps : fromClasses);
    return discovered.length ? discovered : DEFAULT_ACTIVE_GRADES;
  }, [availableGrades, classes]);

  const selectedClass = useMemo(() => classes.find((item) => String(item.lop_id) === String(filters.classId)) || null, [classes, filters.classId]);
  const effectiveGrade = filters.grade !== 'Tất cả' ? String(filters.grade) : selectedClass?.khoi ? String(selectedClass.khoi) : 'Tất cả';
  const visibleClasses = useMemo(() => classes.filter((item) => {
    const yearMatches = !item.nam_hoc || String(item.nam_hoc) === selectedSchoolYear;
    const gradeMatches = filters.grade === 'Tất cả' || String(item.khoi) === String(filters.grade);
    return yearMatches && gradeMatches;
  }), [classes, filters.grade, selectedSchoolYear]);
  const classMap = useMemo(() => new Map(classes.map((item) => [String(item.lop_id), item])), [classes]);
  const classDisplayMap = useMemo(() => {
    const map = new Map<string, string>();
    classes.forEach((item) => {
      const display = String(item.ten_lop || item.lop_id || '').trim();
      if (!display) return;
      [item.lop_id, item.ten_lop].forEach((value) => {
        const key = normalizeClassLookupKey(value);
        if (key) map.set(key, display);
      });
    });
    return map;
  }, [classes]);
  const progressRowsForYear = useMemo(() => rows.filter((row) => !row.nam_hoc || String(row.nam_hoc) === selectedSchoolYear), [rows, selectedSchoolYear]);
  const progressMap = useMemo(() => new Map(progressRowsForYear.map((row) => [`${row.user_id}__${row.lesson_id}`, row])), [progressRowsForYear]);
  const historicalScopeMap = useMemo(() => {
    const map = new Map<string, { khoi?: string; lop_id?: string }>();
    progressRowsForYear.forEach((row) => {
      if (!map.has(String(row.user_id)) && (row.khoi || row.lop_id)) {
        map.set(String(row.user_id), { khoi: row.khoi, lop_id: row.lop_id });
      }
    });
    return map;
  }, [progressRowsForYear]);
  const studentsForSelectedYear = useMemo(() => students.map((student) => {
    const snapshot = historicalScopeMap.get(String(student.user_id));
    if (!snapshot) return student;
    const snapshotClass = snapshot.lop_id ? classMap.get(String(snapshot.lop_id)) : undefined;
    return {
      ...student,
      khoi: snapshot.khoi || student.khoi,
      lop_id: snapshot.lop_id || student.lop_id,
      ten_lop_hien_thi: snapshotClass?.ten_lop || student.ten_lop_hien_thi,
      ten_lop: snapshotClass?.ten_lop || student.ten_lop,
    };
  }), [students, historicalScopeMap, classMap]);

  const scopedLessons = useMemo(() => {
    return lessons
      .filter((lesson) => getLessonSchoolYear(lesson, fallbackYear) === selectedSchoolYear)
      .filter((lesson) => effectiveGrade === 'Tất cả' || String(lesson.khoi || '') === effectiveGrade)
      .filter((lesson) => filters.classId === 'Tất cả' || !lesson.lop_id || String(lesson.lop_id) === String(filters.classId))
      .filter((lesson) => filters.subjectId === 'Tất cả' || String(lesson.mon_id) === String(filters.subjectId) || String(lesson.mon_hoc) === String(filters.subjectId))
      .filter((lesson) => filters.semester === 'ALL' || getLessonSemester(lesson) === filters.semester)
      .sort(compareStructuredLessons);
  }, [lessons, fallbackYear, selectedSchoolYear, effectiveGrade, filters.classId, filters.subjectId, filters.semester]);

  const lessonReportLessons = useMemo(() => {
    if (filters.classId !== 'Tất cả') return scopedLessons;
    return scopedLessons.filter((lesson) => !String(lesson.lop_id || '').trim());
  }, [scopedLessons, filters.classId]);

  const selectedLesson = useMemo(() => (filters.lessonId === 'Tất cả' ? null : lessonReportLessons.find((lesson) => lesson.lesson_id === filters.lessonId) || null), [filters.lessonId, lessonReportLessons]);

  const visibleStudents = useMemo(() => {
    const query = normalizeText(filters.query);
    return studentsForSelectedYear
      .filter((student) => effectiveGrade === 'Tất cả' || String(student.khoi || '') === effectiveGrade)
      .filter((student) => {
        if (filters.classId === 'Tất cả') return true;
        if (String(student.lop_id || '') === String(filters.classId)) return true;
        const selectedName = String(selectedClass?.ten_lop || '').trim();
        return Boolean(selectedName) && normalizeClassLookupKey(getStudentClassName(student, classDisplayMap)) === normalizeClassLookupKey(selectedName);
      })
      .filter((student) => !student.nam_hoc || String(student.nam_hoc) === selectedSchoolYear || historicalScopeMap.has(String(student.user_id)))
      .filter((student) => !query || normalizeText(student.ho_ten).includes(query) || normalizeText(student.ma_hoc_sinh).includes(query) || normalizeText(student.ten_dang_nhap).includes(query));
  }, [studentsForSelectedYear, effectiveGrade, filters.classId, filters.query, selectedSchoolYear, historicalScopeMap, selectedClass, classDisplayMap]);


  const scoreConfigClassId = filters.classId === 'Tất cả' ? '' : String(filters.classId);
  const scoreConfigScopeReady = effectiveGrade !== 'Tất cả' && filters.subjectId !== 'Tất cả' && Boolean(selectedSchoolYear);

  useEffect(() => {
    let cancelled = false;
    if (analyticsModule !== 'results' || !scoreConfigScopeReady) {
      setScoreTrackingConfig(null);
      setIsScoreConfigLoading(false);
      return () => { cancelled = true; };
    }
    setIsScoreConfigLoading(true);
    setScoreConfigMessage('');
    void getFirebaseScoreTrackingConfig({
      academicYear: selectedSchoolYear,
      subjectId: filters.subjectId,
      grade: effectiveGrade,
      classId: scoreConfigClassId,
    }).then((config) => {
      if (!cancelled) setScoreTrackingConfig(config);
    }).catch((error) => {
      if (!cancelled) {
        setScoreTrackingConfig(null);
        setScoreConfigMessage(error instanceof Error ? error.message : 'Không tải được cấu hình mốc tính điểm.');
      }
    }).finally(() => { if (!cancelled) setIsScoreConfigLoading(false); });
    return () => { cancelled = true; };
  }, [analyticsModule, scoreConfigScopeReady, selectedSchoolYear, filters.subjectId, effectiveGrade, scoreConfigClassId]);

  useEffect(() => {
    if (!scoreConfigScopeReady) {
      setScoreConfigDraft(null);
      return;
    }
    const base = scoreTrackingConfig || emptyScoreTrackingConfig(selectedSchoolYear, filters.subjectId, effectiveGrade, scoreConfigClassId);
    const annualIds = base.annual_mode === 'manual'
      ? [...(base.annual_lesson_ids || [])]
      : getMilestoneLessonIds(base, 'annual');
    setScoreConfigDraft({
      ...base,
      config_id: '',
      class_id: scoreConfigClassId,
      inherited_from_grade: false,
      midterm1_lesson_ids: [...(base.midterm1_lesson_ids || [])],
      finalterm1_lesson_ids: [...(base.finalterm1_lesson_ids || [])],
      midterm2_lesson_ids: [...(base.midterm2_lesson_ids || [])],
      finalterm2_lesson_ids: [...(base.finalterm2_lesson_ids || [])],
      annual_mode: 'manual',
      annual_lesson_ids: annualIds,
    });
  }, [scoreTrackingConfig, scoreConfigScopeReady, selectedSchoolYear, filters.subjectId, effectiveGrade, scoreConfigClassId]);

  const milestoneCandidateLessons = useMemo(() => lessons
    .filter((lesson) => getLessonSchoolYear(lesson, fallbackYear) === selectedSchoolYear)
    .filter((lesson) => effectiveGrade === 'Tất cả' || String(lesson.khoi || '') === effectiveGrade)
    .filter((lesson) => filters.classId === 'Tất cả'
      ? !String(lesson.lop_id || '').trim()
      : !lesson.lop_id || String(lesson.lop_id) === String(filters.classId))
    .filter((lesson) => filters.subjectId === 'Tất cả' || String(lesson.mon_id) === String(filters.subjectId) || String(lesson.mon_hoc) === String(filters.subjectId))
    .sort(compareStructuredLessons), [lessons, fallbackYear, selectedSchoolYear, effectiveGrade, filters.classId, filters.subjectId]);

  const effectiveScoreTrackingConfig = scoreConfigDraft || scoreTrackingConfig;
  const currentMilestoneLocked = resultScoreView !== 'lessons' && effectiveScoreTrackingConfig?.milestone_status?.[resultScoreView] === 'locked';
  const currentMilestoneLockedAt = resultScoreView !== 'lessons' ? effectiveScoreTrackingConfig?.milestone_locked_at?.[resultScoreView] : undefined;
  const milestoneLessonIds = useMemo(() => resultScoreView === 'lessons' ? [] : getMilestoneLessonIds(effectiveScoreTrackingConfig, resultScoreView), [effectiveScoreTrackingConfig, resultScoreView]);
  const milestoneLessons = useMemo(() => milestoneLessonIds
    .map((id) => milestoneCandidateLessons.find((lesson) => lesson.lesson_id === id))
    .filter((lesson): lesson is Lesson => Boolean(lesson)), [milestoneLessonIds, milestoneCandidateLessons]);
  const milestoneDisplayLessons = useMemo(() => {
    if (resultScoreView === 'midterm1' || resultScoreView === 'finalterm1') return milestoneCandidateLessons.filter((lesson) => getLessonSemester(lesson) === 'HK1');
    if (resultScoreView === 'midterm2' || resultScoreView === 'finalterm2') return milestoneCandidateLessons.filter((lesson) => getLessonSemester(lesson) === 'HK2');
    if (resultScoreView === 'annual') return milestoneCandidateLessons;
    return scopedLessons;
  }, [resultScoreView, milestoneCandidateLessons, scopedLessons]);

  const milestoneGradebookRows = useMemo(() => {
    if (resultScoreView === 'lessons') return [];
    const selectedSet = new Set(milestoneLessonIds);
    const mapped = visibleStudents.map((student) => {
      const displayLessonScores = milestoneDisplayLessons
        .filter((lesson) => lessonAppliesToStudent(lesson, student))
        .map((lesson) => {
          const progress = progressMap.get(`${student.user_id}__${lesson.lesson_id}`);
          return { lesson, progress, score: getLessonScoreWithDeadline(progress, lesson) };
        });
      const lessonScores = displayLessonScores.filter((item) => selectedSet.has(item.lesson.lesson_id));
      const scores = lessonScores.map((item) => item.score);
      const complete = lessonScores.length > 0 && scores.every((value) => value !== undefined);
      const milestoneAverage = complete ? average(scores as number[]) : undefined;
      return {
        student,
        lessonScores,
        displayLessonScores,
        milestoneAverage,
        complete,
        completedCount: scores.filter((value) => value !== undefined).length,
      };
    });
    mapped.sort((a, b) => {
      if (sortMode === 'name_asc') return compareStudentsByGivenName(a.student, b.student);
      if (sortMode === 'name_desc') return compareStudentsByGivenName(b.student, a.student);
      if (sortMode === 'score_asc') return getComparableScore(a.milestoneAverage, sortMode) - getComparableScore(b.milestoneAverage, sortMode);
      if (sortMode === 'score_desc') return getComparableScore(b.milestoneAverage, sortMode) - getComparableScore(a.milestoneAverage, sortMode);
      if (sortMode === 'completion_asc') return a.completedCount - b.completedCount;
      if (sortMode === 'completion_desc') return b.completedCount - a.completedCount;
      return 0;
    });
    return mapped.map((row, index) => ({ ...row, index: index + 1 }));
  }, [resultScoreView, visibleStudents, milestoneDisplayLessons, milestoneLessonIds, progressMap, sortMode]);

  const milestoneHasPostLockChanges = useMemo(() => {
    if (!currentMilestoneLocked || !currentMilestoneLockedAt || !milestoneLessonIds.length) return false;
    const lockedAtMs = Date.parse(String(currentMilestoneLockedAt));
    if (!Number.isFinite(lockedAtMs)) return false;
    const lessonSet = new Set(milestoneLessonIds);
    for (const progress of progressMap.values()) {
      if (!lessonSet.has(String(progress.lesson_id || ''))) continue;
      const updatedMs = Date.parse(String(progress.updated_at || progress.completed_at || progress.final_exam_submitted_at || ''));
      if (Number.isFinite(updatedMs) && updatedMs > lockedAtMs) return true;
    }
    return false;
  }, [currentMilestoneLocked, currentMilestoneLockedAt, milestoneLessonIds, progressMap]);

  const preparationLessons = useMemo(() => lessonReportLessons.filter((lesson) => lesson.pre_lesson_enabled), [lessonReportLessons]);
  const selectedPreparationLesson = useMemo(() => filters.lessonId === 'Tất cả' ? null : preparationLessons.find((lesson) => lesson.lesson_id === filters.lessonId) || null, [filters.lessonId, preparationLessons]);
  const preparationDetailRowsAll = useMemo(() => {
    if (!selectedPreparationLesson) return [];
    return visibleStudents
      .filter((student) => lessonAppliesToStudent(selectedPreparationLesson, student))
      .map((student) => {
        const progress = progressMap.get(`${student.user_id}__${selectedPreparationLesson.lesson_id}`);
        const evaluation = getPreparationEvaluation(selectedPreparationLesson, progress);
        return { student, progress, evaluation };
      })
      .sort((a, b) => compareStudentsByGivenName(a.student, b.student));
  }, [selectedPreparationLesson, visibleStudents, progressMap]);

  const preparationDetailRows = useMemo(() => preparationDetailRowsAll
    .filter((item) => preparationStatusFilter === 'all'
      || (preparationStatusFilter === 'prepared' ? item.evaluation.prepared : !item.evaluation.prepared))
    .map((item, index) => ({ ...item, index: index + 1 })), [preparationDetailRowsAll, preparationStatusFilter]);

  const preparationSummaryRows = useMemo(() => preparationLessons.map((lesson) => {
    const lessonStudents = visibleStudents.filter((student) => lessonAppliesToStudent(lesson, student));
    const evaluations = lessonStudents.map((student) => getPreparationEvaluation(lesson, progressMap.get(`${student.user_id}__${lesson.lesson_id}`)));
    const prepared = evaluations.filter((item) => item.prepared).length;
    return { lesson, total: lessonStudents.length, prepared, notPrepared: Math.max(0, lessonStudents.length - prepared), rate: lessonStudents.length ? Math.round((prepared / lessonStudents.length) * 100) : 0 };
  }), [preparationLessons, visibleStudents, progressMap]);

  const preparationStats = useMemo(() => {
    if (!selectedPreparationLesson) {
      const total = preparationSummaryRows.reduce((sum, item) => sum + item.total, 0);
      const prepared = preparationSummaryRows.reduce((sum, item) => sum + item.prepared, 0);
      return { total, prepared, notPrepared: Math.max(0, total - prepared), rate: total ? Math.round((prepared / total) * 100) : 0 };
    }
    const total = preparationDetailRowsAll.length;
    const prepared = preparationDetailRowsAll.filter((item) => item.evaluation.prepared).length;
    return { total, prepared, notPrepared: Math.max(0, total - prepared), rate: total ? Math.round((prepared / total) * 100) : 0 };
  }, [selectedPreparationLesson, preparationSummaryRows, preparationDetailRowsAll]);

  const gradebookRows = useMemo(() => {
    const mapped = visibleStudents.map((student) => {
      const applicableLessons = scopedLessons.filter((lesson) => lessonAppliesToStudent(lesson, student));
      const lessonScores = applicableLessons.map((lesson) => {
        const progress = progressMap.get(`${student.user_id}__${lesson.lesson_id}`);
        return { lesson, progress, score: getLessonScoreWithDeadline(progress, lesson) };
      });
      const hk1Scores = applicableLessons.filter((lesson) => getLessonSemester(lesson) === 'HK1').map((lesson) => getLessonScoreWithDeadline(progressMap.get(`${student.user_id}__${lesson.lesson_id}`), lesson)).filter((item): item is number => item !== undefined);
      const hk2Scores = applicableLessons.filter((lesson) => getLessonSemester(lesson) === 'HK2').map((lesson) => getLessonScoreWithDeadline(progressMap.get(`${student.user_id}__${lesson.lesson_id}`), lesson)).filter((item): item is number => item !== undefined);
      const termAverage = average(lessonScores.map((item) => item.score).filter((item): item is number => item !== undefined));
      const hk1Average = average(hk1Scores);
      const hk2Average = average(hk2Scores);
      const yearAverage = hk1Average !== undefined && hk2Average !== undefined ? (hk1Average + hk2Average * 2) / 3 : average([...(hk1Average !== undefined ? [hk1Average] : []), ...(hk2Average !== undefined ? [hk2Average] : [])]);
      const completedLessons = lessonScores.filter((item) => item.progress?.status === 'completed' && item.progress?.result_state !== 'invalid_cheating' && item.progress?.result_state !== 'cancelled_retake').length;
      return { index: 0, student, lessonScores, termAverage, hk1Average, hk2Average, yearAverage, completedLessons };
    });

    mapped.sort((a, b) => {
      if (sortMode === 'name_asc') return compareStudentsByGivenName(a.student, b.student);
      if (sortMode === 'name_desc') return compareStudentsByGivenName(b.student, a.student);
      if (sortMode === 'completion_desc') return b.completedLessons - a.completedLessons;
      if (sortMode === 'completion_asc') return a.completedLessons - b.completedLessons;
      const aScore = a.termAverage;
      const bScore = b.termAverage;
      if (sortMode === 'score_asc') return getComparableScore(aScore, sortMode) - getComparableScore(bScore, sortMode);
      return getComparableScore(bScore, sortMode) - getComparableScore(aScore, sortMode);
    });

    return mapped.map((row, index) => ({ ...row, index: index + 1 }));
  }, [visibleStudents, scopedLessons, progressMap, sortMode, filters.semester]);

  const selectedLessonStudentRows = useMemo(() => {
    if (!selectedLesson) return [];
    const mapped = visibleStudents
      .filter((student) => lessonAppliesToStudent(selectedLesson, student))
      .map((student) => {
        const progress = progressMap.get(`${student.user_id}__${selectedLesson.lesson_id}`);
        const status = progress?.status || 'not_started';
        return { index: 0, student, progress, score: getLessonScoreWithDeadline(progress, selectedLesson), status: !progress && lessonDeadlineZeroApplies(selectedLesson) ? 'deadline_missed' : status };
      })
      .filter((item) => filters.status === 'Tất cả' || item.status === filters.status);

    mapped.sort((a, b) => {
      if (sortMode === 'name_asc') return compareStudentsByGivenName(a.student, b.student);
      if (sortMode === 'name_desc') return compareStudentsByGivenName(b.student, a.student);
      if (sortMode === 'completion_desc') return (Number(b.progress?.completion_percent || 0) - Number(a.progress?.completion_percent || 0));
      if (sortMode === 'completion_asc') return (Number(a.progress?.completion_percent || 0) - Number(b.progress?.completion_percent || 0));
      if (sortMode === 'score_asc') return getComparableScore(a.score, sortMode) - getComparableScore(b.score, sortMode);
      return getComparableScore(b.score, sortMode) - getComparableScore(a.score, sortMode);
    });

    return mapped.map((row, index) => ({ ...row, index: index + 1 }));
  }, [selectedLesson, visibleStudents, progressMap, filters.status, sortMode]);

  const lessonSummaryRows = useMemo(() => {
    const mapped = lessonReportLessons.map((lesson) => {
      const targetStudents = visibleStudents.filter((student) => lessonAppliesToStudent(lesson, student));
      const progressItems = targetStudents.map((student) => progressMap.get(`${student.user_id}__${lesson.lesson_id}`)).filter((item): item is StudentLearningAnalyticsRow => Boolean(item));
      const participatedItems = progressItems.filter((item) => hasStartedMainLesson(item));
      const completedCount = progressItems.filter((item) => item.status === 'completed' && item.result_state !== 'invalid_cheating' && item.result_state !== 'cancelled_retake').length;
      const inProgressCount = progressItems.filter((item) => item.status === 'in_progress').length;
      const avgScore = average(progressItems.map((item) => getLessonScore(item)).filter((item): item is number => item !== undefined));
      return {
        lesson,
        total: targetStudents.length,
        participated: participatedItems.length,
        notStarted: Math.max(0, targetStudents.length - participatedItems.length),
        inProgressCount,
        completedCount,
        avgScore,
        completionRate: targetStudents.length ? Math.round((completedCount / targetStudents.length) * 100) : 0,
      };
    });

    return mapped.sort((a, b) => {
      if (sortMode === 'score_desc') return getComparableScore(b.avgScore, sortMode) - getComparableScore(a.avgScore, sortMode);
      if (sortMode === 'score_asc') return getComparableScore(a.avgScore, sortMode) - getComparableScore(b.avgScore, sortMode);
      if (sortMode === 'completion_desc') return b.completionRate - a.completionRate;
      if (sortMode === 'completion_asc') return a.completionRate - b.completionRate;
      if (sortMode === 'name_desc') return compareStructuredLessons(b.lesson, a.lesson);
      return compareStructuredLessons(a.lesson, b.lesson);
    });
  }, [lessonReportLessons, visibleStudents, progressMap, sortMode]);

  const selectedLessonStats = useMemo(() => {
    if (!selectedLesson) return null;
    const allStudentsForLesson = visibleStudents.filter((student) => lessonAppliesToStudent(selectedLesson, student));
    const progressItems = allStudentsForLesson.map((student) => progressMap.get(`${student.user_id}__${selectedLesson.lesson_id}`)).filter((item): item is StudentLearningAnalyticsRow => Boolean(item));
    const participatedItems = progressItems.filter((item) => hasStartedMainLesson(item));
    const completedCount = progressItems.filter((item) => item.status === 'completed' && item.result_state !== 'invalid_cheating' && item.result_state !== 'cancelled_retake').length;
    const inProgressCount = progressItems.filter((item) => item.status === 'in_progress').length;
    const avg = average(progressItems.map((item) => getLessonScore(item)).filter((item): item is number => item !== undefined));
    const preLessonCompletedOnTime = progressItems.filter((item) => item.pre_lesson_preparation_status === 'prepared' || (item.pre_lesson_status === 'completed' && item.pre_lesson_completed_before_deadline !== false)).length;
    const preLessonCompletedLate = progressItems.filter((item) => item.pre_lesson_preparation_status === 'late_completed' || (item.pre_lesson_status === 'completed' && item.pre_lesson_completed_before_deadline === false)).length;
    const preLessonInProgress = progressItems.filter((item) => item.pre_lesson_preparation_status === 'in_progress' || item.pre_lesson_status === 'in_progress' || (item.pre_lesson_status !== 'completed' && Number(item.pre_lesson_watch_percent || 0) > 0)).length;
    const preLessonNotStarted = Math.max(0, allStudentsForLesson.length - preLessonCompletedOnTime - preLessonCompletedLate - preLessonInProgress);
    return { participated: participatedItems.length, notStarted: Math.max(0, allStudentsForLesson.length - participatedItems.length), completedCount, inProgressCount, avg, total: allStudentsForLesson.length, preLessonCompletedOnTime, preLessonCompletedLate, preLessonInProgress, preLessonNotStarted };
  }, [selectedLesson, visibleStudents, progressMap]);

  const gradeSummaryRows = useMemo(() => {
    if (effectiveGrade === 'Tất cả') return [];
    const query = normalizeText(filters.query);
    return visibleClasses
      .filter((item) => String(item.khoi || '') === effectiveGrade)
      .filter((item) => !query || normalizeText(item.ten_lop || item.lop_id).includes(query))
      .map((classItem) => {
        const classStudents = studentsForSelectedYear.filter((student) => String(student.khoi || '') === effectiveGrade && String(student.lop_id || '') === String(classItem.lop_id));
        const classLessons = scopedLessons.filter((lesson) => lessonAppliesToStudent(lesson, { khoi: classItem.khoi, lop_id: classItem.lop_id }));
        const progressItems = classStudents.flatMap((student) => classLessons.map((lesson) => progressMap.get(`${student.user_id}__${lesson.lesson_id}`)).filter((item): item is StudentLearningAnalyticsRow => Boolean(item)));
        const completedAssignments = progressItems.filter((item) => item.status === 'completed' && item.result_state !== 'invalid_cheating' && item.result_state !== 'cancelled_retake').length;
        const inProgressAssignments = progressItems.filter((item) => item.status === 'in_progress').length;
        const expectedAssignments = classStudents.length * classLessons.length;
        const avg = average(progressItems.map((item) => getLessonScore(item)).filter((item): item is number => item !== undefined));
        return {
          classItem,
          studentCount: classStudents.length,
          lessonCount: classLessons.length,
          participatedAssignments: progressItems.filter((item) => hasStartedMainLesson(item)).length,
          completedAssignments,
          inProgressAssignments,
          expectedAssignments,
          completionRate: expectedAssignments ? Math.round((completedAssignments / expectedAssignments) * 100) : 0,
          avgScore: avg,
        };
      })
      .sort((a, b) => String(a.classItem.ten_lop || a.classItem.lop_id).localeCompare(String(b.classItem.ten_lop || b.classItem.lop_id), 'vi', { numeric: true, sensitivity: 'base' }));
  }, [effectiveGrade, filters.query, visibleClasses, studentsForSelectedYear, scopedLessons, progressMap]);

  const completed = lessonSummaryRows.reduce((sum, item) => sum + item.completedCount, 0);
  const inProgress = lessonSummaryRows.reduce((sum, item) => sum + item.inProgressCount, 0);
  const avgScore = average(gradebookRows.map((item) => item.termAverage).filter((item): item is number => item !== undefined));
  const milestoneAvgScore = average(milestoneGradebookRows.filter((item) => item.complete).map((item) => item.milestoneAverage).filter((item): item is number => item !== undefined));
  const resolvedStudentCount = activeTab === 'class'
    ? (filters.classId === 'Tất cả' ? 0 : visibleStudents.length)
    : activeTab === 'grade'
      ? (effectiveGrade === 'Tất cả' ? 0 : gradeSummaryRows.reduce((sum, item) => sum + item.studentCount, 0))
      : (effectiveGrade === 'Tất cả' ? 0 : selectedLessonStats?.total ?? visibleStudents.length);
  const resolvedLessonCount = activeTab === 'lesson' ? (effectiveGrade === 'Tất cả' ? 0 : lessonReportLessons.length) : activeTab === 'class' ? (filters.classId === 'Tất cả' ? 0 : scopedLessons.length) : (effectiveGrade === 'Tất cả' ? 0 : scopedLessons.length);

  const currentSortLabel = sortOptions.find((item) => item.value === sortMode)?.label || 'Tên A-Z';

  const exportClassGradebook = async () => {
    const rowsForExport = gradebookRows.map((row) => {
      const base: Record<string, string | number> = {
        STT: row.index,
        'Mã HS': row.student.ma_hoc_sinh || row.student.user_id,
        'Họ và tên': row.student.ho_ten,
        'Ngày sinh': row.student.ngay_sinh || '',
        'Lớp': getStudentClassName(row.student, classDisplayMap),
      };
      row.lessonScores.forEach((item) => {
        base[getLessonColumnLabel(item.lesson)] = cleanScore(item.score);
      });
      base['Điểm TB'] = cleanScore(row.termAverage);
      return base;
    });
    const XLSX = await import('xlsx');
    const worksheet = XLSX.utils.json_to_sheet(rowsForExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'BangDiemTheoLop');
    XLSX.writeFile(workbook, `bang-diem-theo-lop-${selectedSchoolYear.replace(/\W+/g, '_')}-${filters.semester === 'ALL' ? 'ca-nam' : filters.semester.toLowerCase()}.xlsx`);
  };

  const exportGradeSummary = async () => {
    const rowsForExport = gradeSummaryRows.map((item, index) => ({
      STT: index + 1,
      'Lớp': item.classItem.ten_lop || item.classItem.lop_id,
      'Khối': item.classItem.khoi || effectiveGrade,
      'Sĩ số': item.studentCount,
      'Bài áp dụng': item.lessonCount,
      'Đã tham gia': `${item.participatedAssignments}/${item.expectedAssignments}`,
      'Hoàn thành': `${item.completedAssignments}/${item.expectedAssignments}`,
      'Tỉ lệ hoàn thành': `${item.completionRate}%`,
      'Điểm TB': cleanScore(item.avgScore),
    }));
    const XLSX = await import('xlsx');
    const worksheet = XLSX.utils.json_to_sheet(rowsForExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'TongHopTheoKhoi');
    XLSX.writeFile(workbook, `tong-hop-theo-khoi-${effectiveGrade}-${selectedSchoolYear.replace(/\W+/g, '_')}.xlsx`);
  };

  const exportLessonReport = async () => {
    const rowsForExport = selectedLesson
      ? selectedLessonStudentRows.map((item) => ({
          STT: item.index,
          'Mã HS': item.student.ma_hoc_sinh || item.student.user_id,
          'Họ và tên': item.student.ho_ten,
          Lớp: getStudentClassName(item.student, classDisplayMap),
          'Trạng thái': getLearningResultLabel(item.progress),
          'Tiến trình': item.progress ? `${item.progress.completed_steps}/${item.progress.total_steps}` : '-',
          'Hoàn thành %': item.progress?.completion_percent ?? '-',
          'Chuẩn bị bài': selectedLesson.pre_lesson_enabled ? getPreLessonStatusLabel(item.progress) : 'Không áp dụng',
          'Video %': selectedLesson.pre_lesson_enabled ? Math.round(Number(item.progress?.pre_lesson_watch_percent || 0)) : '-',
          'Điểm kiểm tra cuối bài': item.progress?.final_quiz_score === undefined ? '-' : cleanScore(Number(item.progress.final_quiz_score)),
          'Điểm bài chính thức': cleanScore(item.score),
          'Điểm tạm tính': item.score === undefined ? cleanScore(getProvisionalLessonScore(item.progress)) : '-',
          'Trạng thái điểm': Number(item.progress?.score_model_version || 0) >= 3
            ? item.progress?.score_status === 'finalized' ? 'Đã chốt' : item.progress?.score_status === 'not_applicable' ? 'Không áp dụng' : 'Chưa nộp kiểm tra'
            : 'Legacy',
          'Cập nhật': item.progress?.updated_at_display || item.progress?.updated_at || '',
        }))
      : lessonSummaryRows.map((item, index) => ({
          STT: index + 1,
          'Bài học': item.lesson.tieu_de,
          Môn: item.lesson.mon_hoc || item.lesson.mon_id,
          'Phạm vi': getLessonScopeLabel(item.lesson, classMap),
          'Năm học': getLessonSchoolYear(item.lesson, fallbackYear),
          'Học kỳ': getLessonSemester(item.lesson),
          'Học sinh': item.total,
          'Đã tham gia': item.participated,
          'Chưa tham gia': item.notStarted,
          'Đang học': item.inProgressCount,
          'Hoàn thành': item.completedCount,
          'Tỉ lệ hoàn thành': `${item.completionRate}%`,
          'Điểm TB': cleanScore(item.avgScore),
        }));
    const XLSX = await import('xlsx');
    const worksheet = XLSX.utils.json_to_sheet(rowsForExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, selectedLesson ? 'TheoDoiBaiHoc' : 'TongHopTheoBai');
    XLSX.writeFile(workbook, `theo-doi-theo-bai-${selectedSchoolYear.replace(/\W+/g, '_')}.xlsx`);
  };

  const exportPreparationReport = async () => {
    const XLSX = await import('xlsx');
    const workbook = XLSX.utils.book_new();
    if (selectedPreparationLesson) {
      const rowsForExport = preparationDetailRows.map((item) => ({
        STT: item.index,
        'Mã HS': item.student.ma_hoc_sinh || item.student.user_id,
        'Họ và tên': item.student.ho_ten,
        'Ngày sinh': item.student.ngay_sinh || '',
        'Lớp': getStudentClassName(item.student, classDisplayMap),
        'Bài học': selectedPreparationLesson.tieu_de,
        'Tỷ lệ video %': item.evaluation.watchPercent,
        'Ngưỡng yêu cầu %': item.evaluation.threshold,
        'Đánh giá': item.evaluation.prepared ? 'Đã chuẩn bị bài' : 'Chưa chuẩn bị bài',
        'Chi tiết': item.evaluation.detail,
        'Hoàn thành lúc': formatDateTime(item.progress?.pre_lesson_completed_at),
      }));
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rowsForExport), 'ChuanBiBai');
      const summary = [{
        'Tổng học sinh': preparationStats.total,
        'Đã chuẩn bị': preparationStats.prepared,
        'Chưa chuẩn bị': preparationStats.notPrepared,
        'Tỷ lệ chuẩn bị': `${preparationStats.rate}%`,
      }];
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summary), 'TongHop');
    } else {
      const rowsForExport = preparationSummaryRows.map((item, index) => ({
        STT: index + 1,
        'Bài học': item.lesson.tieu_de,
        'Khối': item.lesson.khoi,
        'Lớp/phạm vi': getLessonScopeLabel(item.lesson, classMap),
        'Ngưỡng yêu cầu %': item.lesson.pre_lesson_completion_threshold || 80,
        'Tổng học sinh': item.total,
        'Đã chuẩn bị': item.prepared,
        'Chưa chuẩn bị': item.notPrepared,
        'Tỷ lệ chuẩn bị': `${item.rate}%`,
      }));
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rowsForExport), 'TongHopChuanBi');
    }
    XLSX.writeFile(workbook, `theo-doi-chuan-bi-bai-${selectedSchoolYear.replace(/\W+/g, '_')}.xlsx`);
  };

  const exportMilestoneGradebook = async () => {
    if (resultScoreView === 'lessons') return exportClassGradebook();
    const rowsForExport = milestoneGradebookRows.map((row) => {
      const base: Record<string, string | number> = {
        STT: row.index,
        'Mã HS': row.student.ma_hoc_sinh || row.student.user_id,
        'Họ và tên': row.student.ho_ten,
        'Ngày sinh': row.student.ngay_sinh || '',
        'Lớp': getStudentClassName(row.student, classDisplayMap),
      };
      row.lessonScores.forEach((item) => { base[getLessonColumnLabel(item.lesson)] = cleanScore(item.score); });
      base[`TB ${MILESTONE_LABELS[resultScoreView]}`] = row.complete ? cleanScore(row.milestoneAverage) : 'Chưa đủ dữ liệu';
      base['Đủ dữ liệu'] = `${row.completedCount}/${row.lessonScores.length}`;
      return base;
    });
    const XLSX = await import('xlsx');
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rowsForExport), 'DiemTheoMoc');
    XLSX.writeFile(workbook, `bang-diem-${MILESTONE_LABELS[resultScoreView].toLowerCase().replace(/\s+/g, '-')}-${selectedSchoolYear.replace(/\W+/g, '_')}.xlsx`);
  };

  const openScoreConfig = () => {
    if (!scoreConfigScopeReady) {
      setScoreConfigMessage('Hãy chọn một khối và một môn học cụ thể trước khi cấu hình mốc tính điểm.');
      return;
    }
    const base = scoreTrackingConfig || emptyScoreTrackingConfig(selectedSchoolYear, filters.subjectId, effectiveGrade, scoreConfigClassId);
    setScoreConfigDraft({
      ...base,
      config_id: '',
      class_id: scoreConfigClassId,
      inherited_from_grade: false,
      midterm1_lesson_ids: [...(base.midterm1_lesson_ids || [])],
      finalterm1_lesson_ids: [...(base.finalterm1_lesson_ids || [])],
      midterm2_lesson_ids: [...(base.midterm2_lesson_ids || [])],
      finalterm2_lesson_ids: [...(base.finalterm2_lesson_ids || [])],
      annual_lesson_ids: [...(base.annual_lesson_ids || [])],
    });
    setScoreConfigMessage('');
    setIsScoreConfigOpen(true);
  };

  const toggleScoreConfigLesson = (lessonId: string) => {
    setScoreConfigDraft((current) => {
      if (!current) return current;
      const field = scoreConfigTab === 'annual' ? 'annual_lesson_ids' : MILESTONE_FIELDS[scoreConfigTab];
      const existing = ((current[field] as string[] | undefined) || []);
      const next = existing.includes(lessonId) ? existing.filter((id) => id !== lessonId) : [...existing, lessonId];
      return { ...current, annual_mode: scoreConfigTab === 'annual' ? 'manual' : current.annual_mode, [field]: next } as ScoreTrackingConfig;
    });
  };

  const toggleInlineMilestoneLesson = (lessonId: string) => {
    if (resultScoreView === 'lessons' || isScoreConfigLoading || currentMilestoneLocked) return;
    setScoreConfigDraft((current) => {
      const base = current || emptyScoreTrackingConfig(selectedSchoolYear, filters.subjectId, effectiveGrade, scoreConfigClassId);
      const field = resultScoreView === 'annual' ? 'annual_lesson_ids' : MILESTONE_FIELDS[resultScoreView];
      const existing = ((base[field] as string[] | undefined) || []);
      const next = existing.includes(lessonId) ? existing.filter((id) => id !== lessonId) : [...existing, lessonId];
      return { ...base, class_id: scoreConfigClassId, annual_mode: 'manual', [field]: next } as ScoreTrackingConfig;
    });
    setScoreConfigMessage('');
  };

  const setInlineMilestoneSelection = (mode: 'all' | 'none') => {
    if (resultScoreView === 'lessons' || currentMilestoneLocked) return;
    const candidateIds = milestoneDisplayLessons.map((lesson) => lesson.lesson_id);
    setScoreConfigDraft((current) => {
      const base = current || emptyScoreTrackingConfig(selectedSchoolYear, filters.subjectId, effectiveGrade, scoreConfigClassId);
      const field = resultScoreView === 'annual' ? 'annual_lesson_ids' : MILESTONE_FIELDS[resultScoreView];
      return {
        ...base,
        class_id: scoreConfigClassId,
        annual_mode: 'manual',
        [field]: mode === 'all' ? candidateIds : [],
      } as ScoreTrackingConfig;
    });
    setScoreConfigMessage('');
  };

  const saveScoreConfig = async () => {
    if (!scoreConfigDraft || isScoreConfigSaving) return;
    setIsScoreConfigSaving(true);
    setScoreConfigMessage('');
    try {
      const saved = await saveFirebaseScoreTrackingConfig({
        academic_year: selectedSchoolYear,
        subject_id: filters.subjectId,
        grade: effectiveGrade,
        class_id: scoreConfigClassId,
        midterm1_lesson_ids: scoreConfigDraft.midterm1_lesson_ids || [],
        finalterm1_lesson_ids: scoreConfigDraft.finalterm1_lesson_ids || [],
        midterm2_lesson_ids: scoreConfigDraft.midterm2_lesson_ids || [],
        finalterm2_lesson_ids: scoreConfigDraft.finalterm2_lesson_ids || [],
        annual_mode: 'manual',
        annual_lesson_ids: scoreConfigDraft.annual_lesson_ids || [],
        milestone_status: scoreConfigDraft.milestone_status || {},
        milestone_locked_at: scoreConfigDraft.milestone_locked_at || {},
        milestone_locked_by_name: scoreConfigDraft.milestone_locked_by_name || {},
      });
      setScoreTrackingConfig(saved);
      setScoreConfigDraft(saved);
      setScoreConfigMessage('Đã lưu cấu hình mốc tính điểm.');
      setIsScoreConfigOpen(false);
    } catch (error) {
      setScoreConfigMessage(error instanceof Error ? error.message : 'Không lưu được cấu hình mốc tính điểm.');
    } finally {
      setIsScoreConfigSaving(false);
    }
  };

  const setCurrentMilestoneLocked = async (locked: boolean) => {
    if (resultScoreView === 'lessons' || !scoreConfigScopeReady || isScoreConfigSaving) return;
    const base = scoreConfigDraft || scoreTrackingConfig || emptyScoreTrackingConfig(selectedSchoolYear, filters.subjectId, effectiveGrade, scoreConfigClassId);
    if (!locked && base.inherited_from_grade) {
      setScoreConfigMessage('Hãy lưu cấu hình riêng cho lớp trước khi mở lại một mốc đang kế thừa từ khối.');
      return;
    }
    setIsScoreConfigSaving(true);
    setScoreConfigMessage('');
    try {
      const nextStatus = { ...(base.milestone_status || {}), [resultScoreView]: locked ? 'locked' : 'draft' } as ScoreTrackingConfig['milestone_status'];
      const nextLockedAt = { ...(base.milestone_locked_at || {}) };
      const nextLockedByName = { ...(base.milestone_locked_by_name || {}) };
      if (locked) nextLockedAt[resultScoreView] = new Date().toISOString(); else delete nextLockedAt[resultScoreView];
      const saved = await saveFirebaseScoreTrackingConfig({
        academic_year: selectedSchoolYear,
        subject_id: filters.subjectId,
        grade: effectiveGrade,
        class_id: scoreConfigClassId,
        midterm1_lesson_ids: base.midterm1_lesson_ids || [],
        finalterm1_lesson_ids: base.finalterm1_lesson_ids || [],
        midterm2_lesson_ids: base.midterm2_lesson_ids || [],
        finalterm2_lesson_ids: base.finalterm2_lesson_ids || [],
        annual_mode: 'manual',
        annual_lesson_ids: base.annual_lesson_ids || [],
        milestone_status: nextStatus,
        milestone_locked_at: nextLockedAt,
        milestone_locked_by_name: nextLockedByName,
      });
      setScoreTrackingConfig(saved);
      setScoreConfigDraft(saved);
      setScoreConfigMessage(locked ? `Đã chốt cấu hình ${MILESTONE_LABELS[resultScoreView]}.` : `Đã mở lại cấu hình ${MILESTONE_LABELS[resultScoreView]}.`);
    } catch (error) {
      setScoreConfigMessage(error instanceof Error ? error.message : 'Không cập nhật được trạng thái mốc điểm.');
    } finally { setIsScoreConfigSaving(false); }
  };

  const scoreConfigCandidateLessons = useMemo(() => {
    if (scoreConfigTab === 'midterm1' || scoreConfigTab === 'finalterm1') return milestoneCandidateLessons.filter((lesson) => getLessonSemester(lesson) === 'HK1');
    if (scoreConfigTab === 'midterm2' || scoreConfigTab === 'finalterm2') return milestoneCandidateLessons.filter((lesson) => getLessonSemester(lesson) === 'HK2');
    return milestoneCandidateLessons;
  }, [scoreConfigTab, milestoneCandidateLessons]);

  const scoreConfigSelectedIds = useMemo(() => {
    if (!scoreConfigDraft) return [] as string[];
    if (scoreConfigTab === 'annual') {
      return scoreConfigDraft.annual_mode === 'manual'
        ? scoreConfigDraft.annual_lesson_ids || []
        : getMilestoneLessonIds(scoreConfigDraft, 'annual');
    }
    return (scoreConfigDraft[MILESTONE_FIELDS[scoreConfigTab]] as string[] | undefined) || [];
  }, [scoreConfigDraft, scoreConfigTab]);

  const exportCurrentTab = analyticsModule === 'preparation'
    ? exportPreparationReport
    : activeTab === 'class' && resultScoreView !== 'lessons'
      ? exportMilestoneGradebook
      : activeTab === 'class' ? exportClassGradebook : activeTab === 'grade' ? exportGradeSummary : exportLessonReport;

  const submitModeration = async () => {
    if (!moderationTarget || !onModerateResult || isModerating) return;
    if (moderationAction === 'invalidate_cheating' && !moderationReason.trim()) return;
    setIsModerating(true);
    const ok = await onModerateResult({
      progress_id: `${moderationTarget.progress.user_id}_${moderationTarget.progress.lesson_id}`,
      action: moderationAction,
      reason: moderationReason.trim(),
    });
    setIsModerating(false);
    if (ok) {
      setModerationTarget(null);
      setModerationAction('allow_retake');
      setModerationReason('');
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-[28px] bg-white p-5 shadow-sm ring-1 ring-slate-100">
        <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-center 2xl:justify-between">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
              {analyticsModule === 'preparation' ? <Video className="h-3.5 w-3.5" /> : <BarChart3 className="h-3.5 w-3.5" />} Theo dõi học tập
            </p>
            <h2 className="mt-2 text-[26px] font-bold leading-tight text-slate-900">
              {analyticsModule === 'preparation'
                ? 'Theo dõi chuẩn bị bài'
                : activeTab === 'class' ? 'Theo dõi kết quả học tập theo lớp' : activeTab === 'grade' ? 'Tổng hợp kết quả theo khối' : 'Theo dõi kết quả theo bài theo khối/lớp'}
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-500">
              {analyticsModule === 'preparation'
                ? 'Đánh giá Đã chuẩn bị/Chưa chuẩn bị theo tỷ lệ video mà bài học cấu hình; kết quả này không tham gia điểm.'
                : activeTab === 'class'
                  ? 'Chọn một lớp cụ thể để xem điểm chính thức và tính trung bình theo các mốc đã cấu hình.'
                  : activeTab === 'grade'
                    ? 'Tổng hợp theo từng lớp trong cùng một khối, không trộn học sinh của nhiều khối vào một bảng.'
                    : 'Chọn khối/lớp rồi xem danh sách bài và kết quả học sinh đúng phạm vi.'}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 2xl:min-w-[460px]">
            {analyticsModule === 'preparation' ? (
              <>
                <StatCard icon={<Users className="h-4 w-4" />} label="Học sinh/lượt" value={preparationStats.total} tone="indigo" />
                <StatCard icon={<CheckCircle2 className="h-4 w-4" />} label="Đã chuẩn bị" value={preparationStats.prepared} tone="emerald" />
                <StatCard icon={<UserX className="h-4 w-4" />} label="Chưa chuẩn bị" value={preparationStats.notPrepared} tone="amber" />
                <StatCard icon={<Trophy className="h-4 w-4" />} label="Tỷ lệ" value={`${preparationStats.rate}%`} tone="sky" />
              </>
            ) : (
              <>
                <StatCard icon={<Users className="h-4 w-4" />} label="Học sinh" value={resolvedStudentCount} tone="indigo" />
                <StatCard icon={<BookOpen className="h-4 w-4" />} label="Bài học" value={resultScoreView === 'lessons' ? resolvedLessonCount : milestoneLessons.length} tone="emerald" />
                <StatCard icon={<CalendarDays className="h-4 w-4" />} label={resultScoreView === 'lessons' ? 'Đang học' : 'Đủ dữ liệu'} value={resultScoreView === 'lessons' ? (activeTab === 'lesson' && selectedLessonStats ? selectedLessonStats.inProgressCount : inProgress) : `${milestoneGradebookRows.filter((item) => item.complete).length}/${milestoneGradebookRows.length}`} tone="amber" />
                <StatCard icon={<Trophy className="h-4 w-4" />} label="TB điểm" value={resultScoreView !== 'lessons' ? (milestoneAvgScore === undefined ? '-' : cleanScore(milestoneAvgScore)) : (activeTab === 'lesson' && selectedLessonStats ? selectedLessonStats.avg : avgScore) === undefined ? '-' : cleanScore(activeTab === 'lesson' && selectedLessonStats ? selectedLessonStats.avg : avgScore)} tone="sky" />
              </>
            )}
          </div>
        </div>

        <div className="mt-4 rounded-[24px] border border-slate-100 bg-slate-50/80 p-3">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex flex-wrap gap-2 rounded-2xl bg-white p-1.5 shadow-sm ring-1 ring-slate-100">
                <button type="button" onClick={() => { setAnalyticsModule('results'); setActiveTab('class'); filters.onLessonIdChange('Tất cả'); }} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${analyticsModule === 'results' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-slate-600 hover:bg-slate-50'}`}>
                  <BarChart3 className="h-4 w-4" /> Kết quả học tập
                </button>
                <button type="button" onClick={() => { setAnalyticsModule('preparation'); setActiveTab('lesson'); setPreparationStatusFilter('all'); filters.onLessonIdChange('Tất cả'); }} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${analyticsModule === 'preparation' ? 'bg-fuchsia-600 text-white shadow-lg shadow-fuchsia-600/20' : 'text-slate-600 hover:bg-slate-50'}`}>
                  <Video className="h-4 w-4" /> Chuẩn bị bài
                </button>
              </div>
              {analyticsModule === 'results' && (
                <div className="flex flex-wrap gap-2 rounded-2xl bg-white p-1.5 shadow-sm ring-1 ring-slate-100">
                  <button type="button" onClick={() => { setActiveTab('class'); filters.onLessonIdChange('Tất cả'); }} className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition ${activeTab === 'class' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}><Users className="h-4 w-4" /> Theo lớp</button>
                  <button type="button" onClick={() => { setActiveTab('grade'); filters.onClassIdChange('Tất cả'); filters.onLessonIdChange('Tất cả'); }} className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition ${activeTab === 'grade' ? 'bg-violet-50 text-violet-700' : 'text-slate-600 hover:bg-slate-50'}`}><GraduationCap className="h-4 w-4" /> Theo khối</button>
                  <button type="button" onClick={() => setActiveTab('lesson')} className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition ${activeTab === 'lesson' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-50'}`}><Layers className="h-4 w-4" /> Chi tiết 1 bài</button>
                </div>
              )}
            </div>
            <div className="relative flex flex-wrap items-center gap-2 xl:justify-end">
              <button
                type="button"
                onClick={() => setSortOpen((current) => !current)}
                className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50"
              >
                <SlidersHorizontal className="h-4 w-4 text-indigo-500" /> {currentSortLabel} <ChevronDown className="h-4 w-4 text-slate-400" />
              </button>
              {sortOpen && (
                <div className="absolute right-0 top-full z-20 mt-2 w-64 overflow-hidden rounded-2xl bg-white py-2 shadow-xl ring-1 ring-slate-200">
                  {sortOptions.map((option) => (
                    <button
                      type="button"
                      key={option.value}
                      onClick={() => { setSortMode(option.value); setSortOpen(false); }}
                      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-semibold ${sortMode === option.value ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}
                    >
                      {option.icon} {option.label}
                    </button>
                  ))}
                </div>
              )}
              {onRefresh && (
                <button type="button" onClick={onRefresh} className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50">
                  <RefreshCw className="h-4 w-4" /> Làm mới
                </button>
              )}
              <button onClick={exportCurrentTab} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-700">
                <Download className="h-4 w-4" /> Xuất Excel
              </button>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
            <Select value={selectedSchoolYear} onChange={(value) => { filters.onSchoolYearChange(value); filters.onLessonIdChange('Tất cả'); }}>
              {schoolYears.length === 0 && <option value={fallbackYear}>{fallbackYear}</option>}
              {schoolYears.map((item) => <option key={item.nam_hoc_id || item.ten_nam_hoc} value={item.ten_nam_hoc}>{item.ten_nam_hoc}</option>)}
            </Select>
            <Select value={filters.semester} onChange={(value) => { filters.onSemesterChange(value); filters.onLessonIdChange('Tất cả'); if (resultScoreView !== 'lessons') setResultScoreView('lessons'); }}>
              <option value="HK1">Học kỳ 1</option>
              <option value="HK2">Học kỳ 2</option>
              <option value="ALL">Cả năm</option>
            </Select>
            <Select value={filters.grade} onChange={(value) => { filters.onGradeChange(value); filters.onClassIdChange('Tất cả'); filters.onLessonIdChange('Tất cả'); }}>
              <option value="Tất cả">Tất cả khối</option>
              {gradeOptions.map((grade) => <option key={grade} value={grade}>Khối {grade}</option>)}
            </Select>
            <Select value={filters.classId} onChange={(value) => { const nextClass = classes.find((item) => String(item.lop_id) === String(value)); if (value !== 'Tất cả' && nextClass?.khoi && filters.grade === 'Tất cả') filters.onGradeChange(String(nextClass.khoi)); filters.onClassIdChange(value); filters.onLessonIdChange('Tất cả'); }}>
              <option value="Tất cả">Tất cả lớp</option>
              {visibleClasses.map((item) => <option key={item.lop_id} value={item.lop_id}>{item.ten_lop || item.lop_id}</option>)}
            </Select>
            <Select value={filters.subjectId} onChange={(value) => { filters.onSubjectIdChange(value); filters.onLessonIdChange('Tất cả'); }}>
              <option value="Tất cả">Tất cả môn</option>
              {subjects.map((subject) => <option key={subject.mon_id} value={subject.mon_id}>{subject.ten_mon}</option>)}</Select>
          </div>

          <div className={`mt-3 grid grid-cols-1 gap-3 ${(activeTab === 'lesson' || analyticsModule === 'preparation') ? 'xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,0.8fr)]' : 'xl:grid-cols-[minmax(0,1.25fr)]'}`}>
            <label className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100">
              <Search className="h-4 w-4 text-slate-400 transition group-focus-within:text-indigo-500" />
              <input value={filters.query} onChange={(e) => filters.onQueryChange(e.target.value)} placeholder={activeTab === 'grade' && analyticsModule === 'results' ? 'Tìm lớp...' : 'Tìm học sinh, mã HS...'} className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400" />
            </label>
            {(activeTab === 'lesson' || analyticsModule === 'preparation') && (
              <Select value={filters.lessonId} onChange={filters.onLessonIdChange}>
                <option value="Tất cả">{analyticsModule === 'preparation' ? 'Tất cả bài có video chuẩn bị' : 'Tất cả bài học'}</option>
                {(analyticsModule === 'preparation' ? preparationLessons : lessonReportLessons).map((lesson) => <option key={lesson.lesson_id} value={lesson.lesson_id}>{lesson.tieu_de}</option>)}
              </Select>
            )}
            {analyticsModule === 'preparation' && selectedPreparationLesson && (
              <Select value={preparationStatusFilter} onChange={(value) => setPreparationStatusFilter(value as 'all' | 'prepared' | 'not_prepared')}>
                <option value="all">Tất cả trạng thái chuẩn bị</option>
                <option value="prepared">Đã chuẩn bị bài</option>
                <option value="not_prepared">Chưa chuẩn bị bài</option>
              </Select>
            )}
            {activeTab === 'lesson' && analyticsModule === 'results' && (
              <Select value={filters.status} onChange={filters.onStatusChange}>
                <option value="Tất cả">Tất cả trạng thái</option>
                <option value="not_started">Chưa học</option>
                <option value="in_progress">Đang học</option>
                <option value="completed">Hoàn thành</option>
              </Select>
            )}
          </div>

          {analyticsModule === 'results' && activeTab === 'class' && (
            <div className="mt-3 space-y-3 rounded-[22px] border border-indigo-100 bg-gradient-to-r from-indigo-50/80 via-white to-violet-50/70 p-3">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.16em] text-indigo-600">Chế độ xem điểm</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {([
                      ['lessons', 'Từng bài'],
                      ['midterm1', 'Giữa kỳ 1'],
                      ['finalterm1', 'Cuối kỳ 1'],
                      ['midterm2', 'Giữa kỳ 2'],
                      ['finalterm2', 'Cuối kỳ 2'],
                      ['annual', 'Cả năm'],
                    ] as Array<[ResultScoreView, string]>).map(([value, label]) => (
                      <button
                        type="button"
                        key={value}
                        onClick={() => {
                          setResultScoreView(value);
                          setScoreConfigMessage('');
                          if (value === 'midterm1' || value === 'finalterm1') filters.onSemesterChange('HK1');
                          if (value === 'midterm2' || value === 'finalterm2') filters.onSemesterChange('HK2');
                          if (value === 'annual') filters.onSemesterChange('ALL');
                        }}
                        className={`rounded-xl px-3.5 py-2 text-xs font-black transition ${resultScoreView === value ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                {resultScoreView !== 'lessons' && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-slate-600 ring-1 ring-indigo-100">
                      {isScoreConfigLoading ? 'Đang tải cấu hình...' : `${milestoneLessonIds.length}/${milestoneDisplayLessons.length} bài được chọn`}
                    </span>
                    {scoreTrackingConfig?.inherited_from_grade ? <span className="rounded-full bg-violet-100 px-3 py-1.5 text-xs font-bold text-violet-700">Đang kế thừa cấu hình khối</span> : null}
                    <span className={`rounded-full px-3 py-1.5 text-xs font-black ${currentMilestoneLocked ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{currentMilestoneLocked ? '🔒 Đã chốt' : '● Đang cấu hình'}</span>
                    {milestoneHasPostLockChanges ? <span className="rounded-full bg-rose-100 px-3 py-1.5 text-xs font-black text-rose-700">⚠ Có điểm thay đổi sau khi chốt</span> : null}
                  </div>
                )}
              </div>
              {resultScoreView !== 'lessons' && (
                <div className="flex flex-col gap-3 rounded-2xl border border-indigo-100 bg-white/90 p-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-black text-slate-900">Cấu hình {MILESTONE_LABELS[resultScoreView]}</p>
                    <p className="mt-0.5 text-xs font-semibold text-slate-500">Đánh dấu trực tiếp các cột bài học bên dưới. Chỉ bài được chọn và có điểm chính thức mới tham gia tính trung bình.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => setInlineMilestoneSelection('all')} disabled={!scoreConfigScopeReady || isScoreConfigLoading || currentMilestoneLocked} className="rounded-xl bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50">Chọn tất cả</button>
                    <button type="button" onClick={() => setInlineMilestoneSelection('none')} disabled={!scoreConfigScopeReady || isScoreConfigLoading || currentMilestoneLocked} className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 disabled:opacity-50">Bỏ chọn</button>
                    <button type="button" onClick={() => void saveScoreConfig()} disabled={!scoreConfigScopeReady || isScoreConfigSaving || isScoreConfigLoading || currentMilestoneLocked} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-black text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"><Save className="h-4 w-4" /> {isScoreConfigSaving ? 'Đang lưu...' : 'Lưu cấu hình'}</button><button type="button" onClick={() => void setCurrentMilestoneLocked(!currentMilestoneLocked)} disabled={!scoreConfigScopeReady || isScoreConfigSaving || isScoreConfigLoading || (!currentMilestoneLocked && milestoneLessonIds.length === 0)} className={`rounded-xl px-4 py-2 text-xs font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300 ${currentMilestoneLocked ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}>{currentMilestoneLocked ? 'Mở lại cấu hình' : 'Chốt cấu hình'}</button>
                  </div>
                </div>
              )}
            </div>
          )}
          {scoreConfigMessage && !isScoreConfigOpen && <p className={`mt-2 text-xs font-semibold ${scoreConfigMessage.startsWith('Đã lưu') ? 'text-emerald-600' : 'text-rose-600'}`}>{scoreConfigMessage}</p>}
        </div>
      </div>

      {analyticsModule === 'preparation' ? (
        effectiveGrade === 'Tất cả' || filters.classId === 'Tất cả' ? (
          <EmptyState title="Chọn khối và lớp để theo dõi chuẩn bị bài" description="Hệ thống chỉ tải dữ liệu video chuẩn bị trong một phạm vi lớp cụ thể để tiết kiệm Firestore Spark và đánh giá đúng toàn bộ học sinh của lớp." />
        ) : preparationLessons.length === 0 ? (
          <EmptyState title="Chưa có bài học dùng video chuẩn bị" description="Các bài có bật Nhiệm vụ chuẩn bị bài bằng video sẽ xuất hiện tại đây." />
        ) : selectedPreparationLesson ? (
          <PreparationDetailTable lesson={selectedPreparationLesson} rows={preparationDetailRows} classDisplayMap={classDisplayMap} />
        ) : (
          <PreparationSummaryTable rows={preparationSummaryRows} onSelectLesson={filters.onLessonIdChange} />
        )
      ) : activeTab === 'class' ? (
        filters.classId === 'Tất cả' ? (
          <EmptyState title="Chọn một lớp cụ thể" description="Bảng điểm theo lớp chỉ hiển thị một lớp tại một thời điểm để không trộn học sinh và bài học của nhiều lớp/khối." />
        ) : resultScoreView !== 'lessons' ? (
          !scoreConfigScopeReady ? (
            <EmptyState title="Chọn một môn học cụ thể" description="Để cấu hình và tính trung bình theo mốc, hãy chọn Khối, Lớp và Môn học." />
          ) : milestoneDisplayLessons.length === 0 ? (
            <EmptyState title={`Chưa có bài học phù hợp cho ${MILESTONE_LABELS[resultScoreView]}`} description="Hãy kiểm tra học kỳ, môn học hoặc phạm vi lớp của các bài học." />
          ) : (
            <MilestoneGradebookTable
              milestone={resultScoreView}
              rows={milestoneGradebookRows}
              lessons={milestoneDisplayLessons}
              selectedLessonIds={milestoneLessonIds}
              onToggleLesson={toggleInlineMilestoneLesson}
              classDisplayMap={classDisplayMap}
              locked={currentMilestoneLocked}
            />
          )
        ) : (
          <ClassGradebookTable
            gradebookRows={gradebookRows}
            scopedLessons={scopedLessons}
            semester={filters.semester}
            classDisplayMap={classDisplayMap}
            onModerateResult={onModerateResult ? (student, progress) => {
              setModerationTarget({ student, progress });
              setModerationAction('allow_retake');
              setModerationReason('');
            } : undefined}
            onBulkOfficialRetake={onModerateResult ? async (targets) => {
              let success = 0;
              for (const target of targets) {
                const ok = await onModerateResult({
                  progress_id: `${target.progress.user_id}_${target.progress.lesson_id}`,
                  action: 'allow_retake',
                  reason: 'Cấp quyền học lại để cập nhật điểm hàng loạt từ bảng điểm',
                });
                if (ok) success += 1;
              }
              return success;
            } : undefined}
          />
        )
      ) : activeTab === 'grade' ? (
        effectiveGrade === 'Tất cả' ? (
          <EmptyState title="Chọn một khối để tổng hợp" description="Chế độ theo khối tổng hợp từng lớp trong cùng một khối; hệ thống không trộn nhiều khối trong một bảng." />
        ) : (
          <GradeSummaryTable
            rows={gradeSummaryRows}
            grade={effectiveGrade}
            onSelectClass={(classId) => {
              const classItem = classes.find((item) => String(item.lop_id) === String(classId));
              if (classItem?.khoi) filters.onGradeChange(String(classItem.khoi));
              filters.onClassIdChange(classId);
              filters.onLessonIdChange('Tất cả');
              setActiveTab('class');
            }}
          />
        )
      ) : effectiveGrade === 'Tất cả' ? (
        <EmptyState title="Chọn khối trước khi xem theo bài" description="Danh sách bài theo dõi chỉ được dựng trong một khối cụ thể để tránh trộn bài của nhiều khối." />
      ) : selectedLesson && selectedLessonStats ? (
        <SelectedLessonReport
          selectedLesson={selectedLesson}
          selectedLessonStats={selectedLessonStats}
          selectedLessonStudentRows={selectedLessonStudentRows}
          classDisplayMap={classDisplayMap}
          onModerateResult={onModerateResult ? (student, progress) => {
            setModerationTarget({ student, progress });
            setModerationAction('allow_retake');
            setModerationReason('');
          } : undefined}
        />
      ) : (
        <LessonSummaryList lessonSummaryRows={lessonSummaryRows} classMap={classMap} onSelectLesson={filters.onLessonIdChange} />
      )}

      {isScoreConfigOpen && scoreConfigDraft && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/55 px-4 backdrop-blur-sm">
          <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-4xl flex-col overflow-hidden rounded-[30px] bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-5 text-white">
              <div>
                <p className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em]"><Settings2 className="h-4 w-4" /> Cấu hình mốc tính điểm</p>
                <h3 className="mt-2 text-xl font-bold">{filters.subjectId} • Khối {effectiveGrade}{scoreConfigClassId ? ` • ${classMap.get(scoreConfigClassId)?.ten_lop || scoreConfigClassId}` : ' • Dùng chung toàn khối'}</h3>
                <p className="mt-1 text-sm text-white/80">Chỉ điểm chính thức của các bài được chọn mới tham gia trung bình. Điểm học lại luôn bị loại.</p>
              </div>
              <button type="button" onClick={() => setIsScoreConfigOpen(false)} className="rounded-2xl bg-white/15 p-2 hover:bg-white/25"><X className="h-5 w-5" /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-6">
              <div className="mb-5 flex flex-wrap gap-2">
                {(Object.keys(MILESTONE_LABELS) as AssessmentMilestoneKey[]).map((key) => (
                  <button key={key} type="button" onClick={() => setScoreConfigTab(key)} className={`rounded-xl px-4 py-2 text-sm font-bold ${scoreConfigTab === key ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{MILESTONE_LABELS[key]}</button>
                ))}
              </div>

              {scoreConfigTab === 'annual' && (
                <div className="mb-5 rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
                  <p className="font-bold text-indigo-900">Cách xác định bài cho Cả năm</p>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-indigo-100"><input type="radio" checked={scoreConfigDraft.annual_mode !== 'manual'} onChange={() => setScoreConfigDraft((current) => current ? { ...current, annual_mode: 'auto' } : current)} /> Tự động lấy hợp GK1 + CK1 + GK2 + CK2</label>
                    <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-indigo-100"><input type="radio" checked={scoreConfigDraft.annual_mode === 'manual'} onChange={() => setScoreConfigDraft((current) => current ? { ...current, annual_mode: 'manual' } : current)} /> Chọn bài Cả năm thủ công</label>
                  </div>
                </div>
              )}

              <div className="rounded-2xl border border-slate-200">
                <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3">
                  <div><p className="font-bold text-slate-900">{MILESTONE_LABELS[scoreConfigTab]}</p><p className="text-xs text-slate-500">Đã chọn {scoreConfigSelectedIds.length} bài • mỗi bài hệ số 1</p></div>
                  {scoreConfigTab === 'annual' && scoreConfigDraft.annual_mode !== 'manual' ? <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">Tự động</span> : null}
                </div>
                <div className="max-h-[420px] space-y-2 overflow-y-auto p-4">
                  {scoreConfigCandidateLessons.length ? scoreConfigCandidateLessons.map((lesson) => {
                    const selected = scoreConfigSelectedIds.includes(lesson.lesson_id);
                    const disabled = scoreConfigTab === 'annual' && scoreConfigDraft.annual_mode !== 'manual';
                    return (
                      <label key={lesson.lesson_id} className={`flex items-start gap-3 rounded-2xl border p-3 ${selected ? 'border-indigo-200 bg-indigo-50' : 'border-slate-100 bg-white'} ${disabled ? 'cursor-not-allowed opacity-70' : 'cursor-pointer hover:border-indigo-200'}`}>
                        <input type="checkbox" disabled={disabled} checked={selected} onChange={() => toggleScoreConfigLesson(lesson.lesson_id)} className="mt-1 h-4 w-4 accent-indigo-600" />
                        <span className="min-w-0"><span className="block font-bold text-slate-900">{getLessonColumnLabel(lesson)} • {lesson.tieu_de}</span><span className="mt-0.5 block text-xs text-slate-500">{getLessonSemester(lesson)} • {getLessonScopeLabel(lesson, classMap)}</span></span>
                      </label>
                    );
                  }) : <p className="py-8 text-center text-sm text-slate-500">Chưa có bài học phù hợp với năm học, môn và khối đã chọn.</p>}
                </div>
              </div>
              {scoreConfigMessage && <p className="mt-4 text-sm font-semibold text-rose-600">{scoreConfigMessage}</p>}
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-white px-6 py-4">
              <p className="text-xs font-semibold text-slate-500">{scoreConfigClassId ? 'Lưu cấu hình riêng cho lớp đang chọn.' : 'Lưu cấu hình chung cho toàn khối/môn.'}</p>
              <div className="flex gap-2"><button type="button" onClick={() => setIsScoreConfigOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50">Hủy</button><button type="button" disabled={isScoreConfigSaving} onClick={saveScoreConfig} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-60"><Save className="h-4 w-4" /> {isScoreConfigSaving ? 'Đang lưu...' : 'Lưu cấu hình'}</button></div>
            </div>
          </div>
        </div>
      )}

      {moderationTarget && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/50 px-4 backdrop-blur-sm">
          <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-xl flex-col overflow-hidden rounded-[30px] bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 bg-gradient-to-r from-rose-600 to-orange-500 px-6 py-5 text-white">
              <div>
                <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em]"><ShieldAlert className="h-4 w-4" /> Xử lý kết quả học tập</p>
                <h3 className="mt-2 text-xl font-bold">{moderationTarget.student.ho_ten}</h3>
                <p className="mt-1 text-sm text-white/85">{moderationTarget.progress.lesson_title} • Điểm {cleanScore(getLessonScore(moderationTarget.progress))}</p>
              </div>
              <button type="button" onClick={() => setModerationTarget(null)} className="rounded-2xl bg-white/15 p-2 hover:bg-white/25"><X className="h-5 w-5" /></button>
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6">
              {moderationTarget.progress.study_mode === 'co_learning' && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                  <p>Đây là kết quả học cùng. Thao tác sẽ áp dụng đồng thời cho toàn bộ {moderationTarget.progress.co_learner_user_ids?.length || moderationTarget.progress.co_learner_ids?.split(',').filter(Boolean).length || 2} học sinh trong nhóm.</p>
                  {moderationTarget.progress.co_learner_names?.length ? <p className="mt-1 font-medium">Thành viên: {moderationTarget.progress.co_learner_names.join(', ')}.</p> : null}
                </div>
              )}
              <label className={`flex cursor-pointer gap-3 rounded-2xl border p-4 ${moderationAction === 'allow_retake' ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200'}`}>
                <input type="radio" name="moderation-action" checked={moderationAction === 'allow_retake'} onChange={() => setModerationAction('allow_retake')} className="mt-1 h-4 w-4 accent-indigo-600" />
                <span><span className="flex items-center gap-2 font-bold text-slate-900"><RotateCcw className="h-4 w-4 text-indigo-600" /> Cho học lại để cập nhật điểm</span><span className="mt-1 block text-sm text-slate-500">Giữ nguyên điểm hiện tại và cấp đúng 1 lượt nộp mới. Điểm lần nộp mới sẽ thay điểm chính thức; điểm cũ vẫn được lưu lịch sử.</span></span>
              </label>
              <label className={`flex cursor-pointer gap-3 rounded-2xl border p-4 ${moderationAction === 'invalidate_cheating' ? 'border-rose-300 bg-rose-50' : 'border-slate-200'}`}>
                <input type="radio" name="moderation-action" checked={moderationAction === 'invalidate_cheating'} onChange={() => setModerationAction('invalidate_cheating')} className="mt-1 h-4 w-4 accent-rose-600" />
                <span><span className="flex items-center gap-2 font-bold text-slate-900"><AlertTriangle className="h-4 w-4 text-rose-600" /> Hủy do gian lận và khóa làm lại</span><span className="mt-1 block text-sm text-slate-500">Giữ lịch sử để đối chiếu, không tính điểm và chặn học sinh thực hiện lại bài.</span></span>
              </label>
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">Lý do {moderationAction === 'invalidate_cheating' ? '(bắt buộc)' : '(không bắt buộc)'}</label>
                <textarea value={moderationReason} onChange={(event) => setModerationReason(event.target.value)} rows={3} placeholder={moderationAction === 'invalidate_cheating' ? 'Nhập căn cứ hoặc mô tả hành vi gian lận...' : 'Nhập ghi chú cho lượt học lại cập nhật điểm...'} className="w-full resize-none rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" />
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-100 px-6 py-5">
              <button type="button" onClick={() => setModerationTarget(null)} className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600">Hủy</button>
              <button type="button" onClick={() => void submitModeration()} disabled={isModerating || (moderationAction === 'invalidate_cheating' && !moderationReason.trim())} className={`rounded-2xl px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300 ${moderationAction === 'invalidate_cheating' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}>{isModerating ? 'Đang xử lý...' : 'Xác nhận xử lý'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function GradeSummaryTable({ rows, grade, onSelectClass }: { rows: Array<any>; grade: string; onSelectClass: (classId: string) => void }) {
  if (!rows.length) return <EmptyState title={`Chưa có lớp thuộc Khối ${grade}`} description="Hãy kiểm tra năm học, môn học hoặc danh mục lớp." />;
  return (
    <div className="overflow-hidden rounded-[30px] bg-white shadow-sm ring-1 ring-slate-100">
      <div className="border-b border-violet-100 bg-violet-50 px-5 py-4">
        <h3 className="font-bold text-violet-900">Tổng hợp Khối {grade}</h3>
        <p className="mt-1 text-sm text-violet-700">Mỗi dòng là một lớp. Bấm vào lớp để mở bảng điểm chi tiết; không trộn học sinh giữa các lớp.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              {['Lớp', 'Sĩ số', 'Bài áp dụng', 'Đã tham gia', 'Hoàn thành', 'Tỉ lệ', 'Điểm TB', 'Chi tiết'].map((column) => <th key={column} className="px-4 py-4 text-center font-semibold first:text-left">{column}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => (
              <tr key={item.classItem.lop_id} className="border-t border-slate-100 hover:bg-slate-50/70">
                <td className="px-4 py-4"><p className="font-bold text-slate-900">{item.classItem.ten_lop || item.classItem.lop_id}</p><p className="text-xs text-slate-400">Khối {item.classItem.khoi || grade}</p></td>
                <td className="px-4 py-4 text-center font-semibold text-slate-700">{item.studentCount}</td>
                <td className="px-4 py-4 text-center font-semibold text-slate-700">{item.lessonCount}</td>
                <td className="px-4 py-4 text-center text-slate-600">{item.participatedAssignments}/{item.expectedAssignments}</td>
                <td className="px-4 py-4 text-center text-slate-600">{item.completedAssignments}/{item.expectedAssignments}</td>
                <td className="px-4 py-4 text-center"><span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">{item.completionRate}%</span></td>
                <td className="px-4 py-4 text-center font-bold text-emerald-700">{cleanScore(item.avgScore)}</td>
                <td className="px-4 py-4 text-center"><button type="button" onClick={() => onSelectClass(item.classItem.lop_id)} className="rounded-xl bg-violet-600 px-3 py-2 text-xs font-bold text-white hover:bg-violet-700">Xem lớp</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}


function PreparationSummaryTable({ rows, onSelectLesson }: { rows: Array<{ lesson: Lesson; total: number; prepared: number; notPrepared: number; rate: number }>; onSelectLesson: (lessonId: string) => void }) {
  if (!rows.length) return <EmptyState title="Chưa có dữ liệu chuẩn bị bài" description="Các bài có video chuẩn bị sẽ xuất hiện tại đây." />;
  return (
    <div className="overflow-hidden rounded-[30px] bg-white shadow-sm ring-1 ring-slate-100">
      <div className="border-b border-fuchsia-100 bg-fuchsia-50 px-5 py-4">
        <h3 className="font-bold text-slate-900">Tổng hợp chuẩn bị bài theo bài học</h3>
        <p className="mt-1 text-xs font-semibold text-slate-500">Đã chuẩn bị chỉ khi học sinh đạt ngưỡng video cấu hình và hoàn thành đúng hạn (nếu bài có hạn chuẩn bị).</p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500"><tr>{['Bài học', 'Ngưỡng', 'Học sinh', 'Đã chuẩn bị', 'Chưa chuẩn bị', 'Tỷ lệ', 'Chi tiết'].map((item) => <th key={item} className="px-4 py-3 font-semibold">{item}</th>)}</tr></thead>
          <tbody>{rows.map((item) => (
            <tr key={item.lesson.lesson_id} className="border-t border-slate-100 hover:bg-slate-50/60">
              <td className="min-w-[280px] px-4 py-4"><p className="font-bold text-slate-900">{getLessonColumnLabel(item.lesson)} • {item.lesson.tieu_de}</p><p className="mt-1 text-xs text-slate-500">{item.lesson.mon_hoc || item.lesson.mon_id} • Khối {item.lesson.khoi}</p></td>
              <td className="px-4 py-4 font-semibold text-fuchsia-700">{item.lesson.pre_lesson_completion_threshold || 80}%</td>
              <td className="px-4 py-4 font-semibold text-slate-700">{item.total}</td>
              <td className="px-4 py-4"><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">{item.prepared}</span></td>
              <td className="px-4 py-4"><span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-black text-rose-700">{item.notPrepared}</span></td>
              <td className="px-4 py-4"><span className="font-black text-indigo-700">{item.rate}%</span></td>
              <td className="px-4 py-4"><button type="button" onClick={() => onSelectLesson(item.lesson.lesson_id)} className="rounded-xl bg-fuchsia-600 px-3 py-2 text-xs font-bold text-white hover:bg-fuchsia-700">Xem học sinh</button></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

function PreparationDetailTable({ lesson, rows, classDisplayMap }: { lesson: Lesson; rows: Array<any>; classDisplayMap: Map<string, string> }) {
  return (
    <div className="overflow-hidden rounded-[30px] bg-white shadow-sm ring-1 ring-slate-100">
      <div className="border-b border-fuchsia-100 bg-gradient-to-r from-fuchsia-50 via-white to-indigo-50 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-xs font-black uppercase tracking-[0.16em] text-fuchsia-600">Chuẩn bị bài • Video</p><h3 className="mt-1 text-xl font-bold text-slate-900">{lesson.tieu_de}</h3><p className="mt-1 text-sm text-slate-500">Ngưỡng đạt: {lesson.pre_lesson_completion_threshold || 80}% • Kết quả chuẩn bị không tính vào điểm.</p></div>
          <span className="rounded-full bg-white px-4 py-2 text-xs font-black text-fuchsia-700 ring-1 ring-fuchsia-100">{rows.length} học sinh</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500"><tr>{['STT', 'Học sinh', 'Lớp', 'Video', 'Đánh giá', 'Chi tiết', 'Hoàn thành lúc'].map((item) => <th key={item} className="px-4 py-3 font-semibold">{item}</th>)}</tr></thead>
          <tbody>{rows.map((item) => (
            <tr key={item.student.user_id} className="border-t border-slate-100 hover:bg-slate-50/60">
              <td className="px-4 py-4 font-semibold text-slate-500">{item.index}</td>
              <td className="min-w-[230px] px-4 py-4"><p className="font-bold text-slate-900">{item.student.ho_ten}</p><p className="text-xs text-slate-500">{item.student.ma_hoc_sinh || item.student.user_id}</p></td>
              <td className="px-4 py-4 text-slate-600">{getStudentClassName(item.student, classDisplayMap)}</td>
              <td className="min-w-[150px] px-4 py-4"><div className="flex items-center gap-2"><div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${item.evaluation.prepared ? 'bg-emerald-500' : 'bg-fuchsia-500'}`} style={{ width: `${item.evaluation.watchPercent}%` }} /></div><span className="font-bold text-slate-700">{item.evaluation.watchPercent}%</span></div></td>
              <td className="px-4 py-4">{item.evaluation.prepared ? <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">Đã chuẩn bị bài</span> : <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-black text-rose-700">Chưa chuẩn bị bài</span>}</td>
              <td className="px-4 py-4 text-xs font-semibold text-slate-500">{item.evaluation.detail}</td>
              <td className="px-4 py-4 text-slate-500">{formatDateTime(item.progress?.pre_lesson_completed_at)}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

function MilestoneGradebookTable({
  milestone,
  rows,
  lessons,
  selectedLessonIds,
  onToggleLesson,
  classDisplayMap,
  locked = false,
}: {
  milestone: AssessmentMilestoneKey;
  rows: Array<any>;
  lessons: Lesson[];
  selectedLessonIds: string[];
  onToggleLesson: (lessonId: string) => void;
  classDisplayMap: Map<string, string>;
  locked?: boolean;
}) {
  const selectedSet = new Set(selectedLessonIds);
  return (
    <div className="overflow-hidden rounded-[30px] bg-white shadow-sm ring-1 ring-slate-100">
      <div className="border-b border-indigo-100 bg-gradient-to-r from-indigo-50 via-white to-violet-50 px-5 py-4">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="font-bold text-slate-900">Bảng điểm • {MILESTONE_LABELS[milestone]}</h3>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              Tích chọn bài ngay trên tiêu đề cột. Trung bình chỉ được chốt khi học sinh có điểm chính thức ở đủ các bài đã chọn; điểm học lại không tham gia.
            </p>
          </div>
          <span className="w-fit rounded-full bg-white px-3 py-1.5 text-xs font-black text-indigo-700 ring-1 ring-indigo-100">
            {selectedLessonIds.length}/{lessons.length} bài được tính
          </span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-max w-full text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="sticky left-0 z-20 w-[64px] bg-slate-50 px-4 py-4 text-center font-semibold">STT</th>
              <th className="sticky left-[64px] z-20 min-w-[250px] bg-slate-50 px-4 py-4 font-semibold">Họ và tên</th>
              {lessons.map((lesson) => {
                const checked = selectedSet.has(lesson.lesson_id);
                return (
                  <th key={lesson.lesson_id} title={lesson.tieu_de} className={`min-w-[118px] px-3 py-3 text-center font-semibold ${checked ? 'bg-indigo-50 text-indigo-700' : ''}`}>
                    <label className="flex cursor-pointer flex-col items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onToggleLesson(lesson.lesson_id)}
                        disabled={locked}
                        className="h-4 w-4 rounded border-slate-300 accent-indigo-600"
                      />
                      <span>{getLessonColumnLabel(lesson)}</span>
                      <span className="max-w-[110px] truncate text-[10px] font-medium text-slate-400">{lesson.lesson_name || lesson.tieu_de}</span>
                    </label>
                  </th>
                );
              })}
              <th className="sticky right-0 z-20 min-w-[140px] bg-indigo-50 px-4 py-4 text-center font-black text-indigo-700">TB {MILESTONE_LABELS[milestone]}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.student.user_id} className="border-t border-slate-100 hover:bg-slate-50/60">
                <td className="sticky left-0 z-10 bg-white px-4 py-4 text-center font-semibold text-slate-500">{row.index}</td>
                <td className="sticky left-[64px] z-10 bg-white px-4 py-4">
                  <p className="font-bold text-slate-900">{row.student.ho_ten}</p>
                  <p className="text-xs text-slate-500">{row.student.ma_hoc_sinh || row.student.user_id} • {getStudentClassName(row.student, classDisplayMap)}</p>
                </td>
                {lessons.map((lesson) => {
                  const item = row.displayLessonScores.find((entry: any) => entry.lesson.lesson_id === lesson.lesson_id);
                  const checked = selectedSet.has(lesson.lesson_id);
                  return (
                    <td key={lesson.lesson_id} className={`px-3 py-4 text-center ${checked ? 'bg-indigo-50/35' : ''}`}>
                      {item?.score !== undefined
                        ? <span className={`font-black ${checked ? 'text-indigo-700' : 'text-slate-700'}`}>{cleanScore(item.score)}</span>
                        : <span className="text-slate-300">-</span>}
                    </td>
                  );
                })}
                <td className={`sticky right-0 z-10 px-4 py-4 text-center font-black ${selectedLessonIds.length === 0 ? 'bg-slate-50 text-slate-400' : row.complete ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                  {selectedLessonIds.length === 0 ? 'Chưa chọn bài' : row.complete ? cleanScore(row.milestoneAverage) : `Chưa đủ ${row.completedCount}/${row.lessonScores.length}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}


function ClassGradebookTable({
  gradebookRows,
  scopedLessons,
  semester,
  classDisplayMap,
  onModerateResult,
  onBulkOfficialRetake,
}: {
  gradebookRows: Array<any>;
  scopedLessons: Lesson[];
  semester: string;
  classDisplayMap: Map<string, string>;
  onModerateResult?: (student: Account, progress: StudentLearningAnalyticsRow) => void;
  onBulkOfficialRetake?: (targets: Array<{ student: Account; progress: StudentLearningAnalyticsRow }>) => Promise<number>;
}) {
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [isBulkGranting, setIsBulkGranting] = useState(false);
  const [bulkMessage, setBulkMessage] = useState('');
  if (!gradebookRows.length) return <EmptyState title="Chưa có dữ liệu bảng điểm" description="Hãy chọn khối/lớp hoặc chờ học sinh bắt đầu học bài." />;

  const eligibleByStudent = new Map<string, { student: Account; progress: StudentLearningAnalyticsRow }>();
  gradebookRows.forEach((row) => {
    const progress = row.lessonScores
      .map((item: any) => item.progress as StudentLearningAnalyticsRow | undefined)
      .find((item: StudentLearningAnalyticsRow | undefined) => item && getLessonScore(item) !== undefined && item.result_state !== 'invalid_cheating' && item.result_state !== 'cancelled_retake');
    if (progress) eligibleByStudent.set(String(row.student.user_id), { student: row.student, progress });
  });
  const eligibleIds = [...eligibleByStudent.keys()];
  const allEligibleSelected = eligibleIds.length > 0 && eligibleIds.every((id) => bulkSelected.has(id));

  const toggleBulk = (userId: string) => {
    setBulkMessage('');
    setBulkSelected((current) => {
      const next = new Set(current);
      if (next.has(userId)) next.delete(userId); else next.add(userId);
      return next;
    });
  };

  const grantBulk = async () => {
    if (!onBulkOfficialRetake || isBulkGranting) return;
    const targets = [...bulkSelected].map((id) => eligibleByStudent.get(id)).filter((item): item is { student: Account; progress: StudentLearningAnalyticsRow } => Boolean(item));
    if (!targets.length) return;
    if (!window.confirm(`Cấp 1 lượt học lại để cập nhật điểm cho ${targets.length} học sinh đã chọn? Điểm lần nộp mới sẽ thay điểm chính thức hiện tại.`)) return;
    setIsBulkGranting(true);
    setBulkMessage('');
    try {
      const success = await onBulkOfficialRetake(targets);
      setBulkMessage(`Đã cấp quyền cho ${success}/${targets.length} học sinh.`);
      if (success > 0) setBulkSelected(new Set());
    } catch (error) {
      setBulkMessage(error instanceof Error ? error.message : 'Không thể cấp quyền học lại hàng loạt.');
    } finally {
      setIsBulkGranting(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-[30px] bg-white shadow-sm ring-1 ring-slate-100">
      <div className="flex flex-col gap-3 border-b border-indigo-100 bg-gradient-to-r from-indigo-50 via-white to-emerald-50 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="font-bold text-slate-900">Bảng điểm theo bài học</h3>
          <p className="mt-1 text-xs font-semibold text-slate-500">Mỗi bài là một cột. Chỉ hiển thị điểm chính thức; nhấn vào ô điểm để xem hoặc xử lý kết quả.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onBulkOfficialRetake ? (
            <>
              <button
                type="button"
                disabled={!eligibleIds.length}
                onClick={() => setBulkSelected(allEligibleSelected ? new Set() : new Set(eligibleIds))}
                className="rounded-xl bg-white px-3 py-2 text-xs font-bold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-50"
              >
                {allEligibleSelected ? 'Bỏ chọn HS' : 'Chọn HS có điểm'}
              </button>
              <button
                type="button"
                disabled={!bulkSelected.size || isBulkGranting}
                onClick={() => void grantBulk()}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-black text-white hover:bg-indigo-700 disabled:bg-slate-300"
              >
                <RotateCcw className="h-4 w-4" /> {isBulkGranting ? 'Đang cấp quyền...' : `Học lại cập nhật điểm (${bulkSelected.size})`}
              </button>
            </>
          ) : null}
          <span className="w-fit rounded-full bg-white px-3 py-1.5 text-xs font-black text-indigo-700 ring-1 ring-indigo-100">{scopedLessons.length} bài • {semester === 'ALL' ? 'Cả năm' : semester}</span>
        </div>
      </div>
      {bulkMessage ? <div className="border-b border-indigo-100 bg-indigo-50 px-5 py-2 text-xs font-bold text-indigo-700">{bulkMessage}</div> : null}
      <div className="overflow-x-auto">
        <table className="min-w-max w-full text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-left text-slate-500">
            <tr>
              {onBulkOfficialRetake ? <th className="sticky left-0 z-30 w-[48px] bg-slate-50 px-3 py-4 text-center font-semibold">Chọn</th> : null}
              <th className={`${onBulkOfficialRetake ? 'sticky left-[48px]' : 'sticky left-0'} z-20 w-[64px] bg-slate-50 px-4 py-4 text-center font-semibold`}>STT</th>
              <th className={`${onBulkOfficialRetake ? 'sticky left-[112px]' : 'sticky left-[64px]'} z-20 min-w-[250px] bg-slate-50 px-4 py-4 font-semibold`}>Họ và tên</th>
              {scopedLessons.map((lesson) => (
                <th key={lesson.lesson_id} title={lesson.tieu_de} className="min-w-[112px] px-3 py-4 text-center font-semibold">
                  <div>{getLessonColumnLabel(lesson)}</div>
                  <div className="mx-auto mt-1 max-w-[105px] truncate text-[10px] font-medium text-slate-400">{lesson.lesson_name || lesson.tieu_de}</div>
                </th>
              ))}
              <th className="sticky right-0 z-20 min-w-[110px] bg-indigo-50 px-4 py-4 text-center font-black text-indigo-700">Điểm TB</th>
            </tr>
          </thead>
          <tbody>
            {gradebookRows.map((row) => {
              const eligible = eligibleByStudent.has(String(row.student.user_id));
              const selected = bulkSelected.has(String(row.student.user_id));
              return (
                <tr key={row.student.user_id} className="border-t border-slate-100 align-top text-slate-700 hover:bg-slate-50/60">
                  {onBulkOfficialRetake ? (
                    <td className="sticky left-0 z-20 bg-white px-3 py-4 text-center">
                      <input type="checkbox" disabled={!eligible} checked={selected} onChange={() => toggleBulk(String(row.student.user_id))} className="h-4 w-4 accent-indigo-600 disabled:opacity-30" aria-label={`Chọn ${row.student.ho_ten}`} />
                    </td>
                  ) : null}
                  <td className={`${onBulkOfficialRetake ? 'sticky left-[48px]' : 'sticky left-0'} z-10 bg-white px-4 py-4 text-center font-semibold text-slate-500`}>{row.index}</td>
                  <td className={`${onBulkOfficialRetake ? 'sticky left-[112px]' : 'sticky left-[64px]'} z-10 bg-white px-4 py-4`}>
                    <p className="font-semibold text-slate-900">{row.student.ho_ten}</p>
                    <p className="text-xs text-slate-500">{row.student.ma_hoc_sinh || row.student.user_id} • {getStudentClassName(row.student, classDisplayMap)}</p>
                  </td>
                  {scopedLessons.map((lesson) => {
                    const item = row.lessonScores.find((entry: any) => entry.lesson.lesson_id === lesson.lesson_id);
                    return (
                      <ScoreCell
                        key={lesson.lesson_id}
                        value={item?.score}
                        status={item?.progress?.status}
                        resultState={item?.progress?.result_state}
                        scoreReason={item?.progress?.score_reason}
                        previousScore={item?.progress?.previous_official_score}
                        officialRetakeRemaining={item?.progress?.official_retake_remaining}
                        title={lesson.tieu_de}
                        onModerate={item?.progress && item?.score !== undefined && item.progress.result_state !== 'invalid_cheating' && item.progress.result_state !== 'cancelled_retake' && onModerateResult
                          ? () => onModerateResult(row.student, item.progress)
                          : undefined}
                      />
                    );
                  })}
                  <ScoreCell value={row.termAverage} emphasize />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SelectedLessonReport({
  selectedLesson,
  selectedLessonStats,
  selectedLessonStudentRows,
  classDisplayMap,
  onModerateResult,
}: {
  selectedLesson: Lesson;
  selectedLessonStats: { participated: number; notStarted: number; completedCount: number; inProgressCount: number; avg: number | undefined; total: number; preLessonCompletedOnTime: number; preLessonCompletedLate: number; preLessonInProgress: number; preLessonNotStarted: number };
  selectedLessonStudentRows: Array<{ index: number; student: Account; progress?: StudentLearningAnalyticsRow; score?: number; status: string }>;
  classDisplayMap: Map<string, string>;
  onModerateResult?: (student: Account, progress: StudentLearningAnalyticsRow) => void;
}) {
  return (
    <div className="overflow-hidden rounded-[30px] bg-white shadow-sm ring-1 ring-slate-100">
      <div className="border-b border-slate-100 bg-gradient-to-r from-emerald-50 via-white to-indigo-50 p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-600">Theo dõi kết quả theo bài</p>
            <h3 className="mt-2 text-2xl font-bold text-slate-900">{selectedLesson.tieu_de}</h3>
            <p className="mt-2 text-sm text-slate-500">
              {selectedLesson.mon_hoc || selectedLesson.mon_id} • Khối {selectedLesson.khoi || '-'}{selectedLesson.lop_id ? ` • Lớp ${classDisplayMap.get(normalizeClassLookupKey(selectedLesson.lop_id)) || selectedLesson.lop || selectedLesson.lop_id}` : ' • Tất cả lớp'} • {getLessonSemester(selectedLesson)} • {getLessonSchoolYear(selectedLesson)}
            </p>
          </div>
          <div className="rounded-2xl bg-white px-4 py-3 text-sm text-slate-600 shadow-sm ring-1 ring-slate-100">
            <p><span className="font-semibold text-slate-900">Mở bài:</span> {formatDateTime(selectedLesson.thoi_gian_bat_dau)}</p>
            <p><span className="font-semibold text-slate-900">Kết thúc:</span> {selectedLesson.thoi_gian_ket_thuc ? formatDateTime(selectedLesson.thoi_gian_ket_thuc) : 'Không giới hạn'}</p>
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <LessonReportStat icon={<Users className="h-4 w-4" />} label="Học sinh" value={selectedLessonStats.total} tone="sky" />
          <LessonReportStat icon={<UserCheck className="h-4 w-4" />} label="Đã tham gia" value={`${selectedLessonStats.participated}/${selectedLessonStats.total}`} tone="emerald" />
          <LessonReportStat icon={<UserX className="h-4 w-4" />} label="Chưa tham gia" value={selectedLessonStats.notStarted} tone="rose" />
          <LessonReportStat icon={<CheckCircle2 className="h-4 w-4" />} label="Hoàn thành" value={selectedLessonStats.completedCount} tone="indigo" />
          <LessonReportStat icon={<Trophy className="h-4 w-4" />} label="Điểm TB" value={selectedLessonStats.avg === undefined ? '-' : cleanScore(selectedLessonStats.avg)} tone="amber" />
        </div>
      </div>

      <div className="p-5">
        <div className="mb-4">
          <h4 className="font-bold text-slate-900">Danh sách kết quả chính thức</h4>
          <p className="mt-1 text-xs font-semibold text-slate-500">Chuẩn bị bài và tiến trình được theo dõi ở module riêng; bảng này chỉ tập trung vào kết quả học tập chính thức.</p>
        </div>
        {selectedLessonStudentRows.length ? (
          <div className="overflow-x-auto rounded-2xl border border-slate-100">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  {['STT', 'Học sinh', 'Lớp', 'Trạng thái', 'Điểm chính thức', 'Thao tác'].map((column) => <th key={column} className="px-4 py-3 font-semibold">{column}</th>)}
                </tr>
              </thead>
              <tbody>
                {selectedLessonStudentRows.map((item) => (
                  <tr key={item.student.user_id} className="border-t border-slate-100 align-top hover:bg-slate-50/60">
                    <td className="px-4 py-3 font-semibold text-slate-500">{item.index}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">{item.student.ho_ten}</p>
                      <p className="text-xs text-slate-500">{item.student.ma_hoc_sinh || item.student.user_id}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{getStudentClassName(item.student, classDisplayMap)}</td>
                    <td className="px-4 py-3"><StatusPill status={item.status} resultState={item.progress?.result_state} /></td>
                    <td className="px-4 py-3">
                      {item.score !== undefined
                        ? <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">{cleanScore(item.score)}/10</span>
                        : <span className="text-slate-300">-</span>}
                    </td>
                    <td className="px-4 py-3">
                      {item.progress && item.score !== undefined && item.progress.result_state !== 'invalid_cheating' && item.progress.result_state !== 'cancelled_retake' && onModerateResult ? (
                        <button type="button" onClick={() => onModerateResult(item.student, item.progress!)} className="whitespace-nowrap rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100">Xử lý kết quả</button>
                      ) : <span className="text-slate-300">-</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState title="Chưa có học sinh phù hợp" description="Hãy đổi bộ lọc trạng thái hoặc phạm vi lớp để xem dữ liệu." />}
      </div>
    </div>
  );
}

function LessonSummaryList({ lessonSummaryRows, classMap, onSelectLesson }: { lessonSummaryRows: Array<any>; classMap: Map<string, CatalogClass>; onSelectLesson: (value: string) => void }) {
  return (
    <div className="rounded-[28px] bg-white p-5 shadow-sm ring-1 ring-slate-100">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="font-bold text-slate-900">Danh sách bài học theo khối/lớp</h3>
          <p className="mt-1 text-sm text-slate-500">Trình bày dạng list để giáo viên chọn bài và xem tiến trình học sinh nhanh hơn.</p>
        </div>
        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">{lessonSummaryRows.length} bài học</span>
      </div>
      {lessonSummaryRows.length ? (
        <div className="space-y-3">
          {lessonSummaryRows.map((item) => (
            <button
              key={item.lesson.lesson_id}
              type="button"
              onClick={() => onSelectLesson(item.lesson.lesson_id)}
              className="w-full rounded-3xl border border-slate-100 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md"
            >
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700"><BookOpen className="h-3.5 w-3.5" /> {item.lesson.mon_hoc || item.lesson.mon_id}</span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{getLessonSemester(item.lesson)}</span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{getLessonScopeLabel(item.lesson, classMap)}</span>
                  </div>
                  <h4 className="truncate text-lg font-bold text-slate-900">{item.lesson.tieu_de}</h4>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-500">{item.lesson.mo_ta || item.lesson.raw?.tom_tat || 'Bài học chưa có mô tả.'}</p>
                </div>
                <div className="grid shrink-0 grid-cols-2 gap-2 md:grid-cols-5">
                  <SmallMetric label="Học sinh" value={item.total} tone="slate" />
                  <SmallMetric label="Đã tham gia" value={`${item.participated}/${item.total}`} tone="emerald" />
                  <SmallMetric label="Chưa tham gia" value={item.notStarted} tone="rose" />
                  <SmallMetric label="Hoàn thành" value={`${item.completedCount} (${item.completionRate}%)`} tone="indigo" />
                  <SmallMetric label="Điểm TB" value={cleanScore(item.avgScore)} tone="sky" />
                </div>
              </div>
            </button>
          ))}
        </div>
      ) : <EmptyState title="Chưa có bài học phù hợp" description="Hãy chọn năm học, học kỳ, khối, lớp, môn học khác." />}
    </div>
  );
}

function ScoreCell({ value, status, resultState, scoreReason, previousScore, officialRetakeRemaining, title, emphasize, onModerate }: { value?: number; status?: string; resultState?: string; scoreReason?: string; previousScore?: number; officialRetakeRemaining?: number; title?: string; emphasize?: boolean; onModerate?: () => void; key?: string }) {
  const hasScore = value !== undefined;
  const retaken = scoreReason === 'official_retake';
  const deadlineZero = scoreReason === 'deadline_missed' && hasScore && Number(value) === 0;
  const statusText = resultState === 'invalid_cheating'
    ? 'Gian lận'
    : resultState === 'cancelled_retake'
      ? 'Học lại'
      : !hasScore && status === 'in_progress' ? 'Đang học'
      : !hasScore ? '-'
      : `${retaken ? '↻ ' : ''}${cleanScore(value)}`;
  const lowScore = hasScore && value < 5;
  const mediumScore = hasScore && value >= 5 && value < 6.5;
  const tone = emphasize
    ? 'bg-indigo-50 text-indigo-700 font-bold'
    : resultState === 'invalid_cheating'
      ? 'bg-rose-50 text-rose-700 font-bold'
      : resultState === 'cancelled_retake'
        ? 'bg-indigo-50 text-indigo-700 font-bold'
      : deadlineZero
        ? 'bg-rose-100 text-rose-800 font-black'
      : retaken
        ? 'bg-violet-50 text-violet-700 font-black'
    : lowScore
      ? 'bg-rose-50 text-rose-700 font-bold'
      : mediumScore
        ? 'bg-amber-50 text-amber-700 font-bold'
        : hasScore
          ? 'bg-emerald-50 text-emerald-700 font-semibold'
          : status === 'in_progress'
            ? 'bg-amber-50 text-amber-700 font-semibold'
            : 'text-slate-400';
  const tooltip = [title, deadlineZero ? '0 điểm do quá hạn chưa hoàn thành' : '', retaken && previousScore !== undefined ? `Điểm trước: ${cleanScore(previousScore)}` : '', Number(officialRetakeRemaining || 0) > 0 ? 'Đã được cấp 1 lượt học lại cập nhật điểm' : ''].filter(Boolean).join(' • ');
  return (
    <td title={tooltip || title} className={`px-4 py-4 text-center ${tone}`}>
      {onModerate ? (
        <button
          type="button"
          onClick={onModerate}
          className="rounded-xl px-2.5 py-1.5 font-bold underline decoration-dotted underline-offset-4 transition hover:bg-white/70 focus:outline-none focus:ring-2 focus:ring-indigo-300"
          aria-label={`Xử lý kết quả ${title || ''}`.trim()}
        >
          {statusText}
        </button>
      ) : statusText}
    </td>
  );
}

function StatusPill({ status, resultState }: { status?: string; resultState?: string }) {
  if (resultState === 'invalid_cheating') return <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-bold text-rose-700 ring-1 ring-rose-100">Đã hủy do gian lận</span>;
  if (resultState === 'cancelled_retake') return <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700 ring-1 ring-indigo-100">Được học lại</span>;
  const normalized = status || 'not_started';
  if (normalized === 'deadline_missed') return <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-bold text-rose-700 ring-1 ring-rose-100">Quá hạn • 0 điểm</span>;
  const tones: Record<string, string> = {
    completed: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    in_progress: 'bg-amber-50 text-amber-700 ring-amber-100',
    not_started: 'bg-slate-50 text-slate-500 ring-slate-100',
  };
  return <span className={`rounded-full px-3 py-1 text-xs font-bold ring-1 ${tones[normalized] || tones.not_started}`}>{STATUS_LABELS[normalized] || normalized}</span>;
}

function LessonReportStat({ icon, label, value, tone }: { icon: ReactNode; label: string; value: string | number; tone: 'indigo' | 'emerald' | 'amber' | 'sky' | 'rose' }) {
  const tones = { indigo: 'bg-indigo-50 text-indigo-700', emerald: 'bg-emerald-50 text-emerald-700', amber: 'bg-amber-50 text-amber-700', sky: 'bg-sky-50 text-sky-700', rose: 'bg-rose-50 text-rose-700' } as const;
  return <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100"><div className={`mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl ${tones[tone]}`}>{icon}</div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</p><p className="mt-1 text-xl font-bold text-slate-900">{value}</p></div>;
}

function SmallMetric({ label, value, tone }: { label: string; value: string | number; tone: 'slate' | 'emerald' | 'rose' | 'indigo' | 'sky' }) {
  const tones = {
    slate: 'bg-slate-50 text-slate-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    rose: 'bg-rose-50 text-rose-700',
    indigo: 'bg-indigo-50 text-indigo-700',
    sky: 'bg-sky-50 text-sky-700',
  } as const;
  return <div className={`rounded-2xl px-3 py-2 ${tones[tone]}`}><p className="text-[10px] font-bold uppercase tracking-[0.12em] opacity-70">{label}</p><p className="mt-1 text-sm font-extrabold">{value}</p></div>;
}

function StatCard({ icon, label, value, tone }: { icon: ReactNode; label: string; value: string | number; tone: 'indigo' | 'emerald' | 'amber' | 'sky' }) {
  const tones = { indigo: 'bg-indigo-50 text-indigo-600', emerald: 'bg-emerald-50 text-emerald-600', amber: 'bg-amber-50 text-amber-600', sky: 'bg-sky-50 text-sky-600' } as const;
  return (
    <div className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-100">
      <div className={`mb-2 inline-flex h-8 w-8 items-center justify-center rounded-xl ${tones[tone]}`}>{icon}</div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</p>
      <p className="mt-0.5 text-xl font-bold text-slate-900">{value}</p>
    </div>
  );
}

function Select({ value, onChange, children }: { value: string; onChange: (value: string) => void; children: ReactNode }) {
  return (
    <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100">
      <BarChart3 className="h-4 w-4 text-slate-400" />
      <select value={value} onChange={(event) => onChange(event.target.value)} className="w-full bg-transparent text-sm text-slate-700 outline-none">
        {children}
      </select>
    </label>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-[28px] bg-white py-16 text-center shadow-sm ring-1 ring-slate-100">
      <GraduationCap className="mx-auto h-10 w-10 text-slate-300" />
      <h3 className="mt-4 text-lg font-bold text-slate-900">{title}</h3>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
    </div>
  );
}
