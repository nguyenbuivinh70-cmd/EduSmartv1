import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { initializeApp, deleteApp } from 'firebase/app';
import { initializeAuth, inMemoryPersistence, connectAuthEmulator, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { initializeFirestore, memoryLocalCache, connectFirestoreEmulator, terminate, getDocFromServer, doc, Timestamp, FirestoreError } from 'firebase/firestore';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { newLessonCreationId } from '../src/utils/lessonDraft.ts';
import { firebaseErrorCode } from '../src/utils/firebaseErrors.ts';

// Hard guard before loading any application service. Tests only use local emulators.
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8180' || process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9199') {
  throw new Error('Start local Firestore :8180 and Auth :9199 emulators and set the two EMULATOR_HOST variables. No production tests are permitted.');
}
const base = 'schools/hthtv1';
const state = { commits: [], deleteAttempts: 0, probeDeleteAttempts: 0, failStage: '', failures: 0 };
let env, app, db, auth, service;
const accounts = {};
const password = 'local-test-password-123';

async function seed(path, data) { await env.withSecurityRulesDisabled(async (context) => context.firestore().doc(path).set(data)); }
async function raw(path) {
  let result;
  await env.withSecurityRulesDisabled(async (context) => {
    const snap = await context.firestore().doc(path).get();
    result = snap.exists ? snap.data() : null;
  });
  return result;
}
async function login(role) { await signInWithEmailAndPassword(auth, accounts[role].email, password); service.clearFirebaseIdentityCache(); }
function payload(number, overrides = {}) {
  return {
    client_creation_id: newLessonCreationId(), lesson_number: number, lesson_name: `Bài kiểm thử ${number}`, tieu_de: '',
    mon_id: 'TIN', khoi: '6', lop_id: '', pham_vi: 'shared', share_now: true, save_mode: 'publish',
    tom_tat: 'Nội dung kiểm thử', tu_khoa: 'thông tin', source_text: '',
    nam_hoc: '2026-2027', hoc_ky: 'HK1', thoi_gian_bat_dau: '2026-09-01T00:00:00Z',
    lesson_json: { schema_version: 'lesson_v3', title: 'Thông tin', metadata: {}, luyen_tap: { trac_nghiem: [] }, activities: [{ activity_id: 'A1', title: 'Khám phá', activity_type: 'knowledge', pages: [{ page_id: 'P1', title: 'Thông tin', content: 'Nội dung mẫu' }], interactions: [] }] },
    ...overrides,
  };
}

before(async () => {
  const rules = await fs.readFile(new URL('./firestore.rules', import.meta.url), 'utf8');
  env = await initializeTestEnvironment({ projectId: 'hthtv1', firestore: { host: '127.0.0.1', port: 8180, rules } });
  await env.clearFirestore();
  await fetch('http://127.0.0.1:9199/emulator/v1/projects/hthtv1/accounts', { method: 'DELETE' });
  app = initializeApp({ projectId: 'hthtv1', apiKey: 'local-emulator-key', authDomain: 'hthtv1.firebaseapp.com' });
  auth = initializeAuth(app, { persistence: inMemoryPersistence });
  connectAuthEmulator(auth, 'http://127.0.0.1:9199', { disableWarnings: true });
  db = initializeFirestore(app, { localCache: memoryLocalCache() });
  connectFirestoreEmulator(db, '127.0.0.1', 8180);
  for (const role of ['admin', 'teacher', 'student', 'otherTeacher']) {
    const email = `${role.toLowerCase()}@example.invalid`;
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    accounts[role] = { uid: credential.user.uid, email };
    await seed(`${base}/members/${credential.user.uid}`, { authUid: credential.user.uid, userId: `TEST_${role}`, username: role, displayName: role, email, role: role === 'otherTeacher' ? 'teacher' : role, status: 'active', schoolId: 'hthtv1', adminPermission: role === 'admin', grade: '6', gradeScopes: ['6'], allGrades: false, classId: '6A' });
  }
  service = await import('../src/services/firebaseOperational.ts');
  await login('teacher');
  // Fault injection at the application's SDK transport boundary. Successful
  // requests use the real local emulator and the exact V6.88.4 Rules bundled with this source.
  // Internal transport access is confined to this test; no production hooks.
  await getDocFromServer(doc(db, base, 'members', accounts.teacher.uid));
  const connection = db._firestoreClient._onlineComponents.datastore.connection;
  const invoke = connection.invokeRPC.bind(connection);
  connection.invokeRPC = async (rpcName, path, request, ...tokens) => {
    if (rpcName === 'Commit') {
      const writes = request.writes || [];
      state.commits.push(writes);
      const probeDelete = writes.some((write) => write.delete?.includes('/rulesProbes/'));
      const hasDelete = writes.some((write) => write.delete && !write.delete.includes('/rulesProbes/'));
      const isContent = writes.some((write) => write.update?.name?.endsWith('/content/main'));
      const isReserve = !isContent && writes.some((write) => write.update?.name?.includes('/lessonNumberRegistry/'));
      if (probeDelete) {
        // V6.88.4: deliberately fail probe cleanup. A successful probe write is
        // sufficient and cleanup must never block publishing.
        state.probeDeleteAttempts++;
        throw new FirestoreError('resource-exhausted', 'Local test: probe cleanup blocked');
      }
      if (hasDelete) state.deleteAttempts++;
      if (hasDelete || (state.failStage === 'content' && isContent) || (state.failStage === 'reserve' && isReserve)) {
        state.failStage = ''; state.failures++;
        throw new FirestoreError('resource-exhausted', 'Local test: quota exhausted');
      }
    }
    return invoke(rpcName, path, request, ...tokens);
  };

}, { timeout: 60000 });

