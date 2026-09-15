import { test } from 'node:test';
import assert from 'node:assert/strict';
import { firebaseErrorCode, retryLessonContention } from '../src/utils/firebaseErrors.ts';
import { makeLessonDraft, parseLessonDraft, lessonPayloadFingerprint, newLessonCreationId, readLessonDraft, writeLessonDraft, removeLessonDraft } from '../src/utils/lessonDraft.ts';

test('quota, permissions and unavailable errors do not retry; contention is bounded', async () => {
  for (const code of ['resource-exhausted', 'permission-denied', 'unavailable']) {
    let calls = 0;
    await assert.rejects(retryLessonContention(async () => { calls++; throw Object.assign(new Error(code), { code }); }));
    assert.equal(calls, 1);
  }
  let calls = 0;
  assert.equal(await retryLessonContention(async () => {
    if (++calls < 3) throw Object.assign(new Error('conflict'), { code: 'aborted' });
    return 'committed';
  }), 'committed');
  assert.equal(calls, 3);
});

test('error codes survive wrapped errors and cyclic causes are safe', () => {
  const quota = Object.assign(new Error('quota'), { code: 'resource-exhausted' });
  assert.equal(firebaseErrorCode(new Error('stage', { cause: quota })), 'resource-exhausted');
  const cycle = new Error('cycle'); cycle.cause = cycle;
  assert.equal(firebaseErrorCode(cycle), '');
});

test('draft survives reload, omits source-file bytes, and cannot cross accounts', async () => {
  const values = { lesson_name: 'Thông tin', lesson_number: 1, mon_id: 'TIN', khoi: '6', lesson_json: { title: 'Nội dung đã tạo' }, source_file: { data: 'large-pdf-base64' }, client_creation_id: newLessonCreationId() };
  const draft = makeLessonDraft('teacher-a', values, 'publish', true, false);
  assert.equal(draft.values.source_file, null);
  const storage = new Map();
  globalThis.localStorage = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) };
  assert.equal(writeLessonDraft(draft), true);
  assert.equal(readLessonDraft('teacher-a').values.client_creation_id, values.client_creation_id);
  assert.equal(readLessonDraft('teacher-b'), null);
  assert.throws(() => parseLessonDraft(JSON.stringify(draft), 'teacher-b'));
  assert.equal(await lessonPayloadFingerprint(values), await lessonPayloadFingerprint({ ...values, client_creation_id: newLessonCreationId(), source_file: null }));
  assert.notEqual(await lessonPayloadFingerprint(values), await lessonPayloadFingerprint({ ...values, lesson_name: 'Bài khác' }));
  removeLessonDraft('teacher-a');
  assert.equal(readLessonDraft('teacher-a'), null);
});
