import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, Clock3, Copy, FileCode2, Gamepad2, Loader2, Settings2, UploadCloud, Users, X } from 'lucide-react';
import type { CatalogClass, HtmlGamePracticeManifest, InteractivePracticeManifest, Lesson, Subject } from '../types';
import { parseInteractivePracticeHtml, summarizePracticeManifest } from '../utils/practiceImporter';
import { createGamePromptTemplate, inspectHtmlGame, prepareHtmlGameForRuntime, type HtmlGameImportInfo } from '../utils/gamePractice';

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
type ImportMode = 'interactive' | 'game';

export default function InteractivePracticeImportModal({ isOpen, lessons, subjects, classes, isSubmitting = false, onClose, onSubmit }: Props) {
  const [lessonId, setLessonId] = useState('');
  const [title, setTitle] = useState('');
  const [mode, setMode] = useState<ImportMode>('interactive');
  const [manifest, setManifest] = useState<InteractivePracticeManifest | null>(null);
  const [gameHtml, setGameHtml] = useState('');
  const [gameInfo, setGameInfo] = useState<HtmlGameImportInfo | null>(null);
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
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setLessonId(''); setTitle(''); setMode('interactive'); setManifest(null); setGameHtml(''); setGameInfo(null); setFileName(''); setError(''); setIsParsing(false);
    setTimeLimit(20); setMaxAttempts(3); setPassScore(5); setAvailableFrom(''); setAvailableUntil('');
    setAllowSolo(true); setAllowCoLearning(true); setAutoSubmit(true); setShowAnswersMode('after_submit'); setTargetClassIds([]); setCopied(false);
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

  const parseAsInteractive = (html: string, name: string) => {
    const parsed = parseInteractivePracticeHtml(html, name);
    setManifest(parsed); setGameHtml(''); setGameInfo(null); setMode('interactive');
    setTitle(parsed.title || name.replace(/\.html?$/i, ''));
  };

  const parseAsGame = (html: string, name: string) => {
    const info = inspectHtmlGame(html, name);
    setGameInfo(info); setGameHtml(prepareHtmlGameForRuntime(html, info)); setManifest(null); setMode('game');
    setTitle(info.title || name.replace(/\.html?$/i, ''));
  };

  const handleFile = async (file?: File | null) => {
    if (!file) return;
    setError(''); setManifest(null); setGameInfo(null); setGameHtml(''); setIsParsing(true); setFileName(file.name);
    try {
      if (!/\.html?$/i.test(file.name)) throw new Error('Chức năng Luyện tập hỗ trợ file .html/.htm.');
      if (file.size > 900_000) throw new Error('File vượt quá 900 KB. Hãy tối ưu nội dung trước khi tải lên.');
      const html = await file.text();
      const looksLikeGame = /\bGAME_DATA\b|requestAnimationFrame\s*\(|<canvas[\s>]|EDUSMART_GAME_|EduSmartGame\s*\./i.test(html);
      if (looksLikeGame) {
        parseAsGame(html, file.name);
      } else {
        try { parseAsInteractive(html, file.name); }
        catch { parseAsGame(html, file.name); }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không đọc được file HTML.');
    } finally { setIsParsing(false); }
  };

  const toggleClass = (classId: string) => setTargetClassIds((current) => current.includes(classId) ? current.filter((id) => id !== classId) : [...current, classId]);

  const submit = async () => {
    if ((!manifest && !gameHtml) || !selectedLesson) return;
    if (mode === 'game' && gameInfo?.compatibility === 'preview_only') { setError('Trò chơi chưa có cầu nối kết quả EduSmart Game V1. Hãy dùng prompt chuẩn để Gemini bổ sung sự kiện FINISH rồi tải lại file.'); return; }
    if (!allowSolo && !allowCoLearning) { setError('Cần bật ít nhất một chế độ: luyện một mình hoặc luyện cùng.'); return; }
    if (availableFrom && availableUntil && new Date(availableUntil).getTime() <= new Date(availableFrom).getTime()) { setError('Thời gian đóng phải sau thời gian mở.'); return; }
    if (!targetClassIds.length) { setError('Hãy chọn ít nhất một lớp được phép luyện tập.'); return; }
    const subjectName = subjects.find((subject) => subject.mon_id === selectedLesson.mon_id)?.ten_mon || selectedLesson.mon_hoc || '';
    const config = {
      allow_retry: maxAttempts !== 1,
      source_mode: mode === 'game' ? 'html_game' : 'interactive_file',
      show_answers_after_submit: showAnswersMode === 'after_submit', show_answers_mode: showAnswersMode,
      time_limit_minutes: Math.max(0, timeLimit), max_attempts: Math.max(0, maxAttempts), pass_score: Math.max(0, Math.min(10, passScore)),
      auto_submit_on_timeout: autoSubmit, allow_solo: allowSolo, allow_co_learning: allowCoLearning,
      available_from: availableFrom, available_until: availableUntil, target_class_ids: targetClassIds, locked_class_ids: [],
    };
    const common = {
      tieu_de: title.trim() || (mode === 'game' ? gameInfo?.title : manifest?.title) || 'Luyện tập',
      nam_hoc: selectedLesson.nam_hoc || '', hoc_ky: selectedLesson.hoc_ky || 'HK1', mon_id: selectedLesson.mon_id,
      khoi: selectedLesson.khoi, lop_id: '', pham_vi: 'shared', lesson_id: selectedLesson.lesson_id,
      lesson_ids: [selectedLesson.lesson_id], source_lesson_titles: selectedLesson.tieu_de,
      thoi_gian: config.time_limit_minutes, trang_thai: 'active', source_file_name: fileName,
      cau_hinh: config, config, ...config,
    };
    if (mode === 'game' && gameInfo) {
      const gameManifest: HtmlGamePracticeManifest = {
        schemaVersion: 'edusmart_game_v1', compatibility: gameInfo.compatibility, sourceFileName: fileName,
        title: title.trim() || gameInfo.title, adapter: gameInfo.detectedLegacyAdapter,
        warnings: gameInfo.warnings, externalResources: gameInfo.externalResources, importedAt: new Date().toISOString(),
      };
      await onSubmit({ ...common, loai_on_tap: 'html_game', source_type: 'html_game', practice_schema_version: 3, game_schema_version: 'edusmart_game_v1', game_compatibility: gameInfo.compatibility, so_cau: 0, activity_count: 1, max_score: 10, game_html: gameHtml, game_manifest: gameManifest });
      return;
    }
    if (!manifest) return;
    const nextManifest: InteractivePracticeManifest = { ...manifest, title: title.trim() || manifest.title, subject: subjectName, grade: String(selectedLesson.khoi || ''), lessonId: selectedLesson.lesson_id, lessonNumber: Number(selectedLesson.lesson_number || 0) || undefined };
    await onSubmit({ ...common, tieu_de: nextManifest.title, loai_on_tap: 'interactive_file', source_type: 'interactive_html', practice_schema_version: 2, activity_count: nextManifest.activities.length, max_score: nextManifest.maxScore, so_cau: summary?.scoredItemCount || 0, practice_manifest: nextManifest });
  };

  const copyPrompt = async () => { await navigator.clipboard.writeText(createGamePromptTemplate()); setCopied(true); window.setTimeout(()=>setCopied(false), 1800); };
  const recognized = mode === 'game' ? Boolean(gameInfo) : Boolean(summary);

  return <AnimatePresence>{isOpen ? <div className="fixed inset-0 z-[13500] flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-sm">
    <motion.div initial={{ opacity: 0, scale: .97, y: 14 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: .97, y: 14 }} className="flex max-h-[94dvh] w-full max-w-5xl flex-col overflow-hidden rounded-[30px] bg-white shadow-[0_30px_90px_rgba(15,23,42,.35)]">
      <header className="flex items-start justify-between gap-4 bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 px-6 py-5 text-white">
        <div><p className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-black uppercase tracking-[.14em]"><FileCode2 className="h-4 w-4" /> Nhập luyện tập HTML</p><h2 className="mt-3 text-2xl font-black">Luyện tập tương tác & Trò chơi Gemini</h2><p className="mt-1 text-sm text-white/85">EduSmart tự nhận diện bài tập chuẩn hoặc trò chơi HTML và cấu hình phát hành theo lớp.</p></div>
        <button type="button" onClick={onClose} className="rounded-full bg-white/15 p-2 hover:bg-white/25"><X className="h-5 w-5" /></button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-4">
            <label className="block space-y-2"><span className="text-sm font-bold text-slate-700">Bài học liên kết</span><select value={lessonId} onChange={(e) => setLessonId(e.target.value)} className={fieldClass}><option value="">Chọn bài học...</option>{sortedLessons.map((lesson) => <option key={lesson.lesson_id} value={lesson.lesson_id}>Khối {lesson.khoi} • Bài {lesson.lesson_number || '-'} • {lesson.lesson_name || lesson.tieu_de}</option>)}</select></label>
            <label className="block space-y-2"><span className="text-sm font-bold text-slate-700">Tên bài luyện tập</span><input value={title} onChange={(e) => setTitle(e.target.value)} className={fieldClass} placeholder="Được lấy tự động từ file" /></label>
            <label className="block cursor-pointer rounded-[24px] border-2 border-dashed border-indigo-200 bg-indigo-50/60 p-6 text-center hover:border-indigo-400"><input type="file" accept=".html,.htm,text/html" className="hidden" onChange={(e) => void handleFile(e.target.files?.[0])} />{isParsing ? <Loader2 className="mx-auto h-8 w-8 animate-spin text-indigo-600" /> : <UploadCloud className="mx-auto h-8 w-8 text-indigo-600" />}<p className="mt-3 font-black text-slate-900">{fileName || 'Chọn file HTML từ Gemini hoặc file bài tập'}</p><p className="mt-1 text-xs text-slate-500">Tối đa 900 KB • Trò chơi chạy trong iframe sandbox</p></label>
            {recognized ? <div className={`rounded-[22px] border p-4 text-sm ${mode==='game'?'border-violet-200 bg-violet-50 text-violet-900':'border-emerald-200 bg-emerald-50 text-emerald-900'}`}><p className="font-black">{mode==='game'?<Gamepad2 className="mr-2 inline h-4 w-4"/>:<CheckCircle2 className="mr-2 inline h-4 w-4"/>}{mode==='game'?'Đã nhận diện Trò chơi HTML':'Đã nhận diện Luyện tập tương tác'}</p>{mode==='interactive'&&summary?<p className="mt-2">{summary.activityCount} hoạt động • {summary.scoredItemCount} mục chấm điểm • tối đa {summary.maxScore}/10</p>:null}{mode==='game'&&gameInfo?<><p className="mt-2"><b>Tương thích:</b> {gameInfo.compatibility==='contract'?'EduSmart Game Contract V1':gameInfo.compatibility==='legacy_auto'?'Tự động chuyển đổi tương thích':'Chỉ xem thử'}</p>{gameInfo.warnings.map((w,i)=><p key={i} className="mt-1 text-xs">• {w}</p>)}</>:null}</div>:null}
            <div className="rounded-[22px] border border-violet-100 bg-violet-50/60 p-4"><div className="flex items-center justify-between gap-3"><div><p className="font-black text-violet-900">Prompt chuẩn cho Gemini</p><p className="mt-1 text-xs leading-5 text-violet-700">Dùng đoạn hợp đồng này trong prompt tạo game để kết quả được EduSmart lưu tự động.</p></div><button type="button" onClick={()=>void copyPrompt()} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-xs font-black text-violet-700 shadow-sm"><Copy className="h-3.5 w-3.5"/>{copied?'Đã sao chép':'Sao chép'}</button></div></div>
          </div>
          <div className="space-y-4">
            <div className="rounded-[24px] border border-slate-200 p-4"><p className="flex items-center gap-2 font-black text-slate-900"><Clock3 className="h-4 w-4 text-indigo-600"/>Thời gian & đánh giá</p><div className="mt-3 grid gap-3 sm:grid-cols-3"><label className="space-y-1"><span className="text-xs font-bold text-slate-500">Phút</span><input className={fieldClass} type="number" min="0" value={timeLimit} onChange={e=>setTimeLimit(Number(e.target.value)||0)}/></label><label className="space-y-1"><span className="text-xs font-bold text-slate-500">Lượt tối đa</span><input className={fieldClass} type="number" min="0" value={maxAttempts} onChange={e=>setMaxAttempts(Number(e.target.value)||0)}/></label><label className="space-y-1"><span className="text-xs font-bold text-slate-500">Điểm đạt</span><input className={fieldClass} type="number" min="0" max="10" step=".5" value={passScore} onChange={e=>setPassScore(Number(e.target.value)||0)}/></label></div><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="space-y-1"><span className="text-xs font-bold text-slate-500">Mở từ</span><input className={fieldClass} type="datetime-local" value={availableFrom} onChange={e=>setAvailableFrom(e.target.value)}/></label><label className="space-y-1"><span className="text-xs font-bold text-slate-500">Đóng lúc</span><input className={fieldClass} type="datetime-local" value={availableUntil} onChange={e=>setAvailableUntil(e.target.value)}/></label></div></div>
            <div className="rounded-[24px] border border-slate-200 p-4"><p className="flex items-center gap-2 font-black text-slate-900"><Settings2 className="h-4 w-4 text-indigo-600"/>Cách thực hiện</p><div className="mt-3 grid gap-2"><label className="flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-sm font-bold"><input className={checkClass} type="checkbox" checked={allowSolo} onChange={e=>setAllowSolo(e.target.checked)}/> Luyện một mình</label><label className="flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-sm font-bold"><input className={checkClass} type="checkbox" checked={allowCoLearning} onChange={e=>setAllowCoLearning(e.target.checked)}/> Luyện cùng bạn</label><label className="flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-sm font-bold"><input className={checkClass} type="checkbox" checked={autoSubmit} onChange={e=>setAutoSubmit(e.target.checked)}/> Tự nộp khi hết giờ</label>{mode==='interactive'?<label className="space-y-1"><span className="text-xs font-bold text-slate-500">Hiển thị đáp án</span><select className={fieldClass} value={showAnswersMode} onChange={e=>setShowAnswersMode(e.target.value as any)}><option value="after_submit">Ngay sau khi nộp</option><option value="after_close">Sau khi bài đóng</option><option value="never">Không hiển thị</option></select></label>:null}</div></div>
          </div>
        </div>
        {selectedLesson ? <section className="mt-5 rounded-[24px] border border-slate-200 p-4"><h3 className="flex items-center gap-2 font-black"><Users className="h-4 w-4 text-indigo-600"/>Lớp được phép luyện tập</h3><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{availableClasses.map(c=><label key={c.lop_id} className={`flex items-center gap-2 rounded-xl border p-3 text-sm font-bold ${targetClassIds.includes(c.lop_id)?'border-indigo-200 bg-indigo-50':'border-slate-100 bg-slate-50'}`}><input type="checkbox" className={checkClass} checked={targetClassIds.includes(c.lop_id)} onChange={()=>toggleClass(c.lop_id)}/>{c.ten_lop||c.lop_id}</label>)}</div></section>:null}
        {error?<div className="mt-4 rounded-2xl bg-rose-50 p-4 text-sm font-bold text-rose-700">{error}</div>:null}
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-6 py-4"><p className="text-xs font-semibold text-slate-500">{mode==='game'?'Game Runtime V1 • Kết quả lưu vào cùng bảng kết quả Luyện tập':'Practice Manifest • Không thực thi JavaScript nguồn'}</p><div className="flex gap-2"><button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold">Hủy</button><button type="button" disabled={isSubmitting||!selectedLesson||!recognized||!targetClassIds.length||(mode==='game'&&gameInfo?.compatibility==='preview_only')} onClick={()=>void submit()} className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-black text-white disabled:bg-slate-300">{isSubmitting?'Đang lưu...':mode==='game'?'Phát hành trò chơi':'Phát hành luyện tập'}</button></div></footer>
    </motion.div>
  </div> : null}</AnimatePresence>;
}
