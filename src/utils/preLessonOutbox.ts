export interface PreLessonOutboxItem {
  lesson_id: string;
  owner_uid: string;
  user_id?: string;
  video_revision: number;
  video_id?: string;
  watch_percent: number;
  watched_seconds: number;
  duration_seconds: number;
  queued_at: string;
  attempted_at: string;
  retry_count: number;
  last_attempt_at?: string;
  last_error?: string;
  terminal_reason?: 'video_revision_changed' | 'video_changed';
}

const OUTBOX_PREFIX = 'edusmart:prelesson:outbox:v3:';
const LEGACY_V2_PREFIX = 'edusmart:prelesson:outbox:v2:';
const LEGACY_PENDING_PREFIX = 'edusmart:prelesson:pending:v1:';
export const PRELESSON_OUTBOX_EVENT = 'edusmart:prelesson-outbox-changed';

function clean(value: unknown) { return String(value ?? '').trim(); }
function boundedPercent(value: unknown) { return Math.max(0, Math.min(100, Number(value || 0))); }
function nonNegative(value: unknown) { return Math.max(0, Number(value || 0)); }
function revisionOf(value: unknown) { return Math.max(1, Math.floor(Number(value || 1))); }

function itemKey(ownerUid: string, lessonId: string, revision: number) {
  return `${OUTBOX_PREFIX}${clean(ownerUid)}:${clean(lessonId)}:r${revisionOf(revision)}`;
}
function legacyV2Key(userId: string, lessonId: string, revision: number) {
  return `${LEGACY_V2_PREFIX}${clean(userId)}:${clean(lessonId)}:r${revisionOf(revision)}`;
}
function legacyPendingKey(userId: string, lessonId: string, revision: number) {
  return `${LEGACY_PENDING_PREFIX}${clean(userId)}:${clean(lessonId)}:r${revisionOf(revision)}`;
}
function emitChange() { try { window.dispatchEvent(new CustomEvent(PRELESSON_OUTBOX_EVENT)); } catch { /* no-op */ } }

function normalize(raw: Partial<PreLessonOutboxItem>, fallback?: Partial<PreLessonOutboxItem>): PreLessonOutboxItem | null {
  const ownerUid = clean(raw.owner_uid || fallback?.owner_uid);
  const lessonId = clean(raw.lesson_id || fallback?.lesson_id);
  const revision = revisionOf(raw.video_revision || fallback?.video_revision);
  if (!ownerUid || !lessonId) return null;
  const attemptedAt = clean(raw.attempted_at || fallback?.attempted_at) || new Date().toISOString();
  return {
    owner_uid: ownerUid,
    user_id: clean(raw.user_id || fallback?.user_id) || undefined,
    lesson_id: lessonId,
    video_revision: revision,
    video_id: clean(raw.video_id || fallback?.video_id) || undefined,
    watch_percent: boundedPercent(raw.watch_percent ?? fallback?.watch_percent),
    watched_seconds: nonNegative(raw.watched_seconds ?? fallback?.watched_seconds),
    duration_seconds: nonNegative(raw.duration_seconds ?? fallback?.duration_seconds),
    queued_at: clean(raw.queued_at || fallback?.queued_at) || attemptedAt,
    attempted_at: attemptedAt,
    retry_count: Math.max(0, Math.floor(Number(raw.retry_count ?? fallback?.retry_count ?? 0))),
    last_attempt_at: clean(raw.last_attempt_at || fallback?.last_attempt_at) || undefined,
    last_error: clean(raw.last_error || fallback?.last_error) || undefined,
    terminal_reason: raw.terminal_reason === 'video_revision_changed' || raw.terminal_reason === 'video_changed' ? raw.terminal_reason : fallback?.terminal_reason,
  };
}
function parseStored(raw: string | null, fallback?: Partial<PreLessonOutboxItem>) {
  if (!raw) return null;
  try { return normalize(JSON.parse(raw), fallback); } catch { return null; }
}

export function readPreLessonOutboxItem(ownerUid: string, lessonId: string, revision: number, legacyUserId = ''): PreLessonOutboxItem | null {
  const owner = clean(ownerUid);
  if (!owner) return null;
  try {
    const current = parseStored(localStorage.getItem(itemKey(owner, lessonId, revision)));
    if (current) return current;
    const legacyId = clean(legacyUserId);
    if (!legacyId) return null;
    const rawLegacy = localStorage.getItem(legacyV2Key(legacyId, lessonId, revision)) || localStorage.getItem(legacyPendingKey(legacyId, lessonId, revision));
    if (!rawLegacy) return null;
    let parsedRaw: any = null;
    try { parsedRaw = JSON.parse(rawLegacy); } catch { return null; }
    const migrated = normalize({ ...parsedRaw, owner_uid: owner, user_id: legacyId }, { lesson_id: lessonId, video_revision: revision, owner_uid: owner, user_id: legacyId });
    if (!migrated) return null;
    localStorage.setItem(itemKey(owner, lessonId, revision), JSON.stringify(migrated));
    localStorage.removeItem(legacyV2Key(legacyId, lessonId, revision));
    localStorage.removeItem(legacyPendingKey(legacyId, lessonId, revision));
    return migrated;
  } catch { return null; }
}

