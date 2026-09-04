import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { BookOpenCheck, ChevronRight, CircleDot, Clock3, Lock, ShieldAlert, Trophy, Users } from 'lucide-react';
import { Lesson, LessonProgressRecord } from '../types';
import { getLessonName, getLessonNumber } from '../utils/lessonCatalog';

interface LessonCardProps {
  key?: any;
  lesson: Lesson;
  onClick: () => void;
  actions?: ReactNode;
  highlight?: boolean;
  progress?: LessonProgressRecord | null;
  variant?: 'default' | 'compact';
}

function getSubjectEmoji(subject: string) {
  const name = subject.toLowerCase();
  if (name.includes('toán')) return '📐';
  if (name.includes('văn')) return '📖';
  if (name.includes('anh')) return '🇬🇧';
  if (name.includes('lý')) return '⚡';
  if (name.includes('hóa')) return '🧪';
  if (name.includes('sử')) return '🏛️';
  if (name.includes('địa')) return '🗺️';
  if (name.includes('tin')) return '💻';
  return '📘';
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

  if (variant === 'compact') {
    return (
      <motion.article
        whileHover={{ y: -2 }}
        className={`lesson-compact-card relative overflow-visible rounded-[20px] border bg-white shadow-[0_8px_24px_rgba(15,23,42,0.06)] transition hover:z-10 hover:shadow-[0_12px_30px_rgba(15,23,42,0.1)] ${accessLocked ? 'border-amber-200 ring-1 ring-amber-100' : highlight ? 'border-indigo-200 ring-2 ring-indigo-100' : 'border-slate-100 hover:border-indigo-100'}`}
      >
        <div className={`h-1.5 rounded-t-[20px] bg-gradient-to-r ${accessLocked ? 'from-amber-400 via-orange-400 to-rose-400' : 'from-indigo-500 via-violet-500 to-fuchsia-500'}`} />
        <button onClick={onClick} className="block w-full text-left">
          <div className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-black text-indigo-700">
                  <BookOpenCheck className="h-3.5 w-3.5" />{lesson.mon_hoc}
                </span>
                <span className="text-xs font-bold text-slate-500">Khối {lesson.khoi}{lesson.lop ? ` • ${lesson.lop}` : ''}</span>
              </div>
              {lessonDate ? <span className="shrink-0 pt-1 text-[10px] font-semibold text-slate-400">{lessonDate}</span> : null}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-slate-600">{STATUS_LABELS[lesson.trang_thai] || lesson.trang_thai}</span>
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.08em] ${accessLocked ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                {accessLocked ? <Lock className="h-3 w-3" /> : <CircleDot className="h-3 w-3" />}
                {accessLocked ? 'Đã khóa' : 'Đang mở'}
              </span>
            </div>

            {lessonNumber ? <div className="mt-3"><span className="inline-flex rounded-lg bg-indigo-600 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-white">Bài {lessonNumber}</span></div> : null}
            <h3 className={`${lessonNumber ? 'mt-2' : 'mt-3'} line-clamp-2 min-h-[48px] text-[17px] font-black leading-6 text-slate-900`}>{lessonDisplayName}</h3>

            <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
              <span className="min-w-0 truncate text-xs font-semibold text-slate-500">{lesson.nguoi_tao}</span>
              <span className={`shrink-0 text-[11px] font-black ${accessLocked ? 'text-amber-700' : 'text-indigo-700'}`}>{accessLocked ? 'Chưa cho học' : 'Sẵn sàng học'}</span>
            </div>
          </div>
        </button>
        {actions ? <div className="lesson-compact-actions relative border-t border-slate-100 bg-slate-50/80 px-2.5 py-2.5">{actions}</div> : null}
      </motion.article>
    );
  }

  return (
    <motion.article whileHover={{ y: -3 }} className={`group overflow-hidden rounded-[24px] border bg-white shadow-[0_12px_34px_rgba(15,23,42,0.08)] transition ${accessLocked ? 'border-amber-200 ring-1 ring-amber-100' : highlight ? 'border-indigo-200 ring-2 ring-indigo-100' : 'border-white/80 hover:border-indigo-100'}`}>
      <button onClick={onClick} className="block w-full text-left">
        <div className="relative h-[118px] overflow-hidden bg-gradient-to-br from-indigo-50 via-sky-50 to-fuchsia-50">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.2),transparent_38%),radial-gradient(circle_at_bottom_left,rgba(236,72,153,0.12),transparent_30%)]" />
          <div className="relative flex h-full items-center justify-between px-5">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/85 px-3 py-1 text-[11px] font-bold text-indigo-700 shadow-sm"><BookOpenCheck className="h-3.5 w-3.5" />{lesson.mon_hoc}</div>
              <p className="text-sm font-bold text-slate-600">Khối {lesson.khoi}{lesson.lop ? ` • ${lesson.lop}` : ''}</p>
            </div>
            <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-white/70 text-4xl shadow-sm ring-1 ring-white">{getSubjectEmoji(lesson.mon_hoc)}</div>
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
