import { AI_MODELS, BACKEND_URL, DEFAULT_VIDEO_POPUP_CONFIG, VIDEO_CONFIG_STORAGE_KEY } from '../constants';
import { normalizeGradeScope } from '../utils/gradeScope';
import { AIConfig, Account, ApiResponse, CatalogClass, CatalogResponse, CoLearningPartnerCredential, CoLearningSession, GoogleSlidesPromptDetailResponse, GoogleSlidesPromptRecord, GoogleSlidesPromptSaveResponse, LearningResultModerationPayload, LearningResultModerationSummary, LessonBuilderDefaultsResponse, LessonBuilderSettings, LessonComment, LessonComposerValues, LessonContentResponse, LessonProgressRecord, LessonRow, PendingShareItem, ReviewPracticeAttempt, ReviewPracticeContentResponse, ReviewPracticeResultStudent, ReviewPracticeResultsResponse, ReviewPracticeRow, SchoolYear, SchoolYearTransferPayload, SchoolYearTransferSummary, MoveStudentsPayload, MoveStudentsSummary, StudentLearningAnalyticsRow, Subject, SystemDiagnostics, SystemDiagnosticIssue, SystemDiagnosticSection, User, VideoPopupConfig, PreLessonProgress, TeachingSession } from '../types';
import {
  FIREBASE_SCHOOL_ID,
  getFirebaseIdToken,
  firebaseInternalEmailForUsername,
  firebaseErrorMessage,
  registerFirebaseStudentForFirstLogin,
  shouldFallbackToLegacyLogin,
  signInAndLoadMember,
  signOutFirebase,
  updateOwnFirebaseMemberProfile,
  verifyOrActivateFirebaseClassmateInIsolation,
  type FirebaseVerifiedClassmate,
  type FirebaseAccountMigrationSource,
  type FirebaseBaseCatalogMigrationSource,
} from './firebase';
import {
  clearFirebaseIdentityCache,
  saveFirebaseHostConsent,
  cleanupFirebaseCoLearningConsents,
  deleteFirebaseLesson,
  repairFirebaseLessonIntegrity,
  getFirebaseLesson,
  findFirebaseReusableCoLearningSession,
  getFirebaseCoLearningSession,
  markFirebaseCoLearningSessionSuperseded,
  listFirebaseLessons,
  saveFirebaseLesson,
  setFirebaseLessonLock,
  submitFirebaseLessonReview,
  listFirebaseProgress,
  saveFirebaseProgress,
  listFirebaseComments,
  saveFirebaseComment,
  deleteFirebaseCatalog,
  deleteFirebaseCatalogBatch,
  deleteFirebaseConfig,
  deleteFirebaseUserAIConfig,
  deleteFirebaseReview,
  deleteFirebaseSlidesPrompt,
  getFirebaseConfig,
  getFirebaseIdentity,
  getFirebaseUserAIConfig,
  getFirebaseReview,
  getFirebaseSlidesPrompt,
  importFirebaseStudentAccountsBatch,
  listFirebaseAccountDirectory,
  listFirebaseCollection,
  listFirebaseClassmates,
  listFirebaseMembers,
  moveFirebaseStudents,
  moderateFirebaseLearningResult,
  listFirebasePendingLessons,
  listFirebaseReviewAttempts,
  listFirebaseReviews,
  listFirebaseSlidesPrompts,
  reviewFirebaseLesson,
  saveFirebaseCatalog,
  saveFirebaseCatalogBatch,
  saveFirebaseCoLearningSession,
  saveFirebaseConfig,
  saveFirebaseReview,
  saveFirebaseSlidesPrompt,
  setFirebaseCurrentAcademicYear,
  getFirebasePreLessonProgress,
  saveFirebasePreLessonProgress,
  listFirebasePreLessonProgress,
  getFirebaseTeachingSession,
  saveFirebaseTeachingSession,
  setFirebaseTeachingActivityAccess,
  submitFirebaseReviewAttempt,
  transferFirebaseAcademicYear,
} from './firebaseOperational';


function normalizeBoolean(value: unknown, fallback = false) {
  if (typeof value === 'boolean') return value;
  const normalized = toCleanString(value).toLowerCase();
  if (!normalized) return fallback;
  return ['true', '1', 'yes', 'y', 'on'].includes(normalized);
}

export function buildYoutubeEmbedUrl(url: string) {
  const raw = toCleanString(url);
  if (!raw) return '';
  if (raw.includes('youtube.com/embed/')) return raw;
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{6,})/i,
    /youtube\.com\/shorts\/([A-Za-z0-9_-]{6,})/i,
    /youtube\.com\/live\/([A-Za-z0-9_-]{6,})/i,
  ];
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match?.[1]) return `https://www.youtube.com/embed/${match[1]}`;
  }
  return '';
}

function normalizeTargetRoles(value: unknown) {
  const items = Array.isArray(value)
    ? value
    : toCleanString(value)
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
  const normalized = Array.from(new Set(items.map((item) => normalizeRole(item))));
  return (normalized.length ? normalized : [...DEFAULT_VIDEO_POPUP_CONFIG.targetRoles]) as VideoPopupConfig['targetRoles'];
}

function normalizeVideoConfig(raw: any): VideoPopupConfig {
  const youtubeUrl = toCleanString(raw?.youtube_url || raw?.youtubeUrl);
  const embedUrl = toCleanString(raw?.embed_url || raw?.embedUrl) || buildYoutubeEmbedUrl(youtubeUrl);
  return {
    enabled: normalizeBoolean(raw?.enabled, Boolean(DEFAULT_VIDEO_POPUP_CONFIG.enabled)),
    youtubeUrl,
    embedUrl,
    title1: toCleanString(raw?.title_1 || raw?.title1) || DEFAULT_VIDEO_POPUP_CONFIG.title1,
    title2: toCleanString(raw?.title_2 || raw?.title2) || DEFAULT_VIDEO_POPUP_CONFIG.title2,
    title3: toCleanString(raw?.title_3 || raw?.title3) || DEFAULT_VIDEO_POPUP_CONFIG.title3,
    description: toCleanString(raw?.description) || DEFAULT_VIDEO_POPUP_CONFIG.description,
    displayMode: (['every_visit', 'session_once', 'daily_once'].includes(toCleanString(raw?.display_mode || raw?.displayMode))
      ? toCleanString(raw?.display_mode || raw?.displayMode)
      : DEFAULT_VIDEO_POPUP_CONFIG.displayMode) as VideoPopupConfig['displayMode'],
    targetRoles: normalizeTargetRoles(raw?.target_roles || raw?.targetRoles),
    dismissible: normalizeBoolean(raw?.dismissible, Boolean(DEFAULT_VIDEO_POPUP_CONFIG.dismissible)),
    primaryButtonLabel: toCleanString(raw?.primary_button_label || raw?.primaryButtonLabel) || DEFAULT_VIDEO_POPUP_CONFIG.primaryButtonLabel,
    secondaryButtonLabel: toCleanString(raw?.secondary_button_label || raw?.secondaryButtonLabel) || DEFAULT_VIDEO_POPUP_CONFIG.secondaryButtonLabel,
    updatedAt: toCleanString(raw?.updated_at || raw?.updatedAt),
    updatedBy: toCleanString(raw?.updated_by || raw?.updatedBy),
  };
}

function getStoredVideoConfig(): VideoPopupConfig {
  if (typeof window === 'undefined') return normalizeVideoConfig(DEFAULT_VIDEO_POPUP_CONFIG as Partial<VideoPopupConfig>);
  try {
    const saved = localStorage.getItem(VIDEO_CONFIG_STORAGE_KEY);
    if (!saved) return normalizeVideoConfig(DEFAULT_VIDEO_POPUP_CONFIG as Partial<VideoPopupConfig>);
    return normalizeVideoConfig(JSON.parse(saved));
  } catch {
    return normalizeVideoConfig(DEFAULT_VIDEO_POPUP_CONFIG as Partial<VideoPopupConfig>);
  }
}

function storeVideoConfig(config: VideoPopupConfig) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(VIDEO_CONFIG_STORAGE_KEY, JSON.stringify(config));
}

function normalizeRole(role: unknown): 'admin' | 'teacher' | 'student' {
  const normalized = String(role || '').trim().toLowerCase();
  if (normalized === 'admin') return 'admin';
  if (normalized === 'teacher' || normalized === 'giaovien' || normalized === 'giao_vien') return 'teacher';
  return 'student';
}

function looksLikeHtml(text: string) {
  const normalized = text.trim().toLowerCase();
  return normalized.startsWith('<!doctype') || normalized.startsWith('<html') || normalized.includes('<body');
}

function isIsoDateString(value: unknown) {
  if (typeof value !== 'string') return false;
  return /^\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z)?)?$/.test(value.trim());
}

function looksLikeSlashDate(value: string) {
  return /^\d{1,2}\/\d{1,2}(?:\/\d{2,4})?$/.test(value.trim());
}

function looksLikeSpreadsheetSerial(value: string) {
  return /^\d{4,6}(?:\.0+)?$/.test(value.trim());
}

function toCleanString(value: unknown) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function formatVietnameseMessage(message: unknown) {
  const raw = toCleanString(message);
  if (!raw) return '';
  const exact: Record<string, string> = {
    'Khong tao duoc phan hoi JSONP': 'Không tạo được phản hồi JSONP.',
    'JSON khong hop le': 'Dữ liệu JSON không hợp lệ.',
    'Action khong ho tro': 'Chức năng này chưa được backend hỗ trợ. Vui lòng cập nhật Apps Script, chạy setupApp() và triển khai lại Web App.',
    'Loi he thong': 'Lỗi hệ thống.',
    'OK': 'OK',
    'Da bootstrap he thong': 'Đã khởi tạo hệ thống.',
    'Dang nhap thanh cong': 'Đăng nhập thành công.',
    'Da dang xuat': 'Đã đăng xuất.',
    'Da cap nhat ho so ca nhan': 'Đã cập nhật hồ sơ cá nhân.',
    'Da luu cau hinh AI theo tai khoan': 'Đã lưu cấu hình AI theo tài khoản.',
    'Da luu cau hinh mac dinh tao bai hoc': 'Đã lưu cấu hình mặc định tạo bài học.',
    'Da xoa cau hinh mac dinh tao bai hoc': 'Đã khôi phục cấu hình tạo bài học mặc định của hệ thống.',
    'Da luu prompt trinh chieu': 'Đã lưu prompt trình chiếu vào Google Drive.',
    'Da xoa prompt trinh chieu': 'Đã xóa prompt trình chiếu.',
    'Da xoa API key cua tai khoan': 'Đã xóa API key của tài khoản.',
    'Da luu cau hinh video': 'Đã lưu cấu hình video.',
    'Da tao nam hoc': 'Đã tạo năm học.',
    'Da cap nhat nam hoc': 'Đã cập nhật năm học.',
    'Da dat nam hoc hien hanh': 'Đã đặt năm học hiện hành.',
    'Da tao tai khoan': 'Đã tạo tài khoản.',
    'Da cap nhat tai khoan': 'Đã cập nhật tài khoản.',
    'Da xoa tai khoan': 'Đã xóa tài khoản.',
    'Da xu ly xoa nhieu tai khoan': 'Đã xử lý xóa nhiều tài khoản.',
    'Da reset mat khau cac tai khoan da chon': 'Đã reset mật khẩu các tài khoản đã chọn.',
    'Da tao lop': 'Đã tạo lớp.',
    'Da cap nhat lop': 'Đã cập nhật lớp.',
    'Da xoa lop': 'Đã xóa lớp.',
    'Da chuyen hoc sinh sang lop dich': 'Đã chuyển học sinh sang lớp đích.',
    'Da xu ly xoa cac lop da chon': 'Đã xử lý xóa các lớp đã chọn.',
    'Da tao mon hoc': 'Đã tạo môn học.',
    'Da cap nhat mon hoc': 'Đã cập nhật môn học.',
    'Da xoa mon hoc': 'Đã xóa môn học.',
    'Da bat dau phien hoc cung': 'Đã bắt đầu phiên học cùng.',
    'Da tao bai hoc': 'Đã tạo bài học.',
    'Da cap nhat bai hoc': 'Đã cập nhật bài học.',
    'Da xoa bai hoc': 'Đã xóa bài học.',
    'Da gui bai hoc cho admin duyet': 'Đã gửi bài học cho admin duyệt.',
    'Da xu ly duyet bai hoc': 'Đã xử lý duyệt bài học.',
    'Da luu tien trinh hoc tap': 'Đã lưu tiến trình học tập.',
    'Da tao bai on tap': 'Đã tạo bài ôn tập.',
    'Da cap nhat bai on tap': 'Đã cập nhật bài ôn tập.',
    'Da xoa bai on tap': 'Đã xóa bài ôn tập.',
    'Da nop bai on tap': 'Đã nộp bài ôn tập.',
    'Da them binh luan': 'Đã thêm bình luận.',
    'Da cap nhat binh luan': 'Đã cập nhật bình luận.',
    'Ban khong co quyen xem cau hinh nam hoc': 'Bạn không có quyền xem cấu hình năm học.',
    'Ban khong co quyen thuc hien chuc nang nay': 'Bạn không có quyền thực hiện chức năng này.',
    'Phien dang nhap khong hop le': 'Phiên đăng nhập không hợp lệ.',
    'Tai khoan hien khong con hop le. Vui long dang nhap lai.': 'Tài khoản hiện không còn hợp lệ. Vui lòng đăng nhập lại.',
    'Nam hoc da ton tai': 'Năm học đã tồn tại.',
    'Khong tim thay nam hoc': 'Không tìm thấy năm học.',
    'Khong tim thay bai hoc': 'Không tìm thấy bài học.',
    'Khong tim thay tai khoan': 'Không tìm thấy tài khoản.',
    'Khong tim thay lop hoc': 'Không tìm thấy lớp học.',
    'Khong tim thay mon hoc': 'Không tìm thấy môn học.',
  };
  if (exact[raw]) return exact[raw];
  let msg = raw;
  const replacements: Array<[RegExp, string]> = [
    [/Khong/g, 'Không'], [/khong/g, 'không'], [/Da /g, 'Đã '], [/ da /g, ' đã '], [/Dang /g, 'Đang '], [/dang /g, 'đang '],
    [/Ban /g, 'Bạn '], [/ban /g, 'bạn '], [/Vui long/g, 'Vui lòng'], [/vui long/g, 'vui lòng'],
    [/nam hoc/g, 'năm học'], [/Nam hoc/g, 'Năm học'], [/hien hanh/g, 'hiện hành'], [/cap nhat/g, 'cập nhật'],
    [/tai khoan/g, 'tài khoản'], [/mat khau/g, 'mật khẩu'], [/lop hoc/g, 'lớp học'], [/mon hoc/g, 'môn học'],
    [/bai hoc/g, 'bài học'], [/tien trinh/g, 'tiến trình'], [/hoc tap/g, 'học tập'], [/binh luan/g, 'bình luận'],
    [/du lieu/g, 'dữ liệu'], [/he thong/g, 'hệ thống'], [/chuc nang/g, 'chức năng'], [/cau hinh/g, 'cấu hình'],
    [/phien/g, 'phiên'], [/quyen/g, 'quyền'], [/truy cap/g, 'truy cập'], [/gui/g, 'gửi'], [/xoa/g, 'xóa'], [/tao/g, 'tạo'],
    [/tim thay/g, 'tìm thấy'], [/hop le/g, 'hợp lệ'], [/bat buoc/g, 'bắt buộc'], [/trang thai/g, 'trạng thái'],
  ];
  replacements.forEach(([pattern, value]) => { msg = msg.replace(pattern, value); });
  return msg;
}

function normalizeApiMessage<T>(response: ApiResponse<T>): ApiResponse<T> {
  if (response && typeof response.message === 'string') {
    return { ...response, message: formatVietnameseMessage(response.message) };
  }
  return response;
}