export function queuePreLessonOutboxItem(value: Omit<PreLessonOutboxItem, 'queued_at' | 'retry_count'> & Partial<Pick<PreLessonOutboxItem, 'queued_at' | 'retry_count'>>) {
  const normalized = normalize(value);
  if (!normalized) return null;
  try {
    const previous = readPreLessonOutboxItem(normalized.owner_uid, normalized.lesson_id, normalized.video_revision, normalized.user_id || '');
    const merged: PreLessonOutboxItem = { ...previous, ...normalized, queued_at: previous?.queued_at || normalized.queued_at || new Date().toISOString(), retry_count: previous?.retry_count || 0, terminal_reason: undefined, last_error: undefined };
    localStorage.setItem(itemKey(merged.owner_uid, merged.lesson_id, merged.video_revision), JSON.stringify(merged));
    if (merged.user_id) {
      localStorage.removeItem(legacyV2Key(merged.user_id, merged.lesson_id, merged.video_revision));
      localStorage.removeItem(legacyPendingKey(merged.user_id, merged.lesson_id, merged.video_revision));
    }
    emitChange();
    return merged;
  } catch { return null; }
}

export function markPreLessonOutboxAttempt(value: PreLessonOutboxItem, error = '', terminalReason?: PreLessonOutboxItem['terminal_reason']) {
  const next: PreLessonOutboxItem = { ...value, retry_count: Math.max(0, Number(value.retry_count || 0)) + 1, last_attempt_at: new Date().toISOString(), last_error: clean(error) || undefined, terminal_reason: terminalReason };
  try { localStorage.setItem(itemKey(next.owner_uid, next.lesson_id, next.video_revision), JSON.stringify(next)); emitChange(); } catch { /* no-op */ }
  return next;
}

export function removePreLessonOutboxItem(ownerUid: string, lessonId: string, revision: number, legacyUserId = '') {
  try {
    localStorage.removeItem(itemKey(ownerUid, lessonId, revision));
    if (legacyUserId) {
      localStorage.removeItem(legacyV2Key(legacyUserId, lessonId, revision));
      localStorage.removeItem(legacyPendingKey(legacyUserId, lessonId, revision));
    }
    emitChange();
  } catch { /* no-op */ }
}

export function listPreLessonOutboxItems(ownerUid: string, options: { retryableOnly?: boolean; legacyUserId?: string } = {}) {
  const owner = clean(ownerUid);
  if (!owner) return [] as PreLessonOutboxItem[];
  const legacyId = clean(options.legacyUserId);
  const items = new Map<string, PreLessonOutboxItem>();
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index) || '';
      if (!key.startsWith(OUTBOX_PREFIX) && !key.startsWith(LEGACY_V2_PREFIX) && !key.startsWith(LEGACY_PENDING_PREFIX)) continue;
      let parsed: PreLessonOutboxItem | null = null;
      if (key.startsWith(OUTBOX_PREFIX)) {
        parsed = parseStored(localStorage.getItem(key));
        if (!parsed || parsed.owner_uid !== owner) continue;
      } else {
        if (!legacyId || (!key.startsWith(`${LEGACY_V2_PREFIX}${legacyId}:`) && !key.startsWith(`${LEGACY_PENDING_PREFIX}${legacyId}:`))) continue;
        let raw: any = null;
        try { raw = JSON.parse(localStorage.getItem(key) || ''); } catch { continue; }
        parsed = normalize({ ...raw, owner_uid: owner, user_id: legacyId }, { owner_uid: owner, user_id: legacyId });
        if (!parsed) continue;
        try { localStorage.setItem(itemKey(owner, parsed.lesson_id, parsed.video_revision), JSON.stringify(parsed)); localStorage.removeItem(key); } catch { /* no-op */ }
      }
      const canonicalKey = itemKey(owner, parsed.lesson_id, parsed.video_revision);
      const existing = items.get(canonicalKey);
      if (!existing || String(parsed.attempted_at) > String(existing.attempted_at)) items.set(canonicalKey, parsed);
    }
  } catch { return []; }
  return Array.from(items.values()).filter((item) => !options.retryableOnly || !item.terminal_reason).sort((a, b) => String(a.queued_at).localeCompare(String(b.queued_at)));
}
