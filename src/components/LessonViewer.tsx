import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, BookOpen, Bot, CheckCircle2, ChevronLeft, ChevronRight, Clock, EyeOff, HelpCircle, Lightbulb, ListChecks, LockKeyhole, Menu, MessageCircleMore, MessageSquareText, PlayCircle, Reply, RotateCcw, Send, ShieldCheck, Sparkles, Target, TimerReset, UnlockKeyhole, Users, X } from 'lucide-react';
import { AIConfig, CatalogClass, Lesson, LessonCloseSnapshot, LessonComment, LessonContent, LessonContentBlock, LessonProgressRecord, LessonQuestionAnswerState, LessonStageKey, LessonSectionV2, QuizQuestion, SectionLearningProgress, TeachingSession, User } from '../types';
import InteractiveQuestionCard from './InteractiveQuestionCard';
import YoutubeEmbedBlock from './YoutubeEmbedBlock';
import LessonResultSummary from './LessonResultSummary';
import LearningChatPanel from './LearningChatPanel';
import { getLessonContentApi, getTeachingSessionApi, saveTeachingSessionApi, setTeachingActivityAccessApi } from '../services/api';
import { calculateLearningProcessScore, calculateSectionProgress, calculateWeightedAssessmentScore, preparationScoreFromStatus } from '../utils/learningScoreEngine';
import { subscribeFirebaseTeachingSession } from '../services/firebaseOperational';

interface LessonViewerProps {
  isOpen: boolean;
  lesson: Lesson | null;
  content: LessonContent | null;
  aiConfig: AIConfig;
  onOpenConfig: () => void;
  onClose: (snapshot?: LessonCloseSnapshot) => void | Promise<void>;
  onStageChange?: (stage: LessonStageKey) => void;
  progress?: LessonProgressRecord | null;
  onStepOpened?: (stage: LessonStageKey) => void;
  onStepViewedComplete?: (stage: LessonStageKey) => void;
  onQuizMetricsChange?: (stage: LessonStageKey, metrics: { answered: number; correct: number; total: number; answers?: Record<string, LessonQuestionAnswerState>; sectionProgress?: Record<string, SectionLearningProgress>; finalExam?: any }) => void;
  coLearningGroupSize?: number;
  onManageCoLearning?: () => void;
  onOpenPreLessonVideo?: () => void;
  comments?: LessonComment[];
  isCommentsLoading?: boolean;
  currentUserRole?: string;
  currentUser?: User | null;
  classes?: CatalogClass[];
  onAddComment?: (payload: { lesson_id: string; noi_dung: string; parent_id?: string; loai?: string }) => Promise<boolean>;
  onUpdateComment?: (payload: { comment_id: string; trang_thai?: string; noi_dung?: string }) => Promise<boolean>;
}

const HTML_ENTITY_MAP: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
};

const MIN_SECTION_SECONDS = 30;

function cleanText(value?: string) {
  return String(value || '')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<\/li>/gi, '')
    .replace(/<\/div>\s*<div[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;/g, (match) => HTML_ENTITY_MAP[match] || match)
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeSectionTitle(title: string | undefined, index: number) {
  const cleaned = cleanText(title)
    .replace(/^\s*Nội\s*dung\s*\d+\s*[:.\-–—)]\s*/i, '')
    .replace(/^\s*Phần\s*\d+\s*[:.\-–—)]\s*/i, '')
    .replace(/^\s*Mục\s*\d+\s*[:.\-–—)]\s*/i, '')
    .replace(/^(\d+)\.\s*\1\.\s*/, '$1. ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || `${index + 1}. Nội dung bài học`;
}

function formatDateTime(value?: string) {
  if (!value) return 'Chưa có thời gian';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
}

function commentTypeLabel(value?: string) {
  if (value === 'cau_hoi') return 'Câu hỏi';
  if (value === 'tra_loi') return 'Trả lời';
  return 'Bình luận';
}


