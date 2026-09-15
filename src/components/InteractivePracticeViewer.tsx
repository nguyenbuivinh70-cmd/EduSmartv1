import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, RotateCcw, Send, Users, X } from 'lucide-react';
import type { CoLearningSession, InteractivePracticeActivity, InteractivePracticeManifest, ReviewPracticeConfig, ReviewPracticeRow, User } from '../types';
import { formatPracticeDateTime, resolvePracticeConfig } from '../utils/practiceAccess';

interface Props {
  isOpen: boolean;
  review: ReviewPracticeRow | null;
  manifest: InteractivePracticeManifest | null;
  currentUser: User;
  coLearningSession?: CoLearningSession | null;
  allowRetry?: boolean;
  config?: ReviewPracticeConfig;
  initialAttemptCount?: number;
  previewOnly?: boolean;
  onClose: () => void;
  onSubmit: (result: Record<string, unknown>) => Promise<void>;
}

type AnswerMap = Record<string, any>;

function shuffled<T>(items: T[]) {
  return [...items].map((item) => ({ item, sort: Math.random() })).sort((a, b) => a.sort - b.sort).map(({ item }) => item);
}

function answerKey(activityId: string, itemId: string, field: string) { return `${activityId}::${itemId}::${field}`; }

function normalizeImpact(value: string) {
  if (value === 'depends') return 'both';
  return value;
}

function reflectionIsComplete(activity: InteractivePracticeActivity, text: string) {
  const clean = text.trim();
  if (clean.length < 10) return false;
  const minimum = Number(activity.minExamples || 0);
  if (!minimum) return true;
  const segments = clean.split(/\n+|[.;!?]+/).map((item) => item.trim()).filter((item) => item.length >= 4);
  return segments.length >= minimum;
}

function countUnits(activity: InteractivePracticeActivity) {
  if (activity.type === 'sequence') return activity.sequences?.length || 0;
  if (activity.type === 'scenario_reasoning') return activity.scenarios?.length || 0;
  if (activity.type === 'reflection') return 0;
  return activity.items?.length || 0;
}

