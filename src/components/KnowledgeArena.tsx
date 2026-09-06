import { useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import {
  ArrowLeft,
  Award,
  BookOpen,
  Brain,
  BarChart3,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Flame,
  Eye,
  Lock,
  MoreHorizontal,
  Pencil,
  PlayCircle,
  Rocket,
  ShieldHalf,
  SkipForward,
  Sparkles,
  Star,
  Trophy,
  Unlock,
  XCircle,
  Zap,
} from 'lucide-react';
import type { Account, Lesson, LessonContent, QuizQuestion, StudentLearningAnalyticsRow } from '../types';
import { getVietnameseLevelLabel } from '../services/gemini';
import { getLessonName, getLessonNumber } from '../utils/lessonCatalog';
import { getLessonVisualCatalog } from '../utils/lessonVisualCatalog';

interface KnowledgeArenaProps {
  lessons: Lesson[];
  selectedLesson: Lesson | null;
  selectedContent: LessonContent | null;
  isLoadingLesson?: boolean;
  analyticsRows?: StudentLearningAnalyticsRow[];
  students?: Account[];
  canViewStats?: boolean;
  canManageLesson?: (lesson: Lesson) => boolean;
  lockUpdatingId?: string;
  onToggleLessonLock?: (lesson: Lesson) => void;
  onEditLesson?: (lesson: Lesson) => void;
  onSelectLesson: (lesson: Lesson) => void;
  onClearSelection: () => void;
}

type ArenaMode = 'million' | 'peak' | 'speed';
type PreparedQuestion = QuizQuestion & { id: string; options: string[]; correctAnswersNormalized: string[] };

type FeedbackTone = 'success' | 'error' | 'neutral';

interface RoundFeedback {
  tone: FeedbackTone;
  title: string;
  description: string;
  scoreText?: string;
}

interface GameResult {
  score: number;
  total: number;
  correct: number;
  wrong: number;
  message: string;
  mode: ArenaMode;
}

const MODE_META: Record<
  ArenaMode,
  { title: string; subtitle: string; icon: ReactElement; gradient: string; accent: string; stats: string[] }
> = {
  million: {
    title: 'Thử thách triệu điểm',
    subtitle: 'Đi theo thang điểm tăng dần, dùng quyền trợ giúp đúng lúc để chạm mốc cao nhất.',
    icon: <Trophy className="h-5 w-5" />,
    gradient: 'from-amber-500 via-orange-500 to-fuchsia-500',
    accent: 'text-amber-700 bg-amber-50 border-amber-200',
    stats: ['10 mốc điểm', '2 quyền trợ giúp', 'Càng về sau càng khó'],
  },
  peak: {
    title: 'Chinh phục đỉnh cao',
    subtitle: 'Nhiều vòng thi nối tiếp, điểm thưởng tăng dần và nhịp độ chơi ngày càng hấp dẫn.',
    icon: <Rocket className="h-5 w-5" />,
    gradient: 'from-sky-500 via-indigo-500 to-violet-500',
    accent: 'text-indigo-700 bg-indigo-50 border-indigo-200',
    stats: ['4 vòng thi', 'Nhiều dạng câu hỏi', 'Điểm thưởng tăng theo chặng'],
  },
  speed: {
    title: 'Tăng tốc tri thức',
    subtitle: 'Chạy đua với thời gian, trả lời thật nhanh và chính xác để bứt phá điểm số.',
    icon: <Zap className="h-5 w-5" />,
    gradient: 'from-emerald-500 via-teal-500 to-cyan-500',
    accent: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    stats: ['75 giây', 'Đúng +10 điểm', 'Sai -2 điểm'],
  },
};

function formatArenaDate(value?: string) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw.split('T')[0] || raw;
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

function getArenaReadiness(lesson: Lesson) {
  const count = Number.isFinite(Number(lesson.arena_question_count)) ? Math.max(0, Number(lesson.arena_question_count)) : null;
  const ready = lesson.arena_ready === true || (count !== null && count > 0);
  const known = lesson.arena_ready !== undefined || count !== null;
  return { count, ready, known };
}

function normalizeText(value?: string) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function extractOptionKey(value?: string) {
  const match = String(value || '').trim().match(/^([A-D])\s*[.)-]?/i);
  return match ? match[1].toUpperCase() : '';
}

function normalizeCorrectAnswers(question: QuizQuestion) {
  if (question.type === 'fill_in_blank') {
    return (question.correctAnswers || []).map((item) => normalizeText(item));
  }
  const answer = question.correctAnswer || question.correctAnswers?.[0] || '';
  return [normalizeText(answer), extractOptionKey(answer)].filter(Boolean);
}

function prepareQuestions(content: LessonContent | null) {
  if (!content) return [] as PreparedQuestion[];
  return (content.luyen_tap?.trac_nghiem || [])
    .map((question, index) => {
      const type = question.type || 'single_choice';
      const options =
        type === 'fill_in_blank'
          ? (question.choices || question.options || []).filter(Boolean)
          : type === 'true_false'
            ? ['Đúng', 'Sai']
            : (question.options || []).filter(Boolean);
      return {
        ...question,
        id: question.id || `Q${index + 1}`,
        type,
        options,
        correctAnswersNormalized: normalizeCorrectAnswers(question),
      } as PreparedQuestion;
    })
    .filter((item) => item.options.length >= 2 || item.type === 'fill_in_blank');
}