after(async () => {
  if (db) await terminate(db);
  if (app) await deleteApp(app);
  if (env) await env.cleanup();
});

test('create, repeat, archive and reuse the lesson number while every DELETE is blocked', async () => {
  const data = payload(101);
  const created = await service.saveFirebaseLesson(data);
  const again = await service.saveFirebaseLesson(data);
  assert.equal(created.lesson_id, again.lesson_id);
  const snap = await getDocFromServer(doc(db, base, 'lessons', created.lesson_id));
  assert.equal(snap.data().content_status, 'ready');
  assert.ok(snap.data().access_start_at instanceof Timestamp);
  assert.ok(snap.data().updatedAt instanceof Timestamp);
  await seed(`${base}/learningProgress/history`, { lesson_id: created.lesson_id, assessment_score: 8 });
  await seed(`${base}/lessons/${created.lesson_id}/preparationSubmissions/history`, { ownerUid: 'historical-student', watchPercent: 90 });
  const archived = await service.deleteFirebaseLesson(created.lesson_id);
  assert.equal(archived.archived, true);
  assert.equal((await raw(`${base}/learningProgress/history`)).assessment_score, 8);
  assert.ok(await raw(`${base}/lessons/${created.lesson_id}/preparationSubmissions/history`));
  const registry = await raw(`${base}/lessonNumberRegistry/${snap.data().lesson_key}`);
  assert.equal(registry.allLessonId, '');
  const replacement = await service.saveFirebaseLesson(payload(101));
  assert.notEqual(replacement.lesson_id, created.lesson_id);
  await service.deleteFirebaseLesson(created.lesson_id);
  assert.equal((await raw(`${base}/lessonNumberRegistry/${snap.data().lesson_key}`)).allLessonId, replacement.lesson_id);
  assert.equal(state.deleteAttempts, 0);
  assert.ok(state.probeDeleteAttempts > 0, 'probe cleanup failure must not block lesson publishing');
});

test('reservation quota failure returns once and a retry creates exactly the same request', async () => {
  const data = payload(102);
  state.failStage = 'reserve';
  const previousFailures = state.failures;
  await assert.rejects(service.saveFirebaseLesson(data), (error) => firebaseErrorCode(error) === 'resource-exhausted');
  assert.equal(state.failures, previousFailures + 1);
  assert.equal(await raw(`${base}/lessons/${data.client_creation_id}`), null);
  assert.equal((await service.saveFirebaseLesson(data)).lesson_id, data.client_creation_id);
});

