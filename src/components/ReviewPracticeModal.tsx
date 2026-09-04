import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { BookOpenCheck, CheckCircle2, Clock, Layers3, Shuffle, X } from 'lucide-react';
import type { CatalogClass, FinalQuizQuestionType, Lesson, ReviewPracticeType, SchoolYear, Subject } from '../types';

interface Props {
  isOpen: boolean;
  lessons: Lesson[];
  subjects: Subject[];
  classes: CatalogClass[];
  schoolYears: SchoolYear[];
  currentSchoolYear: string;
  isSubmitting?: boolean;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
}

const fieldClass = 'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100';
const questionTypes: Array<{ value: FinalQuizQuestionType; label: string }> = [
  { value: 'single_choice', label: 'Chọn đáp án đúng nhất' },
  { value: 'true_false', label: 'Đúng / Sai' },
  { value: 'fill_in_blank', label: 'Chọn từ/cụm từ điền chỗ trống' },
];
const reviewTypes: Array<{ value: ReviewPracticeType; label: string }> = [
  { value: 'chapter', label: 'Ôn tập chương' },
  { value: 'midterm', label: 'Ôn tập giữa kỳ' },
  { value: 'final', label: 'Ôn tập cuối kỳ' },
  { value: 'topic', label: 'Ôn tập theo chủ đề' },
  { value: 'custom', label: 'Ôn tập tùy chọn' },
];

function normalizeGrade(value?: string | number | null) {
  return String(value ?? '').trim().replace(/\.0+$/, '');
}

function getCurrentSchoolYearValue(items: SchoolYear[], fallback: string) {
  return items.find((item) => item.la_hien_hanh === true || String(item.la_hien_hanh).toLowerCase() === 'true')?.ten_nam_hoc || fallback;
}

