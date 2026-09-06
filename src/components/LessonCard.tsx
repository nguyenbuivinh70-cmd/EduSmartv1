import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import {
  Atom,
  BookOpenCheck,
  BookOpenText,
  Calculator,
  ChevronRight,
  CircleDot,
  Clock3,
  Code2,
  FlaskConical,
  Languages,
  Landmark,
  Lock,
  Map,
  Microscope,
  MonitorCog,
  ShieldAlert,
  Trophy,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Lesson, LessonProgressRecord } from '../types';
import { getLessonName, getLessonNumber } from '../utils/lessonCatalog';
import { getLessonVisualCatalog } from '../utils/lessonVisualCatalog';
import { getLessonScheduleAccess, formatLessonAccessDateTime } from '../utils/lessonAccess';

interface LessonCardProps {
  key?: any;
  lesson: Lesson;
  onClick: () => void;
  actions?: ReactNode;
  highlight?: boolean;
  progress?: LessonProgressRecord | null;
  variant?: 'default' | 'compact' | 'student' | 'library';
}

function getSubjectVisual(subject: string): { Icon: LucideIcon; label: string; tone: string; iconTone: string } {
  const name = subject.toLowerCase();
  if (name.includes('toán')) return { Icon: Calculator, label: 'Toán học', tone: 'from-sky-50 via-indigo-50 to-white', iconTone: 'text-sky-700 bg-sky-100' };
  if (name.includes('văn')) return { Icon: BookOpenText, label: 'Ngữ văn', tone: 'from-rose-50 via-orange-50 to-white', iconTone: 'text-rose-700 bg-rose-100' };
  if (name.includes('anh')) return { Icon: Languages, label: 'Ngoại ngữ', tone: 'from-cyan-50 via-sky-50 to-white', iconTone: 'text-cyan-700 bg-cyan-100' };
  if (name.includes('lý')) return { Icon: Atom, label: 'Vật lý', tone: 'from-violet-50 via-indigo-50 to-white', iconTone: 'text-violet-700 bg-violet-100' };
  if (name.includes('hóa')) return { Icon: FlaskConical, label: 'Hóa học', tone: 'from-emerald-50 via-teal-50 to-white', iconTone: 'text-emerald-700 bg-emerald-100' };
  if (name.includes('sinh')) return { Icon: Microscope, label: 'Sinh học', tone: 'from-lime-50 via-emerald-50 to-white', iconTone: 'text-lime-700 bg-lime-100' };
  if (name.includes('sử')) return { Icon: Landmark, label: 'Lịch sử', tone: 'from-amber-50 via-orange-50 to-white', iconTone: 'text-amber-700 bg-amber-100' };
  if (name.includes('địa')) return { Icon: Map, label: 'Địa lý', tone: 'from-teal-50 via-cyan-50 to-white', iconTone: 'text-teal-700 bg-teal-100' };
  if (name.includes('tin')) return { Icon: Code2, label: 'Tin học', tone: 'from-indigo-50 via-violet-50 to-white', iconTone: 'text-indigo-700 bg-indigo-100' };
  return { Icon: BookOpenCheck, label: subject || 'Bài học', tone: 'from-slate-50 via-indigo-50 to-white', iconTone: 'text-slate-700 bg-slate-100' };
}

const STATUS_LABELS: Record<string, string> = {
  ready_private: 'Riêng tư', approved_shared: 'Dùng chung', pending_review: 'Chờ duyệt', draft: 'Nháp', rejected: 'Bị từ chối',
};

function getProgressStatusLabel(progress?: LessonProgressRecord | null) {
  if (progress?.result_state === 'invalid_cheating') return 'Đã hủy';
  if (progress?.result_state === 'cancelled_retake') return 'Chờ học lại';
  if (!progress) return 'Chưa học';
  if (progress.status === 'completed') return 'Hoàn thành';
  if (progress.status === 'in_progress') return 'Đang học';
  return 'Chưa học';
}

