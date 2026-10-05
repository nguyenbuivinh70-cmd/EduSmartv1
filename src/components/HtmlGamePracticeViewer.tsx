import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, Clock3, Gamepad2, RotateCcw, ShieldCheck, X } from 'lucide-react';
import type { CoLearningSession, ReviewPracticeConfig, ReviewPracticeRow, User } from '../types';
import { resolvePracticeConfig } from '../utils/practiceAccess';

interface Props {
  isOpen: boolean;
  review: ReviewPracticeRow;
  html: string;
  currentUser: User;
  config?: ReviewPracticeConfig;
  initialAttemptCount?: number;
  previewOnly?: boolean;
  coLearningSession?: CoLearningSession | null;
  onClose: () => void;
  onSubmit: (result: Record<string, unknown>) => Promise<void>;
}

type GameResult = {
  score10: number;
  rawScore: number;
  correct: number;
  wrong: number;
  total: number;
  durationSeconds: number;
  maxCombo: number;
  levelReached: string;
  completed: boolean;
  timedOut?: boolean;
  message?: string;
  mistakes: string[];
  raw: Record<string, unknown>;
};

function n(value: unknown, fallback = 0) { const x = Number(value); return Number.isFinite(x) ? x : fallback; }
function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }
function normalizeResult(payload: Record<string, unknown>, elapsed: number): GameResult {
  const correct = Math.max(0, Math.round(n(payload.correct ?? payload.correctCount)));
  const wrong = Math.max(0, Math.round(n(payload.wrong ?? payload.wrongCount)));
  const total = Math.max(0, Math.round(n(payload.total ?? payload.totalAnswered, correct + wrong)));
  const rawScore = n(payload.rawScore ?? payload.score);
  const suppliedScore10 = n(payload.score10 ?? payload.diem, NaN);
  const score10 = Number.isFinite(suppliedScore10) ? clamp(Math.round(suppliedScore10 * 100) / 100, 0, 10) : total > 0 ? Math.round((correct / total) * 1000) / 100 : 0;
  const mistakes = Array.isArray(payload.mistakes) ? payload.mistakes.map((item) => String(item)).filter(Boolean).slice(0, 100) : [];
  const safeRaw = Object.fromEntries(Object.entries(payload).filter(([key, value]) => !['html','source','code'].includes(key) && JSON.stringify(value ?? null).length < 15_000));
  return {
    score10, rawScore, correct, wrong, total,
    durationSeconds: Math.max(0, Math.round(n(payload.durationSeconds ?? payload.time_spent_seconds, elapsed))),
    maxCombo: Math.max(0, Math.round(n(payload.maxCombo))),
    levelReached: String(payload.levelReached ?? payload.level ?? ''),
    completed: payload.completed !== false,
    timedOut: payload.timedOut === true,
    message: String(payload.message ?? ''),
    mistakes,
    raw: safeRaw,
  };
}

