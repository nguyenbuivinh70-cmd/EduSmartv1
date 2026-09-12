import { useMemo, useState, type ReactNode } from 'react';
import { BookOpen, ChevronDown, FileQuestion, ListChecks, Plus, Save, Trash2, Youtube } from 'lucide-react';
import type { LessonContent, LessonContentBlock, LessonSectionV2, QuizQuestion, QuizQuestionType } from '../types';
import YoutubeEmbedBlock, { getYoutubeEmbedUrl } from './YoutubeEmbedBlock';

interface LessonManualEditorProps {
  content: LessonContent;
  onChange: (content: LessonContent) => void;
}

const fieldClass = 'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100';
const smallButtonClass = 'inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition';

function text(value: unknown) {
  return String(value ?? '');
}

function splitLines(value?: string) {
  return text(value).split(/\n+/).map((item) => item.trim()).filter(Boolean);
}

function joinLines(value?: string[]) {
  return (value || []).join('\n');
}

function createEmptyBlock(type: LessonContentBlock['type'] = 'paragraph'): LessonContentBlock {
  return { type, title: '', category: '', theme: '', text: '' };
}

function createEmptyQuestion(type: QuizQuestionType = 'single_choice', index = 1): QuizQuestion {
  if (type === 'true_false') {
    return {
      id: `Q_${Date.now()}_${index}`,
      type,
      question: '',
      options: ['Đúng', 'Sai'],
      correctAnswer: 'Đúng',
      explanation: '',
      level: 'nhan_biet',
      source: 'manual',
    };
  }
  if (type === 'fill_in_blank' || type === 'short_answer') {
    return {
      id: `Q_${Date.now()}_${index}`,
      type: 'fill_in_blank',
      question: 'Điền từ/cụm từ thích hợp vào chỗ trống.',
      sentence: '_____ là khái niệm trọng tâm cần ghi nhớ.',
      choices: ['dữ liệu', 'thông tin', 'vật mang tin', 'xử lí thông tin'],
      correctAnswers: ['dữ liệu'],
      explanation: '',
      level: 'thong_hieu',
      source: 'manual',
    };
  }
  return {
    id: `Q_${Date.now()}_${index}`,
    type: 'single_choice',
    question: '',
    options: ['Phương án 1', 'Phương án 2', 'Phương án 3', 'Phương án 4'],
    correctAnswer: 'Phương án 1',
    explanation: '',
    level: 'nhan_biet',
    source: 'manual',
  };
}

function createEmptySection(index: number): LessonSectionV2 {
  return {
    section_id: `S${Date.now()}_${index}`,
    title: `${index}. Nội dung mới`,
    content: '',
    content_blocks: [createEmptyBlock('paragraph')],
    summary: '',
    source_note: '',
    examples: [],
    youtube_url: '',
    youtube_embed_url: '',
    interactive_questions: [createEmptyQuestion('single_choice', 1)],
  };
}