function normalizeGrade(value: unknown) {
  return toCleanString(value).replace(/\.0+$/, '');
}

function normalizeClassId(value: unknown) {
  return toCleanString(value).toUpperCase();
}

function buildClassId(payload: Record<string, unknown>) {
  const explicit = normalizeClassId(payload.lop_id);
  if (explicit) return explicit;
  const grade = normalizeGrade(payload.khoi) || toCleanString(payload.ten_lop).match(/^\d{1,2}/)?.[0] || '';
  const className = toCleanString(payload.ten_lop)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/^LOP\s*/, '')
    .replace(/\s+/g, '');
  const structured = className.match(/^(\d{1,2})[\/_.-]?([A-Z]?)(\d{1,2})$/);
  if (structured) {
    const suffix = structured[2]
      ? `${structured[2]}${Number(structured[3])}`
      : String(Number(structured[3])).padStart(2, '0');
    return `L${structured[1]}_${suffix}`;
  }
  const suffix = className.replace(/^\d{1,2}/, '').replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || '01';
  const safeGrade = grade || 'X';
  return `L${safeGrade}_${suffix}`;
}

function normalizeGradesList(value: unknown) {
  const grades = toCleanString(value)
    .split(',')
    .map((item) => normalizeGrade(item))
    .filter(Boolean);
  return Array.from(new Set(grades)).join(',');
}

function deriveClassNameFromId(lopId: unknown, khoi?: unknown) {
  const normalizedLopId = normalizeClassId(lopId);
  const match = normalizedLopId.match(/^L(\d+)_(\d+)$/i);
  if (!match) return '';
  const grade = normalizeGrade(khoi || match[1] || '');
  const index = String(parseInt(match[2], 10));
  if (!grade || !index || index === 'NaN') return '';
  return `${grade}/${index}`;
}

function normalizeClassName(rawName: unknown, lopId: unknown, khoi: unknown) {
  const text = toCleanString(rawName);
  const derived = deriveClassNameFromId(lopId, khoi);
  if (!text) return derived;
  if (isIsoDateString(text) || looksLikeSlashDate(text) || looksLikeSpreadsheetSerial(text)) {
    return derived || text;
  }
  return text;
}

function normalizeCatalogClass(raw: any): CatalogClass {
  return {
    lop_id: normalizeClassId(raw?.lop_id || raw?.id),
    ten_lop: normalizeClassName(raw?.ten_lop, raw?.lop_id, raw?.khoi),
    khoi: normalizeGrade(raw?.khoi),
    mo_ta: toCleanString(raw?.mo_ta),
    diem_truong: toCleanString(raw?.diem_truong),
    si_so: Number(raw?.si_so || 0),
    ma_vemis: toCleanString(raw?.ma_vemis),
    giao_vien_chu_nhiem: toCleanString(raw?.giao_vien_chu_nhiem),
    ten_dang_nhap_gvcn: toCleanString(raw?.ten_dang_nhap_gvcn),
    mo_hinh: toCleanString(raw?.mo_hinh),
    trang_thai: toCleanString(raw?.trang_thai),
    created_at: toCleanString(raw?.created_at),
    updated_at: toCleanString(raw?.updated_at),
    nam_hoc: toCleanString(raw?.nam_hoc),
  };
}

function normalizeSubject(raw: any): Subject {
  return {
    mon_id: toCleanString(raw?.mon_id),
    ten_mon: toCleanString(raw?.ten_mon),
    khoi_ap_dung: normalizeGradesList(raw?.khoi_ap_dung),
    trang_thai: toCleanString(raw?.trang_thai),
    created_at: toCleanString(raw?.created_at),
    updated_at: toCleanString(raw?.updated_at),
  };
}

function normalizeAccount(raw: any): Account {
  return {
    user_id: toCleanString(raw?.user_id),
    firebase_uid: toCleanString(raw?.firebase_uid || raw?.firebaseUid || raw?.uid || raw?.authUid),
    email: toCleanString(raw?.email),
    ho_ten: toCleanString(raw?.ho_ten),
    ten_dang_nhap: toCleanString(raw?.ten_dang_nhap),
    vai_tro: normalizeRole(raw?.vai_tro),
    lop_id: normalizeClassId(raw?.lop_id),
    khoi: normalizeGrade(raw?.khoi || raw?.grade),
    khoi_phu_trach: normalizeGradeScope(raw?.khoi_phu_trach ?? raw?.gradeScopes ?? raw?.grade_scope),
    tat_ca_khoi: normalizeBoolean(raw?.tat_ca_khoi ?? raw?.allGrades, false),
    ten_lop: toCleanString(raw?.ten_lop),
    ten_lop_hien_thi: toCleanString(raw?.ten_lop_hien_thi),
    trang_thai: toCleanString(raw?.trang_thai),
    created_at: toCleanString(raw?.created_at),
    updated_at: toCleanString(raw?.updated_at),
    ghi_chu: toCleanString(raw?.ghi_chu),
    ma_hoc_sinh: toCleanString(raw?.ma_hoc_sinh),
    ngay_sinh: toCleanString(raw?.ngay_sinh),
    gioi_tinh: toCleanString(raw?.gioi_tinh || raw?.gender),
    tai_khoan_dinh_danh: toCleanString(raw?.tai_khoan_dinh_danh),
    mat_khau_khoi_tao: toCleanString(raw?.mat_khau_khoi_tao),
    so_luot_dang_nhap: Number(raw?.so_luot_dang_nhap || 0),
    lan_dang_nhap_cuoi: toCleanString(raw?.lan_dang_nhap_cuoi),
    so_dien_thoai: toCleanString(raw?.so_dien_thoai),
    nguon_du_lieu: toCleanString(raw?.nguon_du_lieu),
    da_doi_mat_khau: raw?.da_doi_mat_khau,
    quyen_admin: normalizeBoolean(raw?.quyen_admin, false),
    nam_hoc: toCleanString(raw?.nam_hoc),
    provisioning_status: raw?.provisioning_status === 'pending' ? 'pending' : 'ready',
  };
}

function firebaseMemberToAccount(raw: any): Account {
  return normalizeAccount({
    firebase_uid: raw.uid || raw.authUid,
    email: raw.email,
    user_id: raw.userId || raw.user_id,
    ho_ten: raw.displayName || raw.ho_ten,
    ten_dang_nhap: raw.username || raw.ten_dang_nhap,
    vai_tro: raw.role || raw.vai_tro,
    lop_id: raw.classId || raw.lop_id,
    khoi: raw.grade || raw.khoi,
    khoi_phu_trach: raw.gradeScopes || raw.khoi_phu_trach || raw.grade_scope,
    tat_ca_khoi: raw.allGrades ?? raw.tat_ca_khoi,
    trang_thai: raw.status || raw.trang_thai,
    created_at: raw.createdAt || raw.created_at,
    updated_at: raw.updated_at,
    ghi_chu: raw.note || raw.ghi_chu,
    ma_hoc_sinh: raw.studentCode || raw.ma_hoc_sinh,
    ngay_sinh: raw.birthDate || raw.ngay_sinh,
    gioi_tinh: raw.gender || raw.gioi_tinh,
    tai_khoan_dinh_danh: raw.identityAccount || raw.tai_khoan_dinh_danh,
    so_dien_thoai: raw.phone || raw.so_dien_thoai,
    quyen_admin: raw.adminPermission ?? raw.quyen_admin,
    nam_hoc: raw.academicYear || raw.nam_hoc,
    nguon_du_lieu: 'firebase',
    da_doi_mat_khau: raw.passwordChanged ?? raw.da_doi_mat_khau,
    provisioning_status: raw.provisioningStatus === 'pending' ? 'pending' : 'ready',
  });
}


function normalizeLessonRow(raw: any): LessonRow {
  const rawLessonNumber = Number(raw?.lesson_number);
  return {
    lesson_id: toCleanString(raw?.lesson_id),
    tieu_de: toCleanString(raw?.tieu_de),
    lesson_number: Number.isSafeInteger(rawLessonNumber) && rawLessonNumber > 0 ? rawLessonNumber : undefined,
    lesson_name: toCleanString(raw?.lesson_name),
    lesson_key: toCleanString(raw?.lesson_key),
    arena_question_count: Number.isFinite(Number(raw?.arena_question_count)) ? Math.max(0, Number(raw.arena_question_count)) : undefined,
    arena_ready: raw?.arena_ready === true ? true : raw?.arena_ready === false ? false : undefined,
    lop_id: normalizeClassId(raw?.lop_id),
    khoi: normalizeGrade(raw?.khoi),
    mon_id: toCleanString(raw?.mon_id),
    nguoi_tao_id: toCleanString(raw?.nguoi_tao_id),
    pham_vi: toCleanString(raw?.pham_vi) === 'shared' ? 'shared' : 'private',
    trang_thai: toCleanString(raw?.trang_thai),
    source_file_id: toCleanString(raw?.source_file_id),
    json_file_id: toCleanString(raw?.json_file_id),
    tom_tat: toCleanString(raw?.tom_tat),
    tu_khoa: toCleanString(raw?.tu_khoa),
    nam_hoc: toCleanString(raw?.nam_hoc),
    hoc_ky: toCleanString(raw?.hoc_ky),
    thoi_gian_bat_dau: toCleanString(raw?.thoi_gian_bat_dau),
    thoi_gian_ket_thuc: toCleanString(raw?.thoi_gian_ket_thuc),
    cho_phep_hoc_sau_han: raw?.cho_phep_hoc_sau_han,
    cho_phep_nop_sau_han: raw?.cho_phep_nop_sau_han,
    is_locked: raw?.is_locked === true,
    locked_at: toCleanString(raw?.locked_at),
    locked_by_uid: toCleanString(raw?.locked_by_uid),
    locked_by_name: toCleanString(raw?.locked_by_name),
    intro_video_url: toCleanString(raw?.intro_video_url),
    intro_video_embed_url: toCleanString(raw?.intro_video_embed_url),
    pre_lesson_enabled: raw?.pre_lesson_enabled !== false && Boolean(toCleanString(raw?.intro_video_url || raw?.intro_video_embed_url)),
    pre_lesson_allow_when_locked: raw?.pre_lesson_allow_when_locked !== false,
    pre_lesson_required: raw?.pre_lesson_required === true,
    pre_lesson_completion_threshold: Number.isFinite(Number(raw?.pre_lesson_completion_threshold)) ? Math.max(50, Math.min(100, Number(raw?.pre_lesson_completion_threshold))) : 80,
    pre_lesson_deadline: toCleanString(raw?.pre_lesson_deadline),
    pre_lesson_score_enabled: raw?.pre_lesson_score_enabled !== false && raw?.pre_lesson_enabled !== false,
    pre_lesson_score_weight: Number.isFinite(Number(raw?.pre_lesson_score_weight)) ? Math.max(0, Math.min(30, Number(raw.pre_lesson_score_weight))) : 10,
    content_schema_version: toCleanString(raw?.content_schema_version || raw?.lesson_schema_version) as any,
    builder_settings: raw?.builder_settings && typeof raw.builder_settings === 'object' ? raw.builder_settings : undefined,
    created_at: toCleanString(raw?.created_at),
    updated_at: toCleanString(raw?.updated_at),
  };
}



function normalizeGoogleSlidesPromptRecord(raw: any): GoogleSlidesPromptRecord {
  if (!raw) {
    return { prompt_id: '' };
  }
  return {
    prompt_id: toCleanString(raw.prompt_id),
    lesson_id: toCleanString(raw.lesson_id),
    tieu_de_bai_hoc: toCleanString(raw.tieu_de_bai_hoc),
    mon_id: toCleanString(raw.mon_id),
    khoi: normalizeGrade(raw.khoi),
    lop_id: normalizeClassId(raw.lop_id),
    nam_hoc: toCleanString(raw.nam_hoc),
    hoc_ky: toCleanString(raw.hoc_ky),
    so_slide_de_xuat: raw.so_slide_de_xuat !== undefined && raw.so_slide_de_xuat !== '' ? Number(raw.so_slide_de_xuat) : '',
    phong_cach_de_xuat: toCleanString(raw.phong_cach_de_xuat),
    rationale: toCleanString(raw.rationale),
    prompt_json_file_id: toCleanString(raw.prompt_json_file_id),
    doc_file_id: toCleanString(raw.doc_file_id),
    txt_file_id: toCleanString(raw.txt_file_id),
    doc_url: toCleanString(raw.doc_url),
    txt_url: toCleanString(raw.txt_url),
    json_url: toCleanString(raw.json_url),
    nguoi_tao_id: toCleanString(raw.nguoi_tao_id),
    ho_ten_nguoi_tao: toCleanString(raw.ho_ten_nguoi_tao),
    created_at: toCleanString(raw.created_at),
    updated_at: toCleanString(raw.updated_at),
    trang_thai: toCleanString(raw.trang_thai),
    ghi_chu: toCleanString(raw.ghi_chu),
  };
}

function normalizeReviewPracticeRow(raw: any): ReviewPracticeRow {
  return {
    review_id: toCleanString(raw?.review_id),
    tieu_de: toCleanString(raw?.tieu_de),
    loai_on_tap: toCleanString(raw?.loai_on_tap) || 'custom',
    nam_hoc: toCleanString(raw?.nam_hoc),
    hoc_ky: toCleanString(raw?.hoc_ky),
    mon_id: toCleanString(raw?.mon_id),
    mon_hoc: toCleanString(raw?.mon_hoc),
    khoi: normalizeGrade(raw?.khoi),
    lop_id: normalizeClassId(raw?.lop_id),
    pham_vi: toCleanString(raw?.pham_vi) || 'shared',
    lesson_ids: toCleanString(raw?.lesson_ids),
    source_lesson_titles: toCleanString(raw?.source_lesson_titles),
    so_cau: Number(raw?.so_cau || 0),
    thoi_gian: Number(raw?.thoi_gian || 0),
    cau_hinh: toCleanString(raw?.cau_hinh),
    trang_thai: toCleanString(raw?.trang_thai) || 'active',
    nguoi_tao_id: toCleanString(raw?.nguoi_tao_id || raw?.created_by),
    created_at: toCleanString(raw?.created_at),
    updated_at: toCleanString(raw?.updated_at),
  };
}

function normalizeReviewPracticeAttempt(raw: any): ReviewPracticeAttempt {
  return {
    attempt_id: toCleanString(raw?.attempt_id),
    review_id: toCleanString(raw?.review_id),
    user_id: toCleanString(raw?.user_id),
    lop_id: normalizeClassId(raw?.lop_id),
    nam_hoc: toCleanString(raw?.nam_hoc),
    hoc_ky: toCleanString(raw?.hoc_ky),
    diem: raw?.diem === '' || raw?.diem === undefined ? '' : Number(raw?.diem || 0),
    so_cau_dung: raw?.so_cau_dung === '' || raw?.so_cau_dung === undefined ? '' : Number(raw?.so_cau_dung || 0),
    tong_so_cau: raw?.tong_so_cau === '' || raw?.tong_so_cau === undefined ? '' : Number(raw?.tong_so_cau || 0),
    so_lan_lam: raw?.so_lan_lam === '' || raw?.so_lan_lam === undefined ? '' : Number(raw?.so_lan_lam || 0),
    answers_json: toCleanString(raw?.answers_json),
    started_at: toCleanString(raw?.started_at),
    submitted_at: toCleanString(raw?.submitted_at),
    auto_submitted: normalizeBoolean(raw?.auto_submitted, false),
    time_spent_seconds: raw?.time_spent_seconds === '' || raw?.time_spent_seconds === undefined ? '' : Number(raw?.time_spent_seconds || 0),
  };
}

