export const BACKEND_URL = 'https://script.google.com/macros/s/AKfycbyptQ6tatlONK04hPowA-QaMpfvSLkb0CaxTUMzicfk2s6vVyCSmiBt8S4iQLqPqtoKUw/exec';

export const AI_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.5-pro',
  'gemini-3.1-pro-preview',
  'gemini-3.1-flash-lite-preview'
];

export const SUBJECTS = ['Toán', 'Văn', 'Anh', 'Lý', 'Hóa', 'Sinh', 'Sử', 'Địa', 'GDCD', 'Tin học'];
export const SUPPORTED_GRADES = Array.from({ length: 12 }, (_, index) => String(index + 1));
export const DEFAULT_ACTIVE_GRADES = ['6', '7', '8', '9'];
export const GRADES = SUPPORTED_GRADES;

export function compareGradeValues(a?: string | number | null, b?: string | number | null) {
  return Number(String(a ?? '').trim()) - Number(String(b ?? '').trim());
}

export function sortGrades(values: Array<string | number>) {
  return Array.from(new Set(values.map((value) => String(value).trim()).filter(Boolean))).sort(compareGradeValues);
}


export const VIDEO_CONFIG_STORAGE_KEY = 'edu_smart_system_video_config_v1';
export const VIDEO_POPUP_VIEW_STORAGE_KEY = 'edu_smart_video_popup_view_state_v1';

export const DEFAULT_VIDEO_POPUP_CONFIG = {
  enabled: false,
  youtubeUrl: '',
  embedUrl: '',
  title1: 'HỘI THI',
  title2: 'TIN HỌC TRẺ TỈNH VĨNH LONG NĂM 2026',
  title3: 'SẢN PHẨM: PHẦN MỀM TRỢ LÝ HỌC TẬP THEO BÀI HỌC',
  description:
    'Trân trọng giới thiệu video sản phẩm dự thi. Kính mời thầy cô và học sinh theo dõi để hiểu rõ hơn về mục tiêu, tính năng và hiệu quả ứng dụng của phần mềm.',
  displayMode: 'every_visit',
  targetRoles: ['admin', 'teacher', 'student'],
  dismissible: true,
  primaryButtonLabel: 'Tiếp tục vào ứng dụng',
  secondaryButtonLabel: 'Đóng',
};
