/**
 * V6.88.22: Role-aware presentation-layer message policy.
 *
 * Operational diagnostics remain attached to Error objects / console logs, while
 * learner and staff notifications describe the software feature and the next safe
 * action. This prevents internal storage, rule, schema or identity details from
 * leaking into normal UI messages and avoids student-oriented wording on admin/
 * teacher screens.
 */
function cleanMessage(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

const TECHNICAL_TOKEN = /(firestore|firebase|security rules?|rules\b|permission[- ]denied|resource[- ]exhausted|schema(?:version)?|owneruid|authuid|uid\b|document\b|collection\b|cloud shell|deploy\b|ruleset|identity toolkit|google oauth|\[[A-Z][A-Z0-9_]{3,}\])/i;

export type UserMessageAudience = 'student' | 'staff' | 'generic';

function defaultFallback(audience: UserMessageAudience) {
  return audience === 'student'
    ? 'Chưa thể hoàn tất thao tác. Em hãy thử lại sau ít phút.'
    : audience === 'staff'
      ? 'Chưa thể hoàn tất thao tác. Vui lòng làm mới dữ liệu và thử lại.'
      : 'Chưa thể hoàn tất thao tác. Vui lòng thử lại sau ít phút.';
}

export function professionalUserMessage(
  value: unknown,
  fallback?: string,
  audience: UserMessageAudience = 'student',
) {
  const safeFallback = fallback || defaultFallback(audience);
  const raw = cleanMessage(value);
  if (!raw) return safeFallback;
  const lower = raw.toLowerCase();
  const staff = audience === 'staff';

  if (/prelesson|chuẩn bị bài|chuan bi bai/.test(lower) || /PRELESSON_/i.test(raw)) {
    if (staff) {
      if (/network|offline|mạng|ket noi|kết nối/.test(lower)) return 'Kết nối đang gián đoạn. Dữ liệu chuẩn bị bài chưa được làm mới; vui lòng thử lại khi kết nối ổn định.';
      return 'Chưa thể cập nhật trạng thái chuẩn bị bài. Vui lòng làm mới dữ liệu và thử lại.';
    }
    if (/network|offline|mạng|ket noi|kết nối/.test(lower)) {
      return 'Kết nối đang gián đoạn. Tiến độ xem của em vẫn được giữ; hãy thử gửi kết quả chuẩn bị bài khi kết nối ổn định.';
    }
    if (/đã gửi|da gui|verify|xác minh/.test(lower)) {
      return 'Kết quả chuẩn bị bài đang được đồng bộ. Tiến độ xem của em vẫn được giữ an toàn; hãy tải lại và kiểm tra sau ít phút.';
    }
    return 'Chưa gửi được kết quả chuẩn bị bài. Tiến độ xem của em vẫn được giữ an toàn; hãy thử gửi lại.';
  }

  if (/self[_ -]?study|tự học|tu hoc|activities|activity/.test(lower) || /SELF_STUDY_/i.test(raw)) {
    return staff
      ? 'Chưa thể cập nhật quyền tự học hoặc tải đầy đủ nội dung bài. Vui lòng làm mới dữ liệu bài học và thử lại.'
      : 'Chưa thể mở đầy đủ nội dung tự học lúc này. Em hãy tải lại bài học và thử lại.';
  }

  if (/học lại|hoc lai|retake|learningresultactions|official_retake/.test(lower)) {
    if (staff) {
      if (/đã có quyền|da co quyen/.test(lower)) return 'Học sinh đã được cấp quyền học lại. Vui lòng làm mới bảng theo dõi để xem trạng thái mới nhất.';
      return 'Chưa thể cập nhật quyền học lại. Hệ thống chưa thay đổi kết quả của học sinh; vui lòng làm mới bảng theo dõi và thử lại.';
    }
    return 'Lượt học lại chưa được cập nhật. Em hãy tải lại bài học và thử lại.';
  }

  if (/learningprogress|điểm|diem|nộp bài|nop bai|assessment|final_quiz|kết quả học tập|ket qua hoc tap/.test(lower)) {
    if (/đã nộp|da nop|thành công|thanh cong|đã cập nhật|da cap nhat/.test(lower)) {
      return raw.replace(/\[[A-Z][A-Z0-9_]{3,}\]/g, '').trim();
    }
    return staff
      ? 'Chưa thể cập nhật kết quả học tập. Hệ thống chưa thay đổi dữ liệu hiện có; vui lòng làm mới bảng theo dõi và thử lại.'
      : 'Kết quả học tập chưa được đồng bộ. Bài làm của em vẫn được giữ an toàn; hãy thử lại.';
  }

  if (/phiên đăng nhập|het han|hết hạn|đăng nhập lại|dang nhap lai/.test(lower)) {
    return staff
      ? 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại để tiếp tục thao tác.'
      : 'Phiên đăng nhập đã hết hạn. Em hãy đăng nhập lại để tiếp tục.';
  }

  if (/network|offline|unavailable|mạng|kết nối/.test(lower)) {
    return staff
      ? 'Kết nối đang gián đoạn. Dữ liệu hiện tại chưa bị thay đổi; vui lòng thử lại khi kết nối ổn định.'
      : 'Kết nối đang gián đoạn. Dữ liệu trên màn hình vẫn được giữ; em hãy thử lại khi kết nối ổn định.';
  }

  if (TECHNICAL_TOKEN.test(raw)) return safeFallback;
  return raw.replace(/\s*\[[A-Z][A-Z0-9_]{3,}\]\s*/g, ' ').replace(/\s{2,}/g, ' ').trim() || safeFallback;
}

export function professionalErrorMessage(error: unknown, fallback?: string, audience: UserMessageAudience = 'student') {
  const message = error instanceof Error ? error.message : error;
  return professionalUserMessage(message, fallback, audience);
}
