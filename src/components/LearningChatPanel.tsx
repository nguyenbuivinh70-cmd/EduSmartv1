import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { AlertCircle, Bot, KeyRound, Lightbulb, Loader2, Send, Sparkles, User, X } from 'lucide-react';
import { AIConfig, ChatMessage, Lesson, LessonContent, LessonSectionV2, LessonStageKey } from '../types';
import { chatWithGemini } from '../services/gemini';

interface PendingChatPrompt {
  id: number;
  text: string;
  displayText?: string;
}

type LearningSupportMode = 'summary' | 'explain' | 'example' | 'question' | 'answer_help' | 'general';

interface LearningChatPanelProps {
  config: AIConfig;
  lesson: Lesson;
  content: LessonContent | null;
  stage: LessonStageKey;
  stageLabel: string;
  currentSection?: LessonSectionV2 | null;
  onOpenConfig: (reason?: 'manual' | 'quota') => void;
  onClose?: () => void;
  pendingPrompt?: PendingChatPrompt | null;
  isDrawer?: boolean;
}

const STAGE_FRIENDLY_TITLE: Record<LessonStageKey, string> = {
  khoi_dong: 'Khởi động',
  hinh_thanh_kien_thuc: 'Hình thành kiến thức',
  luyen_tap: 'Luyện tập',
  van_dung: 'Vận dụng',
  tong_ket: 'Tổng kết',
};

function buildStorageKey(lessonId: string) {
  return `learning_chat_${lessonId}`;
}

function buildWelcomeMessage(lesson: Lesson, stageLabel: string, sectionTitle?: string) {
  const focus = sectionTitle ? `mục “${sectionTitle}”` : `phần ${stageLabel}`;
  return `Chào em! Mình là trợ lý học tập của bài “${lesson.tieu_de}”. Hiện em đang học ${focus}. Hãy chọn gợi ý hoặc đặt câu hỏi, mình sẽ trả lời ngắn gọn và đúng trọng tâm phần đang học.`;
}

function defaultSuggestions(lessonTitle: string, stageLabel: string, sectionTitle?: string) {
  const focus = sectionTitle || stageLabel;
  return [
    'Tóm tắt 3 ý chính',
    'Giải thích ngắn gọn',
    'Cho 1 ví dụ',
    'Gợi ý câu hỏi đang làm',
    'Tự kiểm tra 1 câu',
  ];
}

function questionTutorSuggestions() {
  return ['Gợi ý thêm', 'Dàn ý trả lời', 'Cho ví dụ minh họa', 'Kiểm tra câu trả lời của em'];
}

function compactText(value?: string, limit = 1400) {
  return String(value || '')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit);
}

function buildSectionContext(section?: LessonSectionV2 | null) {
  if (!section) return '';
  const blocks = Array.isArray(section.content_blocks)
    ? section.content_blocks.map((block, index) => `${block.title || `Ý ${index + 1}`}: ${compactText(block.text, 420)}`).filter(Boolean).join(' | ')
    : '';
  const questions = (section.interactive_questions || []).map((q, index) => `Câu ${index + 1}: ${q.question || q.sentence || ''}`).filter(Boolean).join(' | ');
  return [
    `Mục hiện tại: ${section.title}.`,
    section.summary || section.source_note ? `Ghi nhớ/tóm tắt: ${compactText(section.summary || section.source_note, 700)}.` : '',
    section.content ? `Nội dung mục: ${compactText(section.content, 1200)}.` : '',
    blocks ? `Các ý đang học: ${blocks}.` : '',
    questions ? `Câu hỏi trong mục: ${questions}.` : '',
  ].filter(Boolean).join('\n');
}


function detectSupportMode(question: string, displayText?: string): LearningSupportMode {
  const source = `${displayText || ''} ${question || ''}`.toLowerCase();
  if (/tóm tắt|tom tat|3 ý chính|3 y chinh/.test(source)) return 'summary';
  if (/giải thích|giai thich|hiểu đơn giản|hieu don gian/.test(source)) return 'explain';
  if (/ví dụ|vi du|ví dụ gần gũi|vi du gan gui/.test(source)) return 'example';
  if (/tự kiểm tra|tu kiem tra|câu hỏi tự kiểm tra|cau hoi tu kiem tra/.test(source)) return 'question';
  if (/hỏi ai về câu|hoi ai ve cau|câu tự luận|cau tu luan|gợi ý làm câu|goi y lam cau|câu hỏi hiện tại|cau hoi hien tai|nhận xét câu trả lời|nhan xet cau tra loi/.test(source)) return 'answer_help';
  return 'general';
}

