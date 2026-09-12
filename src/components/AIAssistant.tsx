import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertCircle,
  Bot,
  KeyRound,
  LoaderCircle,
  MessageCircleMore,
  Mic,
  MicOff,
  MessagesSquare,
  Send,
  Sparkles,
  Tags,
  User,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { AIConfig, ChatMessage, LessonContent, LessonStageKey } from '../types';
import { chatWithGemini, synthesizeTeacherSpeech } from '../services/gemini';

interface LessonAssistantContext {
  lessonId?: string;
  title?: string;
  summary?: string;
  content?: LessonContent | null;
  stage?: LessonStageKey;
  stageLabel?: string;
  suggestions?: string[];
}

interface PendingChatPrompt {
  id: number;
  text: string;
}

interface AIAssistantProps {
  config: AIConfig;
  onOpenConfig: (reason?: 'manual' | 'quota') => void;
  lessonContext?: LessonAssistantContext | null;
  isLessonOpen?: boolean;
  pendingPrompt?: PendingChatPrompt | null;
}

type RecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives?: number;
  start: () => void;
  stop: () => void;
  onstart: null | (() => void);
  onend: null | (() => void);
  onerror: null | ((event: { error?: string }) => void);
  onresult: null | ((event: any) => void);
};

type ChatTab = 'suggestions' | 'chat';
type AssistantState = 'idle' | 'thinking' | 'generatingVoice' | 'speaking';

const GENERAL_KEY = '__general__';
const AUTO_SPEAK_KEY = 'lesson_ai_auto_speak';

const DEFAULT_SUGGESTIONS = [
  'Tóm tắt nhanh phần này giúp em',
  'Giải thích thật dễ hiểu như giáo viên',
  'Cho em ví dụ gần gũi với thực tế',
  'Nhắc lại ý chính em cần nhớ',
];

const STAGE_HINTS: Partial<Record<LessonStageKey, string[]>> = {
  khoi_dong: ['Giải thích tình huống mở bài', 'Cho em ví dụ gần gũi', 'Em cần chú ý điều gì trước khi học?'],
  hinh_thanh_kien_thuc: ['Giải thích phần này như giáo viên', 'Tóm tắt ý chính giúp em', 'Cho em ví dụ thực tế'],
  luyen_tap: ['Gợi ý làm câu này', 'Vì sao đáp án này đúng?', 'Phân tích các đáp án sai'],
  van_dung: ['Hướng dẫn em làm phần vận dụng', 'Cho em cách trình bày bài làm', 'Liên hệ thực tế giúp em'],
  tong_ket: ['Tóm tắt toàn bài', 'Nhắc lại ghi nhớ trọng tâm', 'Những lỗi em dễ sai là gì?'],
};

function buildWelcomeMessage(lessonContext?: LessonAssistantContext | null) {
  if (!lessonContext?.title) {
    return 'Chào em! Hãy mở một bài học để mình hỗ trợ theo đúng tiến trình đang học.';
  }
  return `Mình đang hỗ trợ bài “${lessonContext.title}”. Hiện em đang ở phần ${lessonContext.stageLabel || 'đang học'}. Em có thể chọn gợi ý nhanh, hỏi bằng giọng nói hoặc nhập câu hỏi để mình giải thích như giáo viên.`;
}