function normalizeReviewPracticeResultStudent(raw: any): ReviewPracticeResultStudent {
  return {
    user_id: toCleanString(raw?.user_id),
    ho_ten: toCleanString(raw?.ho_ten || raw?.user_id),
    lop_id: normalizeClassId(raw?.lop_id),
    ten_lop: toCleanString(raw?.ten_lop),
    khoi: normalizeGrade(raw?.khoi),
    status: toCleanString(raw?.status) || 'not_started',
    attempt_count: Number(raw?.attempt_count || 0),
    best_score: raw?.best_score === '' || raw?.best_score === undefined ? '' : Number(raw?.best_score || 0),
    latest_score: raw?.latest_score === '' || raw?.latest_score === undefined ? '' : Number(raw?.latest_score || 0),
    average_score: raw?.average_score === '' || raw?.average_score === undefined ? '' : Number(raw?.average_score || 0),
    best_correct: raw?.best_correct === '' || raw?.best_correct === undefined ? '' : Number(raw?.best_correct || 0),
    best_total: raw?.best_total === '' || raw?.best_total === undefined ? '' : Number(raw?.best_total || 0),
    last_submitted_at: toCleanString(raw?.last_submitted_at),
    auto_submitted_count: Number(raw?.auto_submitted_count || 0),
  };
}


function normalizeLessonComment(raw: any): LessonComment {
  return {
    comment_id: toCleanString(raw?.comment_id),
    lesson_id: toCleanString(raw?.lesson_id),
    user_id: toCleanString(raw?.user_id),
    ho_ten: toCleanString(raw?.ho_ten),
    lop_id: normalizeClassId(raw?.lop_id),
    parent_id: toCleanString(raw?.parent_id),
    noi_dung: toCleanString(raw?.noi_dung),
    loai: toCleanString(raw?.loai) || 'binh_luan',
    trang_thai: toCleanString(raw?.trang_thai) || 'visible',
    replied_by: toCleanString(raw?.replied_by),
    created_at: toCleanString(raw?.created_at),
    updated_at: toCleanString(raw?.updated_at),
  };
}

function normalizePendingShareItem(raw: any): PendingShareItem {
  return {
    share: {
      share_id: toCleanString(raw?.share?.share_id),
      lesson_id: toCleanString(raw?.share?.lesson_id),
      nguoi_gui_id: toCleanString(raw?.share?.nguoi_gui_id),
      ngay_gui: toCleanString(raw?.share?.ngay_gui),
      trang_thai_duyet: toCleanString(raw?.share?.trang_thai_duyet),
      admin_duyet_id: toCleanString(raw?.share?.admin_duyet_id),
      ngay_duyet: toCleanString(raw?.share?.ngay_duyet),
      ghi_chu_admin: toCleanString(raw?.share?.ghi_chu_admin),
    },
    lesson: raw?.lesson ? normalizeLessonRow(raw.lesson) : null,
  };
}


function normalizeQuestionAnswerState(raw: any) {
  return {
    questionId: toCleanString(raw?.questionId),
    type: toCleanString(raw?.type),
    submitted: Boolean(raw?.submitted),
    isCorrect: Boolean(raw?.isCorrect),
    selectedOption: raw?.selectedOption === undefined || raw?.selectedOption === null ? undefined : toCleanString(raw?.selectedOption),
    fillSelections: Array.isArray(raw?.fillSelections) ? raw.fillSelections.map((item: unknown) => toCleanString(item)) : [],
  };
}

function normalizeStepDetails(raw: any) {
  const base = { opened: false, viewedComplete: false, completed: false, percent: 0, quizAnswered: 0, quizCorrect: 0, quizTotal: 0, lastVisitedAt: '' };
  const stages = ['khoi_dong', 'hinh_thanh_kien_thuc', 'luyen_tap', 'van_dung', 'tong_ket'] as const;
  const output: any = {};
  stages.forEach((stage) => {
    const value = raw?.[stage] || {};
    output[stage] = {
      ...base,
      opened: Boolean(value.opened),
      viewedComplete: Boolean(value.viewedComplete),
      completed: Boolean(value.completed),
      percent: Number(value.percent || 0),
      quizAnswered: Number(value.quizAnswered || 0),
      quizCorrect: Number(value.quizCorrect || 0),
      quizTotal: Number(value.quizTotal || 0),
      quizAnswers: (() => {
        const answers = value.quizAnswers || {};
        const normalized: Record<string, any> = {};
        Object.keys(answers || {}).forEach((key) => {
          normalized[key] = normalizeQuestionAnswerState(answers[key]);
        });
        return normalized;
      })(),
      sectionProgress: value.sectionProgress && typeof value.sectionProgress === 'object'
        ? value.sectionProgress
        : {},
      finalExam: value.finalExam && typeof value.finalExam === 'object'
        ? {
            ...value.finalExam,
            time_limit_minutes: Number(value.finalExam.time_limit_minutes || 0),
            time_spent_seconds: Number(value.finalExam.time_spent_seconds || 0),
            score: Number(value.finalExam.score || 0),
            total_score: Number(value.finalExam.total_score || 0),
            learning_process_score: Number(value.finalExam.learning_process_score || 0),
            correct_count: Number(value.finalExam.correct_count || 0),
            total_count: Number(value.finalExam.total_count || 0),
            unanswered_count: Number(value.finalExam.unanswered_count || 0),
            attempt_number: Number(value.finalExam.attempt_number || 0),
          }
        : undefined,
      lastVisitedAt: toCleanString(value.lastVisitedAt),
    };
  });
  return output;
}

function parseDateTimeValue(value: unknown) {
  const text = toCleanString(value);
  if (!text) return null;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text) ? text.replace(' ', 'T') + '+07:00' : text;
  const parsed = new Date(normalized);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  const fallback = new Date(text);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function toIsoDateTime(value: unknown) {
  const parsed = parseDateTimeValue(value);
  return parsed ? parsed.toISOString() : '';
}

function toDisplayDateTime(value: unknown) {
  const parsed = parseDateTimeValue(value);
  if (!parsed) return toCleanString(value);
  const pad = (num: number) => String(num).padStart(2, '0');
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())} ${pad(parsed.getHours())}:${pad(parsed.getMinutes())}:${pad(parsed.getSeconds())}`;
}

function toTimestamp(value: unknown) {
  const parsed = parseDateTimeValue(value);
  return parsed ? parsed.getTime() : 0;
}

function normalizeLessonProgressRecord(raw: any): LessonProgressRecord {
  const parsedSteps = typeof raw?.step_details === 'string'
    ? (() => { try { return JSON.parse(raw.step_details); } catch { return {}; } })()
    : raw?.step_details || raw?.step_details_json || {};
  const updatedAtIso = toIsoDateTime(raw?.updated_at);
  return {
    progress_id: toCleanString(raw?.progress_id),
    user_id: toCleanString(raw?.user_id),
    lesson_id: toCleanString(raw?.lesson_id),
    lesson_title: toCleanString(raw?.lesson_title),
    mon_hoc: toCleanString(raw?.mon_hoc),
    khoi: normalizeGrade(raw?.khoi),
    lop_id: normalizeClassId(raw?.lop_id),
    status: (toCleanString(raw?.status) as any) || 'not_started',
    completion_percent: Number(raw?.completion_percent || 0),
    completed_steps: Number(raw?.completed_steps || 0),
    total_steps: Number(raw?.total_steps || 5),
    last_stage: (toCleanString(raw?.last_stage) as any) || 'khoi_dong',
    updated_at: updatedAtIso || toCleanString(raw?.updated_at),
    updated_at_display: toCleanString(raw?.updated_at_display) || toDisplayDateTime(updatedAtIso || raw?.updated_at),
    updated_at_ts: Number(raw?.updated_at_ts || toTimestamp(updatedAtIso || raw?.updated_at) || 0),
    step_details: normalizeStepDetails(parsedSteps),
    quiz_total: Number(raw?.quiz_total || 0),
    quiz_answered: Number(raw?.quiz_answered || 0),
    quiz_correct: Number(raw?.quiz_correct || 0),
    quiz_percent: Number(raw?.quiz_percent || 0),
    assessment_score: raw?.assessment_score === undefined || raw?.assessment_score === null
      ? undefined
      : Number(raw.assessment_score),
    result_state: ['cancelled_retake', 'invalid_cheating'].includes(toCleanString(raw?.result_state))
      ? toCleanString(raw.result_state) as any
      : 'valid',
    result_group_id: toCleanString(raw?.result_group_id),
    result_version: Number(raw?.result_version || 0),
    retake_allowed: raw?.retake_allowed !== false,
    invalidated_reason: toCleanString(raw?.invalidated_reason),
    invalidated_at: toCleanString(raw?.invalidated_at),
    invalidated_by_uid: toCleanString(raw?.invalidated_by_uid),
    invalidated_by_name: toCleanString(raw?.invalidated_by_name),
    last_result_action_id: toCleanString(raw?.last_result_action_id),
    study_mode: toCleanString(raw?.study_mode) === 'co_learning' ? 'co_learning' : 'single',
    co_learning_session_id: toCleanString(raw?.co_learning_session_id),
    co_learner_ids: toCleanString(raw?.co_learner_ids),
    co_learner_user_ids: Array.isArray(raw?.co_learner_user_ids)
      ? raw.co_learner_user_ids.map(toCleanString).filter(Boolean)
      : toCleanString(raw?.co_learner_ids).split(',').map((item) => item.trim()).filter(Boolean),
    co_learner_names: Array.isArray(raw?.co_learner_names)
      ? raw.co_learner_names.map(toCleanString).filter(Boolean)
      : [],
    nam_hoc: toCleanString(raw?.nam_hoc),
  };
}

function normalizeCoLearningSession(raw: any): CoLearningSession | null {
  if (!raw) return null;
  const participantUserIds = Array.isArray(raw.participant_user_ids)
    ? raw.participant_user_ids.map(toCleanString).filter(Boolean)
    : [raw.host_user_id, raw.partner_user_id].map(toCleanString).filter(Boolean);
  const participantUids = Array.isArray(raw.participant_uids)
    ? raw.participant_uids.map(toCleanString).filter(Boolean)
    : [raw.host_uid || raw.ownerUid, raw.partner_uid].map(toCleanString).filter(Boolean);
  const participantNames = Array.isArray(raw.participant_names)
    ? raw.participant_names.map(toCleanString).filter(Boolean)
    : [raw.host_name || raw.host_user_id, raw.partner_name || raw.partner_user_id].map(toCleanString).filter(Boolean);
  return {
    co_learning_session_id: toCleanString(raw.co_learning_session_id || raw.session_id),
    session_id: toCleanString(raw.session_id || raw.co_learning_session_id),
    lesson_id: toCleanString(raw.lesson_id),
    lesson_title: toCleanString(raw.lesson_title),
    host_user_id: toCleanString(raw.host_user_id || participantUserIds[0]),
    host_uid: toCleanString(raw.host_uid || participantUids[0]),
    partner_user_id: toCleanString(raw.partner_user_id || participantUserIds[1]),
    partner_uid: toCleanString(raw.partner_uid || participantUids[1]),
    partner_name: toCleanString(raw.partner_name || participantNames[1]),
    participant_user_ids: participantUserIds,
    participant_uids: participantUids,
    participant_names: participantNames,
    participant_keys: Array.isArray(raw.participant_keys) ? raw.participant_keys.map(toCleanString).filter(Boolean) : [],
    participant_preparation_statuses: Array.isArray(raw.participant_preparation_statuses) ? raw.participant_preparation_statuses.map(toCleanString) as any : [],
    participant_preparation_scores: Array.isArray(raw.participant_preparation_scores) ? raw.participant_preparation_scores.map((value: any) => Number(value || 0)) : [],
    participant_preparation_watch_percents: Array.isArray(raw.participant_preparation_watch_percents) ? raw.participant_preparation_watch_percents.map((value: any) => Number(value || 0)) : [],
    participant_assessment_scores: Array.isArray(raw.participant_assessment_scores) ? raw.participant_assessment_scores.map((value: any) => Number(value || 0)) : [],
    preparation_snapshot_at: toCleanString(raw.preparation_snapshot_at),
    schemaVersion: Number(raw.schemaVersion || 0) || undefined,
    group_size: Number(raw.group_size || participantUserIds.length || 0),
    study_mode: 'co_learning',
    status: toCleanString(raw.status) || 'active',
    started_at: toCleanString(raw.started_at),
    last_active_at: toCleanString(raw.last_active_at),
    verified_at: toCleanString(raw.verified_at),
  };
}

function normalizeSchoolYear(raw: any): SchoolYear {
  return {
    nam_hoc_id: toCleanString(raw?.nam_hoc_id) || toCleanString(raw?.id) || toCleanString(raw?.ten_nam_hoc),
    ten_nam_hoc: toCleanString(raw?.ten_nam_hoc || raw?.nam_hoc || raw?.name),
    ngay_bat_dau: toCleanString(raw?.ngay_bat_dau),
    ngay_ket_thuc: toCleanString(raw?.ngay_ket_thuc),
    trang_thai: toCleanString(raw?.trang_thai) || 'dang_hoat_dong',
    la_hien_hanh: normalizeBoolean(raw?.la_hien_hanh, false),
    ghi_chu: toCleanString(raw?.ghi_chu),
    created_at: toCleanString(raw?.created_at),
    updated_at: toCleanString(raw?.updated_at),
  };
}

function normalizeSystemDiagnosticIssue(raw: any): SystemDiagnosticIssue {
  const severity = toCleanString(raw?.severity) === 'error' ? 'error' : 'warning';
  return {
    severity,
    code: toCleanString(raw?.code),
    title: toCleanString(raw?.title),
    detail: toCleanString(raw?.detail),
  };
}

function normalizeSystemDiagnosticSection(raw: any): SystemDiagnosticSection {
  const issues = Array.isArray(raw?.issues) ? raw.issues.map(normalizeSystemDiagnosticIssue) : [];
  return {
    key: toCleanString(raw?.key),
    label: toCleanString(raw?.label),
    issue_count: Number(raw?.issue_count || issues.length || 0),
    issues,
  };
}

function normalizeSystemDiagnostics(raw: any): SystemDiagnostics {
  const sections = Array.isArray(raw?.sections) ? raw.sections.map(normalizeSystemDiagnosticSection) : [];
  return {
    generated_at: toCleanString(raw?.generated_at),
    summary: {
      total_issues: Number(raw?.summary?.total_issues || 0),
      error_count: Number(raw?.summary?.error_count || 0),
      warning_count: Number(raw?.summary?.warning_count || 0),
      scanned_accounts: Number(raw?.summary?.scanned_accounts || 0),
      scanned_classes: Number(raw?.summary?.scanned_classes || 0),
      scanned_subjects: Number(raw?.summary?.scanned_subjects || 0),
      scanned_lessons: Number(raw?.summary?.scanned_lessons || 0),
      scanned_progress: Number(raw?.summary?.scanned_progress || 0),
      scanned_shares: Number(raw?.summary?.scanned_shares || 0),
    },
    sections,
  };
}


const JSONP_MAX_URL_LENGTH = 18000;

function makeBackendUrl(query = '') {
  const base = BACKEND_URL.trim();
  if (!query) return base;
  return `${base}${base.includes('?') ? '&' : '?'}${query}`;
}

function jsonpRequest<T>(payload: Record<string, unknown>): Promise<ApiResponse<T>> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve({ ok: false, message: '__JSONP_NOT_AVAILABLE__' });
  }

  const callbackName = `__eduSmartJsonp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const params = new URLSearchParams();
  params.set('callback', callbackName);
  params.set('payload', JSON.stringify(payload));
  params.set('_', String(Date.now()));

  const url = makeBackendUrl(params.toString());
  if (url.length > JSONP_MAX_URL_LENGTH) {
    return Promise.resolve({
      ok: false,
      message:
        'Không thể gửi dữ liệu vì trình duyệt đang chặn kết nối POST và dữ liệu quá lớn để dùng kết nối dự phòng. Hãy kiểm tra lại quyền deploy Apps Script.',
    });
  }

  return new Promise((resolve) => {
    let settled = false;
    const script = document.createElement('script');
    const timeout = window.setTimeout(() => {
      cleanup();
      resolve({
        ok: false,
        message:
          'Không nhận được phản hồi từ Apps Script. Hãy chạy setupApp(), cấp quyền, deploy Web App với quyền Anyone và kiểm tra lại URL backend.',
      });
    }, 15000);

    const cleanup = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      try {
        delete (window as any)[callbackName];
      } catch {
        (window as any)[callbackName] = undefined;
      }
      if (script.parentNode) script.parentNode.removeChild(script);
    };

    (window as any)[callbackName] = (data: ApiResponse<T>) => {
      cleanup();
      resolve(normalizeApiMessage(data));
    };

    script.onerror = () => {
      cleanup();
      resolve({
        ok: false,
        message:
          'Không thể tải Web App Apps Script. Hãy kiểm tra link /exec, quyền truy cập Web App và trạng thái deploy.',
      });
    };

    script.async = true;
    script.src = url;
    document.head.appendChild(script);
  });
}

