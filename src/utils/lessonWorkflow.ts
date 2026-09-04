export type LessonSaveMode = 'draft' | 'publish' | '';

interface ResolveLessonSaveStateInput {
  saveMode?: LessonSaveMode;
  requestedScope?: 'private' | 'shared' | string;
  shareNow?: boolean;
  existingStatus?: string;
  currentStatus?: string;
  role?: string;
  adminPermission?: boolean | string;
}

export function resolveLessonSaveState(input: ResolveLessonSaveStateInput) {
  const saveMode = input.saveMode || '';
  const scope: 'private' | 'shared' = saveMode === 'draft'
    ? 'private'
    : input.requestedScope === 'shared' ? 'shared' : 'private';
  const isAdmin = input.role === 'admin'
    || input.adminPermission === true
    || String(input.adminPermission).toLowerCase() === 'true';

  if (saveMode === 'draft') return { scope, status: 'draft' };
  if (saveMode === 'publish') {
    if (scope === 'private') return { scope, status: 'ready_private' };
    return { scope, status: isAdmin ? 'approved_shared' : 'pending_review' };
  }
  return {
    scope,
    status: input.shareNow
      ? 'pending_review'
      : input.existingStatus || input.currentStatus || 'ready_private',
  };
}