function getProgressStatusTone(progress?: LessonProgressRecord | null) {
  if (progress?.result_state === 'invalid_cheating') return 'bg-rose-50 text-rose-700';
  if (progress?.result_state === 'cancelled_retake') return 'bg-indigo-50 text-indigo-700';
  if (!progress) return 'bg-slate-100 text-slate-600';
  if (progress.status === 'completed') return 'bg-emerald-50 text-emerald-700';
  if (progress.status === 'in_progress') return 'bg-amber-50 text-amber-700';
  return 'bg-slate-100 text-slate-600';
}

function getScore(progress?: LessonProgressRecord | null) {
  if (!progress || progress.result_state === 'invalid_cheating' || progress.result_state === 'cancelled_retake') return null;
  if (progress.assessment_score !== undefined && Number.isFinite(Number(progress.assessment_score))) {
    return { value: Math.max(0, Math.min(10, Number(progress.assessment_score))), provisional: false };
  }
  if (progress.quiz_total && Number.isFinite(Number(progress.quiz_percent))) {
    return { value: Math.max(0, Math.min(10, Number(progress.quiz_percent) / 10)), provisional: true };
  }
  return null;
}

function formatScore(value: number) {
  return value.toFixed(1).replace('.0', '');
}

function formatLessonDate(value?: string) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw.split('T')[0] || raw;
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

