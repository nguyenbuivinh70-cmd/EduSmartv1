import { useMemo, useState, type ReactNode } from 'react';
import { BookOpen, ChevronDown, FileQuestion, Layers3, ListChecks, Plus, Trash2, Youtube } from 'lucide-react';
import type {
  LessonActivityType,
  LessonActivityV3,
  LessonContent,
  LessonContentBlock,
  LessonPageLayout,
  LessonPresentationPage,
  LessonSectionV2,
  QuizQuestion,
  QuizQuestionType,
} from '../types';
import YoutubeEmbedBlock, { getYoutubeEmbedUrl } from './YoutubeEmbedBlock';

interface LessonActivityManualEditorProps {
  content: LessonContent;
  onChange: (content: LessonContent) => void;
}

const fieldClass = 'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100';
const smallButtonClass = 'inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition';

function text(value: unknown) { return String(value ?? ''); }
function splitLines(value?: string) { return text(value).split(/\n+/).map((item) => item.trim()).filter(Boolean); }
function joinLines(value?: string[]) { return (value || []).join('\n'); }

function createEmptyBlock(type: LessonContentBlock['type'] = 'paragraph'): LessonContentBlock {
  return { type, title: '', category: '', theme: '', text: '' };
}

function createEmptyQuestion(type: QuizQuestionType = 'single_choice', index = 1): QuizQuestion {
  if (type === 'true_false') return { id: `Q_${Date.now()}_${index}`, type, question: '', options: ['Đúng', 'Sai'], correctAnswer: 'Đúng', explanation: '', level: 'nhan_biet', source: 'manual' };
  if (type === 'fill_in_blank' || type === 'short_answer') return {
    id: `Q_${Date.now()}_${index}`, type: 'fill_in_blank', question: 'Điền từ/cụm từ thích hợp vào chỗ trống.', sentence: '_____ là khái niệm trọng tâm cần ghi nhớ.',
    choices: ['dữ liệu', 'thông tin', 'vật mang tin', 'xử lí thông tin'], correctAnswers: ['dữ liệu'], explanation: '', level: 'thong_hieu', source: 'manual',
  };
  return { id: `Q_${Date.now()}_${index}`, type: 'single_choice', question: '', options: ['A. ', 'B. ', 'C. ', 'D. '], correctAnswer: 'A. ', explanation: '', level: 'nhan_biet', source: 'manual' };
}

function normalizeQuestionForType(question: QuizQuestion, nextType: QuizQuestionType): QuizQuestion {
  const base = { ...question, type: nextType };
  if (nextType === 'true_false') return { ...base, options: ['Đúng', 'Sai'], choices: undefined, correctAnswers: undefined, sentence: '', correctAnswer: ['Đúng', 'Sai'].includes(text(base.correctAnswer)) ? base.correctAnswer : 'Đúng' };
  if (nextType === 'fill_in_blank' || nextType === 'short_answer') {
    const firstChoice = question.correctAnswers?.[0] || question.choices?.[0] || 'dữ liệu';
    const choices = [firstChoice, ...(question.choices || []), 'thông tin', 'vật mang tin', 'xử lí thông tin'].filter((item, idx, arr) => item && arr.indexOf(item) === idx).slice(0, 4);
    while (choices.length < 4) choices.push(`Lựa chọn ${choices.length + 1}`);
    return { ...base, type: 'fill_in_blank', question: question.question || 'Điền từ/cụm từ thích hợp vào chỗ trống.', sentence: question.sentence || '_____ là khái niệm trọng tâm cần ghi nhớ.', options: undefined, choices, correctAnswer: undefined, correctAnswers: [firstChoice], suggestedAnswer: undefined, rubric: undefined };
  }
  return { ...base, type: 'single_choice', choices: undefined, correctAnswers: undefined, sentence: '', options: base.options?.length ? base.options : ['A. ', 'B. ', 'C. ', 'D. '], correctAnswer: base.correctAnswer || base.options?.[0] || 'A. ' };
}

function createEmptyPage(activityIndex: number, pageIndex: number): LessonPresentationPage {
  return {
    page_id: `A${activityIndex}_P${Date.now()}_${pageIndex}`,
    title: `Trang ${pageIndex}`,
    subtitle: '',
    layout: 'hero_concept',
    blocks: [createEmptyBlock('paragraph')],
    teacher_notes: '',
    student_prompt: '',
    visual_hint: '',
    illustration_keywords: [],
    visual: { type: 'none', title: '', items: [], center_label: '', relationship: '' },
  };
}

