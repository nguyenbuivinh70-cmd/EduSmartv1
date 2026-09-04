import type { Account, Lesson, LessonRow } from '../types';

export interface StructuredLessonIdentity {
  lessonNumber?: number;
  lessonName: string;
  title: string;
}

export function normalizeLessonNumber(value: unknown): number | undefined {
  const raw = String(value ?? '').trim().replace(/^bài\s*/i, '');
  if (!/^\d+$/.test(raw)) return undefined;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > 999) return undefined;
  return parsed;
}

export function normalizeLessonName(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function parseLessonTitle(title: unknown): StructuredLessonIdentity {
  const raw = normalizeLessonName(title);
  const match = raw.match(/^bài\s*(\d+)\s*(?:[:.\-–—)]\s*)?(.*)$/i);
  if (!match) return { lessonName: raw, title: raw };
  const lessonNumber = normalizeLessonNumber(match[1]);
  const lessonName = normalizeLessonName(match[2]);
  return {
    lessonNumber,
    lessonName,
    title: lessonNumber && lessonName ? buildLessonTitle(lessonNumber, lessonName) : raw,
  };
}

export function resolveLessonIdentity(source: {
  lesson_number?: unknown;
  lesson_name?: unknown;
  tieu_de?: unknown;
}): StructuredLessonIdentity {
  const parsed = parseLessonTitle(source.tieu_de);
  const lessonNumber = normalizeLessonNumber(source.lesson_number) ?? parsed.lessonNumber;
  const lessonName = normalizeLessonName(source.lesson_name) || parsed.lessonName;
  const title = lessonNumber && lessonName
    ? buildLessonTitle(lessonNumber, lessonName)
    : normalizeLessonName(source.tieu_de) || lessonName;
  return { lessonNumber, lessonName, title };
}

export function buildLessonTitle(lessonNumber: unknown, lessonName: unknown): string {
  const number = normalizeLessonNumber(lessonNumber);
  const name = normalizeLessonName(lessonName);
  if (!number) return name;
  return name ? `Bài ${number}: ${name}` : `Bài ${number}`;
}

export function getLessonNumber(lesson: Lesson | LessonRow): number | undefined {
  return resolveLessonIdentity(lesson).lessonNumber;
}

export function getLessonName(lesson: Lesson | LessonRow): string {
  return resolveLessonIdentity(lesson).lessonName;
}

export function getLessonColumnLabel(lesson: Lesson | LessonRow): string {
  const number = getLessonNumber(lesson);
  return number ? `Bài ${number}` : normalizeLessonName(lesson.tieu_de) || 'Bài học';
}

export function compareStructuredLessons(left: Lesson | LessonRow, right: Lesson | LessonRow): number {
  const leftGrade = Number(String(left.khoi || '').replace(/\D+/g, '')) || 999;
  const rightGrade = Number(String(right.khoi || '').replace(/\D+/g, '')) || 999;
  if (leftGrade !== rightGrade) return leftGrade - rightGrade;

  const leftSubject = String(left.mon_id || '').localeCompare(String(right.mon_id || ''), 'vi', { numeric: true, sensitivity: 'base' });
  if (leftSubject !== 0) return leftSubject;

  const leftNumber = getLessonNumber(left) ?? Number.MAX_SAFE_INTEGER;
  const rightNumber = getLessonNumber(right) ?? Number.MAX_SAFE_INTEGER;
  if (leftNumber !== rightNumber) return leftNumber - rightNumber;

  return String(left.tieu_de || '').localeCompare(String(right.tieu_de || ''), 'vi', { numeric: true, sensitivity: 'base' });
}

export function lessonAppliesToStudent(lesson: Lesson | LessonRow, student: Pick<Account, 'khoi' | 'lop_id'>): boolean {
  const lessonGrade = String(lesson.khoi || '').trim();
  const lessonClass = String(lesson.lop_id || '').trim();
  const studentGrade = String(student.khoi || '').trim();
  const studentClass = String(student.lop_id || '').trim();
  return (!lessonGrade || lessonGrade === studentGrade)
    && (!lessonClass || lessonClass === studentClass);
}