function getSupportLoadingText(mode: LearningSupportMode) {
  if (mode === 'summary') return 'Đang tóm tắt đúng ý của nội dung này...';
  if (mode === 'explain') return 'Đang giải thích ngắn gọn theo nội dung này...';
  if (mode === 'example') return 'Đang tạo ví dụ gần gũi, đúng trọng tâm...';
  if (mode === 'question') return 'Đang tạo câu hỏi tự kiểm tra ngắn gọn...';
  if (mode === 'answer_help') return 'Đang phân tích câu hỏi và tạo gợi ý đủ ý...';
  return 'Trợ lý đang suy nghĩ theo nội dung đang học...';
}

function isWeakSupportReply(reply: string, mode: LearningSupportMode) {
  const text = String(reply || '').replace(/\*\*/g, '').trim();
  if (!text || text.length < 28) return true;
  if (/(:\s*|\b\d+[.)]\s*)$/.test(text)) return true;
  if (/^\s*(ví dụ|vi du|3 ý chính|3 y chinh|câu hỏi|cau hoi)\s*[:：]?\s*$/i.test(text)) return true;
  if (/\n\s*\d+[.)]\s*$/m.test(text)) return true;

  const nonEmptyLines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  if (mode === 'summary') {
    const bullets = nonEmptyLines.filter((line) => /^[-•*]|^\d+[.)]/.test(line));
    return bullets.length < 2 && text.length < 90;
  }
  if (mode === 'explain') return !/hiểu đơn giản|hieu don gian|em cần nhớ|em can nho/i.test(text) && text.length < 120;
  if (mode === 'example') return !/ví dụ|vi du|chẳng hạn|chẳng hạn như|ví dụ gần gũi|vì sao|vi sao/i.test(text) || text.length < 70;
  if (mode === 'question') return !/câu hỏi|cau hoi|gợi ý|goi y/i.test(text) || text.length < 45;
  if (mode === 'answer_help') {
    const endsWell = /[.!?…]$/.test(text.trim());
    const hasUnderstanding = /cách hiểu|cau hoi yeu cau|câu hỏi yêu cầu|đang hỏi về|dang hoi ve/i.test(text);
    const hasGuidance = /ý cần nêu|y can neu|dàn ý|dan y|gợi ý|goi y|cách suy luận|cach suy luan|cần bổ sung|can bo sung/i.test(text);
    const hasExampleOrReview = /ví dụ|vi du|mẫu câu|mau cau|nhận xét|nhan xet|câu trả lời của em|cau tra loi cua em/i.test(text);
    const bullets = nonEmptyLines.filter((line) => /^[-•*]|^\d+[.)]/.test(line));
    const qualityParts = [hasUnderstanding, hasGuidance, hasExampleOrReview].filter(Boolean).length;
    return !endsWell || text.length < 150 || qualityParts < 2 || (bullets.length === 1 && text.length < 180);
  }
  return false;
}