export default function LessonCard({ lesson, onClick, actions, highlight = false, progress, variant = 'default' }: LessonCardProps) {
  const score = getScore(progress);
  const groupNames = progress?.study_mode === 'co_learning' && Array.isArray(progress.co_learner_names)
    ? progress.co_learner_names.filter(Boolean).slice(0, 3)
    : [];
  const groupCount = progress?.co_learner_user_ids?.length || String(progress?.co_learner_ids || '').split(',').filter(Boolean).length;
  const resultLocked = progress?.result_state === 'invalid_cheating' && progress.retake_allowed === false;
  const accessLocked = lesson.is_locked === true;
  const lessonDate = formatLessonDate(lesson.updated_at || lesson.ngay_tao);
  const lessonNumber = getLessonNumber(lesson);
  const lessonDisplayName = lessonNumber ? getLessonName(lesson) || lesson.tieu_de : lesson.tieu_de;
  const subjectVisual = getSubjectVisual(lesson.mon_hoc);
  const SubjectIcon = subjectVisual.Icon;
  const topicVisual = getLessonVisualCatalog(lessonDisplayName || lesson.tieu_de, lesson.mon_hoc);

  if (variant === 'library') {
    const PrimaryTopicIcon = topicVisual.PrimaryIcon;
    const SecondaryTopicIcon = topicVisual.SecondaryIcon;
    const TertiaryTopicIcon = topicVisual.TertiaryIcon;

    return (
      <motion.article
        whileHover={{ y: -5 }}
        className={`lesson-library-tile relative min-w-0 overflow-visible rounded-[22px] border bg-white shadow-[0_10px_28px_rgba(15,23,42,0.07)] transition hover:z-20 hover:border-indigo-200 hover:shadow-[0_18px_40px_rgba(79,70,229,0.14)] ${accessLocked ? 'border-amber-200 ring-1 ring-amber-100' : highlight ? 'border-indigo-200 ring-2 ring-indigo-100' : 'border-slate-100'}`}
      >
        <button onClick={onClick} className="group block w-full text-left" title={`Mở ${lesson.tieu_de}`}>
          <div className={`lesson-library-cover relative overflow-hidden bg-gradient-to-br ${accessLocked ? 'from-amber-500 via-orange-500 to-rose-400' : topicVisual.coverClass}`} aria-hidden="true">
            <div className="lesson-library-cover-grid" />
            <div className="lesson-library-cover-glow lesson-library-cover-glow--one" />
            <div className="lesson-library-cover-glow lesson-library-cover-glow--two" />
            <div className="lesson-library-cover-orb lesson-library-cover-orb--one" />
            <div className="lesson-library-cover-orb lesson-library-cover-orb--two" />

            <div className="absolute right-3 top-3 z-20">
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-[0.08em] shadow-sm backdrop-blur-sm ${accessLocked ? 'bg-white/90 text-amber-700' : 'bg-white/92 text-emerald-700'}`}>
                {accessLocked ? <Lock className="h-3 w-3" /> : <CircleDot className="h-3 w-3" />}
                {accessLocked ? 'Đã khóa' : 'Đang mở'}
              </span>
            </div>

            <div className="lesson-library-cover-art">
              <div className="lesson-library-cover-mini lesson-library-cover-mini--left">
                <SecondaryTopicIcon className="h-5 w-5" />
              </div>
              <div className="lesson-library-cover-primary">
                <div className={`lesson-library-cover-primary-inner ${accessLocked ? 'bg-amber-100 text-amber-700' : topicVisual.iconClass}`}>
                  {accessLocked ? <Lock className="h-10 w-10" /> : <PrimaryTopicIcon className="h-10 w-10" />}
                </div>
              </div>
              <div className="lesson-library-cover-mini lesson-library-cover-mini--right">
                <TertiaryTopicIcon className="h-5 w-5" />
              </div>
            </div>

            <div className="lesson-library-cover-caption">
              <span className="truncate">{lesson.mon_hoc}</span>
              <span className="lesson-library-cover-caption-dot" />
              <span>Khối {lesson.khoi}</span>
              {lesson.lop ? <><span className="lesson-library-cover-caption-dot" /><span className="truncate">{lesson.lop}</span></> : null}
            </div>
          </div>

          <div className="px-4 pb-3 pt-3.5">
            <h3 className="line-clamp-2 min-h-[2.7rem] text-[15px] font-black leading-[1.35rem] text-slate-900 transition group-hover:text-indigo-700">{lessonNumber ? `Bài ${lessonNumber}: ${lessonDisplayName}` : lessonDisplayName}</h3>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-black uppercase tracking-[0.08em] text-slate-600">{STATUS_LABELS[lesson.trang_thai] || lesson.trang_thai}</span>
              {lessonDate ? <span className="rounded-full bg-white px-2 py-1 text-[9px] font-bold text-slate-400 ring-1 ring-slate-100">{lessonDate}</span> : null}
            </div>
          </div>
        </button>

        {actions ? <div className="lesson-library-actions border-t border-slate-100 px-3 pb-3 pt-2.5">{actions}</div> : null}
      </motion.article>
    );
  }

  if (variant === 'compact') {
    return (
      <motion.article
        whileHover={{ y: -2 }}
        className={`lesson-compact-card relative overflow-visible rounded-[22px] border bg-white shadow-[0_10px_28px_rgba(15,23,42,0.07)] transition hover:z-10 hover:shadow-[0_16px_38px_rgba(15,23,42,0.11)] ${accessLocked ? 'border-amber-200 ring-1 ring-amber-100' : highlight ? 'border-indigo-200 ring-2 ring-indigo-100' : 'border-slate-100 hover:border-indigo-100'}`}
      >
        <div className={`h-1.5 rounded-t-[22px] bg-gradient-to-r ${accessLocked ? 'from-amber-400 via-orange-400 to-rose-400' : 'from-indigo-500 via-violet-500 to-fuchsia-500'}`} />
        <button onClick={onClick} className="block w-full text-left">
          <div className="p-4 sm:p-5">
            <div className="grid gap-4 md:grid-cols-[76px_minmax(0,1fr)_auto] md:items-start">
              <div className={`flex h-[72px] w-[72px] items-center justify-center rounded-[22px] bg-gradient-to-br ${subjectVisual.tone} ring-1 ring-slate-100 shadow-sm`}>
                <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${subjectVisual.iconTone}`}>
                  {accessLocked ? <Lock className="h-6 w-6" /> : <SubjectIcon className="h-6 w-6" />}
                </div>
              </div>

              <div className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-black text-indigo-700">
                    <MonitorCog className="h-3.5 w-3.5" />{lesson.mon_hoc}
                  </span>
                  <span className="text-xs font-bold text-slate-500">Khối {lesson.khoi}{lesson.lop ? ` • ${lesson.lop}` : ''}</span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {lessonNumber ? <span className="inline-flex rounded-lg bg-indigo-600 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-white">Bài {lessonNumber}</span> : null}
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-slate-600">{STATUS_LABELS[lesson.trang_thai] || lesson.trang_thai}</span>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.08em] ${accessLocked ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                    {accessLocked ? <Lock className="h-3 w-3" /> : <CircleDot className="h-3 w-3" />}
                    {accessLocked ? 'Đã khóa' : 'Đang mở'}
                  </span>
                </div>
                <h3 className="mt-2 line-clamp-2 text-[17px] font-black leading-6 text-slate-900">{lessonDisplayName}</h3>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold text-slate-500">
                  <span className="truncate">{lesson.nguoi_tao}</span>
                  <span className={accessLocked ? 'text-amber-700' : 'text-indigo-700'}>{accessLocked ? 'Chưa cho học' : 'Sẵn sàng học'}</span>
                </div>
              </div>

              {lessonDate ? <span className="shrink-0 pt-1 text-[10px] font-semibold text-slate-400">{lessonDate}</span> : null}
            </div>
          </div>
        </button>
        {actions ? <div className="lesson-compact-actions relative border-t border-slate-100 bg-slate-50/80 px-2.5 py-2.5">{actions}</div> : null}
      </motion.article>
    );
  }

  if (variant === 'student') {
    const progressPercent = Math.max(0, Math.min(100, Number(progress?.completion_percent || 0)));
    const scheduleAccess = getLessonScheduleAccess(lesson);
    const scheduleBlocked = scheduleAccess.blocked;
    const accessBlocked = accessLocked || scheduleBlocked;
    const progressStateLabel = getProgressStatusLabel(progress);
    const progressStateTone = getProgressStatusTone(progress);
    const actionLabel = accessLocked
      ? 'Chưa thể học'
      : scheduleAccess.reason === 'before_start'
        ? 'Chưa đến giờ'
        : scheduleAccess.reason === 'after_end'
          ? 'Đã hết giờ'
          : progress?.status === 'in_progress'
            ? 'Tiếp tục học'
            : progress?.status === 'completed'
              ? 'Xem lại bài'
              : score
                ? 'Xem kết quả'
                : 'Bắt đầu học';
    const progressLabel = accessLocked
      ? 'Giáo viên chưa mở bài'
      : scheduleBlocked
        ? scheduleAccess.message
        : progress?.status === 'completed'
          ? 'Đã hoàn thành bài học'
          : progress
            ? `Tiến độ ${progressPercent}%`
            : 'Chưa bắt đầu';
    const PrimaryTopicIcon = topicVisual.PrimaryIcon;
    const SecondaryTopicIcon = topicVisual.SecondaryIcon;
    const TertiaryTopicIcon = topicVisual.TertiaryIcon;
    const cardStatusLabel = accessLocked ? 'Đang khóa' : scheduleBlocked ? scheduleAccess.shortLabel : progressStateLabel;
    const cardStatusTone = accessLocked || scheduleAccess.reason === 'before_start'
      ? 'bg-white/92 text-amber-700'
      : scheduleAccess.reason === 'after_end'
        ? 'bg-white/92 text-rose-700'
        : progress?.status === 'completed'
          ? 'bg-white/92 text-emerald-700'
          : progress?.status === 'in_progress'
            ? 'bg-white/92 text-amber-700'
            : 'bg-white/92 text-slate-600';
    const scheduleDateLabel = scheduleAccess.reason === 'before_start'
      ? formatLessonAccessDateTime(scheduleAccess.startAt)
      : scheduleAccess.reason === 'after_end'
        ? formatLessonAccessDateTime(scheduleAccess.endAt)
        : '';

    return (
      <motion.article
        whileHover={accessBlocked ? undefined : { y: -5 }}
        className={`lesson-library-tile group relative min-w-0 overflow-hidden rounded-[24px] border bg-white shadow-[0_12px_32px_rgba(15,23,42,0.07)] transition ${accessLocked ? 'border-amber-200 ring-1 ring-amber-100' : highlight ? 'border-indigo-200 ring-2 ring-indigo-100' : 'border-slate-100 hover:border-indigo-200 hover:shadow-[0_18px_40px_rgba(79,70,229,0.12)]'}`}
      >
        <button
          type="button"
          onClick={onClick}
          className="block w-full text-left"
          aria-label={`${actionLabel}: ${lesson.tieu_de}`}
        >
          <div className={`lesson-library-cover relative overflow-hidden bg-gradient-to-br ${accessLocked ? 'from-amber-500 via-orange-500 to-rose-400' : topicVisual.coverClass}`} aria-hidden="true">
            <div className="lesson-library-cover-grid" />
            <div className="lesson-library-cover-glow lesson-library-cover-glow--one" />
            <div className="lesson-library-cover-glow lesson-library-cover-glow--two" />
            <div className="lesson-library-cover-orb lesson-library-cover-orb--one" />
            <div className="lesson-library-cover-orb lesson-library-cover-orb--two" />

            <div className="absolute right-3 top-3 z-20">
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-[0.08em] shadow-sm backdrop-blur-sm ${cardStatusTone}`}>
                {accessLocked ? <Lock className="h-3 w-3" /> : <CircleDot className="h-3 w-3" />}
                {cardStatusLabel}
              </span>
            </div>

            <div className="lesson-library-cover-art">
              <div className="lesson-library-cover-mini lesson-library-cover-mini--left">
                <SecondaryTopicIcon className="h-5 w-5" />
              </div>
              <div className="lesson-library-cover-primary">
                <div className={`lesson-library-cover-primary-inner ${accessLocked ? 'bg-amber-100 text-amber-700' : topicVisual.iconClass}`}>
                  {accessLocked ? <Lock className="h-10 w-10" /> : <PrimaryTopicIcon className="h-10 w-10" />}
                </div>
              </div>
              <div className="lesson-library-cover-mini lesson-library-cover-mini--right">
                <TertiaryTopicIcon className="h-5 w-5" />
              </div>
            </div>

            <div className="lesson-library-cover-caption">
              <span className="truncate">{lesson.mon_hoc}</span>
              <span className="lesson-library-cover-caption-dot" />
              <span>Khối {lesson.khoi}</span>
              {lesson.lop ? <><span className="lesson-library-cover-caption-dot" /><span className="truncate">{lesson.lop}</span></> : null}
            </div>
          </div>

          <div className="px-4 pb-3.5 pt-3.5">
            <div className="flex flex-wrap items-center gap-1.5">
              {lessonNumber ? <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.08em] text-indigo-700">Bài {lessonNumber}</span> : null}
            </div>

            <h3 className="mt-2 line-clamp-2 min-h-[2.9rem] text-[17px] font-black leading-[1.45rem] text-slate-900 transition group-hover:text-indigo-700">
              {lessonNumber ? `Bài ${lessonNumber}: ${lessonDisplayName}` : lessonDisplayName}
            </h3>

            <p className="mt-2 line-clamp-2 min-h-[2.7rem] text-[13px] leading-[1.35rem] text-slate-500">
              {lesson.mo_ta || 'Bài học được thiết kế theo 4 chặng: khởi động, kiến thức, luyện tập và vận dụng.'}
            </p>

            <div className="mt-3 rounded-[18px] border border-slate-100 bg-slate-50/85 p-3">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                <div className="min-w-0">
                  <div className="flex items-center justify-between gap-2 text-[11px] font-bold">
                    <span className={`truncate ${accessBlocked ? (scheduleAccess.reason === 'after_end' ? 'text-rose-700' : 'text-amber-700') : 'text-slate-600'}`}>{progressLabel}</span>
                    {!accessBlocked ? <span className="shrink-0 text-slate-400">{progressPercent}%</span> : null}
                  </div>
                  <div className={`mt-2 h-2 overflow-hidden rounded-full ${accessBlocked ? (scheduleAccess.reason === 'after_end' ? 'bg-rose-100' : 'bg-amber-100') : 'bg-white ring-1 ring-slate-100'}`}>
                    {!accessBlocked ? (
                      <div
                        className={`h-full rounded-full ${progress?.status === 'completed' ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                        style={{ width: `${progressPercent > 0 ? Math.max(8, progressPercent) : 0}%` }}
                      />
                    ) : null}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] font-semibold text-slate-500">
                    <span className="rounded-full bg-white px-2 py-1 ring-1 ring-slate-100">{progress?.completed_steps ?? 0}/{progress?.total_steps ?? 0} bước</span>
                    {groupCount > 1 ? <span className="rounded-full bg-violet-50 px-2 py-1 text-violet-700 ring-1 ring-violet-100">Học nhóm {groupCount} bạn</span> : null}
                    {scheduleDateLabel ? <span className={`rounded-full px-2 py-1 ring-1 ${scheduleAccess.reason === 'after_end' ? 'bg-rose-50 text-rose-700 ring-rose-100' : 'bg-amber-50 text-amber-700 ring-amber-100'}`}>{scheduleAccess.reason === 'before_start' ? 'Mở ' : 'Đóng '}{scheduleDateLabel}</span> : null}
                    {lessonDate ? <span className="rounded-full bg-white px-2 py-1 ring-1 ring-slate-100">{lessonDate}</span> : null}
                  </div>
                </div>

                <div className="rounded-2xl bg-white px-3 py-2 text-center shadow-sm ring-1 ring-slate-100">
                  <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">Điểm</p>
                  <p className={`mt-1 text-lg font-black ${score ? 'text-indigo-700' : 'text-slate-300'}`}>{score ? formatScore(score.value) : '-'}</p>
                  {score?.provisional ? <p className="text-[8px] font-bold text-amber-600">Tạm tính</p> : <p className="text-[8px] font-bold text-slate-300">/10</p>}
                </div>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.08em] text-slate-600">{STATUS_LABELS[lesson.trang_thai] || lesson.trang_thai}</span>
                {score?.provisional ? <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.08em] text-amber-700">Điểm tạm</span> : null}
              </div>

              <span className={`inline-flex shrink-0 items-center gap-1 rounded-xl px-3 py-2 text-[11px] font-black transition ${accessBlocked ? (scheduleAccess.reason === 'after_end' ? 'bg-rose-50 text-rose-700 ring-1 ring-rose-100' : 'bg-amber-50 text-amber-700 ring-1 ring-amber-100') : 'bg-indigo-600 text-white shadow-sm group-hover:bg-indigo-700'}`}>
                {actionLabel}
                <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </div>
          </div>
        </button>
      </motion.article>
    );
  }

  return (
    <motion.article whileHover={{ y: -3 }} className={`group overflow-hidden rounded-[24px] border bg-white shadow-[0_12px_34px_rgba(15,23,42,0.08)] transition ${accessLocked ? 'border-amber-200 ring-1 ring-amber-100' : highlight ? 'border-indigo-200 ring-2 ring-indigo-100' : 'border-white/80 hover:border-indigo-100'}`}>
      <button onClick={onClick} className="block w-full text-left">
        <div className={`relative h-[118px] overflow-hidden bg-gradient-to-br ${accessLocked ? 'from-amber-50 via-orange-50 to-rose-50' : subjectVisual.tone}`}>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.16),transparent_38%),radial-gradient(circle_at_bottom_left,rgba(236,72,153,0.10),transparent_30%)]" />
          <div className="relative flex h-full items-center justify-between px-5">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/85 px-3 py-1 text-[11px] font-bold text-indigo-700 shadow-sm"><BookOpenCheck className="h-3.5 w-3.5" />{lesson.mon_hoc}</div>
              <p className="text-sm font-bold text-slate-600">Khối {lesson.khoi}{lesson.lop ? ` • ${lesson.lop}` : ''}</p>
            </div>
            <div className={`flex h-16 w-16 items-center justify-center rounded-3xl bg-white/80 shadow-sm ring-1 ring-white ${accessLocked ? 'text-amber-700' : 'text-indigo-700'}`}>
              {accessLocked ? <Lock className="h-8 w-8" /> : <SubjectIcon className="h-8 w-8" />}
            </div>
          </div>
        </div>

        <div className="space-y-3 p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.15em] text-indigo-700">{STATUS_LABELS[lesson.trang_thai] || lesson.trang_thai}</span>
              {accessLocked && <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-amber-700"><Lock className="h-3 w-3" /> Đã khóa</span>}
            </div>
            <span className="shrink-0 text-[11px] font-medium text-slate-400">{lessonDate}</span>
          </div>
          {lessonNumber ? <div><span className="inline-flex rounded-lg bg-indigo-600 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-white">Bài {lessonNumber}</span></div> : null}
          <h3 className="line-clamp-2 min-h-[54px] text-lg font-black leading-7 text-slate-900">{lessonDisplayName}</h3>
          <p className="line-clamp-2 min-h-[48px] text-sm leading-6 text-slate-500">{lesson.mo_ta || 'Chưa có mô tả bài học.'}</p>

          {progress ? (
            <div className="rounded-[20px] border border-slate-100 bg-slate-50/80 p-4">
              <div className="flex items-center justify-between gap-3">
                <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-bold ${getProgressStatusTone(progress)}`}>
                  {resultLocked ? <ShieldAlert className="h-3.5 w-3.5" /> : <CircleDot className="h-3.5 w-3.5" />}{getProgressStatusLabel(progress)}
                </span>
                <div className="text-right">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Điểm bài học</p>
                  <p className={`text-lg font-black ${score ? 'text-indigo-700' : progress.result_state === 'invalid_cheating' ? 'text-rose-600' : 'text-slate-400'}`}>{score ? `${formatScore(score.value)}/10` : progress.result_state === 'invalid_cheating' ? 'Đã hủy' : '-'}</p>
                  {score?.provisional && <p className="text-[9px] font-semibold text-amber-600">Tạm tính</p>}
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs font-semibold text-slate-500"><span>Tiến độ</span><span>{progress.completion_percent}%</span></div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white ring-1 ring-slate-100"><div className={`h-full rounded-full ${progress.status === 'completed' ? 'bg-emerald-500' : progress.result_state === 'invalid_cheating' ? 'bg-rose-400' : 'bg-indigo-500'}`} style={{ width: `${progress.completion_percent > 0 ? Math.max(8, progress.completion_percent) : 0}%` }} /></div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-2 ring-1 ring-slate-100"><Clock3 className="h-3.5 w-3.5 text-indigo-500" />{progress.completed_steps}/{progress.total_steps} bước</span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-2 ring-1 ring-slate-100"><Trophy className="h-3.5 w-3.5 text-amber-500" />{progress.quiz_percent ?? 0}% luyện tập</span>
              </div>
              {groupCount > 1 && <div className="mt-3 flex items-center gap-2 rounded-2xl bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700"><Users className="h-4 w-4 shrink-0" /><span className="truncate">Học nhóm {groupCount} bạn{groupNames.length ? ` • ${groupNames.join(', ')}${groupCount > groupNames.length ? '…' : ''}` : ''}</span></div>}
            </div>
          ) : null}

          <div className="flex items-center justify-between border-t border-slate-100 pt-4 text-sm"><span className="max-w-[55%] truncate font-semibold text-slate-600">{lesson.nguoi_tao}</span><span className={`flex items-center gap-1 font-black ${accessLocked || resultLocked ? 'text-amber-700' : 'text-indigo-700'}`}>{accessLocked ? 'Bài đang khóa' : resultLocked ? 'Đã khóa kết quả' : progress?.status === 'in_progress' ? 'Tiếp tục học' : progress?.assessment_score !== undefined ? 'Xem kết quả' : 'Mở học tập'}<ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></span></div>
        </div>
      </button>
      {actions ? <div className="border-t border-slate-100 bg-slate-50 px-5 py-4">{actions}</div> : null}
    </motion.article>
  );
}
