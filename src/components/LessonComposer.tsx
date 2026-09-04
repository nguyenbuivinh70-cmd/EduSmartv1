import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, BookOpenCheck, CheckCircle2, ChevronLeft, ChevronRight, Edit3, Eye, FileText, Link2, Loader2, PlayCircle, Presentation, Rocket, Save, Settings2, Sparkles, Upload, Users, X, Youtube } from 'lucide-react';
import {
  AIConfig,
  CatalogClass,
  Lesson,
  LessonComposerValues,
  LessonBuilderSettings,
  LessonContent,
  Subject,
  User,
} from '../types';
import { analyzeLessonMaterial, fileToUploadedSourceFile, reviseLessonWithAI } from '../services/gemini';
import { getLessonBuilderDefaultsApi, resetLessonBuilderDefaultsApi, saveLessonBuilderDefaultsApi } from '../services/api';
import { DEFAULT_ACTIVE_GRADES, sortGrades } from '../constants';
import { buildLessonTitle, normalizeLessonName, normalizeLessonNumber, resolveLessonIdentity } from '../utils/lessonCatalog';
import LessonBuilderSettingsPanel, { DEFAULT_LESSON_BUILDER_SETTINGS } from './LessonBuilderSettingsPanel';
import LessonPreviewModal from './LessonPreviewModal';
import AIRevisionPanel from './AIRevisionPanel';
import GoogleSlidesPromptModal from './GoogleSlidesPromptModal';
import LessonContentEditorWindow from './LessonContentEditorWindow';
import YoutubeEmbedBlock, { getYoutubeEmbedUrl } from './YoutubeEmbedBlock';

function gradeIncluded(subjectGradeList: string | undefined, grade: string) {
  const normalizedGrade = String(grade || '').trim();
  if (!normalizedGrade) return true;
  const allowed = String(subjectGradeList || '').split(',').map((item) => item.trim().replace(/\.0+$/, '')).filter(Boolean);
  if (!allowed.length) return true;
  return allowed.includes(normalizedGrade);
}

function cleanInlineText(value?: string) {
  return String(value || '')
    .replace(/<br\s*\/?\s*>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanSectionTitle(value: string | undefined, index: number) {
  return cleanInlineText(value)
    .replace(/^\s*Nội\s*dung\s*\d+\s*[:.\-–—)]\s*/i, '')
    .replace(/^(\d+)\.\s*\1\.\s*/, '$1. ')
    .trim() || `${index + 1}. Nội dung bài học`;
}

interface LessonComposerProps {
  isOpen: boolean;
  user: User;
  aiConfig: AIConfig;
  subjects: Subject[];
  classes: CatalogClass[];
  existingLessons?: Lesson[];
  initialLesson?: Lesson | null;
  initialContent?: LessonContent | null;
  currentSchoolYear?: string;
  onClose: () => void;
  onSave: (values: LessonComposerValues) => Promise<void>;
  onOpenConfig: (reason?: 'manual' | 'quota') => void;
}

type ComposerStep = 'info' | 'settings' | 'material' | 'content' | 'publish';

const COMPOSER_STEPS: Array<{ id: ComposerStep; label: string; description: string; icon: typeof FileText }> = [
  { id: 'info', label: 'Thông tin', description: 'Môn, khối, số bài và tên bài', icon: FileText },
  { id: 'settings', label: 'Thiết kế', description: 'Cấu hình trước khi tạo', icon: Settings2 },
  { id: 'material', label: 'Học liệu', description: 'Nguồn bài và video', icon: PlayCircle },
  { id: 'content', label: 'Biên tập', description: 'Nội dung AI đã tạo', icon: Sparkles },
  { id: 'publish', label: 'Giao bài', description: 'Lớp, lịch và xuất bản', icon: Rocket },
];

function mergeVideoLinks(content: LessonContent, videoLinksText: string, introVideoUrl: string): LessonContent {
  const links = String(videoLinksText || '').split(/\r?\n/).map((line) => line.trim());
  return {
    ...content,
    intro_video_url: introVideoUrl.trim(),
    intro_video_embed_url: getYoutubeEmbedUrl(introVideoUrl),
    sections: (content.sections || []).map((section, index) => {
      const url = section.youtube_url || links[index] || '';
      return { ...section, youtube_url: url, youtube_embed_url: getYoutubeEmbedUrl(url) || section.youtube_embed_url || '' };
    }),
  };
}


function normalizeGradeValue(value?: string | number | null) {
  return String(value ?? '').trim().replace(/\.0+$/, '');
}

function getAvailableLessonGrades(classes: CatalogClass[], user: User) {
  const discovered = sortGrades(classes.map((item) => normalizeGradeValue(item.khoi)).filter(Boolean));
  if (discovered.length) return discovered;
  if (user.khoi) return [normalizeGradeValue(user.khoi)];
  return DEFAULT_ACTIVE_GRADES;
}

function currentSchoolYear() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const start = month >= 8 ? year : year - 1;
  return `${start}-${start + 1}`;
}

function toDatetimeLocalValue(value?: string) {
  if (!value) return '';
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    const pad = (num: number) => String(num).padStart(2, '0');
    return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
  }
  return value.replace(' ', 'T').slice(0, 16);
}

function mergeLessonBuilderSettings(settings?: Partial<LessonBuilderSettings> | null): LessonBuilderSettings {
  const merged = { ...DEFAULT_LESSON_BUILDER_SETTINGS, ...(settings || {}) };
  const finalTypes = Array.isArray(merged.final_quiz_question_types) && merged.final_quiz_question_types.length
    ? merged.final_quiz_question_types
    : DEFAULT_LESSON_BUILDER_SETTINGS.final_quiz_question_types;
  const reviewTypes = Array.isArray(merged.review_question_types) && merged.review_question_types.length
    ? merged.review_question_types
    : DEFAULT_LESSON_BUILDER_SETTINGS.review_question_types;
  return {
    ...merged,
    final_quiz_question_types: [...(finalTypes || [])],
    review_question_types: [...(reviewTypes || [])],
  };
}

function formatDefaultUpdatedAt(value?: string) {
  if (!value) return '';
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed.toLocaleString('vi-VN');
  return value;
}

