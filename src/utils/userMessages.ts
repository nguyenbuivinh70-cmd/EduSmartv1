/**
 * V6.88.10: Presentation-layer message policy.
 *
 * Operational diagnostics remain attached to Error objects / console logs, while
 * learner/teacher notifications describe the software feature and the next safe
 * action. This prevents internal storage, rule, schema or identity details from
 * leaking into normal UI messages.
 */
function cleanMessage(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

const TECHNICAL_TOKEN = /(firestore|firebase|security rules?|rules\b|permission[- ]denied|resource[- ]exhausted|schema(?:version)?|owneruid|authuid|uid\b|document\b|collection\b|cloud shell|deploy\b|ruleset|identity toolkit|google oauth|\[[A-Z][A-Z0-9_]{3,}\])/i;

export function professionalUserMessage(value: unknown, fallback = 'Chưa thể hoàn tất thao tác. Vui lòng thử lại sau ít phút.') {
  const raw = cleanMessage(value);
  if (!raw) return fallback;
  const lower = raw.toLowerCase();

  if (/prelesson|chuẩn bị bài|chuan bi bai/.test(lower) || /PRELESSON_/i.test(raw)) {
    if (/network|offline|mạng|ket noi|kết nối/.test(lower)) {
      return 'Kết nối đang gián đoạn. Tiến độ xem của em vẫn được giữ; hãy thử gửi kết quả chuẩn bị bài khi kết nối ổn định.';
    }
    if (/đã gửi|da gui|verify|xác minh/.test(lower)) {
      return 'Kết quả chuẩn bị bài đang được đồng bộ. Tiến độ xem của em vẫn được giữ an toàn; hãy tải lại và kiểm tra sau ít phút.';
    }
    return 'Chưa gửi được kết quả chuẩn bị bài. Tiến độ xem của em vẫn được giữ an toàn; hãy thử gửi lại.';
  }

  if (/self[_ -]?study|tự học|tu hoc|activities|activity/.test(lower) || /SELF_STUDY_/i.test(raw)) {
    return 'Chưa thể mở đầy đủ nội dung tự học lúc này. Em hãy tải lại bài học và thử lại.';
  }

  if (/learningprogress|điểm|diem|nộp bài|nop bai|assessment|final_quiz|kết quả học tập|ket qua hoc tap/.test(lower)) {
    if (/đã nộp|da nop|thành công|thanh cong/.test(lower)) return raw.replace(/\[[A-Z][A-Z0-9_]{3,}\]/g, '').trim();
    return 'Kết quả học tập chưa được đồng bộ. Bài làm của em vẫn được giữ an toàn; hãy thử lại.';
  }

  if (/phiên đăng nhập|het han|hết hạn|đăng nhập lại|dang nhap lai/.test(lower)) {
    return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại để tiếp tục.';
  }

  if (/network|offline|unavailable|mạng|kết nối/.test(lower)) {
    return 'Kết nối đang gián đoạn. Dữ liệu trên màn hình vẫn được giữ; vui lòng thử lại khi kết nối ổn định.';
  }

  if (TECHNICAL_TOKEN.test(raw)) return fallback;
  return raw.replace(/\s*\[[A-Z][A-Z0-9_]{3,}\]\s*/g, ' ').replace(/\s{2,}/g, ' ').trim() || fallback;
}

export function professionalErrorMessage(error: unknown, fallback?: string) {
  const message = error instanceof Error ? error.message : error;
  return professionalUserMessage(message, fallback);
}