function createEmptyActivity(index: number): LessonActivityV3 {
  return {
    activity_id: `A${Date.now()}_${index}`,
    title: `Hoạt động ${index}: Nội dung mới`,
    objective: '',
    activity_type: index === 1 ? 'warmup' : 'knowledge',
    estimated_minutes: index === 1 ? 5 : 8,
    pages: [createEmptyPage(index, 1)],
    interactions: [createEmptyQuestion('single_choice', 1)],
    summary: '',
  };
}

function activityToSection(activity: LessonActivityV3, index: number): LessonSectionV2 {
  const pages = activity.pages || [];
  const blocks = pages.flatMap((page) => page.blocks || []);
  return {
    section_id: activity.activity_id || `A${index + 1}`,
    title: activity.title || `Hoạt động ${index + 1}`,
    content: blocks.map((block) => text(block.text).trim()).filter(Boolean).join('\n\n'),
    content_blocks: blocks,
    summary: activity.summary || activity.objective || '',
    source_note: activity.summary || activity.objective || '',
    examples: [],
    interactive_questions: activity.interactions || [],
    pages,
    activity_type: activity.activity_type,
    objective: activity.objective,
    estimated_minutes: activity.estimated_minutes,
  };
}

function EditorCard({ title, icon, children, defaultOpen = false }: { title: string; icon: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <button type="button" onClick={() => setOpen((prev) => !prev)} className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-slate-50">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">{icon}</span>
        <span className="font-black text-slate-900">{title}</span>
        <ChevronDown className={`ml-auto h-5 w-5 text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open ? <div className="border-t border-slate-100 p-5">{children}</div> : null}
    </div>
  );
}

function QuestionEditor({ question, index, onChange, onDelete }: { question: QuizQuestion; index: number; onChange: (question: QuizQuestion) => void; onDelete: () => void }) {
  const qType = question.type === 'short_answer' ? 'fill_in_blank' : (question.type || 'single_choice');
  const optionsText = useMemo(() => joinLines(question.options || []), [question.options]);
  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-black text-indigo-700">Câu {index + 1}</span>
        <select value={qType} onChange={(e) => onChange(normalizeQuestionForType(question, e.target.value as QuizQuestionType))} className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold outline-none">
          <option value="single_choice">Chọn đáp án đúng nhất</option><option value="true_false">Đúng / Sai</option><option value="fill_in_blank">Điền từ/cụm từ</option>
        </select>
        <button type="button" onClick={onDelete} className={`${smallButtonClass} ml-auto bg-rose-50 text-rose-700 hover:bg-rose-100`}><Trash2 className="h-3.5 w-3.5" /> Xóa</button>
      </div>
      <div className="grid gap-3">
        <label className="space-y-1.5"><span className="text-xs font-bold text-slate-600">Nội dung câu hỏi</span><textarea value={question.question || ''} onChange={(e) => onChange({ ...question, question: e.target.value })} rows={2} className={fieldClass} /></label>
        {qType === 'single_choice' ? <>
          <label className="space-y-1.5"><span className="text-xs font-bold text-slate-600">Các đáp án, mỗi dòng một đáp án</span><textarea value={optionsText} onChange={(e) => onChange({ ...question, options: splitLines(e.target.value) })} rows={4} className={fieldClass} /></label>
          <label className="space-y-1.5"><span className="text-xs font-bold text-slate-600">Đáp án đúng</span><input value={text(question.correctAnswer)} onChange={(e) => onChange({ ...question, correctAnswer: e.target.value })} className={fieldClass} /></label>
        </> : null}
        {qType === 'true_false' ? <label className="space-y-1.5"><span className="text-xs font-bold text-slate-600">Đáp án đúng</span><select value={text(question.correctAnswer) || 'Đúng'} onChange={(e) => onChange({ ...question, correctAnswer: e.target.value, options: ['Đúng', 'Sai'] })} className={fieldClass}><option value="Đúng">Đúng</option><option value="Sai">Sai</option></select></label> : null}
        {qType === 'fill_in_blank' ? <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1.5 md:col-span-2"><span className="text-xs font-bold text-slate-600">Câu có chỗ trống, dùng _____</span><textarea value={question.sentence || question.question || ''} onChange={(e) => onChange({ ...question, type: 'fill_in_blank', sentence: e.target.value, question: e.target.value })} rows={2} className={fieldClass} /></label>
          <label className="space-y-1.5"><span className="text-xs font-bold text-slate-600">4 lựa chọn, mỗi dòng một lựa chọn</span><textarea value={joinLines((question.choices || question.options || []).slice(0, 4))} onChange={(e) => onChange({ ...question, type: 'fill_in_blank', choices: splitLines(e.target.value).slice(0, 4), options: undefined })} rows={4} className={fieldClass} /></label>
          <label className="space-y-1.5"><span className="text-xs font-bold text-slate-600">Từ/cụm từ đúng</span><input value={(question.correctAnswers || [])[0] || ''} onChange={(e) => onChange({ ...question, type: 'fill_in_blank', correctAnswers: [e.target.value] })} className={fieldClass} /></label>
        </div> : null}
        <label className="space-y-1.5"><span className="text-xs font-bold text-slate-600">Giải thích sau khi trả lời</span><textarea value={question.explanation || ''} onChange={(e) => onChange({ ...question, explanation: e.target.value })} rows={2} className={fieldClass} /></label>
      </div>
    </div>
  );
}

const ACTIVITY_TYPES: Array<{ value: LessonActivityType; label: string }> = [
  { value: 'warmup', label: 'Khởi động' }, { value: 'knowledge', label: 'Hình thành kiến thức' }, { value: 'practice', label: 'Luyện tập' },
  { value: 'application', label: 'Vận dụng' }, { value: 'discussion', label: 'Thảo luận' }, { value: 'custom', label: 'Khác' },
];
const PAGE_LAYOUTS: Array<{ value: LessonPageLayout; label: string }> = [
  { value: 'hero_concept', label: 'Khái niệm trọng tâm' }, { value: 'story_visual', label: 'Tình huống + minh hoạ' },
  { value: 'visual_explain', label: 'Minh hoạ + giải thích' }, { value: 'comparison', label: 'So sánh' },
  { value: 'process', label: 'Quy trình / các bước' }, { value: 'card_grid', label: 'Lưới thẻ nội dung' },
  { value: 'remember', label: 'Ghi nhớ' }, { value: 'task', label: 'Nhiệm vụ' },
];
const VISUAL_TYPES = [
  { value: 'none', label: 'Không minh hoạ' }, { value: 'icon_cards', label: 'Các thẻ biểu tượng' }, { value: 'hub_spoke', label: 'Sơ đồ trung tâm - nhánh' },
  { value: 'process', label: 'Quy trình' }, { value: 'comparison', label: 'So sánh' }, { value: 'timeline', label: 'Dòng thời gian' },
  { value: 'device_diagram', label: 'Sơ đồ thiết bị' }, { value: 'concept_map', label: 'Sơ đồ khái niệm' }, { value: 'numbered_steps', label: 'Các bước đánh số' },
];

export default function LessonActivityManualEditor({ content, onChange }: LessonActivityManualEditorProps) {
  const activities = content.activities || [];
  const finalQuiz = content.final_quiz || [];

  const updateContent = (patch: Partial<LessonContent>) => onChange({ ...content, ...patch });
  const syncActivities = (nextActivities: LessonActivityV3[]) => updateContent({
    schema_version: 'lesson_v3',
    activities: nextActivities,
    sections: nextActivities.map(activityToSection),
  });
  const updateActivity = (index: number, activity: LessonActivityV3) => syncActivities(activities.map((item, idx) => idx === index ? activity : item));
  const deleteActivity = (index: number) => syncActivities(activities.filter((_, idx) => idx !== index));
  const moveActivity = (index: number, dir: -1 | 1) => {
    const next = [...activities]; const target = index + dir; if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]]; syncActivities(next);
  };
  const updateFinalQuestion = (index: number, question: QuizQuestion) => updateContent({ final_quiz: finalQuiz.map((item, idx) => idx === index ? question : item) });

  return <div className="space-y-4">
    <div id="lesson-editor-general"><EditorCard title="Thông tin chung của bài học" icon={<BookOpen className="h-5 w-5" />} defaultOpen>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1.5 md:col-span-2"><span className="text-xs font-bold text-slate-600">Tiêu đề hiển thị</span><input value={content.metadata?.tieu_de || content.title || ''} onChange={(e) => updateContent({ metadata: { ...content.metadata, tieu_de: e.target.value }, title: e.target.value })} className={fieldClass} /></label>
        <label className="space-y-1.5 md:col-span-2"><span className="text-xs font-bold text-slate-600">Tóm tắt bài học</span><textarea value={content.metadata?.tom_tat || ''} onChange={(e) => updateContent({ metadata: { ...content.metadata, tom_tat: e.target.value } })} rows={3} className={fieldClass} /></label>
        <label className="space-y-1.5 md:col-span-2"><span className="text-xs font-bold text-slate-600">Từ khóa, cách nhau bằng dấu phẩy</span><input value={(content.metadata?.tu_khoa || []).join(', ')} onChange={(e) => updateContent({ metadata: { ...content.metadata, tu_khoa: e.target.value.split(',').map((item) => item.trim()).filter(Boolean) } })} className={fieldClass} /></label>
        <label className="space-y-1.5 md:col-span-2"><span className="flex items-center gap-2 text-xs font-bold text-slate-600"><Youtube className="h-4 w-4 text-red-600" /> Video chuẩn bị trước bài từ YouTube</span><input value={content.intro_video_url || ''} onChange={(e) => updateContent({ intro_video_url: e.target.value, intro_video_embed_url: getYoutubeEmbedUrl(e.target.value) })} className={fieldClass} placeholder="https://www.youtube.com/watch?v=..." /></label>
        {getYoutubeEmbedUrl(content.intro_video_url) ? <div className="md:col-span-2"><YoutubeEmbedBlock url={content.intro_video_url} title="Xem trước video chuẩn bị" /></div> : null}
      </div>
    </EditorCard></div>

    <div id="lesson-editor-sections"><EditorCard title={`Hoạt động dạy học (${activities.length})`} icon={<Layers3 className="h-5 w-5" />} defaultOpen>
      <div className="mb-4 flex justify-end"><button type="button" onClick={() => syncActivities([...activities, createEmptyActivity(activities.length + 1)])} className={`${smallButtonClass} bg-indigo-600 text-white hover:bg-indigo-700`}><Plus className="h-4 w-4" /> Thêm hoạt động</button></div>
      <div className="space-y-5">
        {activities.map((activity, activityIndex) => {
          const pages = activity.pages || [];
          const interactions = activity.interactions || [];
          return <div id={`lesson-editor-activity-${activityIndex}`} key={activity.activity_id || activityIndex} className="rounded-[28px] border border-violet-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-black text-violet-700">Hoạt động {activityIndex + 1}</span>
              <button type="button" onClick={() => moveActivity(activityIndex, -1)} disabled={activityIndex === 0} className={`${smallButtonClass} bg-slate-100 text-slate-600 disabled:opacity-40`}>Lên</button>
              <button type="button" onClick={() => moveActivity(activityIndex, 1)} disabled={activityIndex === activities.length - 1} className={`${smallButtonClass} bg-slate-100 text-slate-600 disabled:opacity-40`}>Xuống</button>
              <button type="button" onClick={() => deleteActivity(activityIndex)} className={`${smallButtonClass} ml-auto bg-rose-50 text-rose-700 hover:bg-rose-100`}><Trash2 className="h-3.5 w-3.5" /> Xóa hoạt động</button>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1.5 md:col-span-2"><span className="text-xs font-bold text-slate-600">Tên hoạt động</span><input value={activity.title || ''} onChange={(e) => updateActivity(activityIndex, { ...activity, title: e.target.value })} className={fieldClass} /></label>
              <label className="space-y-1.5 md:col-span-2"><span className="text-xs font-bold text-slate-600">Mục tiêu</span><textarea value={activity.objective || ''} onChange={(e) => updateActivity(activityIndex, { ...activity, objective: e.target.value })} rows={2} className={fieldClass} /></label>
              <label className="space-y-1.5"><span className="text-xs font-bold text-slate-600">Loại hoạt động</span><select value={activity.activity_type || 'knowledge'} onChange={(e) => updateActivity(activityIndex, { ...activity, activity_type: e.target.value as LessonActivityType })} className={fieldClass}>{ACTIVITY_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
              <label className="space-y-1.5"><span className="text-xs font-bold text-slate-600">Thời lượng gợi ý (phút)</span><input type="number" min={1} max={90} value={activity.estimated_minutes || 8} onChange={(e) => updateActivity(activityIndex, { ...activity, estimated_minutes: Math.max(1, Number(e.target.value || 1)) })} className={fieldClass} /></label>
              <label className="space-y-1.5 md:col-span-2"><span className="text-xs font-bold text-slate-600">Ghi nhớ / kết luận hoạt động</span><textarea value={activity.summary || ''} onChange={(e) => updateActivity(activityIndex, { ...activity, summary: e.target.value })} rows={2} className={fieldClass} /></label>
            </div>

            <div className="mt-5 rounded-3xl bg-slate-50 p-4 ring-1 ring-slate-100">
              <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-black text-slate-900">Các trang trình bày</p><p className="mt-1 text-xs text-slate-500">Mỗi trang là một khung trình chiếu; nội dung ngắn gọn, dễ dùng với máy chiếu và thiết bị học sinh.</p></div><button type="button" onClick={() => updateActivity(activityIndex, { ...activity, pages: [...pages, createEmptyPage(activityIndex + 1, pages.length + 1)] })} className={`${smallButtonClass} bg-violet-600 text-white hover:bg-violet-700`}><Plus className="h-4 w-4" /> Thêm trang</button></div>
              <div className="mt-4 space-y-4">
                {pages.map((page, pageIndex) => {
                  const blocks = page.blocks?.length ? page.blocks : [createEmptyBlock('paragraph')];
                  const updatePage = (nextPage: LessonPresentationPage) => updateActivity(activityIndex, { ...activity, pages: pages.map((item, idx) => idx === pageIndex ? nextPage : item) });
                  const movePage = (dir: -1 | 1) => { const next = [...pages]; const target = pageIndex + dir; if (target < 0 || target >= next.length) return; [next[pageIndex], next[target]] = [next[target], next[pageIndex]]; updateActivity(activityIndex, { ...activity, pages: next }); };
                  return <div key={page.page_id || pageIndex} className="rounded-3xl border border-slate-200 bg-white p-4">
                    <div className="mb-3 flex flex-wrap items-center gap-2"><span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-black text-indigo-700">Trang {pageIndex + 1}</span><button type="button" onClick={() => movePage(-1)} disabled={pageIndex === 0} className={`${smallButtonClass} bg-slate-100 text-slate-600 disabled:opacity-40`}>Lên</button><button type="button" onClick={() => movePage(1)} disabled={pageIndex === pages.length - 1} className={`${smallButtonClass} bg-slate-100 text-slate-600 disabled:opacity-40`}>Xuống</button><button type="button" onClick={() => updateActivity(activityIndex, { ...activity, pages: pages.filter((_, idx) => idx !== pageIndex) })} className={`${smallButtonClass} ml-auto bg-rose-50 text-rose-700 hover:bg-rose-100`}><Trash2 className="h-3.5 w-3.5" /> Xóa trang</button></div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="space-y-1.5"><span className="text-xs font-bold text-slate-600">Tiêu đề trang</span><input value={page.title || ''} onChange={(e) => updatePage({ ...page, title: e.target.value })} className={fieldClass} /></label>
                      <label className="space-y-1.5"><span className="text-xs font-bold text-slate-600">Kiểu trình bày</span><select value={page.layout || 'title_content'} onChange={(e) => updatePage({ ...page, layout: e.target.value as LessonPageLayout })} className={fieldClass}>{PAGE_LAYOUTS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
                      <label className="space-y-1.5 md:col-span-2"><span className="text-xs font-bold text-slate-600">Dòng phụ</span><input value={page.subtitle || ''} onChange={(e) => updatePage({ ...page, subtitle: e.target.value })} className={fieldClass} /></label>
                    </div>
                    <div className="mt-4 space-y-3">
                      <div className="flex items-center justify-between gap-2"><span className="text-xs font-bold text-slate-600">Khối nội dung trên trang</span><button type="button" onClick={() => updatePage({ ...page, blocks: [...blocks, createEmptyBlock('paragraph')] })} className={`${smallButtonClass} bg-slate-100 text-slate-700 hover:bg-slate-200`}><Plus className="h-3.5 w-3.5" /> Thêm khối</button></div>
                      {blocks.map((block, blockIndex) => <div key={blockIndex} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                        <div className="mb-2 grid gap-2 md:grid-cols-[1fr_1fr_1fr_auto]">
                          <select value={block.type || 'paragraph'} onChange={(e) => updatePage({ ...page, blocks: blocks.map((item, idx) => idx === blockIndex ? { ...item, type: e.target.value as LessonContentBlock['type'] } : item) })} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold"><option value="paragraph">Kiến thức</option><option value="key_point">Ý chính</option><option value="example">Ví dụ</option><option value="note">Ghi nhớ</option><option value="activity">Hoạt động</option></select>
                          <input value={block.title || ''} onChange={(e) => updatePage({ ...page, blocks: blocks.map((item, idx) => idx === blockIndex ? { ...item, title: e.target.value } : item) })} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold outline-none" placeholder="Tiêu đề khối" />
                          <select value={block.theme || ''} onChange={(e) => updatePage({ ...page, blocks: blocks.map((item, idx) => idx === blockIndex ? { ...item, theme: e.target.value } : item) })} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold"><option value="">Màu tự động</option><option value="blue">Xanh dương</option><option value="violet">Tím</option><option value="amber">Vàng</option><option value="emerald">Xanh lá</option><option value="rose">Hồng</option><option value="cyan">Xanh ngọc</option><option value="orange">Cam</option></select>
                          <button type="button" onClick={() => updatePage({ ...page, blocks: blocks.filter((_, idx) => idx !== blockIndex) })} className={`${smallButtonClass} bg-rose-50 text-rose-700`}><Trash2 className="h-3.5 w-3.5" /> Xóa</button>
                        </div>
                        <input value={block.category || ''} onChange={(e) => updatePage({ ...page, blocks: blocks.map((item, idx) => idx === blockIndex ? { ...item, category: e.target.value } : item) })} className="mb-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold outline-none" placeholder="Nhóm: khai_niem, vi_du, ghi_nho..." />
                        <textarea value={block.text || ''} onChange={(e) => updatePage({ ...page, blocks: blocks.map((item, idx) => idx === blockIndex ? { ...item, text: e.target.value } : item) })} rows={3} className={fieldClass} placeholder="Nội dung ngắn gọn cho trang trình bày" />
                      </div>)}
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <label className="space-y-1.5"><span className="text-xs font-bold text-slate-600">Gợi ý cho giáo viên</span><textarea value={page.teacher_notes || ''} onChange={(e) => updatePage({ ...page, teacher_notes: e.target.value })} rows={2} className={fieldClass} /></label>
                      <label className="space-y-1.5"><span className="text-xs font-bold text-slate-600">Nhiệm vụ học sinh</span><textarea value={page.student_prompt || ''} onChange={(e) => updatePage({ ...page, student_prompt: e.target.value })} rows={2} className={fieldClass} /></label>
                    </div>
                    <div className="mt-3 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-3">
                      <p className="mb-3 text-xs font-black uppercase tracking-[0.14em] text-indigo-700">Minh hoạ trực quan</p>
                      <div className="grid gap-3 md:grid-cols-2">
                        <label className="space-y-1.5"><span className="text-xs font-bold text-slate-600">Kiểu minh hoạ</span><select value={page.visual?.type || 'none'} onChange={(e) => updatePage({ ...page, visual: { ...(page.visual || { type: 'none' }), type: e.target.value as any } })} className={fieldClass}>{VISUAL_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
                        <label className="space-y-1.5"><span className="text-xs font-bold text-slate-600">Tiêu đề minh hoạ</span><input value={page.visual?.title || ''} onChange={(e) => updatePage({ ...page, visual: { ...(page.visual || { type: 'none' }), title: e.target.value } })} className={fieldClass} placeholder="Ví dụ: Vai trò của trưởng nhóm" /></label>
                        <label className="space-y-1.5"><span className="text-xs font-bold text-slate-600">Nhãn trung tâm</span><input value={page.visual?.center_label || ''} onChange={(e) => updatePage({ ...page, visual: { ...(page.visual || { type: 'none' }), center_label: e.target.value } })} className={fieldClass} placeholder="Trưởng nhóm" /></label>
                        <label className="space-y-1.5"><span className="text-xs font-bold text-slate-600">Mối quan hệ / chú thích</span><input value={page.visual?.relationship || ''} onChange={(e) => updatePage({ ...page, visual: { ...(page.visual || { type: 'none' }), relationship: e.target.value } })} className={fieldClass} placeholder="Các nhiệm vụ phối hợp để đạt mục tiêu" /></label>
                        <label className="space-y-1.5 md:col-span-2"><span className="text-xs font-bold text-slate-600">Các mục minh hoạ, mỗi dòng một ý</span><textarea value={(page.visual?.items || []).join('\n')} onChange={(e) => updatePage({ ...page, visual: { ...(page.visual || { type: 'none' }), items: e.target.value.split(/\n+/).map((item) => item.trim()).filter(Boolean).slice(0, 5) } })} rows={4} className={fieldClass} placeholder={'Phân công nhiệm vụ\nTheo dõi tiến độ\nKết nối thành viên'} /></label>
                      </div>
                    </div>
                  </div>;
                })}
                {!pages.length ? <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">Hoạt động chưa có trang trình bày.</div> : null}
              </div>
            </div>

            <div className="mt-5 space-y-3">
              <div className="flex items-center justify-between gap-2"><span className="text-xs font-bold text-slate-600">Tương tác của hoạt động</span><button type="button" onClick={() => updateActivity(activityIndex, { ...activity, interactions: [...interactions, createEmptyQuestion('single_choice', interactions.length + 1)] })} className={`${smallButtonClass} bg-indigo-50 text-indigo-700 hover:bg-indigo-100`}><Plus className="h-3.5 w-3.5" /> Thêm tương tác</button></div>
              {interactions.map((question, qIndex) => <QuestionEditor key={question.id || qIndex} question={question} index={qIndex} onChange={(next) => updateActivity(activityIndex, { ...activity, interactions: interactions.map((item, idx) => idx === qIndex ? next : item) })} onDelete={() => updateActivity(activityIndex, { ...activity, interactions: interactions.filter((_, idx) => idx !== qIndex) })} />)}
            </div>
          </div>;
        })}
        {!activities.length ? <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">Chưa có hoạt động. Bấm “Thêm hoạt động” hoặc dùng AI để tạo lại bài học.</div> : null}
      </div>
    </EditorCard></div>

    <div id="lesson-editor-final-quiz"><EditorCard title={`Kiểm tra cuối bài (${finalQuiz.length} câu)`} icon={<ListChecks className="h-5 w-5" />}>
      <div className="mb-4 flex justify-end"><button type="button" onClick={() => updateContent({ final_quiz: [...finalQuiz, createEmptyQuestion('single_choice', finalQuiz.length + 1)] })} className={`${smallButtonClass} bg-emerald-600 text-white hover:bg-emerald-700`}><Plus className="h-4 w-4" /> Thêm câu cuối bài</button></div>
      <div className="space-y-3">{finalQuiz.map((question, index) => <QuestionEditor key={question.id || index} question={question} index={index} onChange={(next) => updateFinalQuestion(index, next)} onDelete={() => updateContent({ final_quiz: finalQuiz.filter((_, idx) => idx !== index) })} />)}</div>
    </EditorCard></div>

    <div id="lesson-editor-assessment"><EditorCard title="Cấu hình đánh giá" icon={<FileQuestion className="h-5 w-5" />}>
      <div className="grid gap-4 md:grid-cols-3">
        <label className="space-y-1.5"><span className="text-xs font-bold text-slate-600">Điểm đạt</span><input type="number" min={0} max={10} value={content.assessment?.pass_score ?? content.settings?.pass_score ?? 5} onChange={(e) => updateContent({ assessment: { interactive_weight: content.assessment?.interactive_weight || 40, final_quiz_weight: content.assessment?.final_quiz_weight || 60, score_scale: 10, pass_score: Number(e.target.value || 5) }, settings: { ...(content.settings as any), pass_score: Number(e.target.value || 5) } })} className={fieldClass} /></label>
        <label className="space-y-1.5"><span className="text-xs font-bold text-slate-600">Tỉ trọng tương tác (%)</span><input type="number" min={0} max={100} value={content.assessment?.interactive_weight ?? 40} onChange={(e) => updateContent({ assessment: { interactive_weight: Number(e.target.value || 40), final_quiz_weight: content.assessment?.final_quiz_weight || 60, score_scale: 10, pass_score: content.assessment?.pass_score || 5 } })} className={fieldClass} /></label>
        <label className="space-y-1.5"><span className="text-xs font-bold text-slate-600">Tỉ trọng cuối bài (%)</span><input type="number" min={0} max={100} value={content.assessment?.final_quiz_weight ?? 60} onChange={(e) => updateContent({ assessment: { interactive_weight: content.assessment?.interactive_weight || 40, final_quiz_weight: Number(e.target.value || 60), score_scale: 10, pass_score: content.assessment?.pass_score || 5 } })} className={fieldClass} /></label>
      </div>
    </EditorCard></div>
  </div>;
}