function buildInitialValues(user: User, lesson?: Lesson | null, content?: LessonContent | null, systemSchoolYear?: string, defaultBuilderSettings?: LessonBuilderSettings | null): LessonComposerValues {
  const settings = mergeLessonBuilderSettings(content?.settings || (!lesson ? defaultBuilderSettings : null));
  const sectionVideoLinks = (content?.sections || []).map((section) => section.youtube_url || section.youtube_embed_url || '').join('\n');
  const identity = resolveLessonIdentity({
    lesson_number: lesson?.lesson_number ?? content?.metadata?.lesson_number,
    lesson_name: lesson?.lesson_name ?? content?.metadata?.lesson_name,
    tieu_de: lesson?.tieu_de || content?.metadata?.tieu_de || '',
  });
  return {
    lesson_id: lesson?.lesson_id,
    tieu_de: identity.title,
    lesson_number: identity.lessonNumber,
    lesson_name: identity.lessonName,
    tom_tat: lesson?.mo_ta || content?.metadata?.tom_tat || '',
    mon_id: lesson?.mon_id || '',
    khoi: lesson?.khoi || user.khoi || '6',
    lop_id: lesson?.lop_id || '',
    pham_vi: lesson?.pham_vi || 'private',
    share_now: lesson?.trang_thai === 'pending_review',
    save_mode: lesson?.trang_thai === 'draft' ? 'draft' : 'publish',
    tu_khoa: content?.metadata?.tu_khoa?.join(', ') || '',
    lesson_json: content || null,
    builder_settings: settings,
    intro_video_url: content?.intro_video_url || content?.intro_video_embed_url || '',
    section_video_links: sectionVideoLinks,
    ai_revision_request: '',
    source_text: '',
    source_file: null,
    nam_hoc: lesson?.nam_hoc || lesson?.raw?.nam_hoc || systemSchoolYear || currentSchoolYear(),
    hoc_ky: lesson?.hoc_ky || lesson?.raw?.hoc_ky || 'HK1',
    thoi_gian_bat_dau: toDatetimeLocalValue(lesson?.thoi_gian_bat_dau || lesson?.raw?.thoi_gian_bat_dau || ''),
    thoi_gian_ket_thuc: toDatetimeLocalValue(lesson?.thoi_gian_ket_thuc || lesson?.raw?.thoi_gian_ket_thuc || ''),
    cho_phep_hoc_sau_han: lesson?.cho_phep_hoc_sau_han === true || String(lesson?.cho_phep_hoc_sau_han || lesson?.raw?.cho_phep_hoc_sau_han || '').toLowerCase() === 'true',
    cho_phep_nop_sau_han: lesson?.cho_phep_nop_sau_han === true || String(lesson?.cho_phep_nop_sau_han || lesson?.raw?.cho_phep_nop_sau_han || '').toLowerCase() === 'true',
  };
}

const fieldClass = 'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100';

