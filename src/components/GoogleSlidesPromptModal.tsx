import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Clipboard, Cloud, Download, ExternalLink, FileText, History, KeyRound, Loader2, Presentation, Sparkles, X } from 'lucide-react';
import { AIConfig, GoogleSlidePromptItem, GoogleSlidesPromptRecord, GoogleSlidesPromptResult, LessonContent, User } from '../types';
import { generateGoogleSlidesPrompts } from '../services/gemini';
import { listGoogleSlidesPromptsApi, saveGoogleSlidesPromptApi } from '../services/api';
import { createDocxBlob, type DocxParagraph } from '../utils/docxExporter';

interface GoogleSlidesPromptModalProps {
  isOpen: boolean;
  content: LessonContent | null;
  aiConfig: AIConfig;
  subjectName?: string;
  grade?: string;
  user: User;
  lessonInfo?: {
    lesson_id?: string;
    mon_id?: string;
    khoi?: string;
    lop_id?: string;
    nam_hoc?: string;
    hoc_ky?: string;
    tieu_de?: string;
  };
  onClose: () => void;
  onOpenConfig: (reason?: 'manual' | 'quota') => void;
}

function cleanFileName(value: string) {
  return String(value || 'bai_trinh_chieu')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'bai_trinh_chieu';
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function lessonStat(content: LessonContent | null) {
  const sectionCount = content?.sections?.length || 0;
  const interactiveCount = content?.sections?.reduce((sum, section) => sum + (section.interactive_questions?.length || 0), 0) || 0;
  const finalQuizCount = content?.final_quiz?.length || 0;
  return { sectionCount, interactiveCount, finalQuizCount };
}

function normalizePromptMarkdown(text: string) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/^PROMPT DÁN VÀO GEMINI\/GOOGLE SLIDES:\s*/gim, '')
    .replace(/^Chữ được phép hiển thị trên slide:/gim, '**Chữ được phép hiển thị trên slide:**')
    .replace(/^Chữ được phép hiển thị trên slide:/gim, '**Chữ được phép hiển thị trên slide:**')
    .replace(/^Định hướng màu sắc và hình minh họa dựa trên nội dung bài học:/gim, '**Định hướng màu sắc và hình minh họa dựa trên nội dung bài học:**')
    .replace(/^Yêu cầu thiết kế:/gim, '**Yêu cầu thiết kế:**')
    .replace(/^Yêu cầu định dạng màu sắc và văn bản:/gim, '**Yêu cầu định dạng màu sắc và văn bản:**')
    .replace(/^Ràng buộc bắt buộc:/gim, '**Ràng buộc bắt buộc:**')
    .replace(/^Ràng buộc chất lượng:/gim, '**Ràng buộc bắt buộc:**')
    .trim();
}

function buildFallbackDesignPrompt(slide: GoogleSlidePromptItem) {
  const allowedText = slide.allowed_text?.length ? slide.allowed_text : slide.slide_text || [];
  const visualDirection = slide.visual_direction?.length ? slide.visual_direction : [
    'Màu sắc, hình minh họa và biểu tượng phải bám sát nội dung bài học, không dùng mẫu chung cố định.',
    slide.image_suggestions?.length ? `Hình minh họa phù hợp: ${slide.image_suggestions.join(', ')}.` : 'Chọn hình minh họa/sơ đồ trực tiếp liên quan đến nội dung slide.',
  ];
  const designRequirements = slide.design_requirements?.length ? slide.design_requirements : [
    'Thiết kế theo tỉ lệ 16:9, bố cục thoáng, một thông điệp chính.',
    'Ưu tiên thẻ nội dung, sơ đồ, biểu tượng hoặc hình ảnh minh họa phù hợp.',
  ];
  const colorTextRules = slide.color_text_rules?.length ? slide.color_text_rules : [
    'Bảng màu phải phù hợp với chủ đề bài học và loại slide.',
    'Tiêu đề lớn, màu đậm; nội dung chính tương phản tốt với nền.',
    'Không dùng quá 3 màu chủ đạo và không đặt chữ nhỏ ở cuối slide.',
  ];
  const qualityRules = slide.quality_rules?.length ? slide.quality_rules : [
    'Chỉ dùng đúng các dòng chữ trong mục “Chữ được phép hiển thị trên slide”.',
    'Toàn bộ chữ trên slide phải là tiếng Việt có dấu.',
    'Không thêm tiếng Anh, chữ giả, watermark, slogan hoặc kiến thức ngoài bài học.',
  ];
  return [
    `Tạo một trang trình bày cho Slide ${slide.slide_number} với tiêu đề “${slide.title}”.`,
    slide.learning_goal ? `Mục tiêu của slide: ${slide.learning_goal}.` : '',
    `**Chữ được phép hiển thị trên slide:**\n${allowedText.length ? allowedText.map((item) => `- ${item}`).join('\n') : '- [Nội dung ngắn gọn theo bài học]'}`,
    `**Định hướng màu sắc và hình minh họa dựa trên nội dung bài học:**\n${visualDirection.map((item) => `- ${item}`).join('\n')}`,
    `**Yêu cầu thiết kế:**\n${designRequirements.map((item) => `- ${item}`).join('\n')}`,
    `**Yêu cầu định dạng màu sắc và văn bản:**\n${colorTextRules.map((item) => `- ${item}`).join('\n')}`,
    `**Ràng buộc bắt buộc:**\n${qualityRules.map((item) => `- ${item}`).join('\n')}`,
  ].filter(Boolean).join('\n\n');
}

