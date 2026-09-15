import type { ReviewPracticeConfig, ReviewPracticeRow } from '../types';

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) return Array.from(new Set(value.map((item) => String(item ?? '').trim()).filter(Boolean)));
  if (typeof value !== 'string') return [];
  const text = value.trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return stringList(parsed);
  } catch {
    // Fall through to CSV-style parsing for legacy values.
  }
  return Array.from(new Set(text.split(/[;,|]/).map((item) => item.trim()).filter(Boolean)));
}

function numberOr(value: unknown, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function boolOr(value: unknown, fallback: boolean) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return ['true', '1', 'yes', 'on'].includes(String(value).toLowerCase());
}

export interface ResolvedPracticeConfig extends ReviewPracticeConfig {
  time_limit_minutes: number;
  max_attempts: number;
  pass_score: number;
  auto_submit_on_timeout: boolean;
  allow_solo: boolean;
  allow_co_learning: boolean;
  show_answers_mode: 'after_submit' | 'after_close' | 'never';
  available_from: string;
  available_until: string;
  target_class_ids: string[];
  locked_class_ids: string[];
}

export function resolvePracticeConfig(review?: ReviewPracticeRow | null, config?: ReviewPracticeConfig | null): ResolvedPracticeConfig {
  const row = review as any;
  const cfg = (config || {}) as any;
  const timeLimit = Math.max(0, numberOr(cfg.time_limit_minutes ?? row?.time_limit_minutes ?? row?.thoi_gian, 0));
  const maxAttempts = Math.max(0, Math.floor(numberOr(cfg.max_attempts ?? row?.max_attempts, cfg.allow_retry === false ? 1 : 0)));
  const passScore = Math.max(0, Math.min(10, numberOr(cfg.pass_score ?? row?.pass_score, 5)));
  const showMode = String(cfg.show_answers_mode ?? row?.show_answers_mode ?? (cfg.show_answers_after_submit === false ? 'never' : 'after_submit'));
  return {
    ...cfg,
    question_types: Array.isArray(cfg.question_types) ? cfg.question_types : [],
    question_count: Math.max(0, numberOr(cfg.question_count ?? row?.so_cau, 0)),
    time_limit_minutes: timeLimit,
    max_attempts: maxAttempts,
    pass_score: passScore,
    auto_submit_on_timeout: boolOr(cfg.auto_submit_on_timeout ?? row?.auto_submit_on_timeout, true),
    allow_solo: boolOr(cfg.allow_solo ?? row?.allow_solo, true),
    allow_co_learning: boolOr(cfg.allow_co_learning ?? row?.allow_co_learning, true),
    show_answers_mode: (['after_submit', 'after_close', 'never'].includes(showMode) ? showMode : 'after_submit') as ResolvedPracticeConfig['show_answers_mode'],
    available_from: String(cfg.available_from ?? row?.available_from ?? '').trim(),
    available_until: String(cfg.available_until ?? row?.available_until ?? '').trim(),
    target_class_ids: stringList(cfg.target_class_ids ?? row?.target_class_ids),
    locked_class_ids: stringList(cfg.locked_class_ids ?? row?.locked_class_ids),
    allow_retry: maxAttempts === 1 ? false : cfg.allow_retry !== false,
  };
}

export type PracticeAccessKey = 'open' | 'locked' | 'scheduled' | 'closed' | 'draft' | 'not_targeted' | 'attempts_exhausted';

export function getPracticeAccessState(
  review: ReviewPracticeRow,
  config: ReviewPracticeConfig | undefined,
  classId: string,
  attemptCount = 0,
  now = Date.now(),
): { key: PracticeAccessKey; canStart: boolean; label: string; reason: string } {
  const resolved = resolvePracticeConfig(review, config);
  if (String(review.trang_thai || 'active') !== 'active') return { key: 'draft', canStart: false, label: 'Bản nháp', reason: 'Bài luyện tập chưa được phát hành.' };
  if (resolved.target_class_ids.length && (!classId || !resolved.target_class_ids.includes(classId))) {
    return { key: 'not_targeted', canStart: false, label: 'Không áp dụng', reason: 'Bài luyện tập không áp dụng cho lớp hiện tại.' };
  }
  if (classId && resolved.locked_class_ids.includes(classId)) return { key: 'locked', canStart: false, label: 'Đang khóa', reason: `Giáo viên đang khóa bài luyện tập cho lớp ${classId}.` };
  const start = resolved.available_from ? new Date(resolved.available_from).getTime() : NaN;
  const end = resolved.available_until ? new Date(resolved.available_until).getTime() : NaN;
  if (Number.isFinite(start) && now < start) return { key: 'scheduled', canStart: false, label: 'Chưa mở', reason: `Bài luyện tập mở lúc ${formatPracticeDateTime(resolved.available_from)}.` };
  if (Number.isFinite(end) && now > end) return { key: 'closed', canStart: false, label: 'Đã kết thúc', reason: `Bài luyện tập đã đóng lúc ${formatPracticeDateTime(resolved.available_until)}.` };
  if (resolved.max_attempts > 0 && attemptCount >= resolved.max_attempts) return { key: 'attempts_exhausted', canStart: false, label: 'Đã hết lượt', reason: `Em đã sử dụng ${attemptCount}/${resolved.max_attempts} lượt.` };
  return { key: 'open', canStart: true, label: 'Đang mở', reason: '' };
}

export function formatPracticeDateTime(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

export function practiceAttemptSummary(attempts: Array<{ diem?: number | string; submitted_at?: string }>) {
  const scores = attempts.map((item) => Number(item.diem)).filter(Number.isFinite);
  const sorted = [...attempts].sort((a, b) => String(b.submitted_at || '').localeCompare(String(a.submitted_at || '')));
  return {
    count: attempts.length,
    best: scores.length ? Math.max(...scores) : null,
    latest: sorted.length && Number.isFinite(Number(sorted[0].diem)) ? Number(sorted[0].diem) : null,
  };
}
