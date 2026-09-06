import type { Lesson, LessonRow } from '../types';

type LessonScheduleSource = Pick<Lesson | LessonRow, 'thoi_gian_bat_dau' | 'thoi_gian_ket_thuc' | 'cho_phep_hoc_sau_han'>;

export type LessonScheduleAccessState = {
  blocked: boolean;
  reason: 'before_start' | 'after_end' | null;
  startAt: Date | null;
  endAt: Date | null;
  allowAfterEnd: boolean;
  message: string;
  shortLabel: string;
};

function parseLessonDateTime(value: unknown): Date | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isTruthy(value: unknown) {
  return value === true || ['true', '1', 'yes'].includes(String(value || '').trim().toLowerCase());
}

export function formatLessonAccessDateTime(value: Date | null) {
  if (!value) return '';
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(value);
}

export function getLessonScheduleAccess(
  lesson: LessonScheduleSource | null | undefined,
  now: Date = new Date(),
): LessonScheduleAccessState {
  const startAt = parseLessonDateTime(lesson?.thoi_gian_bat_dau);
  const endAt = parseLessonDateTime(lesson?.thoi_gian_ket_thuc);
  const allowAfterEnd = isTruthy(lesson?.cho_phep_hoc_sau_han);

  if (startAt && now.getTime() < startAt.getTime()) {
    const formatted = formatLessonAccessDateTime(startAt);
    return {
      blocked: true,
      reason: 'before_start',
      startAt,
      endAt,
      allowAfterEnd,
      shortLabel: 'Chưa đến giờ',
      message: formatted ? `Bài học sẽ mở lúc ${formatted}.` : 'Bài học chưa đến thời gian mở.',
    };
  }

  if (endAt && now.getTime() > endAt.getTime() && !allowAfterEnd) {
    const formatted = formatLessonAccessDateTime(endAt);
    return {
      blocked: true,
      reason: 'after_end',
      startAt,
      endAt,
      allowAfterEnd,
      shortLabel: 'Đã hết giờ',
      message: formatted ? `Thời gian học đã kết thúc lúc ${formatted}.` : 'Thời gian học của bài này đã kết thúc.',
    };
  }

  return {
    blocked: false,
    reason: null,
    startAt,
    endAt,
    allowAfterEnd,
    shortLabel: '',
    message: '',
  };
}
