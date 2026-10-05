import type { LessonRetakeAttempt } from '../types';

const PREFIX = 'edusmart:reference-retakes:v6983';
const MAX_ATTEMPTS_PER_LESSON = 20;

function clean(value: unknown) {
  return value == null ? '' : String(value).trim();
}

function storageKey(userKey: string, lessonId: string) {
  return `${PREFIX}:${encodeURIComponent(clean(userKey))}:${encodeURIComponent(clean(lessonId))}`;
}

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function listLocalReferenceRetakes(userKey: string, lessonId: string): LessonRetakeAttempt[] {
  if (!canUseStorage() || !clean(userKey) || !clean(lessonId)) return [];
  try {
    const raw = window.localStorage.getItem(storageKey(userKey, lessonId));
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item === 'object' && clean(item.lesson_id) === clean(lessonId) && clean(item.retake_mode || 'reference') === 'reference')
      .sort((a, b) => clean(b.updated_at || b.started_at).localeCompare(clean(a.updated_at || a.started_at))) as LessonRetakeAttempt[];
  } catch {
    return [];
  }
}

export function getReusableLocalReferenceRetake(userKey: string, lessonId: string): LessonRetakeAttempt | null {
  return listLocalReferenceRetakes(userKey, lessonId).find((item) => clean(item.status) === 'in_progress') || null;
}

export function saveLocalReferenceRetake(userKey: string, attempt: LessonRetakeAttempt): LessonRetakeAttempt {
  if (!canUseStorage() || !clean(userKey) || !clean(attempt.lesson_id) || !clean(attempt.attempt_id)) return attempt;
  try {
    const current = listLocalReferenceRetakes(userKey, attempt.lesson_id);
    const next = [attempt, ...current.filter((item) => clean(item.attempt_id) !== clean(attempt.attempt_id))]
      .sort((a, b) => clean(b.updated_at || b.started_at).localeCompare(clean(a.updated_at || a.started_at)))
      .slice(0, MAX_ATTEMPTS_PER_LESSON);
    window.localStorage.setItem(storageKey(userKey, attempt.lesson_id), JSON.stringify(next));
  } catch {
    // Local persistence is best-effort; an in-memory attempt must still remain usable.
  }
  return attempt;
}

export function getNextLocalReferenceRetakeNumber(userKey: string, lessonId: string) {
  const max = listLocalReferenceRetakes(userKey, lessonId)
    .reduce((value, item) => Math.max(value, Number(item.attempt_number || 0)), 0);
  return max + 1;
}