function buildSupportRetryPrompt(originalPrompt: string, weakReply: string, mode: LearningSupportMode) {
  const modeRule: Record<LearningSupportMode, string> = {
    summary: 'Trả lời lại đúng mẫu: "3 ý chính:" rồi 3 gạch đầu dòng ngắn. Mỗi ý dưới 14 từ.',
    explain: 'Trả lời lại đúng mẫu: "Hiểu đơn giản:" 2 câu ngắn, sau đó "Em cần nhớ:" 1 câu.',
    example: 'Trả lời lại đúng mẫu: "Ví dụ gần gũi:" 1 ví dụ cụ thể, sau đó "Vì sao đúng:" 1 câu. Không liệt kê nhiều ví dụ.',
    question: 'Trả lời lại đúng mẫu: "Câu hỏi tự kiểm tra:" 1 câu hỏi ngắn, sau đó "Gợi ý:" 1 gợi ý. Chưa cho đáp án.',
    answer_help: 'Trả lời lại đúng mẫu phù hợp câu hỏi: nếu học sinh cần gợi ý thì gồm "Cách hiểu câu hỏi:", "Ý cần nêu:" 2-3 gạch đầu dòng, "Ví dụ minh họa:" 1 ví dụ ngắn; nếu học sinh đã nhập câu trả lời thì gồm "Nhận xét:", "Cần bổ sung:", "Gợi ý viết rõ hơn:". Phải đủ ý và kết thúc trọn câu.',
    general: 'Trả lời lại ngắn gọn, đủ ý, bám sát nội dung bắt buộc.',
  };
  return `${originalPrompt}\n\nCâu trả lời trước chưa đạt yêu cầu hoặc bị dang dở: "${String(weakReply || '').slice(0, 600)}".\n${modeRule[mode]}\nBắt buộc trả lời hoàn chỉnh, không để dòng trống như "1.", không giải thích ngoài nội dung đang học.`;
}

function buildStrictLearningPrompt(rawQuestion: string, lessonTitle: string, stageLabel: string, currentSection?: LessonSectionV2 | null) {
  const question = String(rawQuestion || '').trim();
  const alreadyContextual = /Bài học:|Mục đang học:|Nội dung cần hỗ trợ:|Ngữ cảnh mục:|Câu hỏi hiện tại:/i.test(question);
  if (alreadyContextual) {
    return `${question}

Quy tắc bắt buộc:
- Bỏ qua lịch sử trò chuyện cũ; chỉ dùng đúng nội dung/câu hỏi được nêu trong yêu cầu hiện tại.
- Trả lời ngắn gọn nhưng PHẢI đủ ý, trọn câu, không dừng giữa chừng.
- Với câu hỏi/bài tập tự luận: nếu học sinh chưa trả lời, trình bày "Cách hiểu câu hỏi:", "Ý cần nêu:" 2-3 gạch đầu dòng, "Ví dụ minh họa:" hoặc "Mẫu câu gợi ý:" nếu phù hợp.
- Nếu có câu trả lời hiện tại của học sinh, phải bắt đầu bằng "Nhận xét:" rồi nêu "Cần bổ sung:" và "Gợi ý viết rõ hơn:".
- Với trắc nghiệm/đúng sai/điền khuyết: nếu học sinh chưa chọn/chưa điền thì chỉ hướng dẫn cách suy luận, chưa nêu đáp án trực tiếp.
- Nếu yêu cầu là ví dụ thì chỉ đưa 1 ví dụ nhưng phải hoàn chỉnh; nếu là tự kiểm tra thì chỉ đặt 1 câu hỏi kèm gợi ý.
- Không kéo sang nội dung khác; không trình bày dài dòng; không để dòng trống như "1.".`;
  }
  return [
    `Bài học: ${lessonTitle}.`,
    `Phần đang học: ${stageLabel}.`,
    buildSectionContext(currentSection),
    `Yêu cầu của học sinh: ${question}.`,
    'Bỏ qua lịch sử trò chuyện cũ. Trả lời đúng trọng tâm yêu cầu trên, bám sát mục hiện tại. Trả lời ngắn gọn nhưng phải đủ ý và trọn câu; nếu là ví dụ thì chỉ cho 1 ví dụ hoàn chỉnh; nếu là tóm tắt thì đúng 3 ý; nếu là tự kiểm tra thì chỉ đặt 1 câu hỏi kèm gợi ý; không lan man ngoài bài.',
  ].filter(Boolean).join('\n');
}


function renderChatMessageContent(text: string) {
  const cleaned = String(text || '').replace(/\*\*/g, '').trim();
  const blocks = cleaned.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);

  return (
    <div className="space-y-3">
      {blocks.map((block, index) => {
        const lines = block.split(/\n+/).map((line) => line.trim()).filter(Boolean);
        const isList = lines.length > 1 && lines.some((line) => /^(?:[-•*]|\d+[.)])\s+/.test(line));
        if (isList) {
          return (
            <ul key={index} className="space-y-2">
              {lines.map((line, lineIndex) => (
                <li key={lineIndex} className="flex gap-2">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-60" />
                  <span>{line.replace(/^(?:[-•*]|\d+[.)])\s+/, '')}</span>
                </li>
              ))}
            </ul>
          );
        }
        const looksLikeTitle = block.length < 80 && /[:：]$/.test(block);
        return looksLikeTitle ? <p key={index} className="font-black text-slate-900">{block}</p> : <p key={index}>{block}</p>;
      })}
    </div>
  );
}