test('content quota failure retains a private draft and resumes without rollback or duplicate', async () => {
  const data = payload(103, { source_file: { name: 'hoc-lieu.pdf', mimeType: 'application/pdf', size: 123, data: 'source-file-bytes' } });
  state.failStage = 'content';
  await assert.rejects(service.saveFirebaseLesson(data), (error) => error.stage === 'CONTENT_CREATE' && firebaseErrorCode(error) === 'resource-exhausted');
  const pending = await raw(`${base}/lessons/${data.client_creation_id}`);
  assert.equal(pending.content_status, 'preparing');
  assert.equal(pending.pham_vi, 'private');
  assert.equal(pending.trang_thai, 'draft');
  assert.equal(await raw(`${base}/lessons/${data.client_creation_id}/content/main`), null);
  const commitCount = state.commits.length;
  // A downloaded/local draft intentionally omits the source-file bytes.
  await service.saveFirebaseLesson({ ...data, source_file: null });
  const retryWrites = state.commits.slice(commitCount).flat();
  assert.ok(!retryWrites.some((write) => write.update?.name?.includes('/lessonNumberRegistry/')));
  assert.equal((await raw(`${base}/lessons/${data.client_creation_id}`)).content_status, 'ready');
  assert.equal((await raw(`${base}/lessons/${data.client_creation_id}`)).source_file_name, 'hoc-lieu.pdf');
  assert.equal(state.deleteAttempts, 0);
});

test('concurrent requests cannot both claim the same lesson number', async () => {
  const results = await Promise.allSettled([service.saveFirebaseLesson(payload(104)), service.saveFirebaseLesson(payload(104))]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
});

test('archive quota failure keeps the lesson active; retry archives it', async () => {
  const created = await service.saveFirebaseLesson(payload(105));
  state.failStage = 'reserve'; // archive also updates the registry, atomically
  await assert.rejects(service.deleteFirebaseLesson(created.lesson_id), (error) => firebaseErrorCode(error) === 'resource-exhausted');
  assert.notEqual((await raw(`${base}/lessons/${created.lesson_id}`)).trang_thai, 'archived');
  await service.deleteFirebaseLesson(created.lesson_id);
  assert.equal((await raw(`${base}/lessons/${created.lesson_id}`)).trang_thai, 'archived');
});

test('student, wrong-grade teacher and another teacher cannot perform unauthorized operations', async () => {
  const created = await service.saveFirebaseLesson(payload(106));
  await login('student');
  await assert.rejects(service.saveFirebaseLesson(payload(107)));
  await assert.rejects(service.deleteFirebaseLesson(created.lesson_id));
  await login('otherTeacher');
  await assert.rejects(service.deleteFirebaseLesson(created.lesson_id));
  await assert.rejects(service.saveFirebaseLesson(payload(108, { khoi: '9' })));
  await login('teacher');
});

test('listing legacy lessons performs zero migration writes', async () => {
  await login('admin');
  await seed(`${base}/lessons/legacy-local-test`, { lesson_id: 'legacy-local-test', createdByUid: accounts.admin.uid, schoolId: 'hthtv1', khoi: '6', pham_vi: 'private', trang_thai: 'draft', lesson_json: { title: 'Legacy' }, updated_at: new Date().toISOString() });
  const count = state.commits.length;
  await service.listFirebaseLessons();
  assert.equal(state.commits.length, count);
  assert.ok((await raw(`${base}/lessons/legacy-local-test`)).lesson_json);
});

test('admin publishes immediately and can archive a lesson created by a teacher', async () => {
  await login('admin');
  const created = await service.saveFirebaseLesson(payload(109));
  const metadata = await raw(`${base}/lessons/${created.lesson_id}`);
  assert.equal(metadata.trang_thai, 'approved_shared');
  assert.equal(metadata.pham_vi, 'shared');
  await login('teacher');
  const teacherLesson = await service.saveFirebaseLesson(payload(110));
  await login('admin');
  await service.deleteFirebaseLesson(teacherLesson.lesson_id);
  assert.equal((await raw(`${base}/lessons/${teacherLesson.lesson_id}`)).trang_thai, 'archived');
  assert.equal(state.deleteAttempts, 0);
});
