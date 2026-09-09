import type { AIConfig, AIConfigOpenReason, Lesson, LessonContent } from '../types';
import LessonViewer from './LessonViewer';

function buildPreviewLesson(content: LessonContent): Lesson {
  const title = content.metadata?.tieu_de || content.title || 'Bài học mới';
  return {
    id: 'PREVIEW_LESSON',
    lesson_id: 'PREVIEW_LESSON',
    tieu_de: title,
    mo_ta: content.metadata?.tom_tat || '',
    mon_id: '',
    mon_hoc: content.metadata?.mon_hoc || 'Xem trước',
    khoi: content.metadata?.khoi || '',
    lop_id: '',
    lop: '',
    trang_thai: 'preview',
    nguoi_tao_id: '',
    nguoi_tao: 'Xem trước',
    ngay_tao: '',
    pham_vi: 'private',
  };
}

export default function LessonPreviewModal({
  isOpen,
  content,
  aiConfig,
  onOpenConfig,
  onClose,
}: {
  isOpen: boolean;
  content: LessonContent | null;
  aiConfig: AIConfig;
  onOpenConfig: (reason?: AIConfigOpenReason) => void;
  onClose: () => void;
}) {
  if (!isOpen || !content) return null;

  return (
    <LessonViewer
      isOpen={isOpen}
      lesson={buildPreviewLesson(content)}
      content={content}
      aiConfig={aiConfig}
      onOpenConfig={onOpenConfig}
      onClose={onClose}
      initialMode="preview"
    />
  );
}