export default function LessonComposer({ isOpen, user, aiConfig, subjects, classes, existingLessons = [], initialLesson, initialContent, currentSchoolYear: systemSchoolYear, onClose, onSave, onOpenConfig }: LessonComposerProps) {
  const [lessonBuilderDefaults, setLessonBuilderDefaults] = useState<LessonBuilderSettings | null>(null);
  const [lessonBuilderDefaultsUpdatedAt, setLessonBuilderDefaultsUpdatedAt] = useState('');
  const [isLoadingLessonDefaults, setIsLoadingLessonDefaults] = useState(false);
  const [isSavingLessonDefaults, setIsSavingLessonDefaults] = useState(false);
  const [isResettingLessonDefaults, setIsResettingLessonDefaults] = useState(false);
  const [defaultStatusMessage, setDefaultStatusMessage] = useState('');
  const [values, setValues] = useState<LessonComposerValues>(buildInitialValues(user, initialLesson, initialContent, systemSchoolYear, lessonBuilderDefaults));
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isRevising, setIsRevising] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [contentEditorOpen, setContentEditorOpen] = useState(false);
  const [slidesPromptOpen, setSlidesPromptOpen] = useState(false);
  const [activeStep, setActiveStep] = useState<ComposerStep>(initialContent ? 'content' : 'info');
  const [configurationConfirmed, setConfigurationConfirmed] = useState(Boolean(initialContent));
  const [contentNeedsRegeneration, setContentNeedsRegeneration] = useState(false);
  const gradeOptions = useMemo(() => getAvailableLessonGrades(classes, user), [classes, user]);

  useEffect(() => {
    if (isOpen) {
      setValues(buildInitialValues(user, initialLesson, initialContent, systemSchoolYear, lessonBuilderDefaults));
      setErrorMessage('');
      setPreviewOpen(false);
      setContentEditorOpen(false);
      setSlidesPromptOpen(false);
      setActiveStep(initialContent ? 'content' : 'info');
      setConfigurationConfirmed(Boolean(initialContent));
      setContentNeedsRegeneration(false);
      setDefaultStatusMessage('');
    }
  }, [isOpen, user, initialLesson, initialContent, systemSchoolYear]);

  useEffect(() => {
    if (!isOpen || !user.token || user.vai_tro === 'student') return;
    let cancelled = false;
    setIsLoadingLessonDefaults(true);
    getLessonBuilderDefaultsApi(user.token)
      .then((res) => {
        if (cancelled) return;
        if (res.ok && res.data?.settings) {
          const defaults = mergeLessonBuilderSettings(res.data.settings);
          setLessonBuilderDefaults(defaults);
          setLessonBuilderDefaultsUpdatedAt(formatDefaultUpdatedAt(res.data.updated_at));
          if (!initialLesson && !initialContent) {
            setValues((prev) => ({ ...prev, builder_settings: defaults }));
            setConfigurationConfirmed(false);
          }
        } else if (res.ok) {
          setLessonBuilderDefaults(null);
          setLessonBuilderDefaultsUpdatedAt('');
        }
      })
      .catch(() => {
        if (!cancelled) setDefaultStatusMessage('Chưa tải được cấu hình mặc định từ hệ thống. Có thể Apps Script chưa cập nhật V6.48.');
      })
      .finally(() => {
        if (!cancelled) setIsLoadingLessonDefaults(false);
      });
    return () => { cancelled = true; };
  }, [isOpen, user.token, user.vai_tro, initialLesson, initialContent]);

  useEffect(() => {
    if (values.khoi && gradeOptions.includes(String(values.khoi))) return;
    const nextGrade = gradeOptions[0] || DEFAULT_ACTIVE_GRADES[0];
    if (nextGrade) setValues((prev) => ({ ...prev, khoi: nextGrade }));
  }, [gradeOptions, values.khoi]);

  const availableSubjects = useMemo(() => subjects.filter((item) => gradeIncluded(item.khoi_ap_dung, values.khoi)), [subjects, values.khoi]);
  const selectedSubject = useMemo(() => subjects.find((item) => item.mon_id === values.mon_id)?.ten_mon || '', [subjects, values.mon_id]);
  const settings = mergeLessonBuilderSettings(values.builder_settings || lessonBuilderDefaults || DEFAULT_LESSON_BUILDER_SETTINGS);
  const duplicateLesson = useMemo(() => {
    const lessonNumber = normalizeLessonNumber(values.lesson_number);
    if (!lessonNumber || !values.mon_id || !values.khoi) return null;
    const classId = String(values.lop_id || '').trim();
    return existingLessons.find((lesson) => {
      if (lesson.lesson_id === (values.lesson_id || initialLesson?.lesson_id)) return false;
      const candidate = resolveLessonIdentity(lesson);
      if (candidate.lessonNumber !== lessonNumber) return false;
      if (String(lesson.mon_id || '') !== String(values.mon_id)) return false;
      if (String(lesson.khoi || '') !== String(values.khoi)) return false;
      if (String(lesson.nam_hoc || lesson.raw?.nam_hoc || '') !== String(values.nam_hoc || '')) return false;
      if (String(lesson.hoc_ky || lesson.raw?.hoc_ky || 'HK1').toUpperCase() !== String(values.hoc_ky || 'HK1').toUpperCase()) return false;
      const candidateClassId = String(lesson.lop_id || '').trim();
      return !classId || !candidateClassId || classId === candidateClassId;
    }) || null;
  }, [existingLessons, initialLesson?.lesson_id, values.lesson_id, values.lesson_number, values.mon_id, values.khoi, values.lop_id, values.nam_hoc, values.hoc_ky]);

  const markGenerationInputChanged = () => {
    setConfigurationConfirmed(false);
    if (values.lesson_json) setContentNeedsRegeneration(true);
  };

  const updateGenerationField = <K extends keyof LessonComposerValues>(key: K, value: LessonComposerValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    if (values.lesson_json) setContentNeedsRegeneration(true);
  };

  const updateLessonNumber = (rawValue: string) => {
    const lessonNumber = rawValue.trim() === '' ? undefined : normalizeLessonNumber(rawValue);
    setValues((prev) => ({
      ...prev,
      lesson_number: lessonNumber,
      tieu_de: buildLessonTitle(lessonNumber, prev.lesson_name),
    }));
    if (values.lesson_json) setContentNeedsRegeneration(true);
  };

  const updateLessonName = (rawValue: string) => {
    setValues((prev) => ({
      ...prev,
      lesson_name: rawValue,
      tieu_de: buildLessonTitle(prev.lesson_number, rawValue),
    }));
    if (values.lesson_json) setContentNeedsRegeneration(true);
  };

  const withStructuredIdentity = (content: LessonContent): LessonContent => ({
    ...content,
    title: values.tieu_de,
    metadata: {
      ...content.metadata,
      tieu_de: values.tieu_de,
      lesson_number: normalizeLessonNumber(values.lesson_number),
      lesson_name: normalizeLessonName(values.lesson_name),
      khoi: values.khoi,
      mon_hoc: selectedSubject || content.metadata?.mon_hoc,
    },
  });

  useEffect(() => {
    if (values.mon_id && !availableSubjects.some((item) => item.mon_id === values.mon_id)) setValues((prev) => ({ ...prev, mon_id: '' }));
  }, [availableSubjects, values.mon_id]);

  useEffect(() => {
    if (values.mon_id || initialLesson) return;
    const normalizeSubject = (value: unknown) => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    const preferred = availableSubjects.find((item) => normalizeSubject(item.ten_mon) === 'tin hoc')
      || availableSubjects.find((item) => /tin/i.test(String(item.mon_id || '')));
    if (preferred) setValues((prev) => ({ ...prev, mon_id: preferred.mon_id }));
  }, [availableSubjects, initialLesson, values.mon_id]);

  useEffect(() => {
    if (values.lop_id && !classes.some((item) => item.lop_id === values.lop_id && item.khoi === values.khoi)) setValues((prev) => ({ ...prev, lop_id: '' }));
  }, [classes, values.khoi, values.lop_id]);

  const canAnalyze = Boolean(normalizeLessonNumber(values.lesson_number) && normalizeLessonName(values.lesson_name) && values.mon_id && values.khoi && (values.source_file || values.source_text.trim()));
  const introVideoEmbedUrl = getYoutubeEmbedUrl(values.intro_video_url);
  const introVideoInvalid = Boolean(values.intro_video_url?.trim() && !introVideoEmbedUrl);
  const totalSectionQuestions = values.lesson_json?.sections?.reduce((sum, section) => sum + (section.interactive_questions?.length || 0), 0) || 0;
  const finalQuizCount = values.lesson_json?.final_quiz?.length || 0;
  const invalidSectionVideoCount = values.lesson_json?.sections?.filter((section) => {
    const url = section.youtube_url || section.youtube_embed_url || '';
    return Boolean(url.trim() && !getYoutubeEmbedUrl(url));
  }).length || 0;

  const handleSaveDefaultSettings = async () => {
    if (!user.token) return;
    setIsSavingLessonDefaults(true);
    setDefaultStatusMessage('');
    try {
      const payload = mergeLessonBuilderSettings(settings);
      const res = await saveLessonBuilderDefaultsApi(user.token, payload);
      if (!res.ok) throw new Error(res.message || 'Không thể lưu cấu hình mặc định.');
      const saved = mergeLessonBuilderSettings(res.data?.settings || payload);
      setLessonBuilderDefaults(saved);
      setLessonBuilderDefaultsUpdatedAt(formatDefaultUpdatedAt(res.data?.updated_at || new Date().toISOString()));
      setValues((prev) => ({ ...prev, builder_settings: saved }));
      setDefaultStatusMessage('Đã lưu cấu hình hiện tại làm mặc định cho lần tạo bài học sau.');
    } catch (error) {
      setDefaultStatusMessage(String((error as any)?.message || error || 'Không thể lưu cấu hình mặc định.'));
    } finally {
      setIsSavingLessonDefaults(false);
    }
  };

  const handleResetDefaultSettings = async () => {
    if (!user.token) return;
    setIsResettingLessonDefaults(true);
    setDefaultStatusMessage('');
    try {
      const res = await resetLessonBuilderDefaultsApi(user.token);
      if (!res.ok) throw new Error(res.message || 'Không thể khôi phục cấu hình mặc định.');
      const systemDefaults = mergeLessonBuilderSettings(DEFAULT_LESSON_BUILDER_SETTINGS);
      setLessonBuilderDefaults(null);
      setLessonBuilderDefaultsUpdatedAt('');
      setValues((prev) => ({ ...prev, builder_settings: systemDefaults }));
      setConfigurationConfirmed(false);
      if (values.lesson_json) setContentNeedsRegeneration(true);
      setDefaultStatusMessage('Đã khôi phục cấu hình tạo bài học về mặc định của hệ thống.');
    } catch (error) {
      setDefaultStatusMessage(String((error as any)?.message || error || 'Không thể khôi phục cấu hình mặc định.'));
    } finally {
      setIsResettingLessonDefaults(false);
    }
  };

  const handleFileChange = async (file?: File | null) => {
    if (!file) return;
    const uploaded = await fileToUploadedSourceFile(file);
    setValues((prev) => ({ ...prev, source_file: uploaded }));
    if (values.lesson_json) setContentNeedsRegeneration(true);
  };

  const handleAnalyze = async () => {
    if (!aiConfig.apiKey) {
      setErrorMessage('Bạn chưa cấu hình API Key. Hãy mở Cấu hình AI trước khi phân tích bài học.');
      return;
    }
    if (!canAnalyze) {
      setErrorMessage('Hãy chọn môn, khối, nhập bài số, tên bài và tải file hoặc dán nội dung nguồn trước khi phân tích.');
      return;
    }
    if (!configurationConfirmed) {
      setErrorMessage('Hãy xác nhận cấu hình thiết kế bài học trước khi phân tích học liệu.');
      setActiveStep('settings');
      return;
    }
    if (introVideoInvalid) {
      setErrorMessage('Link video mở đầu chưa đúng định dạng YouTube.');
      return;
    }
    setErrorMessage('');
    setIsAnalyzing(true);
    try {
      const lessonJson = await analyzeLessonMaterial(aiConfig.apiKey, aiConfig.model, {
        tieu_de: values.tieu_de,
        mon_id: values.mon_id,
        khoi: values.khoi,
        source_text: values.source_text,
      }, values.source_file, selectedSubject, settings);
      const withVideos = withStructuredIdentity(mergeVideoLinks(lessonJson, values.section_video_links || '', values.intro_video_url || ''));
      setValues((prev) => ({
        ...prev,
        lesson_json: withVideos,
        tom_tat: withVideos.metadata.tom_tat || prev.tom_tat,
        tu_khoa: withVideos.metadata.tu_khoa?.join(', ') || prev.tu_khoa,
      }));
      setContentNeedsRegeneration(false);
      setActiveStep('content');
    } catch (error) {
      const raw = String((error as any)?.message || error || '');
      const quotaError = /429|quota|resource_exhausted|rate|limit/i.test(raw);
      setErrorMessage(quotaError ? 'API Key hiện tại đã hết hạn mức sử dụng. Hãy cập nhật API Key khác rồi thử lại.' : raw || 'Không thể phân tích học liệu.');
      if (quotaError) onOpenConfig('quota');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleRevise = async () => {
    if (!values.lesson_json || !values.ai_revision_request?.trim()) return;
    if (!aiConfig.apiKey) {
      setErrorMessage('Bạn chưa cấu hình API Key.');
      return;
    }
    setErrorMessage('');
    setIsRevising(true);
    try {
      const revised = await reviseLessonWithAI(aiConfig.apiKey, aiConfig.model, values.lesson_json, values.ai_revision_request, settings);
      const withVideos = withStructuredIdentity(mergeVideoLinks(revised, values.section_video_links || '', values.intro_video_url || ''));
      setValues((prev) => ({ ...prev, lesson_json: withVideos, ai_revision_request: '', tom_tat: withVideos.metadata.tom_tat || prev.tom_tat, tu_khoa: withVideos.metadata.tu_khoa?.join(', ') || prev.tu_khoa }));
    } catch (error) {
      setErrorMessage(String((error as any)?.message || error || 'Không thể điều chỉnh bài học.'));
    } finally {
      setIsRevising(false);
    }
  };

  const handleSave = async (saveMode: 'draft' | 'publish' = 'publish') => {
    if (!normalizeLessonNumber(values.lesson_number) || !normalizeLessonName(values.lesson_name) || !values.mon_id || !values.khoi) {
      setErrorMessage('Thiếu môn học, khối, bài số hoặc tên bài.');
      return;
    }
    if (!values.lesson_json) {
      setErrorMessage('Bạn cần phân tích học liệu để tạo nội dung trước khi lưu.');
      return;
    }
    if (contentNeedsRegeneration) {
      setErrorMessage('Thông tin, cấu hình hoặc học liệu đã thay đổi. Hãy tạo lại nội dung trước khi lưu.');
      setActiveStep('material');
      return;
    }
    if (introVideoInvalid) {
      setErrorMessage('Link video mở đầu chưa đúng định dạng YouTube. Hãy kiểm tra lại hoặc để trống.');
      setActiveStep('material');
      return;
    }
    if (invalidSectionVideoCount) {
      setErrorMessage(`Có ${invalidSectionVideoCount} link video theo nội dung chưa hợp lệ. Hãy kiểm tra lại trước khi lưu.`);
      setActiveStep('content');
      return;
    }
    if (duplicateLesson) {
      setErrorMessage(`${buildLessonTitle(values.lesson_number, values.lesson_name)} đã tồn tại trong phạm vi khối/lớp đã chọn. Hãy chọn bài số khác hoặc chỉnh sửa bài hiện có.`);
      setActiveStep('info');
      return;
    }
    const finalJson = withStructuredIdentity(mergeVideoLinks(values.lesson_json, values.section_video_links || '', values.intro_video_url || ''));
    setIsSaving(true);
    setErrorMessage('');
    try {
      await onSave({
        ...values,
        tieu_de: buildLessonTitle(values.lesson_number, values.lesson_name),
        lesson_number: normalizeLessonNumber(values.lesson_number),
        lesson_name: normalizeLessonName(values.lesson_name),
        save_mode: saveMode,
        share_now: saveMode === 'publish' && values.pham_vi === 'shared',
        pham_vi: saveMode === 'draft' ? 'private' : values.pham_vi,
        lesson_json: finalJson,
        tom_tat: values.tom_tat.trim(),
        tu_khoa: values.tu_khoa.trim(),
      });
      onClose();
    } catch (error) {
      setErrorMessage(String((error as any)?.message || error || 'Không thể lưu bài học.'));
    } finally {
      setIsSaving(false);
    }
  };

  const updateSectionVideo = (sectionIndex: number, url: string) => {
    setValues((prev) => {
      if (!prev.lesson_json?.sections) return prev;
      const sections = prev.lesson_json.sections.map((section, index) => index === sectionIndex
        ? { ...section, youtube_url: url, youtube_embed_url: getYoutubeEmbedUrl(url) }
        : section);
      return {
        ...prev,
        lesson_json: { ...prev.lesson_json, sections },
        section_video_links: sections.map((section) => section.youtube_url || section.youtube_embed_url || '').join('\n'),
      };
    });
  };

  const activeStepIndex = COMPOSER_STEPS.findIndex((step) => step.id === activeStep);
  const infoReady = Boolean(normalizeLessonNumber(values.lesson_number) && normalizeLessonName(values.lesson_name) && values.mon_id && values.khoi && !duplicateLesson);
  const materialReady = Boolean((values.source_file || values.source_text.trim() || values.lesson_json) && !introVideoInvalid);
  const contentReady = Boolean(values.lesson_json && !contentNeedsRegeneration && invalidSectionVideoCount === 0);

  const selectStep = (step: ComposerStep) => {
    if (isAnalyzing || isSaving || isRevising) return;
    if (step !== 'info' && !infoReady) {
      setActiveStep('info');
      setErrorMessage(duplicateLesson ? 'Bài số đã trùng trong phạm vi đã chọn. Hãy đổi bài số hoặc chỉnh sửa bài hiện có.' : 'Hãy hoàn thành môn học, khối, bài số và tên bài trước.');
      return;
    }
    if (['material', 'content', 'publish'].includes(step) && !configurationConfirmed) {
      setActiveStep('settings');
      setErrorMessage('Hãy kiểm tra và xác nhận cấu hình thiết kế bài học trước.');
      return;
    }
    if (['content', 'publish'].includes(step) && !values.lesson_json) {
      setActiveStep('material');
      setErrorMessage('Hãy thêm học liệu và tạo nội dung trước khi chuyển sang biên tập.');
      return;
    }
    if (step === 'publish' && contentNeedsRegeneration) {
      setActiveStep('content');
      setErrorMessage('Nội dung hiện tại không còn khớp với đầu vào. Hãy tạo lại trước khi giao bài.');
      return;
    }
    setActiveStep(step);
    setErrorMessage('');
  };

  const goToNextStep = () => {
    if (activeStep === 'info' && !infoReady) {
      setErrorMessage(duplicateLesson ? 'Bài số đã trùng trong phạm vi đã chọn. Hãy đổi bài số hoặc chỉnh sửa bài hiện có.' : 'Hãy hoàn thành môn học, khối, bài số và tên bài trước khi tiếp tục.');
      return;
    }
    if (activeStep === 'settings') {
      setConfigurationConfirmed(true);
      setErrorMessage('');
      setActiveStep('material');
      return;
    }
    if (activeStep === 'material') {
      setErrorMessage('Hãy bấm “Phân tích & tạo bài học” để chuyển sang bước biên tập.');
      return;
    }
    if (activeStep === 'content' && !contentReady) {
      setErrorMessage('Hãy tạo hoặc tạo lại nội dung trước khi giao bài.');
      return;
    }
    setErrorMessage('');
    const next = COMPOSER_STEPS[Math.min(COMPOSER_STEPS.length - 1, activeStepIndex + 1)];
    setActiveStep(next.id);
  };

  const goToPreviousStep = () => {
    setErrorMessage('');
    const previous = COMPOSER_STEPS[Math.max(0, activeStepIndex - 1)];
    setActiveStep(previous.id);
  };

  const sectionVideoCount = values.lesson_json?.sections?.filter((section) => getYoutubeEmbedUrl(section.youtube_url || section.youtube_embed_url)).length || 0;
  const stepReady: Record<ComposerStep, boolean> = {
    info: infoReady,
    settings: configurationConfirmed,
    material: materialReady,
    content: contentReady,
    publish: false,
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[10002] flex items-center justify-center p-4 lg:p-8">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
          <motion.div initial={{ opacity: 0, y: 24, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: 0.98 }} className="relative z-10 flex h-[100dvh] w-full max-w-[1480px] flex-col overflow-hidden rounded-none bg-white shadow-[0_35px_90px_rgba(15,23,42,0.25)] sm:h-[94dvh] sm:rounded-[30px]">
            <div className="bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 px-6 py-4 text-white lg:px-8">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="mb-1.5 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold"><BookOpenCheck className="h-4 w-4" /> {initialLesson ? 'Chỉnh sửa bài học' : 'Tạo bài học mới'}</p>
                  <h2 className="text-2xl font-bold">Trình tạo bài học theo từng bước</h2>
                  <p className="mt-1 text-sm text-white/75">Hoàn thành từng nhóm thông tin, xem trước rồi mới lưu và giao cho học sinh.</p>
                </div>
                <button type="button" onClick={onClose} className="rounded-full bg-white/12 p-2 hover:bg-white/20" aria-label="Đóng trình tạo bài học"><X className="h-5 w-5" /></button>
              </div>
            </div>

            <div className="border-b border-slate-200 bg-white px-4 py-3 lg:px-8">
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
                {COMPOSER_STEPS.map((step, index) => {
                  const StepIcon = step.icon;
                  const active = step.id === activeStep;
                  return (
                    <button key={step.id} type="button" disabled={isAnalyzing || isSaving || isRevising} onClick={() => selectStep(step.id)} className={`flex min-w-0 items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${active ? 'border-indigo-200 bg-indigo-50 text-indigo-700 shadow-sm' : 'border-transparent bg-slate-50 text-slate-500 hover:border-slate-200 hover:bg-white'}`}>
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${active ? 'bg-indigo-600 text-white' : stepReady[step.id] ? 'bg-emerald-100 text-emerald-700' : 'bg-white text-slate-400'}`}>
                        {stepReady[step.id] && !active ? <CheckCircle2 className="h-4 w-4" /> : <StepIcon className="h-4 w-4" />}
                      </span>
                      <span className="min-w-0"><span className="block text-xs font-bold uppercase tracking-wide">Bước {index + 1}</span><span className="block truncate text-sm font-extrabold">{step.label}</span><span className="hidden truncate text-xs font-medium opacity-75 xl:block">{step.description}</span></span>
                    </button>
                  );
                })}
              </div>
              {errorMessage && <p className="mt-3 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{errorMessage}</p>}
            </div>

            <div className="flex-1 overflow-y-auto bg-slate-50/80">
              <div className="grid items-start gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_390px] lg:p-6">
                <section className="min-w-0 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm lg:p-7">
                  {activeStep === 'info' ? (
                    <div className="space-y-6">
                      <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">Bước 1</p><h3 className="mt-1 text-xl font-black text-slate-900">Thông tin cơ bản</h3><p className="mt-1 text-sm text-slate-500">Chỉ nhập những thông tin AI cần để hiểu đúng bối cảnh bài học. Lớp và lịch giao bài sẽ được thiết lập ở bước cuối.</p></div>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div><label className="mb-2 block text-sm font-semibold text-slate-700">Môn học <span className="text-rose-500">*</span></label><select value={values.mon_id} onChange={(e) => updateGenerationField('mon_id', e.target.value)} className={fieldClass}><option value="">Chọn môn học</option>{availableSubjects.map((subject) => <option key={subject.mon_id} value={subject.mon_id}>{subject.ten_mon}</option>)}</select><p className="mt-1.5 text-xs text-slate-400">Hệ thống ưu tiên chọn mặc định môn Tin học khi môn này đang hoạt động.</p></div>
                        <div><label className="mb-2 block text-sm font-semibold text-slate-700">Khối <span className="text-rose-500">*</span></label><select value={values.khoi} onChange={(e) => updateGenerationField('khoi', e.target.value)} className={fieldClass}>{gradeOptions.map((grade) => <option key={grade} value={grade}>Khối {grade}</option>)}</select></div>
                        <div><label className="mb-2 block text-sm font-semibold text-slate-700">Bài số <span className="text-rose-500">*</span></label><input type="number" min="1" max="999" step="1" value={values.lesson_number ?? ''} onChange={(e) => updateLessonNumber(e.target.value)} className={fieldClass} placeholder="Ví dụ: 1" /><p className="mt-1.5 text-xs text-slate-400">Chỉ nhập số. Nhập 1 được hiểu là Bài 1.</p></div>
                        <div><label className="mb-2 block text-sm font-semibold text-slate-700">Tên bài <span className="text-rose-500">*</span></label><input value={values.lesson_name || ''} onChange={(e) => updateLessonName(e.target.value)} className={fieldClass} placeholder="Ví dụ: Thông tin và dữ liệu" /></div>
                        <div className={`md:col-span-2 rounded-2xl border px-4 py-3 ${duplicateLesson ? 'border-rose-200 bg-rose-50' : 'border-indigo-100 bg-indigo-50/70'}`}><p className="text-xs font-bold uppercase tracking-[0.14em] text-indigo-600">Tên bài hoàn chỉnh</p><p className="mt-1 text-base font-extrabold text-slate-900">{values.tieu_de || 'Nhập bài số và tên bài để tạo tiêu đề'}</p>{duplicateLesson ? <p className="mt-2 flex items-start gap-2 text-sm font-semibold text-rose-700"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> Bài số này đã tồn tại trong phạm vi đang chọn: {duplicateLesson.tieu_de}. Hãy chọn số bài khác hoặc chỉnh sửa bài hiện có.</p> : null}</div>
                      </div>
                      {contentNeedsRegeneration ? <div className="flex items-start gap-3 rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /><div><p className="font-bold">Thông tin tạo bài đã thay đổi</p><p className="mt-1">Sau khi xác nhận lại thiết kế và học liệu, bạn cần tạo lại nội dung để các thay đổi được áp dụng.</p></div></div> : null}
                    </div>
                  ) : null}

                  {activeStep === 'settings' ? (
                    <div className="space-y-5">
                      <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">Bước 2</p><h3 className="mt-1 text-xl font-black text-slate-900">Thiết kế bài học trước khi phân tích</h3><p className="mt-1 text-sm text-slate-500">Chốt cấu trúc, câu hỏi, đánh giá và bài ôn tập trước khi tải học liệu để AI tạo đúng ngay từ lần đầu.</p></div>
                      <div className={`flex items-start gap-3 rounded-3xl border p-4 text-sm ${configurationConfirmed ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-indigo-200 bg-indigo-50 text-indigo-800'}`}><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /><div><p className="font-bold">{configurationConfirmed ? 'Cấu hình đã được xác nhận' : 'Cần xác nhận cấu hình'}</p><p className="mt-1">{configurationConfirmed ? 'AI sẽ sử dụng cấu hình này cho lần tạo nội dung tiếp theo.' : 'Bạn có thể dùng cấu hình mặc định hoặc điều chỉnh rồi bấm “Xác nhận cấu hình”.'}</p></div></div>
                      <LessonBuilderSettingsPanel
                        value={settings}
                        onChange={(next) => { setValues((prev) => ({ ...prev, builder_settings: next })); markGenerationInputChanged(); }}
                        onSaveDefault={() => void handleSaveDefaultSettings()}
                        onResetDefault={() => void handleResetDefaultSettings()}
                        isSavingDefault={isSavingLessonDefaults || isLoadingLessonDefaults}
                        isResettingDefault={isResettingLessonDefaults}
                        defaultUpdatedAt={lessonBuilderDefaultsUpdatedAt}
                        defaultStatusMessage={defaultStatusMessage}
                      />
                    </div>
                  ) : null}

                  {activeStep === 'material' ? (
                    <div className="space-y-6">
                      <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">Bước 3</p><h3 className="mt-1 text-xl font-black text-slate-900">Học liệu và video mở đầu</h3><p className="mt-1 text-sm text-slate-500">Cấu hình đã được chốt. Bây giờ hãy thêm nguồn để AI phân tích và video học sinh sẽ xem trước hoạt động.</p></div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div><label className="mb-2 block text-sm font-semibold text-slate-700">Tải file bài học</label><label className={`flex min-h-28 flex-col items-center justify-center rounded-3xl border border-dashed border-indigo-300 bg-indigo-50/40 px-5 py-4 text-center text-sm text-slate-600 ${isAnalyzing ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-indigo-500'}`}><Upload className="mb-2 h-6 w-6 text-indigo-600" /><p className="font-bold text-slate-800">PDF, DOCX, TXT hoặc Markdown</p><p className="mt-1 text-xs text-slate-500">Bấm để chọn tệp học liệu</p><input type="file" disabled={isAnalyzing} className="hidden" accept=".pdf,.doc,.docx,.txt,.md" onChange={(e) => void handleFileChange(e.target.files?.[0] || null)} /></label>{values.source_file && <p className="mt-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">{values.source_file.name} • {Math.round((values.source_file.size || 0) / 1024)} KB</p>}</div>
                        <div><label className="mb-2 block text-sm font-semibold text-slate-700">Nguồn văn bản bổ sung</label><textarea value={values.source_text} disabled={isAnalyzing} onChange={(e) => updateGenerationField('source_text', e.target.value)} rows={7} className="w-full rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:opacity-60" placeholder="Dán nội dung bài học, yêu cầu chuyên môn hoặc ghi chú sư phạm..." /></div>
                      </div>

                      <div className="rounded-3xl border border-red-100 bg-gradient-to-br from-red-50 to-white p-5">
                        <div className="flex items-start gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-red-600 text-white"><Youtube className="h-6 w-6" /></span><div><h4 className="font-extrabold text-slate-900">Video mở đầu bài học</h4><p className="mt-1 text-sm text-slate-600">Hỗ trợ link <span className="font-semibold">youtube.com/watch</span>, <span className="font-semibold">youtu.be</span>, Shorts, Live và Embed.</p></div></div>
                        <div className="mt-4"><label className="mb-2 block text-sm font-semibold text-slate-700">Link video YouTube</label><div className="relative"><Link2 className="absolute left-4 top-3.5 h-4 w-4 text-slate-400" /><input value={values.intro_video_url || ''} disabled={isAnalyzing} onChange={(e) => setValues((prev) => ({ ...prev, intro_video_url: e.target.value }))} className={`${fieldClass} pl-11 disabled:cursor-not-allowed disabled:opacity-60 ${introVideoInvalid ? 'border-rose-300 focus:border-rose-400 focus:ring-rose-100' : ''}`} placeholder="https://www.youtube.com/watch?v=..." /></div>{introVideoInvalid ? <p className="mt-2 text-sm font-semibold text-rose-600">Liên kết chưa đúng định dạng YouTube.</p> : values.intro_video_url?.trim() ? <p className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Liên kết hợp lệ, video đã sẵn sàng.</p> : <p className="mt-2 text-xs text-slate-500">Có thể để trống nếu bài học không cần video mở đầu.</p>}</div>
                        {introVideoEmbedUrl ? <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-black"><YoutubeEmbedBlock url={introVideoEmbedUrl} title={`Video mở đầu: ${values.tieu_de || 'Bài học'}`} /></div> : null}
                      </div>

                      {contentNeedsRegeneration ? <div className="flex items-start gap-3 rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /><div><p className="font-bold">Nội dung cần được tạo lại</p><p className="mt-1">Đầu vào đã thay đổi. Bấm nút tạo ở cuối cửa sổ để đồng bộ nội dung với thông tin và cấu hình mới.</p></div></div> : null}
                      {isAnalyzing ? <div className="flex min-h-32 flex-col items-center justify-center rounded-3xl border border-indigo-200 bg-indigo-50 px-6 text-center"><Loader2 className="h-8 w-8 animate-spin text-indigo-600" /><p className="mt-3 font-bold text-indigo-900">AI đang đọc học liệu và tạo cấu trúc bài học…</p><p className="mt-1 text-sm text-indigo-700">Vui lòng giữ nguyên cửa sổ; cấu hình và học liệu đang được khóa tạm thời.</p></div> : null}
                    </div>
                  ) : null}

                  {activeStep === 'content' ? (
                    <div className="space-y-5">
                      <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">Bước 4</p><h3 className="mt-1 text-xl font-black text-slate-900">Tạo và biên tập nội dung</h3><p className="mt-1 text-sm text-slate-500">Xem lại cấu trúc AI đã tạo, điều chỉnh nội dung và gắn video đúng cho từng mục.</p></div>
                      {values.lesson_json ? <>
                        {contentNeedsRegeneration ? <div className="flex items-start justify-between gap-4 rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900"><div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /><div><p className="font-black">Nội dung hiện tại không còn khớp</p><p className="mt-1">Thông tin, thiết kế hoặc học liệu đã thay đổi sau lần tạo gần nhất. Không thể giao bài cho đến khi tạo lại.</p></div></div><button type="button" onClick={() => setActiveStep('material')} className="shrink-0 rounded-xl bg-amber-600 px-3 py-2 text-xs font-bold text-white">Tạo lại</button></div> : null}
                        <div className="grid gap-4 md:grid-cols-2"><div className="md:col-span-2"><label className="mb-2 block text-sm font-semibold text-slate-700">Tóm tắt bài học</label><textarea value={values.tom_tat} onChange={(e) => setValues((prev) => ({ ...prev, tom_tat: e.target.value }))} rows={3} className="w-full rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" /></div><div className="md:col-span-2"><label className="mb-2 block text-sm font-semibold text-slate-700">Từ khóa</label><input value={values.tu_khoa} onChange={(e) => setValues((prev) => ({ ...prev, tu_khoa: e.target.value }))} className={fieldClass} placeholder="Ví dụ: bộ xử lí, máy tính, công nghệ thông tin" /></div></div>
                        <AIRevisionPanel value={values.ai_revision_request || ''} onChange={(next) => setValues((prev) => ({ ...prev, ai_revision_request: next }))} onRevise={() => void handleRevise()} disabled={!values.lesson_json || contentNeedsRegeneration} loading={isRevising} />
                        <div className="rounded-3xl border border-violet-100 bg-violet-50/70 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h4 className="font-black text-slate-900">Biên tập chi tiết</h4><p className="mt-1 text-sm text-slate-600">Sửa nội dung, video, ghi nhớ, câu hỏi tương tác và kiểm tra cuối bài.</p></div><button type="button" onClick={() => setContentEditorOpen(true)} className="inline-flex items-center gap-2 rounded-2xl bg-violet-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-violet-600/20 hover:bg-violet-700"><Edit3 className="h-4 w-4" /> Mở cửa sổ chỉnh sửa</button></div></div>
                        <div className="rounded-3xl border border-red-100 bg-red-50/40 p-5">
                          <div className="flex flex-wrap items-center justify-between gap-2"><div><h4 className="font-extrabold text-slate-900">Video theo từng nội dung</h4><p className="mt-1 text-sm text-slate-600">Các mục đã được tạo nên mỗi liên kết luôn gắn đúng nội dung.</p></div><span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-red-700">{sectionVideoCount}/{values.lesson_json.sections?.length || 0} mục có video</span></div>
                          <div className="mt-4 space-y-3">{(values.lesson_json.sections || []).map((section, index) => { const sectionUrl = section.youtube_url || section.youtube_embed_url || ''; const invalid = Boolean(sectionUrl.trim() && !getYoutubeEmbedUrl(sectionUrl)); return <div key={section.section_id || index} className="rounded-2xl border border-red-100 bg-white p-4"><div className="flex items-center justify-between gap-3"><p className="min-w-0 truncate text-sm font-bold text-slate-800">{cleanSectionTitle(section.title, index)}</p>{sectionUrl && !invalid ? <span className="shrink-0 text-xs font-bold text-emerald-600">Hợp lệ</span> : null}</div><input value={sectionUrl} onChange={(e) => updateSectionVideo(index, e.target.value)} className={`${fieldClass} mt-3 ${invalid ? 'border-rose-300' : ''}`} placeholder="Link YouTube cho nội dung này (không bắt buộc)" />{invalid ? <p className="mt-1.5 text-xs font-semibold text-rose-600">Liên kết YouTube chưa hợp lệ.</p> : null}</div>; })}</div>
                        </div>
                        <div className="rounded-3xl border border-slate-200 p-5"><div className="flex items-center justify-between gap-3"><h4 className="font-black text-slate-900">Cấu trúc nội dung</h4><span className="text-xs font-bold text-slate-500">{values.lesson_json.sections?.length || 0} mục</span></div><div className="mt-3 space-y-3">{(values.lesson_json.sections || []).map((section, index) => <div key={section.section_id || index} className="rounded-2xl bg-slate-50 px-4 py-3"><div className="flex items-start justify-between gap-3"><p className="font-semibold text-slate-800">{cleanSectionTitle(section.title, index)}</p>{section.youtube_url || section.youtube_embed_url ? <span className="shrink-0 rounded-full bg-red-50 px-2 py-1 text-[11px] font-bold text-red-600">Có video</span> : null}</div><p className="mt-1 line-clamp-2 text-sm text-slate-600">{cleanInlineText(section.content)}</p><p className="mt-2 text-xs font-semibold text-indigo-600">{section.interactive_questions?.length || 0} câu hỏi tương tác</p></div>)}</div></div>
                      </> : <div className="flex min-h-[360px] flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-8 text-center"><div className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-100 text-indigo-600"><Sparkles className="h-8 w-8" /></div><h3 className="mt-5 text-xl font-bold text-slate-900">Chưa có nội dung được tạo</h3><p className="mt-2 max-w-md text-sm text-slate-500">Quay lại bước Học liệu, thêm nguồn bài rồi phân tích và tạo nội dung.</p><button type="button" onClick={() => setActiveStep('material')} className="mt-5 rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white">Đến bước học liệu</button></div>}
                    </div>
                  ) : null}

                  {activeStep === 'publish' ? (
                    <div className="space-y-6">
                      <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">Bước 5</p><h3 className="mt-1 text-xl font-black text-slate-900">Giao bài và xuất bản</h3><p className="mt-1 text-sm text-slate-500">Nội dung đã hoàn thiện. Bây giờ mới chọn lớp, phạm vi và thời gian học để tránh phải cấu hình vận hành quá sớm.</p></div>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div><label className="mb-2 block text-sm font-semibold text-slate-700">Lớp áp dụng</label><select value={values.lop_id} onChange={(e) => setValues((prev) => ({ ...prev, lop_id: e.target.value }))} className={fieldClass} disabled={user.vai_tro === 'student'}><option value="">Tất cả / không cố định</option>{classes.filter((item) => !values.khoi || item.khoi === values.khoi).map((item) => <option key={item.lop_id} value={item.lop_id}>{item.ten_lop}</option>)}</select></div>
                        <div><label className="mb-2 block text-sm font-semibold text-slate-700">Phạm vi sử dụng</label><select value={values.pham_vi} onChange={(e) => setValues((prev) => ({ ...prev, pham_vi: e.target.value as 'private' | 'shared' }))} className={fieldClass} disabled={user.vai_tro === 'student'}><option value="private">Dùng riêng</option><option value="shared">Dùng chung</option></select></div>
                        <div><label className="mb-2 block text-sm font-semibold text-slate-700">Năm học</label><input value={values.nam_hoc || ''} onChange={(e) => setValues((prev) => ({ ...prev, nam_hoc: e.target.value }))} className={fieldClass} placeholder="2026-2027" /></div>
                        <div><label className="mb-2 block text-sm font-semibold text-slate-700">Học kỳ</label><select value={values.hoc_ky || 'HK1'} onChange={(e) => setValues((prev) => ({ ...prev, hoc_ky: e.target.value }))} className={fieldClass}><option value="HK1">Học kỳ 1</option><option value="HK2">Học kỳ 2</option></select></div>
                        <div><label className="mb-2 block text-sm font-semibold text-slate-700">Bắt đầu mở bài</label><input type="datetime-local" value={values.thoi_gian_bat_dau || ''} onChange={(e) => setValues((prev) => ({ ...prev, thoi_gian_bat_dau: e.target.value }))} className={fieldClass} /></div>
                        <div><label className="mb-2 block text-sm font-semibold text-slate-700">Kết thúc bài học</label><input type="datetime-local" value={values.thoi_gian_ket_thuc || ''} onChange={(e) => setValues((prev) => ({ ...prev, thoi_gian_ket_thuc: e.target.value }))} className={fieldClass} /></div>
                        <label className="md:col-span-2 flex items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700"><input type="checkbox" checked={Boolean(values.cho_phep_hoc_sau_han)} onChange={(e) => setValues((prev) => ({ ...prev, cho_phep_hoc_sau_han: e.target.checked }))} /> Cho phép học sau thời gian kết thúc</label>
                      </div>

                      <div className="rounded-3xl border border-indigo-100 bg-indigo-50/60 p-5">
                        <div className="flex items-start gap-3"><Users className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" /><div><h4 className="font-black text-slate-900">Trạng thái sau khi xuất bản</h4><p className="mt-1 text-sm leading-6 text-slate-600">{values.pham_vi === 'private' ? 'Bài học được lưu riêng và chỉ người tạo hoặc quản trị viên quản lý.' : (user.vai_tro === 'admin' || user.quyen_admin === true || String(user.quyen_admin).toLowerCase() === 'true') ? 'Bài học dùng chung của quản trị viên sẽ được xuất bản ngay.' : 'Bài học dùng chung của giáo viên sẽ được gửi quản trị viên duyệt trước khi học sinh sử dụng.'}</p></div></div>
                      </div>

                      <div className="rounded-3xl border border-slate-200 bg-white p-5">
                        <div className="flex flex-wrap items-center justify-between gap-3"><div><h4 className="font-black text-slate-900">Kiểm tra lần cuối như học sinh</h4><p className="mt-1 text-sm text-slate-600">Video mở đầu, các mục kiến thức và câu hỏi sẽ được hiển thị đúng theo bản xem trước.</p></div><button type="button" onClick={() => setPreviewOpen(true)} disabled={!contentReady} className="inline-flex items-center gap-2 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-bold text-indigo-700 disabled:opacity-40"><Eye className="h-4 w-4" /> Xem trước bài học</button></div>
                      </div>
                    </div>
                  ) : null}
                </section>

                <aside className="space-y-4 lg:sticky lg:top-5">
                  <div className="rounded-[28px] border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-violet-50 p-5 shadow-sm">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">Trạng thái bài học</p>
                    <h3 className="mt-2 line-clamp-2 text-lg font-black text-slate-900">{values.lesson_json?.metadata?.tieu_de || values.tieu_de || 'Bài học chưa đặt tên'}</h3>
                    <p className="mt-2 line-clamp-3 text-sm text-slate-600">{values.lesson_json?.metadata?.tom_tat || values.tom_tat || 'Hoàn thành thông tin và thêm học liệu để tạo nội dung.'}</p>
                    <div className="mt-4 grid grid-cols-2 gap-2 text-sm"><div className="rounded-2xl bg-white p-3"><span className="text-xs text-slate-500">Nội dung</span><p className="font-black text-slate-900">{values.lesson_json?.sections?.length || 0} mục</p></div><div className="rounded-2xl bg-white p-3"><span className="text-xs text-slate-500">Tương tác</span><p className="font-black text-slate-900">{totalSectionQuestions} câu</p></div><div className="rounded-2xl bg-white p-3"><span className="text-xs text-slate-500">Cuối bài</span><p className="font-black text-slate-900">{finalQuizCount} câu</p></div><div className="rounded-2xl bg-white p-3"><span className="text-xs text-slate-500">Video</span><p className="font-black text-slate-900">{introVideoEmbedUrl ? 1 : 0} mở đầu · {sectionVideoCount} mục</p></div></div>
                    {contentNeedsRegeneration ? <div className="mt-4 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800"><AlertTriangle className="h-4 w-4 shrink-0" /> Cần tạo lại nội dung vì đầu vào đã thay đổi.</div> : null}
                    <div className="mt-4 space-y-2 text-xs font-semibold"><p className={`flex items-center gap-2 ${stepReady.info ? 'text-emerald-700' : 'text-slate-400'}`}><CheckCircle2 className="h-4 w-4" /> Thông tin cơ bản</p><p className={`flex items-center gap-2 ${stepReady.settings ? 'text-emerald-700' : 'text-slate-400'}`}><CheckCircle2 className="h-4 w-4" /> Thiết kế đã xác nhận</p><p className={`flex items-center gap-2 ${stepReady.material ? 'text-emerald-700' : 'text-slate-400'}`}><CheckCircle2 className="h-4 w-4" /> Học liệu và video mở đầu</p><p className={`flex items-center gap-2 ${stepReady.content ? 'text-emerald-700' : 'text-slate-400'}`}><CheckCircle2 className="h-4 w-4" /> Nội dung đã đồng bộ</p></div>
                  </div>

                  {values.lesson_json ? <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
                    <p className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Công cụ kiểm tra</p>
                    <div className="grid gap-2">
                      <div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setPreviewOpen(true)} disabled={!values.lesson_json} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-700 disabled:opacity-40"><Eye className="h-4 w-4" /> Xem trước</button><button type="button" onClick={() => setContentEditorOpen(true)} disabled={!values.lesson_json} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-violet-200 bg-violet-50 px-3 py-2.5 text-sm font-bold text-violet-700 disabled:opacity-40"><Edit3 className="h-4 w-4" /> Biên tập</button></div>
                      <button type="button" onClick={() => setSlidesPromptOpen(true)} disabled={!values.lesson_json} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-bold text-amber-700 disabled:opacity-40"><Presentation className="h-4 w-4" /> Prompt Google Slides</button>
                    </div>
                  </div> : null}
                </aside>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-3 lg:px-8">
              <button type="button" onClick={goToPreviousStep} disabled={activeStepIndex === 0 || isAnalyzing || isSaving || isRevising} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 disabled:opacity-30"><ChevronLeft className="h-4 w-4" /> Quay lại</button>
              <p className="hidden text-sm font-semibold text-slate-500 sm:block">Bước {activeStepIndex + 1}/{COMPOSER_STEPS.length} · {COMPOSER_STEPS[activeStepIndex]?.label}</p>
              <div className="flex items-center gap-2">
                {activeStep === 'info' ? <button type="button" onClick={goToNextStep} className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white">Tiếp tục thiết kế <ChevronRight className="h-4 w-4" /></button> : null}
                {activeStep === 'settings' ? <button type="button" onClick={goToNextStep} className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white"><CheckCircle2 className="h-4 w-4" /> Xác nhận cấu hình</button> : null}
                {activeStep === 'material' ? <button type="button" onClick={() => void handleAnalyze()} disabled={isAnalyzing || !canAnalyze || introVideoInvalid || !configurationConfirmed} className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">{isAnalyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{isAnalyzing ? 'Đang phân tích và tạo…' : values.lesson_json ? 'Tạo lại nội dung' : 'Phân tích & tạo bài học'}</button> : null}
                {activeStep === 'content' ? <button type="button" onClick={goToNextStep} disabled={!contentReady || isRevising} className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40">Tiếp tục giao bài <ChevronRight className="h-4 w-4" /></button> : null}
                {activeStep === 'publish' ? <><button type="button" onClick={() => void handleSave('draft')} disabled={isSaving || !contentReady || introVideoInvalid} className="inline-flex items-center gap-2 rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 disabled:opacity-40"><Save className="h-4 w-4" /> Lưu bản nháp</button><button type="button" onClick={() => void handleSave('publish')} disabled={isSaving || !contentReady || introVideoInvalid} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40">{isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}{isSaving ? 'Đang lưu…' : 'Xuất bản bài học'}</button></> : null}
              </div>
            </div>
          </motion.div>
          {values.lesson_json ? (
            <LessonContentEditorWindow
              isOpen={contentEditorOpen}
              content={values.lesson_json}
              aiConfig={aiConfig}
              onOpenConfig={onOpenConfig}
              onClose={() => setContentEditorOpen(false)}
              onSave={(nextContent) => setValues((prev) => {
                const structuredContent: LessonContent = {
                  ...nextContent,
                  title: prev.tieu_de,
                  metadata: {
                    ...nextContent.metadata,
                    tieu_de: prev.tieu_de,
                    lesson_number: normalizeLessonNumber(prev.lesson_number),
                    lesson_name: normalizeLessonName(prev.lesson_name),
                    khoi: prev.khoi,
                  },
                };
                return {
                  ...prev,
                  lesson_json: structuredContent,
                  tom_tat: structuredContent.metadata?.tom_tat || prev.tom_tat,
                  tu_khoa: structuredContent.metadata?.tu_khoa?.join(', ') || prev.tu_khoa,
                  intro_video_url: structuredContent.intro_video_url || structuredContent.intro_video_embed_url || '',
                  section_video_links: (structuredContent.sections || []).map((section) => section.youtube_url || section.youtube_embed_url || '').join('\n'),
                };
              })}
            />
          ) : null}
          <LessonPreviewModal isOpen={previewOpen} content={values.lesson_json ? mergeVideoLinks(values.lesson_json, values.section_video_links || '', values.intro_video_url || '') : null} aiConfig={aiConfig} onOpenConfig={onOpenConfig} onClose={() => setPreviewOpen(false)} />
          <GoogleSlidesPromptModal
            isOpen={slidesPromptOpen}
            content={values.lesson_json ? mergeVideoLinks(values.lesson_json, values.section_video_links || '', values.intro_video_url || '') : null}
            aiConfig={aiConfig}
            subjectName={selectedSubject}
            grade={values.khoi}
            user={user}
            lessonInfo={{
              lesson_id: values.lesson_id || initialLesson?.lesson_id || '',
              tieu_de: values.tieu_de,
              mon_id: values.mon_id,
              khoi: values.khoi,
              lop_id: values.lop_id,
              nam_hoc: values.nam_hoc,
              hoc_ky: String(values.hoc_ky || ''),
            }}
            onOpenConfig={onOpenConfig}
            onClose={() => setSlidesPromptOpen(false)}
          />
        </div>
      )}
    </AnimatePresence>
  );
}
