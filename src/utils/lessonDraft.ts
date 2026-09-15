import type { LessonComposerValues } from '../types';

export const LESSON_DRAFT_FORMAT = 'edusmart-lesson-draft-v1';
export type LessonDraft = {
  format: typeof LESSON_DRAFT_FORMAT;
  ownerUid: string;
  savedAt: string;
  values: LessonComposerValues;
  step: string;
  configurationConfirmed: boolean;
  contentNeedsRegeneration: boolean;
};

export function newLessonCreationId() {
  return `LESSON_${globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2, 12)}`}`;
}

export function draftStorageKey(ownerUid: string, lessonId = '') {
  return `${LESSON_DRAFT_FORMAT}:${encodeURIComponent(ownerUid)}:${encodeURIComponent(lessonId || 'new')}`;
}

export function makeLessonDraft(ownerUid: string, values: LessonComposerValues, step: string, configurationConfirmed: boolean, contentNeedsRegeneration: boolean): LessonDraft {
  // The generated lesson and source text are sufficient for recovery; omit the
  // source-file base64 so a PDF cannot exhaust the browser's storage quota.
  const { source_file: _sourceFile, ...rest } = values;
  return { format: LESSON_DRAFT_FORMAT, ownerUid, savedAt: new Date().toISOString(), values: { ...rest, source_file: null }, step, configurationConfirmed, contentNeedsRegeneration };
}

export function parseLessonDraft(text: string, ownerUid: string, lessonId = ''): LessonDraft {
  const draft = JSON.parse(text) as LessonDraft;
  if (draft?.format !== LESSON_DRAFT_FORMAT || draft.ownerUid !== ownerUid
    || !draft.values || typeof draft.values.lesson_name !== 'string'
    || typeof draft.values.mon_id !== 'string' || typeof draft.values.khoi !== 'string'
    || String(draft.values.lesson_id || '') !== lessonId) {
    throw new Error('Bản nháp không đúng định dạng, tài khoản hoặc bài học đang mở.');
  }
  return draft;
}

export function readLessonDraft(ownerUid: string, lessonId = ''): LessonDraft | null {
  try {
    const raw = localStorage.getItem(draftStorageKey(ownerUid, lessonId));
    return raw ? parseLessonDraft(raw, ownerUid, lessonId) : null;
  } catch { return null; }
}

export function writeLessonDraft(draft: LessonDraft): boolean {
  try {
    localStorage.setItem(draftStorageKey(draft.ownerUid, draft.values.lesson_id), JSON.stringify(draft));
    return true;
  } catch { return false; }
}

export function removeLessonDraft(ownerUid: string, lessonId = '') {
  try { localStorage.removeItem(draftStorageKey(ownerUid, lessonId)); } catch { /* storage may be unavailable */ }
}

export async function lessonPayloadFingerprint(payload: LessonComposerValues) {
  const { source_file: _source, client_creation_id: _request, keep_editor_open: _editor, ai_revision_request: _revision, ...data } = payload;
  const canonical = (value: any): any => Array.isArray(value) ? value.map(canonical)
    : value && typeof value === 'object'
      ? Object.fromEntries(Object.keys(value).sort().filter((key) => value[key] !== undefined).map((key) => [key, canonical(value[key])]))
      : value;
  const hash = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(canonical(data))));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