function uniqueFillChoices(items: string[]) {
  const seen = new Set<string>();
  return items.map((item) => cleanText(item)).filter((item) => {
    const key = item.toLowerCase();
    if (!item || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildFillInBlankQuestion(question: QuizQuestion, fallbackId: string): QuizQuestion {
  const rawQuestion = cleanText(question.sentence || question.question || 'Điền từ/cụm từ thích hợp vào chỗ trống.');
  const fallbackAnswer = cleanText(question.correctAnswers?.[0] || question.correctAnswer || question.suggestedAnswer || 'thông tin').split(/[.;:\n]/)[0].split(/\s+/).slice(0, 5).join(' ');
  const correct = fallbackAnswer || 'thông tin';
  const hasBlank = /_{3,}/.test(rawQuestion);
  const sentence = hasBlank
    ? rawQuestion.replace(/_{2,}/g, '_____')
    : rawQuestion.endsWith('?')
      ? `${rawQuestion.replace(/\?+$/, '')}: _____.`
      : `${rawQuestion} _____.`;
  const choices = uniqueFillChoices([correct, ...(question.choices || []), ...(question.options || []), 'dữ liệu', 'thông tin', 'vật mang tin', 'xử lí thông tin']).slice(0, 4);
  while (choices.length < 4) choices.push(`Lựa chọn ${choices.length + 1}`);
  return {
    ...question,
    id: question.id || fallbackId,
    type: 'fill_in_blank',
    question: sentence,
    sentence,
    options: [],
    choices,
    correctAnswer: undefined,
    correctAnswers: [correct],
    suggestedAnswer: undefined,
    rubric: undefined,
    explanation: cleanText(question.explanation || `Từ/cụm từ đúng là "${correct}" vì phù hợp với nội dung vừa học.`),
  };
}

function normalizeQuestion(question: QuizQuestion, fallbackId: string): QuizQuestion {
  const qType = question.type === 'short_answer' ? 'fill_in_blank' : question.type;
  if (qType === 'fill_in_blank') return buildFillInBlankQuestion({ ...question, type: 'fill_in_blank' }, fallbackId);
  const isTrueFalse = qType === 'true_false';
  const options = question.options?.length ? question.options.map((item) => cleanText(item)) : isTrueFalse ? ['Đúng', 'Sai'] : [];
  return {
    ...question,
    id: question.id || fallbackId,
    type: qType || 'single_choice',
    question: cleanText(question.question || question.sentence || ''),
    sentence: cleanText(question.sentence || ''),
    options,
    choices: question.choices?.map((item) => cleanText(item)).filter(Boolean),
    correctAnswers: question.correctAnswers?.map((item) => cleanText(item)).filter(Boolean),
    correctAnswer: typeof question.correctAnswer === 'string' ? cleanText(question.correctAnswer) : question.correctAnswer,
    suggestedAnswer: cleanText(question.suggestedAnswer || ''),
    rubric: cleanText(question.rubric || ''),
    explanation: cleanText(question.explanation || ''),
  };
}

function normalizeSection(section: LessonSectionV2, index: number): LessonSectionV2 {
  return {
    ...section,
    section_id: section.section_id || `S${index + 1}`,
    title: normalizeSectionTitle(section.title, index),
    content: cleanText(section.content),
    content_blocks: Array.isArray(section.content_blocks)
      ? section.content_blocks.map((block) => ({
        ...block,
        title: cleanText(block.title || ''),
        category: cleanText(block.category || ''),
        theme: cleanText(block.theme || ''),
        text: cleanText(block.text),
      })).filter((block) => block.text || block.title)
      : undefined,
    summary: cleanText(section.source_note || section.summary || ''),
    source_note: cleanText(section.source_note || section.summary || ''),
    examples: (section.examples || []).map((item) => cleanText(item)).filter(Boolean),
    interactive_questions: (section.interactive_questions || []).map((question, qIndex) => normalizeQuestion(question, `IQ${index + 1}_${qIndex + 1}`)).filter((question) => question.question),
    pages: Array.isArray(section.pages) ? section.pages.map((page, pageIndex) => ({
      ...page,
      page_id: page.page_id || `${section.section_id || `S${index + 1}`}_P${pageIndex + 1}`,
      title: cleanText(page.title || `Trang ${pageIndex + 1}`),
      subtitle: cleanText(page.subtitle || ''),
      blocks: Array.isArray(page.blocks) ? page.blocks.map((block) => ({ ...block, title: cleanText(block.title || ''), text: cleanText(block.text || '') })).filter((block) => block.title || block.text) : [],
      teacher_notes: cleanText(page.teacher_notes || ''),
      student_prompt: cleanText(page.student_prompt || ''),
    })) : undefined,
  };
}

function getQuestionKey(question: QuizQuestion, index: number) {
  return question.id || `${index}-${String(question.question || question.sentence || 'question').slice(0, 80)}`;
}

function toV2Sections(content: LessonContent | null): LessonSectionV2[] {
  if (!content) return [];
  if (content.activities?.length) {
    return content.activities.map((activity, index) => {
      const pages = Array.isArray(activity.pages) ? activity.pages : [];
      const contentBlocks = pages.flatMap((page) => page.blocks || []);
      const text = contentBlocks.map((block) => cleanText(block.text)).filter(Boolean).join('\n\n');
      return normalizeSection({
        section_id: activity.activity_id || `A${index + 1}`,
        title: activity.title || `Hoạt động ${index + 1}`,
        content: text,
        content_blocks: contentBlocks,
        summary: activity.summary || activity.objective || '',
        source_note: activity.summary || activity.objective || '',
        interactive_questions: activity.interactions || [],
        pages,
        activity_type: activity.activity_type,
        objective: activity.objective,
        estimated_minutes: activity.estimated_minutes,
        released: activity.released,
        locked: activity.locked,
      }, index);
    });
  }
  if (content.sections?.length) return content.sections.map(normalizeSection);
  return (content.hinh_thanh_kien_thuc || []).map((item, index) => normalizeSection({
    section_id: item.id || `S${index + 1}`,
    title: item.tieu_muc || `${index + 1}. Nội dung bài học`,
    content: (item.noi_dung_chinh || []).join('\n\n'),
    summary: (item.ghi_nho || []).join(' '),
    examples: item.vi_du || [],
    youtube_url: '',
    youtube_embed_url: '',
    interactive_questions: (item.cau_hoi_nhanh || []).slice(0, 1).map((question, qIndex) => buildFillInBlankQuestion({
      id: `IQ${index + 1}_${qIndex + 1}`,
      type: 'fill_in_blank',
      question,
      sentence: question,
      choices: [],
      correctAnswers: [],
    }, `IQ${index + 1}_${qIndex + 1}`)),
  }, index));
}

function toFinalQuiz(content: LessonContent | null): QuizQuestion[] {
  if (!content) return [];
  if (content.final_quiz?.length) return content.final_quiz.map((question, index) => normalizeQuestion(question, `FQ${index + 1}`));
  return (content.luyen_tap?.trac_nghiem || []).map((question, index) => normalizeQuestion(question, `FQ${index + 1}`));
}

function splitLongTextIntoLearningChunks(text: string, maxLength = 520) {
  const cleaned = cleanText(text);
  if (!cleaned) return [];

  const lineItems = cleaned
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lineItems.length > 1 && lineItems.some((line) => /^[-•*]\s+/.test(line))) {
    return lineItems.map((line) => line.replace(/^[-•*]\s+/, '').trim()).filter(Boolean);
  }

  const sentences = cleaned
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?…])\s+/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (sentences.length <= 1) return [cleaned];

  const chunks: string[] = [];
  let current = '';
  sentences.forEach((sentence) => {
    if (!current) {
      current = sentence;
      return;
    }
    if ((current + ' ' + sentence).length <= maxLength) {
      current += ' ' + sentence;
    } else {
      chunks.push(current);
      current = sentence;
    }
  });
  if (current) chunks.push(current);
  return chunks;
}

const THEME_SEQUENCE = ['blue', 'violet', 'amber', 'emerald', 'cyan', 'rose', 'orange'];

function inferBlockCategory(block: LessonContentBlock, index: number) {
  const text = cleanText(`${block.title || ''} ${block.text || ''}`).toLowerCase();
  const type = block.type || 'paragraph';
  if (block.category) return block.category;
  if (type === 'example' || /ví dụ|chẳng hạn|thực tế/.test(text)) return 'vi_du';
  if (type === 'note' || /ghi nhớ|cần nhớ|lưu ý|kết luận/.test(text)) return 'ghi_nho';
  if (type === 'activity' || /em hãy|thảo luận|quan sát|hoạt động|trả lời/.test(text)) return 'hoat_dong';
  if (/ứng dụng|sử dụng|áp dụng|trong đời sống|thực tiễn/.test(text)) return 'ung_dung';
  if (/liên hệ|cuộc sống|xung quanh|gia đình|nhà trường/.test(text)) return 'lien_he_thuc_te';
  if (/là gì|khái niệm|được gọi là|là một/.test(text)) return 'khai_niem';
  if (type === 'key_point') return 'y_chinh';
  return index % 3 === 0 ? 'khai_niem' : index % 3 === 1 ? 'giai_thich' : 'ung_dung';
}

function inferBlockTheme(block: LessonContentBlock, index: number) {
  if (block.theme) return block.theme;
  const category = inferBlockCategory(block, index);
  if (category === 'khai_niem') return 'blue';
  if (category === 'giai_thich' || category === 'y_chinh') return 'violet';
  if (category === 'vi_du') return 'amber';
  if (category === 'ung_dung' || category === 'lien_he_thuc_te') return 'emerald';
  if (category === 'ghi_nho') return 'orange';
  if (category === 'hoat_dong') return 'rose';
  if (category === 'mo_rong') return 'cyan';
  return THEME_SEQUENCE[index % THEME_SEQUENCE.length];
}

function categoryLabel(category?: string) {
  const normalized = String(category || '').toLowerCase();
  if (normalized.includes('khai_niem')) return 'Khái niệm';
  if (normalized.includes('giai_thich')) return 'Giải thích';
  if (normalized.includes('y_chinh')) return 'Ý chính';
  if (normalized.includes('vi_du')) return 'Ví dụ';
  if (normalized.includes('ung_dung')) return 'Ứng dụng';
  if (normalized.includes('ghi_nho')) return 'Ghi nhớ';
  if (normalized.includes('hoat_dong')) return 'Hoạt động';
  if (normalized.includes('lien_he')) return 'Liên hệ thực tế';
  if (normalized.includes('mo_rong')) return 'Mở rộng';
  return 'Nội dung học tập';
}

function categoryIcon(category?: string, type?: LessonContentBlock['type']) {
  const normalized = String(category || '').toLowerCase();
  if (normalized.includes('khai_niem')) return '📘';
  if (normalized.includes('giai_thich')) return '🧩';
  if (normalized.includes('y_chinh')) return '📌';
  if (normalized.includes('vi_du') || type === 'example') return '🌟';
  if (normalized.includes('ung_dung')) return '🧪';
  if (normalized.includes('ghi_nho') || type === 'note') return '💡';
  if (normalized.includes('hoat_dong') || type === 'activity') return '🎯';
  if (normalized.includes('lien_he')) return '🌍';
  if (normalized.includes('mo_rong')) return '🚀';
  return type === 'key_point' ? '📌' : '📖';
}

function themeStyle(theme?: string) {
  const normalized = String(theme || '').toLowerCase();
  if (normalized === 'violet' || normalized === 'purple') return {
    card: 'border-violet-200 bg-gradient-to-br from-violet-50 via-white to-fuchsia-50 text-violet-950 shadow-violet-100/60',
    chip: 'bg-violet-100 text-violet-700 ring-violet-200',
    icon: 'bg-violet-100 text-violet-700',
    accent: 'from-violet-500 to-fuchsia-500',
  };
  if (normalized === 'amber' || normalized === 'yellow') return {
    card: 'border-amber-200 bg-gradient-to-br from-amber-50 via-white to-orange-50 text-amber-950 shadow-amber-100/60',
    chip: 'bg-amber-100 text-amber-700 ring-amber-200',
    icon: 'bg-amber-100 text-amber-700',
    accent: 'from-amber-400 to-orange-500',
  };
  if (normalized === 'emerald' || normalized === 'green') return {
    card: 'border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-teal-50 text-emerald-950 shadow-emerald-100/60',
    chip: 'bg-emerald-100 text-emerald-700 ring-emerald-200',
    icon: 'bg-emerald-100 text-emerald-700',
    accent: 'from-emerald-500 to-teal-500',
  };
  if (normalized === 'rose' || normalized === 'pink') return {
    card: 'border-rose-200 bg-gradient-to-br from-rose-50 via-white to-pink-50 text-rose-950 shadow-rose-100/60',
    chip: 'bg-rose-100 text-rose-700 ring-rose-200',
    icon: 'bg-rose-100 text-rose-700',
    accent: 'from-rose-500 to-pink-500',
  };
  if (normalized === 'orange') return {
    card: 'border-orange-200 bg-gradient-to-br from-orange-50 via-white to-amber-50 text-orange-950 shadow-orange-100/60',
    chip: 'bg-orange-100 text-orange-700 ring-orange-200',
    icon: 'bg-orange-100 text-orange-700',
    accent: 'from-orange-500 to-amber-500',
  };
  if (normalized === 'cyan' || normalized === 'sky') return {
    card: 'border-cyan-200 bg-gradient-to-br from-cyan-50 via-white to-sky-50 text-cyan-950 shadow-cyan-100/60',
    chip: 'bg-cyan-100 text-cyan-700 ring-cyan-200',
    icon: 'bg-cyan-100 text-cyan-700',
    accent: 'from-cyan-500 to-sky-500',
  };
  return {
    card: 'border-blue-200 bg-gradient-to-br from-blue-50 via-white to-indigo-50 text-blue-950 shadow-blue-100/60',
    chip: 'bg-blue-100 text-blue-700 ring-blue-200',
    icon: 'bg-blue-100 text-blue-700',
    accent: 'from-blue-500 to-indigo-500',
  };
}

function shortenTitle(text: string, maxWords = 9) {
  const cleaned = cleanText(text)
    .replace(/^[-•*]\s+/, '')
    .replace(/^(khái niệm|ví dụ|ghi nhớ|lưu ý|hoạt động)\s*[:.\-–—]\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  const firstSentence = cleaned.split(/(?<=[.!?…])\s+/)[0] || cleaned;
  const conceptMatch = firstSentence.match(/^(.{3,55}?)\s+là\s+/i);
  if (conceptMatch?.[1]) return `${conceptMatch[1].trim()} là gì?`;
  const words = firstSentence.split(/\s+/).filter(Boolean);
  const title = words.slice(0, maxWords).join(' ');
  return title.length < firstSentence.length ? `${title}…` : title;
}

function isGenericBlockTitle(title?: string) {
  const normalized = cleanText(title || '').toLowerCase();
  return !normalized
    || /^(ý\s*\d+|kiến thức trọng tâm|nội dung học tập|hoạt động luyện hiểu|hoạt động|giải thích|ví dụ|ghi nhớ)$/i.test(normalized)
    || normalized.length < 4;
}

function smartTitleFromText(text: string, fallback = 'Nội dung cần học') {
  const cleaned = cleanText(text).replace(/^[-•*]\s+/, '').trim();
  if (!cleaned) return fallback;
  const lower = cleaned.toLowerCase();
  if (/đèn giao thông|ngã tư|qua đường/.test(lower)) return 'Dữ liệu từ tín hiệu giao thông';
  if (/bảng thông báo|thông báo/.test(lower)) return 'Thông tin trên bảng thông báo';
  if (/bạn minh|bạn an/.test(lower)) return 'Tình huống trong đời sống';
  if (/dã ngoại|chuẩn bị/.test(lower)) return 'Tìm thông tin để ra quyết định';
  if (/dữ liệu/.test(lower) && /thông tin/.test(lower)) return 'Mối quan hệ giữa thông tin và dữ liệu';
  if (/vật mang tin/.test(lower)) return 'Vật mang tin trong cuộc sống';
  if (/lưu trữ|truyền tải/.test(lower)) return 'Lưu trữ và truyền tải thông tin';
  if (/thu nhận/.test(lower)) return 'Thu nhận thông tin';
  if (/xử lí/.test(lower)) return 'Xử lí thông tin';
  return shortenTitle(cleaned, 8) || fallback;
}

function deriveBlockTitle(block: LessonContentBlock, index: number, sectionTitle?: string) {
  const provided = cleanText(block.title || '');
  if (provided && !isGenericBlockTitle(provided)) return provided;
  const category = inferBlockCategory(block, index);
  const text = cleanText(block.text || '');
  const lower = text.toLowerCase();
  if (category === 'khai_niem') return smartTitleFromText(text, 'Khái niệm cần nắm');
  if (category === 'vi_du') return lower.includes('gia đình') ? 'Ví dụ trong gia đình' : lower.includes('thực tế') ? 'Ví dụ thực tế' : smartTitleFromText(text, 'Ví dụ minh họa');
  if (category === 'ghi_nho') return smartTitleFromText(text, 'Điều em cần nhớ');
  if (category === 'hoat_dong') return smartTitleFromText(text, 'Hoạt động luyện hiểu');
  if (category === 'ung_dung') return lower.includes('khoa học') ? 'Ứng dụng trong khoa học kĩ thuật' : smartTitleFromText(text, 'Ứng dụng trong thực tế');
  if (category === 'lien_he_thuc_te') return smartTitleFromText(text, 'Liên hệ với đời sống');
  if (category === 'mo_rong') return smartTitleFromText(text, 'Mở rộng kiến thức');
  return smartTitleFromText(text, sectionTitle || 'Nội dung cần học');
}

function sectionContentBlocks(section: LessonSectionV2): LessonContentBlock[] {
  const sourceBlocks = section.content_blocks?.length
    ? section.content_blocks
    : cleanText(section.content).split(/\n{2,}/).map((text) => ({ type: text.trim().startsWith('•') ? 'key_point' : 'paragraph', text } as LessonContentBlock));

  const expanded = sourceBlocks.flatMap((block, index) => {
    const chunks = splitLongTextIntoLearningChunks(block.text || '', block.type === 'paragraph' ? 520 : 680);
    if (!chunks.length) return [];
    return chunks.map((text, chunkIndex) => {
      const nextBlock = {
        ...block,
        type: block.type || (chunkIndex === 0 && index === 0 ? 'key_point' : 'paragraph'),
        text,
      } as LessonContentBlock;
      const finalIndex = index + chunkIndex;
      return {
        ...nextBlock,
        category: nextBlock.category || inferBlockCategory(nextBlock, finalIndex),
        theme: nextBlock.theme || inferBlockTheme(nextBlock, finalIndex),
        title: chunkIndex === 0 ? deriveBlockTitle(nextBlock, finalIndex, section.title) : deriveBlockTitle({ ...nextBlock, title: '' }, finalIndex, section.title),
      };
    });
  });

  return expanded.length ? expanded : [];
}

function renderLearningText(text: string) {
  const cleaned = cleanText(text);
  const lines = cleaned.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const bulletLines = lines.filter((line) => /^[-•*]\s+/.test(line));
  if (lines.length > 1 && bulletLines.length >= Math.max(1, Math.floor(lines.length / 2))) {
    return (
      <ul className="space-y-2">
        {lines.map((line, index) => (
          <li key={index} className="flex gap-2">
            <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-current opacity-60" />
            <span>{line.replace(/^[-•*]\s+/, '')}</span>
          </li>
        ))}
      </ul>
    );
  }
  return <p className="whitespace-pre-line">{cleaned}</p>;
}

function requiredSecondsForSection(section: LessonSectionV2) {
  const textLength = `${section.title} ${section.content} ${(section.content_blocks || []).map((block) => block.text).join(' ')}`.length;
  if (textLength > 1800) return 60;
  if (textLength > 900) return 45;
  return MIN_SECTION_SECONDS;
}

function createSectionProgress(section: LessonSectionV2): SectionLearningProgress {
  return {
    sectionId: section.section_id,
    opened: false,
    status: 'not_started',
    timeSpentSeconds: 0,
    requiredSeconds: requiredSecondsForSection(section),
    interactionCount: 0,
    answeredQuestionIds: [],
    lastVisitedAt: '',
  };
}

function getSectionQuestionIds(section: LessonSectionV2) {
  return (section.interactive_questions || []).map((question, qIndex) => getQuestionKey(question, qIndex));
}

function isSectionCompleted(progress: SectionLearningProgress, questionTotal: number) {
  const timeOk = Number(progress.timeSpentSeconds || 0) >= Number(progress.requiredSeconds || MIN_SECTION_SECONDS);
  const interactionOk = questionTotal === 0 || Number(progress.interactionCount || 0) >= questionTotal;
  return timeOk && interactionOk;
}

function statusClasses(status: SectionLearningProgress['status'], active: boolean) {
  if (active) return 'bg-indigo-600 text-white';
  if (status === 'completed') return 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100';
  if (status === 'viewing') return 'bg-amber-50 text-amber-700 hover:bg-amber-100';
  if (status === 'need_interaction') return 'bg-orange-50 text-orange-700 hover:bg-orange-100';
  return 'bg-slate-50 text-slate-600 hover:bg-slate-100';
}

function shuffleArray<T>(items: T[]) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function extractOptionKeyLocal(value?: string) {
  const match = String(value || '').trim().match(/^([A-D])\s*[.)-]?/i);
  return match ? match[1].toUpperCase() : '';
}

function resolveCorrectAnswerText(question: QuizQuestion) {
  const options = question.options || [];
  const correct = String(question.correctAnswer || '').trim();
  const key = extractOptionKeyLocal(correct);
  if (key) {
    const index = key.charCodeAt(0) - 65;
    if (options[index]) return options[index];
  }
  return correct;
}

function prepareExamQuestions(questions: QuizQuestion[], shuffleQuestions: boolean, shuffleOptions: boolean) {
  const prepared = questions.map((question, index) => {
    const normalized: QuizQuestion = { ...question, id: question.id || `FQ${index + 1}` };
    if (shuffleOptions && Array.isArray(normalized.options) && normalized.options.length > 1) {
      const correctText = resolveCorrectAnswerText(normalized);
      const shuffledOptions = shuffleArray(normalized.options);
      normalized.options = shuffledOptions;
      normalized.correctAnswer = correctText;
    }
    return normalized;
  });
  return shuffleQuestions ? shuffleArray(prepared) : prepared;
}

function formatSeconds(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(Number(totalSeconds || 0)));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export default function LessonViewer({
  isOpen,
  lesson,
  content,
  aiConfig,
  onOpenConfig,
  onClose,
  onStageChange,
  progress,
  onStepOpened,
  onStepViewedComplete,
  onQuizMetricsChange,
  coLearningGroupSize = 1,
  onManageCoLearning,
  onOpenPreLessonVideo,
  comments = [],
  isCommentsLoading = false,
  currentUserRole = 'student',
  currentUser = null,
  classes = [],
  onAddComment,
  onUpdateComment,
}: LessonViewerProps) {
  const [liveContent, setLiveContent] = useState<LessonContent | null>(content);
  const effectiveContent = liveContent || content;
  const sections = useMemo(() => toV2Sections(effectiveContent), [effectiveContent]);
  const finalQuiz = useMemo(() => toFinalQuiz(effectiveContent), [effectiveContent]);
  const [activeStep, setActiveStep] = useState<string>('intro');
  const [teachingClassId, setTeachingClassId] = useState('');
  const [teachingSession, setTeachingSession] = useState<TeachingSession | null>(null);
  const [teachingSessionBusy, setTeachingSessionBusy] = useState(false);
  const [teachingSessionError, setTeachingSessionError] = useState('');
  const releasedSignatureRef = useRef('');
  const [answerStates, setAnswerStates] = useState<Record<string, LessonQuestionAnswerState>>({});
  const [sectionProgress, setSectionProgress] = useState<Record<string, SectionLearningProgress>>({});
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [lessonChatOpen, setLessonChatOpen] = useState(false);
  const [lessonChatPrompt, setLessonChatPrompt] = useState<{ id: number; text: string; displayText?: string } | null>(null);
  const [lessonElapsedSeconds, setLessonElapsedSeconds] = useState(0);
  const [lessonTimedOut, setLessonTimedOut] = useState(false);
  const [examStarted, setExamStarted] = useState(false);
  const [examSubmitted, setExamSubmitted] = useState(false);
  const [examAutoSubmitted, setExamAutoSubmitted] = useState(false);
  const [examElapsedSeconds, setExamElapsedSeconds] = useState(0);
  const [examAttemptNumber, setExamAttemptNumber] = useState(1);
  const [examSecurityEvents, setExamSecurityEvents] = useState({ copy_attempts: 0, right_click_attempts: 0, tab_leave_count: 0, select_attempts: 0, reload_attempts: 0 });
  const [examQuestions, setExamQuestions] = useState<QuizQuestion[]>([]);
  const [focusedExamIndex, setFocusedExamIndex] = useState(0);
  const [examReviewMarks, setExamReviewMarks] = useState<Record<string, boolean>>({});
  const [submitConfirmState, setSubmitConfirmState] = useState<{ unanswered: number; total: number } | null>(null);
  const [commentMode, setCommentMode] = useState<'cau_hoi' | 'binh_luan'>('cau_hoi');
  const [commentInput, setCommentInput] = useState('');
  const [replyInputs, setReplyInputs] = useState<Record<string, string>>({});
  const [submittingCommentId, setSubmittingCommentId] = useState<string | null>(null);
  const [closingLesson, setClosingLesson] = useState(false);

  useEffect(() => {
    setLiveContent(content);
  }, [content, lesson?.lesson_id]);

  const isTeachingMode = currentUserRole !== 'student';

  const teachingClassOptions = useMemo(() => {
    const grade = String(lesson?.khoi || '').trim();
    const scoped = classes.filter((item) => !grade || String(item.khoi || '').trim() === grade);
    if (lesson?.lop_id) return scoped.filter((item) => item.lop_id === lesson.lop_id);
    return scoped;
  }, [classes, lesson?.khoi, lesson?.lop_id]);

  useEffect(() => {
    if (!isOpen || !lesson) return;
    if (currentUserRole === 'student') {
      setTeachingClassId(String(currentUser?.lop_id || lesson.lop_id || ''));
      return;
    }
    const preferred = String(lesson.lop_id || teachingClassId || teachingClassOptions[0]?.lop_id || '');
    setTeachingClassId(preferred);
  }, [isOpen, lesson?.lesson_id, lesson?.lop_id, currentUserRole, currentUser?.lop_id, teachingClassOptions]);

  useEffect(() => {
    if (!isOpen || !lesson?.lesson_id || !teachingClassId || !currentUser) return;
    if (currentUserRole === 'student') {
      releasedSignatureRef.current = '';
      const unsubscribe = subscribeFirebaseTeachingSession(lesson.lesson_id, teachingClassId, (session) => {
        const nextReleased = (session?.released_activity_ids || []).map((item) => String(item)).sort().join('|');
        setTeachingSession(session);
        if (releasedSignatureRef.current !== nextReleased) {
          releasedSignatureRef.current = nextReleased;
          void getLessonContentApi(currentUser.token, lesson.lesson_id).then(async (res) => {
            if (!res.ok || !res.data?.content) return;
            const { normalizeLessonContent } = await import('../services/gemini');
            setLiveContent(normalizeLessonContent(res.data.content));
          });
        }
        const currentActivity = String(session?.current_activity_id || '');
        if (currentActivity && (session?.released_activity_ids || []).includes(currentActivity)) {
          // Khi giáo viên chuyển sang hoạt động khác, học sinh tự đi tới hoạt động
          // đang được trình bày. Các hoạt động cũ vẫn có thể mở lại thủ công sau đó.
          setActiveStep(currentActivity);
        }
      }, () => setTeachingSessionError('Mất kết nối trạng thái tiết học. Hệ thống sẽ tự đồng bộ lại khi có kết nối.'));
      return unsubscribe;
    }
    setTeachingSessionBusy(true);
    setTeachingSessionError('');
    void getTeachingSessionApi(currentUser.token, lesson.lesson_id, teachingClassId).then((res) => {
      setTeachingSessionBusy(false);
      if (res.ok) setTeachingSession(res.data || null);
      else setTeachingSessionError(res.message || 'Không tải được trạng thái tiết học.');
    });
  }, [isOpen, lesson?.lesson_id, teachingClassId, currentUserRole, currentUser?.user_id]);

  useEffect(() => {
    if (isOpen) {
      const storedAnswers = progress?.step_details?.luyen_tap?.quizAnswers || {};
      const storedSections = progress?.step_details?.luyen_tap?.sectionProgress || {};
      const initialSectionProgress = sections.reduce<Record<string, SectionLearningProgress>>((acc, section) => {
        const existing = storedSections[section.section_id] as SectionLearningProgress | undefined;
        acc[section.section_id] = { ...createSectionProgress(section), ...(existing || {}), sectionId: section.section_id, requiredSeconds: requiredSecondsForSection(section) };
        return acc;
      }, {});
      setActiveStep('intro');
      setMobileMenuOpen(false);
      setLessonChatOpen(false);
      setLessonChatPrompt(null);
      setLessonElapsedSeconds(0);
      setLessonTimedOut(false);
      setCommentInput('');
      setReplyInputs({});
      setSubmittingCommentId(null);
      setExamStarted(false);
      setExamSubmitted(false);
      setExamAutoSubmitted(false);
      setExamElapsedSeconds(0);
      setExamAttemptNumber(1);
      setExamSecurityEvents({ copy_attempts: 0, right_click_attempts: 0, tab_leave_count: 0, select_attempts: 0, reload_attempts: 0 });
      setExamQuestions([]);
      setFocusedExamIndex(0);
      setExamReviewMarks({});
      setSubmitConfirmState(null);
      setAnswerStates(storedAnswers);
      setSectionProgress(initialSectionProgress);
    }
  }, [isOpen, lesson?.lesson_id, sections, progress?.progress_id]);

  const settings = effectiveContent?.settings || {} as any;
  const finalExamTimeMinutes = Math.max(1, Number(settings.final_exam_time_minutes || 15));
  const lessonTimeMinutes = Math.max(1, Number(settings.lesson_time_minutes || 45));
  const lessonTimeLimitSeconds = lessonTimeMinutes * 60;
  const examTimeLimitSeconds = finalExamTimeMinutes * 60;
  const lessonRemainingSeconds = Math.max(0, lessonTimeLimitSeconds - lessonElapsedSeconds);
  const examRemainingSeconds = Math.max(0, examTimeLimitSeconds - examElapsedSeconds);
  const activeFinalQuiz = examQuestions.length ? examQuestions : finalQuiz;

  const allInteractiveQuestions = useMemo(() => sections.flatMap((section) => section.interactive_questions || []), [sections]);
  const allQuestions = useMemo(() => [...allInteractiveQuestions, ...activeFinalQuiz], [allInteractiveQuestions, activeFinalQuiz]);

  const computedSectionProgress = useMemo(() => {
    return sections.reduce<Record<string, SectionLearningProgress>>((acc, section) => {
      const base = { ...createSectionProgress(section), ...(sectionProgress[section.section_id] || {}) };
      const questionIds = getSectionQuestionIds(section);
      const answeredQuestionIds = questionIds.filter((questionId) => answerStates[questionId]?.submitted);
      const correctCount = questionIds.filter((questionId) => answerStates[questionId]?.submitted && answerStates[questionId]?.isCorrect).length;
      const calculated = calculateSectionProgress({
        sectionId: section.section_id,
        timeSpentSeconds: Number(base.timeSpentSeconds || 0),
        requiredSeconds: Number(base.requiredSeconds || requiredSecondsForSection(section)),
        answeredCount: answeredQuestionIds.length,
        correctCount,
        questionTotal: questionIds.length,
        previous: { ...base, answeredQuestionIds },
      });
      acc[section.section_id] = {
        ...base,
        ...calculated,
        answeredQuestionIds,
        interactionCount: answeredQuestionIds.length,
        correctCount,
        questionTotal: questionIds.length,
        lastVisitedAt: base.lastVisitedAt || calculated.lastVisitedAt,
      };
      return acc;
    }, {});
  }, [sections, sectionProgress, answerStates]);

  const completedSectionsCount = useMemo(() => (Object.values(computedSectionProgress) as SectionLearningProgress[]).filter((item) => item.status === 'completed').length, [computedSectionProgress]);
  const incompleteSectionTitles = useMemo(() => sections.filter((section) => computedSectionProgress[section.section_id]?.status !== 'completed').map((section) => section.title), [sections, computedSectionProgress]);

  useEffect(() => {
    if (!isOpen || !activeStep || !sections.some((section) => section.section_id === activeStep)) return;
    const section = sections.find((item) => item.section_id === activeStep)!;
    if (section.locked && currentUserRole === 'student') return;
    setSectionProgress((prev) => {
      const current = prev[section.section_id] || createSectionProgress(section);
      return {
        ...prev,
        [section.section_id]: {
          ...current,
          opened: true,
          status: current.status === 'completed' ? 'completed' : 'viewing',
          lastVisitedAt: new Date().toISOString(),
        },
      };
    });
    const interval = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      setSectionProgress((prev) => {
        const current = prev[section.section_id] || createSectionProgress(section);
        return {
          ...prev,
          [section.section_id]: {
            ...current,
            opened: true,
            timeSpentSeconds: Number(current.timeSpentSeconds || 0) + 1,
            lastVisitedAt: new Date().toISOString(),
          },
        };
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [isOpen, activeStep, sections]);

  useEffect(() => {
    if (!isOpen || lessonTimedOut) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      setLessonElapsedSeconds((value) => {
        const next = value + 1;
        if (settings.auto_finish_lesson_on_timeout !== false && next >= lessonTimeLimitSeconds) {
          setLessonTimedOut(true);
          if (examStarted && !examSubmitted) {
            setExamSubmitted(true);
            setExamAutoSubmitted(true);
          }
          setActiveStep('result');
        }
        return next;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [isOpen, lessonTimedOut, lessonTimeLimitSeconds, settings.auto_finish_lesson_on_timeout, examStarted, examSubmitted]);

  useEffect(() => {
    if (!isOpen || !examStarted || examSubmitted) return;
    const interval = window.setInterval(() => {
      setExamElapsedSeconds((value) => {
        const next = value + 1;
        if (next >= examTimeLimitSeconds) {
          setExamSubmitted(true);
          setExamAutoSubmitted(true);
        }
        return next;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [isOpen, examStarted, examSubmitted, examTimeLimitSeconds]);

  useEffect(() => {
    if (!isOpen || !examStarted || examSubmitted) return;
    const increment = (key: keyof typeof examSecurityEvents) => {
      setExamSecurityEvents((prev) => ({ ...prev, [key]: Number(prev[key] || 0) + 1 }));
    };
    const isEditableTarget = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (!target) return false;
      const tag = target.tagName?.toLowerCase();
      return tag === 'textarea' || tag === 'input' || target.isContentEditable;
    };
    const prevent = (event: Event, key: keyof typeof examSecurityEvents) => {
      if (isEditableTarget(event) && key === 'select_attempts') return;
      event.preventDefault();
      increment(key);
    };
    const onCopy = (event: ClipboardEvent) => prevent(event, 'copy_attempts');
    const onContext = (event: MouseEvent) => prevent(event, 'right_click_attempts');
    const onSelect = () => increment('select_attempts');
    const onVisibility = () => { if (document.visibilityState !== 'visible') increment('tab_leave_count'); };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      increment('reload_attempts');
      event.preventDefault();
      event.returnValue = 'Em đang làm bài kiểm tra. Rời khỏi màn hình có thể bị ghi nhận vi phạm.';
    };
    document.addEventListener('copy', onCopy);
    document.addEventListener('cut', onCopy);
    document.addEventListener('contextmenu', onContext);
    document.addEventListener('selectstart', onSelect);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('cut', onCopy);
      document.removeEventListener('contextmenu', onContext);
      document.removeEventListener('selectstart', onSelect);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [isOpen, examStarted, examSubmitted, examSecurityEvents]);

  const metrics = useMemo(() => {
    const answered = allQuestions.filter((question, index) => answerStates[getQuestionKey(question, index)]?.submitted).length;
    const correct = allQuestions.filter((question, index) => answerStates[getQuestionKey(question, index)]?.isCorrect).length;
    const interactiveCorrect = allInteractiveQuestions.filter((question, index) => answerStates[getQuestionKey(question, index)]?.isCorrect).length;
    const finalCorrect = examSubmitted ? activeFinalQuiz.filter((question, index) => answerStates[getQuestionKey(question, index + allInteractiveQuestions.length)]?.isCorrect).length : 0;
    return { answered, correct, total: allQuestions.length, interactiveCorrect, interactiveTotal: allInteractiveQuestions.length, finalCorrect, finalTotal: activeFinalQuiz.length };
  }, [allQuestions, allInteractiveQuestions, activeFinalQuiz, answerStates, examSubmitted]);

  const assessmentConfig = content?.assessment || { interactive_weight: 40, final_quiz_weight: 60, score_scale: 10, pass_score: 5 };
  const learningProcessWeight = Number((assessmentConfig as any).learning_process_weight || assessmentConfig.interactive_weight || 40);
  const finalExamWeight = Number(assessmentConfig.final_quiz_weight || 60);

  const learningProcessScore = useMemo(() => {
    return calculateLearningProcessScore(computedSectionProgress);
  }, [computedSectionProgress]);

  const finalExamScore = useMemo(() => {
    if (!metrics.finalTotal) return 10;
    return Math.min(10, Math.max(0, (metrics.finalCorrect / metrics.finalTotal) * 10));
  }, [metrics.finalCorrect, metrics.finalTotal]);

  const hasPreparationVideo = Boolean(
    String(lesson?.intro_video_url || '').trim()
    || String(lesson?.intro_video_embed_url || '').trim()
    || String(effectiveContent?.intro_video_url || '').trim()
    || String(effectiveContent?.intro_video_embed_url || '').trim()
  );
  const preparationScoreEnabled = hasPreparationVideo
    && lesson?.pre_lesson_enabled !== false
    && lesson?.pre_lesson_score_enabled !== false;
  const preparationWeight = preparationScoreEnabled
    ? Math.max(0, Math.min(30, Number(lesson?.pre_lesson_score_weight ?? 10)))
    : 0;
  const preparationStatus = String(progress?.pre_lesson_preparation_status || '').trim()
    || (progress?.pre_lesson_completed_before_deadline === true ? 'prepared'
      : progress?.pre_lesson_status === 'completed' ? 'late_completed'
        : Number(progress?.pre_lesson_watch_percent || 0) > 0 ? 'in_progress' : 'not_started');
  const preparationScore = preparationScoreEnabled ? preparationScoreFromStatus(preparationStatus) : 0;
  const weightedAssessment = useMemo(() => calculateWeightedAssessmentScore({
    learningProcessScore,
    finalQuizScore: finalExamScore,
    finalSubmitted: examSubmitted,
    learningWeight: learningProcessWeight,
    finalWeight: finalExamWeight,
    preparationWeight,
    preparationScore,
  }), [learningProcessScore, finalExamScore, examSubmitted, learningProcessWeight, finalExamWeight, preparationWeight, preparationScore]);
  const score = weightedAssessment.score;

  useEffect(() => {
    if (!allQuestions.length && !sections.length) return;
    onQuizMetricsChange?.('luyen_tap', {
      answered: metrics.answered,
      correct: metrics.correct,
      total: metrics.total,
      answers: answerStates,
      sectionProgress: computedSectionProgress,
      finalExam: {
        started_at: examStarted ? new Date(Date.now() - examElapsedSeconds * 1000).toISOString() : '',
        submitted_at: examSubmitted ? new Date().toISOString() : '',
        time_limit_minutes: finalExamTimeMinutes,
        time_spent_seconds: examElapsedSeconds,
        status: examSubmitted ? (examAutoSubmitted ? 'auto_submitted' : 'submitted') : examStarted ? 'in_progress' : 'not_started',
        score: finalExamScore,
        total_score: score,
        learning_process_score: learningProcessScore,
        correct_count: metrics.finalCorrect,
        total_count: metrics.finalTotal,
        unanswered_count: activeFinalQuiz.filter((question, index) => !answerStates[getQuestionKey(question, index + allInteractiveQuestions.length)]?.submitted).length,
        attempt_number: examAttemptNumber,
        security_events: examSecurityEvents,
      },
    });
  }, [metrics.answered, metrics.correct, metrics.total, metrics.finalCorrect, metrics.finalTotal, answerStates, allQuestions.length, onQuizMetricsChange, computedSectionProgress, sections.length, examStarted, examSubmitted, examAutoSubmitted, examElapsedSeconds, finalExamTimeMinutes, score, finalExamScore, learningProcessScore, activeFinalQuiz, allInteractiveQuestions.length, examAttemptNumber, examSecurityEvents]);

  useEffect(() => {
    if (sections.length > 0 && completedSectionsCount === sections.length) {
      onStepViewedComplete?.('hinh_thanh_kien_thuc');
    }
  }, [sections.length, completedSectionsCount, onStepViewedComplete]);

  const isStudentView = currentUserRole === 'student';
  const releasedActivityIds = useMemo<Set<string>>(() => new Set((teachingSession?.released_activity_ids || []).map((item) => String(item))), [teachingSession?.released_activity_ids]);
  const toggleActivityAccessForClass = async (section: LessonSectionV2, open: boolean, pageId?: string) => {
    if (!lesson?.lesson_id || !currentUser || currentUserRole === 'student' || !teachingClassId) return;
    setTeachingSessionBusy(true);
    setTeachingSessionError('');
    const res = await setTeachingActivityAccessApi(currentUser.token, lesson.lesson_id, teachingClassId, section.section_id, open, pageId || section.pages?.[0]?.page_id || '');
    setTeachingSessionBusy(false);
    if (res.ok && res.data) setTeachingSession(res.data);
    else setTeachingSessionError(res.message || (open ? 'Không mở được mục cho lớp.' : 'Không khóa được mục đối với lớp.'));
  };

  const presentActivityForClass = async (section: LessonSectionV2, pageId?: string) => {
    if (!lesson?.lesson_id || !currentUser || currentUserRole === 'student' || !teachingClassId) return;
    const released: string[] = Array.from(releasedActivityIds);
    if (!released.includes(section.section_id)) {
      await toggleActivityAccessForClass(section, true, pageId);
      return;
    }
    setTeachingSessionBusy(true);
    setTeachingSessionError('');
    const res = await saveTeachingSessionApi(currentUser.token, lesson.lesson_id, teachingClassId, {
      status: 'live',
      current_activity_id: section.section_id,
      current_page_id: pageId || section.pages?.[0]?.page_id || '',
      released_activity_ids: released,
    });
    setTeachingSessionBusy(false);
    if (res.ok && res.data) setTeachingSession(res.data);
    else setTeachingSessionError(res.message || 'Không chuyển được mục đang trình bày.');
  };

  const selectStep = (step: string) => {
    const targetSection = sections.find((section) => section.section_id === step);
    if (targetSection?.locked && isStudentView) {
      setMobileMenuOpen(false);
      return;
    }
    setActiveStep(step);
    setMobileMenuOpen(false);
    if (step === 'final_quiz') {
      setLessonChatOpen(false);
      setLessonChatPrompt(null);
    }
    if (step === 'comments') return;
    const stage: LessonStageKey = step === 'final_quiz' ? 'luyen_tap' : step === 'result' ? 'tong_ket' : step === 'intro' ? 'khoi_dong' : 'hinh_thanh_kien_thuc';
    onStageChange?.(stage);
    onStepOpened?.(stage);
    if (step === 'intro') onStepViewedComplete?.('khoi_dong');
    if (step === 'result' && incompleteSectionTitles.length === 0 && metrics.answered >= metrics.total) onStepViewedComplete?.('tong_ket');
  };

  const handleAnswerStateChange = (payload: LessonQuestionAnswerState) => {
    setAnswerStates((prev) => {
      const current = prev[payload.questionId];
      if (current && JSON.stringify(current) === JSON.stringify(payload)) return prev;
      return { ...prev, [payload.questionId]: payload };
    });
  };

  const currentSection = sections.find((section) => section.section_id === activeStep) || null;
  const lessonNavigationSteps = useMemo(() => ['intro', ...sections.filter((section) => !isStudentView || !section.locked).map((section) => section.section_id), 'final_quiz', 'comments', 'result'], [sections, isStudentView]);
  const activeNavigationIndex = Math.max(0, lessonNavigationSteps.indexOf(activeStep));
  const previousNavigationStep = activeNavigationIndex > 0 ? lessonNavigationSteps[activeNavigationIndex - 1] : null;
  const nextNavigationStep = activeNavigationIndex < lessonNavigationSteps.length - 1 ? lessonNavigationSteps[activeNavigationIndex + 1] : null;
  const activeStepLabel = activeStep === 'intro'
    ? 'Tổng quan'
    : activeStep === 'final_quiz'
      ? 'Kiểm tra cuối bài'
      : activeStep === 'comments'
        ? 'Bình luận/Câu hỏi'
        : activeStep === 'result'
          ? 'Kết quả'
          : currentSection?.title || 'Nội dung bài học';
  const canModerateComments = currentUserRole === 'admin' || currentUserRole === 'teacher';
  const visibleComments = useMemo(() => comments.filter((comment) => canModerateComments || comment.trang_thai !== 'hidden'), [comments, canModerateComments]);
  const topLevelComments = useMemo(() => visibleComments.filter((comment) => !comment.parent_id), [visibleComments]);
  const repliesByCommentId = useMemo(() => {
    const map = new Map<string, LessonComment[]>();
    visibleComments.filter((comment) => comment.parent_id).forEach((comment) => {
      const key = String(comment.parent_id || '');
      map.set(key, [...(map.get(key) || []), comment]);
    });
    return map;
  }, [visibleComments]);
  const openQuestionCount = useMemo(() => topLevelComments.filter((comment) => comment.loai === 'cau_hoi' && comment.trang_thai !== 'resolved').length, [topLevelComments]);

  const handleSubmitComment = async () => {
    if (!lesson?.lesson_id || !onAddComment) return;
    const contentValue = commentInput.trim();
    if (!contentValue) return;
    setSubmittingCommentId('new');
    const ok = await onAddComment({ lesson_id: lesson.lesson_id, noi_dung: contentValue, loai: commentMode });
    if (ok) setCommentInput('');
    setSubmittingCommentId(null);
  };

  const handleReplyComment = async (comment: LessonComment) => {
    if (!lesson?.lesson_id || !onAddComment) return;
    const contentValue = (replyInputs[comment.comment_id] || '').trim();
    if (!contentValue) return;
    setSubmittingCommentId(comment.comment_id);
    const ok = await onAddComment({ lesson_id: lesson.lesson_id, parent_id: comment.comment_id, noi_dung: contentValue, loai: 'tra_loi' });
    if (ok) setReplyInputs((current) => ({ ...current, [comment.comment_id]: '' }));
    setSubmittingCommentId(null);
  };

  const handleResolveComment = async (comment: LessonComment) => {
    if (!onUpdateComment) return;
    setSubmittingCommentId(comment.comment_id);
    await onUpdateComment({ comment_id: comment.comment_id, trang_thai: comment.trang_thai === 'resolved' ? 'visible' : 'resolved' });
    setSubmittingCommentId(null);
  };

  const handleHideComment = async (comment: LessonComment) => {
    if (!onUpdateComment) return;
    setSubmittingCommentId(comment.comment_id);
    await onUpdateComment({ comment_id: comment.comment_id, trang_thai: 'hidden' });
    setSubmittingCommentId(null);
  };

  const handleAskLessonAI = (prompt: string, displayText?: string) => {
    setLessonChatOpen(true);
    setLessonChatPrompt({ id: Date.now(), text: prompt, displayText });
  };

  const startFinalExam = () => {
    const prepared = prepareExamQuestions(finalQuiz, settings.shuffle_final_questions !== false, settings.shuffle_final_options !== false);
    setExamQuestions(prepared);
    setExamStarted(true);
    setFocusedExamIndex(0);
    setExamReviewMarks({});
    setExamSubmitted(false);
    setExamAutoSubmitted(false);
    setExamElapsedSeconds(0);
    setLessonChatOpen(false);
    setLessonChatPrompt(null);
  };

  const unansweredFinalQuestions = activeFinalQuiz.filter((question, index) => !answerStates[getQuestionKey(question, index + allInteractiveQuestions.length)]?.submitted);

  const submitFinalExam = (force = false) => {
    if (!force) {
      setSubmitConfirmState({ unanswered: unansweredFinalQuestions.length, total: activeFinalQuiz.length });
      return;
    }
    setSubmitConfirmState(null);
    setExamSubmitted(true);
    setExamAutoSubmitted(false);
  };

  const retryFinalExam = () => {
    if (settings.allow_exam_retry === false) return;
    const maxAttempts = Math.max(1, Number(settings.max_exam_attempts || 2));
    if (examAttemptNumber >= maxAttempts) return;
    const finalIds = activeFinalQuiz.map((question, index) => getQuestionKey(question, index + allInteractiveQuestions.length));
    setAnswerStates((prev) => {
      const next = { ...prev };
      finalIds.forEach((id) => delete next[id]);
      return next;
    });
    setExamAttemptNumber((value) => value + 1);
    setExamStarted(false);
    setExamSubmitted(false);
    setExamAutoSubmitted(false);
    setExamElapsedSeconds(0);
    setFocusedExamIndex(0);
    setExamReviewMarks({});
    setExamSecurityEvents({ copy_attempts: 0, right_click_attempts: 0, tab_leave_count: 0, select_attempts: 0, reload_attempts: 0 });
    setExamQuestions([]);
  };

  const handleQuickAskCurrentSection = (mode: 'summary' | 'explain' | 'example') => {
    const section = currentSection;
    if (!section) {
      handleAskLessonAI(`Bài học: “${lesson?.tieu_de || 'bài học'}”. Nội dung bắt buộc: “${lessonSummary || lesson?.mo_ta || ''}”. Hãy tóm tắt đúng bài học bằng 3 ý chính ngắn gọn cho học sinh THCS.`, 'Tóm tắt bài học');
      return;
    }
    const context = [
      `Bài học: “${lesson?.tieu_de || lessonTitle}”.`,
      `Mục đang học: “${section.title}”.`,
      `Nội dung bắt buộc của mục: “${cleanText(section.content || '').slice(0, 1600)}”.`,
      section.summary || section.source_note ? `Ghi nhớ của mục: “${cleanText(section.summary || section.source_note || '').slice(0, 700)}”.` : '',
      'Chỉ dùng đúng nội dung trên, không suy diễn sang mục khác. Không dùng lịch sử trò chuyện cũ để trả lời yêu cầu này.',
    ].filter(Boolean).join(' ');
    if (mode === 'summary') handleAskLessonAI(`${context} Hãy tóm tắt mục này bằng đúng 3 ý chính ngắn, dễ nhớ.`, `Tóm tắt mục: ${section.title}`);
    if (mode === 'explain') handleAskLessonAI(`${context} Hãy giải thích lại mục này thật ngắn gọn, dễ hiểu cho học sinh THCS, tối đa 3 ý.`, `Giải thích mục: ${section.title}`);
    if (mode === 'example') handleAskLessonAI(`${context} Hãy cho đúng 1 ví dụ thực tế gần gũi liên quan trực tiếp đến mục này và giải thích trong 2 câu.`, `Ví dụ cho mục: ${section.title}`);
  };

  const handleAskContentBlock = (section: LessonSectionV2, block: LessonContentBlock, blockIndex: number, mode: 'summary' | 'explain' | 'example' | 'question') => {
    const blockTitle = deriveBlockTitle(block, blockIndex, section.title);
    const blockText = cleanText(block.text).slice(0, 1800);
    const modeLabel: Record<typeof mode, string> = {
      summary: 'TÓM TẮT Ý NÀY',
      explain: 'GIẢI THÍCH DỄ HIỂU',
      example: 'CHO VÍ DỤ GẦN GŨI',
      question: 'TỰ KIỂM TRA',
    };
    const base = [
      'YÊU CẦU HỖ TRỢ AI THEO ĐÚNG KHỐI NỘI DUNG.',
      `Loại hỗ trợ: ${modeLabel[mode]}.`,
      `Bài học: ${lesson?.tieu_de || lessonTitle}.`,
      `Mục đang học: ${section.title}.`,
      `Tiêu đề khối: ${blockTitle}.`,
      `Nội dung khối bắt buộc: ${blockText}.`,
      'QUY TẮC: chỉ dùng nội dung khối bắt buộc; bỏ qua lịch sử chat; không kéo sang mục khác; trả lời ngắn, đủ ý, không để dòng trống như "1."; phù hợp học sinh THCS.',
    ].join('\n');
    if (mode === 'summary') handleAskLessonAI(`${base}

Định dạng trả lời bắt buộc:
3 ý chính:
- Ý 1 dưới 14 từ.
- Ý 2 dưới 14 từ.
- Ý 3 dưới 14 từ.
Không thêm phần khác.`, `Tóm tắt: ${blockTitle}`);
    if (mode === 'explain') handleAskLessonAI(`${base}

Định dạng trả lời bắt buộc:
Hiểu đơn giản: viết 2 câu ngắn, dùng từ gần gũi.
Em cần nhớ: nêu đúng 1 ý trọng tâm.
Không chép lại nguyên văn đoạn học.`, `Giải thích: ${blockTitle}`);
    if (mode === 'example') handleAskLessonAI(`${base}

Định dạng trả lời bắt buộc:
Ví dụ gần gũi: nêu đúng 1 ví dụ cụ thể trong đời sống/học tập.
Vì sao đúng: giải thích trong 1 câu vì sao ví dụ đó khớp với nội dung khối.
Không liệt kê nhiều ví dụ, không trả lời chung chung.`, `Ví dụ: ${blockTitle}`);
    if (mode === 'question') handleAskLessonAI(`${base}

Định dạng trả lời bắt buộc:
Câu hỏi tự kiểm tra: đặt đúng 1 câu hỏi ngắn bám sát nội dung khối.
Gợi ý: nêu 1 gợi ý suy nghĩ, chưa cho đáp án trực tiếp.
Không dùng lại nguyên văn câu hỏi đã có nếu có thể tạo câu hỏi tương đương.`, `Tự kiểm tra: ${blockTitle}`);
  };

  const passScore = Number(effectiveContent?.assessment?.pass_score || effectiveContent?.settings?.pass_score || 5);
  const objectives = effectiveContent?.metadata?.muc_tieu_bai_hoc || [];
  const lessonTitle = effectiveContent?.metadata?.tieu_de || lesson?.tieu_de || 'Bài học';
  const lessonSummary = cleanText(effectiveContent?.metadata?.tom_tat || lesson?.mo_ta || '');


  const goToFirstIncompleteSection = () => {
    const first = sections.find((section) => computedSectionProgress[section.section_id]?.status !== 'completed');
    if (first) selectStep(first.section_id);
  };

  const renderSectionCompletionGuide = (section: LessonSectionV2, sp: SectionLearningProgress, timePercent: number, interactionPercent: number) => {
    const questionTotal = section.interactive_questions?.length || 0;
    const missingTime = Math.max(0, Number(sp.requiredSeconds || MIN_SECTION_SECONDS) - Number(sp.timeSpentSeconds || 0));
    const missingQuestions = Math.max(0, questionTotal - Number(sp.interactionCount || 0));
    if (sp.status === 'completed') {
      return (
        <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <div className="flex items-center gap-2 font-bold"><CheckCircle2 className="h-4 w-4" /> Mục này đã hoàn thành.</div>
        </div>
      );
    }
    return (
      <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs leading-6 text-amber-900 sm:mt-4 sm:rounded-2xl sm:px-4 sm:py-4 sm:text-sm sm:leading-7">
        <p className="flex items-center gap-2 font-black"><Target className="h-4 w-4" /> Cần làm gì để hoàn thành mục này?</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="rounded-xl bg-white/70 px-3 py-2">
            <p className="font-bold">Thời gian đọc</p>
            <p>Cần thêm {missingTime > 0 ? `${missingTime} giây` : '0 giây'} để đủ thời gian học.</p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-amber-100"><div className="h-full rounded-full bg-amber-500" style={{ width: `${timePercent}%` }} /></div>
          </div>
          <div className="rounded-xl bg-white/70 px-3 py-2">
            <p className="font-bold">Câu hỏi tương tác</p>
            <p>{missingQuestions > 0 ? `Còn ${missingQuestions} câu cần trả lời.` : 'Đã trả lời đủ câu hỏi.'}</p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-amber-100"><div className="h-full rounded-full bg-indigo-500" style={{ width: `${interactionPercent}%` }} /></div>
          </div>
        </div>
      </div>
    );
  };

  const renderIntro = () => (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-[22px] bg-white shadow-sm ring-1 ring-slate-100 sm:rounded-[30px]">
        <div className="bg-gradient-to-br from-indigo-50 via-white to-fuchsia-50 p-4 sm:p-6">
          <p className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-bold text-indigo-700 shadow-sm"><BookOpen className="h-4 w-4" /> Bắt đầu bài học</p>
          <h3 className="mt-4 text-2xl font-black text-slate-900">{lessonTitle}</h3>
          {lessonSummary && <p className="mt-3 whitespace-pre-line text-sm leading-7 text-slate-700">{lessonSummary}</p>}
          <div className="mt-5 grid gap-3 md:grid-cols-4">
            <div className="rounded-2xl bg-white px-4 py-3 text-indigo-800 shadow-sm"><p className="text-xs font-bold uppercase">Hoạt động</p><p className="mt-1 text-xl font-black">{sections.length}</p></div>
            <div className="rounded-2xl bg-white px-4 py-3 text-fuchsia-800 shadow-sm"><p className="text-xs font-bold uppercase">Tương tác</p><p className="mt-1 text-xl font-black">{allInteractiveQuestions.length}</p></div>
            <div className="rounded-2xl bg-white px-4 py-3 text-emerald-800 shadow-sm"><p className="text-xs font-bold uppercase">Cuối bài</p><p className="mt-1 text-xl font-black">{finalQuiz.length}</p></div>
            <div className="rounded-2xl bg-white px-4 py-3 text-amber-800 shadow-sm"><p className="text-xs font-bold uppercase">Điểm đạt</p><p className="mt-1 text-xl font-black">{passScore}/10</p></div>
          </div>
        </div>
      </section>
      {hasPreparationVideo ? (
        <section className="rounded-[28px] border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-fuchsia-50 p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <p className="inline-flex items-center gap-2 rounded-full bg-indigo-100 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-indigo-700"><PlayCircle className="h-4 w-4" /> Nhiệm vụ chuẩn bị bài</p>
              <h4 className="mt-3 text-lg font-black text-slate-900">Video chuẩn bị được tích hợp trong bài học</h4>
              <p className="mt-1 text-sm leading-6 text-slate-600">Tiến độ video được theo dõi chung trước và trong khi học bài. Xem lại đoạn đã xem không cộng trùng tiến độ.</p>
            </div>
            <div className="grid min-w-[260px] gap-2 sm:grid-cols-2 lg:min-w-[360px]">
              <div className={`rounded-2xl px-4 py-3 ${preparationStatus === 'prepared' ? 'bg-emerald-50 text-emerald-800' : preparationStatus === 'late_completed' ? 'bg-amber-50 text-amber-800' : 'bg-white text-indigo-800 ring-1 ring-indigo-100'}`}>
                <p className="text-[11px] font-black uppercase tracking-[0.12em]">Chuẩn bị bài</p>
                <p className="mt-1 text-lg font-black">{Math.round(Number(progress?.pre_lesson_watch_percent || 0))}%</p>
                <p className="mt-1 text-xs font-semibold">{preparationStatus === 'prepared' ? 'Có chuẩn bị bài' : preparationStatus === 'late_completed' ? 'Đã xem đủ nhưng hoàn thành muộn' : Number(progress?.pre_lesson_watch_percent || 0) > 0 ? 'Đang chuẩn bị' : 'Chưa chuẩn bị'}</p>
              </div>
              <div className="rounded-2xl bg-white px-4 py-3 text-fuchsia-800 ring-1 ring-fuchsia-100">
                <p className="text-[11px] font-black uppercase tracking-[0.12em]">Điểm chuẩn bị</p>
                <p className="mt-1 text-lg font-black">{preparationScoreEnabled ? `${preparationScore.toFixed(1)}/10` : 'Không tính'}</p>
                <p className="mt-1 text-xs font-semibold">{preparationScoreEnabled ? `Trọng số ${preparationWeight}%` : 'Giáo viên chưa bật tính điểm'}</p>
              </div>
            </div>
          </div>
          {currentUserRole === 'student' && onOpenPreLessonVideo ? (
            <button type="button" onClick={onOpenPreLessonVideo} className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-indigo-200 hover:bg-indigo-700">
              <PlayCircle className="h-5 w-5" /> {Number(progress?.pre_lesson_watch_percent || 0) > 0 ? 'Tiếp tục xem video chuẩn bị' : 'Xem video chuẩn bị'}
            </button>
          ) : (
            <YoutubeEmbedBlock url={effectiveContent?.intro_video_embed_url || effectiveContent?.intro_video_url || lesson?.intro_video_embed_url || lesson?.intro_video_url || ''} title={`Video bài học: ${lessonTitle}`} />
          )}
        </section>
      ) : null}
      <section className="rounded-[22px] bg-white p-4 shadow-sm ring-1 ring-slate-100 sm:rounded-[28px] sm:p-6">
        <h4 className="flex items-center gap-2 font-black text-slate-900"><Target className="h-5 w-5 text-indigo-500" /> Mục tiêu bài học</h4>
        <ul className="mt-4 grid gap-3 text-sm leading-7 text-slate-700 md:grid-cols-2">
          {objectives.length ? objectives.map((item, index) => <li key={index} className="rounded-2xl bg-slate-50 px-4 py-3">• {cleanText(item)}</li>) : <li className="text-slate-500">Chưa có mục tiêu.</li>}
        </ul>
      </section>
      <section className="rounded-[22px] bg-white p-4 shadow-sm ring-1 ring-slate-100 sm:rounded-[28px] sm:p-6">
        <h4 className="flex items-center gap-2 font-black text-slate-900"><Clock className="h-5 w-5 text-amber-500" /> Tiến trình hoạt động dạy học</h4>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {sections.map((section) => {
            const sp = computedSectionProgress[section.section_id] || createSectionProgress(section);
            const done = sp.status === 'completed';
            if (section.locked && currentUserRole === 'student') return <div key={section.section_id} className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-500"><LockKeyhole className="mr-2 inline h-4 w-4" /> {section.title} • Giáo viên chưa mở</div>;
            return <div key={section.section_id} className={`rounded-2xl px-4 py-3 text-sm ${done ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>{done ? '✓' : '!' } {section.title} • {sp.timeSpentSeconds}/{sp.requiredSeconds}s • {sp.interactionCount}/{section.interactive_questions?.length || 0} câu{done && Number.isFinite(Number(sp.section_score)) ? ` • ${Number(sp.section_score).toFixed(1)}/10` : ''}</div>;
          })}
        </div>
      </section>
    </div>
  );

  const renderSection = (section: LessonSectionV2, index: number) => {
    const blocks = sectionContentBlocks(section);
    const note = cleanText(section.source_note || section.summary || '');
    const sp = computedSectionProgress[section.section_id] || createSectionProgress(section);
    const isComplete = sp.status === 'completed';
    const needsWork = sp.opened && !isComplete;
    const timePercent = Math.min(100, Math.round((Number(sp.timeSpentSeconds || 0) / Math.max(1, Number(sp.requiredSeconds || MIN_SECTION_SECONDS))) * 100));
    const questionTotal = section.interactive_questions?.length || 0;
    const interactionPercent = questionTotal ? Math.min(100, Math.round((Number(sp.interactionCount || 0) / questionTotal) * 100)) : 100;
    const sectionPercent = Math.max(0, Math.min(100, Number(sp.completionPercent ?? Math.round(timePercent * 0.4 + interactionPercent * 0.6))));
    const pages = section.pages || [];
    const firstPage = pages[0] || null;
    const classLabel = teachingClassOptions.find((item) => item.lop_id === teachingClassId)?.ten_lop || teachingClassId;
    const releasedForClass = releasedActivityIds.has(section.section_id);
    if (section.locked && currentUserRole === 'student') {
      return <section className="rounded-[28px] bg-white p-8 text-center shadow-sm ring-1 ring-slate-100"><LockKeyhole className="mx-auto h-10 w-10 text-slate-400" /><h3 className="mt-4 text-xl font-black text-slate-900">Hoạt động chưa được mở</h3><p className="mt-2 text-sm text-slate-500">Giáo viên sẽ mở hoạt động này khi lớp học đến nội dung tương ứng.</p></section>;
    }
    return (
      <div className="space-y-5">
        {currentUserRole !== 'student' && isTeachingMode ? (
          <section className="rounded-[22px] bg-white p-4 shadow-sm ring-1 ring-slate-100">
            <div className="flex flex-wrap items-end gap-3">
              <label className="min-w-[190px] flex-1 text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">Lớp đang dạy
                <select value={teachingClassId} onChange={(event) => setTeachingClassId(event.target.value)} disabled={Boolean(lesson?.lop_id)} className="mt-1.5 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold normal-case tracking-normal text-slate-800 outline-none focus:border-indigo-400 disabled:bg-slate-100">
                  {teachingClassOptions.map((item) => <option key={item.lop_id} value={item.lop_id}>{item.ten_lop || item.lop_id} • {item.lop_id}</option>)}
                </select>
              </label>
              <button type="button" disabled={!teachingClassId || teachingSessionBusy} onClick={() => void toggleActivityAccessForClass(section, !releasedForClass, firstPage?.page_id)} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-black text-white shadow-sm disabled:opacity-50 ${releasedForClass ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}>{releasedForClass ? <LockKeyhole className="h-4 w-4" /> : <UnlockKeyhole className="h-4 w-4" />}{releasedForClass ? `Khóa mục đối với ${classLabel || 'lớp'}` : `Mở mục cho ${classLabel || 'lớp'}`}</button>
              {releasedForClass ? <button type="button" disabled={teachingSessionBusy} onClick={() => void presentActivityForClass(section, firstPage?.page_id)} className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-black text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50">Trình bày mục này</button> : null}
              <span className={`rounded-xl px-3 py-2.5 text-xs font-bold ${releasedForClass ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100' : 'bg-slate-100 text-slate-600 ring-1 ring-slate-200'}`}>{releasedForClass ? 'Học sinh được phép mở' : 'Đang khóa đối với học sinh'}</span>
            </div>
            {teachingSessionError ? <p className="mt-2 text-xs font-bold text-rose-700">{teachingSessionError}</p> : null}
          </section>
        ) : null}
        <section className="overflow-hidden rounded-[22px] bg-white shadow-sm ring-1 ring-slate-100 sm:rounded-[30px]">
          <div className="bg-gradient-to-br from-white via-indigo-50/70 to-fuchsia-50/70 p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-bold text-indigo-700 shadow-sm"><Sparkles className="h-4 w-4" /> Mục học {index + 1}</p>
              {currentUserRole === 'student' ? (
                <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold ${isComplete ? 'bg-emerald-100 text-emerald-700' : needsWork ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                  {isComplete ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                  {isComplete ? `Đã hoàn thành • ${Number(sp.section_score || 0).toFixed(1)}/10` : needsWork ? 'Chưa hoàn thành' : 'Đang học'}
                </span>
              ) : (
                <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-600 shadow-sm ring-1 ring-slate-200">Giảng dạy</span>
              )}
            </div>
            <h3 className="mt-3 text-xl font-black leading-tight text-slate-900 sm:mt-4 sm:text-2xl">{section.title}</h3>
            {currentUserRole === 'student' ? (
              <>
                <p className="mt-2 text-[10px] font-semibold uppercase leading-5 tracking-[0.11em] text-slate-500 sm:mt-3 sm:text-xs sm:tracking-[0.15em]">Thời gian học: {sp.timeSpentSeconds}/{sp.requiredSeconds} giây • Tương tác: {sp.interactionCount}/{section.interactive_questions?.length || 0} câu</p>
                <div className="mt-3 overflow-hidden rounded-full bg-white/80 shadow-inner"><div className={`h-2.5 rounded-full transition-all ${isComplete ? 'bg-emerald-500' : needsWork ? 'bg-rose-500' : 'bg-amber-400'}`} style={{ width: `${sectionPercent}%` }} /></div>
                {renderSectionCompletionGuide(section, sp, timePercent, interactionPercent)}
                <div className="mt-3 flex gap-2 overflow-x-auto pb-1 sm:mt-4 sm:flex-wrap sm:overflow-visible sm:pb-0">
                  <button type="button" onClick={() => handleQuickAskCurrentSection('summary')} className="shrink-0 rounded-full bg-white px-3 py-2 text-xs font-bold text-indigo-700 shadow-sm ring-1 ring-indigo-100 hover:bg-indigo-50">Tóm tắt phần này</button>
                  <button type="button" onClick={() => handleQuickAskCurrentSection('explain')} className="shrink-0 rounded-full bg-white px-3 py-2 text-xs font-bold text-fuchsia-700 shadow-sm ring-1 ring-fuchsia-100 hover:bg-fuchsia-50">Giải thích dễ hiểu</button>
                  <button type="button" onClick={() => handleQuickAskCurrentSection('example')} className="shrink-0 rounded-full bg-white px-3 py-2 text-xs font-bold text-amber-700 shadow-sm ring-1 ring-amber-100 hover:bg-amber-50">Cho ví dụ thêm</button>
                </div>
              </>
            ) : null}
          </div>
          <div className="space-y-4 p-3 sm:p-5 lg:p-6">
            {blocks.length ? (
              <div className="grid gap-4">
                {blocks.map((block, blockIndex) => {
                  const category = inferBlockCategory(block, blockIndex);
                  const theme = inferBlockTheme(block, blockIndex);
                  const style = themeStyle(theme);
                  const label = categoryLabel(category);
                  const title = deriveBlockTitle(block, blockIndex, section.title);
                  return (
                    <article
                      key={`${section.section_id}-block-${blockIndex}`}
                      className={`group relative w-full max-w-none overflow-hidden rounded-[22px] border px-3 py-4 text-sm leading-7 shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl sm:rounded-[30px] sm:px-5 sm:py-5 sm:leading-8 ${style.card}`}
                    >
                      <div className={`absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${style.accent}`} />
                      <div className="flex gap-3 sm:gap-4">
                        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-lg shadow-sm ring-1 ring-white/80 transition group-hover:scale-105 sm:h-12 sm:w-12 sm:rounded-3xl sm:text-xl ${style.icon}`}>{categoryIcon(category, block.type)}</div>
                        <div className="min-w-0 flex-1">
                          <div className="mb-3 flex flex-wrap items-center gap-2">
                            <span className={`rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] ring-1 ${style.chip}`}>{label}</span>
                          </div>
                          <h5 className="mb-2 text-base font-black leading-snug text-slate-950 sm:mb-3 sm:text-lg">{title}</h5>
                          <div className="text-sm leading-7 text-slate-700 sm:text-[15px] sm:leading-8">{renderLearningText(block.text)}</div>
                          <div className="mt-3 flex gap-2 overflow-x-auto border-t border-white/70 pt-3 sm:mt-4 sm:flex-wrap sm:overflow-visible">
                            <button type="button" onClick={() => handleAskContentBlock(section, block, blockIndex, 'summary')} className="shrink-0 rounded-full bg-white/80 px-3 py-1.5 text-[11px] font-bold text-indigo-700 shadow-sm ring-1 ring-indigo-100 hover:bg-white">Tóm tắt ý này</button>
                            <button type="button" onClick={() => handleAskContentBlock(section, block, blockIndex, 'explain')} className="shrink-0 rounded-full bg-white/80 px-3 py-1.5 text-[11px] font-bold text-fuchsia-700 shadow-sm ring-1 ring-fuchsia-100 hover:bg-white">Giải thích</button>
                            <button type="button" onClick={() => handleAskContentBlock(section, block, blockIndex, 'example')} className="shrink-0 rounded-full bg-white/80 px-3 py-1.5 text-[11px] font-bold text-amber-700 shadow-sm ring-1 ring-amber-100 hover:bg-white">Ví dụ</button>
                            <button type="button" onClick={() => handleAskContentBlock(section, block, blockIndex, 'question')} className="shrink-0 rounded-full bg-white/80 px-3 py-1.5 text-[11px] font-bold text-emerald-700 shadow-sm ring-1 ring-emerald-100 hover:bg-white">Tự kiểm tra</button>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : <p className="text-sm text-slate-500">Chưa có nội dung chính.</p>}
            <YoutubeEmbedBlock url={section.youtube_embed_url || section.youtube_url} title={`Video ${section.title}`} />
            {section.examples?.length ? (
              <div className="rounded-[28px] border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-orange-50 px-5 py-5 text-sm leading-7 text-amber-950 shadow-sm">
                <p className="mb-3 flex items-center gap-2 font-black"><span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-white shadow-sm">🌟</span> Ví dụ minh họa</p>
                <div className="grid gap-2 md:grid-cols-2">{section.examples.map((item, i) => <p key={i} className="rounded-2xl bg-white/75 px-4 py-3">• {cleanText(item)}</p>)}</div>
              </div>
            ) : null}
            {note ? (
              <div className="rounded-[28px] border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-teal-50 px-5 py-5 text-sm leading-8 text-emerald-950 shadow-sm">
                <p className="mb-3 flex items-center gap-2 font-black"><Lightbulb className="h-5 w-5 text-emerald-600" /> Ghi nhớ</p>
                <div className="rounded-2xl bg-white/75 px-4 py-3">{renderLearningText(note)}</div>
              </div>
            ) : null}
          </div>
        </section>
        <section className={`rounded-[22px] p-4 shadow-sm ring-1 sm:rounded-[28px] sm:p-6 ${isComplete ? 'bg-white ring-emerald-100' : 'bg-white ring-rose-100'}`}>
          <h4 className="mb-4 flex items-center gap-2 font-black text-slate-900"><CheckCircle2 className="h-5 w-5 text-indigo-500" /> Câu hỏi tương tác</h4>
          {!isComplete ? <div className="mb-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">Hãy đọc đủ thời gian và hoàn thành câu hỏi để mục này chuyển sang dấu check xanh.</div> : null}
          <div className="space-y-4">
            {(section.interactive_questions || []).length ? section.interactive_questions.map((question, qIndex) => (
              <InteractiveQuestionCard key={getQuestionKey(question, qIndex)} question={question} index={qIndex} initialAnswer={answerStates[getQuestionKey(question, qIndex)] || null} onAnswerStateChange={handleAnswerStateChange} onAskAI={(prompt, displayText) => handleAskLessonAI(`Mục đang học: “${section.title}”. Nội dung bắt buộc của mục: “${cleanText(section.content || section.summary || section.source_note || '').slice(0, 1200)}”. Câu hỏi hiện tại thuộc đúng mục này. ${prompt}`, displayText || 'Hỏi AI về câu này')} />
            )) : <p className="text-sm text-slate-500">Chưa có câu hỏi tương tác.</p>}
          </div>
        </section>
      </div>
    );
  };

  const renderFinalQuiz = () => {
    const finalAnsweredCount = activeFinalQuiz.filter((question, index) => answerStates[getQuestionKey(question, index + allInteractiveQuestions.length)]?.submitted).length;
    const finalUnansweredCount = Math.max(0, activeFinalQuiz.length - finalAnsweredCount);
    const securityTotal = Object.values(examSecurityEvents).reduce<number>((sum, value) => sum + Number(value || 0), 0);
    const maxAttempts = Math.max(1, Number(settings.max_exam_attempts || 2));
    const canRetryExam = settings.allow_exam_retry !== false && examSubmitted && examAttemptNumber < maxAttempts;

    const scrollToExamQuestion = (questionIndex: number) => {
      setFocusedExamIndex(questionIndex);
      window.setTimeout(() => {
        document.getElementById(`final-exam-q-${questionIndex + 1}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 30);
    };

    const toggleReviewMark = (questionKey: string) => {
      setExamReviewMarks((prev) => ({ ...prev, [questionKey]: !prev[questionKey] }));
    };

    if (!examStarted) {
      return (
        <section className="rounded-[22px] bg-white p-4 shadow-sm ring-1 ring-slate-100 sm:rounded-[28px] sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1 text-xs font-black text-rose-700 ring-1 ring-rose-100"><ShieldCheck className="h-4 w-4" /> Chế độ kiểm tra bảo mật</p>
              <h3 className="mt-4 flex items-center gap-2 text-2xl font-black text-slate-900"><LockKeyhole className="h-6 w-6 text-rose-600" /> Kiểm tra cuối bài</h3>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">Đây là phần kiểm tra cuối cùng để đánh giá kết quả học tập. Khi bắt đầu, trợ lý AI sẽ tắt, hệ thống chặn sao chép và ghi nhận các cảnh báo rời màn hình.</p>
            </div>
            <div className="rounded-3xl bg-slate-50 px-5 py-4 text-sm text-slate-700 ring-1 ring-slate-100">
              <p><span className="font-bold">Số câu:</span> {activeFinalQuiz.length}</p>
              <p><span className="font-bold">Thời gian:</span> {finalExamTimeMinutes} phút</p>
              <p><span className="font-bold">Lần làm:</span> {examAttemptNumber}/{maxAttempts}</p>
            </div>
          </div>
          {incompleteSectionTitles.length ? (
            <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm leading-7 text-rose-800">
              <p className="font-bold">Em còn {incompleteSectionTitles.length} nội dung chưa hoàn thành.</p>
              <p>Em vẫn có thể bắt đầu kiểm tra, nhưng bài học chỉ được công nhận hoàn thành khi các nội dung học đều có check xanh.</p>
            </div>
          ) : null}
          <div className="mt-5 grid gap-3 text-sm leading-7 text-slate-700 md:grid-cols-2">
            <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-emerald-800">✓ Hết giờ hệ thống sẽ tự động nộp bài.</div>
            <div className="rounded-2xl bg-amber-50 px-4 py-3 text-amber-800">✓ Khi nộp bài, hệ thống sẽ cảnh báo nếu còn câu chưa làm.</div>
            <div className="rounded-2xl bg-rose-50 px-4 py-3 text-rose-800">✓ Không dùng trợ lý AI, không sao chép, không chuột phải trong lúc làm bài.</div>
            <div className="rounded-2xl bg-indigo-50 px-4 py-3 text-indigo-800">✓ Câu hỏi/đáp án có thể được đảo theo cấu hình của giáo viên.</div>
          </div>
          <div className="mt-6 flex justify-end">
            <button onClick={startFinalExam} className="inline-flex items-center gap-2 rounded-2xl bg-rose-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-rose-200 hover:bg-rose-700"><PlayCircle className="h-5 w-5" /> Bắt đầu làm bài</button>
          </div>
        </section>
      );
    }

    const reviewMarkedCount = activeFinalQuiz.filter((question, index) => {
      const questionKey = getQuestionKey(question, index + allInteractiveQuestions.length);
      return Boolean(examReviewMarks[questionKey]);
    }).length;
    const currentQuestion = activeFinalQuiz[focusedExamIndex] || activeFinalQuiz[0];
    const currentQuestionKey = currentQuestion ? getQuestionKey(currentQuestion, focusedExamIndex + allInteractiveQuestions.length) : '';
    const currentQuestionMarked = currentQuestionKey ? Boolean(examReviewMarks[currentQuestionKey]) : false;

    const renderQuestionNavigator = (compact = false) => (
      <div className={compact ? 'grid grid-cols-5 gap-2' : 'grid grid-cols-5 gap-2 sm:grid-cols-6 xl:grid-cols-5'}>
        {activeFinalQuiz.map((question, index) => {
          const questionKey = getQuestionKey(question, index + allInteractiveQuestions.length);
          const answerState = answerStates[questionKey];
          const answered = Boolean(answerState?.submitted);
          const marked = Boolean(examReviewMarks[questionKey]);
          const active = focusedExamIndex === index;
          const submittedWrong = examSubmitted && answered && !answerState?.isCorrect;
          const submittedCorrect = examSubmitted && answered && answerState?.isCorrect;
          const statusClass = submittedCorrect
            ? 'bg-teal-600 text-white ring-teal-600'
            : submittedWrong
              ? 'bg-rose-600 text-white ring-rose-600'
              : marked
                ? 'bg-orange-500 text-white ring-orange-500'
                : answered
                  ? 'bg-teal-600 text-white ring-teal-600'
                  : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50';
          return (
            <button
              key={questionKey}
              type="button"
              onClick={() => scrollToExamQuestion(index)}
              className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-black ring-1 transition ${statusClass} ${active ? 'scale-110 shadow-lg outline outline-3 outline-indigo-200' : 'shadow-sm'}`}
              title={marked ? `Câu ${index + 1}: đánh dấu xem lại` : answered ? `Câu ${index + 1}: đã làm` : `Câu ${index + 1}: chưa làm`}
            >
              {index + 1}
            </button>
          );
        })}
      </div>
    );

    const examSidebar = (
      <aside className="h-fit rounded-[28px] bg-white p-5 shadow-sm ring-1 ring-slate-100 xl:sticky xl:top-24">
        {!examSubmitted ? (
          <div className="space-y-5">
            <div className="text-center">
              <p className="text-base font-black text-slate-900">Trạng thái làm bài</p>
              <div className={`mx-auto mt-3 inline-flex min-w-36 items-center justify-center gap-2 rounded-3xl px-5 py-3 text-xl font-black shadow-sm ring-1 ${examRemainingSeconds <= 60 ? 'animate-pulse bg-rose-600 text-white ring-rose-200' : examRemainingSeconds <= 300 ? 'bg-orange-100 text-orange-800 ring-orange-200' : 'bg-indigo-50 text-indigo-800 ring-indigo-100'}`}>
                <Clock className="h-5 w-5" /> {formatSeconds(examRemainingSeconds)}
              </div>
              <p className="mt-2 text-xs font-semibold text-slate-500">Lần làm: {examAttemptNumber}/{maxAttempts}</p>
            </div>

            <div className="rounded-3xl bg-slate-50 p-4 ring-1 ring-slate-100">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-sm font-black text-slate-900">Câu hỏi</p>
                <p className="text-xs font-semibold text-slate-500">Bấm số để đến câu</p>
              </div>
              {renderQuestionNavigator(true)}
              <div className="mt-4 grid grid-cols-2 gap-2 text-[11px] font-bold text-slate-600">
                <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-white ring-1 ring-slate-300" /> Chưa làm</span>
                <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-teal-600" /> Đã làm</span>
                <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-orange-500" /> Xem lại</span>
                <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-indigo-200" /> Đang xem</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm font-bold">
              <div className="rounded-2xl bg-teal-50 px-4 py-3 text-teal-700 ring-1 ring-teal-100"><p className="text-[11px] uppercase tracking-wide opacity-70">Đã làm</p><p className="mt-1 text-lg font-black">{finalAnsweredCount}/{activeFinalQuiz.length}</p></div>
              <div className="rounded-2xl bg-amber-50 px-4 py-3 text-amber-700 ring-1 ring-amber-100"><p className="text-[11px] uppercase tracking-wide opacity-70">Chưa làm</p><p className="mt-1 text-lg font-black">{finalUnansweredCount}</p></div>
              <div className="rounded-2xl bg-orange-50 px-4 py-3 text-orange-700 ring-1 ring-orange-100"><p className="text-[11px] uppercase tracking-wide opacity-70">Xem lại</p><p className="mt-1 text-lg font-black">{reviewMarkedCount}</p></div>
              <div className="rounded-2xl bg-rose-50 px-4 py-3 text-rose-700 ring-1 ring-rose-100"><p className="text-[11px] uppercase tracking-wide opacity-70">Cảnh báo</p><p className="mt-1 text-lg font-black">{securityTotal}</p></div>
            </div>

            <div className="space-y-3">
              <button
                type="button"
                disabled={!currentQuestionKey}
                onClick={() => currentQuestionKey && toggleReviewMark(currentQuestionKey)}
                className={`w-full rounded-2xl px-4 py-3 text-sm font-black ring-1 transition ${currentQuestionMarked ? 'bg-orange-100 text-orange-800 ring-orange-200 hover:bg-orange-200' : 'bg-white text-slate-700 ring-slate-200 hover:bg-slate-50'}`}
              >
                {currentQuestionMarked ? 'Bỏ đánh dấu xem lại' : 'Đánh dấu câu đang xem'}
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => scrollToExamQuestion(Math.max(0, focusedExamIndex - 1))} className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100">Câu trước</button>
                <button type="button" onClick={() => scrollToExamQuestion(Math.min(activeFinalQuiz.length - 1, focusedExamIndex + 1))} className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100">Câu tiếp</button>
              </div>
              <button onClick={() => submitFinalExam(false)} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-emerald-200 hover:bg-emerald-700"><ListChecks className="h-5 w-5" /> Nộp bài</button>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="text-center">
              <p className="text-base font-black text-slate-900">Kết quả</p>
              <div className="mx-auto mt-3 rounded-3xl bg-orange-50 px-5 py-5 text-orange-700 ring-1 ring-orange-100">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-500">Điểm</p>
                <p className="mt-1 text-4xl font-black">{finalExamScore.toFixed(1)}<span className="text-xl text-slate-500">/10</span></p>
              </div>
              <p className="mt-3 text-sm font-bold text-slate-600">Đúng {metrics.finalCorrect}/{metrics.finalTotal} câu • Thời gian {formatSeconds(examElapsedSeconds)}</p>
            </div>

            <div className="rounded-3xl bg-slate-50 p-4 ring-1 ring-slate-100">
              <p className="mb-3 text-center text-sm font-black text-slate-900">Câu hỏi</p>
              {renderQuestionNavigator(true)}
              <div className="mt-4 grid grid-cols-2 gap-2 text-[11px] font-bold text-slate-600">
                <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-teal-600" /> Đúng</span>
                <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-rose-600" /> Sai</span>
                <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-orange-500" /> Xem lại</span>
                <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-white ring-1 ring-slate-300" /> Bỏ trống</span>
              </div>
            </div>

            <div className="rounded-3xl bg-slate-50 p-4 text-sm text-slate-600 ring-1 ring-slate-100">
              <p><span className="font-bold text-slate-900">Cảnh báo bảo mật:</span> {securityTotal}</p>
              <p><span className="font-bold text-slate-900">Lần làm:</span> {examAttemptNumber}/{maxAttempts}</p>
              {examAutoSubmitted ? <p className="mt-2 font-bold text-rose-700">Bài được tự động nộp do hết thời gian.</p> : null}
            </div>

            <div className="space-y-3">
              <button onClick={() => selectStep('result')} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-emerald-200 hover:bg-emerald-700"><CheckCircle2 className="h-5 w-5" /> Xem kết quả đánh giá</button>
              {canRetryExam ? <button onClick={retryFinalExam} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50"><RotateCcw className="h-4 w-4" /> Làm lại kiểm tra</button> : null}
            </div>
          </div>
        )}
      </aside>
    );

    return (
      <section className={`rounded-[28px] bg-white p-5 shadow-sm ring-1 ring-slate-100 ${!examSubmitted ? 'select-none' : ''}`}>
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0">
            <div className="mb-5 rounded-[28px] border border-rose-100 bg-white px-5 py-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="flex items-center gap-2 text-2xl font-black text-slate-900"><ShieldCheck className="h-6 w-6 text-rose-600" /> Kiểm tra cuối bài</h3>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-rose-600">Bảo mật • Không phản hồi đáp án trước khi nộp bài</p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-bold text-slate-600 ring-1 ring-slate-100">
                  {examSubmitted ? `Đã nộp sau ${formatSeconds(examElapsedSeconds)}` : `Câu đang xem: ${Math.min(focusedExamIndex + 1, activeFinalQuiz.length)}/${activeFinalQuiz.length}`}
                </div>
              </div>
              {examAutoSubmitted ? <p className="mt-3 rounded-2xl bg-rose-50 px-4 py-2 text-sm font-bold text-rose-700">Đã hết thời gian. Hệ thống tự động nộp bài.</p> : null}
            </div>

            {securityTotal > 0 && !examSubmitted ? (
              <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-7 text-amber-800">
                Hệ thống đã ghi nhận {securityTotal} cảnh báo bảo mật. Em cần tập trung làm bài trong màn hình kiểm tra.
              </div>
            ) : null}

            <div className="space-y-4 pb-8">
              {activeFinalQuiz.length ? activeFinalQuiz.map((question, index) => {
                const questionKey = getQuestionKey(question, index + allInteractiveQuestions.length);
                return (
                  <div key={questionKey} id={`final-exam-q-${index + 1}`} onFocusCapture={() => setFocusedExamIndex(index)} onMouseEnter={() => setFocusedExamIndex(index)} className="scroll-mt-36 rounded-[30px]">
                    <InteractiveQuestionCard
                      question={question}
                      index={index}
                      initialAnswer={answerStates[questionKey] || null}
                      onAnswerStateChange={handleAnswerStateChange}
                      disableAI
                      disableReset
                      hideFeedback={!examSubmitted || settings.show_final_answers_after_submit === false}
                      examMode
                    />
                  </div>
                );
              }) : <p className="text-sm text-slate-500">Chưa có bài kiểm tra cuối bài.</p>}
            </div>
          </div>
          {examSidebar}
        </div>
      </section>
    );
  };


  const renderResult = () => <LessonResultSummary score={score} passScore={passScore} correct={metrics.correct} total={metrics.total} interactiveCorrect={metrics.interactiveCorrect} interactiveTotal={metrics.interactiveTotal} finalCorrect={metrics.finalCorrect} finalTotal={metrics.finalTotal} completedSections={completedSectionsCount} totalSections={sections.length} incompleteSections={incompleteSectionTitles} learningProcessScore={learningProcessScore} finalExamScore={finalExamScore} learningWeight={weightedAssessment.learningComponentWeight} finalWeight={weightedAssessment.finalComponentWeight} preparationScore={preparationScore} preparationWeight={weightedAssessment.preparationWeight} preparationStatus={preparationStatus} onReviewIncomplete={goToFirstIncompleteSection} onRetry={content?.settings?.allow_retry !== false ? () => setAnswerStates({}) : undefined} />;


  const renderSubmitConfirmDialog = () => {
    if (!submitConfirmState) return null;
    const hasUnanswered = submitConfirmState.unanswered > 0;
    return (
      <div className="fixed inset-0 z-[16000] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
        <motion.div initial={{ opacity: 0, scale: 0.96, y: 18 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 18 }} className="w-full max-w-lg overflow-hidden rounded-[28px] bg-white shadow-[0_30px_90px_rgba(15,23,42,0.35)] ring-1 ring-white/70">
          <div className={`${hasUnanswered ? 'bg-gradient-to-r from-amber-500 to-orange-500' : 'bg-gradient-to-r from-emerald-600 to-teal-500'} px-6 py-5 text-white`}>
            <p className="inline-flex rounded-full bg-white/15 px-3 py-1 text-xs font-bold">Xác nhận nộp bài</p>
            <h3 className="mt-3 text-xl font-black">{hasUnanswered ? `Còn ${submitConfirmState.unanswered} câu chưa trả lời` : 'Em đã trả lời đủ các câu'}</h3>
            <p className="mt-2 text-sm leading-6 text-white/85">{hasUnanswered ? 'Em có thể quay lại làm tiếp hoặc vẫn nộp bài. Câu chưa làm sẽ được tính là chưa đúng.' : 'Sau khi nộp, bài làm sẽ được khóa và hệ thống tính kết quả kiểm tra cuối bài.'}</p>
          </div>
          <div className="px-6 py-5 text-sm leading-7 text-slate-600">
            <div className="rounded-2xl bg-slate-50 px-4 py-3">
              Đã làm: <span className="font-bold text-slate-900">{submitConfirmState.total - submitConfirmState.unanswered}/{submitConfirmState.total}</span>
              {hasUnanswered ? <span className="ml-2 font-semibold text-amber-700">• Hãy kiểm tra lại trước khi nộp.</span> : <span className="ml-2 font-semibold text-emerald-700">• Có thể nộp bài.</span>}
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-3 border-t border-slate-100 px-6 py-4">
            <button type="button" onClick={() => setSubmitConfirmState(null)} className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50">Quay lại làm tiếp</button>
            <button type="button" onClick={() => submitFinalExam(true)} className="rounded-2xl bg-emerald-600 px-5 py-2.5 text-sm font-black text-white shadow-lg shadow-emerald-200 hover:bg-emerald-700">Nộp bài</button>
          </div>
        </motion.div>
      </div>
    );
  };

  const renderDiscussion = () => (
    <div className="space-y-5">
      <section className="rounded-[32px] bg-white p-5 shadow-sm ring-1 ring-slate-100 lg:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-fuchsia-50 px-3 py-1 text-xs font-bold text-fuchsia-700">
              <MessageSquareText className="h-4 w-4" /> Bình luận & câu hỏi
            </p>
            <h3 className="mt-3 text-2xl font-black text-slate-900">Trao đổi trong bài học</h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              Học sinh có thể đặt câu hỏi hoặc bình luận về bài học. Giáo viên xem, trả lời và đánh dấu các câu hỏi đã xử lý trong phần Theo dõi.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-3">
            <div className="rounded-2xl bg-slate-50 px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Tổng</p>
              <p className="text-xl font-black text-slate-900">{visibleComments.length}</p>
            </div>
            <div className="rounded-2xl bg-amber-50 px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-500">Cần trả lời</p>
              <p className="text-xl font-black text-amber-700">{openQuestionCount}</p>
            </div>
            <div className="rounded-2xl bg-emerald-50 px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-500">Phản hồi</p>
              <p className="text-xl font-black text-emerald-700">{visibleComments.filter((item) => item.parent_id).length}</p>
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-[28px] border border-slate-100 bg-slate-50/80 p-4">
          <div className="mb-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => setCommentMode('cau_hoi')} className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-black transition ${commentMode === 'cau_hoi' ? 'bg-fuchsia-600 text-white shadow-lg shadow-fuchsia-200' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'}`}>
              <HelpCircle className="h-4 w-4" /> Đặt câu hỏi
            </button>
            <button type="button" onClick={() => setCommentMode('binh_luan')} className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-black transition ${commentMode === 'binh_luan' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'}`}>
              <MessageCircleMore className="h-4 w-4" /> Gửi bình luận
            </button>
          </div>
          <textarea
            value={commentInput}
            onChange={(event) => setCommentInput(event.target.value)}
            placeholder={commentMode === 'cau_hoi' ? 'Nhập câu hỏi của em về bài học...' : 'Nhập bình luận hoặc chia sẻ của em về bài học...'}
            className="min-h-[120px] w-full resize-none rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-700 outline-none transition focus:border-fuchsia-300 focus:ring-4 focus:ring-fuchsia-100"
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-semibold text-slate-500">Nội dung sẽ được gửi cho giáo viên theo đúng bài học hiện tại.</p>
            <button type="button" disabled={!commentInput.trim() || submittingCommentId === 'new' || !onAddComment} onClick={() => void handleSubmitComment()} className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-fuchsia-600 to-violet-600 px-4 py-2.5 text-sm font-black text-white shadow-lg shadow-fuchsia-200 disabled:cursor-not-allowed disabled:opacity-50">
              <Send className="h-4 w-4" /> {submittingCommentId === 'new' ? 'Đang gửi...' : 'Gửi'}
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-[32px] bg-white p-5 shadow-sm ring-1 ring-slate-100 lg:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-lg font-black text-slate-900">Danh sách bình luận/câu hỏi</h3>
          {isCommentsLoading ? <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">Đang tải...</span> : null}
        </div>
        {!topLevelComments.length && !isCommentsLoading ? (
          <div className="rounded-[28px] border border-dashed border-slate-200 bg-slate-50 py-12 text-center">
            <MessageSquareText className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-3 text-sm font-bold text-slate-700">Chưa có bình luận hoặc câu hỏi</p>
            <p className="text-sm text-slate-500">Hãy đặt câu hỏi khi em chưa hiểu nội dung bài học.</p>
          </div>
        ) : null}
        <div className="space-y-4">
          {topLevelComments.map((comment) => {
            const replies = repliesByCommentId.get(comment.comment_id) || [];
            return (
              <article key={comment.comment_id} className={`rounded-[26px] border p-4 shadow-sm ${comment.trang_thai === 'resolved' ? 'border-emerald-100 bg-emerald-50/40' : comment.trang_thai === 'hidden' ? 'border-slate-100 bg-slate-50 opacity-70' : 'border-slate-100 bg-white'}`}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-start gap-3">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${comment.loai === 'cau_hoi' ? 'bg-fuchsia-100 text-fuchsia-700' : 'bg-indigo-100 text-indigo-700'}`}>
                      {comment.loai === 'cau_hoi' ? <HelpCircle className="h-5 w-5" /> : <MessageCircleMore className="h-5 w-5" />}
                    </div>
                    <div>
                      <p className="font-black text-slate-900">{comment.ho_ten || comment.user_id || 'Người học'}</p>
                      <p className="text-xs font-semibold text-slate-400">{commentTypeLabel(comment.loai)} • {formatDateTime(comment.created_at)}{comment.trang_thai === 'resolved' ? ' • Đã xử lý' : ''}</p>
                    </div>
                  </div>
                  {canModerateComments ? (
                    <div className="flex flex-wrap gap-2">
                      <button type="button" disabled={submittingCommentId === comment.comment_id} onClick={() => void handleResolveComment(comment)} className="rounded-full bg-emerald-50 px-3 py-1.5 text-[11px] font-black text-emerald-700 disabled:opacity-50">
                        <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" /> {comment.trang_thai === 'resolved' ? 'Mở lại' : 'Đã xử lý'}
                      </button>
                      <button type="button" disabled={submittingCommentId === comment.comment_id} onClick={() => void handleHideComment(comment)} className="rounded-full bg-rose-50 px-3 py-1.5 text-[11px] font-black text-rose-700 disabled:opacity-50">
                        <EyeOff className="mr-1 inline h-3.5 w-3.5" /> Ẩn
                      </button>
                    </div>
                  ) : null}
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-700">{comment.noi_dung}</p>

                {replies.length ? (
                  <div className="mt-4 space-y-2 border-l-2 border-indigo-100 pl-4">
                    {replies.map((reply) => (
                      <div key={reply.comment_id} className="rounded-2xl bg-indigo-50/70 px-4 py-3">
                        <div className="flex items-center gap-2 text-xs font-semibold text-indigo-700">
                          <Reply className="h-3.5 w-3.5" /> {reply.ho_ten || reply.user_id || 'Giáo viên'} • {formatDateTime(reply.created_at)}
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{reply.noi_dung}</p>
                      </div>
                    ))}
                  </div>
                ) : null}

                {canModerateComments ? (
                  <div className="mt-4 rounded-2xl bg-slate-50 p-3">
                    <textarea
                      value={replyInputs[comment.comment_id] || ''}
                      onChange={(event) => setReplyInputs((current) => ({ ...current, [comment.comment_id]: event.target.value }))}
                      placeholder="Nhập phản hồi của giáo viên..."
                      className="min-h-[78px] w-full resize-none rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100"
                    />
                    <div className="mt-2 flex justify-end">
                      <button type="button" disabled={!(replyInputs[comment.comment_id] || '').trim() || submittingCommentId === comment.comment_id || !onAddComment} onClick={() => void handleReplyComment(comment)} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50">
                        <Send className="h-3.5 w-3.5" /> Trả lời
                      </button>
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );

  const renderActiveContent = () => {
    if (activeStep === 'intro') return renderIntro();
    if (activeStep === 'comments') return renderDiscussion();
    if (activeStep === 'final_quiz') return renderFinalQuiz();
    if (activeStep === 'result') return renderResult();
    const sectionIndex = sections.findIndex((section) => section.section_id === activeStep);
    if (sectionIndex >= 0) return renderSection(sections[sectionIndex], sectionIndex);
    return renderIntro();
  };

  if (!isOpen || !lesson || !content) return null;

  const requestClose = async () => {
    if (closingLesson) return;
    setClosingLesson(true);
    try {
      const snapshot: LessonCloseSnapshot = {
        answered: metrics.answered,
        correct: metrics.correct,
        total: metrics.total,
        answers: answerStates,
        sectionProgress: computedSectionProgress,
        finalExam: {
          started_at: examStarted ? new Date(Date.now() - examElapsedSeconds * 1000).toISOString() : '',
          submitted_at: examSubmitted ? new Date().toISOString() : '',
          time_limit_minutes: finalExamTimeMinutes,
          time_spent_seconds: examElapsedSeconds,
          status: examSubmitted ? (examAutoSubmitted ? 'auto_submitted' : 'submitted') : examStarted ? 'in_progress' : 'not_started',
          score: finalExamScore,
          total_score: score,
          learning_process_score: learningProcessScore,
          correct_count: metrics.finalCorrect,
          total_count: metrics.finalTotal,
          unanswered_count: activeFinalQuiz.filter((question, index) => !answerStates[getQuestionKey(question, index + allInteractiveQuestions.length)]?.submitted).length,
          attempt_number: examAttemptNumber,
          security_events: examSecurityEvents,
        },
      };
      await onClose(snapshot);
    } finally {
      setClosingLesson(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="notranslate fixed inset-0 z-[12000] flex items-center justify-center p-1 sm:p-2" translate="no">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => void requestClose()} className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm" />
        <motion.div initial={{ opacity: 0, scale: 0.97, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, y: 16 }} className="notranslate relative z-10 flex h-[100dvh] w-screen max-w-none flex-col overflow-hidden rounded-none bg-white shadow-[0_40px_100px_rgba(15,23,42,0.32)] sm:h-[calc(100dvh-16px)] sm:w-[calc(100vw-16px)] sm:rounded-[22px]" translate="no" style={{ fontFamily: 'Inter, "Segoe UI", Arial, sans-serif' }}>
          <div className="lesson-viewer-header bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 px-3 py-2.5 text-white sm:px-4 sm:py-3 lg:px-6">
            <div className="flex min-h-[52px] items-center justify-between gap-2 sm:min-h-[58px] sm:gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <PlayCircle className="hidden h-4 w-4 shrink-0 text-white/85 sm:block" />
                  <div className="min-w-0">
                    <p className="truncate text-[10px] font-bold uppercase tracking-[0.12em] text-white/65 sm:hidden">{cleanText(lesson.mon_hoc || '')} • Khối {cleanText(String(lesson.khoi || '-')).replace(/^Khối\s*/i, '')}</p>
                    <h2 className="truncate text-[15px] font-black tracking-tight sm:text-lg lg:text-xl">
                      {cleanText(lesson.tieu_de || lessonTitle)}
                    </h2>
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
                {currentUserRole === 'student' && coLearningGroupSize > 1 && onManageCoLearning && !(activeStep === 'final_quiz' && examStarted) ? (
                  <button type="button" onClick={onManageCoLearning} className="hidden min-h-10 items-center gap-2 rounded-xl bg-white/15 px-3 py-2 text-xs font-black text-white ring-1 ring-white/15 hover:bg-white/20 sm:inline-flex" title="Thêm hoặc bỏ bạn học cùng">
                    <Users className="h-4 w-4" /> Nhóm {coLearningGroupSize}
                  </button>
                ) : null}
                {!(activeStep === 'final_quiz' && examStarted) ? (
                  <div className={`flex min-h-10 items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-black shadow-lg ring-1 sm:gap-2 sm:rounded-2xl sm:px-4 sm:py-2 ${lessonRemainingSeconds <= 300 ? 'bg-amber-400 text-white ring-white/30' : 'bg-white/20 text-white ring-white/20'}`}>
                    <TimerReset className="h-4 w-4 sm:h-5 sm:w-5" />
                    <span className="leading-tight">
                      <span className="hidden text-[9px] uppercase tracking-[0.14em] text-white/75 sm:block">Thời gian học</span>
                      <span className="text-sm tabular-nums sm:text-lg">{formatSeconds(lessonRemainingSeconds)}</span>
                    </span>
                  </div>
                ) : null}
                {!(activeStep === 'final_quiz' && examStarted) ? <button onClick={() => setMobileMenuOpen(true)} className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 hover:bg-white/20 xl:hidden" title="Mở cấu trúc bài học" aria-label="Mở cấu trúc bài học"><Menu className="h-5 w-5" /></button> : null}
                <button disabled={closingLesson} onClick={() => void requestClose()} className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 hover:bg-white/20 disabled:cursor-wait disabled:opacity-60" title={closingLesson ? "Đang lưu kết quả..." : "Đóng bài học"} aria-label="Đóng bài học"><X className="h-5 w-5" /></button>
              </div>
            </div>
          </div>
          <div className="grid flex-1 grid-cols-1 overflow-hidden xl:grid-cols-[300px_minmax(0,1fr)]">
            <aside className="hidden overflow-y-auto border-r border-slate-100 bg-slate-50/70 p-4 xl:block">
              <div className="rounded-[28px] bg-white p-4 shadow-sm ring-1 ring-slate-100">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Cấu trúc bài học</p>
                <div className="mt-4 space-y-2">
                  <button onClick={() => selectStep('intro')} className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition ${activeStep === 'intro' ? 'bg-indigo-600 text-white' : 'bg-slate-50 text-slate-700 hover:bg-slate-100'}`}>Tổng quan <ChevronRight className="ml-auto h-4 w-4" /></button>
                  {sections.map((section, index) => {
                    const sp = computedSectionProgress[section.section_id] || createSectionProgress(section);
                    const active = activeStep === section.section_id;
                    const locked = currentUserRole === 'student' && section.locked;
                    return (
                      <button key={section.section_id || index} disabled={locked} onClick={() => selectStep(section.section_id)} className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition ${locked ? 'cursor-not-allowed bg-slate-100 text-slate-400' : statusClasses(sp.status, active)}`}>
                        <span className="shrink-0">{locked ? <LockKeyhole className="h-4 w-4" /> : sp.status === 'completed' ? '✓' : sp.status === 'need_interaction' ? '!' : sp.status === 'viewing' ? '…' : '○'}</span>
                        <span className="line-clamp-2 flex-1">{section.title}</span>
                        <span className="ml-auto shrink-0 text-xs opacity-80">{locked ? 'chưa mở' : sp.status === 'completed' ? `${Number(sp.section_score || 0).toFixed(1)}/10` : `${sp.interactionCount}/${section.interactive_questions?.length || 0}`}</span>
                      </button>
                    );
                  })}
                  <button onClick={() => selectStep('final_quiz')} className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition ${activeStep === 'final_quiz' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}>Kiểm tra cuối bài<span className="ml-auto text-xs opacity-70">{finalQuiz.length} câu</span></button>
                  <button onClick={() => selectStep('comments')} className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition ${activeStep === 'comments' ? 'bg-fuchsia-600 text-white' : 'bg-fuchsia-50 text-fuchsia-700 hover:bg-fuchsia-100'}`}><MessageSquareText className="h-4 w-4" /> Bình luận/Câu hỏi<span className="ml-auto text-xs opacity-80">{topLevelComments.length}</span></button>
                  <button onClick={() => selectStep('result')} className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition ${activeStep === 'result' ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'}`}>Kết quả<span className="ml-auto text-xs opacity-70">{score.toFixed(1)}/10</span></button>
                </div>
              </div>
            </aside>
            <main className={`lesson-viewer-main-mobile overflow-y-auto bg-slate-50/70 p-3 transition-all sm:p-4 lg:p-5 ${lessonChatOpen && activeStep !== 'final_quiz' ? 'xl:pr-[600px]' : ''}`}>{renderActiveContent()}</main>
          </div>

          <AnimatePresence>
            {mobileMenuOpen ? (
              <>
                <motion.button
                  type="button"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  onClick={() => setMobileMenuOpen(false)}
                  className="absolute inset-0 z-40 bg-slate-950/40 backdrop-blur-[2px] xl:hidden"
                  aria-label="Đóng cấu trúc bài học"
                />
                <motion.aside
                  initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                  transition={{ type: 'spring', damping: 30, stiffness: 330 }}
                  className="lesson-mobile-drawer absolute inset-x-0 bottom-0 z-50 flex max-h-[82dvh] flex-col overflow-hidden rounded-t-[28px] bg-white shadow-[0_-18px_55px_rgba(15,23,42,0.25)] xl:hidden"
                >
                  <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-600">Cấu trúc bài học</p>
                      <p className="mt-0.5 truncate text-sm font-black text-slate-900">{activeStepLabel}</p>
                    </div>
                    <button type="button" onClick={() => setMobileMenuOpen(false)} className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600" aria-label="Đóng menu"><X className="h-5 w-5" /></button>
                  </div>
                  <div className="overflow-y-auto px-3 py-3">
                    <div className="space-y-2">
                      <button onClick={() => selectStep('intro')} className={`flex min-h-12 w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition ${activeStep === 'intro' ? 'bg-indigo-600 text-white' : 'bg-slate-50 text-slate-700'}`}>Tổng quan <ChevronRight className="ml-auto h-4 w-4" /></button>
                      {sections.map((section, index) => {
                        const sp = computedSectionProgress[section.section_id] || createSectionProgress(section);
                        const active = activeStep === section.section_id;
                        const locked = currentUserRole === 'student' && section.locked;
                        return (
                          <button key={section.section_id || index} disabled={locked} onClick={() => selectStep(section.section_id)} className={`flex min-h-12 w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition ${locked ? 'cursor-not-allowed bg-slate-100 text-slate-400' : statusClasses(sp.status, active)}`}>
                            <span className="shrink-0">{locked ? <LockKeyhole className="h-4 w-4" /> : sp.status === 'completed' ? '✓' : sp.status === 'need_interaction' ? '!' : sp.status === 'viewing' ? '…' : '○'}</span>
                            <span className="line-clamp-2 flex-1">{section.title}</span>
                            <span className="ml-auto shrink-0 text-xs opacity-80">{locked ? 'chưa mở' : sp.status === 'completed' ? `${Number(sp.section_score || 0).toFixed(1)}/10` : `${sp.interactionCount}/${section.interactive_questions?.length || 0}`}</span>
                          </button>
                        );
                      })}
                      <button onClick={() => selectStep('final_quiz')} className={`flex min-h-12 w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold ${activeStep === 'final_quiz' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700'}`}>Kiểm tra cuối bài<span className="ml-auto text-xs opacity-70">{finalQuiz.length} câu</span></button>
                      <button onClick={() => selectStep('comments')} className={`flex min-h-12 w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold ${activeStep === 'comments' ? 'bg-fuchsia-600 text-white' : 'bg-fuchsia-50 text-fuchsia-700'}`}><MessageSquareText className="h-4 w-4" /> Bình luận/Câu hỏi<span className="ml-auto text-xs opacity-80">{topLevelComments.length}</span></button>
                      <button onClick={() => selectStep('result')} className={`flex min-h-12 w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold ${activeStep === 'result' ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-700'}`}>Kết quả<span className="ml-auto text-xs opacity-70">{score.toFixed(1)}/10</span></button>
                    </div>
                  </div>
                </motion.aside>
              </>
            ) : null}
          </AnimatePresence>

          {!(activeStep === 'final_quiz' && examStarted) ? (
            <div className="lesson-mobile-nav absolute inset-x-0 bottom-0 z-30 border-t border-slate-200/80 bg-white/95 px-3 pt-2 shadow-[0_-10px_30px_rgba(15,23,42,0.08)] backdrop-blur xl:hidden">
              <div className="grid grid-cols-[1fr_1.2fr_1fr] gap-2">
                <button type="button" disabled={!previousNavigationStep} onClick={() => previousNavigationStep && selectStep(previousNavigationStep)} className="flex min-h-11 items-center justify-center gap-1 rounded-xl bg-slate-100 px-2 text-xs font-black text-slate-700 disabled:opacity-35"><ChevronLeft className="h-4 w-4" /> Trước</button>
                <button type="button" onClick={() => setMobileMenuOpen(true)} className="flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-xl bg-indigo-50 px-2 text-xs font-black text-indigo-700 ring-1 ring-indigo-100"><Menu className="h-4 w-4" /><span className="truncate">{activeStepLabel}</span></button>
                <button type="button" disabled={!nextNavigationStep} onClick={() => nextNavigationStep && selectStep(nextNavigationStep)} className="flex min-h-11 items-center justify-center gap-1 rounded-xl bg-indigo-600 px-2 text-xs font-black text-white disabled:opacity-35">Sau <ChevronRight className="h-4 w-4" /></button>
              </div>
            </div>
          ) : null}

          {activeStep !== 'final_quiz' ? (
          <div className="pointer-events-none absolute bottom-[84px] left-3 z-30 flex flex-col items-start gap-2 sm:bottom-5 sm:left-auto sm:right-5 sm:items-end sm:gap-3">
            <AnimatePresence>
              {lessonChatOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 16, x: 18, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, x: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 16, x: 18, scale: 0.96 }}
                  className="pointer-events-auto h-[min(82vh,760px)] w-[min(94vw,560px)] overflow-hidden rounded-[32px] border border-white/70 bg-white shadow-[0_34px_90px_rgba(15,23,42,0.30)] xl:w-[560px]"
                >
                  <LearningChatPanel
                    config={aiConfig}
                    lesson={lesson}
                    content={effectiveContent}
                    stage={activeStep === 'final_quiz' ? 'luyen_tap' : activeStep === 'result' ? 'tong_ket' : activeStep === 'intro' ? 'khoi_dong' : 'hinh_thanh_kien_thuc'}
                    stageLabel={currentSection?.title || (activeStep === 'final_quiz' ? 'Kiểm tra cuối bài' : activeStep === 'result' ? 'Kết quả' : activeStep === 'intro' ? 'Tổng quan' : 'Nội dung bài học')}
                    currentSection={currentSection}
                    onOpenConfig={onOpenConfig}
                    onClose={() => setLessonChatOpen(false)}
                    pendingPrompt={lessonChatPrompt}
                    isDrawer
                  />
                </motion.div>
              )}
            </AnimatePresence>
            <button
              type="button"
              onClick={() => setLessonChatOpen((prev) => !prev)}
              className="pointer-events-auto inline-flex h-12 min-w-12 items-center justify-center gap-3 rounded-full bg-gradient-to-r from-fuchsia-600 via-pink-600 to-violet-600 px-3 text-sm font-bold text-white sm:h-auto sm:min-w-0 sm:px-4 sm:py-3 shadow-[0_18px_45px_rgba(192,38,211,0.38)] transition hover:-translate-y-0.5 hover:shadow-[0_22px_55px_rgba(192,38,211,0.45)]"
            >
              {lessonChatOpen ? <X className="h-5 w-5" /> : <MessageCircleMore className="h-5 w-5" />}
              <span className="hidden sm:inline">{lessonChatOpen ? 'Đóng trợ lý AI' : 'Hỏi trợ lý AI'}</span>
              {!lessonChatOpen && <span className="hidden h-8 w-8 items-center justify-center rounded-full bg-white/20 sm:flex"><Bot className="h-4 w-4" /></span>}
            </button>
          </div>
          ) : null}
          {renderSubmitConfirmDialog()}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