function normalizeQuestionForType(question: QuizQuestion, nextType: QuizQuestionType): QuizQuestion {
  const base = { ...question, type: nextType };
  if (nextType === 'true_false') {
    return { ...base, options: ['Đúng', 'Sai'], choices: undefined, correctAnswers: undefined, sentence: '', correctAnswer: ['Đúng', 'Sai'].includes(text(base.correctAnswer)) ? base.correctAnswer : 'Đúng' };
  }
  if (nextType === 'fill_in_blank' || nextType === 'short_answer') {
    const firstChoice = question.correctAnswers?.[0] || question.choices?.[0] || 'dữ liệu';
    return {
      ...base,
      type: 'fill_in_blank',
      question: question.question || 'Điền từ/cụm từ thích hợp vào chỗ trống.',
      sentence: question.sentence || '_____ là khái niệm trọng tâm cần ghi nhớ.',
      options: undefined,
      choices: question.choices?.length === 4 ? question.choices : [firstChoice, 'thông tin', 'vật mang tin', 'xử lí thông tin'].filter((item, idx, arr) => arr.indexOf(item) === idx).slice(0, 4),
      correctAnswer: undefined,
      correctAnswers: [firstChoice],
      suggestedAnswer: undefined,
      rubric: undefined,
    };
  }
  return { ...base, type: 'single_choice', choices: undefined, correctAnswers: undefined, sentence: '', options: base.options?.length ? base.options : ['Phương án 1', 'Phương án 2', 'Phương án 3', 'Phương án 4'], correctAnswer: base.correctAnswer || base.options?.[0] || 'Phương án 1' };
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

function QuestionEditor({ question, index, onChange, onDelete }: { key?: string | number; question: QuizQuestion; index: number; onChange: (question: QuizQuestion) => void; onDelete: () => void }) {
  const qType = question.type === 'short_answer' ? 'fill_in_blank' : (question.type || 'single_choice');
  const optionsText = useMemo(() => joinLines(question.options || []), [question.options]);

  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-black text-indigo-700">Câu {index + 1}</span>
        <select value={qType} onChange={(e) => onChange(normalizeQuestionForType(question, e.target.value as QuizQuestionType))} className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold outline-none">
          <option value="single_choice">Chọn đáp án đúng nhất</option>
          <option value="true_false">Đúng / Sai</option>
          <option value="fill_in_blank">Chọn từ/cụm từ điền chỗ trống</option>
        </select>
        <button type="button" onClick={onDelete} className={`${smallButtonClass} ml-auto bg-rose-50 text-rose-700 hover:bg-rose-100`}><Trash2 className="h-3.5 w-3.5" /> Xóa</button>
      </div>
      <div className="grid gap-3">
        <label className="space-y-1.5">
          <span className="text-xs font-bold text-slate-600">Nội dung câu hỏi</span>
          <textarea value={question.question || ''} onChange={(e) => onChange({ ...question, question: e.target.value })} rows={2} className={fieldClass} placeholder="Nhập nội dung câu hỏi..." />
        </label>
        {qType === 'single_choice' ? (
          <>
            <label className="space-y-1.5">
              <span className="text-xs font-bold text-slate-600">Các đáp án, mỗi dòng một đáp án</span>
              <textarea value={optionsText} onChange={(e) => onChange({ ...question, options: splitLines(e.target.value) })} rows={4} className={fieldClass} placeholder={'Phương án 1\nPhương án 2\nPhương án 3\nPhương án 4'} />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-bold text-slate-600">Đáp án đúng</span>
              <input value={text(question.correctAnswer)} onChange={(e) => onChange({ ...question, correctAnswer: e.target.value })} className={fieldClass} placeholder="Nhập đúng nguyên văn nội dung đáp án đúng" />
            </label>
          </>
        ) : null}
        {qType === 'true_false' ? (
          <label className="space-y-1.5">
            <span className="text-xs font-bold text-slate-600">Đáp án đúng</span>
            <select value={text(question.correctAnswer) || 'Đúng'} onChange={(e) => onChange({ ...question, correctAnswer: e.target.value, options: ['Đúng', 'Sai'] })} className={fieldClass}>
              <option value="Đúng">Đúng</option>
              <option value="Sai">Sai</option>
            </select>
          </label>
        ) : null}
        {qType === 'fill_in_blank' ? (
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1.5 md:col-span-2">
              <span className="text-xs font-bold text-slate-600">Câu có chỗ trống, dùng _____ để đánh dấu vị trí cần điền</span>
              <textarea value={question.sentence || question.question || ''} onChange={(e) => onChange({ ...question, type: 'fill_in_blank', sentence: e.target.value, question: e.target.value })} rows={2} className={fieldClass} placeholder="Ví dụ: _____ là những gì đem lại hiểu biết cho con người." />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-bold text-slate-600">4 từ/cụm từ lựa chọn, mỗi dòng một lựa chọn</span>
              <textarea value={joinLines((question.choices || question.options || []).slice(0, 4))} onChange={(e) => onChange({ ...question, type: 'fill_in_blank', choices: splitLines(e.target.value).slice(0, 4), options: undefined })} rows={4} className={fieldClass} placeholder={'dữ liệu\nthông tin\nvật mang tin\nxử lí thông tin'} />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-bold text-slate-600">Từ/cụm từ đúng</span>
              <input value={(question.correctAnswers || [])[0] || ''} onChange={(e) => onChange({ ...question, type: 'fill_in_blank', correctAnswers: [e.target.value] })} className={fieldClass} placeholder="Nhập đúng 1 từ/cụm từ đúng" />
            </label>
          </div>
        ) : null}
        <label className="space-y-1.5">
          <span className="text-xs font-bold text-slate-600">Giải thích / phản hồi sau khi trả lời</span>
          <textarea value={question.explanation || ''} onChange={(e) => onChange({ ...question, explanation: e.target.value })} rows={2} className={fieldClass} placeholder="Giải thích ngắn gọn để học sinh hiểu vì sao đúng/sai..." />
        </label>
      </div>
    </div>
  );
}