function formatSlidePrompt(slide: GoogleSlidePromptItem) {
  const promptBody = normalizePromptMarkdown(slide.design_prompt || buildFallbackDesignPrompt(slide));
  return [`## Slide ${slide.slide_number}. ${slide.title}`, '', promptBody].join('\n');
}

function formatFullPrompt(result: GoogleSlidesPromptResult) {
  return result.slides.map((slide) => formatSlidePrompt(slide)).join('\n\n---\n\n');
}

function buildDocxParagraphs(result: GoogleSlidesPromptResult): DocxParagraph[] {
  return result.slides.flatMap((slide, index) => {
    const paragraphs: DocxParagraph[] = [];
    if (index > 0) paragraphs.push({ text: '---', kind: 'muted' });
    paragraphs.push({ text: `## Slide ${slide.slide_number}. ${slide.title}`, kind: 'heading2' });
    paragraphs.push({ text: normalizePromptMarkdown(slide.design_prompt || buildFallbackDesignPrompt(slide)), kind: 'normal' });
    return paragraphs;
  });
}

function openUrl(url?: string) {
  if (!url) return;
  window.open(url, '_blank', 'noopener,noreferrer');
}

export default function GoogleSlidesPromptModal({ isOpen, content, aiConfig, subjectName, grade, user, lessonInfo, onClose, onOpenConfig }: GoogleSlidesPromptModalProps) {
  const [extraRequest, setExtraRequest] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSavingDrive, setIsSavingDrive] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [result, setResult] = useState<GoogleSlidesPromptResult | null>(null);
  const [savedPrompt, setSavedPrompt] = useState<GoogleSlidesPromptRecord | null>(null);
  const [history, setHistory] = useState<GoogleSlidesPromptRecord[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [driveMessage, setDriveMessage] = useState('');
  const [copiedKey, setCopiedKey] = useState('');
  const stats = useMemo(() => lessonStat(content), [content]);
  const baseFileName = cleanFileName(result?.title || content?.metadata?.tieu_de || lessonInfo?.tieu_de || 'prompt_google_slides');

  const loadHistory = async () => {
    if (!isOpen || !user?.token) return;
    setIsLoadingHistory(true);
    try {
      const payload: Record<string, unknown> = lessonInfo?.lesson_id ? { lesson_id: lessonInfo.lesson_id } : { mine_only: true };
      const res = await listGoogleSlidesPromptsApi(user.token, payload);
      if (res.ok && res.data) setHistory(res.data.items || []);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    setSavedPrompt(null);
    setDriveMessage('');
    void loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, user?.token, lessonInfo?.lesson_id]);

  useEffect(() => {
    if (!aiConfig.apiKey) return;
    setErrorMessage((current) => /chưa cấu hình API Key/i.test(current) ? '' : current);
  }, [aiConfig.apiKey]);

  const copyText = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(''), 1600);
    } catch {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      textArea.remove();
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(''), 1600);
    }
  };

  const handleGenerate = async () => {
    if (!content) {
      setErrorMessage('Chưa có nội dung bài học để tạo prompt trình chiếu.');
      return;
    }
    if (!aiConfig.apiKey) {
      setErrorMessage('Bạn chưa cấu hình API Key. Hãy cấu hình ngay tại cửa sổ này rồi tiếp tục tạo prompt trình chiếu.');
      onOpenConfig('manual');
      return;
    }
    setErrorMessage('');
    setDriveMessage('');
    setSavedPrompt(null);
    setIsGenerating(true);
    try {
      const generated = await generateGoogleSlidesPrompts(aiConfig.apiKey, aiConfig.model, content, subjectName, grade, extraRequest);
      setResult(generated);
    } catch (error) {
      const raw = String((error as any)?.message || error || 'Không thể tạo prompt trình chiếu.');
      const quotaError = /429|quota|resource_exhausted|rate|limit/i.test(raw);
      setErrorMessage(quotaError ? 'API Key hiện tại đã hết hạn mức sử dụng. Hãy cập nhật API Key khác rồi thử lại.' : raw);
      if (quotaError) onOpenConfig('quota');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveDrive = async () => {
    if (!result || !user?.token) return;
    setIsSavingDrive(true);
    setDriveMessage('');
    setErrorMessage('');
    try {
      const fullPrompt = formatFullPrompt(result);
      const res = await saveGoogleSlidesPromptApi(user.token, {
        lesson_id: lessonInfo?.lesson_id || '',
        tieu_de_bai_hoc: lessonInfo?.tieu_de || content?.metadata?.tieu_de || result.title,
        mon_id: lessonInfo?.mon_id || '',
        khoi: grade || lessonInfo?.khoi || content?.metadata?.khoi || '',
        lop_id: lessonInfo?.lop_id || '',
        nam_hoc: lessonInfo?.nam_hoc || '',
        hoc_ky: lessonInfo?.hoc_ky || '',
        result,
        full_prompt: fullPrompt,
        extra_request: extraRequest,
      });
      if (!res.ok || !res.data?.prompt) {
        setErrorMessage(res.message || 'Không thể lưu prompt lên Google Drive.');
        return;
      }
      setSavedPrompt(res.data.prompt);
      setDriveMessage('Đã lưu prompt dạng Markdown/JSON vào Google Drive và ghi lịch sử trong hệ thống.');
      setHistory((prev) => [res.data!.prompt, ...prev.filter((item) => item.prompt_id !== res.data!.prompt.prompt_id)].slice(0, 20));
    } catch (error) {
      setErrorMessage(String((error as any)?.message || error || 'Không thể lưu prompt lên Google Drive.'));
    } finally {
      setIsSavingDrive(false);
    }
  };

  const handleDownloadTxt = () => {
    if (!result) return;
    const blob = new Blob([formatFullPrompt(result)], { type: 'text/markdown;charset=utf-8' });
    downloadBlob(blob, `Prompt_GoogleSlides_${baseFileName}.md`);
  };

  const handleDownloadDocx = () => {
    if (!result) return;
    const blob = createDocxBlob(`Prompt Google Slides - ${result.title}`, buildDocxParagraphs(result));
    downloadBlob(blob, `Prompt_GoogleSlides_${baseFileName}.docx`);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[10030] flex items-center justify-center p-4 lg:p-8">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-950/45 backdrop-blur-sm" onClick={onClose} />
          <motion.div initial={{ opacity: 0, y: 24, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: 0.98 }} className="relative z-10 flex h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-[30px] bg-white shadow-[0_35px_90px_rgba(15,23,42,0.30)]">
            <div className="border-b border-white/10 bg-gradient-to-r from-amber-500 via-fuchsia-600 to-indigo-600 px-6 py-5 text-white lg:px-8">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold"><Presentation className="h-4 w-4" /> Google Slides Prompt Generator</p>
                  <h2 className="text-2xl font-black">Tạo và lưu prompt trình chiếu bằng AI</h2>
                  <p className="mt-2 max-w-3xl text-sm text-white/85">AI tự phân tích bài học, tự chọn màu sắc, hình minh họa và phong cách phù hợp với nội dung. Giáo viên có thể lưu file Markdown/JSON vào Google Drive để mở lại sau.</p>
                </div>
                <button onClick={onClose} className="rounded-full bg-white/15 p-2 hover:bg-white/25"><X className="h-5 w-5" /></button>
              </div>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[0.88fr_1.12fr]">
              <div className="overflow-y-auto border-r border-slate-100 bg-slate-50/80 p-6 lg:p-7">
                <div className="rounded-3xl border border-indigo-100 bg-white p-5 shadow-sm">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">Thông tin bài học</p>
                  <h3 className="mt-2 text-xl font-black text-slate-900">{content?.metadata?.tieu_de || content?.title || lessonInfo?.tieu_de || 'Chưa có bài học'}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{content?.metadata?.tom_tat || 'AI sẽ dựa vào cấu trúc bài học hiện tại để tạo bộ prompt trình chiếu.'}</p>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-2xl bg-indigo-50 px-4 py-3"><span className="text-slate-500">Môn học</span><p className="font-bold text-slate-900">{subjectName || content?.metadata?.mon_hoc || '-'}</p></div>
                    <div className="rounded-2xl bg-violet-50 px-4 py-3"><span className="text-slate-500">Khối</span><p className="font-bold text-slate-900">{grade || content?.metadata?.khoi || '-'}</p></div>
                    <div className="rounded-2xl bg-amber-50 px-4 py-3"><span className="text-slate-500">Nội dung</span><p className="font-bold text-slate-900">{stats.sectionCount} mục</p></div>
                    <div className="rounded-2xl bg-emerald-50 px-4 py-3"><span className="text-slate-500">Câu hỏi</span><p className="font-bold text-slate-900">{stats.interactiveCount + stats.finalQuizCount} câu</p></div>
                  </div>
                </div>

                <div className="mt-5 rounded-3xl border border-fuchsia-100 bg-white p-5 shadow-sm">
                  <label className="block text-sm font-bold text-slate-800">Yêu cầu thêm của giáo viên</label>
                  <p className="mt-1 text-xs leading-5 text-slate-500">Có thể để trống. AI vẫn tự chọn số slide và phong cách trình bày phù hợp với nội dung bài học.</p>
                  <textarea value={extraRequest} onChange={(event) => setExtraRequest(event.target.value)} rows={5} className="mt-3 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-fuchsia-400 focus:ring-2 focus:ring-fuchsia-100" placeholder="Ví dụ: Ưu tiên nhiều hình ảnh, có hoạt động nhóm, phù hợp học sinh lớp 6, ít chữ trên mỗi slide..." />
                  <button type="button" onClick={() => void handleGenerate()} disabled={isGenerating || !content} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-fuchsia-600 to-indigo-600 px-4 py-3 text-sm font-black text-white shadow-lg shadow-fuchsia-600/20 disabled:opacity-60">
                    {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    {isGenerating ? 'AI đang tạo bộ prompt...' : result ? 'Tạo lại prompt bằng AI' : 'AI tạo prompt trình chiếu'}
                  </button>
                  {!aiConfig.apiKey && !errorMessage ? (
                    <div className="mt-3 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-start gap-2">
                        <KeyRound className="mt-0.5 h-4 w-4 shrink-0" />
                        <span className="font-semibold">Cần Gemini API Key để tạo prompt. Bạn có thể cấu hình ngay mà không đóng cửa sổ Google Slides.</span>
                      </div>
                      <button type="button" onClick={() => onOpenConfig('manual')} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-xs font-black text-white hover:bg-amber-600">
                        <KeyRound className="h-4 w-4" /> Cấu hình API Key ngay
                      </button>
                    </div>
                  ) : null}
                  {errorMessage ? (
                    <div className="mt-3 flex flex-col gap-3 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 sm:flex-row sm:items-center sm:justify-between">
                      <span>{errorMessage}</span>
                      {/api key/i.test(errorMessage) ? (
                        <button type="button" onClick={() => onOpenConfig(/hết hạn|quota|429|resource_exhausted|rate|limit/i.test(errorMessage) ? 'quota' : 'manual')} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-xs font-black text-white hover:bg-rose-700">
                          <KeyRound className="h-4 w-4" /> {/hết hạn|quota|429|resource_exhausted|rate|limit/i.test(errorMessage) ? 'Đổi API Key ngay' : 'Cấu hình API Key ngay'}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                  {driveMessage && <p className="mt-3 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{driveMessage}</p>}
                </div>

                <div className="mt-5 rounded-3xl border border-amber-100 bg-amber-50 p-5 text-sm leading-6 text-amber-900">
                  <p className="font-black">Lưu trữ trên Google Drive</p>
                  <p className="mt-2">Khi bấm <span className="font-bold">Lưu Google Drive</span>, hệ thống tạo file Markdown để copy nhanh và file JSON để mở lại dữ liệu prompt. Cách lưu này không cần quyền Google Docs nên ổn định hơn.</p>
                  {!lessonInfo?.lesson_id && <p className="mt-2 rounded-2xl bg-white/70 px-3 py-2 text-xs font-semibold">Gợi ý: nên lưu bài học trước để prompt được liên kết theo lesson_id.</p>}
                </div>

                <div className="mt-5 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="inline-flex items-center gap-2 font-black text-slate-900"><History className="h-4 w-4" /> Prompt đã lưu</h4>
                    <button type="button" onClick={() => void loadHistory()} className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600">Làm mới</button>
                  </div>
                  <div className="mt-3 space-y-2">
                    {isLoadingHistory ? <p className="text-sm text-slate-500">Đang tải lịch sử...</p> : null}
                    {!isLoadingHistory && !history.length ? <p className="text-sm text-slate-500">Chưa có prompt đã lưu cho bài học này.</p> : null}
                    {history.slice(0, 5).map((item) => (
                      <div key={item.prompt_id} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm">
                        <p className="font-bold text-slate-800">{item.tieu_de_bai_hoc || item.prompt_id}</p>
                        <p className="mt-1 text-xs text-slate-500">{item.created_at || '-'} • {item.so_slide_de_xuat || '-'} slide</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {item.doc_url && <button type="button" onClick={() => openUrl(item.doc_url)} className="inline-flex items-center gap-1 rounded-xl bg-white px-2.5 py-1.5 text-xs font-bold text-indigo-700"><ExternalLink className="h-3.5 w-3.5" /> Google Doc</button>}
                          {item.txt_url && <button type="button" onClick={() => openUrl(item.txt_url)} className="inline-flex items-center gap-1 rounded-xl bg-white px-2.5 py-1.5 text-xs font-bold text-emerald-700"><ExternalLink className="h-3.5 w-3.5" /> Markdown</button>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex min-h-0 flex-col bg-white">
                <div className="border-b border-slate-100 p-5">
                  <div className="flex flex-wrap items-center gap-3">
                    <button type="button" onClick={() => result && void copyText(formatFullPrompt(result), 'all')} disabled={!result} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 disabled:opacity-50"><Clipboard className="h-4 w-4" /> {copiedKey === 'all' ? 'Đã sao chép' : 'Sao chép toàn bộ'}</button>
                    <button type="button" onClick={handleSaveDrive} disabled={!result || isSavingDrive} className="inline-flex items-center gap-2 rounded-2xl bg-sky-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-sky-600/20 disabled:opacity-50">{isSavingDrive ? <Loader2 className="h-4 w-4 animate-spin" /> : <Cloud className="h-4 w-4" />} {isSavingDrive ? 'Đang lưu...' : 'Lưu Google Drive'}</button>
                    <button type="button" onClick={handleDownloadDocx} disabled={!result} className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-600/20 disabled:opacity-50"><FileText className="h-4 w-4" /> Tải .docx</button>
                    <button type="button" onClick={handleDownloadTxt} disabled={!result} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-600/20 disabled:opacity-50"><Download className="h-4 w-4" /> Tải .md</button>
                  </div>
                  {savedPrompt ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl bg-sky-50 px-4 py-3 text-sm text-sky-800">
                      <span className="font-bold">Đã lưu:</span>
                      {savedPrompt.doc_url && <button type="button" onClick={() => openUrl(savedPrompt.doc_url)} className="inline-flex items-center gap-1 rounded-xl bg-white px-3 py-1.5 font-bold text-sky-700"><ExternalLink className="h-4 w-4" /> Mở Google Doc</button>}
                      {savedPrompt.txt_url && <button type="button" onClick={() => openUrl(savedPrompt.txt_url)} className="inline-flex items-center gap-1 rounded-xl bg-white px-3 py-1.5 font-bold text-emerald-700"><ExternalLink className="h-4 w-4" /> Mở Markdown</button>}
                    </div>
                  ) : null}
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-6">
                  {!result ? (
                    <div className="flex min-h-[420px] flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-8 text-center">
                      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-fuchsia-100 text-fuchsia-600"><Presentation className="h-9 w-9" /></div>
                      <h3 className="mt-5 text-xl font-black text-slate-900">Chưa tạo prompt trình chiếu</h3>
                      <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">Nhấn “AI tạo prompt trình chiếu”. AI sẽ tự chọn số slide và phong cách phù hợp, sau đó tạo prompt riêng cho từng slide theo định dạng Markdown để dán trực tiếp vào Google Slides.</p>
                    </div>
                  ) : (
                    <div className="space-y-5">
                      <div className="rounded-3xl border border-indigo-100 bg-indigo-50/70 p-5">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div>
                            <p className="text-xs font-black uppercase tracking-[0.18em] text-indigo-600">Phân tích của AI</p>
                            <h3 className="mt-2 text-2xl font-black text-slate-900">{result.title}</h3>
                            <p className="mt-2 text-sm leading-6 text-slate-700">{result.rationale}</p>
                          </div>
                          <div className="rounded-2xl bg-white px-4 py-3 text-center text-sm shadow-sm">
                            <span className="text-slate-500">Số slide</span>
                            <p className="text-2xl font-black text-indigo-700">{result.suggested_slide_count}</p>
                          </div>
                        </div>
                        <div className="mt-4 rounded-2xl bg-white px-4 py-3 text-sm leading-6 text-slate-700"><span className="font-black text-slate-900">Phong cách đề xuất: </span>{result.suggested_style}</div>
                      </div>

                      <div className="space-y-4">
                        {result.slides.map((slide) => (
                          <div key={`${slide.slide_number}-${slide.title}`} className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="text-xs font-black uppercase tracking-[0.16em] text-fuchsia-600">Slide {slide.slide_number} • {slide.slide_type || 'content'}</p>
                                <h4 className="mt-1 text-lg font-black text-slate-900">{slide.title}</h4>
                              </div>
                              <button type="button" onClick={() => void copyText(formatSlidePrompt(slide), `slide-${slide.slide_number}`)} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"><Clipboard className="h-4 w-4" /> {copiedKey === `slide-${slide.slide_number}` ? 'Đã sao chép' : 'Sao chép slide này'}</button>
                            </div>
                            {slide.learning_goal && <p className="mt-3 text-sm leading-6 text-slate-600"><span className="font-bold text-slate-900">Mục tiêu: </span>{slide.learning_goal}</p>}
                            {slide.key_content?.length ? <div className="mt-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700"><span className="font-bold text-slate-900">Ý chính: </span>{slide.key_content.join(' • ')}</div> : null}
                            {slide.slide_text?.length ? (
                              <div className="mt-3 rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-950">
                                <p className="font-black text-sky-800">Chữ được phép hiển thị trên slide</p>
                                <ul className="mt-2 list-disc space-y-1 pl-5">{slide.slide_text.map((item, index) => <li key={`${slide.slide_number}-text-${index}`}>{item}</li>)}</ul>
                              </div>
                            ) : null}
                            {slide.lesson_content ? (
                              <div className="mt-3 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-950">
                                <p className="font-black text-emerald-800">Nội dung bài học đưa vào slide</p>
                                <p className="mt-2 whitespace-pre-wrap">{slide.lesson_content}</p>
                              </div>
                            ) : null}
                            <div className="mt-3 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4">
                              <p className="text-xs font-black uppercase tracking-[0.14em] text-indigo-600">Prompt hoàn chỉnh</p>
                              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{slide.design_prompt}</p>
                            </div>
                            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                              {slide.image_suggestions?.length ? <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900"><span className="font-black">Hình ảnh: </span>{slide.image_suggestions.join(', ')}</div> : null}
                              {slide.teacher_script ? <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-900"><span className="font-black">Lời dẫn GV: </span>{slide.teacher_script}</div> : null}
                              {slide.student_activity ? <div className="rounded-2xl bg-fuchsia-50 px-4 py-3 text-sm leading-6 text-fuchsia-900"><span className="font-black">Hoạt động HS: </span>{slide.student_activity}</div> : null}
                              {slide.quick_question ? <div className="rounded-2xl bg-cyan-50 px-4 py-3 text-sm leading-6 text-cyan-900"><span className="font-black">Câu hỏi nhanh: </span>{slide.quick_question}</div> : null}
                            </div>
                          </div>
                        ))}
                      </div>

                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