export default function LearningChatPanel({
  config,
  lesson,
  content,
  stage,
  stageLabel,
  currentSection,
  onOpenConfig,
  onClose,
  pendingPrompt,
  isDrawer = false,
}: LearningChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState('Trợ lý đang suy nghĩ theo nội dung đang học...');
  const [activeTutorContext, setActiveTutorContext] = useState('');
  const [lastQuestionSupportPrompt, setLastQuestionSupportPrompt] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const processedPromptRef = useRef<number | null>(null);

  const quickSuggestions = useMemo(() => {
    if (lastQuestionSupportPrompt) return questionTutorSuggestions();
    const fromLesson = content?.tro_ly_ai?.[stage] || [];
    return fromLesson.length > 0 ? fromLesson : defaultSuggestions(lesson.tieu_de, STAGE_FRIENDLY_TITLE[stage], currentSection?.title);
  }, [content, stage, lesson.tieu_de, currentSection?.title, lastQuestionSupportPrompt]);

  const handleSuggestionClick = (suggestion: string) => {
    if (lastQuestionSupportPrompt) {
      void sendMessage(`${lastQuestionSupportPrompt}\n\nYêu cầu bổ sung từ học sinh: ${suggestion}. Hãy tiếp tục hỗ trợ đúng câu hỏi trên, không đổi sang câu hỏi khác.`, suggestion);
      return;
    }
    void sendMessage(suggestion);
  };

  useEffect(() => {
    const key = buildStorageKey(lesson.lesson_id);
    const savedRaw = localStorage.getItem(key);
    if (savedRaw) {
      try {
        const saved = JSON.parse(savedRaw) as ChatMessage[];
        if (Array.isArray(saved) && saved.length > 0) {
          setMessages(saved);
          return;
        }
      } catch {
        // ignore invalid history
      }
    }
    setMessages([{ role: 'model', text: buildWelcomeMessage(lesson, stageLabel, currentSection?.title) }]);
  }, [lesson.lesson_id, lesson.tieu_de, currentSection?.title]);

  useEffect(() => {
    if (!messages.length) return;
    localStorage.setItem(buildStorageKey(lesson.lesson_id), JSON.stringify(messages));
  }, [messages, lesson.lesson_id]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const sendMessage = async (rawText?: string, displayText?: string) => {
    const question = String(rawText ?? input).trim();
    const visibleQuestion = String(displayText || rawText || input).trim();
    if (!question || isLoading) return;
    const supportMode = detectSupportMode(question, visibleQuestion);
    const supportLoadingText = getSupportLoadingText(supportMode);
    if (supportMode === 'answer_help') {
      setActiveTutorContext(visibleQuestion || 'Câu hỏi đang làm');
      setLastQuestionSupportPrompt(question);
    } else if (supportMode !== 'general') {
      setActiveTutorContext(visibleQuestion || 'Nội dung đang học');
    }

    if (!config.apiKey) {
      setMessages((prev) => [
        ...prev,
        { role: 'user', text: visibleQuestion || question },
        { role: 'model', text: 'Em chưa cấu hình API Key. Hãy nhấn “Cấu hình API Key ngay” trong khung trợ lý để thiết lập mà không cần đóng bài học.' },
      ]);
      setInput('');
      return;
    }

    const nextHistory = [...messages, { role: 'user', text: visibleQuestion || question } as ChatMessage];
    setMessages(nextHistory);
    setInput('');
    setLoadingLabel(supportLoadingText);
    setIsLoading(true);

    try {
      const strictQuestion = buildStrictLearningPrompt(question, lesson.tieu_de, currentSection?.title || STAGE_FRIENDLY_TITLE[stage], currentSection);
      const isContextCommand = Boolean(displayText && displayText !== question);
      let reply = await chatWithGemini(
        config.apiKey,
        config.model,
        [],
        strictQuestion,
        isContextCommand ? null : content,
        stage,
        lesson.tieu_de,
        {
          current_section: !isContextCommand && currentSection ? {
            title: currentSection.title,
            content: currentSection.content,
            summary: currentSection.summary || currentSection.source_note || '',
            examples: currentSection.examples || [],
            questions: (currentSection.interactive_questions || []).map((q) => q.question || q.sentence).filter(Boolean),
          } : null,
          current_request_mode: isContextCommand ? 'strict_current_block_or_question_only' : 'free_question_in_current_section',
          support_mode: supportMode,
          original_question: question,
          rule: 'Ưu tiên tuyệt đối yêu cầu hiện tại. Không dùng lịch sử chat cũ. Không dùng phần khác của bài nếu prompt đã có nội dung bắt buộc. Trả lời ngắn gọn nhưng phải đủ ý, kết thúc trọn câu, không để dòng trống như "1." hoặc câu cụt.',
          stageContent: isContextCommand ? '' : JSON.stringify(content?.[stage as keyof LessonContent] || '').slice(0, 1000),
          suggestions: quickSuggestions,
        },
      );

      if ((isContextCommand || supportMode === 'answer_help') && isWeakSupportReply(reply, supportMode)) {
        const retryPrompt = buildSupportRetryPrompt(strictQuestion, reply, supportMode);
        reply = await chatWithGemini(
          config.apiKey,
          config.model,
          [],
          retryPrompt,
          null,
          stage,
          lesson.tieu_de,
          {
            current_request_mode: 'strict_retry_current_block_or_question_only',
            support_mode: supportMode,
            original_question: question,
            weak_reply: reply,
            rule: 'Câu trả lời trước bị thiếu hoặc dang dở. Trả lời lại hoàn chỉnh, đúng mẫu, ngắn gọn, không lan man.',
          },
        );
      }

      setMessages((prev) => [...prev, { role: 'model', text: reply }]);
    } catch (error) {
      const raw = String((error as any)?.message || error || '');
      const quotaError = /429|quota|resource_exhausted|rate/i.test(raw);
      setMessages((prev) => [
        ...prev,
        {
          role: 'model',
          text: quotaError
            ? 'API Key hiện tại đã hết hạn mức hoặc bị chặn tạm thời. Em hãy đổi API Key hoặc model rồi thử lại.'
            : 'Mình đang gặp lỗi kết nối trợ lý AI. Em kiểm tra lại API Key hoặc thử lại sau nhé.',
        },
      ]);
      if (quotaError) onOpenConfig('quota');
    } finally {
      setIsLoading(false);
      setLoadingLabel('Trợ lý đang suy nghĩ theo nội dung đang học...');
    }
  };

  useEffect(() => {
    if (!pendingPrompt || processedPromptRef.current === pendingPrompt.id || isLoading) return;
    processedPromptRef.current = pendingPrompt.id;
    void sendMessage(pendingPrompt.text, pendingPrompt.displayText);
  }, [pendingPrompt, isLoading]);

  return (
    <div className={`flex h-full min-h-0 flex-col bg-white ${isDrawer ? 'rounded-[32px] border border-white/80 shadow-2xl' : 'border-l border-slate-100'}`}>
      <div className="flex items-center justify-between border-b border-white/10 bg-gradient-to-r from-fuchsia-600 via-pink-600 to-violet-600 px-5 py-4 text-white">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/15">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-bold">Hỗ trợ học tập</p>
            <p className="text-xs text-white/85">{lesson.tieu_de} • {currentSection?.title || stageLabel}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setMessages([{ role: 'model', text: buildWelcomeMessage(lesson, stageLabel, currentSection?.title) }]);
              setActiveTutorContext('');
              setLastQuestionSupportPrompt('');
            }}
            className="rounded-full px-3 py-1.5 text-xs font-bold text-white/80 hover:bg-white/10 hover:text-white"
          >
            Xóa chat
          </button>
          {onClose ? (
            <button onClick={onClose} className="rounded-full p-2 hover:bg-white/10">
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="border-b border-amber-100 bg-amber-50/80 px-5 py-3 text-xs text-amber-800">
        <div className="flex items-start gap-2">
          <Lightbulb className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <p>Trợ lý chỉ hỗ trợ theo bài học hiện tại và trả lời ngắn gọn, đúng trọng tâm.</p>
        </div>
      </div>

      {activeTutorContext ? (
        <div className="border-b border-indigo-100 bg-indigo-50/80 px-5 py-3 text-xs text-indigo-800">
          <div className="flex items-start gap-2">
            <Sparkles className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <div>
              <p className="font-black">Đang hỗ trợ theo ngữ cảnh hiện tại</p>
              <p className="mt-0.5 line-clamp-2">{activeTutorContext}</p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="border-b border-slate-100 bg-slate-50/80 px-5 py-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{lastQuestionSupportPrompt ? 'Gợi ý nhanh cho câu hỏi đang làm' : 'Gợi ý nhanh theo bài học'}</p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {quickSuggestions.map((suggestion) => (
            <button
              key={suggestion}
              onClick={() => handleSuggestionClick(suggestion)}
              className="shrink-0 rounded-2xl border border-fuchsia-100 bg-white px-3.5 py-2 text-left text-xs font-semibold text-fuchsia-700 shadow-sm hover:bg-fuchsia-50"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-5 overflow-y-auto bg-gradient-to-b from-white via-slate-50/50 to-white px-5 py-5">
        {messages.map((message, index) => (
          <motion.div
            key={`${message.role}-${index}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`flex max-w-[96%] gap-3 ${message.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
              <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${message.role === 'user' ? 'bg-indigo-100 text-indigo-700' : 'bg-fuchsia-100 text-fuchsia-700'}`}>
                {message.role === 'user' ? <User className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
              </div>
              <div className={`rounded-[24px] px-4 py-3 text-sm leading-7 shadow-sm ${message.role === 'user' ? 'rounded-tr-none bg-indigo-600 text-white' : 'rounded-tl-none border border-slate-200 bg-white text-slate-700'}`}>
                {renderChatMessageContent(message.text)}
              </div>
            </div>
          </motion.div>
        ))}
        {isLoading ? (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex justify-start">
            <div className="flex max-w-[96%] gap-3">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-fuchsia-100 text-fuchsia-700">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
              <div className="min-w-[220px] rounded-[24px] rounded-tl-none border border-fuchsia-100 bg-white px-4 py-3 text-sm leading-7 text-slate-600 shadow-sm">
                <div className="mb-2 flex items-center gap-2 font-semibold text-fuchsia-700">
                  <Sparkles className="h-4 w-4" /> {loadingLabel}
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-fuchsia-50">
                  <div className="h-full w-1/2 animate-pulse rounded-full bg-gradient-to-r from-fuchsia-500 to-violet-500" />
                </div>
                <p className="mt-2 text-xs text-slate-500">Ưu tiên đúng khối nội dung vừa chọn, không dùng lịch sử chat cũ.</p>
              </div>
            </div>
          </motion.div>
        ) : null}
      </div>

      {!config.apiKey ? (
        <div className="flex flex-col gap-2 border-t border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>Chưa cấu hình API Key. Bài học hiện tại vẫn được giữ nguyên khi mở cấu hình.</span>
          </div>
          <button type="button" onClick={() => onOpenConfig('manual')} className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 font-black text-white sm:ml-auto">
            <KeyRound className="h-3.5 w-3.5" /> Cấu hình API Key ngay
          </button>
        </div>
      ) : null}

      <div className="border-t border-slate-100 bg-white p-5">
        <div className="flex items-end gap-3 rounded-[26px] border border-slate-200 bg-slate-50 px-4 py-3 shadow-inner focus-within:ring-2 focus-within:ring-fuchsia-100">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void sendMessage();
              }
            }}
            rows={1}
            placeholder={`Hỏi trợ lý về ${currentSection?.title ? 'mục đang học' : 'phần ' + stageLabel.toLowerCase()}...`}
            className="max-h-40 min-h-[52px] flex-1 resize-none bg-transparent py-2 text-sm leading-6 outline-none"
          />
          <button
            onClick={() => void sendMessage()}
            disabled={!input.trim() || isLoading}
            className="rounded-2xl bg-gradient-to-r from-fuchsia-600 to-violet-600 p-3 text-white disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
