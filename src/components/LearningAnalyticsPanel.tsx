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
  X,
} from 'lucide-react';
import { Account, CatalogClass, LearningResultActionType, LearningResultModerationPayload, Lesson, SchoolYear, StudentLearningAnalyticsRow, Subject } from '../types';
import { DEFAULT_ACTIVE_GRADES, sortGrades } from '../constants';
import { compareStructuredLessons, getLessonColumnLabel, lessonAppliesToStudent } from '../utils/lessonCatalog';

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
  if (row.assessment_score !== undefined && Number.isFinite(Number(row.assessment_score))) {
    return Math.max(0, Math.min(10, Number(row.assessment_score)));
  }
  const source = Number(row.quiz_percent || row.completion_percent || 0);
  if (!source) return row.status === 'completed' ? 0 : undefined;
  return Math.max(0, Math.min(10, source / 10));
}

function getLearningResultLabel(row?: StudentLearningAnalyticsRow) {
  if (row?.result_state === 'invalid_cheating') return 'Đã hủy do gian lận';
  if (row?.result_state === 'cancelled_retake') return 'Được phép học lại';
  return STATUS_LABELS[row?.status || 'not_started'] || row?.status || 'Chưa học';
}

function average(values: number[]) {
  const valid = values.filter((item) => typeof item === 'number' && !Number.isNaN(item));
  if (!valid.length) return undefined;
  return valid.reduce((sum, item) => sum + item, 0) / valid.length;
}

