import type { Lesson, LessonRow, LessonTeacherPermissionKey, LessonTeacherPermissionMap, User } from '../types';

export const LESSON_TEACHER_PERMISSION_KEYS: LessonTeacherPermissionKey[] = [
  'edit', 'results', 'lock', 'self_study', 'offline_export', 'archive',
];

export const LESSON_TEACHER_PERMISSION_LABELS: Record<LessonTeacherPermissionKey, string> = {
  edit: 'Sửa bài học',
  results: 'Theo dõi kết quả',
  lock: 'Khóa / mở bài học',
  self_study: 'Quản lý tự học theo lớp',
  offline_export: 'Xuất bài học Offline',
  archive: 'Lưu trữ bài học',
};


export function normalizeLessonTeacherPermissionList(value: unknown): LessonTeacherPermissionKey[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value
    .map((item) => String(item || '').trim() as LessonTeacherPermissionKey)
    .filter((item): item is LessonTeacherPermissionKey => LESSON_TEACHER_PERMISSION_KEYS.includes(item))));
}

export function lessonGlobalTeacherPermissions(lesson?: Lesson | LessonRow | null): LessonTeacherPermissionKey[] {
  const raw = (lesson as Lesson | undefined)?.raw || lesson;
  return normalizeLessonTeacherPermissionList((raw as any)?.teacher_global_permissions);
}
export function normalizeLessonTeacherPermissionMap(value: unknown): LessonTeacherPermissionMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const output: LessonTeacherPermissionMap = {};
  Object.entries(value as Record<string, unknown>).forEach(([rawUserId, rawPermissions]) => {
    const userId = String(rawUserId || '').trim();
    if (!userId || !Array.isArray(rawPermissions)) return;
    const permissions = Array.from(new Set(rawPermissions
      .map((item) => String(item || '').trim() as LessonTeacherPermissionKey)
      .filter((item): item is LessonTeacherPermissionKey => LESSON_TEACHER_PERMISSION_KEYS.includes(item))));
    if (permissions.length) output[userId] = permissions;
  });
  return output;
}

export function lessonPermissionMapFromLesson(lesson?: Lesson | LessonRow | null): LessonTeacherPermissionMap {
  const raw = (lesson as Lesson | undefined)?.raw || lesson;
  return normalizeLessonTeacherPermissionMap((raw as any)?.teacher_permissions);
}

export function isLessonPermissionConfigured(lesson?: Lesson | LessonRow | null) {
  const raw = (lesson as Lesson | undefined)?.raw || lesson;
  return (raw as any)?.teacher_permissions_configured === true;
}

export function lessonTeacherHasPermission(
  lesson: Lesson | LessonRow | null | undefined,
  user: User | null | undefined,
  permission: LessonTeacherPermissionKey,
) {
  if (!lesson || !user) return false;
  if (user.vai_tro === 'admin' || user.quyen_admin === true || String(user.quyen_admin).toLowerCase() === 'true') return true;
  if (String(lesson.nguoi_tao_id || '').trim() === String(user.user_id || '').trim()) return true;
  if (user.vai_tro !== 'teacher') return false;
  const map = lessonPermissionMapFromLesson(lesson);
  const configured = isLessonPermissionConfigured(lesson);
  const globalGranted = lessonGlobalTeacherPermissions(lesson);
  const granted = map[String(user.user_id || '').trim()] || [];
  if (configured) return globalGranted.includes(permission) || granted.includes(permission);
  // Backward compatibility: trước V6.92.0 giáo viên cùng phạm vi vẫn thấy kết quả
  // của bài dùng chung. Các quyền thay đổi bài học luôn cần được cấp rõ ràng.
  return permission === 'results' && lesson.pham_vi === 'shared';
}

export function lessonTeacherHasAnyPermission(lesson: Lesson | LessonRow | null | undefined, user: User | null | undefined) {
  return LESSON_TEACHER_PERMISSION_KEYS.some((key) => lessonTeacherHasPermission(lesson, user, key));
}