export default function LessonManualEditor({ content, onChange }: LessonManualEditorProps) {
  const sections = content.sections || [];
  const finalQuiz = content.final_quiz || [];

  const updateContent = (patch: Partial<LessonContent>) => onChange({ ...content, ...patch });

  const updateSection = (index: number, section: LessonSectionV2) => {
    updateContent({ sections: sections.map((item, idx) => (idx === index ? section : item)) });
  };

  const deleteSection = (index: number) => {
    updateContent({ sections: sections.filter((_, idx) => idx !== index) });
  };

  const moveSection = (index: number, dir: -1 | 1) => {
    const next = [...sections];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    updateContent({ sections: next });
  };

  const updateFinalQuestion = (index: number, question: QuizQuestion) => {
    updateContent({ final_quiz: finalQuiz.map((item, idx) => (idx === index ? question : item)) });
  };

  return (
    <div className="space-y-4">
      <div id="lesson-editor-general"><EditorCard title="Thông tin chung của bài học" icon={<BookOpen className="h-5 w-5" />} defaultOpen>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1.5 md:col-span-2">
            <span className="text-xs font-bold text-slate-600">Tiêu đề hiển thị</span>
            <input value={content.metadata?.tieu_de || content.title || ''} onChange={(e) => updateContent({ metadata: { ...content.metadata, tieu_de: e.target.value }, title: e.target.value })} className={fieldClass} />
          </label>
          <label className="space-y-1.5 md:col-span-2">
            <span className="text-xs font-bold text-slate-600">Tóm tắt bài học</span>
            <textarea value={content.metadata?.tom_tat || ''} onChange={(e) => updateContent({ metadata: { ...content.metadata, tom_tat: e.target.value } })} rows={3} className={fieldClass} />
          </label>
          <label className="space-y-1.5 md:col-span-2">
            <span className="text-xs font-bold text-slate-600">Từ khóa, cách nhau bằng dấu phẩy</span>
            <input value={(content.metadata?.tu_khoa || []).join(', ')} onChange={(e) => updateContent({ metadata: { ...content.metadata, tu_khoa: e.target.value.split(',').map((item) => item.trim()).filter(Boolean) } })} className={fieldClass} />
          </label>
          <label className="space-y-1.5 md:col-span-2">
            <span className="flex items-center gap-2 text-xs font-bold text-slate-600"><Youtube className="h-4 w-4 text-red-600" /> Video mở đầu bài học từ YouTube</span>
            <input
              value={content.intro_video_url || ''}
              onChange={(e) => updateContent({ intro_video_url: e.target.value, intro_video_embed_url: getYoutubeEmbedUrl(e.target.value) })}
              className={fieldClass}
              placeholder="https://www.youtube.com/watch?v=..."
            />
            {content.intro_video_url && !getYoutubeEmbedUrl(content.intro_video_url) ? <span className="text-xs font-semibold text-rose-600">Link YouTube chưa hợp lệ.</span> : null}
          </label>
          {getYoutubeEmbedUrl(content.intro_video_url) ? <div className="md:col-span-2"><YoutubeEmbedBlock url={content.intro_video_url} title="Xem trước video mở đầu" /></div> : null}
        </div>
      </EditorCard></div>

      <div id="lesson-editor-sections"><EditorCard title={`Nội dung kiến thức (${sections.length} mục)`} icon={<Save className="h-5 w-5" />} defaultOpen>
        <div className="mb-4 flex justify-end">
          <button type="button" onClick={() => updateContent({ sections: [...sections, createEmptySection(sections.length + 1)] })} className={`${smallButtonClass} bg-indigo-600 text-white hover:bg-indigo-700`}><Plus className="h-4 w-4" /> Thêm nội dung</button>
        </div>
        <div className="space-y-5">
          {sections.map((section, index) => {
            const blocks = section.content_blocks?.length ? section.content_blocks : [{ type: 'paragraph' as const, text: section.content || '' }];
            return (
              <div id={`lesson-editor-section-${index}`} key={section.section_id || index} className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-black text-violet-700">Mục {index + 1}</span>
                  <button type="button" onClick={() => moveSection(index, -1)} disabled={index === 0} className={`${smallButtonClass} bg-slate-100 text-slate-600 disabled:opacity-40`}>Lên</button>
                  <button type="button" onClick={() => moveSection(index, 1)} disabled={index === sections.length - 1} className={`${smallButtonClass} bg-slate-100 text-slate-600 disabled:opacity-40`}>Xuống</button>
                  <button type="button" onClick={() => deleteSection(index)} className={`${smallButtonClass} ml-auto bg-rose-50 text-rose-700 hover:bg-rose-100`}><Trash2 className="h-3.5 w-3.5" /> Xóa mục</button>
                </div>
                <div className="grid gap-4">
                  <label className="space-y-1.5">
                    <span className="text-xs font-bold text-slate-600">Tiêu đề mục</span>
                    <input value={section.title || ''} onChange={(e) => updateSection(index, { ...section, title: e.target.value })} className={fieldClass} />
                  </label>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-600">Các khối nội dung</span>
                      <button type="button" onClick={() => updateSection(index, { ...section, content_blocks: [...blocks, createEmptyBlock('paragraph')] })} className={`${smallButtonClass} bg-slate-100 text-slate-700 hover:bg-slate-200`}><Plus className="h-3.5 w-3.5" /> Thêm khối</button>
                    </div>
                    {blocks.map((block, blockIndex) => (
                      <div key={blockIndex} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                        <div className="mb-3 grid gap-2 md:grid-cols-[1fr_1fr_1fr_auto]">
                          <select value={block.type || 'paragraph'} onChange={(e) => updateSection(index, { ...section, content_blocks: blocks.map((item, idx) => idx === blockIndex ? { ...item, type: e.target.value as LessonContentBlock['type'] } : item) })} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold">
                            <option value="paragraph">Kiến thức</option>
                            <option value="key_point">Ý chính</option>
                            <option value="example">Ví dụ</option>
                            <option value="note">Ghi nhớ</option>
                            <option value="activity">Hoạt động</option>
                          </select>
                          <input value={block.title || ''} onChange={(e) => updateSection(index, { ...section, content_blocks: blocks.map((item, idx) => idx === blockIndex ? { ...item, title: e.target.value } : item) })} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold outline-none" placeholder="Tiêu đề khối, ví dụ: Bộ xử lí là gì?" />
                          <select value={block.theme || ''} onChange={(e) => updateSection(index, { ...section, content_blocks: blocks.map((item, idx) => idx === blockIndex ? { ...item, theme: e.target.value } : item) })} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold">
                            <option value="">Màu tự động</option>
                            <option value="blue">Xanh dương nhẹ</option>
                            <option value="violet">Tím nhẹ</option>
                            <option value="amber">Vàng nhẹ</option>
                            <option value="emerald">Xanh lá nhẹ</option>
                            <option value="rose">Hồng nhẹ</option>
                            <option value="cyan">Xanh ngọc nhẹ</option>
                            <option value="orange">Cam nhẹ</option>
                          </select>
                          <button type="button" onClick={() => updateSection(index, { ...section, content_blocks: blocks.filter((_, idx) => idx !== blockIndex) })} className={`${smallButtonClass} bg-rose-50 text-rose-700 hover:bg-rose-100`}><Trash2 className="h-3.5 w-3.5" /> Xóa</button>
                        </div>
                        <input value={block.category || ''} onChange={(e) => updateSection(index, { ...section, content_blocks: blocks.map((item, idx) => idx === blockIndex ? { ...item, category: e.target.value } : item) })} className="mb-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold outline-none" placeholder="Nhóm nội dung: khai_niem, vi_du, ung_dung, ghi_nho..." />
                        <textarea value={block.text || ''} onChange={(e) => {
                          const nextBlocks = blocks.map((item, idx) => idx === blockIndex ? { ...item, text: e.target.value } : item);
                          updateSection(index, { ...section, content_blocks: nextBlocks, content: nextBlocks.map((item) => item.text).filter(Boolean).join('\n\n') });
                        }} rows={4} className={fieldClass} placeholder="Nhập nội dung..." />
                      </div>
                    ))}
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="space-y-1.5">
                      <span className="text-xs font-bold text-slate-600">Ghi nhớ</span>
                      <textarea value={section.source_note || section.summary || ''} onChange={(e) => updateSection(index, { ...section, source_note: e.target.value, summary: e.target.value })} rows={3} className={fieldClass} />
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-xs font-bold text-slate-600">Ví dụ, mỗi dòng một ví dụ</span>
                      <textarea value={joinLines(section.examples || [])} onChange={(e) => updateSection(index, { ...section, examples: splitLines(e.target.value) })} rows={3} className={fieldClass} />
                    </label>
                  </div>
                  <label className="space-y-1.5">
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-600"><Youtube className="h-3.5 w-3.5" /> Link YouTube</span>
                    <input value={section.youtube_url || ''} onChange={(e) => updateSection(index, { ...section, youtube_url: e.target.value })} className={fieldClass} placeholder="https://www.youtube.com/watch?v=..." />
                  </label>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-600">Câu hỏi tương tác</span>
                      <button type="button" onClick={() => updateSection(index, { ...section, interactive_questions: [...(section.interactive_questions || []), createEmptyQuestion('single_choice', (section.interactive_questions || []).length + 1)] })} className={`${smallButtonClass} bg-indigo-50 text-indigo-700 hover:bg-indigo-100`}><Plus className="h-3.5 w-3.5" /> Thêm câu hỏi</button>
                    </div>
                    {(section.interactive_questions || []).map((question, qIndex) => (
                      <QuestionEditor key={question.id || qIndex} question={question} index={qIndex} onChange={(next) => updateSection(index, { ...section, interactive_questions: (section.interactive_questions || []).map((item, idx) => idx === qIndex ? next : item) })} onDelete={() => updateSection(index, { ...section, interactive_questions: (section.interactive_questions || []).filter((_, idx) => idx !== qIndex) })} />
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </EditorCard></div>

      <div id="lesson-editor-final-quiz"><EditorCard title={`Bài tập cuối bài (${finalQuiz.length} câu)`} icon={<ListChecks className="h-5 w-5" />}>
        <div className="mb-4 flex justify-end">
          <button type="button" onClick={() => updateContent({ final_quiz: [...finalQuiz, createEmptyQuestion('single_choice', finalQuiz.length + 1)] })} className={`${smallButtonClass} bg-emerald-600 text-white hover:bg-emerald-700`}><Plus className="h-4 w-4" /> Thêm câu cuối bài</button>
        </div>
        <div className="space-y-3">
          {finalQuiz.map((question, index) => (
            <QuestionEditor key={question.id || index} question={question} index={index} onChange={(next) => updateFinalQuestion(index, next)} onDelete={() => updateContent({ final_quiz: finalQuiz.filter((_, idx) => idx !== index) })} />
          ))}
          {!finalQuiz.length ? <div className="rounded-2xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">Chưa có câu hỏi cuối bài.</div> : null}
        </div>
      </EditorCard></div>

      <div id="lesson-editor-assessment"><EditorCard title="Cấu hình đánh giá" icon={<FileQuestion className="h-5 w-5" />}>
        <div className="grid gap-4 md:grid-cols-3">
          <label className="space-y-1.5"><span className="text-xs font-bold text-slate-600">Điểm đạt</span><input type="number" min={0} max={10} value={content.assessment?.pass_score ?? content.settings?.pass_score ?? 5} onChange={(e) => updateContent({ assessment: { interactive_weight: 0, final_quiz_weight: 100, score_scale: 10, pass_score: Number(e.target.value || 5) }, settings: { ...(content.settings as any), pass_score: Number(e.target.value || 5) } })} className={fieldClass} /></label>
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 md:col-span-2"><p className="text-xs font-black uppercase tracking-[0.12em] text-emerald-700">Cách tính điểm V6.81</p><p className="mt-1 text-sm font-semibold text-emerald-900">Chỉ kiểm tra cuối bài tạo điểm chính thức (100%). Các mục học tập không tính điểm.</p></div>
        </div>
      </EditorCard></div>
    </div>
  );
}