export default function ReviewPracticeModal({ isOpen, lessons, subjects, classes, schoolYears, currentSchoolYear, isSubmitting = false, onClose, onSubmit }: Props) {
  const defaultYear = getCurrentSchoolYearValue(schoolYears, currentSchoolYear);
  const [title, setTitle] = useState('');
  const [reviewType, setReviewType] = useState<ReviewPracticeType>('chapter');
  const [schoolYear, setSchoolYear] = useState(defaultYear);
  const [semester, setSemester] = useState('HK1');
  const [subjectId, setSubjectId] = useState('');
  const [grade, setGrade] = useState('');
  const [classId, setClassId] = useState('');
  const [questionCount, setQuestionCount] = useState(20);
  const [timeLimit, setTimeLimit] = useState(25);
  const [selectedTypes, setSelectedTypes] = useState<FinalQuizQuestionType[]>(['single_choice', 'true_false', 'fill_in_blank']);
  const [selectedLessonIds, setSelectedLessonIds] = useState<string[]>([]);
  const [shuffleQuestions, setShuffleQuestions] = useState(true);
  const [shuffleOptions, setShuffleOptions] = useState(true);
  const [showAnswers, setShowAnswers] = useState(true);
  const [allowRetry, setAllowRetry] = useState(true);

  const gradeOptions = useMemo(() => Array.from(new Set(classes.map((item) => normalizeGrade(item.khoi)).filter(Boolean))).sort((a, b) => Number(a) - Number(b)), [classes]);
  const subjectOptions = useMemo(() => subjects.filter((subject) => !grade || !subject.khoi_ap_dung || subject.khoi_ap_dung.split(',').map(normalizeGrade).includes(grade)), [subjects, grade]);
  const classOptions = useMemo(() => classes.filter((item) => (!grade || normalizeGrade(item.khoi) === grade) && (!schoolYear || !item.nam_hoc || item.nam_hoc === schoolYear)), [classes, grade, schoolYear]);
  const sourceLessons = useMemo(() => lessons.filter((lesson) => {
    if (schoolYear && lesson.nam_hoc && lesson.nam_hoc !== schoolYear) return false;
    if (semester && String(lesson.hoc_ky || '').toUpperCase() !== semester) return false;
    if (subjectId && lesson.mon_id !== subjectId) return false;
    if (grade && normalizeGrade(lesson.khoi) !== grade) return false;
    return lesson.trang_thai === 'approved_shared' || lesson.trang_thai === 'ready_private' || lesson.trang_thai === 'pending_review';
  }), [lessons, schoolYear, semester, subjectId, grade]);

  useEffect(() => {
    if (isOpen) {
      const nextYear = getCurrentSchoolYearValue(schoolYears, currentSchoolYear);
      setSchoolYear(nextYear);
      setSemester('HK1');
      setTitle('');
      setReviewType('chapter');
      setSubjectId('');
      setGrade('');
      setClassId('');
      setQuestionCount(20);
      setTimeLimit(25);
      setSelectedTypes(['single_choice', 'true_false', 'fill_in_blank']);
      setSelectedLessonIds([]);
      setShuffleQuestions(true);
      setShuffleOptions(true);
      setShowAnswers(true);
      setAllowRetry(true);
    }
  }, [isOpen, schoolYears, currentSchoolYear]);

  useEffect(() => {
    setSelectedLessonIds((current) => current.filter((id) => sourceLessons.some((lesson) => lesson.lesson_id === id)));
  }, [sourceLessons]);

  const toggleType = (value: FinalQuizQuestionType, checked: boolean) => {
    setSelectedTypes((current) => {
      const next = checked ? Array.from(new Set([...current, value])) : current.filter((item) => item !== value);
      return next.length ? next : [value];
    });
  };

  const toggleLesson = (lessonId: string, checked: boolean) => {
    setSelectedLessonIds((current) => checked ? Array.from(new Set([...current, lessonId])) : current.filter((item) => item !== lessonId));
  };

  const handleSubmit = async () => {
    const selectedSubjectName = subjects.find((item) => item.mon_id === subjectId)?.ten_mon || '';
    const autoTitle = `${reviewTypes.find((item) => item.value === reviewType)?.label || 'Bài ôn tập'}${selectedSubjectName ? ` ${selectedSubjectName}` : ''}${grade ? ` khối ${grade}` : ''}`;
    await onSubmit({
      tieu_de: title.trim() || autoTitle,
      loai_on_tap: reviewType,
      nam_hoc: schoolYear,
      hoc_ky: semester,
      mon_id: subjectId || sourceLessons.find((lesson) => selectedLessonIds.includes(lesson.lesson_id))?.mon_id || '',
      khoi: grade || sourceLessons.find((lesson) => selectedLessonIds.includes(lesson.lesson_id))?.khoi || '',
      lop_id: classId,
      lesson_ids: selectedLessonIds,
      so_cau: questionCount,
      thoi_gian: timeLimit,
      pham_vi: 'shared',
      cau_hinh: {
        question_types: selectedTypes,
        question_count: questionCount,
        time_limit_minutes: timeLimit,
        shuffle_questions: shuffleQuestions,
        shuffle_options: shuffleOptions,
        show_answers_after_submit: showAnswers,
        allow_retry: allowRetry,
        source_mode: 'balanced',
      },
    });
  };

  const canSubmit = selectedLessonIds.length > 0 && selectedTypes.length > 0 && questionCount > 0;

  return (
    <AnimatePresence>
      {isOpen ? (
        <div className="fixed inset-0 z-[13000] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
          <motion.div initial={{ opacity: 0, scale: 0.96, y: 18 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 18 }} className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-[32px] bg-white shadow-[0_30px_90px_rgba(15,23,42,0.35)] ring-1 ring-white/70">
            <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-fuchsia-600 px-6 py-5 text-white">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-black uppercase tracking-[0.14em]"><BookOpenCheck className="h-4 w-4" /> Tạo bài ôn tập</p>
                  <h2 className="mt-3 text-2xl font-black">Tạo bài ôn tập từ nhiều bài học</h2>
                  <p className="mt-1 text-sm text-white/85">Tổng hợp câu hỏi cuối bài để tạo ôn tập chương, giữa kỳ, cuối kỳ hoặc chủ đề.</p>
                </div>
                <button type="button" onClick={onClose} className="rounded-full bg-white/15 p-2 hover:bg-white/25"><X className="h-5 w-5" /></button>
              </div>
            </div>

            <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
              <div className="space-y-5 border-r border-slate-100 bg-slate-50/60 p-6">
                <section className="rounded-[26px] bg-white p-5 shadow-sm ring-1 ring-slate-100">
                  <p className="mb-4 text-sm font-black text-slate-900">1. Thông tin bài ôn tập</p>
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="space-y-2 md:col-span-2"><span className="text-sm font-semibold text-slate-700">Tiêu đề</span><input className={fieldClass} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ví dụ: Ôn tập chương 1 - Thông tin và dữ liệu" /></label>
                    <label className="space-y-2"><span className="text-sm font-semibold text-slate-700">Loại ôn tập</span><select className={fieldClass} value={reviewType} onChange={(e) => setReviewType(e.target.value as ReviewPracticeType)}>{reviewTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
                    <label className="space-y-2"><span className="text-sm font-semibold text-slate-700">Năm học</span><select className={fieldClass} value={schoolYear} onChange={(e) => setSchoolYear(e.target.value)}>{schoolYears.map((item) => <option key={item.nam_hoc_id || item.ten_nam_hoc} value={item.ten_nam_hoc}>{item.ten_nam_hoc}</option>)}</select></label>
                    <label className="space-y-2"><span className="text-sm font-semibold text-slate-700">Học kỳ</span><select className={fieldClass} value={semester} onChange={(e) => setSemester(e.target.value)}><option value="HK1">Học kỳ 1</option><option value="HK2">Học kỳ 2</option></select></label>
                    <label className="space-y-2"><span className="text-sm font-semibold text-slate-700">Khối</span><select className={fieldClass} value={grade} onChange={(e) => setGrade(e.target.value)}><option value="">Tất cả khối</option>{gradeOptions.map((item) => <option key={item} value={item}>Khối {item}</option>)}</select></label>
                    <label className="space-y-2"><span className="text-sm font-semibold text-slate-700">Môn học</span><select className={fieldClass} value={subjectId} onChange={(e) => setSubjectId(e.target.value)}><option value="">Tất cả môn</option>{subjectOptions.map((item) => <option key={item.mon_id} value={item.mon_id}>{item.ten_mon}</option>)}</select></label>
                    <label className="space-y-2"><span className="text-sm font-semibold text-slate-700">Lớp áp dụng</span><select className={fieldClass} value={classId} onChange={(e) => setClassId(e.target.value)}><option value="">Dùng chung theo khối</option>{classOptions.map((item) => <option key={item.lop_id} value={item.lop_id}>{item.ten_lop || item.lop_id}</option>)}</select></label>
                  </div>
                </section>

                <section className="rounded-[26px] bg-white p-5 shadow-sm ring-1 ring-slate-100">
                  <p className="mb-4 flex items-center gap-2 text-sm font-black text-slate-900"><Clock className="h-4 w-4 text-amber-600" /> 2. Cấu hình làm bài</p>
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="space-y-2"><span className="text-sm font-semibold text-slate-700">Số câu</span><input className={fieldClass} type="number" min={1} max={100} value={questionCount} onChange={(e) => setQuestionCount(Math.max(1, Math.min(100, Number(e.target.value) || 1)))} /></label>
                    <label className="space-y-2"><span className="text-sm font-semibold text-slate-700">Thời gian làm bài (phút)</span><input className={fieldClass} type="number" min={0} max={180} value={timeLimit} onChange={(e) => setTimeLimit(Math.max(0, Math.min(180, Number(e.target.value) || 0)))} /></label>
                  </div>
                  <div className="mt-4 grid gap-2 md:grid-cols-3">
                    {questionTypes.map((item) => <label key={item.value} className="flex items-center gap-2 rounded-2xl bg-amber-50 px-3 py-2 text-xs font-bold text-slate-700"><input type="checkbox" checked={selectedTypes.includes(item.value)} onChange={(e) => toggleType(item.value, e.target.checked)} />{item.label}</label>)}
                  </div>
                  <div className="mt-4 grid gap-2 md:grid-cols-2">
                    <label className="flex items-center gap-2 rounded-2xl bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={shuffleQuestions} onChange={(e) => setShuffleQuestions(e.target.checked)} /><Shuffle className="h-4 w-4" /> Đảo câu hỏi</label>
                    <label className="flex items-center gap-2 rounded-2xl bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={shuffleOptions} onChange={(e) => setShuffleOptions(e.target.checked)} /> Đảo đáp án</label>
                    <label className="flex items-center gap-2 rounded-2xl bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={showAnswers} onChange={(e) => setShowAnswers(e.target.checked)} /> Xem đáp án sau khi nộp</label>
                    <label className="flex items-center gap-2 rounded-2xl bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={allowRetry} onChange={(e) => setAllowRetry(e.target.checked)} /> Cho làm lại</label>
                  </div>
                </section>
              </div>

              <div className="flex min-h-0 flex-col p-6">
                <div className="mb-4 rounded-[26px] bg-indigo-50 p-4 ring-1 ring-indigo-100">
                  <p className="text-sm font-black text-indigo-900">3. Chọn nhiều bài học nguồn</p>
                  <p className="mt-1 text-xs font-semibold text-indigo-700">Đã chọn {selectedLessonIds.length}/{sourceLessons.length} bài • hệ thống lấy câu hỏi kiểm tra cuối bài để tạo ôn tập.</p>
                </div>
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                  {sourceLessons.map((lesson) => (
                    <label key={lesson.lesson_id} className={`flex items-start gap-3 rounded-2xl border p-4 transition ${selectedLessonIds.includes(lesson.lesson_id) ? 'border-indigo-300 bg-indigo-50' : 'border-slate-100 bg-white hover:bg-slate-50'}`}>
                      <input type="checkbox" className="mt-1" checked={selectedLessonIds.includes(lesson.lesson_id)} onChange={(e) => toggleLesson(lesson.lesson_id, e.target.checked)} />
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-slate-900 line-clamp-2">{lesson.tieu_de}</p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">{lesson.mon_hoc} • Khối {lesson.khoi} • {lesson.hoc_ky || 'HK1'} • {lesson.nam_hoc || schoolYear}</p>
                      </div>
                      {selectedLessonIds.includes(lesson.lesson_id) ? <CheckCircle2 className="h-5 w-5 text-indigo-600" /> : <Layers3 className="h-5 w-5 text-slate-300" />}
                    </label>
                  ))}
                  {!sourceLessons.length ? <div className="rounded-[26px] bg-white py-12 text-center text-sm font-semibold text-slate-500 ring-1 ring-slate-100">Không có bài học phù hợp với bộ lọc.</div> : null}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-white px-6 py-4">
              <p className="text-sm font-semibold text-slate-500">Bài ôn tập sẽ được tạo từ ngân hàng câu hỏi của các bài đã chọn.</p>
              <div className="flex gap-3">
                <button type="button" onClick={onClose} className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50">Hủy</button>
                <button type="button" disabled={!canSubmit || isSubmitting} onClick={() => void handleSubmit()} className="inline-flex items-center gap-2 rounded-2xl bg-amber-600 px-5 py-2.5 text-sm font-black text-white shadow-lg shadow-amber-200 hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50">
                  <BookOpenCheck className="h-4 w-4" /> {isSubmitting ? 'Đang tạo...' : 'Tạo bài ôn tập'}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