export default function HtmlGamePracticeViewer({ isOpen, review, html, currentUser, config, initialAttemptCount = 0, previewOnly = false, coLearningSession, onClose, onSubmit }: Props) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const startedAtRef = useRef(Date.now());
  const finishHandledRef = useRef(false);
  const [frameKey, setFrameKey] = useState(0);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<GameResult | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [runtimeError, setRuntimeError] = useState('');
  const resolved = useMemo(() => resolvePracticeConfig(review, config), [review, config]);
  const limitSeconds = Math.max(0, Number(resolved.time_limit_minutes || 0) * 60);

  const reset = () => {
    finishHandledRef.current = false;
    startedAtRef.current = Date.now();
    setReady(false); setSaving(false); setResult(null); setElapsed(0); setRemaining(limitSeconds); setRuntimeError(''); setFrameKey((v) => v + 1);
  };

  useEffect(() => { if (isOpen) reset(); }, [isOpen, review.review_id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isOpen || result) return;
    const timer = window.setInterval(() => {
      const seconds = Math.max(0, Math.floor((Date.now() - startedAtRef.current) / 1000));
      setElapsed(seconds);
      if (limitSeconds > 0) setRemaining(Math.max(0, limitSeconds - seconds));
      if (limitSeconds > 0 && seconds >= limitSeconds && !finishHandledRef.current) {
        iframeRef.current?.contentWindow?.postMessage({ channel: 'EDUSMART_HOST_V1', type: 'EDUSMART_GAME_FORCE_FINISH', payload: { timedOut: true } }, '*');
        window.setTimeout(() => {
          if (!finishHandledRef.current) void handleFinish({ completed: false, timedOut: true, score10: 0, rawScore: 0, correct: 0, wrong: 0, total: 0, message: 'Hết thời gian' });
        }, 900);
      }
    }, 500);
    return () => window.clearInterval(timer);
  }, [isOpen, result, limitSeconds]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFinish = async (payload: Record<string, unknown>) => {
    if (finishHandledRef.current) return;
    finishHandledRef.current = true;
    const seconds = Math.max(0, Math.floor((Date.now() - startedAtRef.current) / 1000));
    const normalized = normalizeResult(payload, seconds);
    setResult(normalized);
    if (previewOnly) return;
    setSaving(true);
    try {
      await onSubmit({
        review_id: review.review_id,
        user_id: currentUser.user_id,
        lop_id: currentUser.lop_id || review.lop_id || '',
        khoi: currentUser.khoi || review.khoi,
        nam_hoc: review.nam_hoc || '',
        hoc_ky: review.hoc_ky || 'HK1',
        diem: normalized.score10,
        so_cau_dung: normalized.correct,
        tong_so_cau: normalized.total,
        raw_game_score: normalized.rawScore,
        max_combo: normalized.maxCombo,
        level_reached: normalized.levelReached,
        mistakes: normalized.mistakes,
        game_result_json: JSON.stringify(normalized.raw).slice(0, 45_000),
        started_at: new Date(startedAtRef.current).toISOString(),
        submitted_at: new Date().toISOString(),
        auto_submitted: normalized.timedOut === true,
        time_spent_seconds: normalized.durationSeconds,
        study_mode: coLearningSession ? 'co_learning' : 'single',
        co_learning_session_id: coLearningSession?.session_id || '',
        participant_user_ids: coLearningSession?.participant_user_ids || [],
        participant_names: coLearningSession?.participant_names || [],
        source_mode: 'html_game',
      });
    } catch (error) {
      finishHandledRef.current = false;
      setRuntimeError(error instanceof Error ? error.message : 'Không lưu được kết quả trò chơi.');
    } finally { setSaving(false); }
  };

  useEffect(() => {
    if (!isOpen) return;
    const listener = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data;
      if (!data || data.channel !== 'EDUSMART_GAME_V1') return;
      if (data.type === 'EDUSMART_GAME_READY') {
        setReady(true);
        iframeRef.current?.contentWindow?.postMessage({ channel: 'EDUSMART_HOST_V1', type: 'EDUSMART_HOST_INIT', payload: {
          reviewId: review.review_id, attemptNumber: initialAttemptCount + 1, timeLimitSeconds: limitSeconds,
          previewOnly, student: { userId: currentUser.user_id, name: currentUser.ho_ten, classId: currentUser.lop_id || '' },
        } }, '*');
      }
      if (data.type === 'EDUSMART_GAME_FINISH') void handleFinish((data.payload || {}) as Record<string, unknown>);
      if (data.type === 'EDUSMART_GAME_EXIT') onClose();
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, [isOpen, review.review_id, currentUser.user_id, initialAttemptCount, limitSeconds, previewOnly]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen) return null;
  const canRetry = previewOnly || resolved.max_attempts === 0 || initialAttemptCount + (result && !previewOnly ? 1 : 0) < resolved.max_attempts;
  return <AnimatePresence><div className="fixed inset-0 z-[13700] bg-slate-950/80 p-2 backdrop-blur-sm sm:p-3">
    <motion.div initial={{opacity:0,scale:.985}} animate={{opacity:1,scale:1}} exit={{opacity:0,scale:.985}} className="mx-auto flex h-full max-w-[1500px] flex-col overflow-hidden rounded-[26px] bg-slate-950 shadow-2xl ring-1 ring-white/10">
      <header className="flex items-center justify-between gap-3 border-b border-white/10 bg-slate-900 px-4 py-3 text-white sm:px-5">
        <div className="min-w-0"><div className="flex items-center gap-2"><span className="inline-flex items-center gap-1.5 rounded-full bg-violet-500/20 px-2.5 py-1 text-[11px] font-black uppercase tracking-[.12em] text-violet-200"><Gamepad2 className="h-3.5 w-3.5"/> Trò chơi luyện tập</span>{previewOnly?<span className="rounded-full bg-amber-400/15 px-2.5 py-1 text-[11px] font-black text-amber-200">Xem thử</span>:null}</div><h2 className="mt-1 truncate text-base font-black sm:text-lg">{review.tieu_de}</h2></div>
        <div className="flex items-center gap-2"><span className="hidden rounded-xl bg-white/10 px-3 py-2 text-xs font-bold sm:inline-flex"><Clock3 className="mr-1.5 h-4 w-4"/>{limitSeconds ? `${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')}` : `${Math.floor(elapsed/60)}:${String(elapsed%60).padStart(2,'0')}`}</span><button type="button" onClick={onClose} className="rounded-full bg-white/10 p-2 hover:bg-white/20"><X className="h-5 w-5"/></button></div>
      </header>
      <div className="relative min-h-0 flex-1 bg-black">
        {!ready && !result ? <div className="pointer-events-none absolute inset-x-0 top-3 z-10 mx-auto w-fit rounded-full bg-slate-900/85 px-4 py-2 text-xs font-bold text-white shadow-lg">Đang khởi động Game Runtime…</div>:null}
        <iframe key={frameKey} ref={iframeRef} title={review.tieu_de} srcDoc={html} sandbox="allow-scripts allow-pointer-lock allow-downloads allow-modals" allow="fullscreen; autoplay" allowFullScreen className="h-full w-full border-0 bg-black" />
        {result ? <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"><div className="w-full max-w-xl rounded-[28px] bg-white p-6 text-center shadow-2xl sm:p-8"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700"><CheckCircle2 className="h-8 w-8"/></div><h3 className="mt-4 text-2xl font-black text-slate-900">{saving?'Đang lưu kết quả…':previewOnly?'Kết quả xem thử':'Đã lưu kết quả trò chơi'}</h3><p className="mt-2 text-sm text-slate-500">{result.message || 'Lượt chơi đã kết thúc.'}</p><div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4"><div className="rounded-2xl bg-indigo-50 p-3"><p className="text-xs font-bold text-slate-500">Điểm học tập</p><p className="mt-1 text-2xl font-black text-indigo-700">{result.score10}/10</p></div><div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs font-bold text-slate-500">Điểm game</p><p className="mt-1 text-2xl font-black">{result.rawScore}</p></div><div className="rounded-2xl bg-emerald-50 p-3"><p className="text-xs font-bold text-slate-500">Đúng/Sai</p><p className="mt-1 text-xl font-black text-emerald-700">{result.correct}/{result.wrong}</p></div><div className="rounded-2xl bg-violet-50 p-3"><p className="text-xs font-bold text-slate-500">Combo</p><p className="mt-1 text-2xl font-black text-violet-700">{result.maxCombo}</p></div></div>{runtimeError?<div className="mt-4 rounded-2xl bg-rose-50 p-3 text-sm font-bold text-rose-700">{runtimeError}</div>:null}<div className="mt-6 flex flex-wrap justify-center gap-2">{canRetry&&!saving?<button type="button" onClick={reset} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-5 py-3 text-sm font-black text-slate-700"><RotateCcw className="h-4 w-4"/> Chơi lại</button>:null}<button type="button" disabled={saving} onClick={onClose} className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-black text-white disabled:bg-slate-300"><ShieldCheck className="h-4 w-4"/> Hoàn thành</button></div></div></div>:null}
      </div>
    </motion.div>
  </div></AnimatePresence>;
}