async function requestViaJsonpFallback<T>(payload: Record<string, unknown>): Promise<ApiResponse<T>> {
  if (['createAccount', 'updateAccount', 'deleteAccount', 'batchDeleteAccounts', 'batchResetPasswords'].includes(String(payload.action))) {
    return { ok: false, message: 'Chưa xác nhận được kết quả từ Apps Script. Hãy tải lại danh sách để kiểm tra, rồi thử lại nếu cần. Kiểm tra URL /exec và quyền triển khai Apps Script trong hướng dẫn V6.77.0.' };
  }

  try {
    const fallback = await jsonpRequest<T>(payload);
    if (fallback.message !== '__JSONP_NOT_AVAILABLE__') return fallback;
  } catch {
    // Keep the original connection error below.
  }
  return {
    ok: false,
    message: 'Không thể kết nối Web App Apps Script. Hãy kiểm tra lại deploy, quyền truy cập và URL backend.',
  };
}

async function rawRequest<T>(payload: Record<string, unknown>): Promise<ApiResponse<T>> {
  try {
    const response = await fetch(BACKEND_URL, {
      method: 'POST',
      redirect: 'follow',
      cache: 'no-store',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
        Accept: 'application/json, text/plain, */*',
      },
      body: JSON.stringify(payload),
    });

    const text = await response.text();

    if (!text) {
      return requestViaJsonpFallback<T>(payload);
    }

    if (looksLikeHtml(text)) {
      return requestViaJsonpFallback<T>(payload);
    }

    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      const fallback = await requestViaJsonpFallback<T>(payload);
      if (fallback.ok || fallback.message !== 'Không thể kết nối Web App Apps Script. Hãy kiểm tra lại deploy, quyền truy cập và URL backend.') {
        return fallback;
      }
      return {
        ok: false,
        message: 'Không đọc được phản hồi từ Apps Script. Hãy kiểm tra doPost và định dạng JSON trả về.',
        error: text.slice(0, 300),
      };
    }

    if (typeof parsed !== 'object' || parsed === null || typeof parsed.ok !== 'boolean') {
      return {
        ok: false,
        message: 'Phản hồi từ Apps Script không đúng cấu trúc chuẩn.',
        error: parsed,
      };
    }

    return normalizeApiMessage(parsed as ApiResponse<T>);
  } catch (error) {
    const fallback = await requestViaJsonpFallback<T>(payload);
    if (fallback.ok || fallback.message !== 'Không thể kết nối Web App Apps Script. Hãy kiểm tra lại deploy, quyền truy cập và URL backend.') {
      return fallback;
    }
    return {
      ok: false,
      message: 'Không thể kết nối Web App Apps Script. Hãy kiểm tra lại deploy, quyền truy cập và URL backend.',
      error,
    };
  }
}

