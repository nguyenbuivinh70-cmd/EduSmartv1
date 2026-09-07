import type { User } from '../types';

type GradeScopeUserLike = Partial<Pick<User, 'vai_tro' | 'khoi' | 'khoi_phu_trach' | 'tat_ca_khoi' | 'quyen_admin'>>;

export function normalizeGradeScope(value: unknown): string[] {
  const source = Array.isArray(value)
    ? value
    : String(value ?? '')
        .split(/[;,|\s]+/)
        .map((item) => item.trim())
        .filter(Boolean);
  return Array.from(new Set(source
    .map((item) => String(item ?? '').trim().replace(/^khối\s*/i, '').replace(/\.0+$/, ''))
    .filter(Boolean)))
    .sort((a, b) => Number(a) - Number(b) || a.localeCompare(b, 'vi'));
}

export function getManagedGradeScope(user?: GradeScopeUserLike | null): string[] {
  if (!user || user.vai_tro !== 'teacher') return [];
  const explicit = normalizeGradeScope(user.khoi_phu_trach);
  if (explicit.length) return explicit;
  const fallback = String(user.khoi || '').trim();
  return fallback ? normalizeGradeScope([fallback]) : [];
}

export function teacherManagesAllGrades(user?: GradeScopeUserLike | null) {
  if (!user || user.vai_tro !== 'teacher') return false;
  return user.tat_ca_khoi === true || user.quyen_admin === true || String(user.quyen_admin).toLowerCase() === 'true';
}

export function canManageGrade(user: GradeScopeUserLike | null | undefined, grade: unknown) {
  if (!user) return false;
  if (user.vai_tro === 'admin' || user.quyen_admin === true || String(user.quyen_admin).toLowerCase() === 'true') return true;
  if (user.vai_tro !== 'teacher') return String(user.khoi || '') === String(grade || '');
  if (teacherManagesAllGrades(user)) return true;
  const normalized = String(grade ?? '').trim().replace(/\.0+$/, '');
  if (!normalized) return true;
  return getManagedGradeScope(user).includes(normalized);
}

export function formatManagedGrades(user?: GradeScopeUserLike | null) {
  if (!user || user.vai_tro !== 'teacher') return '';
  if (teacherManagesAllGrades(user)) return 'Tất cả khối';
  const grades = getManagedGradeScope(user);
  return grades.length ? `Khối ${grades.join(', ')}` : 'Chưa phân công khối';
}
