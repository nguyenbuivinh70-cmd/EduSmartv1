import { BookOpenCheck, Clock, Loader2, RotateCcw, Save, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import type { ExamScorePolicy, FinalQuizQuestionType, LessonBuilderSettings } from '../types';

interface Props {
  value: LessonBuilderSettings;
  onChange: (value: LessonBuilderSettings) => void;
  onSaveDefault?: () => void | Promise<void>;
  onResetDefault?: () => void | Promise<void>;
  isSavingDefault?: boolean;
  isResettingDefault?: boolean;
  defaultUpdatedAt?: string;
  defaultStatusMessage?: string;
}

const fieldClass = 'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100';

export const DEFAULT_LESSON_BUILDER_SETTINGS: LessonBuilderSettings = {
  content_count: 0,
  interactive_questions_per_section: 1,
  final_quiz_count: 10,
  question_mix: 'mixed',
  final_quiz_question_types: ['single_choice', 'true_false', 'fill_in_blank'],
  difficulty: 'medium',
  include_examples: true,
  include_summary: true,
  allow_retry: true,
  show_explanation: true,
  interactive_weight: 40,
  final_quiz_weight: 60,
  pass_score: 5,
  ai_instructions: '',
  lesson_time_minutes: 45,
  auto_finish_lesson_on_timeout: true,
  final_exam_time_minutes: 15,
  shuffle_final_questions: true,
  shuffle_final_options: true,
  show_final_answers_after_submit: true,
  allow_exam_retry: true,
  max_exam_attempts: 2,
  exam_score_policy: 'best',
  review_enabled: true,
  review_question_count: 20,
  review_question_types: ['single_choice', 'true_false', 'fill_in_blank'],
  review_time_minutes: 25,
  review_shuffle_questions: true,
  review_shuffle_options: true,
  review_show_answers_after_submit: true,
  review_allow_retry: true,
};

export default function LessonBuilderSettingsPanel({ value, onChange, onSaveDefault, onResetDefault, isSavingDefault = false, isResettingDefault = false, defaultUpdatedAt, defaultStatusMessage }: Props) {
  const update = <K extends keyof LessonBuilderSettings>(key: K, next: LessonBuilderSettings[K]) => onChange({ ...value, [key]: next });
  const updatePositiveInt = (key: keyof Pick<LessonBuilderSettings, 'interactive_questions_per_section' | 'final_quiz_count' | 'lesson_time_minutes' | 'final_exam_time_minutes' | 'max_exam_attempts' | 'review_question_count' | 'review_time_minutes'>, rawValue: string, min: number, max: number) => {
    const parsed = Math.floor(Number(rawValue));
    const safeValue = Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : min;
    update(key as any, safeValue as any);
  };

  const toggleQuestionType = (key: 'final_quiz_question_types' | 'review_question_types', type: FinalQuizQuestionType, checked: boolean) => {
    const current = Array.isArray(value[key]) && value[key]?.length ? value[key] as FinalQuizQuestionType[] : ['single_choice', 'true_false', 'fill_in_blank'];
    const next = checked ? Array.from(new Set([...current, type])) : current.filter((item) => item !== type);
    update(key as any, (next.length ? next : [type]) as any);
  };

  const typeOptions: Array<{ value: FinalQuizQuestionType; label: string }> = [
    { value: 'single_choice', label: 'Chọn đáp án đúng nhất' },
    { value: 'true_false', label: 'Đúng / Sai' },
    { value: 'fill_in_blank', label: 'Chọn từ/cụm từ điền chỗ trống' },
  ];

  return (
    <div className="space-y-5 rounded-[26px] border border-indigo-100 bg-indigo-50/50 p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-indigo-600 ring-1 ring-indigo-100">
            <SlidersHorizontal className="h-5 w-5" />
          </div>
          <div>
            <p className="font-bold text-slate-900">Cấu hình bài học</p>
            <p className="text-xs font-medium text-slate-500">{defaultUpdatedAt ? `Mặc định đã lưu: ${defaultUpdatedAt}` : 'Có thể lưu cấu hình hiện tại làm mặc định cho lần tạo bài sau.'}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onSaveDefault?.()}
            disabled={!onSaveDefault || isSavingDefault || isResettingDefault}
            className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-4 py-2 text-xs font-black text-white shadow-lg shadow-indigo-200 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSavingDefault ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Lưu mặc định
          </button>
          <button
            type="button"
            onClick={() => onResetDefault?.()}
            disabled={!onResetDefault || isSavingDefault || isResettingDefault}
            className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-2 text-xs font-black text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isResettingDefault ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            Khôi phục
          </button>
        </div>
      </div>
      {defaultStatusMessage ? (
        <div className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-indigo-700 ring-1 ring-indigo-100">{defaultStatusMessage}</div>
      ) : null}

      <section className="rounded-[24px] border border-white/80 bg-white/70 p-4">
        <div className="mb-4 flex items-center gap-2 text-sm font-black text-slate-800"><SlidersHorizontal className="h-4 w-4 text-indigo-600" /> Nội dung và đánh giá</div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-700">Câu hỏi mỗi nội dung</span>
            <input type="number" inputMode="numeric" min={1} max={10} step={1} value={value.interactive_questions_per_section} onChange={(e) => updatePositiveInt('interactive_questions_per_section', e.target.value, 1, 10)} className={fieldClass} placeholder="Nhập số câu" />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-700">Số câu kiểm tra cuối bài</span>
            <input type="number" inputMode="numeric" min={1} max={50} step={1} value={value.final_quiz_count} onChange={(e) => updatePositiveInt('final_quiz_count', e.target.value, 1, 50)} className={fieldClass} placeholder="Nhập số câu" />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-700">Loại câu hỏi</span>
            <select value={value.question_mix} onChange={(e) => update('question_mix', e.target.value as LessonBuilderSettings['question_mix'])} className={fieldClass}>
              <option value="mixed">Kết hợp</option>
              <option value="single_choice">Chọn đáp án đúng nhất</option>
              <option value="true_false">Đúng / Sai</option>
              <option value="fill_in_blank">Chọn từ/cụm từ điền chỗ trống</option>
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-700">Mức độ</span>
            <select value={value.difficulty} onChange={(e) => update('difficulty', e.target.value as LessonBuilderSettings['difficulty'])} className={fieldClass}>
              <option value="easy">Dễ</option>
              <option value="medium">Vừa</option>
              <option value="hard">Khó</option>
              <option value="mixed">Kết hợp</option>
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-700">Điểm đạt</span>
            <input type="number" min={1} max={10} step={0.5} value={value.pass_score} onChange={(e) => update('pass_score', Number(e.target.value))} className={fieldClass} />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-700">Tỉ trọng câu hỏi tương tác (%)</span>
            <input type="number" min={0} max={100} value={value.interactive_weight} onChange={(e) => update('interactive_weight', Number(e.target.value))} className={fieldClass} />
          </label>
          <label className="space-y-2 md:col-span-2">
            <span className="text-sm font-semibold text-slate-700">Tỉ trọng kiểm tra cuối bài (%)</span>
            <input type="number" min={0} max={100} value={value.final_quiz_weight} onChange={(e) => update('final_quiz_weight', Number(e.target.value))} className={fieldClass} />
          </label>
        </div>
      </section>

      <section className="rounded-[24px] border border-emerald-100 bg-emerald-50/60 p-4">
        <div className="mb-4 flex items-center gap-2 text-sm font-black text-emerald-900"><Clock className="h-4 w-4" /> Thời gian học và kiểm tra</div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-700">Thời gian học toàn bài (phút)</span>
            <input type="number" min={1} max={240} step={1} value={value.lesson_time_minutes || 45} onChange={(e) => updatePositiveInt('lesson_time_minutes', e.target.value, 1, 240)} className={fieldClass} />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-700">Thời gian kiểm tra cuối bài (phút)</span>
            <input type="number" min={1} max={180} step={1} value={value.final_exam_time_minutes || 15} onChange={(e) => updatePositiveInt('final_exam_time_minutes', e.target.value, 1, 180)} className={fieldClass} />
          </label>
          <label className="flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-700 ring-1 ring-emerald-100 md:col-span-2">
            <input type="checkbox" checked={value.auto_finish_lesson_on_timeout !== false} onChange={(e) => update('auto_finish_lesson_on_timeout', e.target.checked)} /> Tự kết thúc bài học khi hết thời gian học toàn bài
          </label>
        </div>
      </section>

      <section className="rounded-[24px] border border-rose-100 bg-rose-50/60 p-4">
        <div className="mb-4 flex items-center gap-2 text-sm font-black text-rose-900"><ShieldCheck className="h-4 w-4" /> Cấu hình kiểm tra cuối bài</div>
        <div className="mb-4 rounded-2xl bg-white p-3 ring-1 ring-rose-100">
          <p className="mb-2 text-xs font-black uppercase tracking-[0.14em] text-rose-700">Loại câu hỏi kiểm tra cuối bài</p>
          <div className="grid gap-2 md:grid-cols-3">
            {typeOptions.map((item) => (
              <label key={item.value} className="flex items-center gap-2 rounded-xl bg-rose-50/60 px-3 py-2 text-xs font-bold text-slate-700">
                <input
                  type="checkbox"
                  checked={(value.final_quiz_question_types || ['single_choice', 'true_false', 'fill_in_blank']).includes(item.value)}
                  onChange={(e) => toggleQuestionType('final_quiz_question_types', item.value, e.target.checked)}
                />
                {item.label}
              </label>
            ))}
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-700 ring-1 ring-rose-100">
            <input type="checkbox" checked={value.shuffle_final_questions !== false} onChange={(e) => update('shuffle_final_questions', e.target.checked)} /> Đảo thứ tự câu hỏi
          </label>
          <label className="flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-700 ring-1 ring-rose-100">
            <input type="checkbox" checked={value.shuffle_final_options !== false} onChange={(e) => update('shuffle_final_options', e.target.checked)} /> Đảo thứ tự đáp án
          </label>
          <label className="flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-700 ring-1 ring-rose-100">
            <input type="checkbox" checked={value.show_final_answers_after_submit !== false} onChange={(e) => update('show_final_answers_after_submit', e.target.checked)} /> Cho xem đáp án sau khi nộp
          </label>
          <label className="flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-700 ring-1 ring-rose-100">
            <input type="checkbox" checked={value.allow_exam_retry !== false} onChange={(e) => update('allow_exam_retry', e.target.checked)} /> Cho phép làm lại kiểm tra
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-700">Số lần làm lại tối đa</span>
            <input type="number" min={1} max={10} step={1} value={value.max_exam_attempts || 2} onChange={(e) => updatePositiveInt('max_exam_attempts', e.target.value, 1, 10)} className={fieldClass} />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-700">Cách lấy điểm</span>
            <select value={value.exam_score_policy || 'best'} onChange={(e) => update('exam_score_policy', e.target.value as ExamScorePolicy)} className={fieldClass}>
              <option value="best">Lấy điểm cao nhất</option>
              <option value="last">Lấy điểm lần cuối</option>
              <option value="average">Lấy điểm trung bình</option>
            </select>
          </label>
        </div>
      </section>

      <section className="rounded-[24px] border border-amber-100 bg-amber-50/60 p-4">
        <div className="mb-4 flex items-center gap-2 text-sm font-black text-amber-900"><BookOpenCheck className="h-4 w-4" /> Cấu hình bài ôn tập tổng hợp</div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-700 ring-1 ring-amber-100 md:col-span-2">
            <input type="checkbox" checked={value.review_enabled !== false} onChange={(e) => update('review_enabled', e.target.checked)} /> Cho phép dùng câu hỏi của bài này để tạo bài ôn tập chương/giữa kỳ/cuối kỳ
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-700">Số câu ôn tập mặc định</span>
            <input type="number" min={1} max={100} step={1} value={value.review_question_count || 20} onChange={(e) => updatePositiveInt('review_question_count', e.target.value, 1, 100)} className={fieldClass} />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-700">Thời gian ôn tập mặc định (phút)</span>
            <input type="number" min={0} max={180} step={1} value={value.review_time_minutes || 25} onChange={(e) => updatePositiveInt('review_time_minutes', e.target.value, 0, 180)} className={fieldClass} />
          </label>
          <div className="rounded-2xl bg-white p-3 ring-1 ring-amber-100 md:col-span-2">
            <p className="mb-2 text-xs font-black uppercase tracking-[0.14em] text-amber-700">Loại câu hỏi dùng cho bài ôn tập</p>
            <div className="grid gap-2 md:grid-cols-3">
              {typeOptions.map((item) => (
                <label key={item.value} className="flex items-center gap-2 rounded-xl bg-amber-50/80 px-3 py-2 text-xs font-bold text-slate-700">
                  <input
                    type="checkbox"
                    checked={(value.review_question_types || ['single_choice', 'true_false', 'fill_in_blank']).includes(item.value)}
                    onChange={(e) => toggleQuestionType('review_question_types', item.value, e.target.checked)}
                  />
                  {item.label}
                </label>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-700 ring-1 ring-amber-100">
            <input type="checkbox" checked={value.review_shuffle_questions !== false} onChange={(e) => update('review_shuffle_questions', e.target.checked)} /> Đảo câu hỏi ôn tập
          </label>
          <label className="flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-700 ring-1 ring-amber-100">
            <input type="checkbox" checked={value.review_shuffle_options !== false} onChange={(e) => update('review_shuffle_options', e.target.checked)} /> Đảo đáp án ôn tập
          </label>
        </div>
      </section>

      <div className="grid gap-3 md:grid-cols-3">
        <label className="flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-700 ring-1 ring-slate-200">
          <input type="checkbox" checked={value.include_examples} onChange={(e) => update('include_examples', e.target.checked)} /> Có ví dụ
        </label>
        <label className="flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-700 ring-1 ring-slate-200">
          <input type="checkbox" checked={value.include_summary} onChange={(e) => update('include_summary', e.target.checked)} /> Có ghi nhớ
        </label>
        <label className="flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-700 ring-1 ring-slate-200">
          <input type="checkbox" checked={value.show_explanation} onChange={(e) => update('show_explanation', e.target.checked)} /> Giải thích đáp án
        </label>
      </div>
      <label className="block space-y-2">
        <span className="text-sm font-semibold text-slate-700">Yêu cầu riêng cho AI</span>
        <textarea value={value.ai_instructions} onChange={(e) => update('ai_instructions', e.target.value)} rows={3} className={fieldClass} placeholder="Ví dụ: tăng câu hỏi vận dụng, dùng ví dụ gần gũi với học sinh THCS..." />
      </label>
    </div>
  );
}