export async function apiRequest<T>(action: string, payload: Record<string, unknown> = {}, token?: string): Promise<ApiResponse<T>> {
  let freshToken = token || '';
  if (token) {
    try { freshToken = await getFirebaseIdToken() || token; } catch { /* the server validates the supplied token */ }
  }
  return rawRequest<T>({ action, request_id: globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`,
    ...payload, ...(freshToken ? { token: freshToken, firebase_id_token: freshToken } : {}) });
}

export async function loginApi(identifier: string, mat_khau: string): Promise<ApiResponse<User>> {
  const normalizedIdentifier = identifier.trim();
  if (!normalizedIdentifier) return { ok: false, message: 'Vui lòng nhập tên đăng nhập hoặc email.' };
  try {
    const firebaseEmail = normalizedIdentifier.includes('@')
      ? normalizedIdentifier
      : firebaseInternalEmailForUsername(normalizedIdentifier);
    let firebaseIdentity;
    try {
      firebaseIdentity = await signInAndLoadMember(firebaseEmail, mat_khau);
    } catch (error) {
      const canActivateStudent = !normalizedIdentifier.includes('@')
        && /^\d{6,}$/.test(normalizedIdentifier)
        && mat_khau === normalizedIdentifier
        && shouldFallbackToLegacyLogin(error);
      if (!canActivateStudent) throw error;
      await registerFirebaseStudentForFirstLogin(normalizedIdentifier, mat_khau);
      firebaseIdentity = await signInAndLoadMember(firebaseEmail, mat_khau);
    }
    const member = firebaseIdentity.member;
    return {
      ok: true,
      message: 'Đăng nhập thành công qua Firebase.',
      data: {
        user_id: member.userId,
        ten_dang_nhap: member.username || normalizedIdentifier,
        ho_ten: member.displayName,
        vai_tro: member.role,
        token: firebaseIdentity.idToken,
        lop_id: member.classId || '',
        khoi: member.grade || '',
        khoi_phu_trach: member.gradeScopes || [],
        tat_ca_khoi: member.allGrades === true,
        quyen_admin: member.adminPermission,
        auth_provider: 'firebase',
        firebase_uid: firebaseIdentity.uid,
      },
    };
  } catch (error) {
    await signOutFirebase().catch(() => undefined);
    return { ok: false, message: firebaseErrorMessage(error), error };
  }
}

function normalizeUser(raw: any, token: string): User {
  return {
    user_id: toCleanString(raw?.user_id || raw?.id),
    ten_dang_nhap: toCleanString(raw?.ten_dang_nhap),
    ho_ten: toCleanString(raw?.ho_ten),
    vai_tro: normalizeRole(raw?.vai_tro),
    token: toCleanString(token),
    lop_id: normalizeClassId(raw?.lop_id),
    khoi: normalizeGrade(raw?.khoi || raw?.grade),
    khoi_phu_trach: normalizeGradeScope(raw?.khoi_phu_trach ?? raw?.gradeScopes ?? raw?.grade_scope),
    tat_ca_khoi: normalizeBoolean(raw?.tat_ca_khoi ?? raw?.allGrades, false),
    quyen_admin: normalizeBoolean(raw?.quyen_admin ?? raw?.adminPermission, false),
    auth_provider: toCleanString(raw?.auth_provider) === 'firebase' ? 'firebase' : 'legacy',
    firebase_uid: toCleanString(raw?.firebase_uid),
  };
}

function normalizeAIConfig(raw: any): AIConfig {
  const apiKey = toCleanString(raw?.api_key);
  const apiKeyMasked = toCleanString(raw?.api_key_masked);
  return {
    apiKey,
    model: toCleanString(raw?.model_ai),
    apiKeyMasked: apiKey ? `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}` : apiKeyMasked,
    hasServerKey: normalizeBoolean(raw?.has_api_key, Boolean(apiKey)),
    updatedAt: toCleanString(raw?.updated_at),
  };
}

function normalizeLessonBuilderSettings(raw: any): LessonBuilderSettings | null {
  if (!raw || typeof raw !== 'object') return null;
  const toNumber = (value: unknown, fallback: number, min: number, max: number) => {
    const parsed = Math.floor(Number(value));
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
  };
  const questionTypes = (value: unknown) => {
    const allowed = ['single_choice', 'true_false', 'fill_in_blank'];
    const arr = Array.isArray(value) ? value : toCleanString(value).split(',').map((item) => item.trim()).filter(Boolean);
    const normalized = Array.from(new Set(arr.filter((item) => allowed.includes(String(item)))));
    return (normalized.length ? normalized : ['single_choice', 'true_false', 'fill_in_blank']) as LessonBuilderSettings['final_quiz_question_types'];
  };
  const questionMix = ['mixed', 'single_choice', 'true_false', 'fill_in_blank'].includes(toCleanString(raw.question_mix)) ? raw.question_mix : 'mixed';
  const difficulty = ['easy', 'medium', 'hard', 'mixed'].includes(toCleanString(raw.difficulty)) ? raw.difficulty : 'medium';
  const examScorePolicy = ['best', 'last', 'average'].includes(toCleanString(raw.exam_score_policy)) ? raw.exam_score_policy : 'best';
  return {
    content_count: toNumber(raw.content_count, 0, 0, 20),
    interactive_questions_per_section: toNumber(raw.interactive_questions_per_section, 1, 1, 10),
    final_quiz_count: toNumber(raw.final_quiz_count, 10, 1, 50),
    question_mix: questionMix,
    final_quiz_question_types: questionTypes(raw.final_quiz_question_types),
    difficulty,
    include_examples: normalizeBoolean(raw.include_examples, true),
    include_summary: normalizeBoolean(raw.include_summary, true),
    allow_retry: normalizeBoolean(raw.allow_retry, true),
    show_explanation: normalizeBoolean(raw.show_explanation, true),
    interactive_weight: toNumber(raw.interactive_weight, 40, 0, 100),
    final_quiz_weight: toNumber(raw.final_quiz_weight, 60, 0, 100),
    pass_score: toNumber(raw.pass_score, 5, 0, 10),
    ai_instructions: toCleanString(raw.ai_instructions),
    lesson_time_minutes: toNumber(raw.lesson_time_minutes, 45, 1, 240),
    auto_finish_lesson_on_timeout: normalizeBoolean(raw.auto_finish_lesson_on_timeout, true),
    final_exam_time_minutes: toNumber(raw.final_exam_time_minutes, 15, 1, 180),
    shuffle_final_questions: normalizeBoolean(raw.shuffle_final_questions, true),
    shuffle_final_options: normalizeBoolean(raw.shuffle_final_options, true),
    show_final_answers_after_submit: normalizeBoolean(raw.show_final_answers_after_submit, true),
    allow_exam_retry: normalizeBoolean(raw.allow_exam_retry, true),
    max_exam_attempts: toNumber(raw.max_exam_attempts, 2, 1, 10),
    exam_score_policy: examScorePolicy,
    review_enabled: normalizeBoolean(raw.review_enabled, true),
    review_question_count: toNumber(raw.review_question_count, 20, 1, 100),
    review_question_types: questionTypes(raw.review_question_types),
    review_time_minutes: toNumber(raw.review_time_minutes, 25, 0, 180),
    review_shuffle_questions: normalizeBoolean(raw.review_shuffle_questions, true),
    review_shuffle_options: normalizeBoolean(raw.review_shuffle_options, true),
    review_show_answers_after_submit: normalizeBoolean(raw.review_show_answers_after_submit, true),
    review_allow_retry: normalizeBoolean(raw.review_allow_retry, true),
  };
}

function normalizeLessonBuilderDefaultsResponse(raw: any): LessonBuilderDefaultsResponse {
  let settingsSource = raw?.settings || raw?.lesson_builder_defaults || raw?.lesson_builder_defaults_json || null;
  if (typeof settingsSource === 'string') {
    try { settingsSource = JSON.parse(settingsSource); } catch { settingsSource = null; }
  }
  const settings = normalizeLessonBuilderSettings(settingsSource);
  return {
    settings,
    has_defaults: Boolean(raw?.has_defaults || settings),
    updated_at: toCleanString(raw?.updated_at || raw?.lesson_builder_defaults_updated_at),
    updated_by: toCleanString(raw?.updated_by),
  };
}

export async function getCurrentUserApi(token: string): Promise<ApiResponse<User>> {
  try {
    const member = await getFirebaseIdentity();
    return {
      ok: true,
      message: 'Đã khôi phục phiên trực tiếp từ Firebase.',
      data: normalizeUser({
        user_id: member.userId,
        ten_dang_nhap: member.username,
        ho_ten: member.displayName,
        vai_tro: member.role,
        lop_id: member.classId,
        khoi: member.grade,
        khoi_phu_trach: member.gradeScopes || [],
        tat_ca_khoi: member.allGrades === true,
        quyen_admin: member.adminPermission,
        auth_provider: 'firebase',
        firebase_uid: member.uid,
      }, token),
    };
  } catch (error) {
    return { ok: false, message: 'Phiên Firebase không còn hợp lệ. Vui lòng đăng nhập lại.', error };
  }
}

export async function logoutApi(_token: string) {
  await signOutFirebase().catch(() => undefined);
  return { ok: true, message: 'Đã đăng xuất.', data: { success: true } } as ApiResponse<{ success: boolean }>;
}

export async function getUserConfigApi(token: string): Promise<ApiResponse<AIConfig>> {
  // V6.78.0: API key thật lưu trong Apps Script PropertiesService; Firestore/Sheet
  // chỉ giữ metadata hoặc giá trị đã che. Tự di chuyển document userAIConfigs cũ
  // của chính người đang đăng nhập sang server store rồi xóa bản raw trên Firestore.
  let res = await apiRequest<Record<string, unknown>>('getUserConfig', {}, token);
  if (!res.ok || !res.data) return { ...res, data: undefined } as ApiResponse<AIConfig>;

  try {
    const legacy = await getFirebaseUserAIConfig();
    const legacyKey = toCleanString((legacy as any)?.api_key);
    const legacyModel = toCleanString((legacy as any)?.model_ai) || AI_MODELS[0];
    const serverHasKey = normalizeBoolean((res.data as any)?.has_api_key, false);
    if (legacyKey && !serverHasKey) {
      const migrated = await apiRequest<Record<string, unknown>>('saveUserConfig', {
        api_key: legacyKey,
        model_ai: AI_MODELS.includes(legacyModel) ? legacyModel : AI_MODELS[0],
      }, token);
      if (migrated.ok && migrated.data) res = migrated;
    }
    if (legacy) await deleteFirebaseUserAIConfig();
  } catch {
    // Migration là best-effort; cấu hình server vẫn dùng bình thường nếu cleanup cũ lỗi.
  }

  return { ...res, data: normalizeAIConfig(res.data) };
}


export async function getVideoConfigApi(_token: string): Promise<ApiResponse<VideoPopupConfig>> {
  try {
    const firebaseConfig = await getFirebaseConfig('videoPopup');
    const normalized = firebaseConfig ? normalizeVideoConfig(firebaseConfig) : getStoredVideoConfig();
    storeVideoConfig(normalized);
    return {
      ok: true,
      message: firebaseConfig ? 'Đã tải cấu hình video từ Firebase.' : 'Chưa có cấu hình video trên Firebase; đang dùng giá trị mặc định.',
      data: normalized,
    };
  } catch (error) {
    return { ok: false, message: firebaseErrorMessage(error), error };
  }
}

export async function saveVideoConfigApi(token: string, config: VideoPopupConfig): Promise<ApiResponse<VideoPopupConfig>> {
  const normalized = normalizeVideoConfig({
    ...config,
    embed_url: config.embedUrl || buildYoutubeEmbedUrl(config.youtubeUrl),
    updated_at: new Date().toISOString(),
  });

  storeVideoConfig(normalized);

  const payload = {
    enabled: normalized.enabled,
    youtube_url: normalized.youtubeUrl,
    embed_url: normalized.embedUrl,
    title_1: normalized.title1,
    title_2: normalized.title2,
    title_3: normalized.title3,
    description: normalized.description,
    display_mode: normalized.displayMode,
    target_roles: normalized.targetRoles,
    dismissible: normalized.dismissible,
    primary_button_label: normalized.primaryButtonLabel,
    secondary_button_label: normalized.secondaryButtonLabel,
  };

  try {
    const savedRaw = await saveFirebaseConfig('videoPopup', payload);
    const saved = normalizeVideoConfig(savedRaw);
    storeVideoConfig(saved);
    return { ok: true, message: 'Đã lưu cấu hình video trên Firebase.', data: saved };
  } catch (error) {
    return { ok: false, message: firebaseErrorMessage(error), error };
  }
}

export async function updateProfileApi(token: string, payload: Record<string, unknown>) {
  try {
    await updateOwnFirebaseMemberProfile({ displayName: toCleanString(payload.ho_ten || payload.displayName) });
    clearFirebaseIdentityCache();
    const member = await getFirebaseIdentity();
    return { ok: true, message: 'Đã cập nhật hồ sơ trên Firebase.', data: normalizeUser({
      user_id: member.userId, ten_dang_nhap: member.username, ho_ten: member.displayName,
      vai_tro: member.role, lop_id: member.classId, khoi: member.grade,
      khoi_phu_trach: member.gradeScopes || [], tat_ca_khoi: member.allGrades === true,
      quyen_admin: member.adminPermission, auth_provider: 'firebase', firebase_uid: member.uid,
    }, token) };
  } catch (error) {
    return { ok: false, message: firebaseErrorMessage(error), error };
  }
}

export async function listProfileClassesApi(token: string) {
  try {
    const items = (await listFirebaseCollection('classes')).map(normalizeCatalogClass).filter(item => item.trang_thai !== 'inactive');
    return { ok: true, message: 'Đã tải lớp học từ Firebase.', data: { items, total: items.length } };
  } catch (error) { return { ok: false, message: firebaseErrorMessage(error), error }; }
}

export async function listCatalogApi(_token: string) {
  try {
    const [firebaseClasses, firebaseSubjects] = await Promise.all([
      listFirebaseCollection('classes'),
      listFirebaseCollection('subjects'),
    ]);
    return {
      ok: true,
      message: 'Đã tải danh mục từ Firebase.',
      data: {
        user: { user_id: '', ten_dang_nhap: '', ho_ten: '', vai_tro: 'student', lop_id: '', khoi: '' },
        classes: firebaseClasses.map(normalizeCatalogClass),
        subjects: firebaseSubjects.map(normalizeSubject),
        allowed_models: [...AI_MODELS],
      } satisfies CatalogResponse,
    };
  } catch (error) {
    return { ok: false, message: firebaseErrorMessage(error), error, data: null };
  }
}

export async function getFirebaseBaseCatalogMigrationSourceApi(token: string): Promise<ApiResponse<FirebaseBaseCatalogMigrationSource>> {
  const res = await apiRequest<any>('getFirebaseBaseCatalogMigrationSource', {}, token);
  if (!res.ok || !res.data) return res as ApiResponse<FirebaseBaseCatalogMigrationSource>;
  const raw = res.data;
  const schoolYears = Array.isArray(raw.school_years)
    ? raw.school_years.map(normalizeSchoolYear).filter((item: SchoolYear) => item.nam_hoc_id && item.ten_nam_hoc)
    : [];
  const classes = Array.isArray(raw.classes)
    ? raw.classes.map(normalizeCatalogClass).filter((item: CatalogClass) => item.lop_id)
    : [];
  const subjects = Array.isArray(raw.subjects)
    ? raw.subjects.map(normalizeSubject).filter((item: Subject) => item.mon_id)
    : [];
  return {
    ...res,
    data: {
      school_id: toCleanString(raw.school_id),
      schema_version: Number(raw.schema_version || 1),
      generated_at: toCleanString(raw.generated_at),
      fingerprint: toCleanString(raw.fingerprint),
      counts: {
        school_years: Number(raw.counts?.school_years || schoolYears.length),
        classes: Number(raw.counts?.classes || classes.length),
        subjects: Number(raw.counts?.subjects || subjects.length),
      },
      school_years: schoolYears,
      classes,
      subjects,
    },
  };
}

export async function getFirebaseAccountMigrationSourceApi(token: string): Promise<ApiResponse<FirebaseAccountMigrationSource>> {
  const res = await apiRequest<any>('getFirebaseAccountMigrationSource', {}, token);
  if (!res.ok || !res.data) return res as ApiResponse<FirebaseAccountMigrationSource>;
  const raw = res.data;
  const accounts = Array.isArray(raw.accounts)
    ? raw.accounts.map((item: any) => ({
        user_id: toCleanString(item.user_id),
        username: toCleanString(item.username),
        display_name: toCleanString(item.display_name),
        role: normalizeRole(item.role),
        status: ['inactive', 'locked'].includes(toCleanString(item.status)) ? toCleanString(item.status) : 'active',
        admin_permission: normalizeBoolean(item.admin_permission, false),
        class_id: toCleanString(item.class_id) || null,
        grade: normalizeGrade(item.grade) || null,
        firebase_email: toCleanString(item.firebase_email).toLowerCase(),
        password_reset_required: normalizeBoolean(item.password_reset_required, false),
      }))
      .filter((item: { user_id: string; username: string }) => item.user_id && item.username)
    : [];
  return {
    ...res,
    data: {
      school_id: toCleanString(raw.school_id),
      schema_version: Number(raw.schema_version || 1),
      generated_at: toCleanString(raw.generated_at),
      fingerprint: toCleanString(raw.fingerprint),
      counts: {
        total: Number(raw.counts?.total || accounts.length),
        active: Number(raw.counts?.active || 0),
        teachers: Number(raw.counts?.teachers || 0),
        students: Number(raw.counts?.students || 0),
        admins: Number(raw.counts?.admins || 0),
        password_resets: Number(raw.counts?.password_resets || 0),
      },
      accounts,
    },
  };
}

export async function migrateFirebaseAccountBatchApi(
  token: string,
  firebaseIdToken: string,
  userIds: string[],
) {
  return apiRequest<{
    requested_count: number;
    migrated_count: number;
    failed_count: number;
    password_reset_count: number;
    migrated: Array<{ user_id: string; username: string; firebase_email: string; firebase_uid: string; created: boolean; password_reset: boolean }>;
    failed: Array<{ user_id: string; username?: string; reason: string }>;
  }>('migrateFirebaseAccountBatch', {
    firebase_id_token: firebaseIdToken,
    user_ids: userIds,
  }, token);
}



export async function listSchoolYearsApi(_token: string) {
  try {
    const items = (await listFirebaseCollection('academicYears')).map(normalizeSchoolYear).filter(item => item.ten_nam_hoc);
    const current = items.find(item => item.la_hien_hanh === true || String(item.la_hien_hanh).toLowerCase() === 'true');
    return { ok: true, message: 'Đã tải năm học từ Firebase.', data: { items, total: items.length, current } };
  } catch (error) { return { ok: false, message: firebaseErrorMessage(error), error }; }
}

export async function createSchoolYearApi(token: string, payload: Partial<SchoolYear>) {
  try {
    const documentId = toCleanString(payload.nam_hoc_id) || `NH_${Date.now()}`;
    const data = await saveFirebaseCatalog('academicYears', documentId, payload as Record<string, unknown>);
    return { ok: true, message: 'Đã tạo năm học trên Firebase.', data: normalizeSchoolYear(data) };
  } catch (error) { return { ok: false, message: firebaseErrorMessage(error), error }; }
}

export async function updateSchoolYearApi(token: string, payload: Partial<SchoolYear>) {
  try {
    const documentId = toCleanString(payload.nam_hoc_id);
    const data = await saveFirebaseCatalog('academicYears', documentId, payload as Record<string, unknown>, true);
    return { ok: true, message: 'Đã cập nhật năm học trên Firebase.', data: normalizeSchoolYear(data) };
  } catch (error) { return { ok: false, message: firebaseErrorMessage(error), error }; }
}

export async function setCurrentSchoolYearApi(token: string, nam_hoc_id: string) {
  try {
    const data = await setFirebaseCurrentAcademicYear(nam_hoc_id);
    if (!data) return { ok: false, message: 'Không tìm thấy năm học.' };
    return { ok: true, message: 'Đã đặt năm học hiện hành trên Firebase.', data: normalizeSchoolYear(data) };
  } catch (error) { return { ok: false, message: firebaseErrorMessage(error), error }; }
}


export async function transferSchoolYearApi(token: string, payload: SchoolYearTransferPayload) {
  try {
    const data = await transferFirebaseAcademicYear(payload);
    return { ok: true, message: 'Đã kết chuyển năm học trên Firebase.', data: { source_nam_hoc: payload.source_nam_hoc, target_nam_hoc: payload.target_nam_hoc,
      classes_created: data.classesCreated, classes_updated: data.classesUpdated, students_moved: data.studentsMoved,
      students_graduated: data.studentsGraduated, skipped_students: data.skippedStudents, skipped_classes: data.skippedClasses, logs: data.logs } satisfies SchoolYearTransferSummary };
  } catch (error) { return { ok: false, message: firebaseErrorMessage(error), error }; }
}

export async function moveStudentsBetweenClassesApi(token: string, payload: MoveStudentsPayload) {
  try {
    const moved = await moveFirebaseStudents(normalizeClassId(payload.source_lop_id), normalizeClassId(payload.target_lop_id), payload.move_all ? [] : (payload.user_ids || []), false);
    const movedUserIds = Array.from(moved.movedUserIds || []).map((id) => String(id));
    return { ok: true, message: 'Đã chuyển học sinh trên Firebase.', data: { source_lop_id: payload.source_lop_id, target_lop_id: payload.target_lop_id,
      source_ten_lop: payload.source_lop_id, target_ten_lop: payload.target_lop_id,
      moved_accounts: moved.movedAccounts, moved_progress: moved.movedProgress, moved_co_learning: moved.movedSessions,
      moved_user_ids: movedUserIds, skipped: (payload.user_ids || []).filter(id => !movedUserIds.includes(id)) } satisfies MoveStudentsSummary };
  } catch (error) { return { ok: false, message: firebaseErrorMessage(error), error }; }
}

export async function getSystemDiagnosticsApi(token: string) {
  const res = await apiRequest<SystemDiagnostics>('getSystemDiagnostics', {}, token);
  if (!res.ok || !res.data) return res;
  return {
    ...res,
    data: normalizeSystemDiagnostics(res.data),
  };
}

const LEGACY_LESSONS_CACHE_KEY = 'edusmart_legacy_lessons_v658';
async function loadLegacyLessonsCached(token: string): Promise<LessonRow[]> {
  if (typeof sessionStorage !== 'undefined') {
    try {
      const cached = JSON.parse(sessionStorage.getItem(LEGACY_LESSONS_CACHE_KEY) || 'null');
      if (cached && Date.now() - Number(cached.savedAt || 0) < 30 * 60 * 1000 && Array.isArray(cached.items)) {
        return cached.items.map(normalizeLessonRow);
      }
    } catch { /* refresh the cache below */ }
  }
  const res = await apiRequest<{ items: LessonRow[]; total: number }>('listLessons', {}, token);
  const items = res.ok && res.data && Array.isArray(res.data.items) ? res.data.items.map(normalizeLessonRow) : [];
  if (typeof sessionStorage !== 'undefined') {
    try { sessionStorage.setItem(LEGACY_LESSONS_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), items })); } catch { /* cache is optional */ }
  }
  return items;
}

export async function listArchivedLessonsApi(token: string) {
  const items = await loadLegacyLessonsCached(token);
  return { ok: true, message: 'Đã tải kho bài học lưu trữ cũ.', data: { items, total: items.length } };
}

export async function listLessonsApi(_token: string, payload: Record<string, unknown> = {}) {
  try {
    const items = (await listFirebaseLessons(payload)).map(normalizeLessonRow);
    return { ok: true, message: 'Đã tải bài học trực tiếp từ Firebase.', data: { items, total: items.length } };
  } catch (error) { return { ok: false, message: firebaseErrorMessage(error), error, data: { items: [] as LessonRow[], total: 0 } }; }
}

export async function listAccountsApi(_token: string, payload: Record<string, unknown> = {}) {
  try {
    const members = await listFirebaseAccountDirectory();
    const items = members.map(firebaseMemberToAccount).filter(item => {
      if (payload.vai_tro && item.vai_tro !== toCleanString(payload.vai_tro)) return false;
      if (payload.lop_id && item.lop_id !== normalizeClassId(payload.lop_id)) return false;
      return true;
    });
    return { ok: true, message: 'Đã tải danh sách học sinh và tài khoản đã kích hoạt từ Firebase.', data: { items, total: items.length } };
  } catch (error) { return { ok: false, message: firebaseErrorMessage(error), error, data: { items: [] as Account[], total: 0 } }; }
}

export async function createAccountApi(token: string, payload: Record<string, unknown>, firebaseIdToken = '') {
  const res = await apiRequest<Account>('createAccount', {
    ...payload,
    ...(firebaseIdToken ? { firebase_id_token: firebaseIdToken } : {}),
  }, token);
  if (!res.ok || !res.data) return res;
  return { ...res, data: normalizeAccount(res.data) };
}

export async function updateAccountApi(token: string, payload: Record<string, unknown>, firebaseIdToken = '') {
  const res = await apiRequest<Account>('updateAccount', {
    ...payload,
    ...(firebaseIdToken ? { firebase_id_token: firebaseIdToken } : {}),
  }, token);
  if (!res.ok || !res.data) return res;
  return { ...res, data: normalizeAccount(res.data) };
}

export interface StudentAccountImportBatchResult {
  requested_count: number;
  created_count: number;
  updated_count: number;
  failed_count: number;
  created: Array<{ user_id: string; ma_hoc_sinh: string; ho_ten: string; source_row: number }>;
  updated: Array<{ user_id: string; ma_hoc_sinh: string; ho_ten: string; source_row: number }>;
  failed: Array<{ source_row: number; ma_hoc_sinh?: string; ho_ten?: string; reason: string }>;
  accounts: Account[];
  password_policy: 'student_code';
  storage: 'firebase_roster';
  retry_required: boolean;
}

export async function importStudentAccountsBatchApi(
  _token: string,
  rows: Record<string, unknown>[],
  _firebaseIdToken = '',
  knownAccounts: Account[] = [],
): Promise<ApiResponse<StudentAccountImportBatchResult>> {
  try {
    const data = await importFirebaseStudentAccountsBatch(rows, knownAccounts);
    return {
      ok: true,
      message: data.failed_count
        ? `Đã lưu ${data.created_count + data.updated_count}/${data.requested_count} hồ sơ học sinh lên Firebase.`
        : 'Đã lưu nhóm hồ sơ học sinh lên Firebase; tài khoản đăng nhập sẽ tự kích hoạt ở lần đầu.',
      data,
    };
  } catch (error) {
    return { ok: false, message: firebaseErrorMessage(error), error };
  }
}

export interface AccountOperationOptions { current_password?: string; auth_deleted_in_console?: boolean }

export async function deleteAccountApi(token: string, user_id: string, firebaseIdToken = '', options: AccountOperationOptions = {}): Promise<ApiResponse<{
  user_id: string; deleted: boolean; firebaseCleanupPending?: boolean;
}>> {
  const response = await apiRequest<{ user_id: string; deleted: boolean; firebaseCleanupPending?: boolean }>(
    'deleteAccount', { user_id, ...options, ...(firebaseIdToken ? { firebase_id_token: firebaseIdToken } : {}) }, token);
  if (response.ok && response.data?.deleted !== true) return { ok: false, message: 'Backend chưa xác nhận hoàn tất xóa tài khoản.' };
  if (response.ok) clearFirebaseIdentityCache();
  return response;
}

export async function batchDeleteAccountsApi(token: string, user_ids: string[], firebaseIdToken = '', options: AccountOperationOptions = {}) {
  const ids = Array.from(new Set(user_ids.map(toCleanString).filter(Boolean)));
  const deleted: Array<{ user_id: string }> = [];
  const failed: Array<{ user_id: string; reason: string }> = [];
  for (const user_id of ids) {
    const response = await deleteAccountApi(token, user_id, firebaseIdToken, options);
    if (response.ok && response.data?.deleted) deleted.push({ user_id });
    else failed.push({ user_id, reason: response.message || 'Chưa hoàn tất xóa.' });
  }
  return { ok: deleted.length > 0, message: `Đã dọn dữ liệu ${deleted.length}/${ids.length} tài khoản.${options.auth_deleted_in_console ? ' Việc xóa Authentication do quản trị viên xác nhận trong Firebase Console.' : ''}${failed.length ? ` Còn ${failed.length} tài khoản chưa hoàn tất. ${failed[0].reason}` : ''}`,
    data: { requested_count: ids.length, deleted_count: deleted.length, failed_count: failed.length,
      deleted, failed, firebaseCleanupPending: failed.length > 0 } };
}

export async function batchResetPasswordsApi(token: string, user_ids: string[], new_password = '123456', firebaseIdToken = '', options: AccountOperationOptions = {}) {
  const ids = Array.from(new Set(user_ids.map(toCleanString).filter(Boolean)));
  const reset: Array<{ user_id: string; ho_ten?: string; ten_dang_nhap?: string; password_policy?: string }> = [];
  const failed: Array<{ user_id: string; ho_ten?: string; reason: string }> = [];
  for (let offset = 0; offset < ids.length; offset += 20) {
    const chunk = ids.slice(offset, offset + 20);
    const response = await apiRequest<{ reset: typeof reset; failed: typeof failed }>('batchResetPasswords',
      { user_ids: chunk, new_password, ...options, ...(firebaseIdToken ? { firebase_id_token: firebaseIdToken } : {}) }, token);
    if (response.ok && response.data) { reset.push(...response.data.reset); failed.push(...response.data.failed); }
    else failed.push(...chunk.map(user_id => ({ user_id, reason: response.message || 'Chưa đặt lại được mật khẩu.' })));
  }
  return { ok: reset.length > 0, message: `Đã đặt lại mật khẩu ${reset.length}/${ids.length} tài khoản.${failed.length ? ` ${failed[0].reason}` : ''}`,
    data: { requested_count: ids.length, reset_count: reset.length, failed_count: failed.length,
      default_password: new_password, student_password_policy: 'student_code' as const, reset, failed } };
}

export async function listClassesApi(_token: string, payload: Record<string, unknown> = {}) {
  try {
    const firebaseItems = await listFirebaseCollection('classes');
    const items = firebaseItems.map(normalizeCatalogClass).filter(item => !payload.nam_hoc || item.nam_hoc === toCleanString(payload.nam_hoc));
    return { ok: true, message: 'Đã tải lớp học từ Firebase.', data: { items, total: items.length } };
  } catch (error) { return { ok: false, message: firebaseErrorMessage(error), error, data: { items: [] as CatalogClass[], total: 0 } }; }
}

export async function createClassApi(token: string, payload: Record<string, unknown>) {
  try {
    const lopId = buildClassId(payload);
    const data = await saveFirebaseCatalog('classes', lopId, { ...payload, lop_id: lopId });
    return { ok: true, message: 'Đã tạo lớp trên Firebase.', data: normalizeCatalogClass(data) };
  }
  catch (error) { return { ok: false, message: firebaseErrorMessage(error), error }; }
}

export async function updateClassApi(token: string, payload: Record<string, unknown>) {
  try {
    const lopId = buildClassId(payload);
    const data = await saveFirebaseCatalog('classes', lopId, { ...payload, lop_id: lopId }, true);
    return { ok: true, message: 'Đã cập nhật lớp trên Firebase.', data: normalizeCatalogClass(data) };
  }
  catch (error) { return { ok: false, message: firebaseErrorMessage(error), error }; }
}

export async function importClassesBatchApi(token: string, rows: Array<Record<string, unknown>>) {
  try {
    const batchRows = rows.map(row => {
      const lopId = buildClassId(row);
      return {
        documentId: lopId,
        payload: { ...row, lop_id: lopId, trang_thai: toCleanString(row.trang_thai) || 'active' },
        merge: true,
      };
    });
    const saved = await saveFirebaseCatalogBatch('classes', batchRows);
    return {
      ok: true,
      message: `Đã nhập ${saved.length} lớp lên Firebase.`,
      data: { items: saved.map(normalizeCatalogClass), total: saved.length },
    };
  } catch (error) { return { ok: false, message: firebaseErrorMessage(error), error }; }
}

export async function deleteClassApi(token: string, lop_id: string) {
  try { await deleteFirebaseCatalog('classes', normalizeClassId(lop_id)); return { ok: true, message: 'Đã xóa lớp trên Firebase.', data: { lop_id, deleted: true } }; }
  catch (error) { return { ok: false, message: firebaseErrorMessage(error), error }; }
}

export async function batchDeleteClassesApi(token: string, class_ids: string[], confirm_text = 'XOA') {
  if (confirm_text.toUpperCase() !== 'XOA') return { ok: false, message: 'Cần nhập XOA để xác nhận.' };
  try {
    const [members, firebaseLessons, classRows] = await Promise.all([listFirebaseMembers(), listFirebaseLessons(), listFirebaseCollection('classes')]);
    const deleted: Array<{ lop_id: string; ten_lop: string; deleted_students: number; deleted_progress: number; deleted_co_learning: number }> = [];
    const failed: Array<{ lop_id: string; reason: string }> = [];
    const deletableIds: string[] = [];
    for (const rawId of class_ids) {
      const lopId = normalizeClassId(rawId);
      const studentCount = members.filter((item: any) => toCleanString(item.role || item.vai_tro) === 'student' && normalizeClassId(item.classId || item.lop_id) === lopId).length;
      const lessonCount = firebaseLessons.filter(item => normalizeClassId(item.lop_id) === lopId).length;
      if (studentCount || lessonCount) {
        failed.push({ lop_id: lopId, reason: `Lớp còn ${studentCount} học sinh và ${lessonCount} bài học. Hãy chuyển học sinh và xử lý bài học trước.` });
        continue;
      }
      const classRow: any = classRows.find((item: any) => normalizeClassId(item.lop_id || item.id) === lopId);
      deletableIds.push(lopId);
      deleted.push({ lop_id: lopId, ten_lop: toCleanString(classRow?.ten_lop || lopId), deleted_students: 0, deleted_progress: 0, deleted_co_learning: 0 });
    }
    await deleteFirebaseCatalogBatch('classes', deletableIds);
    const remainingIds = new Set((await listFirebaseCollection('classes')).map((item: any) => normalizeClassId(item.lop_id || item.id)));
    const verifiedDeleted = deleted.filter(item => !remainingIds.has(item.lop_id));
    deleted.filter(item => remainingIds.has(item.lop_id)).forEach(item => failed.push({ lop_id: item.lop_id, reason: 'Firestore chưa xác nhận xóa lớp. Vui lòng thử lại.' }));
    return { ok: true, message: 'Đã xử lý xóa lớp trên Firebase.', data: { requested_count: class_ids.length, deleted_count: verifiedDeleted.length,
      failed_count: failed.length, deleted_students: 0, deleted_progress: 0, deleted_co_learning: 0, deleted: verifiedDeleted, failed } };
  } catch (error) { return { ok: false, message: firebaseErrorMessage(error), error }; }
}

export async function moveClassStudentsApi(token: string, source_lop_id: string, target_lop_id: string, delete_source = true) {
  try {
    const moved = await moveFirebaseStudents(normalizeClassId(source_lop_id), normalizeClassId(target_lop_id), [], delete_source);
    return { ok: true, message: 'Đã chuyển toàn bộ học sinh trên Firebase.', data: { source_lop_id, target_lop_id,
      source_ten_lop: source_lop_id, target_ten_lop: target_lop_id, moved_accounts: moved.movedAccounts,
      moved_progress: moved.movedProgress, moved_co_learning: moved.movedSessions, deleted_source: delete_source } };
  } catch (error) { return { ok: false, message: firebaseErrorMessage(error), error }; }
}

export async function listSubjectsApi(_token: string, payload: Record<string, unknown> = {}) {
  try {
    const firebaseItems = await listFirebaseCollection('subjects');
    const items = firebaseItems.map(normalizeSubject);
    return { ok: true, message: 'Đã tải môn học từ Firebase.', data: { items, total: items.length } };
  } catch (error) { return { ok: false, message: firebaseErrorMessage(error), error, data: { items: [] as Subject[], total: 0 } }; }
}

export async function createSubjectApi(token: string, payload: Record<string, unknown>) {
  try { const data = await saveFirebaseCatalog('subjects', toCleanString(payload.mon_id), payload); return { ok: true, message: 'Đã tạo môn học trên Firebase.', data: normalizeSubject(data) }; }
  catch (error) { return { ok: false, message: firebaseErrorMessage(error), error }; }
}

export async function updateSubjectApi(token: string, payload: Record<string, unknown>) {
  try { const data = await saveFirebaseCatalog('subjects', toCleanString(payload.mon_id), payload, true); return { ok: true, message: 'Đã cập nhật môn học trên Firebase.', data: normalizeSubject(data) }; }
  catch (error) { return { ok: false, message: firebaseErrorMessage(error), error }; }
}

export async function deleteSubjectApi(token: string, mon_id: string) {
  try { await deleteFirebaseCatalog('subjects', mon_id); return { ok: true, message: 'Đã xóa môn học trên Firebase.', data: { mon_id, deleted: true } }; }
  catch (error) { return { ok: false, message: firebaseErrorMessage(error), error }; }
}

export async function getLessonContentApi(token: string, lesson_id: string) {
  try {
    const firebaseData = await getFirebaseLesson(lesson_id);
    if (!firebaseData) return { ok: false, message: 'Không tìm thấy bài học trên Firebase.' };
    return { ok: true, message: 'Đã tải nội dung bài học từ Firebase.', data: firebaseData };
  } catch (error) {
    return { ok: false, message: firebaseErrorMessage(error), error };
  }
}

export async function saveUserConfigApi(token: string, config: AIConfig): Promise<ApiResponse<AIConfig>> {
  const apiKey = config.clearApiKey === true ? '' : toCleanString(config.apiKey);
  const res = await apiRequest<Record<string, unknown>>('saveUserConfig', {
    api_key: apiKey,
    clear_api_key: config.clearApiKey === true,
    model_ai: AI_MODELS.includes(config.model) ? config.model : AI_MODELS[0],
  }, token);
  if (!res.ok || !res.data) return { ...res, data: undefined } as ApiResponse<AIConfig>;
  return { ...res, data: normalizeAIConfig(res.data) };
}

export async function getLessonBuilderDefaultsApi(token: string): Promise<ApiResponse<LessonBuilderDefaultsResponse>> {
  const firebaseData = await getFirebaseConfig('lessonBuilderDefaults').catch(() => null);
  if (firebaseData) return { ok: true, message: 'Đã tải cấu hình tạo bài học từ Firebase.', data: normalizeLessonBuilderDefaultsResponse(firebaseData) };
  return { ok: true, message: 'Đang dùng cấu hình tạo bài học mặc định.', data: { settings: null, has_defaults: false, updated_at: '', updated_by: '' } };
}

export async function saveLessonBuilderDefaultsApi(token: string, settings: LessonBuilderSettings): Promise<ApiResponse<LessonBuilderDefaultsResponse>> {
  try {
    const data = await saveFirebaseConfig('lessonBuilderDefaults', { settings, has_defaults: true });
    return { ok: true, message: 'Đã lưu cấu hình tạo bài học trên Firebase.', data: normalizeLessonBuilderDefaultsResponse(data) };
  } catch (error) { return { ok: false, message: firebaseErrorMessage(error), error }; }
}

export async function resetLessonBuilderDefaultsApi(token: string): Promise<ApiResponse<LessonBuilderDefaultsResponse>> {
  try { await deleteFirebaseConfig('lessonBuilderDefaults'); return { ok: true, message: 'Đã khôi phục cấu hình mặc định.', data: { settings: null, has_defaults: false, updated_at: '', updated_by: '' } }; }
  catch (error) { return { ok: false, message: firebaseErrorMessage(error), error }; }
}

export async function deleteUserConfigApi(token: string, model = AI_MODELS[0]): Promise<ApiResponse<AIConfig>> {
  const res = await apiRequest<Record<string, unknown>>('deleteMyAIConfig', {
    model_ai: AI_MODELS.includes(model) ? model : AI_MODELS[0],
  }, token);
  if (!res.ok || !res.data) return { ...res, data: undefined } as ApiResponse<AIConfig>;
  return { ...res, data: normalizeAIConfig(res.data) };
}



type CoLearningProgressReporter = (message: string) => void;

function reportCoLearningProgress(reporter: CoLearningProgressReporter | undefined, message: string) {
  try { reporter?.(message); } catch { /* UI progress reporting must never break the operation. */ }
}

function coLearningStepError(error: unknown, context: string) {
  const base = firebaseErrorMessage(error);
  return new Error(`${context}${base ? ` ${base}` : ''}`.trim());
}

export async function listClassmatesForStudyApi(token: string, lesson_id: string) {
  try {
    // V6.75.4: phiên học cùng cũ là dữ liệu phụ. Nếu Rules từ chối truy vấn
    // session legacy thì vẫn phải tải được danh sách bạn và đặc biệt không được
    // cản học sinh chọn "Học một mình" để mở nội dung bài học.
    const [members, reusableRaw] = await Promise.all([
      listFirebaseClassmates(),
      findFirebaseReusableCoLearningSession(lesson_id).catch(() => null),
    ]);
    const items = members.map(firebaseMemberToAccount);
    const reusableSession = normalizeCoLearningSession(reusableRaw);
    const activeClassmateIds = new Set(items.map((item) => toCleanString(item.user_id)).filter(Boolean));
    const reusableParticipantIds = reusableSession?.participant_user_ids?.map(toCleanString).filter(Boolean) || [];
    const activeSavedPartners = reusableParticipantIds.filter((userId) => activeClassmateIds.has(userId)).length;
    const reusableSessionIsValid = reusableSession
      && reusableParticipantIds.length >= 2
      && activeSavedPartners === reusableParticipantIds.length - 1;
    return {
      ok: true,
      message: 'Đã tải đầy đủ danh sách học sinh cùng lớp từ studentRoster.',
      data: { items, total: items.length, reusable_session: reusableSessionIsValid ? reusableSession : null },
    };
  } catch (error) {
    return { ok: false, message: firebaseErrorMessage(error), error, data: { items: [] as Account[], total: 0, reusable_session: null as CoLearningSession | null } };
  }
}

export async function startCoLearningSessionApi(_token: string, lesson_id: string, credentials: CoLearningPartnerCredential[], onProgress?: CoLearningProgressReporter) {
  const sessionId = `COLEARN_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
  try {
    const seenUsers = new Set<string>();
    const uniqueCredentials = credentials.filter((item) => {
      const userKey = toCleanString(item.user_id) || toCleanString(item.identifier);
      if (!toCleanString(item.identifier) || !userKey || seenUsers.has(userKey)) return false;
      seenUsers.add(userKey);
      return true;
    });
    if (!uniqueCredentials.length) return { ok: false, message: 'Vui lòng chọn ít nhất một bạn học cùng.' };
    if (uniqueCredentials.length > 5) return { ok: false, message: 'Mỗi nhóm chỉ được chọn tối đa 5 bạn học cùng.' };
    if (uniqueCredentials.some((item) => !toCleanString(item.password))) {
      return { ok: false, message: 'Vui lòng nhập mật khẩu xác nhận của tất cả bạn đã chọn.' };
    }
    const [me, lessonData] = await Promise.all([
      getFirebaseIdentity(),
      getFirebaseLesson(lesson_id),
    ]);
    if (!lessonData) return { ok: false, message: 'Không tìm thấy bài học cần mở.' };
    const partners: FirebaseVerifiedClassmate[] = [];
    for (let credentialIndex = 0; credentialIndex < uniqueCredentials.length; credentialIndex += 1) {
      const credential = uniqueCredentials[credentialIndex];
      reportCoLearningProgress(onProgress, `Đang xác nhận bạn ${credentialIndex + 1}/${uniqueCredentials.length} • Mã HS ${credential.identifier}`);
      let partner: FirebaseVerifiedClassmate;
      try {
        partner = await verifyOrActivateFirebaseClassmateInIsolation(credential.identifier, credential.password, {
          sessionId, lessonId: lesson_id, hostUid: me.uid, classId: me.classId, grade: me.grade,
        });
      } catch (error) {
        throw coLearningStepError(error, `Không xác nhận được bạn ${credentialIndex + 1}/${uniqueCredentials.length} (Mã HS ${credential.identifier}).`);
      }
      if (toCleanString(partner.uid) === toCleanString(me.uid)) {
        throw new Error('Em không thể chọn chính tài khoản đang đăng nhập để học cùng.');
      }
      if (toCleanString(credential.user_id) && toCleanString(partner.userId) !== toCleanString(credential.user_id)) {
        throw new Error(`Mật khẩu xác nhận không khớp học sinh đã chọn: ${toCleanString(partner.displayName) || credential.identifier}.`);
      }
      if (!toCleanString(me.classId) || toCleanString(partner.classId) !== toCleanString(me.classId)) {
        throw new Error('Bạn học cùng không thuộc lớp hiện tại.');
      }
      if (!toCleanString(me.grade) || toCleanString(partner.grade) !== toCleanString(me.grade)) {
        throw new Error('Bạn học cùng không thuộc khối hiện tại.');
      }
      partners.push(partner);
    }
    const now = new Date().toISOString();
    const hostPreparation = await getFirebasePreLessonProgress(lesson_id).catch(() => null);
    const hostPreparationStatus = toCleanString(hostPreparation?.preparation_status) || 'not_started';
    const participantUserIds = [toCleanString(me.userId), ...partners.map((item) => toCleanString(item.userId))];
    const participantUids = [toCleanString(me.uid), ...partners.map((item) => toCleanString(item.uid))];
    const participantNames = [toCleanString(me.displayName || me.username || me.userId), ...partners.map((item) => toCleanString(item.displayName || item.username || item.userId))];
    const participantPreparationStatuses = [hostPreparationStatus, ...partners.map((item) => toCleanString(item.preLessonPreparationStatus) || 'not_started')] as CoLearningSession['participant_preparation_statuses'];
    const participantPreparationScores = [hostPreparationStatus === 'prepared' ? 10 : 0, ...partners.map((item) => Number(item.preLessonPreparationScore || 0))];
    const participantPreparationWatchPercents = [Number(hostPreparation?.watch_percent || 0), ...partners.map((item) => Number(item.preLessonWatchPercent || 0))];
    const data: CoLearningSession = {
      co_learning_session_id: sessionId,
      session_id: sessionId,
      lesson_id,
      lesson_title: toCleanString(lessonData.lesson.tieu_de),
      host_user_id: toCleanString(me.userId),
      host_uid: toCleanString(me.uid),
      partner_user_id: participantUserIds[1],
      partner_uid: participantUids[1],
      partner_name: participantNames[1],
      participant_user_ids: participantUserIds,
      participant_uids: participantUids,
      participant_names: participantNames,
      participant_keys: participantUserIds.map((userId, index) => `${participantUids[index]}::${userId}`),
      participant_preparation_statuses: participantPreparationStatuses,
      participant_preparation_scores: participantPreparationScores,
      participant_preparation_watch_percents: participantPreparationWatchPercents,
      preparation_snapshot_at: now,
      schemaVersion: 5,
      group_size: participantUserIds.length,
      study_mode: 'co_learning',
      status: 'active',
      started_at: now,
      last_active_at: now,
      verified_at: now,
    };
    reportCoLearningProgress(onProgress, 'Đang chốt quyền tham gia của cả nhóm...');
    try {
      await saveFirebaseHostConsent(sessionId, lesson_id);
    } catch (error) {
      throw coLearningStepError(error, 'Không chốt được quyền tham gia của tài khoản đang tạo nhóm.');
    }
    reportCoLearningProgress(onProgress, `Đang lưu nhóm ${participantUserIds.length} học sinh lên Firestore...`);
    try {
      await saveFirebaseCoLearningSession({ ...data, lop_id: toCleanString(me.classId), khoi: toCleanString(me.grade) });
    } catch (error) {
      throw coLearningStepError(error, 'Không lưu được phiên học cùng sau khi đã xác nhận các thành viên.');
    }
    return { ok: true, message: `Đã tạo nhóm học gồm ${participantUserIds.length} học sinh.`, data };
  } catch (error) {
    await cleanupFirebaseCoLearningConsents(sessionId).catch(() => undefined);
    return { ok: false, message: firebaseErrorMessage(error), error };
  }
}

export async function updateCoLearningSessionApi(_token: string, lesson_id: string, base_session_id: string, selected_user_ids: string[], credentials: CoLearningPartnerCredential[], onProgress?: CoLearningProgressReporter) {
  const newSessionId = `COLEARN_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
  try {
    const [me, lessonData, oldSession] = await Promise.all([
      getFirebaseIdentity(),
      getFirebaseLesson(lesson_id),
      getFirebaseCoLearningSession(base_session_id),
    ]);
    if (!lessonData) return { ok: false, message: 'Không tìm thấy bài học cần mở.' };
    if (!oldSession || toCleanString(oldSession.lesson_id) !== toCleanString(lesson_id)) return { ok: false, message: 'Nhóm học cũ không còn hợp lệ.' };
    const oldUids = oldSession.participant_uids || [];
    const oldUserIds = oldSession.participant_user_ids || [];
    const oldNames = oldSession.participant_names || [];
    const oldPreparationStatuses = oldSession.participant_preparation_statuses || [];
    const oldPreparationScores = oldSession.participant_preparation_scores || [];
    const oldPreparationPercents = oldSession.participant_preparation_watch_percents || [];
    const myIndex = oldUids.findIndex((uid) => toCleanString(uid) === toCleanString(me.uid));
    if (myIndex < 0) return { ok: false, message: 'Tài khoản hiện tại không thuộc nhóm học cũ.' };

    const selected = Array.from(new Set(selected_user_ids.map(toCleanString).filter((id) => id && id !== toCleanString(me.userId)))).slice(0, 5);
    if (!selected.length) return { ok: false, message: 'Nhóm học cùng cần ít nhất một bạn.' };
    const existing = new Map<string, { uid: string; userId: string; name: string; preparationStatus: string; preparationScore: number; preparationPercent: number }>();
    oldUserIds.forEach((userId, index) => existing.set(toCleanString(userId), {
      uid: toCleanString(oldUids[index]), userId: toCleanString(userId), name: toCleanString(oldNames[index] || userId),
      preparationStatus: toCleanString(oldPreparationStatuses[index]) || 'unknown',
      preparationScore: Number.isFinite(Number(oldPreparationScores[index])) ? Number(oldPreparationScores[index]) : 10,
      preparationPercent: Number(oldPreparationPercents[index] || 0),
    }));
    const credentialsByUser = new Map(credentials.map((item) => [toCleanString(item.user_id), item]));
    const partners: Array<{ uid: string; userId: string; name: string; preparationStatus: string; preparationScore: number; preparationPercent: number }> = [];
    for (let selectedIndex = 0; selectedIndex < selected.length; selectedIndex += 1) {
      const userId = selected[selectedIndex];
      const saved = existing.get(userId);
      if (saved?.uid) {
        reportCoLearningProgress(onProgress, `Đang giữ thành viên đã xác nhận ${selectedIndex + 1}/${selected.length} • ${saved.name}`);
        partners.push(saved);
        continue;
      }
      reportCoLearningProgress(onProgress, `Đang xác nhận bạn mới ${selectedIndex + 1}/${selected.length}...`);
      const credential = credentialsByUser.get(userId);
      if (!credential || !toCleanString(credential.password)) throw new Error(`Bạn mới thêm vào nhóm cần xác nhận mật khẩu một lần.`);
      let verified: FirebaseVerifiedClassmate;
      try {
        verified = await verifyOrActivateFirebaseClassmateInIsolation(credential.identifier, credential.password, {
          sessionId: newSessionId, lessonId: lesson_id, hostUid: me.uid, classId: me.classId, grade: me.grade,
        });
      } catch (error) {
        throw coLearningStepError(error, `Không xác nhận được bạn mới ${selectedIndex + 1}/${selected.length}.`);
      }
      if (toCleanString(verified.userId) !== userId) throw new Error('Mật khẩu xác nhận không khớp học sinh đã chọn.');
      partners.push({
        uid: toCleanString(verified.uid), userId: toCleanString(verified.userId), name: toCleanString(verified.displayName || verified.username || verified.userId),
        preparationStatus: toCleanString(verified.preLessonPreparationStatus) || 'not_started',
        preparationScore: Number(verified.preLessonPreparationScore || 0),
        preparationPercent: Number(verified.preLessonWatchPercent || 0),
      });
    }
    const hostPreparation = await getFirebasePreLessonProgress(lesson_id).catch(() => null);
    const hostPreparationStatus = toCleanString(hostPreparation?.preparation_status) || 'not_started';
    const participantUserIds = [toCleanString(me.userId), ...partners.map((item) => item.userId)];
    const participantUids = [toCleanString(me.uid), ...partners.map((item) => item.uid)];
    const participantNames = [toCleanString(me.displayName || me.username || me.userId), ...partners.map((item) => item.name)];
    const participantPreparationStatuses = [hostPreparationStatus, ...partners.map((item) => item.preparationStatus || 'unknown')] as CoLearningSession['participant_preparation_statuses'];
    const participantPreparationScores = [hostPreparationStatus === 'prepared' ? 10 : 0, ...partners.map((item) => Number(item.preparationScore || 0))];
    const participantPreparationWatchPercents = [Number(hostPreparation?.watch_percent || 0), ...partners.map((item) => Number(item.preparationPercent || 0))];
    const now = new Date().toISOString();
    const data: CoLearningSession = {
      co_learning_session_id: newSessionId,
      session_id: newSessionId,
      lesson_id,
      lesson_title: toCleanString(lessonData.lesson.tieu_de),
      host_user_id: toCleanString(me.userId),
      host_uid: toCleanString(me.uid),
      partner_user_id: participantUserIds[1],
      partner_uid: participantUids[1],
      partner_name: participantNames[1],
      participant_user_ids: participantUserIds,
      participant_uids: participantUids,
      participant_names: participantNames,
      participant_keys: participantUserIds.map((userId, index) => `${participantUids[index]}::${userId}`),
      participant_preparation_statuses: participantPreparationStatuses,
      participant_preparation_scores: participantPreparationScores,
      participant_preparation_watch_percents: participantPreparationWatchPercents,
      preparation_snapshot_at: now,
      schemaVersion: 5,
      group_size: participantUserIds.length,
      study_mode: 'co_learning',
      status: 'active',
      started_at: now,
      last_active_at: now,
      verified_at: now,
      supersedes_session_id: toCleanString(base_session_id),
      membership_version: Math.max(1, Number(oldSession.membership_version || 1) + 1),
      membership_updated_at: now,
      membership_updated_by_uid: toCleanString(me.uid),
    };
    reportCoLearningProgress(onProgress, 'Đang chốt quyền tham gia của nhóm cập nhật...');
    try {
      await saveFirebaseHostConsent(newSessionId, lesson_id);
    } catch (error) {
      throw coLearningStepError(error, 'Không chốt được quyền tham gia của tài khoản đang cập nhật nhóm.');
    }
    reportCoLearningProgress(onProgress, `Đang lưu nhóm ${participantUserIds.length} học sinh lên Firestore...`);
    try {
      await saveFirebaseCoLearningSession({ ...data, schemaVersion: 5, lop_id: toCleanString(me.classId), khoi: toCleanString(me.grade) });
    } catch (error) {
      throw coLearningStepError(error, 'Không lưu được nhóm cập nhật sau khi đã xác nhận các thành viên.');
    }
    await markFirebaseCoLearningSessionSuperseded(base_session_id, newSessionId).catch(() => undefined);
    return { ok: true, message: `Đã cập nhật nhóm học gồm ${participantUserIds.length} học sinh.`, data };
  } catch (error) {
    await cleanupFirebaseCoLearningConsents(newSessionId).catch(() => undefined);
    return { ok: false, message: firebaseErrorMessage(error), error };
  }
}

export async function getPreLessonProgressApi(_token: string, lesson_id: string): Promise<ApiResponse<PreLessonProgress | null>> {
  try { return { ok: true, message: 'Đã tải tiến độ video trước bài.', data: await getFirebasePreLessonProgress(lesson_id) }; }
  catch (error) { return { ok: false, message: firebaseErrorMessage(error), error }; }
}

export async function savePreLessonProgressApi(_token: string, lesson_id: string, patch: Partial<PreLessonProgress>): Promise<ApiResponse<PreLessonProgress>> {
  try { return { ok: true, message: 'Đã cập nhật tiến độ video trước bài.', data: await saveFirebasePreLessonProgress(lesson_id, patch) }; }
  catch (error) { return { ok: false, message: firebaseErrorMessage(error), error }; }
}

export async function listPreLessonProgressApi(_token: string, filters: Record<string, unknown> = {}): Promise<ApiResponse<PreLessonProgress[]>> {
  try { const items = await listFirebasePreLessonProgress(filters); return { ok: true, message: 'Đã tải thống kê video trước bài.', data: items }; }
  catch (error) { return { ok: false, message: firebaseErrorMessage(error), error, data: [] }; }
}

export async function getTeachingSessionApi(_token: string, lesson_id: string, class_id?: string): Promise<ApiResponse<TeachingSession | null>> {
  try { return { ok: true, message: 'Đã tải trạng thái hoạt động dạy học.', data: await getFirebaseTeachingSession(lesson_id, class_id) }; }
  catch (error) { return { ok: false, message: firebaseErrorMessage(error), error }; }
}

export async function saveTeachingSessionApi(_token: string, lesson_id: string, class_id: string, patch: Partial<TeachingSession>): Promise<ApiResponse<TeachingSession>> {
  try { return { ok: true, message: 'Đã cập nhật hoạt động đang mở cho lớp.', data: await saveFirebaseTeachingSession(lesson_id, class_id, patch) }; }
  catch (error) { return { ok: false, message: firebaseErrorMessage(error), error }; }
}

export async function setTeachingActivityAccessApi(_token: string, lesson_id: string, class_id: string, activity_id: string, open: boolean, page_id = ''): Promise<ApiResponse<TeachingSession>> {
  try { return { ok: true, message: open ? 'Đã mở mục học tập cho lớp.' : 'Đã khóa mục học tập đối với lớp.', data: await setFirebaseTeachingActivityAccess(lesson_id, class_id, activity_id, open, page_id) }; }
  catch (error) { return { ok: false, message: firebaseErrorMessage(error), error }; }
}

export async function createLessonApi(token: string, payload: LessonComposerValues): Promise<ApiResponse<LessonRow>> {
  try {
    const saved = await saveFirebaseLesson(payload, false);
    return { ok: true, message: 'Đã tạo bài học trên Firebase.', data: normalizeLessonRow(saved) };
  } catch (error) {
    return { ok: false, message: firebaseErrorMessage(error), error };
  }
}

export async function updateLessonApi(token: string, payload: LessonComposerValues): Promise<ApiResponse<LessonRow>> {
  try {
    const saved = await saveFirebaseLesson(payload, true);
    if (saved) return { ok: true, message: 'Đã cập nhật bài học trên Firebase.', data: normalizeLessonRow(saved) };
    return { ok: false, message: 'Không tìm thấy bài học trên Firebase.' };
  } catch (error) {
    return { ok: false, message: firebaseErrorMessage(error), error };
  }
}

export async function setLessonLockApi(_token: string, lesson_id: string, locked: boolean): Promise<ApiResponse<LessonRow>> {
  try {
    const saved = await setFirebaseLessonLock(lesson_id, locked);
    return { ok: true, message: locked ? 'Đã khóa bài học đối với học sinh.' : 'Đã mở khóa bài học cho học sinh.', data: normalizeLessonRow(saved) };
  } catch (error) {
    return { ok: false, message: firebaseErrorMessage(error), error };
  }
}

export async function deleteLessonApi(token: string, lesson_id: string) {
  try {
    const deleted = await deleteFirebaseLesson(lesson_id);
    if (!deleted) return { ok: false, message: 'Không tìm thấy bài học trên Firebase.' };

    // Firestore là nguồn vận hành chính. Chạy cleanup legacy Google Sheet/Drive
    // theo kiểu best-effort để không giữ popup/UI chờ Apps Script phản hồi.
    void apiRequest('deleteLesson', { lesson_id }, token).catch(() => undefined);

    return {
      ok: true,
      message: 'Đã xóa bài học và dữ liệu liên quan trên Firebase.',
      data: deleted,
    };
  } catch (error) {
    return { ok: false, message: firebaseErrorMessage(error), error };
  }
}

export async function repairLessonIntegrityApi(_token: string) {
  try {
    const summary = await repairFirebaseLessonIntegrity();
    return {
      ok: true,
      message: summary.removed_orphan_references > 0
        ? `Đã sửa ${summary.removed_orphan_references} tham chiếu bài học mồ côi.`
        : 'Không phát hiện registry bài học mồ côi.',
      data: summary,
    };
  } catch (error) {
    return { ok: false, message: firebaseErrorMessage(error), error };
  }
}

export async function submitLessonReviewApi(token: string, lesson_id: string) {
  const firebaseLesson = await submitFirebaseLessonReview(lesson_id).catch(() => null);
  if (firebaseLesson) return { ok: true, message: 'Đã gửi bài học để duyệt.', data: normalizeLessonRow(firebaseLesson) };
  return { ok: false, message: 'Không tìm thấy bài học trên Firebase.' };
}

export async function listPendingSharesApi(token: string) {
  const firebaseItems = await listFirebasePendingLessons().catch(() => []);
  return { ok: true, message: 'Đã tải bài học chờ duyệt từ Firebase.', data: { items: firebaseItems.map(normalizePendingShareItem), total: firebaseItems.length } };
}

export async function reviewSharedLessonApi(token: string, lesson_id: string, approve: boolean, ghi_chu_admin = '') {
  const firebaseData = await reviewFirebaseLesson(lesson_id, approve, ghi_chu_admin).catch(() => null);
  if (firebaseData) return { ok: true, message: 'Đã xử lý duyệt bài học trên Firebase.', data: { lesson: normalizeLessonRow(firebaseData.lesson), share: normalizePendingShareItem({ share: firebaseData.share }).share } };
  const res = await apiRequest<{ lesson: LessonRow; share: PendingShareItem['share'] }>(
    'reviewSharedLesson',
    { lesson_id, approve, ghi_chu_admin },
    token,
  );
  if (!res.ok || !res.data) return res;
  return {
    ...res,
    data: {
      lesson: normalizeLessonRow((res.data as any).lesson),
      share: normalizePendingShareItem({ share: (res.data as any).share, lesson: null }).share,
    },
  };
}


export async function listLearningProgressApi(token: string, payload: Record<string, unknown> = {}) {
  const items = (await listFirebaseProgress(payload).catch(() => [] as LessonProgressRecord[])).map(normalizeLessonProgressRecord);
  return {
    ok: true, message: 'Đã tải tiến trình học tập từ Firebase.', data: { items, total: items.length },
  };
}

export async function listLessonCommentsApi(token: string, lesson_id: string) {
  const items = (await listFirebaseComments(lesson_id).catch(() => [] as LessonComment[])).map(normalizeLessonComment);
  return { ok: true, message: 'Đã tải bình luận từ Firebase.', data: { items, total: items.length } };
}

export async function addLessonCommentApi(token: string, payload: Partial<LessonComment>) {
  try { const data = await saveFirebaseComment(payload); return { ok: true, message: 'Đã thêm bình luận.', data: normalizeLessonComment(data) }; }
  catch (error) { return { ok: false, message: firebaseErrorMessage(error), error }; }
}

export async function updateLessonCommentApi(token: string, payload: Partial<LessonComment>) {
  try {
    const data = await saveFirebaseComment(payload, true);
    if (data) return { ok: true, message: 'Đã cập nhật bình luận.', data: normalizeLessonComment(data) };
    return apiRequest<LessonComment>('updateLessonComment', payload as Record<string, unknown>, token);
  } catch (error) { return { ok: false, message: firebaseErrorMessage(error), error }; }
}

export async function saveLearningProgressApi(token: string, payload: LessonProgressRecord) {
  try { const data = await saveFirebaseProgress(payload); return { ok: true, message: 'Đã lưu tiến trình học tập.', data: normalizeLessonProgressRecord(data) }; }
  catch (error) { return { ok: false, message: firebaseErrorMessage(error), error }; }
}

export async function moderateLearningResultApi(
  _token: string,
  payload: LearningResultModerationPayload,
): Promise<ApiResponse<LearningResultModerationSummary>> {
  try {
    const data = await moderateFirebaseLearningResult(payload);
    return {
      ok: true,
      message: payload.action === 'allow_retake'
        ? `Đã hủy kết quả và mở quyền học lại cho ${data.affected_count} học sinh.`
        : `Đã hủy kết quả do gian lận và khóa học lại đối với ${data.affected_count} học sinh.`,
      data,
    };
  } catch (error) {
    return { ok: false, message: firebaseErrorMessage(error), error };
  }
}

export async function listReviewPracticesApi(token: string, payload: Record<string, unknown> = {}) {
  const items = (await listFirebaseReviews(payload).catch(() => [])).map(normalizeReviewPracticeRow);
  return { ok: true, message: 'Đã tải bài ôn tập từ Firebase.', data: { items, total: items.length } };
}

export async function createReviewPracticeApi(token: string, payload: Record<string, unknown>) {
  try {
    const lessonIds = Array.isArray(payload.lesson_ids) ? payload.lesson_ids.map(toCleanString).filter(Boolean) : toCleanString(payload.lesson_ids).split(',').filter(Boolean);
    const contents = await Promise.all(lessonIds.map(lessonId => getLessonContentApi(token, lessonId).catch(() => null)));
    const pool: any[] = [];
    const titles: string[] = [];
    contents.forEach((response: any) => {
      if (!response?.ok || !response.data?.content) return;
      const content = response.data.content;
      titles.push(toCleanString(response.data.lesson?.tieu_de));
      if (Array.isArray(content.final_quiz)) pool.push(...content.final_quiz);
      if (Array.isArray(content.sections)) content.sections.forEach((section: any) => {
        if (Array.isArray(section.interactive_questions)) pool.push(...section.interactive_questions);
      });
    });
    const limit = Math.max(1, Math.min(100, Number(payload.so_cau || 20)));
    const questions = pool.slice(0, limit).map((question, index) => ({ ...question, id: question.id || question.question_id || `RQ_${index + 1}` }));
    if (!questions.length) return { ok: false, message: 'Không tìm thấy câu hỏi trong các bài học đã chọn.' };
    const data = await saveFirebaseReview({ ...payload, lesson_ids: lessonIds, source_lesson_titles: titles.join(' | '), questions });
    return { ok: true, message: 'Đã tạo bài ôn tập trên Firebase.', data: normalizeReviewPracticeRow(data) };
  }
  catch (error) { return { ok: false, message: firebaseErrorMessage(error), error }; }
}

export async function getReviewPracticeApi(token: string, review_id: string) {
  const firebaseReview = await getFirebaseReview(review_id).catch(() => null);
  if (firebaseReview) {
    const source = (firebaseReview as any).questions || (firebaseReview as any).questions_json || [];
    const questions = typeof source === 'string' ? (() => { try { return JSON.parse(source); } catch { return []; } })() : source;
    return { ok: true, message: 'Đã tải bài ôn tập từ Firebase.', data: { review: normalizeReviewPracticeRow(firebaseReview), lessons: [], questions: Array.isArray(questions) ? questions : [], config: (firebaseReview as any).config || (firebaseReview as any).cau_hinh } };
  }
  return { ok: false, message: 'Không tìm thấy bài ôn tập trên Firebase.' };
}

export async function submitReviewPracticeApi(token: string, payload: Record<string, unknown>) {
  try { const data = await submitFirebaseReviewAttempt(payload); return { ok: true, message: 'Đã nộp bài ôn tập lên Firebase.', data }; }
  catch (error) { return { ok: false, message: firebaseErrorMessage(error), error }; }
}

export async function getReviewPracticeResultsApi(token: string, payload: Record<string, unknown>) {
  const [firebaseReview, firebaseAttempts] = await Promise.all([
    getFirebaseReview(toCleanString(payload.review_id)).catch(() => null),
    listFirebaseReviewAttempts(payload).catch(() => []),
  ]);
  if (firebaseReview) {
    const attempts = firebaseAttempts.map(normalizeReviewPracticeAttempt);
    const scores = attempts.map(item => Number(item.diem || 0));
    const members = await listFirebaseMembers().catch(() => []);
    const targetClass = normalizeClassId(payload.lop_id || (firebaseReview as any).lop_id);
    const targetGrade = normalizeGrade((firebaseReview as any).khoi);
    const students = members.map(firebaseMemberToAccount).filter(item => item.vai_tro === 'student'
      && (!targetClass || item.lop_id === targetClass) && (!targetGrade || item.khoi === targetGrade)).map(item => {
        const own = attempts.filter(attempt => attempt.user_id === item.user_id).sort((a, b) => toTimestamp(b.submitted_at) - toTimestamp(a.submitted_at));
        const ownScores = own.map(attempt => Number(attempt.diem || 0));
        const best = ownScores.length ? Math.max(...ownScores) : 0;
        const bestAttempt = own.find(attempt => Number(attempt.diem || 0) === best);
        return normalizeReviewPracticeResultStudent({ user_id: item.user_id, ho_ten: item.ho_ten, lop_id: item.lop_id, ten_lop: item.ten_lop_hien_thi || item.ten_lop,
          khoi: item.khoi, status: own.length ? 'completed' : 'not_started', attempt_count: own.length, best_score: own.length ? best : '',
          latest_score: own.length ? ownScores[0] : '', average_score: own.length ? ownScores.reduce((a, b) => a + b, 0) / own.length : '',
          best_correct: bestAttempt?.so_cau_dung ?? '', best_total: bestAttempt?.tong_so_cau ?? '', last_submitted_at: own[0]?.submitted_at || '',
          auto_submitted_count: own.filter(attempt => attempt.auto_submitted).length });
      });
    const completedStudents = students.filter(item => item.status === 'completed').length;
    return { ok: true, message: 'Đã tải kết quả ôn tập từ Firebase.', data: {
      review: normalizeReviewPracticeRow(firebaseReview), items: attempts, attempts, students, summary: { review_id: toCleanString(payload.review_id), total_students: students.length,
        completed_students: completedStudents, not_started_students: Math.max(0, students.length - completedStudents), total_attempts: attempts.length,
        average_best_score: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0,
        average_latest_score: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0,
        highest_score: scores.length ? Math.max(...scores) : 0, lowest_score: scores.length ? Math.min(...scores) : 0 }, total: attempts.length,
    } };
  }
  const res = await apiRequest<ReviewPracticeResultsResponse>('getReviewPracticeResults', payload, token);
  if (!res.ok || !res.data) return res;
  const raw: any = res.data;
  return {
    ...res,
    data: {
      review: raw.review ? normalizeReviewPracticeRow(raw.review) : undefined,
      items: Array.isArray(raw.items) ? raw.items.map(normalizeReviewPracticeAttempt) : [],
      attempts: Array.isArray(raw.attempts) ? raw.attempts.map(normalizeReviewPracticeAttempt) : (Array.isArray(raw.items) ? raw.items.map(normalizeReviewPracticeAttempt) : []),
      students: Array.isArray(raw.students) ? raw.students.map(normalizeReviewPracticeResultStudent) : [],
      summary: {
        review_id: toCleanString(raw.summary?.review_id),
        total_students: Number(raw.summary?.total_students || 0),
        completed_students: Number(raw.summary?.completed_students || 0),
        not_started_students: Number(raw.summary?.not_started_students || 0),
        total_attempts: Number(raw.summary?.total_attempts || raw.total || 0),
        average_best_score: Number(raw.summary?.average_best_score || 0),
        average_latest_score: Number(raw.summary?.average_latest_score || 0),
        highest_score: Number(raw.summary?.highest_score || 0),
        lowest_score: Number(raw.summary?.lowest_score || 0),
      },
      total: Number(raw.total || 0),
    },
  };
}

export async function deleteReviewPracticeApi(token: string, review_id: string) {
  try { await deleteFirebaseReview(review_id); return { ok: true, message: 'Đã xóa bài ôn tập trên Firebase.', data: { review_id, deleted: true } }; }
  catch (error) { return { ok: false, message: firebaseErrorMessage(error), error }; }
}


export async function saveGoogleSlidesPromptApi(token: string, payload: Record<string, unknown>) {
  try {
    const saved = await saveFirebaseSlidesPrompt(payload);
    return { ok: true, message: 'Đã lưu prompt trình chiếu trên Firebase.', data: { prompt: normalizeGoogleSlidesPromptRecord(saved), result: (saved as any).result } };
  } catch (error) { return { ok: false, message: firebaseErrorMessage(error), error }; }
}

export async function listGoogleSlidesPromptsApi(token: string, payload: Record<string, unknown> = {}) {
  try { const items = (await listFirebaseSlidesPrompts(payload)).map(normalizeGoogleSlidesPromptRecord); return { ok: true, message: 'Đã tải prompt trình chiếu từ Firebase.', data: { items, total: items.length } }; }
  catch (error) { return { ok: false, message: firebaseErrorMessage(error), error }; }
}

export async function getGoogleSlidesPromptApi(token: string, prompt_id: string) {
  const firebasePrompt = await getFirebaseSlidesPrompt(prompt_id).catch(() => null);
  if (firebasePrompt) return { ok: true, message: 'Đã tải prompt trình chiếu từ Firebase.', data: { prompt: normalizeGoogleSlidesPromptRecord(firebasePrompt), result: (firebasePrompt as any).result } };
  const res = await apiRequest<GoogleSlidesPromptDetailResponse>('getGoogleSlidesPrompt', { prompt_id }, token);
  if (!res.ok || !res.data) return res;
  return {
    ...res,
    data: {
      ...res.data,
      prompt: normalizeGoogleSlidesPromptRecord((res.data as any).prompt),
      result: (res.data as any).result,
    },
  };
}

export async function deleteGoogleSlidesPromptApi(token: string, prompt_id: string) {
  try { await deleteFirebaseSlidesPrompt(prompt_id); return { ok: true, message: 'Đã xóa prompt trình chiếu trên Firebase.', data: { prompt_id, deleted: true } }; }
  catch (error) { return { ok: false, message: firebaseErrorMessage(error), error }; }
}

export async function ensureHealthyApi() {
  return apiRequest<{ status: string }>('health');
}

export function maskApiKey(config: AIConfig) {
  if (config.apiKey) return `${config.apiKey.slice(0, 4)}...${config.apiKey.slice(-4)}`;
  if (config.apiKeyMasked) return config.apiKeyMasked;
  if (config.hasServerKey) return 'Đã lưu trên hệ thống';
  return 'Chưa cấu hình';
}