export default function InteractivePracticeViewer({ isOpen, review, manifest, currentUser, coLearningSession = null, allowRetry = true, config, initialAttemptCount = 0, previewOnly = false, onClose, onSubmit }: Props) {
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [submitted, setSubmitted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [attemptCount, setAttemptCount] = useState(initialAttemptCount);
  const [timedOut, setTimedOut] = useState(false);
  const startedAtRef = useRef('');
  const autoSubmitTriggeredRef = useRef(false);
  const resolvedConfig = useMemo(() => resolvePracticeConfig(review, config), [review, config]);
  const sessionKey = review ? `edusmart.practice.session.v1:${currentUser.user_id}:${review.review_id}` : '';
  const limitSeconds = Math.max(0, Math.round(resolvedConfig.time_limit_minutes * 60));
  const remaining = limitSeconds > 0 ? Math.max(0, limitSeconds - elapsed) : 0;
  const endPassed = resolvedConfig.available_until ? Date.now() > new Date(resolvedConfig.available_until).getTime() : false;
  const showAnswers = submitted && (resolvedConfig.show_answers_mode === 'after_submit' || (resolvedConfig.show_answers_mode === 'after_close' && endPassed));
  const canRetryNow = allowRetry && (resolvedConfig.max_attempts === 0 || attemptCount < resolvedConfig.max_attempts);

  useEffect(() => {
    if (!isOpen || !review) return;
    setAnswers({}); setSubmitted(false); setIsSaving(false); setTimedOut(false); setAttemptCount(initialAttemptCount); autoSubmitTriggeredRef.current = false;
    const now = Date.now();
    let startMs = now;
    if (!previewOnly && sessionKey) {
      try {
        const raw = localStorage.getItem(sessionKey);
        const parsed = raw ? JSON.parse(raw) : null;
        if (parsed?.startedAt && Number(parsed.startedAt) > 0) startMs = Number(parsed.startedAt);
        else localStorage.setItem(sessionKey, JSON.stringify({ startedAt: now }));
      } catch { localStorage.setItem(sessionKey, JSON.stringify({ startedAt: now })); }
    }
    startedAtRef.current = new Date(startMs).toISOString();
    setElapsed(Math.max(0, Math.floor((now - startMs) / 1000)));
  }, [isOpen, review?.review_id, initialAttemptCount, previewOnly, sessionKey]);

  useEffect(() => {
    if (!isOpen || submitted) return;
    const id = window.setInterval(() => {
      const started = startedAtRef.current ? new Date(startedAtRef.current).getTime() : Date.now();
      setElapsed(Math.max(0, Math.floor((Date.now() - started) / 1000)));
    }, 1000);
    return () => window.clearInterval(id);
  }, [isOpen, submitted]);

  const sequenceOptions = useMemo(() => {
    const result: Record<string, string[]> = {};
    manifest?.activities.forEach((activity) => activity.sequences?.forEach((sequence) => { result[`${activity.id}:${sequence.id}`] = shuffled(sequence.steps); }));
    return result;
  }, [manifest, review?.review_id]);

  const result = useMemo(() => {
    if (!manifest) return { score: 0, correctUnits: 0, totalUnits: 0, answeredUnits: 0, reflectionsComplete: true, activityScores: {} as Record<string, number> };
    let correctUnits = 0;
    let totalUnits = 0;
    let answeredUnits = 0;
    const activityScores: Record<string, number> = {};
    let reflectionsComplete = true;
    for (const activity of manifest.activities) {
      if (activity.type === 'reflection') {
        const text = String(answers[answerKey(activity.id, 'reflection', 'text')] || '').trim();
        if (!reflectionIsComplete(activity, text)) reflectionsComplete = false;
        activityScores[activity.id] = 0;
        continue;
      }
      const units = countUnits(activity);
      if (!units) { activityScores[activity.id] = 0; continue; }
      totalUnits += units;
      let earnedRatio = 0;
      if (activity.type === 'classification') {
        for (const item of activity.items || []) {
          const value = answers[answerKey(activity.id, item.id, 'category')];
          if (value) answeredUnits += 1;
          if (value && value === item.correctCategory) { earnedRatio += 1; correctUnits += 1; }
        }
      } else if (activity.type === 'sequence') {
        for (const sequence of activity.sequences || []) {
          const selected = sequence.steps.map((_, index) => answers[answerKey(activity.id, sequence.id, `step${index}`)] || '');
          if (selected.every(Boolean)) answeredUnits += 1;
          const correct = selected.length === sequence.steps.length && selected.every((value, index) => value === sequence.steps[index]);
          if (correct) { earnedRatio += 1; correctUnits += 1; }
        }
      } else if (activity.type === 'categorization') {
        for (const item of activity.items || []) {
          const category = answers[answerKey(activity.id, item.id, 'category')];
          const ability = answers[answerKey(activity.id, item.id, 'ability')];
          const needsAbility = Boolean(item.correctAbility);
          if (category && (!needsAbility || ability)) answeredUnits += 1;
          const categoryCorrect = category === item.correctCategory;
          const abilityCorrect = !needsAbility || ability === item.correctAbility;
          if (categoryCorrect && abilityCorrect) correctUnits += 1;
          earnedRatio += needsAbility ? ((categoryCorrect ? .5 : 0) + (abilityCorrect ? .5 : 0)) : (categoryCorrect ? 1 : 0);
        }
      } else if (activity.type === 'scenario_reasoning') {
        for (const scenario of activity.scenarios || []) {
          const impact = normalizeImpact(String(answers[answerKey(activity.id, scenario.id, 'impact')] || ''));
          const reasonRaw = answers[answerKey(activity.id, scenario.id, 'reason')];
          const reason = reasonRaw === '' || reasonRaw === undefined ? -1 : Number(reasonRaw);
          if (impact && reason >= 0) answeredUnits += 1;
          const impactCorrect = impact === normalizeImpact(String(scenario.correctImpact));
          const allowedReasons = scenario.correctReasonIndices?.length ? scenario.correctReasonIndices : [scenario.correctReasonIndex];
          const reasonCorrect = allowedReasons.includes(reason);
          if (impactCorrect && reasonCorrect) correctUnits += 1;
          earnedRatio += (impactCorrect ? .5 : 0) + (reasonCorrect ? .5 : 0);
        }
      }
      activityScores[activity.id] = Number(((earnedRatio / units) * Number(activity.maxScore || 0)).toFixed(2));
    }
    const earned = Object.values(activityScores).reduce((sum, value) => sum + value, 0);
    const max = manifest.activities.reduce((sum, activity) => sum + Number(activity.maxScore || 0), 0) || Number(manifest.maxScore || 10);
    const score = max ? Number(Math.min(10, (earned / max) * 10).toFixed(1)) : 0;
    return { score, correctUnits, totalUnits, answeredUnits, reflectionsComplete, activityScores };
  }, [answers, manifest]);

  const submit = async (autoSubmitted = false) => {
    if (!review || !manifest || isSaving || submitted) return;
    if (previewOnly) { setSubmitted(true); return; }
    setIsSaving(true);
    const submittedAt = new Date().toISOString();
    const participantUserIds = coLearningSession?.participant_user_ids?.length ? coLearningSession.participant_user_ids : [currentUser.user_id];
    const participantNames = coLearningSession?.participant_names?.length ? coLearningSession.participant_names : [currentUser.ho_ten];
    try {
      await onSubmit({
        review_id: review.review_id,
        diem: result.score,
        so_cau_dung: result.correctUnits,
        tong_so_cau: result.totalUnits,
        answers_json: JSON.stringify({ answers, activity_scores: result.activityScores }),
        started_at: startedAtRef.current || submittedAt,
        submitted_at: submittedAt,
        time_spent_seconds: elapsed,
        auto_submitted: autoSubmitted,
        study_mode: coLearningSession ? 'co_learning' : 'single',
        co_learning_session_id: coLearningSession?.co_learning_session_id || '',
        participant_user_ids: participantUserIds,
        participant_names: participantNames,
      });
      setSubmitted(true);
      setAttemptCount((count) => count + 1);
      if (sessionKey) localStorage.removeItem(sessionKey);
    } finally { setIsSaving(false); }
  };

  useEffect(() => {
    if (!isOpen || previewOnly || submitted || !limitSeconds || remaining > 0 || autoSubmitTriggeredRef.current) return;
    setTimedOut(true);
    if (!resolvedConfig.auto_submit_on_timeout) return;
    autoSubmitTriggeredRef.current = true;
    void submit(true);
  }, [isOpen, previewOnly, submitted, limitSeconds, remaining, resolvedConfig.auto_submit_on_timeout]); // eslint-disable-line react-hooks/exhaustive-deps

  const reset = () => {
    if (!canRetryNow) return;
    const now = Date.now();
    setAnswers({}); setSubmitted(false); setElapsed(0); setTimedOut(false); autoSubmitTriggeredRef.current = false; startedAtRef.current = new Date(now).toISOString();
    if (sessionKey) localStorage.setItem(sessionKey, JSON.stringify({ startedAt: now }));
  };
  const selectClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50';

  return <AnimatePresence>{isOpen && review && manifest ? <div className="fixed inset-0 z-[12500] bg-slate-950/60 p-2 sm:p-3 backdrop-blur-sm">
    <motion.div initial={{ opacity: 0, scale: .98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: .98 }} className="mx-auto flex h-full max-w-7xl flex-col overflow-hidden rounded-[26px] bg-white shadow-[0_30px_90px_rgba(15,23,42,.35)]">
      <header className="flex items-start justify-between gap-4 bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 px-4 py-4 text-white sm:px-6">
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-white/15 px-3 py-1 text-xs font-black uppercase tracking-[.14em]">Luyện tập</span>{coLearningSession ? <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/20 px-3 py-1 text-xs font-black"><Users className="h-3.5 w-3.5" /> {coLearningSession.group_size || coLearningSession.participant_user_ids?.length || 2} học sinh</span> : null}</div><h2 className="mt-2 truncate text-xl font-black sm:text-2xl">{review.tieu_de}</h2><p className="mt-1 text-xs text-white/80 sm:text-sm">{previewOnly ? 'Chế độ xem thử • ' : ''}{manifest.activities.length} hoạt động • Điểm tối đa 10 • {limitSeconds ? `Còn ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}` : `Đã làm ${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`}</p></div>
        <button type="button" onClick={onClose} className="rounded-full bg-white/15 p-2 hover:bg-white/25"><X className="h-5 w-5" /></button>
      </header>
      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_300px]">
        <main className="overflow-y-auto bg-slate-50/70 p-3 sm:p-5">
          {submitted ? <div className="mb-4 rounded-[22px] border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">Đã lưu kết quả luyện tập. Em có thể xem đáp án đúng bên dưới hoặc luyện lại nếu giáo viên cho phép.</div> : null}
          <div className="space-y-5">{manifest.activities.map((activity, activityIndex) => <section key={activity.id} className="rounded-[26px] bg-white p-4 shadow-sm ring-1 ring-slate-100 sm:p-5">
            <div className="mb-4"><p className="text-xs font-black uppercase tracking-[.14em] text-indigo-600">Hoạt động {activityIndex + 1} • {activity.maxScore} điểm</p><h3 className="mt-1 text-lg font-black text-slate-900">{activity.title}</h3>{activity.instructions ? <p className="mt-1 text-sm leading-6 text-slate-500">{activity.instructions}</p> : null}</div>
            {activity.type === 'classification' ? <div className="space-y-3">{(activity.items || []).map((item, index) => { const key=answerKey(activity.id,item.id,'category'); const value=answers[key]||''; return <div key={item.id} className="grid items-center gap-3 rounded-2xl border border-slate-200 p-3 sm:grid-cols-[minmax(0,1fr)_240px]"><div className="flex items-center gap-3"><span className="text-2xl">{item.icon || '🔹'}</span><div><p className="font-bold text-slate-900">{index+1}. {item.label}</p>{showAnswers && item.explanation ? <p className="mt-1 text-xs text-slate-500">{item.explanation}</p>:null}</div></div><select disabled={submitted} className={selectClass} value={value} onChange={(e)=>setAnswers((a)=>({...a,[key]:e.target.value}))}><option value="">Chọn nhóm...</option>{(activity.categories||[]).map((category)=><option key={category.id} value={category.id}>{category.label}</option>)}</select>{showAnswers ? <p className={`sm:col-start-2 text-xs font-bold ${value===item.correctCategory?'text-emerald-600':'text-rose-600'}`}>{value===item.correctCategory?'✓ Chính xác':`Đáp án: ${activity.categories?.find(c=>c.id===item.correctCategory)?.label||item.correctCategory}`}</p>:null}</div>})}</div> : null}
            {activity.type === 'sequence' ? <div className="space-y-4">{(activity.sequences || []).map((sequence) => <div key={sequence.id} className="rounded-2xl border border-slate-200 p-4"><p className="mb-3 font-black text-slate-900">{sequence.title}</p><div className="grid gap-2 md:grid-cols-3">{sequence.steps.map((correctStep,index)=>{const key=answerKey(activity.id,sequence.id,`step${index}`); const value=answers[key]||''; return <label key={key} className="space-y-1"><span className="text-xs font-bold text-slate-500">{index+1}. {index===0?'Thông tin vào':index===1?'Xử lí':'Kết quả ra'}</span><select disabled={submitted} value={value} onChange={(e)=>setAnswers((a)=>({...a,[key]:e.target.value}))} className={selectClass}><option value="">Chọn...</option>{(sequenceOptions[`${activity.id}:${sequence.id}`]||sequence.steps).map((step)=><option key={step} value={step}>{step}</option>)}</select>{showAnswers ? <span className={`block text-[11px] font-bold ${value===correctStep?'text-emerald-600':'text-rose-600'}`}>{value===correctStep?'✓ Đúng':`Đúng: ${correctStep}`}</span>:null}</label>})}</div></div>)}</div> : null}
            {activity.type === 'categorization' ? <div className="space-y-3">{(activity.items||[]).map((item,index)=>{const ck=answerKey(activity.id,item.id,'category'); const ak=answerKey(activity.id,item.id,'ability'); const cv=answers[ck]||''; const av=answers[ak]||''; return <div key={item.id} className="rounded-2xl border border-slate-200 p-4"><p className="mb-3 font-bold text-slate-900">{index+1}. {item.label}</p><div className="grid gap-3 md:grid-cols-2"><label className="space-y-1"><span className="text-xs font-bold text-slate-500">Lĩnh vực</span><select disabled={submitted} className={selectClass} value={cv} onChange={(e)=>setAnswers((a)=>({...a,[ck]:e.target.value}))}><option value="">Chọn lĩnh vực...</option>{(activity.categories||[]).map((category)=><option key={category.id} value={category.id}>{category.label}</option>)}</select></label>{item.correctAbility ? <label className="space-y-1"><span className="text-xs font-bold text-slate-500">Khả năng của máy tính</span><select disabled={submitted} className={selectClass} value={av} onChange={(e)=>setAnswers((a)=>({...a,[ak]:e.target.value}))}><option value="">Chọn khả năng...</option>{(activity.abilities||[]).map((ability)=><option key={ability} value={ability}>{ability}</option>)}</select></label>:null}</div>{showAnswers ? <p className="mt-2 text-xs font-semibold text-slate-500">Đúng: {activity.categories?.find(c=>c.id===item.correctCategory)?.label||item.correctCategory}{item.correctAbility?` • ${item.correctAbility}`:''}</p>:null}</div>})}</div> : null}
            {activity.type === 'scenario_reasoning' ? <div className="space-y-4">{(activity.scenarios||[]).map((scenario,index)=>{const ik=answerKey(activity.id,scenario.id,'impact');const rk=answerKey(activity.id,scenario.id,'reason');const iv=answers[ik]||'';const rv=answers[rk]??''; const allowed=scenario.correctReasonIndices?.length?scenario.correctReasonIndices:[scenario.correctReasonIndex]; return <div key={scenario.id} className="rounded-2xl border border-slate-200 p-4"><p className="font-bold leading-6 text-slate-900">{index+1}. {scenario.prompt}</p><div className="mt-3 grid gap-3 md:grid-cols-2"><label className="space-y-1"><span className="text-xs font-bold text-slate-500">Đánh giá tác động</span><select disabled={submitted} className={selectClass} value={iv} onChange={(e)=>setAnswers((a)=>({...a,[ik]:e.target.value}))}><option value="">Chọn...</option><option value="positive">Tích cực</option><option value="negative">Tiêu cực</option><option value="both">Cả hai / phụ thuộc cách dùng</option></select></label><label className="space-y-1"><span className="text-xs font-bold text-slate-500">Lí do</span><select disabled={submitted} className={selectClass} value={rv} onChange={(e)=>setAnswers((a)=>({...a,[rk]:e.target.value}))}><option value="">Chọn lí do...</option>{scenario.reasons.map((reason,reasonIndex)=><option key={reasonIndex} value={reasonIndex}>{reason}</option>)}</select></label></div>{showAnswers ? <p className="mt-2 text-xs font-semibold text-slate-500">Đáp án: {normalizeImpact(String(scenario.correctImpact))==='positive'?'Tích cực':normalizeImpact(String(scenario.correctImpact))==='negative'?'Tiêu cực':'Cả hai / phụ thuộc cách dùng'} • {allowed.map(i=>scenario.reasons[i]).filter(Boolean).join(' / ')}</p>:null}</div>})}</div> : null}
            {activity.type === 'reflection' ? <div className="space-y-2"><textarea disabled={submitted} className="min-h-32 w-full rounded-2xl border border-slate-200 p-4 text-sm outline-none focus:border-indigo-400" placeholder={activity.placeholder||'Nhập suy nghĩ của em...'} value={answers[answerKey(activity.id,'reflection','text')]||''} onChange={(e)=>setAnswers((a)=>({...a,[answerKey(activity.id,'reflection','text')]:e.target.value}))} /><p className="text-xs font-semibold text-slate-400">Nội dung suy ngẫm không tính điểm nhưng cần hoàn thành trước khi nộp bài{activity.minExamples ? ` • yêu cầu ít nhất ${activity.minExamples} ý/ví dụ` : ''}.</p></div> : null}
          </section>)}</div>
        </main>
        <aside className="overflow-y-auto border-l border-slate-100 bg-white p-4 sm:p-5"><div className="rounded-[24px] bg-slate-50 p-5 text-center ring-1 ring-slate-100"><p className="text-sm font-black text-slate-900">Kết quả luyện tập</p><p className="mt-3 text-4xl font-black text-indigo-700">{submitted?`${result.score}/10`:`${result.answeredUnits}/${result.totalUnits}`}</p><p className="mt-1 text-xs font-bold text-slate-500">{submitted?`Hoàn thành đúng ${result.correctUnits}/${result.totalUnits} mục`:'Mục đã trả lời'}</p></div>{coLearningSession ? <div className="mt-4 rounded-[22px] bg-emerald-50 p-4 text-sm text-emerald-800"><p className="font-black">Luyện tập cùng</p><p className="mt-1 leading-6">{(coLearningSession.participant_names||[]).join(' • ') || 'Nhóm học đã xác nhận'}</p></div>:null}<div className="mt-4 rounded-[20px] bg-indigo-50 p-4 text-xs font-semibold leading-5 text-indigo-900"><p><b>Điểm đạt:</b> {resolvedConfig.pass_score}/10</p><p><b>Lượt:</b> {attemptCount}/{resolvedConfig.max_attempts || '∞'}</p>{limitSeconds?<p><b>Thời gian:</b> {resolvedConfig.time_limit_minutes} phút</p>:null}{resolvedConfig.available_until?<p><b>Đóng:</b> {formatPracticeDateTime(resolvedConfig.available_until)}</p>:null}</div>{timedOut&&!submitted&&!resolvedConfig.auto_submit_on_timeout?<div className="mt-3 rounded-2xl bg-rose-50 p-3 text-xs font-bold text-rose-700">Đã hết thời gian. Giáo viên không bật tự nộp nên lượt này không thể tiếp tục.</div>:null}<div className="mt-4 space-y-2">{!submitted?<button type="button" disabled={isSaving || timedOut || result.answeredUnits < result.totalUnits || !result.reflectionsComplete} onClick={()=>void submit(false)} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-emerald-200 disabled:bg-slate-300 disabled:shadow-none"><Send className="h-4 w-4" /> {isSaving?'Đang lưu...':'Nộp bài luyện tập'}</button>:null}{submitted&&canRetryNow?<button type="button" onClick={reset} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-700"><RotateCcw className="h-4 w-4" /> Luyện lại</button>:null}{submitted?<button type="button" onClick={onClose} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-black text-white"><CheckCircle2 className="h-4 w-4" /> Hoàn thành</button>:null}</div></aside>
      </div>
    </motion.div>
  </div>:null}</AnimatePresence>;
}
