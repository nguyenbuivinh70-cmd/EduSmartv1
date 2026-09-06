import { FirebaseError } from 'firebase/app';
import { deleteApp, getApp, getApps, initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  inMemoryPersistence,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import type { CatalogClass, SchoolYear, Subject } from '../types';

export const FIREBASE_SCHOOL_ID = 'hthtv1';

const firebaseConfig = {
  apiKey: 'AIzaSyDNMWJF48RGi6--SQeVd6DInobyJHgbH5E',
  authDomain: 'hthtv1.firebaseapp.com',
  projectId: 'hthtv1',
  storageBucket: 'hthtv1.firebasestorage.app',
  messagingSenderId: '563200537849',
  appId: '1:563200537849:web:9a59ebe50c6a28279d5e28',
};

const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(firebaseApp);
function createFirestoreClient() {
  try {
    return initializeFirestore(firebaseApp, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch {
    // HMR/Preview co the da khoi tao Firestore; tai su dung instance hien co.
    return getFirestore(firebaseApp);
  }
}
export const firestoreDb = createFirestoreClient();
export { firebaseApp };

export interface FirebaseMemberProfile {
  authUid: string;
  userId: string;
  username: string;
  displayName: string;
  email: string;
  role: 'admin' | 'teacher' | 'student';
  status: string;
  adminPermission: boolean;
  schoolId: string;
  classId: string | null;
  grade: string | null;
}

export interface FirebaseLoginIdentity {
  idToken: string;
  uid: string;
  email: string;
  member: FirebaseMemberProfile;
}

export interface FirebaseProvisionedIdentity {
  uid: string;
  email: string;
  created: boolean;
}

export interface FirebaseVerifiedClassmate extends FirebaseMemberProfile {
  uid: string;
  createdAuth: boolean;
  createdMember: boolean;
}

export interface FirebaseBaseCatalogCounts {
  school_years: number;
  classes: number;
  subjects: number;
}

export interface FirebaseBaseCatalogMigrationSource {
  school_id: string;
  schema_version: number;
  generated_at: string;
  fingerprint: string;
  counts: FirebaseBaseCatalogCounts;
  school_years: SchoolYear[];
  classes: CatalogClass[];
  subjects: Subject[];
}

export interface FirebaseBaseCatalogStatus {
  available: boolean;
  complete: boolean;
  current: boolean;
  sourceFingerprint: string;
  counts: FirebaseBaseCatalogCounts;
  expectedCounts: FirebaseBaseCatalogCounts;
  schoolYears: SchoolYear[];
  classes: CatalogClass[];
  subjects: Subject[];
  completedAt: string;
  updatedByAuthUid: string;
}

export interface FirebaseAccountMigrationItem {
  user_id: string;
  username: string;
  display_name: string;
  role: 'admin' | 'teacher' | 'student';
  status: 'active' | 'inactive' | 'locked';
  admin_permission: boolean;
  class_id: string | null;
  grade: string | null;
  firebase_email: string;
  password_reset_required: boolean;
}

export interface FirebaseAccountMigrationCounts {
  total: number;
  active: number;
  teachers: number;
  students: number;
  admins: number;
  password_resets: number;
}

export interface FirebaseAccountMigrationSource {
  school_id: string;
  schema_version: number;
  generated_at: string;
  fingerprint: string;
  counts: FirebaseAccountMigrationCounts;
  accounts: FirebaseAccountMigrationItem[];
}

export interface FirebaseAccountMigrationStatus {
  available: boolean;
  complete: boolean;
  current: boolean;
  sourceFingerprint: string;
  sourceCount: number;
  migratedCount: number;
  pendingCount: number;
  mismatchCount: number;
  migratedUserIds: string[];
  pendingUserIds: string[];
  mismatchUserIds: string[];
  completedAt: string;
}

function cleanText(value: unknown) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function cleanRecord(raw: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(raw).filter(([, value]) => value !== undefined),
  );
}

function requireSafeDocumentId(value: unknown, fieldName: string) {
  const id = cleanText(value);
  if (!id) throw new Error(`Thiếu mã ${fieldName} khi đồng bộ Firestore.`);
  if (id.includes('/')) throw new Error(`Mã ${fieldName} không được chứa dấu /.`);
  return id;
}

function numberValue(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function emptyCatalogCounts(): FirebaseBaseCatalogCounts {
  return { school_years: 0, classes: 0, subjects: 0 };
}

function normalizeRole(value: unknown): FirebaseMemberProfile['role'] {
  const role = cleanText(value).toLowerCase();
  if (role === 'admin' || role === 'teacher') return role;
  return 'student';
}

function normalizeMember(raw: Record<string, unknown>, uid: string, email: string): FirebaseMemberProfile {
  return {
    authUid: cleanText(raw.authUid),
    userId: cleanText(raw.userId),
    username: cleanText(raw.username),
    displayName: cleanText(raw.displayName),
    email: cleanText(raw.email) || email,
    role: normalizeRole(raw.role),
    status: cleanText(raw.status).toLowerCase(),
    adminPermission: raw.adminPermission === true,
    schoolId: cleanText(raw.schoolId),
    classId: raw.classId === null ? null : cleanText(raw.classId) || null,
    grade: raw.grade === null ? null : cleanText(raw.grade) || null,
  };
}

export function firebaseInternalEmailForUsername(username: string) {
  let localPart = cleanText(username)
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '')
    .replace(/[._-]{2,}/g, '-');
  if (!localPart) localPart = 'user';
  if (localPart.length > 48) localPart = localPart.slice(0, 48).replace(/[._-]+$/g, '');
  return `${localPart}@hthtv1.firebaseapp.com`;
}

export function firebaseErrorMessage(error: unknown) {
  const code = error instanceof FirebaseError ? error.code : '';
  const messages: Record<string, string> = {
    'auth/invalid-email': 'Email không đúng định dạng.',
    'auth/invalid-credential': 'Email hoặc mật khẩu Firebase không đúng.',
    'auth/user-disabled': 'Tài khoản Firebase đã bị vô hiệu hóa.',
    'auth/too-many-requests': 'Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau.',
    'auth/network-request-failed': 'Không kết nối được Firebase. Vui lòng kiểm tra Internet.',
    'permission-denied': 'Firestore từ chối truy cập dữ liệu. Hãy Publish firestore.rules đi kèm bản V6.68.0 và kiểm tra hồ sơ thành viên có status=active, schoolId=hthtv1.',
    'firestore/permission-denied': 'Firestore từ chối truy cập dữ liệu. Hãy Publish firestore.rules đi kèm bản V6.68.0 và kiểm tra hồ sơ thành viên có status=active, schoolId=hthtv1.',
  };
  if (messages[code]) return messages[code];
  if (code.includes('api-key-not-valid') || (error instanceof Error && error.message.includes('api-key-not-valid'))) {
    return 'Khóa cấu hình Firebase không hợp lệ. Vui lòng dùng bản EduSmart V6.54.1 trở lên.';
  }
  return error instanceof Error && error.message
    ? error.message
    : 'Không thể xác thực với Firebase.';
}

export function shouldFallbackToLegacyLogin(error: unknown) {
  const code = error instanceof FirebaseError ? error.code : '';
  return ['auth/invalid-credential', 'auth/user-not-found', 'auth/wrong-password'].includes(code);
}

export async function loadValidatedCurrentFirebaseMember() {
  const current = firebaseAuth.currentUser;
  if (!current) throw new Error('Bạn cần đăng nhập Firebase để sử dụng kho dữ liệu mới.');
  const uid = current.uid;
  const signedInEmail = cleanText(current.email || '').toLowerCase();
  const memberRef = doc(firestoreDb, 'schools', FIREBASE_SCHOOL_ID, 'members', uid);
  let memberSnapshot = await getDoc(memberRef);
  if (!memberSnapshot.exists()) throw new Error('Không tìm thấy hồ sơ thành viên Firebase.');

  const rawMember = memberSnapshot.data();
  const identityRepair: Record<string, unknown> = {};
  if (!cleanText(rawMember.schoolId)) identityRepair.schoolId = FIREBASE_SCHOOL_ID;
  if (!cleanText(rawMember.authUid)) identityRepair.authUid = uid;
  if (Object.keys(identityRepair).length) {
    try {
      await updateDoc(memberRef, { ...identityRepair, updatedAt: serverTimestamp() });
      const repairedSnapshot = await getDoc(memberRef);
      if (repairedSnapshot.exists()) memberSnapshot = repairedSnapshot;
    } catch {
      // Rules cũ chưa Publish: bước xác thực dưới sẽ trả lỗi có hướng xử lý.
    }
  }

  const member = normalizeMember(memberSnapshot.data(), uid, signedInEmail);
  if (member.authUid !== uid) throw new Error('Hồ sơ thành viên thiếu/sai authUid. Hãy Publish firestore.rules V6.68.0 rồi đăng nhập lại.');
  if (member.schoolId !== FIREBASE_SCHOOL_ID) throw new Error(`Hồ sơ thành viên thiếu/sai schoolId (cần ${FIREBASE_SCHOOL_ID}). Hãy Publish firestore.rules V6.68.0 rồi đăng nhập lại.`);
  if (member.status !== 'active') throw new Error('Tài khoản thành viên đang bị khóa hoặc chưa kích hoạt.');
  if (!member.userId) throw new Error('Hồ sơ thành viên chưa có trường userId.');
  return { uid, ...member };
}

export async function signInAndLoadMember(email: string, password: string): Promise<FirebaseLoginIdentity> {
  await setPersistence(firebaseAuth, browserLocalPersistence);
  const credential = await signInWithEmailAndPassword(firebaseAuth, email.trim(), password);
  const uid = credential.user.uid;
  const signedInEmail = cleanText(credential.user.email || email).toLowerCase();

  try {
    const memberRef = doc(firestoreDb, 'schools', FIREBASE_SCHOOL_ID, 'members', uid);
    let memberSnapshot = await getDoc(memberRef);
    if (!memberSnapshot.exists()) {
      const studentCode = signedInEmail.endsWith('@hthtv1.firebaseapp.com')
        ? signedInEmail.slice(0, -'@hthtv1.firebaseapp.com'.length)
        : '';
      if (!/^\d{6,}$/.test(studentCode)) {
        throw new Error(`Chưa có hồ sơ thành viên tại schools/${FIREBASE_SCHOOL_ID}/members/${uid}.`);
      }
      const rosterRef = doc(firestoreDb, 'schools', FIREBASE_SCHOOL_ID, 'studentRoster', studentCode);
      const rosterSnapshot = await getDoc(rosterRef);
      if (!rosterSnapshot.exists()) {
        throw new Error('Mã học sinh chưa có trong danh sách được quản trị viên nhập.');
      }
      const roster = rosterSnapshot.data();
      const rosterStatus = cleanText(roster.status).toLowerCase() || 'active';
      if (rosterStatus !== 'active') throw new Error('Tài khoản học sinh đang bị khóa hoặc chưa kích hoạt.');
      const now = new Date().toISOString();
      await setDoc(memberRef, cleanRecord({
        authUid: uid,
        userId: cleanText(roster.userId) || `HS_${studentCode}`,
        username: studentCode,
        displayName: cleanText(roster.displayName),
        email: signedInEmail,
        role: 'student',
        status: 'active',
        adminPermission: false,
        schoolId: FIREBASE_SCHOOL_ID,
        classId: cleanText(roster.classId) || null,
        grade: cleanText(roster.grade) || null,
        studentCode,
        birthDate: cleanText(roster.birthDate),
        gender: cleanText(roster.gender),
        phone: cleanText(roster.phone),
        note: cleanText(roster.note),
        academicYear: cleanText(roster.academicYear),
        source: 'student_roster_activation',
        schemaVersion: 1,
        created_at: cleanText(roster.created_at) || now,
        updated_at: now,
        updatedAt: serverTimestamp(),
      }));
      memberSnapshot = await getDoc(memberRef);
      if (!memberSnapshot.exists()) throw new Error('Không thể kích hoạt hồ sơ học sinh sau khi xác thực.');
    }

    // Một số hồ sơ được tạo ở các bản cũ có thể thiếu schoolId/authUid.
    // Rules V6.68.0 cho phép chính chủ bổ sung đúng hai trường nhận dạng này,
    // giúp tránh tình trạng đăng nhập được nhưng mọi collection phía sau đều bị
    // permission-denied. Việc sửa là best-effort để không phá phiên đăng nhập.
    const rawMember = memberSnapshot.data();
    const identityRepair: Record<string, unknown> = {};
    if (!cleanText(rawMember.schoolId)) identityRepair.schoolId = FIREBASE_SCHOOL_ID;
    if (!cleanText(rawMember.authUid)) identityRepair.authUid = uid;
    if (Object.keys(identityRepair).length) {
      try {
        await updateDoc(memberRef, { ...identityRepair, updatedAt: serverTimestamp() });
        const repairedSnapshot = await getDoc(memberRef);
        if (repairedSnapshot.exists()) memberSnapshot = repairedSnapshot;
      } catch {
        // Nếu Rules cũ chưa được Publish, phần kiểm tra ngay dưới sẽ trả lỗi rõ ràng.
      }
    }

    const member = normalizeMember(memberSnapshot.data(), uid, signedInEmail);
    if (member.authUid !== uid) throw new Error('Hồ sơ thành viên thiếu/sai authUid. Hãy Publish firestore.rules V6.68.0 rồi đăng nhập lại.');
    if (member.schoolId !== FIREBASE_SCHOOL_ID) throw new Error(`Hồ sơ thành viên thiếu/sai schoolId (cần ${FIREBASE_SCHOOL_ID}). Hãy Publish firestore.rules V6.68.0 rồi đăng nhập lại.`);
    if (member.status !== 'active') throw new Error('Tài khoản thành viên đang bị khóa hoặc chưa kích hoạt.');
    if (!member.userId) throw new Error('Hồ sơ thành viên chưa có trường userId.');

    return {
      idToken: await credential.user.getIdToken(true),
      uid,
      email: signedInEmail,
      member,
    };
  } catch (error) {
    await signOut(firebaseAuth).catch(() => undefined);
    throw error;
  }
}

export async function signOutFirebase() {
  await signOut(firebaseAuth);
}

/**
 * Xác thực bạn học trong một Firebase App tạm thời để phiên đăng nhập của học
 * sinh đang mở bài không bị thay đổi. Nếu bạn học mới chỉ có trong
 * `studentRoster`, tài khoản Auth và hồ sơ `members` được kích hoạt tại đây với
 * chính sách mật khẩu ban đầu bằng Mã học sinh.
 */
export async function verifyOrActivateFirebaseClassmateInIsolation(
  identifier: string,
  password: string,
): Promise<FirebaseVerifiedClassmate> {
  const studentCode = cleanText(identifier);
  const normalizedPassword = String(password ?? '');
  if (!/^\d{6,}$/.test(studentCode)) {
    throw new Error('Mã học sinh của bạn học cùng phải có ít nhất 6 chữ số.');
  }
  if (!normalizedPassword) throw new Error('Vui lòng nhập mật khẩu hiện tại của bạn học cùng.');

  const email = firebaseInternalEmailForUsername(studentCode);
  const appName = `edusmart-co-learning-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const isolatedApp = initializeApp(firebaseConfig, appName);
  const isolatedAuth = getAuth(isolatedApp);

  let createdAuth = false;
  let createdMember = false;
  let activationRoster: Record<string, unknown> | null = null;
  try {
    await setPersistence(isolatedAuth, inMemoryPersistence);
    let credential;
    try {
      credential = await signInWithEmailAndPassword(isolatedAuth, email, normalizedPassword);
    } catch (signInError) {
      const code = signInError instanceof FirebaseError ? signInError.code : '';
      const canActivateFromRoster = ['auth/invalid-credential', 'auth/user-not-found', 'auth/wrong-password'].includes(code)
        && normalizedPassword === studentCode;
      if (!canActivateFromRoster) {
        if (['auth/invalid-credential', 'auth/user-not-found', 'auth/wrong-password'].includes(code)) {
          throw new Error('Mã học sinh hoặc mật khẩu xác nhận của bạn học cùng không đúng.');
        }
        throw signInError;
      }

      // Kiểm tra bằng phiên học sinh đang đăng nhập trước khi tạo Auth để mã
      // nhập nhầm không tạo ra tài khoản Firebase mồ côi.
      try {
        const rosterSnapshot = await getDoc(doc(
          firestoreDb,
          'schools',
          FIREBASE_SCHOOL_ID,
          'studentRoster',
          studentCode,
        ));
        if (!rosterSnapshot.exists()) {
          throw new Error('Mã học sinh của bạn học cùng không tồn tại hoặc không thuộc cùng lớp.');
        }
        activationRoster = rosterSnapshot.data();
        if ((cleanText(activationRoster.status).toLowerCase() || 'active') !== 'active') {
          throw new Error('Tài khoản bạn học cùng đang bị khóa hoặc chưa kích hoạt.');
        }
      } catch (rosterError) {
        const rosterCode = rosterError instanceof FirebaseError ? rosterError.code : '';
        if (rosterCode === 'permission-denied' || rosterCode === 'firestore/permission-denied') {
          throw new Error('Chưa thể kiểm tra bạn cùng lớp. Hãy triển khai Firestore Rules V6.68.0 rồi thử lại.');
        }
        throw rosterError;
      }

      try {
        credential = await createUserWithEmailAndPassword(isolatedAuth, email, normalizedPassword);
        createdAuth = true;
      } catch (createError) {
        const createCode = createError instanceof FirebaseError ? createError.code : '';
        if (createCode !== 'auth/email-already-in-use') throw createError;
        try {
          credential = await signInWithEmailAndPassword(isolatedAuth, email, normalizedPassword);
        } catch {
          throw new Error('Mã học sinh đã được kích hoạt nhưng mật khẩu xác nhận không đúng.');
        }
      }
    }

    const uid = credential.user.uid;
    const signedInEmail = cleanText(credential.user.email || email).toLowerCase();
    const isolatedDb = getFirestore(isolatedApp);
    const memberRef = doc(isolatedDb, 'schools', FIREBASE_SCHOOL_ID, 'members', uid);
    let memberSnapshot = await getDoc(memberRef);

    if (!memberSnapshot.exists()) {
      let roster = activationRoster;
      if (!roster) {
        const rosterRef = doc(isolatedDb, 'schools', FIREBASE_SCHOOL_ID, 'studentRoster', studentCode);
        const rosterSnapshot = await getDoc(rosterRef);
        if (!rosterSnapshot.exists()) {
          throw new Error('Mã học sinh của bạn học cùng chưa có trong danh sách nhà trường.');
        }
        roster = rosterSnapshot.data();
      }
      const rosterStatus = cleanText(roster.status).toLowerCase() || 'active';
      if (rosterStatus !== 'active') throw new Error('Tài khoản bạn học cùng đang bị khóa hoặc chưa kích hoạt.');
      const now = new Date().toISOString();
      await setDoc(memberRef, cleanRecord({
        authUid: uid,
        userId: cleanText(roster.userId) || `HS_${studentCode}`,
        username: studentCode,
        displayName: cleanText(roster.displayName),
        email: signedInEmail,
        role: 'student',
        status: 'active',
        adminPermission: false,
        schoolId: FIREBASE_SCHOOL_ID,
        classId: cleanText(roster.classId) || null,
        grade: cleanText(roster.grade) || null,
        studentCode,
        birthDate: cleanText(roster.birthDate),
        gender: cleanText(roster.gender),
        phone: cleanText(roster.phone),
        note: cleanText(roster.note),
        academicYear: cleanText(roster.academicYear),
        source: 'co_learning_roster_activation',
        schemaVersion: 1,
        created_at: cleanText(roster.created_at) || now,
        updated_at: now,
        updatedAt: serverTimestamp(),
      }));
      createdMember = true;
      memberSnapshot = await getDoc(memberRef);
      if (!memberSnapshot.exists()) throw new Error('Không thể kích hoạt hồ sơ của bạn học cùng.');
    }

    const rawClassmateMember = memberSnapshot.data();
    const classmateIdentityRepair: Record<string, unknown> = {};
    if (!cleanText(rawClassmateMember.schoolId)) classmateIdentityRepair.schoolId = FIREBASE_SCHOOL_ID;
    if (!cleanText(rawClassmateMember.authUid)) classmateIdentityRepair.authUid = uid;
    if (Object.keys(classmateIdentityRepair).length) {
      try {
        await updateDoc(memberRef, { ...classmateIdentityRepair, updatedAt: serverTimestamp() });
        const repairedSnapshot = await getDoc(memberRef);
        if (repairedSnapshot.exists()) memberSnapshot = repairedSnapshot;
      } catch {
        // Rules cũ chưa Publish: phần kiểm tra dưới sẽ chặn hồ sơ không đầy đủ.
      }
    }

    const member = normalizeMember(memberSnapshot.data(), uid, signedInEmail);
    if (member.authUid !== uid || member.schoolId !== FIREBASE_SCHOOL_ID) {
      throw new Error('Hồ sơ Firebase của bạn học cùng thiếu/sai authUid hoặc schoolId. Hãy Publish Firestore Rules V6.68.0.');
    }
    if (member.role !== 'student') throw new Error('Tài khoản được nhập không phải tài khoản học sinh.');
    if (member.status !== 'active') throw new Error('Tài khoản bạn học cùng đang bị khóa hoặc chưa kích hoạt.');
    if (member.username !== studentCode || !member.userId) {
      throw new Error('Hồ sơ bạn học cùng không khớp Mã học sinh đã nhập.');
    }

    return { ...member, uid, createdAuth, createdMember };
  } finally {
    await signOut(isolatedAuth).catch(() => undefined);
    await deleteApp(isolatedApp).catch(() => undefined);
  }
}

type IdentityToolkitResponse = {
  localId?: string;
  email?: string;
  idToken?: string;
  error?: { message?: string };
};

async function identityToolkitRequest(
  action: 'signInWithPassword' | 'signUp',
  payload: Record<string, unknown>,
) {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:${action}?key=${encodeURIComponent(firebaseConfig.apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, returnSecureToken: true }),
    },
  );
  const body = (await response.json().catch(() => ({}))) as IdentityToolkitResponse;
  return { response, body };
}

function firebaseImportIdentityError(code: string) {
  const normalized = cleanText(code).split(' : ')[0];
  const messages: Record<string, string> = {
    EMAIL_EXISTS: 'Mã học sinh đã được kích hoạt. Mật khẩu không đúng; hãy liên hệ quản trị viên nếu cần đặt lại mật khẩu.',
    OPERATION_NOT_ALLOWED: 'Firebase Authentication chưa bật phương thức Email/Password.',
    TOO_MANY_ATTEMPTS_TRY_LATER: 'Firebase đang tạm giới hạn số lần tạo tài khoản. Hãy chờ rồi tải lại cùng file để tiếp tục; dữ liệu đã lưu sẽ không bị trùng.',
    QUOTA_EXCEEDED: 'Firebase đã chạm giới hạn tạo tài khoản trong lượt này. Hãy chờ rồi tải lại cùng file để tiếp tục.',
    WEAK_PASSWORD: 'Mã học sinh phải có ít nhất 6 ký tự để dùng làm mật khẩu Firebase.',
    INVALID_EMAIL: 'Không tạo được email nội bộ từ Mã học sinh.',
    USER_DISABLED: 'Tài khoản Firebase đã tồn tại nhưng đang bị vô hiệu hóa. Hãy kích hoạt tài khoản trong Firebase Authentication rồi nhập lại.',
  };
  return messages[normalized] || `Firebase Authentication từ chối tạo tài khoản (${normalized || 'UNKNOWN'}).`;
}

/**
 * Kích hoạt một tài khoản học sinh đúng thời điểm đăng nhập đầu tiên. Hồ sơ
 * `members` được signInAndLoadMember tự nhận từ `studentRoster` sau đó.
 */
export async function registerFirebaseStudentForFirstLogin(identifier: string, password: string) {
  const studentCode = cleanText(identifier);
  const normalizedPassword = cleanText(password);
  if (!/^\d{6,}$/.test(studentCode) || normalizedPassword !== studentCode) {
    throw new Error('Mã học sinh hoặc mật khẩu không đúng. Lần đăng nhập đầu tiên dùng Mã học sinh cho cả hai ô.');
  }
  const email = firebaseInternalEmailForUsername(studentCode);
  let signUp: Awaited<ReturnType<typeof identityToolkitRequest>>;
  try {
    signUp = await identityToolkitRequest('signUp', { email, password: normalizedPassword });
  } catch {
    throw new Error('Không kết nối được Firebase Authentication. Vui lòng kiểm tra Internet rồi thử lại.');
  }
  if (signUp.response.ok && signUp.body.localId) {
    return { uid: cleanText(signUp.body.localId), email, created: true };
  }
  throw new Error(firebaseImportIdentityError(cleanText(signUp.body.error?.message)));
}

/**
 * Tạo hoặc tìm Firebase Auth UID bằng REST, không đăng xuất phiên quản trị đang
 * mở trong SDK. Luồng này cũng tự phục hồi trường hợp Auth đã được tạo ở lần
 * nhập trước nhưng hồ sơ Firestore chưa kịp lưu.
 */
export async function provisionFirebaseIdentityForImport(
  username: string,
  password: string,
): Promise<FirebaseProvisionedIdentity> {
  const normalizedPassword = cleanText(password);
  if (normalizedPassword.length < 6) {
    throw new Error('Mã học sinh phải có ít nhất 6 ký tự để dùng làm mật khẩu Firebase.');
  }
  const email = firebaseInternalEmailForUsername(username);

  let signIn: Awaited<ReturnType<typeof identityToolkitRequest>>;
  try {
    signIn = await identityToolkitRequest('signInWithPassword', { email, password: normalizedPassword });
  } catch {
    throw new Error('Không kết nối được Firebase Authentication. Vui lòng kiểm tra Internet rồi nhập lại.');
  }
  if (signIn.response.ok && signIn.body.localId) {
    return {
      uid: cleanText(signIn.body.localId),
      email: cleanText(signIn.body.email || email).toLowerCase(),
      created: false,
    };
  }
  const signInErrorCode = cleanText(signIn.body.error?.message).split(' : ')[0];
  if (['TOO_MANY_ATTEMPTS_TRY_LATER', 'QUOTA_EXCEEDED', 'OPERATION_NOT_ALLOWED', 'USER_DISABLED'].includes(signInErrorCode)) {
    throw new Error(firebaseImportIdentityError(signInErrorCode));
  }

  let signUp: Awaited<ReturnType<typeof identityToolkitRequest>>;
  try {
    signUp = await identityToolkitRequest('signUp', { email, password: normalizedPassword });
  } catch {
    throw new Error('Không kết nối được Firebase Authentication. Vui lòng kiểm tra Internet rồi nhập lại.');
  }
  if (signUp.response.ok && signUp.body.localId) {
    return {
      uid: cleanText(signUp.body.localId),
      email: cleanText(signUp.body.email || email).toLowerCase(),
      created: true,
    };
  }

  const errorCode = cleanText(signUp.body.error?.message || signIn.body.error?.message);
  throw new Error(firebaseImportIdentityError(errorCode));
}

export async function getFirebaseIdToken(forceRefresh = true) {
  const currentUser = firebaseAuth.currentUser;
  if (!currentUser) throw new Error('Phiên Firebase không còn tồn tại. Vui lòng đăng nhập lại.');
  return currentUser.getIdToken(forceRefresh);
}

export async function updateOwnFirebasePassword(newPassword: string) {
  const currentUser = firebaseAuth.currentUser;
  if (!currentUser) throw new Error('Phiên Firebase không còn tồn tại. Vui lòng đăng nhập lại.');
  const normalized = String(newPassword || '').trim();
  if (normalized.length < 6) throw new Error('Mật khẩu Firebase phải có ít nhất 6 ký tự.');
  await updatePassword(currentUser, normalized);
  return true;
}

export async function loadFirebaseBaseCatalog(expectedFingerprint = ''): Promise<FirebaseBaseCatalogStatus> {
  if (!firebaseAuth.currentUser) {
    return {
      available: false,
      complete: false,
      current: false,
      sourceFingerprint: '',
      counts: emptyCatalogCounts(),
      expectedCounts: emptyCatalogCounts(),
      schoolYears: [],
      classes: [],
      subjects: [],
      completedAt: '',
      updatedByAuthUid: '',
    };
  }

  const schoolRef = doc(firestoreDb, 'schools', FIREBASE_SCHOOL_ID);
  const [schoolYearsSnapshot, classesSnapshot, subjectsSnapshot, markerSnapshot] = await Promise.all([
    getDocs(collection(schoolRef, 'academicYears')),
    getDocs(collection(schoolRef, 'classes')),
    getDocs(collection(schoolRef, 'subjects')),
    getDoc(doc(schoolRef, 'migrations', 'base_catalog_v1')),
  ]);

  const schoolYears = schoolYearsSnapshot.docs.map((item) => ({
    ...(item.data() as Partial<SchoolYear>),
    nam_hoc_id: cleanText(item.data().nam_hoc_id) || item.id,
  } as SchoolYear));
  const classes = classesSnapshot.docs.map((item) => ({
    ...(item.data() as Partial<CatalogClass>),
    lop_id: cleanText(item.data().lop_id) || item.id,
  } as CatalogClass));
  const subjects = subjectsSnapshot.docs.map((item) => ({
    ...(item.data() as Partial<Subject>),
    mon_id: cleanText(item.data().mon_id) || item.id,
  } as Subject));

  const marker = markerSnapshot.exists() ? markerSnapshot.data() : {};
  const counts: FirebaseBaseCatalogCounts = {
    school_years: schoolYears.length,
    classes: classes.length,
    subjects: subjects.length,
  };
  const markerCounts = (marker.counts || {}) as Record<string, unknown>;
  const expectedCounts: FirebaseBaseCatalogCounts = {
    school_years: numberValue(markerCounts.school_years),
    classes: numberValue(markerCounts.classes),
    subjects: numberValue(markerCounts.subjects),
  };
  const sourceFingerprint = cleanText(marker.sourceFingerprint);
  const countMatch =
    counts.school_years === expectedCounts.school_years &&
    counts.classes === expectedCounts.classes &&
    counts.subjects === expectedCounts.subjects;
  const complete = marker.status === 'completed' && countMatch;

  return {
    available: true,
    complete,
    current: complete && (!expectedFingerprint || sourceFingerprint === expectedFingerprint),
    sourceFingerprint,
    counts,
    expectedCounts,
    schoolYears: schoolYears.sort((a, b) => cleanText(b.ten_nam_hoc).localeCompare(cleanText(a.ten_nam_hoc), 'vi')),
    classes: classes.sort((a, b) => cleanText(a.ten_lop).localeCompare(cleanText(b.ten_lop), 'vi')),
    subjects: subjects.sort((a, b) => cleanText(a.ten_mon).localeCompare(cleanText(b.ten_mon), 'vi')),
    completedAt: cleanText(marker.completedAtText),
    updatedByAuthUid: cleanText(marker.updatedByAuthUid),
  };
}

export async function migrateBaseCatalogToFirestore(source: FirebaseBaseCatalogMigrationSource) {
  const currentUser = firebaseAuth.currentUser;
  if (!currentUser) throw new Error('Cần đăng nhập bằng Firebase trước khi đồng bộ dữ liệu.');
  if (cleanText(source.school_id) !== FIREBASE_SCHOOL_ID) throw new Error('Mã trường trong dữ liệu đồng bộ không hợp lệ.');
  if (numberValue(source.schema_version) !== 1) throw new Error('Phiên bản dữ liệu đồng bộ chưa được hỗ trợ.');
  if (!source.school_years?.length || !source.classes?.length || !source.subjects?.length) {
    throw new Error('Dữ liệu nguồn đang trống. Hệ thống đã dừng để không xóa nhầm dữ liệu Firestore.');
  }

  const schoolRef = doc(firestoreDb, 'schools', FIREBASE_SCHOOL_ID);
  const targets = [
    { collectionName: 'academicYears', idField: 'nam_hoc_id', rows: source.school_years },
    { collectionName: 'classes', idField: 'lop_id', rows: source.classes },
    { collectionName: 'subjects', idField: 'mon_id', rows: source.subjects },
  ] as const;
  const existingSnapshots = await Promise.all(
    targets.map((target) => getDocs(collection(schoolRef, target.collectionName))),
  );
  const operationCount = targets.reduce((total, target, index) => total + target.rows.length + existingSnapshots[index].size, 1);
  if (operationCount > 450) {
    throw new Error('Số bản ghi vượt giới hạn đồng bộ an toàn của một lượt. Vui lòng chia dữ liệu thành nhiều đợt.');
  }

  const batch = writeBatch(firestoreDb);
  const deletedCounts: FirebaseBaseCatalogCounts = emptyCatalogCounts();

  targets.forEach((target, targetIndex) => {
    const incomingIds = new Set<string>();
    target.rows.forEach((rawRow) => {
      const row = rawRow as unknown as Record<string, unknown>;
      const documentId = requireSafeDocumentId(row[target.idField], target.idField);
      incomingIds.add(documentId);
      batch.set(doc(schoolRef, target.collectionName, documentId), cleanRecord({
        ...row,
        schoolId: FIREBASE_SCHOOL_ID,
        schemaVersion: 1,
        migrationSource: 'google_sheet',
        migratedAt: serverTimestamp(),
        migratedByAuthUid: currentUser.uid,
      }), { merge: true });
    });

    existingSnapshots[targetIndex].docs.forEach((existingDocument) => {
      if (incomingIds.has(existingDocument.id)) return;
      batch.delete(existingDocument.ref);
      if (target.collectionName === 'academicYears') deletedCounts.school_years += 1;
      if (target.collectionName === 'classes') deletedCounts.classes += 1;
      if (target.collectionName === 'subjects') deletedCounts.subjects += 1;
    });
  });

  const counts: FirebaseBaseCatalogCounts = {
    school_years: source.school_years.length,
    classes: source.classes.length,
    subjects: source.subjects.length,
  };
  batch.set(doc(schoolRef, 'migrations', 'base_catalog_v1'), {
    schoolId: FIREBASE_SCHOOL_ID,
    schemaVersion: 1,
    status: 'completed',
    sourceFingerprint: cleanText(source.fingerprint),
    sourceGeneratedAt: cleanText(source.generated_at),
    counts,
    deletedCounts,
    completedAt: serverTimestamp(),
    completedAtText: new Date().toISOString(),
    updatedByAuthUid: currentUser.uid,
  }, { merge: true });

  await batch.commit();
  return loadFirebaseBaseCatalog(cleanText(source.fingerprint));
}

export async function loadFirebaseAccountMigrationStatus(
  source: FirebaseAccountMigrationSource,
): Promise<FirebaseAccountMigrationStatus> {
  if (!firebaseAuth.currentUser) {
    return {
      available: false,
      complete: false,
      current: false,
      sourceFingerprint: '',
      sourceCount: source.accounts.length,
      migratedCount: 0,
      pendingCount: source.accounts.length,
      mismatchCount: 0,
      migratedUserIds: [],
      pendingUserIds: source.accounts.map((item) => item.user_id),
      mismatchUserIds: [],
      completedAt: '',
    };
  }

  const schoolRef = doc(firestoreDb, 'schools', FIREBASE_SCHOOL_ID);
  const [membersSnapshot, markerSnapshot] = await Promise.all([
    getDocs(collection(schoolRef, 'members')),
    getDoc(doc(schoolRef, 'migrations', 'account_identity_v1')),
  ]);
  const membersByUserId = new Map<string, FirebaseMemberProfile>();
  membersSnapshot.docs.forEach((memberDocument) => {
    const member = normalizeMember(
      memberDocument.data(),
      memberDocument.id,
      cleanText(memberDocument.data().email).toLowerCase(),
    );
    if (member.userId) membersByUserId.set(member.userId, member);
  });

  const migratedUserIds: string[] = [];
  const pendingUserIds: string[] = [];
  const mismatchUserIds: string[] = [];
  source.accounts.forEach((expected) => {
    const member = membersByUserId.get(expected.user_id);
    if (!member) {
      pendingUserIds.push(expected.user_id);
      return;
    }
    const matches =
      member.authUid !== '' &&
      member.schoolId === source.school_id &&
      member.username === expected.username &&
      member.role === expected.role &&
      member.status === expected.status &&
      member.adminPermission === expected.admin_permission &&
      (member.classId || null) === (expected.class_id || null) &&
      (member.grade || null) === (expected.grade || null);
    if (matches) migratedUserIds.push(expected.user_id);
    else mismatchUserIds.push(expected.user_id);
  });

  const marker = markerSnapshot.exists() ? markerSnapshot.data() : {};
  const sourceFingerprint = cleanText(marker.sourceFingerprint);
  const complete = migratedUserIds.length === source.accounts.length && mismatchUserIds.length === 0;
  return {
    available: true,
    complete,
    current: complete && sourceFingerprint === source.fingerprint,
    sourceFingerprint,
    sourceCount: source.accounts.length,
    migratedCount: migratedUserIds.length,
    pendingCount: pendingUserIds.length,
    mismatchCount: mismatchUserIds.length,
    migratedUserIds,
    pendingUserIds,
    mismatchUserIds,
    completedAt: cleanText(marker.completedAtText),
  };
}

export async function finalizeFirebaseAccountMigration(source: FirebaseAccountMigrationSource) {
  const currentUser = firebaseAuth.currentUser;
  if (!currentUser) throw new Error('Cần đăng nhập bằng Firebase trước khi hoàn tất chuyển đổi.');
  await setDoc(doc(firestoreDb, 'schools', FIREBASE_SCHOOL_ID, 'migrations', 'account_identity_v1'), {
    schoolId: FIREBASE_SCHOOL_ID,
    schemaVersion: 1,
    status: 'completed',
    sourceFingerprint: source.fingerprint,
    sourceGeneratedAt: source.generated_at,
    counts: source.counts,
    completedAt: serverTimestamp(),
    completedAtText: new Date().toISOString(),
    updatedByAuthUid: currentUser.uid,
  }, { merge: true });
  return loadFirebaseAccountMigrationStatus(source);
}

export async function updateOwnFirebaseMemberProfile(payload: { displayName?: string; grade?: string; classId?: string }) {
  const currentUser = firebaseAuth.currentUser;
  if (!currentUser) return false;
  const update: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (payload.displayName !== undefined) update.displayName = cleanText(payload.displayName);
  if (payload.grade !== undefined) update.grade = cleanText(payload.grade) || null;
  if (payload.classId !== undefined) update.classId = cleanText(payload.classId) || null;
  await updateDoc(doc(firestoreDb, 'schools', FIREBASE_SCHOOL_ID, 'members', currentUser.uid), update);
  return true;
}

export async function waitForFirebaseUser() {
  if (firebaseAuth.currentUser) return firebaseAuth.currentUser;
  return new Promise<typeof firebaseAuth.currentUser>((resolve) => {
    let unsubscribe = () => undefined;
    const timer = window.setTimeout(() => {
      unsubscribe();
      resolve(firebaseAuth.currentUser);
    }, 5000);
    unsubscribe = onAuthStateChanged(firebaseAuth, (currentUser) => {
      window.clearTimeout(timer);
      unsubscribe();
      resolve(currentUser);
    });
  });
}

export default firebaseApp;