function getStudentClassName(student: Account) {
  return student.ten_lop_hien_thi || student.ten_lop || student.lop_id || '-';
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
  const [activeTab, setActiveTab] = useState<AnalyticsTab>(filters.lessonId !== 'Tất cả' ? 'lesson' : 'class');
  const [moderationTarget, setModerationTarget] = useState<{ student: Account; progress: StudentLearningAnalyticsRow } | null>(null);
  const [moderationAction, setModerationAction] = useState<LearningResultActionType>('allow_retake');
  const [moderationReason, setModerationReason] = useState('');
  const [isModerating, setIsModerating] = useState(false);

  useEffect(() => {
    if (filters.lessonId !== 'Tất cả') setActiveTab('lesson');
  }, [filters.lessonId]);

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
      .filter((student) => filters.classId === 'Tất cả' || String(student.lop_id || '') === String(filters.classId))
      .filter((student) => !student.nam_hoc || String(student.nam_hoc) === selectedSchoolYear || historicalScopeMap.has(String(student.user_id)))
      .filter((student) => !query || normalizeText(student.ho_ten).includes(query) || normalizeText(student.ma_hoc_sinh).includes(query) || normalizeText(student.ten_dang_nhap).includes(query));
  }, [studentsForSelectedYear, effectiveGrade, filters.classId, filters.query, selectedSchoolYear, historicalScopeMap]);

  const gradebookRows = useMemo(() => {
    const mapped = visibleStudents.map((student) => {
      const applicableLessons = scopedLessons.filter((lesson) => lessonAppliesToStudent(lesson, student));
      const lessonScores = applicableLessons.map((lesson) => {
        const progress = progressMap.get(`${student.user_id}__${lesson.lesson_id}`);
        return { lesson, progress, score: getLessonScore(progress) };
      });
      const hk1Scores = applicableLessons.filter((lesson) => getLessonSemester(lesson) === 'HK1').map((lesson) => getLessonScore(progressMap.get(`${student.user_id}__${lesson.lesson_id}`))).filter((item): item is number => item !== undefined);
      const hk2Scores = applicableLessons.filter((lesson) => getLessonSemester(lesson) === 'HK2').map((lesson) => getLessonScore(progressMap.get(`${student.user_id}__${lesson.lesson_id}`))).filter((item): item is number => item !== undefined);
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
      const aScore = filters.semester === 'ALL' ? a.yearAverage : a.termAverage;
      const bScore = filters.semester === 'ALL' ? b.yearAverage : b.termAverage;
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
        return { index: 0, student, progress, score: getLessonScore(progress), status };
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
      const completedCount = progressItems.filter((item) => item.status === 'completed' && item.result_state !== 'invalid_cheating' && item.result_state !== 'cancelled_retake').length;
      const inProgressCount = progressItems.filter((item) => item.status === 'in_progress').length;
      const avgScore = average(progressItems.map((item) => getLessonScore(item)).filter((item): item is number => item !== undefined));
      return {
        lesson,
        total: targetStudents.length,
        participated: progressItems.length,
        notStarted: Math.max(0, targetStudents.length - progressItems.length),
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
    const completedCount = progressItems.filter((item) => item.status === 'completed' && item.result_state !== 'invalid_cheating' && item.result_state !== 'cancelled_retake').length;
    const inProgressCount = progressItems.filter((item) => item.status === 'in_progress').length;
    const avg = average(progressItems.map((item) => getLessonScore(item)).filter((item): item is number => item !== undefined));
    return { participated: progressItems.length, notStarted: Math.max(0, allStudentsForLesson.length - progressItems.length), completedCount, inProgressCount, avg, total: allStudentsForLesson.length };
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
          participatedAssignments: progressItems.length,
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
  const avgScore = average(gradebookRows.map((item) => filters.semester === 'ALL' ? item.yearAverage : item.termAverage).filter((item): item is number => item !== undefined));
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
        'Lớp': getStudentClassName(row.student),
      };
      if (filters.semester === 'ALL') {
        base['TB HK1'] = cleanScore(row.hk1Average);
        base['TB HK2'] = cleanScore(row.hk2Average);
        base['TB cả năm'] = cleanScore(row.yearAverage);
      } else {
        row.lessonScores.forEach((item) => {
          base[getLessonColumnLabel(item.lesson)] = cleanScore(item.score);
        });
        base['Điểm TB'] = cleanScore(row.termAverage);
      }
      base['Hoàn thành'] = `${row.completedLessons}/${row.lessonScores.length}`;
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
          Lớp: getStudentClassName(item.student),
          'Trạng thái': getLearningResultLabel(item.progress),
          'Tiến trình': item.progress ? `${item.progress.completed_steps}/${item.progress.total_steps}` : '-',
          'Hoàn thành %': item.progress?.completion_percent ?? '-',
          Điểm: cleanScore(item.score),
          'Luyện tập': item.progress?.quiz_total ? `${item.progress.quiz_correct || 0}/${item.progress.quiz_total}` : '-',
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

  const exportCurrentTab = activeTab === 'class' ? exportClassGradebook : activeTab === 'grade' ? exportGradeSummary : exportLessonReport;

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
              <BarChart3 className="h-3.5 w-3.5" /> Theo dõi học tập
            </p>
            <h2 className="mt-2 text-[26px] font-bold leading-tight text-slate-900">
              {activeTab === 'class' ? 'Theo dõi học tập theo lớp' : activeTab === 'grade' ? 'Tổng hợp học tập theo khối' : 'Theo dõi học tập theo bài theo khối/lớp'}
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-500">
              {activeTab === 'class'
                ? 'Chọn một lớp cụ thể để xem đúng học sinh và đúng các bài áp dụng cho lớp đó.'
                : activeTab === 'grade'
                  ? 'Tổng hợp theo từng lớp trong cùng một khối, không trộn học sinh của nhiều khối vào một bảng.'
                  : 'Chọn khối/lớp rồi xem danh sách bài và tiến trình học sinh đúng phạm vi.'}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 2xl:min-w-[460px]">
            <StatCard icon={<Users className="h-4 w-4" />} label="Học sinh" value={resolvedStudentCount} tone="indigo" />
            <StatCard icon={<BookOpen className="h-4 w-4" />} label="Bài học" value={resolvedLessonCount} tone="emerald" />
            <StatCard icon={<CalendarDays className="h-4 w-4" />} label="Đang học" value={activeTab === 'lesson' && selectedLessonStats ? selectedLessonStats.inProgressCount : inProgress} tone="amber" />
            <StatCard icon={<Trophy className="h-4 w-4" />} label="TB điểm" value={(activeTab === 'lesson' && selectedLessonStats ? selectedLessonStats.avg : avgScore) === undefined ? '-' : cleanScore(activeTab === 'lesson' && selectedLessonStats ? selectedLessonStats.avg : avgScore)} tone="sky" />
          </div>
        </div>

        <div className="mt-4 rounded-[24px] border border-slate-100 bg-slate-50/80 p-3">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap gap-2 rounded-2xl bg-white p-1.5 shadow-sm ring-1 ring-slate-100">
              <button
                type="button"
                onClick={() => setActiveTab('class')}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${activeTab === 'class' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                <Users className="h-4 w-4" /> Theo lớp
              </button>
              <button
                type="button"
                onClick={() => { setActiveTab('grade'); filters.onClassIdChange('Tất cả'); filters.onLessonIdChange('Tất cả'); }}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${activeTab === 'grade' ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/20' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                <GraduationCap className="h-4 w-4" /> Theo khối
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('lesson')}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${activeTab === 'lesson' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                <Layers className="h-4 w-4" /> Theo bài theo khối/lớp
              </button>
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
            <Select value={filters.semester} onChange={(value) => { filters.onSemesterChange(value); filters.onLessonIdChange('Tất cả'); }}>
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

          <div className={`mt-3 grid grid-cols-1 gap-3 ${activeTab === 'lesson' ? 'xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,0.8fr)]' : 'xl:grid-cols-[minmax(0,1.25fr)]'}`}>
            <label className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100">
              <Search className="h-4 w-4 text-slate-400 transition group-focus-within:text-indigo-500" />
              <input value={filters.query} onChange={(e) => filters.onQueryChange(e.target.value)} placeholder={activeTab === 'grade' ? 'Tìm lớp...' : activeTab === 'class' ? 'Tìm học sinh, mã HS...' : 'Tìm học sinh, mã HS...'} className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400" />
            </label>
            {activeTab === 'lesson' && (
              <Select value={filters.lessonId} onChange={filters.onLessonIdChange}>
                <option value="Tất cả">Tất cả bài học</option>
                {lessonReportLessons.map((lesson) => <option key={lesson.lesson_id} value={lesson.lesson_id}>{lesson.tieu_de}</option>)}
              </Select>
            )}
            {activeTab === 'lesson' && (
              <Select value={filters.status} onChange={filters.onStatusChange}>
                <option value="Tất cả">Tất cả trạng thái</option>
                <option value="not_started">Chưa học</option>
                <option value="in_progress">Đang học</option>
                <option value="completed">Hoàn thành</option>
              </Select>
            )}
          </div>
        </div>
      </div>

      {activeTab === 'class' ? (
        filters.classId === 'Tất cả' ? (
          <EmptyState title="Chọn một lớp cụ thể" description="Bảng điểm theo lớp chỉ hiển thị một lớp tại một thời điểm để không trộn học sinh và bài học của nhiều lớp/khối." />
        ) : (
          <ClassGradebookTable
            gradebookRows={gradebookRows}
            scopedLessons={scopedLessons}
            semester={filters.semester}
            onModerateResult={onModerateResult ? (student, progress) => {
              setModerationTarget({ student, progress });
              setModerationAction('allow_retake');
              setModerationReason('');
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
          onModerateResult={onModerateResult ? (student, progress) => {
            setModerationTarget({ student, progress });
            setModerationAction('allow_retake');
            setModerationReason('');
          } : undefined}
        />
      ) : (
        <LessonSummaryList lessonSummaryRows={lessonSummaryRows} classMap={classMap} onSelectLesson={filters.onLessonIdChange} />
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
                <span><span className="flex items-center gap-2 font-bold text-slate-900"><RotateCcw className="h-4 w-4 text-indigo-600" /> Hủy và cho học lại</span><span className="mt-1 block text-sm text-slate-500">Kết quả hiện tại không được tính; học sinh có thể thực hiện một lượt mới.</span></span>
              </label>
              <label className={`flex cursor-pointer gap-3 rounded-2xl border p-4 ${moderationAction === 'invalidate_cheating' ? 'border-rose-300 bg-rose-50' : 'border-slate-200'}`}>
                <input type="radio" name="moderation-action" checked={moderationAction === 'invalidate_cheating'} onChange={() => setModerationAction('invalidate_cheating')} className="mt-1 h-4 w-4 accent-rose-600" />
                <span><span className="flex items-center gap-2 font-bold text-slate-900"><AlertTriangle className="h-4 w-4 text-rose-600" /> Hủy do gian lận và khóa làm lại</span><span className="mt-1 block text-sm text-slate-500">Giữ lịch sử để đối chiếu, không tính điểm và chặn học sinh thực hiện lại bài.</span></span>
              </label>
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">Lý do {moderationAction === 'invalidate_cheating' ? '(bắt buộc)' : '(không bắt buộc)'}</label>
                <textarea value={moderationReason} onChange={(event) => setModerationReason(event.target.value)} rows={3} placeholder={moderationAction === 'invalidate_cheating' ? 'Nhập căn cứ hoặc mô tả hành vi gian lận...' : 'Nhập ghi chú cho lần học lại...'} className="w-full resize-none rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" />
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

function ClassGradebookTable({ gradebookRows, scopedLessons, semester, onModerateResult }: { gradebookRows: Array<any>; scopedLessons: Lesson[]; semester: string; onModerateResult?: (student: Account, progress: StudentLearningAnalyticsRow) => void }) {
  if (!gradebookRows.length) return <EmptyState title="Chưa có dữ liệu bảng điểm" description="Hãy chọn khối/lớp hoặc chờ học sinh bắt đầu học bài." />;
  return (
    <div className="overflow-hidden rounded-[30px] bg-white shadow-sm ring-1 ring-slate-100">
      {semester !== 'ALL' && onModerateResult ? <div className="border-b border-indigo-100 bg-indigo-50 px-5 py-3 text-xs font-semibold text-indigo-700">Nhấn vào một ô điểm để xem và xử lý kết quả của học sinh.</div> : null}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-4 font-semibold">STT</th>
              <th className="min-w-[240px] px-4 py-4 font-semibold">Họ và tên</th>
              <th className="px-4 py-4 font-semibold">Ngày sinh</th>
              {semester === 'ALL' ? (
                <>
                  <th className="px-4 py-4 text-center font-semibold">TB HK1</th>
                  <th className="px-4 py-4 text-center font-semibold">TB HK2</th>
                  <th className="px-4 py-4 text-center font-semibold">TB cả năm</th>
                </>
              ) : (
                scopedLessons.map((lesson) => <th key={lesson.lesson_id} title={lesson.tieu_de} className="px-4 py-4 text-center font-semibold">{getLessonColumnLabel(lesson)}</th>)
              )}
              <th className="px-4 py-4 text-center font-semibold">Điểm TB</th>
              <th className="px-4 py-4 text-center font-semibold">Hoàn thành</th>
            </tr>
          </thead>
          <tbody>
            {gradebookRows.map((row) => {
              const displayAverage = semester === 'ALL' ? row.yearAverage : row.termAverage;
              return (
                <tr key={row.student.user_id} className="border-t border-slate-100 align-top text-slate-700 hover:bg-slate-50/60">
                  <td className="px-4 py-4 font-semibold text-slate-500">{row.index}</td>
                  <td className="px-4 py-4">
                    <p className="font-semibold text-slate-900">{row.student.ho_ten}</p>
                    <p className="text-xs text-slate-500">{row.student.ma_hoc_sinh || row.student.user_id} • Khối {row.student.khoi || '-'} • {getStudentClassName(row.student)}</p>
                  </td>
                  <td className="px-4 py-4 text-slate-500">{row.student.ngay_sinh || '-'}</td>
                  {semester === 'ALL' ? (
                    <>
                      <ScoreCell value={row.hk1Average} />
                      <ScoreCell value={row.hk2Average} />
                      <ScoreCell value={row.yearAverage} emphasize />
                    </>
                  ) : row.lessonScores.map((item: any) => (
                    <ScoreCell
                      key={item.lesson.lesson_id}
                      value={item.score}
                      status={item.progress?.status}
                      resultState={item.progress?.result_state}
                      title={item.lesson.tieu_de}
                      onModerate={item.progress && item.score !== undefined && item.progress.result_state !== 'invalid_cheating' && item.progress.result_state !== 'cancelled_retake' && onModerateResult
                        ? () => onModerateResult(row.student, item.progress)
                        : undefined}
                    />
                  ))}
                  <ScoreCell value={displayAverage} emphasize />
                  <td className="px-4 py-4 text-center font-semibold text-slate-700">{row.completedLessons}/{row.lessonScores.length}</td>
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
  onModerateResult,
}: {
  selectedLesson: Lesson;
  selectedLessonStats: { participated: number; notStarted: number; completedCount: number; inProgressCount: number; avg: number | undefined; total: number };
  selectedLessonStudentRows: Array<{ index: number; student: Account; progress?: StudentLearningAnalyticsRow; score?: number; status: string }>;
  onModerateResult?: (student: Account, progress: StudentLearningAnalyticsRow) => void;
}) {
  return (
    <div className="overflow-hidden rounded-[30px] bg-white shadow-sm ring-1 ring-slate-100">
      <div className="border-b border-slate-100 bg-gradient-to-r from-emerald-50 via-white to-indigo-50 p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-600">Theo dõi học tập theo bài</p>
            <h3 className="mt-2 text-2xl font-bold text-slate-900">{selectedLesson.tieu_de}</h3>
            <p className="mt-2 text-sm text-slate-500">
              {selectedLesson.mon_hoc || selectedLesson.mon_id} • Khối {selectedLesson.khoi || '-'}{selectedLesson.lop_id ? ` • Lớp ${selectedLesson.lop || selectedLesson.lop_id}` : ' • Tất cả lớp'} • {getLessonSemester(selectedLesson)} • {getLessonSchoolYear(selectedLesson)}
            </p>
          </div>
          <div className="rounded-2xl bg-white px-4 py-3 text-sm text-slate-600 shadow-sm ring-1 ring-slate-100">
            <p><span className="font-semibold text-slate-900">Mở bài:</span> {formatDateTime(selectedLesson.thoi_gian_bat_dau)}</p>
            <p><span className="font-semibold text-slate-900">Kết thúc:</span> {selectedLesson.thoi_gian_ket_thuc ? formatDateTime(selectedLesson.thoi_gian_ket_thuc) : 'Không giới hạn'}</p>
          </div>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <LessonReportStat icon={<Users className="h-4 w-4" />} label="Học sinh" value={selectedLessonStats.total} tone="sky" />
          <LessonReportStat icon={<UserCheck className="h-4 w-4" />} label="Đã tham gia" value={`${selectedLessonStats.participated}/${selectedLessonStats.total}`} tone="emerald" />
          <LessonReportStat icon={<UserX className="h-4 w-4" />} label="Chưa tham gia" value={selectedLessonStats.notStarted} tone="rose" />
          <LessonReportStat icon={<CheckCircle2 className="h-4 w-4" />} label="Hoàn thành" value={selectedLessonStats.completedCount} tone="indigo" />
          <LessonReportStat icon={<Trophy className="h-4 w-4" />} label="Điểm TB" value={selectedLessonStats.avg === undefined ? '-' : cleanScore(selectedLessonStats.avg)} tone="amber" />
        </div>
      </div>

      <div className="p-5">
        <h4 className="mb-4 font-bold text-slate-900">Danh sách học sinh theo bài học</h4>
        {selectedLessonStudentRows.length ? (
          <div className="overflow-x-auto rounded-2xl border border-slate-100">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  {['STT', 'Học sinh', 'Lớp', 'Trạng thái', 'Tiến trình', 'Luyện tập', 'Điểm', 'Cập nhật', 'Thao tác'].map((column) => <th key={column} className="px-4 py-3 font-semibold">{column}</th>)}
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
                    <td className="px-4 py-3 text-slate-600">{getStudentClassName(item.student)}</td>
                    <td className="px-4 py-3"><StatusPill status={item.status} resultState={item.progress?.result_state} /></td>
                    <td className="px-4 py-3 text-slate-600">{item.progress ? `${item.progress.completed_steps}/${item.progress.total_steps} • ${item.progress.completion_percent}%` : '-'}</td>
                    <td className="px-4 py-3 text-slate-600">{item.progress?.quiz_total ? `${item.progress.quiz_correct || 0}/${item.progress.quiz_total} • ${item.progress.quiz_percent || 0}%` : '-'}</td>
                    <td className="px-4 py-3"><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">{cleanScore(item.score)}</span></td>
                    <td className="px-4 py-3 text-slate-500">{item.progress?.updated_at_display || item.progress?.updated_at || '-'}</td>
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

function ScoreCell({ value, status, resultState, title, emphasize, onModerate }: { value?: number; status?: string; resultState?: string; title?: string; emphasize?: boolean; onModerate?: () => void; key?: string }) {
  const hasScore = value !== undefined;
  const statusText = resultState === 'invalid_cheating'
    ? 'Gian lận'
    : resultState === 'cancelled_retake'
      ? 'Học lại'
      : !hasScore && status === 'in_progress' ? 'Đang học' : !hasScore ? '-' : cleanScore(value);
  const lowScore = hasScore && value < 5;
  const mediumScore = hasScore && value >= 5 && value < 6.5;
  const tone = emphasize
    ? 'bg-indigo-50 text-indigo-700 font-bold'
    : resultState === 'invalid_cheating'
      ? 'bg-rose-50 text-rose-700 font-bold'
      : resultState === 'cancelled_retake'
        ? 'bg-indigo-50 text-indigo-700 font-bold'
    : lowScore
      ? 'bg-rose-50 text-rose-700 font-bold'
      : mediumScore
        ? 'bg-amber-50 text-amber-700 font-bold'
        : hasScore
          ? 'bg-emerald-50 text-emerald-700 font-semibold'
          : status === 'in_progress'
            ? 'bg-amber-50 text-amber-700 font-semibold'
            : 'text-slate-400';
  return (
    <td title={title} className={`px-4 py-4 text-center ${tone}`}>
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
