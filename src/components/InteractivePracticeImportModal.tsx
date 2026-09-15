import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, Clock3, FileCode2, Loader2, Settings2, UploadCloud, Users, X } from 'lucide-react';
import type { CatalogClass, InteractivePracticeManifest, Lesson, Subject } from '../types';
import { parseInteractivePracticeHtml, summarizePracticeManifest } from '../utils/practiceImporter';

interface Props {
  isOpen: boolean;
  lessons: Lesson[];
  subjects: Subject[];
  classes: CatalogClass[];
  isSubmitting?: boolean;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
}

const fieldClass = 'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100';
const checkClass = 'h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500';

function toLocalInput(value: string) { return value || ''; }

export default function InteractivePracticeImportModal({ isOpen, lessons, subjects, classes, isSubmitting = false, onClose, onSubmit }: Props) {
  const [lessonId, setLessonId] = useState('');
  const [title, setTitle] = useState('');
  const [manifest, setManifest] = useState<InteractivePracticeManifest | null>(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [timeLimit, setTimeLimit] = useState(20);
  const [maxAttempts, setMaxAttempts] = useState(3);
  const [passScore, setPassScore] = useState(5);
  const [availableFrom, setAvailableFrom] = useState('');
  const [availableUntil, setAvailableUntil] = useState('');
  const [allowSolo, setAllowSolo] = useState(true);
  const [allowCoLearning, setAllowCoLearning] = useState(true);
  const [autoSubmit, setAutoSubmit] = useState(true);
  const [showAnswersMode, setShowAnswersMode] = useState<'after_submit' | 'after_close' | 'never'>('after_submit');
  const [targetClassIds, setTargetClassIds] = useState<string[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    setLessonId(''); setTitle(''); setManifest(null); setFileName(''); setError(''); setIsParsing(false);
    setTimeLimit(20); setMaxAttempts(3); setPassScore(5); setAvailableFrom(''); setAvailableUntil('');
    setAllowSolo(true); setAllowCoLearning(true); setAutoSubmit(true); setShowAnswersMode('after_submit'); setTargetClassIds([]);
  }, [isOpen]);

  const sortedLessons = useMemo(() => [...lessons]
    .filter((lesson) => lesson.trang_thai !== 'rejected')
    .sort((a, b) => Number(a.khoi || 0) - Number(b.khoi || 0) || Number(a.lesson_number || 0) - Number(b.lesson_number || 0)), [lessons]);
  const selectedLesson = sortedLessons.find((lesson) => lesson.lesson_id === lessonId) || null;
  const summary = manifest ? summarizePracticeManifest(manifest) : null;
  const availableClasses = useMemo(() => classes
    .filter((item) => !selectedLesson?.khoi || String(item.khoi || '') === String(selectedLesson.khoi || ''))
    .sort((a, b) => String(a.ten_lop || a.lop_id).localeCompare(String(b.ten_lop || b.lop_id), 'vi')), [classes, selectedLesson?.khoi]);

  useEffect(() => {
    if (!selectedLesson) { setTargetClassIds([]); return; }
    const lessonClass = String((selectedLesson as any).lop_id || '');
    setTargetClassIds(lessonClass ? [lessonClass] : availableClasses.map((item) => item.lop_id));
  }, [lessonId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFile = async (file?: File | null) => {
    if (!file) return;
    setError(''); setManifest(null); setIsParsing(true); setFileName(file.name);
    try {
      if (!/\.html?$/i.test(file.name)) throw new Error('Hiện tại chức năng Luyện tập hỗ trợ file .html/.htm.');
      if (file.size > 900_000) throw new Error('File vượt quá 900 KB. Hãy tối ưu nội dung trước khi tải lên.');
      const html = await file.text();
      const parsed = parseInteractivePracticeHtml(html, file.name);
      setManifest(parsed);
      setTitle(parsed.title || file.name.replace(/\.html?$/i, ''));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không đọc được file bài tập tương tác.');
    } finally { setIsParsing(false); }
  };

  const toggleClass = (classId: string) => setTargetClassIds((current) => current.includes(classId) ? current.filter((id) => id !== classId) : [...current, classId]);

  const submit = async () => {
    if (!manifest || !selectedLesson) return;
    if (!allowSolo && !allowCoLearning) { setError('Cần bật ít nhất một chế độ: luyện một mình hoặc luyện cùng.'); return; }
    if (availableFrom && availableUntil && new Date(availableUntil).getTime() <= new Date(availableFrom).getTime()) { setError('Thời gian đóng phải sau thời gian mở.'); return; }
    if (!targetClassIds.length) { setError('Hãy chọn ít nhất một lớp được phép luyện tập.'); return; }
    const subjectName = subjects.find((subject) => subject.mon_id === selectedLesson.mon_id)?.ten_mon || selectedLesson.mon_hoc || '';
    const nextManifest: InteractivePracticeManifest = {
      ...manifest,
      title: title.trim() || manifest.title,
      subject: subjectName,
      grade: String(selectedLesson.khoi || ''),
      lessonId: selectedLesson.lesson_id,
      lessonNumber: Number(selectedLesson.lesson_number || 0) || undefined,
    };
    const config = {
      allow_retry: maxAttempts !== 1,
      source_mode: 'interactive_file',
      show_answers_after_submit: showAnswersMode === 'after_submit',
      show_answers_mode: showAnswersMode,
      time_limit_minutes: Math.max(0, timeLimit),
      max_attempts: Math.max(0, maxAttempts),
      pass_score: Math.max(0, Math.min(10, passScore)),
      auto_submit_on_timeout: autoSubmit,
      allow_solo: allowSolo,
      allow_co_learning: allowCoLearning,
      available_from: toLocalInput(availableFrom),
      available_until: toLocalInput(availableUntil),
      target_class_ids: targetClassIds,
      locked_class_ids: [],
    };
    await onSubmit({
      tieu_de: nextManifest.title,
      loai_on_tap: 'interactive_file', source_type: 'interactive_html', practice_schema_version: 2,
      source_file_name: fileName, activity_count: nextManifest.activities.length, max_score: nextManifest.maxScore,
      nam_hoc: selectedLesson.nam_hoc || '', hoc_ky: selectedLesson.hoc_ky || 'HK1', mon_id: selectedLesson.mon_id,
      khoi: selectedLesson.khoi, lop_id: '', pham_vi: 'shared', lesson_id: selectedLesson.lesson_id,
      lesson_ids: [selectedLesson.lesson_id], source_lesson_titles: selectedLesson.tieu_de,
      so_cau: summary?.scoredItemCount || 0, thoi_gian: config.time_limit_minutes, trang_thai: 'active',
      practice_manifest: nextManifest, cau_hinh: config, config,
      ...config,
    });
  };

  return <AnimatePresence>{isOpen ? <div className="fixed inset-0 z-[13500] flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-sm">
    <motion.div initial={{ opacity: 0, scale: .97, y: 14 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: .97, y: 14 }} className="flex max-h-[94dvh] w-full max-w-5xl flex-col overflow-hidden rounded-[30px] bg-white shadow-[0_30px_90px_rgba(15,23,42,.35)]">
      <header className="flex items-start justify-between gap-4 bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 px-6 py-5 text-white">
        <div><p className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-black uppercase tracking-[.14em]"><FileCode2 className="h-4 w-4" /> Nhập bài luyện tập</p><h2 className="mt-3 text-2xl font-black">Tạo Luyện tập từ file HTML</h2><p className="mt-1 text-sm text-white/85">Nhập nội dung và cấu hình truy cập ngay khi phát hành.</p></div>
        <button type="button" onClick={onClose} className="rounded-full bg-white/15 p-2 hover:bg-white/25"><X className="h-5 w-5" /></button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-4">
            <label className="block space-y-2"><span className="text-sm font-bold text-slate-700">Bài học liên kết</span><select value={lessonId} onChange={(e) => setLessonId(e.target.value)} className={fieldClass}><option value="">Chọn bài học...</option>{sortedLessons.map((lesson) => <option key={lesson.lesson_id} value={lesson.lesson_id}>Khối {lesson.khoi} • Bài {lesson.lesson_number || '-'} • {lesson.lesson_name || lesson.tieu_de}</option>)}</select></label>
            <label className="block space-y-2"><span className="text-sm font-bold text-slate-700">Tên bài luyện tập</span><input value={title} onChange={(e) => setTitle(e.target.value)} className={fieldClass} placeholder="Được lấy tự động từ file" /></label>
            <label className="block cursor-pointer rounded-[24px] border-2 border-dashed border-indigo-200 bg-indigo-50/60 p-6 text-center hover:border-indigo-400">
              <input type="file" accept=".html,.htm,text/html" className="hidden" onChange={(e) => void handleFile(e.target.files?.[0])} />
              {isParsing ? <Loader2 className="mx-auto h-8 w-8 animate-spin text-indigo-600" /> : <UploadCloud className="mx-auto h-8 w-8 text-indigo-600" />}
              <p className="mt-3 font-black text-slate-900">{fileName || 'Chọn file bài tập HTML'}</p><p className="mt-1 text-xs text-slate-500">Tối đa 900 KB • JavaScript trong file không được thực thi</p>
            </label>
            {summary ? <div className="rounded-[22px] border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"><p className="font-black"><CheckCircle2 className="mr-2 inline h-4 w-4" />Đã nhận diện thành công</p><p className="mt-2">{summary.activityCount} hoạt động • {summary.scoredItemCount} mục chấm điểm • tối đa {summary.maxScore}/10</p></div> : null}
          </div>

          <div className="space-y-4">
            <div className="rounded-[24px] border border-slate-200 p-4">
              <p className="flex items-center gap-2 font-black text-slate-900"><Clock3 className="h-4 w-4 text-indigo-600" /> Thời gian & lượt làm</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3"><label className="space-y-1"><span className="text-xs font-bold text-slate-500">Thời gian (phút)</span><input type="number" min="0" value={timeLimit} onChange={(e)=>setTimeLimit(Number(e.target.value)||0)} className={fieldClass}/></label><label className="space-y-1"><span className="text-xs font-bold text-slate-500">Số lượt tối đa</span><input type="number" min="0" value={maxAttempts} onChange={(e)=>setMaxAttempts(Number(e.target.value)||0)} className={fieldClass}/><span className="text-[11px] text-slate-400">0 = không giới hạn</span></label><label className="space-y-1"><span className="text-xs font-bold text-slate-500">Điểm đạt</span><input type="number" min="0" max="10" step="0.5" value={passScore} onChange={(e)=>setPassScore(Number(e.target.value)||0)} className={fieldClass}/></label></div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="space-y-1"><span className="text-xs font-bold text-slate-500">Mở từ</span><input type="datetime-local" value={availableFrom} onChange={(e)=>setAvailableFrom(e.target.value)} className={fieldClass}/></label><label className="space-y-1"><span className="text-xs font-bold text-slate-500">Đóng lúc</span><input type="datetime-local" value={availableUntil} onChange={(e)=>setAvailableUntil(e.target.value)} className={fieldClass}/></label></div>
            </div>
            <div className="rounded-[24px] border border-slate-200 p-4"><p className="flex items-center gap-2 font-black text-slate-900"><Users className="h-4 w-4 text-indigo-600" /> Chế độ luyện tập</p><div className="mt-3 grid gap-2 sm:grid-cols-2"><label className="flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-sm font-bold"><input type="checkbox" checked={allowSolo} onChange={(e)=>setAllowSolo(e.target.checked)} className={checkClass}/> Luyện một mình</label><label className="flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-sm font-bold"><input type="checkbox" checked={allowCoLearning} onChange={(e)=>setAllowCoLearning(e.target.checked)} className={checkClass}/> Luyện cùng bạn</label><label className="flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-sm font-bold"><input type="checkbox" checked={autoSubmit} onChange={(e)=>setAutoSubmit(e.target.checked)} className={checkClass}/> Tự nộp khi hết giờ</label><label className="space-y-1 rounded-xl bg-slate-50 p-3"><span className="text-xs font-bold text-slate-500">Hiển thị đáp án</span><select value={showAnswersMode} onChange={(e)=>setShowAnswersMode(e.target.value as any)} className="w-full bg-transparent text-sm font-bold outline-none"><option value="after_submit">Ngay sau khi nộp</option><option value="after_close">Sau khi bài đóng</option><option value="never">Không hiển thị</option></select></label></div></div>
            <div className="rounded-[24px] border border-slate-200 p-4"><div className="flex items-center justify-between"><p className="flex items-center gap-2 font-black text-slate-900"><Settings2 className="h-4 w-4 text-indigo-600" /> Lớp được phép luyện</p><button type="button" onClick={()=>setTargetClassIds(availableClasses.map(c=>c.lop_id))} className="text-xs font-black text-indigo-600">Chọn tất cả</button></div><div className="mt-3 grid max-h-44 gap-2 overflow-y-auto sm:grid-cols-2">{availableClasses.map((item)=><label key={item.lop_id} className="flex items-center gap-2 rounded-xl bg-slate-50 p-2.5 text-sm font-bold"><input type="checkbox" checked={targetClassIds.includes(item.lop_id)} onChange={()=>toggleClass(item.lop_id)} className={checkClass}/>{item.ten_lop || item.lop_id}</label>)}</div></div>
          </div>
        </div>
        {error ? <p className="mt-4 rounded-2xl bg-rose-50 p-3 text-sm font-bold text-rose-700">{error}</p> : null}
      </div>
      <footer className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4"><button type="button" onClick={onClose} className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-600">Hủy</button><button type="button" disabled={!manifest || !selectedLesson || isSubmitting} onClick={()=>void submit()} className="rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-black text-white disabled:bg-slate-300">{isSubmitting?'Đang lưu...':'Lưu & phát hành'}</button></footer>
    </motion.div>
  </div> : null}</AnimatePresence>;
}