function cleanSpeechText(text: string) {
  return String(text || '')
    .replace(/[*#`>_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatChatText(text: string) {
  const source = String(text || '');
  return source
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*[*•·▪◦]+\s*/gm, '• ')
    .replace(/^\s*-\s+/gm, '• ')
    .replace(/^\s*\d+\.\s+/gm, (match) => match.trim() + ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function safeWindow() {
  return typeof window !== 'undefined' ? window : null;
}

function statusLabel(state: AssistantState) {
  switch (state) {
    case 'thinking':
      return 'AI đang soạn phần giảng bài...';
    case 'generatingVoice':
      return 'AI đang tạo giọng đọc bài giảng...';
    case 'speaking':
      return 'AI đang đọc bài giảng...';
    default:
      return '';
  }
}

export default function AIAssistant({
  config,
  onOpenConfig,
  lessonContext,
  isLessonOpen = false,
  pendingPrompt,
}: AIAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ChatTab>('suggestions');
  const [input, setInput] = useState('');
  const [messageBuckets, setMessageBuckets] = useState<Record<string, ChatMessage[]>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [assistantState, setAssistantState] = useState<AssistantState>('idle');
  const [voiceNotice, setVoiceNotice] = useState('');
  const [autoSpeak, setAutoSpeak] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(AUTO_SPEAK_KEY) === '1';
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<RecognitionLike | null>(null);
  const processedPromptRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  const contextKey = lessonContext?.lessonId || GENERAL_KEY;
  const isActive = Boolean(isLessonOpen && lessonContext?.lessonId);

  const messages = messageBuckets[contextKey] || [{ role: 'model', text: buildWelcomeMessage(lessonContext) }];
  const latestModelMessage = [...messages].reverse().find((message) => message.role === 'model')?.text || '';

  const lessonSuggestions = useMemo(() => {
    const stageSuggestions = lessonContext?.stage ? STAGE_HINTS[lessonContext.stage] || [] : [];
    const explicitSuggestions = lessonContext?.suggestions?.filter(Boolean) || [];
    const merged = [...explicitSuggestions, ...stageSuggestions];
    return Array.from(new Set(merged.length ? merged : DEFAULT_SUGGESTIONS)).slice(0, 8);
  }, [lessonContext]);

  const keywordSuggestions = useMemo(() => {
    const keywords = lessonContext?.content?.metadata?.tu_khoa || [];
    return keywords
      .filter(Boolean)
      .slice(0, 8)
      .map((keyword) => `Giải thích rõ từ khóa “${keyword}” trong bài này`);
  }, [lessonContext?.content?.metadata?.tu_khoa]);

  useEffect(() => {
    if (!isActive) {
      setIsOpen(false);
      setInput('');
      setVoiceNotice('');
      setActiveTab('suggestions');
      stopAudioPlayback();
      return;
    }

    setMessageBuckets((prev) => {
      if (prev[contextKey]?.length) return prev;
      return {
        ...prev,
        [contextKey]: [{ role: 'model', text: buildWelcomeMessage(lessonContext) }],
      };
    });
  }, [contextKey, isActive, lessonContext?.title]);

  useEffect(() => {
    if (!isActive) return;
    setIsOpen(false);
    setActiveTab('suggestions');
    setVoiceNotice('');
    processedPromptRef.current = null;
    stopAudioPlayback();
  }, [lessonContext?.lessonId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(AUTO_SPEAK_KEY, autoSpeak ? '1' : '0');
  }, [autoSpeak]);

  useEffect(() => {
    if (!isActive) return;
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;
    const id = requestAnimationFrame(() => {
      scrollEl.scrollTop = scrollEl.scrollHeight;
    });
    return () => cancelAnimationFrame(id);
  }, [messages, assistantState, isOpen, isActive, activeTab]);

  useEffect(() => {
    const w = safeWindow();
    if (!w || recognitionRef.current) return;

    const RecognitionCtor = (w as any).SpeechRecognition || (w as any).webkitSpeechRecognition;
    if (!RecognitionCtor) return;

    const recognition: RecognitionLike = new RecognitionCtor();
    recognition.lang = 'vi-VN';
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = (event) => {
      setIsListening(false);
      const error = String(event?.error || '').toLowerCase();
      if (error.includes('not-allowed') || error.includes('service-not-allowed')) {
        setVoiceNotice('Trình duyệt chưa được cấp quyền micro. Em hãy cho phép dùng micro rồi thử lại.');
      }
    };
    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results || [])
        .map((result: any) => String(result?.[0]?.transcript || '').trim())
        .join(' ')
        .trim();
      setInput(transcript);
      setActiveTab('chat');
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.stop();
    };
  }, []);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      stopAudioPlayback();
    };
  }, []);

  useEffect(() => {
    if (!pendingPrompt || !isActive || processedPromptRef.current === pendingPrompt.id || isLoading) return;
    processedPromptRef.current = pendingPrompt.id;
    setIsOpen(true);
    setActiveTab('chat');
    void handleSend(pendingPrompt.text);
  }, [pendingPrompt, isActive, isLoading]);

  const appendMessages = (key: string, nextMessages: ChatMessage[]) => {
    setMessageBuckets((prev) => ({
      ...prev,
      [key]: nextMessages,
    }));
  };

  function stopAudioPlayback() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    setAssistantState((prev) => (prev === 'thinking' ? prev : 'idle'));
  }

  const playAIReading = async (text: string) => {
    if (!text.trim()) return;
    if (!config.apiKey) {
      setVoiceNotice('Chưa có API Key nên chưa thể dùng giọng đọc AI. Hãy cấu hình ngay trong khung trợ lý để tiếp tục.');
      return;
    }

    setVoiceNotice('');
    stopAudioPlayback();
    setAssistantState('generatingVoice');

    try {
      const audioBlob = await synthesizeTeacherSpeech(config.apiKey, cleanSpeechText(text));
      const objectUrl = URL.createObjectURL(audioBlob);
      audioUrlRef.current = objectUrl;
      const audio = new Audio(objectUrl);
      audioRef.current = audio;
      audio.onended = () => stopAudioPlayback();
      audio.onerror = () => {
        stopAudioPlayback();
        setVoiceNotice('Không phát được giọng đọc AI cho câu trả lời này.');
      };
      setAssistantState('speaking');
      await audio.play();
    } catch (error) {
      stopAudioPlayback();
      const raw = String((error as any)?.message || error || '');
      const quotaError = /429|quota|resource_exhausted|rate|limit/i.test(raw);
      setVoiceNotice(
        quotaError
          ? 'API đọc giọng AI đã hết hạn mức hoặc bị chặn tạm thời. Hãy đổi API Key hoặc thử lại sau.'
          : 'Đã có lỗi khi tạo giọng đọc AI. Nội dung vẫn hiển thị đầy đủ trong khung chat.',
      );
      if (quotaError) onOpenConfig('quota');
    }
  };

  const handleSend = async (messageOverride?: string) => {
    const question = (messageOverride ?? input).trim();
    if (!question || isLoading || !isActive) return;

    const currentMessages = messageBuckets[contextKey] || [{ role: 'model', text: buildWelcomeMessage(lessonContext) }];

    if (!config.apiKey) {
      appendMessages(contextKey, [
        ...currentMessages,
        { role: 'user', text: question },
        { role: 'model', text: 'Bạn chưa cấu hình API Key. Hãy dùng nút “Cấu hình API Key ngay” trong khung trợ lý; cửa sổ hiện tại sẽ được giữ nguyên.' },
      ]);
      setInput('');
      setActiveTab('chat');
      return;
    }

    stopAudioPlayback();
    setInput('');
    setActiveTab('chat');
    const history = [...currentMessages, { role: 'user', text: question } as ChatMessage];
    appendMessages(contextKey, history);
    setIsLoading(true);
    setAssistantState('thinking');
    setVoiceNotice('');

    try {
      const reply = await chatWithGemini(
        config.apiKey,
        config.model,
        currentMessages,
        question,
        lessonContext?.content || null,
        lessonContext?.stage,
        lessonContext?.title,
      );
      const nextMessages = [...history, { role: 'model', text: reply }];
      appendMessages(contextKey, nextMessages);
      setAssistantState('idle');
      if (autoSpeak) {
        await playAIReading(reply);
      }
    } catch (error) {
      const raw = String((error as any)?.message || error || '');
      const quotaError = /429|quota|resource_exhausted|rate|limit/i.test(raw);
      const reply = quotaError
        ? 'API Key hiện tại đã hết hạn mức hoặc bị chặn tạm thời. Hãy đổi API Key hoặc chuyển model rồi thử lại.'
        : 'Đã có lỗi khi kết nối tới trợ lý AI. Bạn kiểm tra lại API Key, model hoặc thử lại sau.';
      appendMessages(contextKey, [...history, { role: 'model', text: reply }]);
      setAssistantState('idle');
      if (quotaError) onOpenConfig('quota');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleListening = () => {
    if (!recognitionRef.current) {
      setVoiceNotice('Thiết bị hoặc trình duyệt hiện tại chưa hỗ trợ nhập giọng nói. Em vẫn có thể gõ câu hỏi vào ô chat.');
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      return;
    }

    setActiveTab('chat');
    setVoiceNotice('');
    try {
      recognitionRef.current.start();
    } catch {
      recognitionRef.current.stop();
      recognitionRef.current.start();
    }
  };

  const handleSuggestionClick = (prompt: string) => {
    setIsOpen(true);
    setActiveTab('chat');
    void handleSend(prompt);
  };

  if (isLessonOpen || !isActive) return null;

  return (
    <>
      <div className="fixed bottom-5 right-5 z-[13000] flex flex-col items-end gap-2">
        {!isOpen && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-full bg-white px-4 py-2 text-xs font-semibold text-fuchsia-700 shadow-lg ring-1 ring-slate-200">
            Hỗ trợ học tập
          </motion.div>
        )}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.96 }}
          onClick={() => setIsOpen((prev) => !prev)}
          className="relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-fuchsia-600 via-pink-600 to-violet-600 text-white shadow-[0_20px_40px_rgba(192,38,211,0.35)]"
          aria-label={isOpen ? 'Đóng trợ lý học tập' : 'Mở trợ lý học tập'}
        >
          {isOpen ? <X className="h-7 w-7" /> : <MessageCircleMore className="h-7 w-7" />}
          {!isOpen && <span className="absolute right-1.5 top-1.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-400" />}
        </motion.button>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
            className="fixed bottom-24 right-4 top-20 z-[13001] flex w-[min(96vw,420px)] flex-col overflow-hidden rounded-[30px] border border-white/60 bg-white shadow-[0_35px_90px_rgba(15,23,42,0.24)]"
          >
            <div className="bg-gradient-to-r from-rose-600 via-fuchsia-600 to-violet-600 px-5 py-4 text-white">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-md">
                    <Sparkles className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="font-bold">Hỗ trợ học tập</h3>
                    <p className="mt-1 text-xs text-white/85">
                      {lessonContext?.title ? `${lessonContext.title}${lessonContext.stageLabel ? ` • ${lessonContext.stageLabel}` : ''}` : 'Sẵn sàng giảng bài, giải thích và ôn tập'}
                    </p>
                  </div>
                </div>
                <button onClick={() => setIsOpen(false)} className="rounded-full p-2 hover:bg-white/10">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="border-b border-slate-100 bg-slate-50 px-3 py-2">
              <div className="grid grid-cols-2 gap-2 rounded-2xl bg-white p-1 ring-1 ring-slate-200">
                <button
                  type="button"
                  onClick={() => setActiveTab('suggestions')}
                  className={`inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition ${activeTab === 'suggestions' ? 'bg-fuchsia-600 text-white shadow-lg shadow-fuchsia-600/20' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                  <Tags className="h-4 w-4" /> Gợi ý học
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('chat')}
                  className={`inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition ${activeTab === 'chat' ? 'bg-fuchsia-600 text-white shadow-lg shadow-fuchsia-600/20' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                  <MessagesSquare className="h-4 w-4" /> Học cùng AI
                </button>
              </div>
            </div>

            {!config.apiKey ? (
              <div className="flex flex-col gap-2 border-b border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800 sm:flex-row sm:items-center">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>Chưa cấu hình API Key. Trợ lý sẽ giữ nguyên nội dung đang mở khi bạn cấu hình.</span>
                </div>
                <button type="button" onClick={() => onOpenConfig('manual')} className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 font-black text-white sm:ml-auto">
                  <KeyRound className="h-3.5 w-3.5" /> Cấu hình API Key ngay
                </button>
              </div>
            ) : null}

            {voiceNotice ? (
              <div className="flex items-center gap-2 border-b border-amber-100 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-700">
                <AlertCircle className="h-4 w-4" /> {voiceNotice}
              </div>
            ) : null}

            {activeTab === 'suggestions' ? (
              <div className="flex min-h-0 flex-1 flex-col bg-slate-50/80">
                <div className="border-b border-slate-100 bg-white px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Chọn nhanh để hỏi AI</p>
                  
                </div>
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
                  {keywordSuggestions.length > 0 && (
                    <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900">
                        <Tags className="h-4 w-4 text-fuchsia-600" /> Từ khóa cần hỏi
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {keywordSuggestions.map((item) => (
                          <button
                            key={item}
                            type="button"
                            onClick={() => handleSuggestionClick(item)}
                            className="rounded-2xl border border-fuchsia-100 bg-fuchsia-50 px-3 py-2 text-left text-xs font-semibold text-fuchsia-700 transition hover:bg-fuchsia-100"
                          >
                            {item}
                          </button>
                        ))}
                      </div>
                    </section>
                  )}

                  <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900">
                      <Sparkles className="h-4 w-4 text-violet-600" /> Câu hỏi gợi ý theo bài học
                    </div>
                    <div className="space-y-2">
                      {lessonSuggestions.map((item) => (
                        <button
                          key={item}
                          type="button"
                          onClick={() => handleSuggestionClick(item)}
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-left text-sm font-medium text-slate-700 transition hover:border-fuchsia-200 hover:bg-fuchsia-50 hover:text-fuchsia-700"
                        >
                          {item}
                        </button>
                      ))}
                    </div>
                  </section>
                </div>
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col bg-slate-50/80">
                <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
                  {messages.map((msg, index) => (
                    <div key={`${contextKey}-${msg.role}-${index}`} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`flex max-w-[94%] gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                        <div className={`mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${msg.role === 'user' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'}`}>
                          {msg.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                        </div>
                        <div className="space-y-2">
                          <div className={`whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm ${msg.role === 'user' ? 'rounded-tr-none bg-indigo-600 text-white' : 'rounded-tl-none border border-slate-200 bg-white text-slate-700'}`}>
                            {msg.role === 'model' ? formatChatText(msg.text) : msg.text}
                          </div>
                          {msg.role === 'model' && (
                            <div className="flex justify-start">
                              <button
                                onClick={() => void playAIReading(formatChatText(msg.text))}
                                disabled={assistantState === 'generatingVoice'}
                                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                              >
                                <Volume2 className="h-3.5 w-3.5" /> Nghe giọng AI
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}

                  {(isLoading || assistantState === 'thinking' || assistantState === 'generatingVoice' || assistantState === 'speaking') && (
                    <div className="rounded-3xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                      <div className="flex items-center gap-3 text-sm font-medium text-slate-700">
                        <LoaderCircle className="h-4 w-4 animate-spin text-fuchsia-600" />
                        <span>{statusLabel(assistantState === 'idle' && isLoading ? 'thinking' : assistantState)}</span>
                      </div>
                      <div className="mt-3 flex gap-1.5">
                        <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-fuchsia-500 [animation-delay:-0.2s]" />
                        <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-violet-500 [animation-delay:-0.1s]" />
                        <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-pink-500" />
                      </div>
                    </div>
                  )}
                </div>

                <div className="border-t border-slate-100 bg-white p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                    <span>{isListening ? 'Đang nghe giọng nói...' : 'Nhập câu hỏi hoặc dùng micro để nói'}</span>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => (assistantState === 'speaking' || assistantState === 'generatingVoice' ? stopAudioPlayback() : void playAIReading(formatChatText(latestModelMessage)))}
                        disabled={!latestModelMessage || assistantState === 'thinking' || isLoading}
                        className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                      >
                        {assistantState === 'speaking' || assistantState === 'generatingVoice' ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                        {assistantState === 'speaking' || assistantState === 'generatingVoice' ? 'Dừng' : 'Nghe AI'}
                      </button>
                      <button
                        onClick={() => setAutoSpeak((prev) => !prev)}
                        className={`rounded-full px-3 py-1.5 font-semibold ${autoSpeak ? 'bg-fuchsia-100 text-fuchsia-700' : 'border border-slate-200 text-slate-600'}`}
                      >
                        {autoSpeak ? 'Tự đọc: Bật' : 'Tự đọc: Tắt'}
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 focus-within:ring-2 focus-within:ring-fuchsia-100">
                    <button
                      onClick={toggleListening}
                      className={`rounded-xl p-2 ${isListening ? 'bg-rose-100 text-rose-600' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}
                      title={isListening ? 'Dừng nhập giọng nói' : 'Nhập bằng giọng nói'}
                    >
                      {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                    </button>
                    <input
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), void handleSend())}
                      placeholder={lessonContext?.title ? `Hỏi trợ lý về phần ${lessonContext.stageLabel?.toLowerCase() || 'đang học'}...` : 'Nhập câu hỏi của em...'}
                      className="flex-1 bg-transparent py-2 text-sm outline-none"
                    />
                    <button
                      onClick={() => void handleSend()}
                      disabled={!input.trim() || isLoading}
                      className="rounded-xl bg-gradient-to-r from-fuchsia-600 to-violet-600 p-2.5 text-white disabled:opacity-50"
                    >
                      <Send className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
