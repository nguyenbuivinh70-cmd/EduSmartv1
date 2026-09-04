import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { BookOpenCheck, CheckCircle2, Clock, ListChecks, RotateCcw, X } from 'lucide-react';
import type { LessonQuestionAnswerState, QuizQuestion, ReviewPracticeConfig, ReviewPracticeRow } from '../types';
import InteractiveQuestionCard from './InteractiveQuestionCard';

interface ReviewSubmitPayload {
  review_id: string;
  diem: number;
  so_cau_dung: number;
  tong_so_cau: number;
  answers_json: string;
  started_at?: string;
  submitted_at?: string;
  auto_submitted?: boolean;
  time_spent_seconds?: number;
}

interface Props {
  isOpen: boolean;
  review: ReviewPracticeRow | null;
  questions: QuizQuestion[];
  config?: ReviewPracticeConfig;
  onClose: () => void;
  onSubmit?: (result: ReviewSubmitPayload) => Promise<void>;
}

function getQuestionKey(question: QuizQuestion, index: number) {
  return question.id || `${index}-${String(question.question || question.sentence || 'question').slice(0, 80)}`;
}

function formatSeconds(value: number) {
  const safe = Math.max(0, Math.floor(value));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function shuffleArray<T>(items: T[]) {
  return [...items].map((item) => ({ item, sort: Math.random() })).sort((a, b) => a.sort - b.sort).map(({ item }) => item);
}

function normalizeQuestion(question: QuizQuestion, index: number): QuizQuestion {
  const type = question.type === 'short_answer' ? 'fill_in_blank' : (question.type || 'single_choice');
  if (type === 'true_false') return { ...question, id: question.id || `RQ${index + 1}`, type, options: question.options?.length ? question.options : ['Đúng', 'Sai'] };
  if (type === 'fill_in_blank') {
    const correct = question.correctAnswers?.[0] || question.correctAnswer || 'thông tin';
    const choices = Array.from(new Set([correct, ...(question.choices || []), ...(question.options || []), 'dữ liệu', 'thông tin', 'vật mang tin'].filter(Boolean))).slice(0, 4);
    while (choices.length < 4) choices.push(`Lựa chọn ${choices.length + 1}`);
    return { ...question, id: question.id || `RQ${index + 1}`, type, sentence: question.sentence || question.question, question: question.sentence || question.question, choices, correctAnswers: question.correctAnswers?.length ? question.correctAnswers : [correct], options: [] };
  }
  return { ...question, id: question.id || `RQ${index + 1}`, type: 'single_choice' };
}

export default function ReviewPracticeViewer({ isOpen, review, questions, config, onClose, onSubmit }: Props) {
  const [answerStates, setAnswerStates] = useState<Record<string, LessonQuestionAnswerState>>({});
  const [submitted, setSubmitted] = useState(false);
  const [autoSubmitted, setAutoSubmitted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const submittedRef = useRef(false);
  const startedAtRef = useRef('');
  const timeLimitMinutes = Math.max(0, Number(config?.time_limit_minutes || review?.thoi_gian || 0));
  const hasTimer = timeLimitMinutes > 0;
  const remainingSeconds = hasTimer ? Math.max(0, timeLimitMinutes * 60 - elapsed) : 0;

  const activeQuestions = useMemo(() => {
    const normalized = questions.map(normalizeQuestion);
    return config?.shuffle_questions ? shuffleArray(normalized) : normalized;
  }, [questions, config?.shuffle_questions, review?.review_id]);

  const stats = useMemo(() => {
    const states = activeQuestions.map((question, index) => answerStates[getQuestionKey(question, index)]).filter(Boolean);
    const correct = states.filter((item) => item.submitted && item.isCorrect).length;
    const answered = states.filter((item) => item.submitted).length;
    const total = activeQuestions.length;
    const score = total ? Number(((correct / total) * 10).toFixed(1)) : 0;
    return { correct, answered, total, score, unanswered: Math.max(0, total - answered) };
  }, [activeQuestions, answerStates]);

  useEffect(() => {
    if (!isOpen) return;
    setAnswerStates({});
    setSubmitted(false);
    setAutoSubmitted(false);
    setElapsed(0);
    setActiveIndex(0);
    setIsSubmitting(false);
    submittedRef.current = false;
    startedAtRef.current = new Date().toISOString();
  }, [isOpen, review?.review_id]);

  useEffect(() => {
    if (!isOpen || submitted) return;
    const interval = window.setInterval(() => {
      setElapsed((value) => value + 1);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [isOpen, submitted]);

  const handleSubmit = useCallback(async (mode: 'manual' | 'auto_timeout' = 'manual') => {
    if (!review || submittedRef.current) return;
    submittedRef.current = true;
    const submittedAt = new Date().toISOString();
    const payload: ReviewSubmitPayload = {
      review_id: review.review_id,
      diem: stats.score,
      so_cau_dung: stats.correct,
      tong_so_cau: stats.total,
      answers_json: JSON.stringify(answerStates),
      started_at: startedAtRef.current || submittedAt,
      submitted_at: submittedAt,
      auto_submitted: mode === 'auto_timeout',
      time_spent_seconds: elapsed,
    };
    setSubmitted(true);
    setAutoSubmitted(mode === 'auto_timeout');
    setIsSubmitting(true);
    try {
      await onSubmit?.(payload);
    } finally {
      setIsSubmitting(false);
    }
  }, [answerStates, elapsed, onSubmit, review, stats.correct, stats.score, stats.total]);

  useEffect(() => {
    if (!isOpen || !hasTimer || submitted || isSubmitting) return;
    if (remainingSeconds <= 0) void handleSubmit('auto_timeout');
  }, [handleSubmit, hasTimer, isOpen, isSubmitting, remainingSeconds, submitted]);

  const retry = () => {
    setAnswerStates({});
    setSubmitted(false);
    setAutoSubmitted(false);
    setElapsed(0);
    setActiveIndex(0);
    setIsSubmitting(false);
    submittedRef.current = false;
    startedAtRef.current = new Date().toISOString();
  };

  return (
    <AnimatePresence>
      {isOpen && review ? (
        <div className="fixed inset-0 z-[12000] bg-slate-950/60 p-3 backdrop-blur-sm">
          <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} className="mx-auto flex h-full max-w-7xl flex-col overflow-hidden rounded-[28px] bg-white shadow-[0_30px_90px_rgba(15,23,42,0.35)]">
            <header className="flex items-center justify-between gap-4 bg-gradient-to-r from-amber-500 via-orange-500 to-fuchsia-600 px-6 py-4 text-white">
              <div className="min-w-0">
                <p className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-black uppercase tracking-[0.14em]"><BookOpenCheck className="h-4 w-4" /> Bài ôn tập</p>
                <h2 className="mt-2 truncate text-2xl font-black">{review.tieu_de}</h2>
                <p className="mt-1 text-sm text-white/85">{review.nam_hoc} • {review.hoc_ky || 'HK1'} • Khối {review.khoi} • {stats.total} câu</p>
              </div>
              <div className="flex items-center gap-3">
                <div className={`rounded-2xl px-4 py-2 text-sm font-black ${hasTimer && remainingSeconds <= 60 && !submitted ? 'bg-rose-500 text-white' : 'bg-white/15'}`}><Clock className="mr-2 inline h-4 w-4" />{hasTimer ? formatSeconds(remainingSeconds) : formatSeconds(elapsed)}</div>
                <button type="button" onClick={onClose} className="rounded-full bg-white/15 p-2 hover:bg-white/25"><X className="h-5 w-5" /></button>
              </div>
            </header>

            <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_300px]">
              <main className="overflow-y-auto bg-slate-50/70 p-5">
                {autoSubmitted ? <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">Đã hết thời gian. Hệ thống đã tự động nộp và lưu kết quả bài ôn tập.</div> : null}
                <div className="space-y-4">
                  {activeQuestions.map((question, index) => {
                    const key = getQuestionKey(question, index);
                    return (
                      <div key={key} id={`review-q-${index + 1}`} onFocusCapture={() => setActiveIndex(index)} onMouseEnter={() => setActiveIndex(index)}>
                        <InteractiveQuestionCard question={question} index={index} initialAnswer={answerStates[key] || null} onAnswerStateChange={(payload) => setAnswerStates((prev) => ({ ...prev, [payload.questionId]: payload }))} disableAI hideFeedback={!submitted || config?.show_answers_after_submit === false} examMode />
                      </div>
                    );
                  })}
                </div>
              </main>

              <aside className="overflow-y-auto border-l border-slate-100 bg-white p-5">
                <div className="rounded-[26px] bg-slate-50 p-5 text-center ring-1 ring-slate-100">
                  <p className="text-sm font-black text-slate-900">Trạng thái ôn tập</p>
                  <p className="mt-3 text-4xl font-black text-amber-600">{submitted ? `${stats.score}/10` : stats.answered}</p>
                  <p className="mt-1 text-xs font-bold text-slate-500">{submitted ? `Đúng ${stats.correct}/${stats.total}` : `Đã làm ${stats.answered}/${stats.total}`}</p>
                  {isSubmitting ? <p className="mt-2 text-xs font-black text-indigo-600">Đang lưu kết quả...</p> : null}
                </div>
                <div className="mt-4 rounded-[26px] bg-slate-50 p-4 ring-1 ring-slate-100">
                  <p className="mb-3 text-sm font-black text-slate-900">Câu hỏi</p>
                  <div className="grid grid-cols-5 gap-2">
                    {activeQuestions.map((question, index) => {
                      const state = answerStates[getQuestionKey(question, index)];
                      const active = activeIndex === index;
                      const color = submitted ? (state?.isCorrect ? 'bg-emerald-600 text-white' : 'bg-rose-500 text-white') : state?.submitted ? 'bg-teal-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200';
                      return <button key={index} type="button" onClick={() => document.getElementById(`review-q-${index + 1}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className={`h-10 rounded-full text-sm font-black ${color} ${active ? 'ring-4 ring-indigo-100' : ''}`}>{index + 1}</button>;
                    })}
                  </div>
                </div>
                <div className="mt-4 space-y-3">
                  {!submitted ? <button type="button" disabled={isSubmitting} onClick={() => void handleSubmit()} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-emerald-200 hover:bg-emerald-700 disabled:opacity-60"><ListChecks className="h-5 w-5" /> Nộp bài ôn tập</button> : null}
                  {submitted && config?.allow_retry !== false ? <button type="button" onClick={retry} disabled={isSubmitting} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"><RotateCcw className="h-4 w-4" /> Làm lại</button> : null}
                  {submitted ? <button type="button" onClick={onClose} disabled={isSubmitting} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-black text-white disabled:opacity-60"><CheckCircle2 className="h-5 w-5" /> Hoàn thành</button> : null}
                </div>
              </aside>
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
