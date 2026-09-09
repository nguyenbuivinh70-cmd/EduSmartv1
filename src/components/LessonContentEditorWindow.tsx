import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, BookOpen, CheckCircle2, FileQuestion, Layers, Save, X } from 'lucide-react';
import type { AIConfig, LessonContent } from '../types';
import LessonManualEditor from './LessonManualEditor';
import LessonActivityManualEditor from './LessonActivityManualEditor';

interface LessonContentEditorWindowProps {
  isOpen: boolean;
  content: LessonContent;
  aiConfig: AIConfig;
  onOpenConfig: (reason?: 'manual' | 'quota') => void;
  onClose: () => void;
  onSave: (content: LessonContent) => void;
}

function plainText(value?: string) {
  return String(value || '')
    .replace(/<br\s*\/?\s*>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function scrollToEditorBlock(id: string) {
  const target = document.getElementById(id);
  if (!target) return;
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export default function LessonContentEditorWindow({ isOpen, content, aiConfig, onOpenConfig, onClose, onSave }: LessonContentEditorWindowProps) {
  const [draft, setDraft] = useState<LessonContent>(content);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setDraft(content);
      setHasChanges(false);
    }
  }, [isOpen, content]);

  const isActivityLesson = draft.schema_version === 'lesson_v3' || Boolean(draft.activities?.length);

  const stats = useMemo(() => {
    const sections = draft.sections || [];
    const activities = draft.activities || [];
    const blockCount = isActivityLesson
      ? activities.reduce((sum, activity) => sum + (activity.pages || []).reduce((pageSum, page) => pageSum + (page.blocks?.length || 0), 0), 0)
      : sections.reduce((sum, section) => sum + (section.content_blocks?.length || 0), 0);
    const interactiveCount = isActivityLesson
      ? activities.reduce((sum, activity) => sum + (activity.interactions?.length || 0), 0)
      : sections.reduce((sum, section) => sum + (section.interactive_questions?.length || 0), 0);
    const finalQuizCount = draft.final_quiz?.length || 0;
    return { sections, activities, blockCount, interactiveCount, finalQuizCount };
  }, [draft, isActivityLesson]);

  const updateDraft = (next: LessonContent) => {
    setDraft(next);
    setHasChanges(true);
  };

  const saveDraft = () => {
    onSave(draft);
    setHasChanges(false);
  };

  const closeSafely = () => {
    if (hasChanges && !window.confirm('Nội dung đang chỉnh sửa chưa được lưu. Thầy/cô có chắc muốn đóng cửa sổ chỉnh sửa?')) return;
    onClose();
  };

  const finishEditing = () => {
    saveDraft();
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen ? (
        <div className="fixed inset-0 z-[10030] flex bg-slate-950/55 p-2 backdrop-blur-sm sm:p-4">
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.985 }}
            className="relative flex h-full w-full flex-col overflow-hidden rounded-[28px] bg-slate-50 shadow-[0_35px_120px_rgba(15,23,42,0.35)]"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/20 bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 px-5 py-4 text-white lg:px-7">
              <div className="min-w-0">
                <p className="mb-1 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-bold">
                  <BookOpen className="h-4 w-4" /> Cửa sổ chỉnh sửa nội dung bài học
                </p>
                <h2 className="truncate text-xl font-black lg:text-2xl">{draft.metadata?.tieu_de || draft.title || 'Bài học tương tác'}</h2>
                <p className="mt-1 text-sm text-white/80">{hasChanges ? 'Có thay đổi chưa lưu' : 'Nội dung đã được đồng bộ trong cửa sổ chỉnh sửa'}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={closeSafely} className="inline-flex items-center gap-2 rounded-2xl bg-white/12 px-4 py-3 text-sm font-bold hover:bg-white/20">
                  <ArrowLeft className="h-4 w-4" /> Quay lại
                </button>
                <button type="button" onClick={saveDraft} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-900/20 hover:bg-emerald-600">
                  <Save className="h-4 w-4" /> Lưu nội dung
                </button>
                <button type="button" onClick={finishEditing} className="inline-flex items-center gap-2 rounded-2xl bg-slate-950/80 px-4 py-3 text-sm font-bold text-white hover:bg-slate-950">
                  <CheckCircle2 className="h-4 w-4" /> Hoàn tất chỉnh sửa
                </button>
                <button type="button" onClick={closeSafely} className="rounded-full bg-white/12 p-3 hover:bg-white/20" aria-label="Đóng cửa sổ chỉnh sửa">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[290px_1fr]">
              <aside className="hidden overflow-y-auto border-r border-slate-200 bg-white/95 p-4 lg:block">
                <div className="rounded-3xl border border-indigo-100 bg-indigo-50/80 p-4">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-indigo-600">Tổng quan</p>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-2xl bg-white px-3 py-2"><span className="text-slate-500">{isActivityLesson ? 'Hoạt động' : 'Mục'}</span><p className="font-black text-slate-900">{isActivityLesson ? stats.activities.length : stats.sections.length}</p></div>
                    <div className="rounded-2xl bg-white px-3 py-2"><span className="text-slate-500">Khối</span><p className="font-black text-slate-900">{stats.blockCount}</p></div>
                    <div className="rounded-2xl bg-white px-3 py-2"><span className="text-slate-500">Tương tác</span><p className="font-black text-slate-900">{stats.interactiveCount}</p></div>
                    <div className="rounded-2xl bg-white px-3 py-2"><span className="text-slate-500">Cuối bài</span><p className="font-black text-slate-900">{stats.finalQuizCount}</p></div>
                  </div>
                </div>

                <nav className="mt-4 space-y-2">
                  <button type="button" onClick={() => scrollToEditorBlock('lesson-editor-general')} className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm font-bold text-slate-700 hover:bg-slate-100">
                    <BookOpen className="h-4 w-4 text-indigo-600" /> Thông tin chung
                  </button>
                  <button type="button" onClick={() => scrollToEditorBlock('lesson-editor-sections')} className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm font-bold text-slate-700 hover:bg-slate-100">
                    <Layers className="h-4 w-4 text-violet-600" /> {isActivityLesson ? 'Hoạt động dạy học' : 'Nội dung kiến thức'}
                  </button>
                  <div className="max-h-[38vh] space-y-1 overflow-y-auto pr-1">
                    {(isActivityLesson ? stats.activities : stats.sections).map((item, index) => (
                      <button
                        key={(isActivityLesson ? stats.activities[index]?.activity_id : stats.sections[index]?.section_id) || index}
                        type="button"
                        onClick={() => scrollToEditorBlock(isActivityLesson ? `lesson-editor-activity-${index}` : `lesson-editor-section-${index}`)}
                        className="flex w-full items-start gap-2 rounded-2xl px-3 py-2 text-left text-xs font-semibold text-slate-600 hover:bg-slate-100"
                      >
                        <span className="mt-0.5 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-black text-violet-700">{index + 1}</span>
                        <span className="line-clamp-2">{plainText(item.title) || `${isActivityLesson ? 'Hoạt động' : 'Mục'} ${index + 1}`}</span>
                      </button>
                    ))}
                  </div>
                  <button type="button" onClick={() => scrollToEditorBlock('lesson-editor-final-quiz')} className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm font-bold text-slate-700 hover:bg-slate-100">
                    <FileQuestion className="h-4 w-4 text-emerald-600" /> Bài kiểm tra cuối bài
                  </button>
                  <button type="button" onClick={() => scrollToEditorBlock('lesson-editor-assessment')} className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm font-bold text-slate-700 hover:bg-slate-100">
                    <CheckCircle2 className="h-4 w-4 text-amber-600" /> Cấu hình đánh giá
                  </button>
                </nav>
              </aside>

              <main className="min-h-0 overflow-y-auto bg-slate-50 p-4 lg:p-6">
                <div className="mx-auto max-w-6xl">
                  <div className="mb-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm lg:hidden">
                    <p className="text-sm font-bold text-slate-800">Cấu trúc bài học: {isActivityLesson ? `${stats.activities.length} hoạt động` : `${stats.sections.length} mục`} • {stats.blockCount} khối • {stats.interactiveCount} câu tương tác • {stats.finalQuizCount} câu cuối bài</p>
                  </div>
                  {isActivityLesson ? <LessonActivityManualEditor content={draft} onChange={updateDraft} /> : <LessonManualEditor content={draft} onChange={updateDraft} />}
                </div>
              </main>
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