function shuffle<T>(items: T[]) {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function isQuestionCorrect(question: PreparedQuestion, answer: string | string[]) {
  if (question.type === 'fill_in_blank') {
    const actual = Array.isArray(answer) ? answer.map((item) => normalizeText(item)) : [];
    return (
      question.correctAnswersNormalized.length === actual.length &&
      question.correctAnswersNormalized.every((item, idx) => item === actual[idx])
    );
  }
  const actual = Array.isArray(answer) ? answer[0] : answer;
  const normalized = normalizeText(actual);
  const optionKey = extractOptionKey(actual);
  return question.correctAnswersNormalized.includes(normalized) || (optionKey && question.correctAnswersNormalized.includes(optionKey));
}

function sentenceParts(sentence: string, blankCount: number) {
  const normalized = String(sentence || '')
    .replace(/\[\s*\.\.\.\s*\]/g, '_____')
    .replace(/_{2,}/g, '_____');
  const parts = normalized.split(/_{3,}/g);
  while (parts.length < blankCount + 1) parts.push('');
  return parts;
}

function feedbackStyles(tone: FeedbackTone) {
  if (tone === 'success') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (tone === 'error') return 'border-rose-200 bg-rose-50 text-rose-700';
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

interface ArenaLessonStats {
  targetStudents: number;
  participants: number;
  completed: number;
  avgScore: number | null;
  questionTotal: number;
  needsSupport: Array<{ user_id: string; ho_ten: string; reason: string }>;
  ranking: Array<{ user_id: string; ho_ten: string; score: number | null; completion: number; status: string }>;
  lastUpdated?: string;
}

function sameValue(left?: string, right?: string) {
  return String(left || '').trim() === String(right || '').trim();
}

function averageNumber(values: number[]) {
  if (!values.length) return null;
  return values.reduce((total, item) => total + item, 0) / values.length;
}

function formatPercent(value: number | null) {
  return value === null || !Number.isFinite(value) ? '-' : `${Math.round(value)}%`;
}

function formatScore(value: number | null) {
  return value === null || !Number.isFinite(value) ? '-' : `${Math.round(value * 10) / 10}`;
}

function getTargetStudentsForLesson(lesson: Lesson, students: Account[]) {
  return students.filter((student) => {
    if (student.vai_tro !== 'student') return false;
    if (lesson.khoi && student.khoi && !sameValue(student.khoi, lesson.khoi)) return false;
    if (lesson.lop_id && student.lop_id && !sameValue(student.lop_id, lesson.lop_id)) return false;
    if (lesson.nam_hoc && student.nam_hoc && !sameValue(student.nam_hoc, lesson.nam_hoc)) return false;
    return true;
  });
}

function latestRowsByUser(rows: StudentLearningAnalyticsRow[]) {
  const map = new Map<string, StudentLearningAnalyticsRow>();
  rows.forEach((row) => {
    const existing = map.get(row.user_id);
    if (!existing || Number(row.updated_at_ts || 0) >= Number(existing.updated_at_ts || 0)) {
      map.set(row.user_id, row);
    }
  });
  return map;
}

function computeArenaLessonStats(
  lesson: Lesson,
  analyticsRows: StudentLearningAnalyticsRow[] = [],
  students: Account[] = [],
  questionCount = 0,
): ArenaLessonStats {
  const lessonRows = analyticsRows.filter((row) => row.lesson_id === lesson.lesson_id);
  const latestMap = latestRowsByUser(lessonRows);
  const latestRows = Array.from(latestMap.values());
  const targetStudents = getTargetStudentsForLesson(lesson, students);
  const scoreValues = latestRows
    .filter((row) => Number(row.quiz_total || 0) > 0 && Number.isFinite(Number(row.quiz_percent)))
    .map((row) => Number(row.quiz_percent || 0));
  const avgScore = averageNumber(scoreValues);
  const completed = latestRows.filter((row) => row.status === 'completed' || Number(row.completion_percent || 0) >= 100).length;
  const questionTotal = Math.max(
    questionCount,
    ...latestRows.map((row) => Math.max(0, Math.round(Number(row.quiz_total || 0)))),
  );
  const needsSupport = targetStudents
    .filter((student) => {
      const row = latestMap.get(student.user_id);
      if (!row) return true;
      if (row.status !== 'completed' && Number(row.completion_percent || 0) < 100) return true;
      if (Number(row.quiz_total || 0) > 0 && Number(row.quiz_percent || 0) < 50) return true;
      return false;
    })
    .slice(0, 5)
    .map((student) => {
      const row = latestMap.get(student.user_id);
      let reason = 'Chưa tham gia';
      if (row && row.status !== 'completed') reason = `Đang học ${Math.round(Number(row.completion_percent || 0))}%`;
      if (row && Number(row.quiz_total || 0) > 0 && Number(row.quiz_percent || 0) < 50) reason = `Điểm thấp ${Math.round(Number(row.quiz_percent || 0))}%`;
      return { user_id: student.user_id, ho_ten: student.ho_ten || student.user_id, reason };
    });

  const ranking = latestRows
    .filter((row) => Number(row.completion_percent || 0) > 0 || Number(row.quiz_total || 0) > 0)
    .map((row) => ({
      user_id: row.user_id,
      ho_ten: row.ho_ten || row.user_id,
      score: Number(row.quiz_total || 0) > 0 && Number.isFinite(Number(row.quiz_percent)) ? Number(row.quiz_percent || 0) : null,
      completion: Math.round(Number(row.completion_percent || 0)),
      status: row.status === 'completed' ? 'Hoàn thành' : 'Đang học',
    }))
    .sort((a, b) => Number(b.score ?? -1) - Number(a.score ?? -1) || b.completion - a.completion || a.ho_ten.localeCompare(b.ho_ten, 'vi'))
    .slice(0, 5);

  const lastUpdated = latestRows
    .slice()
    .sort((a, b) => Number(b.updated_at_ts || 0) - Number(a.updated_at_ts || 0))[0]?.updated_at_display;

  return {
    targetStudents: targetStudents.length || latestMap.size,
    participants: latestMap.size,
    completed,
    avgScore,
    questionTotal,
    needsSupport,
    ranking,
    lastUpdated,
  };
}

function KnowledgeArenaStatsPanel({ lesson, stats, compact = false }: { lesson?: Lesson; stats: ArenaLessonStats; compact?: boolean }) {
  const completionRate = stats.targetStudents > 0 ? (stats.completed / stats.targetStudents) * 100 : null;
  const participationRate = stats.targetStudents > 0 ? (stats.participants / stats.targetStudents) * 100 : null;
  const cards = [
    { label: 'Học sinh', value: stats.targetStudents || '-', hint: 'thuộc phạm vi bài học', tone: 'text-indigo-700 bg-indigo-50' },
    { label: 'Tham gia', value: stats.participants, hint: formatPercent(participationRate), tone: 'text-sky-700 bg-sky-50' },
    { label: 'Hoàn thành', value: stats.completed, hint: formatPercent(completionRate), tone: 'text-emerald-700 bg-emerald-50' },
    { label: 'TB đúng', value: formatScore(stats.avgScore), hint: stats.questionTotal ? `${stats.questionTotal} câu hỏi` : 'chưa có câu hỏi', tone: 'text-amber-700 bg-amber-50' },
  ];

  return (
    <div className={`rounded-[28px] bg-white shadow-sm ring-1 ring-slate-100 ${compact ? 'p-4' : 'p-5'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full bg-orange-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-orange-700">
            <Award className="h-4 w-4" /> Thống kê theo bài
          </p>
          <h3 className="mt-3 text-lg font-bold text-slate-900">{lesson?.tieu_de || 'Tổng hợp bài học'}</h3>
          <p className="mt-1 text-sm text-slate-500">
            Tối giản dữ liệu tham gia, hoàn thành và điểm luyện tập để giáo viên nắm nhanh chất lượng ôn tập.
          </p>
        </div>
        {stats.lastUpdated ? <span className="rounded-full bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500">Cập nhật: {stats.lastUpdated}</span> : null}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className={`rounded-2xl px-4 py-3 ${card.tone}`}>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] opacity-70">{card.label}</p>
            <p className="mt-2 text-2xl font-extrabold">{card.value}</p>
            <p className="mt-1 text-xs font-semibold opacity-75">{card.hint}</p>
          </div>
        ))}
      </div>

      {!compact && (stats.ranking.length > 0 || stats.needsSupport.length > 0) ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
            <p className="text-sm font-bold text-emerald-700">Xếp hạng nhanh</p>
            {stats.ranking.length > 0 ? (
              <div className="mt-3 space-y-2">
                {stats.ranking.map((item, index) => (
                  <div key={item.user_id} className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 text-sm ring-1 ring-emerald-100">
                    <div className="min-w-0">
                      <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-xs font-extrabold text-emerald-700">{index + 1}</span>
                      <span className="font-semibold text-slate-800">{item.ho_ten}</span>
                    </div>
                    <span className="text-xs font-bold text-emerald-700">{item.score === null ? `${item.completion}%` : `${formatScore(item.score)}%`}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 rounded-xl bg-white px-3 py-2 text-sm text-slate-500 ring-1 ring-emerald-100">Chưa có dữ liệu tham gia để xếp hạng.</p>
            )}
          </div>

          <div className="rounded-2xl border border-rose-100 bg-rose-50/70 p-4">
            <p className="text-sm font-bold text-rose-700">Học sinh cần hỗ trợ</p>
            {stats.needsSupport.length > 0 ? (
              <div className="mt-3 space-y-2">
                {stats.needsSupport.map((item) => (
                  <div key={item.user_id} className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 text-sm ring-1 ring-rose-100">
                    <span className="font-semibold text-slate-800">{item.ho_ten}</span>
                    <span className="text-xs font-semibold text-rose-600">{item.reason}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 rounded-xl bg-white px-3 py-2 text-sm text-slate-500 ring-1 ring-rose-100">Không có học sinh cần hỗ trợ nổi bật.</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function KnowledgeArenaLessonStatsList({
  lessons,
  analyticsRows,
  students,
}: {
  lessons: Lesson[];
  analyticsRows: StudentLearningAnalyticsRow[];
  students: Account[];
}) {
  const items = lessons
    .map((lesson) => ({ lesson, stats: computeArenaLessonStats(lesson, analyticsRows, students) }))
    .sort((a, b) => b.stats.participants - a.stats.participants || String(a.lesson.tieu_de).localeCompare(String(b.lesson.tieu_de), 'vi'))
    .slice(0, 6);

  if (!items.length) return null;

  return (
    <div className="rounded-[28px] bg-white p-5 shadow-sm ring-1 ring-slate-100">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-amber-700">
            <Trophy className="h-4 w-4" /> Thống kê tối giản theo bài
          </p>
          <h2 className="mt-3 text-xl font-bold text-slate-900">Tổng quan đấu trường tri thức</h2>
        </div>
        <p className="text-sm text-slate-500">Sắp xếp theo số học sinh đã tham gia.</p>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {items.map(({ lesson, stats }) => (
          <div key={lesson.lesson_id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 px-4 py-3">
            <div className="min-w-0">
              <p className="line-clamp-1 font-bold text-slate-900">{lesson.tieu_de}</p>
              <p className="mt-1 text-xs text-slate-500">{lesson.mon_hoc} • Khối {lesson.khoi}{lesson.lop ? ` • ${lesson.lop}` : ''}</p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-bold">
              <span className="rounded-full bg-sky-50 px-3 py-1 text-sky-700">Tham gia {stats.participants}/{stats.targetStudents || 0}</span>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">Xong {stats.completed}</span>
              <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-700">TB {formatScore(stats.avgScore)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function GameTransitionOverlay({ meta, countdown }: { meta: (typeof MODE_META)[ArenaMode]; countdown: number | null }) {
  if (countdown === null) return null;
  return (
    <div className="rounded-[32px] border border-white/60 bg-white/90 p-10 text-center shadow-[0_28px_70px_rgba(15,23,42,0.14)] backdrop-blur-sm">
      <div className={`mx-auto inline-flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-r ${meta.gradient} text-white shadow-lg`}>
        {meta.icon}
      </div>
      <p className="mt-5 text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Chuẩn bị vào trận</p>
      <h3 className="mt-2 text-3xl font-bold text-slate-900">{meta.title}</h3>
      <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-slate-500">{meta.subtitle}</p>
      <div className="mt-8 flex items-center justify-center gap-4">
        {countdown > 0 ? (
          <div className={`flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-r ${meta.gradient} text-4xl font-extrabold text-white shadow-[0_18px_40px_rgba(79,70,229,0.28)] animate-pulse`}>
            {countdown}
          </div>
        ) : (
          <div className="rounded-full bg-emerald-50 px-6 py-3 text-lg font-bold text-emerald-700 ring-1 ring-emerald-200">Bắt đầu!</div>
        )}
      </div>
      <div className="mt-8 flex flex-wrap justify-center gap-3 text-sm text-slate-500">
        {meta.stats.map((item) => (
          <span key={item} className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 font-semibold">
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function ResultCard({ result, onReplay, onBack }: { result: GameResult; onReplay: () => void; onBack: () => void }) {
  const meta = MODE_META[result.mode];
  return (
    <div className="rounded-[30px] bg-white p-8 shadow-sm ring-1 ring-slate-100">
      <div className={`rounded-[28px] bg-gradient-to-r ${meta.gradient} p-6 text-white`}>
        <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">
          {meta.icon} Kết thúc trò chơi
        </div>
        <h3 className="mt-3 text-2xl font-bold">{meta.title}</h3>
        <p className="mt-2 text-sm text-white/90">{result.message}</p>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-4">
        {[
          { label: 'Điểm số', value: result.score },
          { label: 'Tổng câu', value: result.total },
          { label: 'Câu đúng', value: result.correct },
          { label: 'Câu sai', value: result.wrong },
        ].map((item) => (
          <div key={item.label} className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{item.label}</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          onClick={onReplay}
          className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20"
        >
          <PlayCircle className="h-4 w-4" /> Chơi lại
        </button>
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700"
        >
          <ArrowLeft className="h-4 w-4" /> Chọn trò khác
        </button>
      </div>
    </div>
  );
}

function GameQuestionCard({
  question,
  index,
  total,
  onSubmit,
  disabledOptions,
  helper,
  statusBanner,
  isLocked = false,
}: {
  question: PreparedQuestion;
  index: number;
  total: number;
  onSubmit: (answer: string | string[]) => void;
  disabledOptions?: string[];
  helper?: ReactNode;
  statusBanner?: ReactNode;
  isLocked?: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [fillSelections, setFillSelections] = useState<string[]>(() => (question.correctAnswers || []).map(() => ''));
  const [activeBlankIndex, setActiveBlankIndex] = useState(0);

  useEffect(() => {
    setSelected(null);
    setFillSelections((question.correctAnswers || []).map(() => ''));
    setActiveBlankIndex(0);
  }, [question.id]);

  const submitFill = () => {
    if (!fillSelections.every((item) => item.trim()) || isLocked) return;
    onSubmit(fillSelections);
  };

  const handleChoiceFill = (choice: string) => {
    if (isLocked) return;
    const next = [...fillSelections];
    next[activeBlankIndex] = choice;
    setFillSelections(next);
    const nextBlank = next.findIndex((item) => !item.trim());
    if (nextBlank >= 0) setActiveBlankIndex(nextBlank);
  };

  return (
    <div className="rounded-[30px] border border-slate-100 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-indigo-600">
            Câu {index + 1}/{total}
          </div>
          <h3 className="mt-3 text-xl font-bold leading-8 text-slate-900">{question.question}</h3>
        </div>
        <div className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">{getVietnameseLevelLabel(question.level)}</div>
      </div>

      {question.type === 'fill_in_blank' ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm leading-8 text-slate-800">
            {sentenceParts(question.sentence || question.question, (question.correctAnswers || []).length).map((part, partIndex) => (
              <span key={`${question.id}-${partIndex}`}>
                {part}
                {partIndex < (question.correctAnswers || []).length ? (
                  <button
                    type="button"
                    onClick={() => setActiveBlankIndex(partIndex)}
                    disabled={isLocked}
                    className={`mx-2 inline-flex min-w-[140px] items-center justify-center rounded-2xl border px-4 py-2 text-sm font-semibold transition ${fillSelections[partIndex] ? 'border-indigo-200 bg-white text-indigo-700' : 'border-dashed border-indigo-300 bg-indigo-50 text-indigo-500'} ${activeBlankIndex === partIndex ? 'ring-2 ring-indigo-200' : ''} ${isLocked ? 'cursor-not-allowed opacity-75' : ''}`}
                  >
                    {fillSelections[partIndex] || `Ô trống ${partIndex + 1}`}
                  </button>
                ) : null}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            {question.options.map((choice) => (
              <button
                key={choice}
                type="button"
                onClick={() => handleChoiceFill(choice)}
                disabled={isLocked}
                className={`rounded-2xl border px-4 py-2 text-sm font-semibold transition ${fillSelections.includes(choice) ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-200 hover:bg-indigo-50/60'} ${isLocked ? 'cursor-not-allowed opacity-75' : ''}`}
              >
                {choice}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={submitFill}
              disabled={isLocked}
              className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <CheckCircle2 className="h-4 w-4" /> Khóa đáp án
            </button>
            <button
              onClick={() => {
                if (isLocked) return;
                setFillSelections((question.correctAnswers || []).map(() => ''));
                setActiveBlankIndex(0);
              }}
              disabled={isLocked}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Làm lại
            </button>
          </div>
        </div>
      ) : (
        <div className="grid gap-3">
          {question.options.map((option) => {
            const hidden = disabledOptions?.length ? disabledOptions.includes(option) : false;
            if (hidden) return null;
            const chosen = selected === option;
            return (
              <button
                key={option}
                type="button"
                onClick={() => {
                  if (isLocked) return;
                  setSelected(option);
                  onSubmit(option);
                }}
                disabled={isLocked}
                className={`rounded-2xl border px-4 py-3 text-left text-sm font-medium transition ${chosen ? 'border-indigo-300 bg-indigo-50 text-indigo-800' : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-indigo-200 hover:bg-indigo-50/60'} ${isLocked ? 'cursor-not-allowed opacity-75' : ''}`}
              >
                {option}
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-5 space-y-3">
        {helper ? <div>{helper}</div> : null}
        {statusBanner ? <div>{statusBanner}</div> : null}
      </div>
    </div>
  );
}

function GameArenaHeader({
  lesson,
  mode,
  questions,
  onBack,
  onResetMode,
}: {
  lesson: Lesson;
  mode: ArenaMode;
  questions: PreparedQuestion[];
  onBack: () => void;
  onResetMode: () => void;
}) {
  const meta = MODE_META[mode];
  return (
    <div className={`overflow-hidden rounded-[24px] bg-gradient-to-r ${meta.gradient} px-5 py-4 text-white shadow-[0_14px_34px_rgba(79,70,229,0.22)]`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em]">
              {meta.icon} Đang thi đấu
            </span>
            <span className="truncate text-xs font-semibold text-white/85">{lesson.tieu_de}</span>
          </div>
          <h2 className="mt-2 text-xl font-black leading-tight sm:text-2xl">{meta.title}</h2>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-semibold text-white/90">
            <span className="rounded-full bg-white/12 px-2.5 py-1">{lesson.mon_hoc}</span>
            <span className="rounded-full bg-white/12 px-2.5 py-1">Khối {lesson.khoi}</span>
            <span className="rounded-full bg-white/12 px-2.5 py-1">{questions.length} câu hỏi</span>
            {meta.stats.map((item) => <span key={item} className="rounded-full bg-white/12 px-2.5 py-1">{item}</span>)}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            onClick={onResetMode}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-xs font-bold text-white backdrop-blur hover:bg-white/15"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Đổi trò chơi
          </button>
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-xs font-bold text-slate-800"
          >
            <BookOpen className="h-3.5 w-3.5" /> Đổi bài học
          </button>
        </div>
      </div>
    </div>
  );
}

function MillionGame({ questions, onBack }: { questions: PreparedQuestion[]; onBack: () => void }) {
  const [questionSet, setQuestionSet] = useState(() => shuffle(questions).slice(0, Math.min(10, questions.length)));
  const [currentIndex, setCurrentIndex] = useState(0);
  const [usedFifty, setUsedFifty] = useState(false);
  const [usedSkip, setUsedSkip] = useState(false);
  const [fiftyHidden, setFiftyHidden] = useState<string[]>([]);
  const [result, setResult] = useState<GameResult | null>(null);
  const [currentScore, setCurrentScore] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [feedback, setFeedback] = useState<RoundFeedback | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const ladder = [100, 200, 400, 600, 1000, 1500, 2000, 3000, 5000, 8000];

  const currentQuestion = questionSet[currentIndex];

  const handleAnswer = (answer: string | string[]) => {
    if (!currentQuestion || isLocked) return;
    const correct = isQuestionCorrect(currentQuestion, answer);
    setIsLocked(true);
    if (correct) {
      const nextCorrect = correctCount + 1;
      const nextScore = ladder[Math.min(currentIndex, ladder.length - 1)] || currentScore;
      setFeedback({
        tone: 'success',
        title: 'Chính xác!',
        description: currentQuestion.explanation || 'Em đã vượt qua mốc điểm hiện tại một cách xuất sắc.',
        scoreText: `+${nextScore - currentScore || nextScore} điểm`,
      });
      window.setTimeout(() => {
        setCorrectCount(nextCorrect);
        setCurrentScore(nextScore);
        setFeedback(null);
        setIsLocked(false);
        if (currentIndex === questionSet.length - 1) {
          setResult({
            mode: 'million',
            score: nextScore,
            total: questionSet.length,
            correct: nextCorrect,
            wrong: questionSet.length - nextCorrect,
            message: 'Em đã vượt qua toàn bộ chặng hỏi đáp và chạm tới mốc điểm cao nhất!',
          });
          return;
        }
        setCurrentIndex((prev) => prev + 1);
        setFiftyHidden([]);
      }, 950);
      return;
    }

    setFeedback({
      tone: 'error',
      title: 'Chưa chính xác',
      description: currentQuestion.explanation || 'Hãy xem lại gợi ý và thử thách lại ở lượt sau nhé.',
    });
    window.setTimeout(() => {
      setResult({
        mode: 'million',
        score: currentScore,
        total: questionSet.length,
        correct: correctCount,
        wrong: questionSet.length - correctCount,
        message: 'Em đã dừng lại ở chặng hiện tại. Hãy xem lại lời giải rồi thử lại để tiến xa hơn nhé.',
      });
      setFeedback(null);
      setIsLocked(false);
    }, 1100);
  };

  const useFifty = () => {
    if (usedFifty || !currentQuestion || currentQuestion.type === 'fill_in_blank' || isLocked) return;
    const wrongOptions = currentQuestion.options.filter((option) => !isQuestionCorrect(currentQuestion, option));
    setFiftyHidden(shuffle(wrongOptions).slice(0, Math.max(0, wrongOptions.length - 1)));
    setUsedFifty(true);
  };

  const useSkip = () => {
    if (usedSkip || isLocked) return;
    if (currentIndex === questionSet.length - 1) {
      setResult({
        mode: 'million',
        score: currentScore,
        total: questionSet.length,
        correct: correctCount,
        wrong: questionSet.length - correctCount,
        message: 'Em đã dùng quyền đổi câu ở chặng cuối. Hãy chơi lại để chinh phục trọn vẹn thang điểm.',
      });
      return;
    }
    setUsedSkip(true);
    setCurrentIndex((prev) => prev + 1);
    setFiftyHidden([]);
  };

  if (!currentQuestion) {
    return (
      <div className="rounded-[28px] bg-white p-8 text-slate-500 shadow-sm ring-1 ring-slate-100">
        Bài học này chưa có đủ câu hỏi để mở trò chơi.
      </div>
    );
  }

  if (result) {
    return (
      <ResultCard
        result={result}
        onReplay={() => {
          setQuestionSet(shuffle(questions).slice(0, Math.min(10, questions.length)));
          setCurrentIndex(0);
          setUsedFifty(false);
          setUsedSkip(false);
          setFiftyHidden([]);
          setCurrentScore(0);
          setCorrectCount(0);
          setFeedback(null);
          setIsLocked(false);
          setResult(null);
        }}
        onBack={onBack}
      />
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <GameQuestionCard
        question={currentQuestion}
        index={currentIndex}
        total={questionSet.length}
        onSubmit={handleAnswer}
        disabledOptions={fiftyHidden}
        isLocked={isLocked}
        helper={
          <div className="flex flex-wrap gap-3">
            <button
              onClick={useFifty}
              disabled={usedFifty || currentQuestion.type === 'fill_in_blank' || isLocked}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <ShieldHalf className="h-4 w-4" /> 50 : 50
            </button>
            <button
              onClick={useSkip}
              disabled={usedSkip || isLocked}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <SkipForward className="h-4 w-4" /> Đổi câu
            </button>
            <div className="inline-flex items-center gap-2 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-medium text-slate-600">
              <Sparkles className="h-4 w-4 text-amber-500" /> Điểm hiện tại: <span className="font-semibold text-slate-900">{currentScore}</span>
            </div>
          </div>
        }
        statusBanner={
          feedback ? (
            <div className={`rounded-2xl border px-4 py-3 text-sm ${feedbackStyles(feedback.tone)}`}>
              <p className="font-semibold">{feedback.title}{feedback.scoreText ? ` • ${feedback.scoreText}` : ''}</p>
              <p className="mt-1 leading-6">{feedback.description}</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Từng mốc câu hỏi tương ứng với một nấc thang điểm. Hãy dùng trợ giúp thật hợp lý.
            </div>
          )
        }
      />

      <div className="rounded-[28px] bg-white p-5 shadow-sm ring-1 ring-slate-100">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-500">Thang điểm</p>
        <div className="mt-4 space-y-2">
          {[...ladder].reverse().map((value, reverseIndex) => {
            const originalIndex = ladder.length - 1 - reverseIndex;
            const active = originalIndex === currentIndex;
            const done = originalIndex < currentIndex;
            return (
              <div
                key={value}
                className={`flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-semibold transition ${active ? 'bg-amber-100 text-amber-900 ring-2 ring-amber-200 animate-pulse' : done ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 text-slate-600'}`}
              >
                <span>Câu {originalIndex + 1}</span>
                <span>{value.toLocaleString('vi-VN')} điểm</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PeakGame({ questions, onBack }: { questions: PreparedQuestion[]; onBack: () => void }) {
  const [questionSet, setQuestionSet] = useState(() => shuffle(questions).slice(0, Math.min(8, questions.length)));
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [result, setResult] = useState<GameResult | null>(null);
  const [feedback, setFeedback] = useState<RoundFeedback | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const stages = [
    { title: 'Khởi động', points: 10, icon: <Flame className="h-4 w-4" /> },
    { title: 'Vượt chướng ngại', points: 15, icon: <ShieldHalf className="h-4 w-4" /> },
    { title: 'Tăng tốc', points: 20, icon: <Zap className="h-4 w-4" /> },
    { title: 'Về đích', points: 30, icon: <Award className="h-4 w-4" /> },
  ];

  const currentQuestion = questionSet[currentIndex];
  const stage = stages[Math.min(stages.length - 1, Math.floor((currentIndex / Math.max(1, questionSet.length)) * stages.length))];

  const handleAnswer = (answer: string | string[]) => {
    if (!currentQuestion || isLocked) return;
    const isCorrect = isQuestionCorrect(currentQuestion, answer);
    const earned = isCorrect ? stage.points : 0;
    const nextScore = score + earned;
    const nextCorrect = correct + (isCorrect ? 1 : 0);
    setIsLocked(true);
    setFeedback({
      tone: isCorrect ? 'success' : 'error',
      title: isCorrect ? 'Đã chinh phục câu hỏi!' : 'Chưa vượt qua thử thách này',
      description: currentQuestion.explanation || (isCorrect ? 'Em đang tăng tốc rất tốt ở chặng hiện tại.' : 'Hãy xem lại lời giải để bứt phá ở chặng sau.'),
      scoreText: earned ? `+${earned} điểm` : undefined,
    });
    window.setTimeout(() => {
      setScore(nextScore);
      setCorrect(nextCorrect);
      setFeedback(null);
      setIsLocked(false);
      if (currentIndex === questionSet.length - 1) {
        setResult({
          mode: 'peak',
          score: nextScore,
          total: questionSet.length,
          correct: nextCorrect,
          wrong: questionSet.length - nextCorrect,
          message: 'Em vừa hoàn thành hành trình nhiều chặng. Hãy thử lại để chinh phục điểm số cao hơn.',
        });
        return;
      }
      setCurrentIndex((prev) => prev + 1);
    }, 950);
  };

  if (!currentQuestion) {
    return (
      <div className="rounded-[28px] bg-white p-8 text-slate-500 shadow-sm ring-1 ring-slate-100">
        Bài học này chưa có đủ câu hỏi để mở trò chơi.
      </div>
    );
  }

  if (result) {
    return (
      <ResultCard
        result={result}
        onReplay={() => {
          setQuestionSet(shuffle(questions).slice(0, Math.min(8, questions.length)));
          setCurrentIndex(0);
          setScore(0);
          setCorrect(0);
          setFeedback(null);
          setIsLocked(false);
          setResult(null);
        }}
        onBack={onBack}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-4">
        {stages.map((item, idx) => {
          const active = idx === stages.findIndex((stageItem) => stageItem.title === stage.title);
          return (
            <div
              key={item.title}
              className={`rounded-2xl border px-4 py-4 transition ${active ? 'border-indigo-200 bg-indigo-50 text-indigo-700 shadow-sm ring-2 ring-indigo-100' : 'border-slate-100 bg-white text-slate-600'}`}
            >
              <div className="flex items-center gap-2 text-sm font-semibold">
                {item.icon} {item.title}
              </div>
              <p className="mt-2 text-xs">Mỗi câu đúng +{item.points} điểm</p>
            </div>
          );
        })}
      </div>
      <GameQuestionCard
        question={currentQuestion}
        index={currentIndex}
        total={questionSet.length}
        onSubmit={handleAnswer}
        isLocked={isLocked}
        helper={<div className="rounded-2xl bg-indigo-50 px-4 py-3 text-sm text-indigo-700">Vòng hiện tại: <span className="font-semibold">{stage.title}</span> • Câu đúng nhận {stage.points} điểm.</div>}
        statusBanner={
          feedback ? (
            <div className={`rounded-2xl border px-4 py-3 text-sm ${feedbackStyles(feedback.tone)}`}>
              <p className="font-semibold">{feedback.title}{feedback.scoreText ? ` • ${feedback.scoreText}` : ''}</p>
              <p className="mt-1 leading-6">{feedback.description}</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Hãy giữ nhịp ổn định để đi xa hơn qua từng chặng: khởi động, vượt chướng ngại, tăng tốc và về đích.
            </div>
          )
        }
      />
    </div>
  );
}

function SpeedGame({ questions, onBack }: { questions: PreparedQuestion[]; onBack: () => void }) {
  const initialQuestions = useMemo(() => shuffle(questions).slice(0, Math.min(12, questions.length)), [questions]);
  const [questionSet, setQuestionSet] = useState(initialQuestions);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(75);
  const [score, setScore] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [result, setResult] = useState<GameResult | null>(null);
  const [feedback, setFeedback] = useState<RoundFeedback | null>(null);
  const [isLocked, setIsLocked] = useState(false);

  useEffect(() => {
    if (result || isLocked) return;
    if (timeLeft <= 0) {
      setResult({
        mode: 'speed',
        score,
        total: questionSet.length,
        correct,
        wrong: Math.max(0, currentIndex - correct),
        message: 'Hết thời gian! Em hãy xem lại các câu đã bỏ lỡ rồi tăng tốc tốt hơn ở lượt sau nhé.',
      });
      return;
    }
    const timer = window.setTimeout(() => setTimeLeft((prev) => prev - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [timeLeft, result, score, questionSet.length, correct, currentIndex, isLocked]);

  const currentQuestion = questionSet[currentIndex];

  const handleAnswer = (answer: string | string[]) => {
    if (!currentQuestion || result || isLocked) return;
    const isCorrect = isQuestionCorrect(currentQuestion, answer);
    const earned = isCorrect ? 10 : -2;
    const nextScore = score + earned;
    const nextCorrect = correct + (isCorrect ? 1 : 0);
    setIsLocked(true);
    setFeedback({
      tone: isCorrect ? 'success' : 'error',
      title: isCorrect ? 'Rất nhanh và chính xác!' : 'Sai rồi, tăng tốc lại nhé',
      description: currentQuestion.explanation || (isCorrect ? 'Em vừa giữ nhịp rất tốt trong lượt tăng tốc.' : 'Đừng nản, vẫn còn thời gian để bứt phá ở các câu tiếp theo.'),
      scoreText: `${earned > 0 ? '+' : ''}${earned} điểm`,
    });
    window.setTimeout(() => {
      setScore(nextScore);
      setCorrect(nextCorrect);
      setFeedback(null);
      setIsLocked(false);
      if (currentIndex === questionSet.length - 1) {
        setResult({
          mode: 'speed',
          score: nextScore,
          total: questionSet.length,
          correct: nextCorrect,
          wrong: questionSet.length - nextCorrect,
          message: 'Em đã hoàn thành vòng tăng tốc. Hãy thử lại để cải thiện thời gian và độ chính xác.',
        });
        return;
      }
      setCurrentIndex((prev) => prev + 1);
    }, 700);
  };

  if (!currentQuestion) {
    return (
      <div className="rounded-[28px] bg-white p-8 text-slate-500 shadow-sm ring-1 ring-slate-100">
        Bài học này chưa có đủ câu hỏi để mở trò chơi.
      </div>
    );
  }

  if (result) {
    return (
      <ResultCard
        result={result}
        onReplay={() => {
          const nextSet = shuffle(questions).slice(0, Math.min(12, questions.length));
          setQuestionSet(nextSet);
          setCurrentIndex(0);
          setTimeLeft(75);
          setScore(0);
          setCorrect(0);
          setFeedback(null);
          setIsLocked(false);
          setResult(null);
        }}
        onBack={onBack}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Thời gian còn lại</p>
          <p className="mt-2 inline-flex items-center gap-2 text-2xl font-bold text-slate-900">
            <Clock3 className="h-5 w-5 text-rose-500" /> {timeLeft}s
          </p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-cyan-500 to-indigo-500 transition-all" style={{ width: `${(Math.max(timeLeft, 0) / 75) * 100}%` }} />
          </div>
        </div>
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Điểm hiện tại</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{score}</p>
        </div>
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Câu đúng</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {correct}/{Math.max(currentIndex, 1)}
          </p>
        </div>
      </div>
      <GameQuestionCard
        question={currentQuestion}
        index={currentIndex}
        total={questionSet.length}
        onSubmit={handleAnswer}
        isLocked={isLocked}
        helper={<div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">Trả lời đúng +10 điểm, sai -2 điểm. Hãy thật nhanh nhưng vẫn chính xác nhé!</div>}
        statusBanner={
          feedback ? (
            <div className={`rounded-2xl border px-4 py-3 text-sm ${feedbackStyles(feedback.tone)}`}>
              <p className="font-semibold">{feedback.title}{feedback.scoreText ? ` • ${feedback.scoreText}` : ''}</p>
              <p className="mt-1 leading-6">{feedback.description}</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">Mỗi giây đều quan trọng. Hãy giữ bình tĩnh để tăng tốc hiệu quả hơn.</div>
          )
        }
      />
    </div>
  );
}

export default function KnowledgeArena({
  lessons,
  selectedLesson,
  selectedContent,
  isLoadingLesson = false,
  analyticsRows = [],
  students = [],
  canViewStats = false,
  canManageLesson = () => false,
  lockUpdatingId = '',
  onToggleLessonLock,
  onEditLesson,
  onSelectLesson,
  onClearSelection,
}: KnowledgeArenaProps) {
  const [mode, setMode] = useState<ArenaMode | null>(null);
  const [introCountdown, setIntroCountdown] = useState<number | null>(null);
  const [libraryPage, setLibraryPage] = useState(1);
  const lessonListKey = useMemo(() => lessons.map((lesson) => lesson.lesson_id).join('|'), [lessons]);
  const libraryPageSize = 8;
  const libraryPageCount = Math.max(1, Math.ceil(lessons.length / libraryPageSize));
  const safeLibraryPage = Math.min(Math.max(1, libraryPage), libraryPageCount);
  const libraryLessons = lessons.slice((safeLibraryPage - 1) * libraryPageSize, safeLibraryPage * libraryPageSize);
  const questions = useMemo(() => prepareQuestions(selectedContent), [selectedContent]);
  const selectedStats = useMemo(
    () => (selectedLesson ? computeArenaLessonStats(selectedLesson, analyticsRows, students, questions.length) : null),
    [selectedLesson, analyticsRows, students, questions.length],
  );
  useEffect(() => {
    setMode(null);
    setIntroCountdown(null);
  }, [selectedLesson?.lesson_id]);

  useEffect(() => {
    setLibraryPage(1);
  }, [lessonListKey]);

  useEffect(() => {
    if (!mode) {
      setIntroCountdown(null);
      return;
    }
    setIntroCountdown(3);
  }, [mode]);

  useEffect(() => {
    if (introCountdown === null) return;
    const timer = window.setTimeout(() => {
      if (introCountdown <= 0) {
        setIntroCountdown(null);
      } else {
        setIntroCountdown((prev) => (prev === null ? null : prev - 1));
      }
    }, introCountdown === 0 ? 420 : 650);
    return () => window.clearTimeout(timer);
  }, [introCountdown]);

  if (selectedLesson && selectedContent && mode) {
    const meta = MODE_META[mode];
    return (
      <div className="space-y-4">
        <GameArenaHeader lesson={selectedLesson} mode={mode} questions={questions} onBack={onClearSelection} onResetMode={() => setMode(null)} />

        {introCountdown !== null ? <GameTransitionOverlay meta={meta} countdown={introCountdown} /> : null}

        {introCountdown === null && mode === 'million' ? <MillionGame questions={questions} onBack={() => setMode(null)} /> : null}
        {introCountdown === null && mode === 'peak' ? <PeakGame questions={questions} onBack={() => setMode(null)} /> : null}
        {introCountdown === null && mode === 'speed' ? <SpeedGame questions={questions} onBack={() => setMode(null)} /> : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!selectedLesson && !canViewStats ? (
        <div className="flex flex-wrap items-center gap-2 rounded-[18px] border border-orange-100 bg-white px-3 py-2.5 shadow-sm ring-1 ring-orange-50">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-orange-700">
            <Trophy className="h-3.5 w-3.5" /> 3 chế độ chơi
          </span>
          {(Object.keys(MODE_META) as ArenaMode[]).map((gameMode) => {
            const meta = MODE_META[gameMode];
            return (
              <span key={gameMode} className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-slate-600 ring-1 ring-slate-100">
                {meta.icon}{meta.title}
              </span>
            );
          })}
          <span className="ml-auto hidden text-[11px] font-medium text-slate-400 xl:inline">Chọn bài bên dưới để bắt đầu.</span>
        </div>
      ) : null}

      {selectedLesson && selectedContent ? (
        <div className="space-y-5">
          <div className={`overflow-hidden rounded-[24px] bg-gradient-to-r px-5 py-4 text-white shadow-[0_14px_34px_rgba(234,88,12,0.20)] ${selectedLesson.is_locked ? 'from-amber-500 via-orange-500 to-rose-500 ring-2 ring-amber-200' : 'from-orange-500 via-fuchsia-500 to-violet-600'}`}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em]">
                    <Trophy className="h-3.5 w-3.5" /> Bài học đã chọn
                  </span>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${selectedLesson.is_locked ? 'bg-white text-amber-700' : 'bg-white/15 text-white'}`}>
                    {selectedLesson.is_locked ? <Lock className="h-3 w-3" /> : <PlayCircle className="h-3 w-3" />}
                    {selectedLesson.is_locked ? 'Đang khóa' : 'Đang mở'}
                  </span>
                </div>
                <h2 className="mt-2 truncate text-xl font-black sm:text-2xl">{selectedLesson.tieu_de}</h2>
                <p className="mt-1 text-xs font-semibold text-white/85 sm:text-sm">
                  {selectedLesson.mon_hoc} • Khối {selectedLesson.khoi}{selectedLesson.lop ? ` • ${selectedLesson.lop}` : ''} • {questions.length} câu hỏi
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {canManageLesson(selectedLesson) && onToggleLessonLock ? (
                  <button
                    onClick={() => onToggleLessonLock(selectedLesson)}
                    disabled={lockUpdatingId === selectedLesson.lesson_id}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-white/15 px-3 py-2 text-xs font-bold text-white ring-1 ring-white/20 backdrop-blur disabled:cursor-wait disabled:opacity-60"
                  >
                    {selectedLesson.is_locked ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                    {selectedLesson.is_locked ? 'Mở khóa' : 'Khóa bài'}
                  </button>
                ) : null}
                {canManageLesson(selectedLesson) && onEditLesson ? (
                  <button onClick={() => onEditLesson(selectedLesson)} className="inline-flex items-center gap-1.5 rounded-xl bg-white/15 px-3 py-2 text-xs font-bold text-white ring-1 ring-white/20 backdrop-blur">
                    <Pencil className="h-3.5 w-3.5" /> Sửa bài
                  </button>
                ) : null}
                <button onClick={onClearSelection} className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-xs font-bold text-slate-800">
                  <ArrowLeft className="h-3.5 w-3.5" /> Đổi bài học
                </button>
              </div>
            </div>
          </div>

          {questions.length === 0 ? (
            <div className="rounded-[26px] border border-amber-200 bg-amber-50 p-5 text-amber-800">
              <div className="flex items-start gap-3">
                <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <p className="font-bold">Bài học chưa có câu hỏi luyện tập dùng cho Đấu trường.</p>
                  <p className="mt-1 text-sm leading-6">Hãy bổ sung câu hỏi ở phần Luyện tập của bài học. Sau khi lưu, trạng thái sẵn sàng Đấu trường sẽ được cập nhật tự động.</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid gap-5 xl:grid-cols-3">
              {(Object.keys(MODE_META) as ArenaMode[]).map((gameMode) => {
                const meta = MODE_META[gameMode];
                const points = gameMode === 'million' ? '10 mốc điểm' : gameMode === 'peak' ? 'Nhiều vòng thi' : '75 giây bứt tốc';
                return (
                  <div key={gameMode} className="rounded-[28px] bg-white p-6 shadow-sm ring-1 ring-slate-100 transition hover:-translate-y-1 hover:shadow-[0_18px_44px_rgba(15,23,42,0.08)]">
                    <div className={`inline-flex items-center gap-2 rounded-full bg-gradient-to-r ${meta.gradient} px-3 py-1 text-xs font-semibold text-white`}>
                      {meta.icon} {meta.title}
                    </div>
                    <p className="mt-4 text-sm leading-7 text-slate-600">{meta.subtitle}</p>
                    <div className="mt-5 space-y-3 text-sm text-slate-500">
                      <p className="flex items-center gap-2"><Star className="h-4 w-4 text-amber-500" /> {points}</p>
                      <p className="flex items-center gap-2"><Brain className="h-4 w-4 text-indigo-500" /> Dùng các câu hỏi của chính bài học đã chọn</p>
                      <p className="flex items-center gap-2"><BookOpen className="h-4 w-4 text-emerald-500" /> Có giải thích sau mỗi lượt chơi</p>
                    </div>
                    <button onClick={() => setMode(gameMode)} className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white">
                      <PlayCircle className="h-4 w-4" /> Bắt đầu trò chơi
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {canViewStats && selectedStats ? <KnowledgeArenaStatsPanel lesson={selectedLesson} stats={selectedStats} /> : null}
        </div>
      ) : (
        <div className="space-y-6">
          {isLoadingLesson ? (
            <div className="rounded-[28px] bg-white py-20 text-center text-slate-500 shadow-sm ring-1 ring-slate-100">Đang tải dữ liệu bài học cho đấu trường...</div>
          ) : lessons.length > 0 ? (
            <div className="space-y-5">
              <div className="lesson-library-grid">
                {libraryLessons.map((lesson, index) => {
                  const readiness = getArenaReadiness(lesson);
                  const locked = lesson.is_locked === true;
                  const manageable = canManageLesson(lesson);
                  const lessonNumber = getLessonNumber(lesson);
                  const lessonName = lessonNumber ? getLessonName(lesson) || lesson.tieu_de : lesson.tieu_de;
                  const topicVisual = getLessonVisualCatalog(lessonName || lesson.tieu_de, lesson.mon_hoc);
                  const PrimaryTopicIcon = topicVisual.PrimaryIcon;
                  const SecondaryTopicIcon = topicVisual.SecondaryIcon;
                  const TertiaryTopicIcon = topicVisual.TertiaryIcon;
                  const studentDisabled = !canViewStats && (locked || (readiness.known && !readiness.ready));
                  return (
                    <article
                      key={lesson.lesson_id}
                      className={`lesson-library-tile relative min-w-0 overflow-visible rounded-[22px] border bg-white shadow-[0_10px_28px_rgba(15,23,42,0.07)] transition hover:z-20 hover:-translate-y-1 hover:border-indigo-200 hover:shadow-[0_18px_40px_rgba(79,70,229,0.14)] ${locked ? 'border-amber-200 ring-1 ring-amber-100' : index === 0 && safeLibraryPage === 1 ? 'border-indigo-100 ring-1 ring-indigo-50' : 'border-slate-100'}`}
                    >
                      <button type="button" onClick={() => !studentDisabled && onSelectLesson(lesson)} disabled={studentDisabled} className={`group block w-full text-left ${studentDisabled ? 'cursor-not-allowed' : ''}`}>
                        <div className={`lesson-library-cover relative overflow-hidden bg-gradient-to-br ${locked ? 'from-amber-500 via-orange-500 to-rose-400' : topicVisual.coverClass}`} aria-hidden="true">
                          <div className="lesson-library-cover-grid" />
                          <div className="lesson-library-cover-glow lesson-library-cover-glow--one" />
                          <div className="lesson-library-cover-glow lesson-library-cover-glow--two" />
                          <div className="lesson-library-cover-orb lesson-library-cover-orb--one" />
                          <div className="lesson-library-cover-orb lesson-library-cover-orb--two" />

                          <div className="absolute right-3 top-3 z-20">
                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-[0.08em] shadow-sm backdrop-blur-sm ${locked ? 'bg-white/90 text-amber-700' : 'bg-white/92 text-emerald-700'}`}>
                              {locked ? <Lock className="h-3 w-3" /> : <PlayCircle className="h-3 w-3" />}
                              {locked ? 'Đã khóa' : 'Đang mở'}
                            </span>
                          </div>

                          <div className="lesson-library-cover-art">
                            <div className="lesson-library-cover-mini lesson-library-cover-mini--left"><SecondaryTopicIcon className="h-5 w-5" /></div>
                            <div className="lesson-library-cover-primary">
                              <div className={`lesson-library-cover-primary-inner ${locked ? 'bg-amber-100 text-amber-700' : topicVisual.iconClass}`}>
                                {locked ? <Lock className="h-10 w-10" /> : <PrimaryTopicIcon className="h-10 w-10" />}
                              </div>
                            </div>
                            <div className="lesson-library-cover-mini lesson-library-cover-mini--right"><TertiaryTopicIcon className="h-5 w-5" /></div>
                          </div>

                          <div className="lesson-library-cover-caption">
                            <span className="truncate">{lesson.mon_hoc}</span>
                            <span className="lesson-library-cover-caption-dot" />
                            <span>Khối {lesson.khoi}</span>
                            {lesson.lop ? <><span className="lesson-library-cover-caption-dot" /><span className="truncate">{lesson.lop}</span></> : null}
                          </div>
                        </div>

                        <div className="px-4 pb-3 pt-3.5">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-orange-600">Đấu trường tri thức</p>
                              <h3 className="mt-1 line-clamp-2 min-h-[2.7rem] text-[15px] font-black leading-[1.35rem] text-slate-900 transition group-hover:text-indigo-700">{lessonNumber ? `Bài ${lessonNumber}: ${lessonName}` : lessonName}</h3>
                            </div>
                            <span className="shrink-0 text-[10px] font-semibold text-slate-400">{formatArenaDate(lesson.updated_at || lesson.ngay_tao)}</span>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-1 text-[9px] font-black text-indigo-700 ring-1 ring-indigo-100">
                              <Brain className="h-3 w-3" /> {readiness.count !== null ? `${readiness.count} câu hỏi` : 'Kiểm tra khi mở'}
                            </span>
                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[9px] font-black ring-1 ${readiness.known && !readiness.ready ? 'bg-rose-50 text-rose-700 ring-rose-100' : 'bg-emerald-50 text-emerald-700 ring-emerald-100'}`}>
                              {readiness.known && !readiness.ready ? <CircleAlert className="h-3 w-3" /> : <Trophy className="h-3 w-3" />}
                              {readiness.known ? (readiness.ready ? 'Sẵn sàng' : 'Thiếu câu hỏi') : 'Nội dung legacy'}
                            </span>
                          </div>
                        </div>
                      </button>

                      <div className="border-t border-slate-100 px-3 pb-3 pt-2.5">
                        {canViewStats ? (
                          <div className="lesson-library-action-row">
                            <button type="button" onClick={(event) => { event.stopPropagation(); onSelectLesson(lesson); }} className="lesson-library-open-button">
                              <BarChart3 className="h-3.5 w-3.5" /> Xem
                            </button>
                            {(manageable && (onToggleLessonLock || onEditLesson)) ? (
                              <details className="lesson-library-menu relative">
                                <summary onClick={(event) => event.stopPropagation()} className="lesson-library-menu-trigger list-none [&::-webkit-details-marker]:hidden" title="Thao tác Đấu trường" aria-label="Thao tác Đấu trường">
                                  <MoreHorizontal className="h-4 w-4" />
                                </summary>
                                <div className="absolute bottom-full right-0 z-50 mb-2 w-48 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 text-left shadow-[0_18px_40px_rgba(15,23,42,0.16)]">
                                  {onToggleLessonLock ? (
                                    <button
                                      type="button"
                                      onClick={(event) => { event.preventDefault(); event.stopPropagation(); event.currentTarget.closest('details')?.removeAttribute('open'); onToggleLessonLock(lesson); }}
                                      disabled={lockUpdatingId === lesson.lesson_id}
                                      className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold disabled:cursor-wait disabled:opacity-60 ${locked ? 'text-emerald-700 hover:bg-emerald-50' : 'text-amber-700 hover:bg-amber-50'}`}
                                    >
                                      {locked ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />} {locked ? 'Mở khóa bài học' : 'Khóa bài học'}
                                    </button>
                                  ) : null}
                                  {onEditLesson ? (
                                    <button type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); event.currentTarget.closest('details')?.removeAttribute('open'); onEditLesson(lesson); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50">
                                      <Pencil className="h-3.5 w-3.5" /> Sửa bài học
                                    </button>
                                  ) : null}
                                </div>
                              </details>
                            ) : null}
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => !studentDisabled && onSelectLesson(lesson)}
                            disabled={studentDisabled}
                            className={`inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition ${studentDisabled ? 'cursor-not-allowed bg-slate-100 text-slate-400' : 'bg-slate-900 text-white hover:bg-indigo-700'}`}
                          >
                            {locked ? <Lock className="h-4 w-4" /> : readiness.known && !readiness.ready ? <CircleAlert className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />}
                            {locked ? 'Bài đang khóa' : readiness.known && !readiness.ready ? 'Chưa có câu hỏi thi đấu' : 'Chọn bài để thi đấu'}
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
              {libraryPageCount > 1 ? (
                <nav className="lesson-library-pagination" aria-label="Phân trang Đấu trường tri thức">
                  <button type="button" onClick={() => setLibraryPage(Math.max(1, safeLibraryPage - 1))} disabled={safeLibraryPage === 1} className="lesson-library-page-button lesson-library-page-arrow" aria-label="Trang trước">‹</button>
                  {Array.from({ length: libraryPageCount }, (_, pageIndex) => pageIndex + 1).map((page) => (
                    <button key={page} type="button" onClick={() => setLibraryPage(page)} className={`lesson-library-page-button ${page === safeLibraryPage ? 'is-active' : ''}`} aria-current={page === safeLibraryPage ? 'page' : undefined}>{page}</button>
                  ))}
                  <button type="button" onClick={() => setLibraryPage(Math.min(libraryPageCount, safeLibraryPage + 1))} disabled={safeLibraryPage === libraryPageCount} className="lesson-library-page-button lesson-library-page-arrow" aria-label="Trang sau">›</button>
                </nav>
              ) : null}
            </div>

          ) : (
            <div className="rounded-[28px] bg-white py-20 text-center shadow-sm ring-1 ring-slate-100">
              <Trophy className="mx-auto h-10 w-10 text-slate-300" />
              <h3 className="mt-4 text-lg font-bold text-slate-900">Chưa có bài học phù hợp để vào đấu trường</h3>
              <p className="text-slate-500">Hãy đổi bộ lọc hoặc tạo bài học mới có phần luyện tập để bắt đầu.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

