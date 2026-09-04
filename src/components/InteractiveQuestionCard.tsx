import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, HelpCircle, RefreshCcw, Sparkles } from 'lucide-react';
import { LessonQuestionAnswerState, QuizQuestion, QuizQuestionType } from '../types';
import { getVietnameseLevelLabel } from '../services/gemini';

interface InteractiveQuestionCardProps {
  key?: any;
  question: QuizQuestion;
  index: number;
  onAskAI?: (prompt: string, displayText?: string) => void;
  initialAnswer?: LessonQuestionAnswerState | null;
  onAnswerStateChange?: (payload: LessonQuestionAnswerState) => void;
  disableAI?: boolean;
  disableReset?: boolean;
  hideFeedback?: boolean;
  examMode?: boolean;
}

function normalizeText(value: string) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.:]/g, '');
}

function extractOptionKey(value: string) {
  const match = String(value || '').trim().match(/^([A-D])\s*[.)-]?/i);
  return match ? match[1].toUpperCase() : '';
}

function isCorrectSelection(option: string, correctAnswer?: string) {
  if (!correctAnswer) return false;
  const optionKey = extractOptionKey(option);
  const correctKey = extractOptionKey(correctAnswer);
  if (optionKey && correctKey) return optionKey === correctKey;
  return normalizeText(option) === normalizeText(correctAnswer);
}

function sentenceParts(sentence: string, blankCount: number) {
  const normalized = String(sentence || '')
    .replace(/\[\s*\.\.\.\s*\]/g, '_____')
    .replace(/_{2,}/g, '_____');
  const parts = normalized.split(/_{3,}/g);
  while (parts.length < blankCount + 1) parts.push('');
  return parts;
}

function getOptionLetter(index: number) {
  return String.fromCharCode(65 + index);
}

function formatOptionsForPrompt(question: QuizQuestion) {
  const options = question.options?.length ? question.options : (question.choices || []);
  if (!options.length) return '';
  return options.map((option, idx) => `${getOptionLetter(idx)}. ${option}`).join(' | ');
}

type TutorAidMode = 'general' | 'hint' | 'outline' | 'check';

function conciseAIPrompt(base: string) {
  return `${base}

QUY TẮC HỖ TRỢ BẮT BUỘC:
- Chỉ hỗ trợ đúng câu hỏi hiện tại và đúng mục đang học.
- Không trả lời lan man, không mở bài dài, không dùng lịch sử chat cũ.
- Nếu học sinh chưa trả lời/chưa chọn đáp án thì chỉ gợi ý cách suy luận, chưa cho đáp án trực tiếp.
- Nếu học sinh đã nhập/chọn câu trả lời thì nhận xét câu trả lời đó trước rồi mới gợi ý bổ sung.
- Trả lời phải đủ ý, trọn câu, không được dừng giữa chừng hoặc để dòng rỗng như "1.".`;
}

function tutorModeLabel(mode: TutorAidMode) {
  if (mode === 'hint') return 'GỢI Ý TỪNG BƯỚC';
  if (mode === 'outline') return 'DÀN Ý TRẢ LỜI';
  if (mode === 'check') return 'KIỂM TRA CÂU TRẢ LỜI CỦA HỌC SINH';
  return 'HỎI AI VỀ CÂU NÀY';
}

function getQuestionStateId(question: QuizQuestion, index: number) {
  return question.id || `${index}-${String(question.question || question.sentence || 'question').slice(0, 80)}`;
}

function hasEnoughShortAnswer(text: string) {
  const normalized = String(text || '').trim();
  return normalized.length >= 1;
}

export default function InteractiveQuestionCard({ question, index, onAskAI, initialAnswer, onAnswerStateChange, disableAI = false, disableReset = false, hideFeedback = false, examMode = false }: InteractiveQuestionCardProps) {
  const type: QuizQuestionType = question.type === 'short_answer' ? 'fill_in_blank' : (question.type || 'single_choice');
  const questionStateId = getQuestionStateId(question, index);
  const [selectedOption, setSelectedOption] = useState<string | null>(initialAnswer?.selectedOption ?? null);
  const [submitted, setSubmitted] = useState(Boolean(initialAnswer?.submitted));
  const [textAnswer, setTextAnswer] = useState(initialAnswer?.textAnswer || '');
  const [fillSelections, setFillSelections] = useState<string[]>(() => {
    if (Array.isArray(initialAnswer?.fillSelections) && initialAnswer?.fillSelections?.length) {
      return initialAnswer.fillSelections;
    }
    return (question.correctAnswers?.length ? question.correctAnswers : ['']).map(() => '');
  });
  const [activeBlankIndex, setActiveBlankIndex] = useState(0);

  const levelLabel = useMemo(() => getVietnameseLevelLabel(question.level), [question.level]);
  const defaultFillSelections = useMemo(() => (question.correctAnswers?.length ? question.correctAnswers : ['']).map(() => ''), [question.correctAnswers]);
  const draftSyncTimerRef = useRef<number | null>(null);
  const lastReportedStateRef = useRef('');

  const emitAnswerState = useCallback((payload: LessonQuestionAnswerState) => {
    const serialized = JSON.stringify(payload);
    if (serialized === lastReportedStateRef.current) return;
    lastReportedStateRef.current = serialized;
    onAnswerStateChange?.(payload);
  }, [onAnswerStateChange]);

  useEffect(() => () => {
    if (draftSyncTimerRef.current) window.clearTimeout(draftSyncTimerRef.current);
  }, []);

  useEffect(() => {
    setSelectedOption(initialAnswer?.selectedOption ?? null);
    setSubmitted(Boolean(initialAnswer?.submitted));
    setTextAnswer(initialAnswer?.textAnswer || '');
    setFillSelections(Array.isArray(initialAnswer?.fillSelections) && initialAnswer.fillSelections.length ? initialAnswer.fillSelections : defaultFillSelections);
    setActiveBlankIndex(0);
  }, [initialAnswer?.selectedOption, initialAnswer?.submitted, initialAnswer?.textAnswer, JSON.stringify(initialAnswer?.fillSelections || []), defaultFillSelections, questionStateId]);

  const isCorrect = useMemo(() => {
    if (!submitted) return false;
    if (type === 'fill_in_blank') {
      const expected = (question.correctAnswers || []).map(normalizeText);
      const actual = fillSelections.map(normalizeText);
      return expected.length > 0 && expected.length === actual.length && expected.every((item, idx) => item === actual[idx]);
    }
    if (!selectedOption) return false;
    return isCorrectSelection(selectedOption, question.correctAnswer);
  }, [submitted, selectedOption, question.correctAnswer, fillSelections, question.correctAnswers, type, textAnswer]);

  useEffect(() => {
    const payload: LessonQuestionAnswerState = {
      questionId: questionStateId,
      type,
      submitted,
      isCorrect,
      selectedOption,
      fillSelections,
      textAnswer,
    };

    if (draftSyncTimerRef.current) {
      window.clearTimeout(draftSyncTimerRef.current);
      draftSyncTimerRef.current = null;
    }

    emitAnswerState(payload);
  }, [submitted, isCorrect, selectedOption, JSON.stringify(fillSelections), textAnswer, questionStateId, type, emitAnswerState]);

  const handleSelect = (option: string) => {
    setSelectedOption(option);
    setSubmitted(true);
  };

  const handleFillSelection = (blankIndex: number, value: string) => {
    setFillSelections((prev) => prev.map((item, idx) => (idx === blankIndex ? value : item)));
  };

  const handleChoiceClick = (choice: string) => {
    const nextBlankIndex = fillSelections.findIndex((item) => !item.trim());
    const targetIndex = fillSelections[activeBlankIndex]?.trim() ? (nextBlankIndex >= 0 ? nextBlankIndex : activeBlankIndex) : activeBlankIndex;
    handleFillSelection(targetIndex >= 0 ? targetIndex : 0, choice);
    const nextIndex = fillSelections.findIndex((item, idx) => idx > targetIndex && !item.trim());
    if (nextIndex >= 0) setActiveBlankIndex(nextIndex);
  };

  const handleSubmitFill = () => {
    if (!fillSelections.every((item) => item.trim())) return;
    setSubmitted(true);
  };

  const handleSubmitShortAnswer = () => {
    if (!hasEnoughShortAnswer(textAnswer)) return;
    setSubmitted(true);
  };

  const handleReset = () => {
    setSelectedOption(null);
    setSubmitted(false);
    setTextAnswer('');
    setFillSelections((question.correctAnswers?.length ? question.correctAnswers : ['']).map(() => '')); 
    setActiveBlankIndex(0);
  };

  const askAI = (aidMode: TutorAidMode = 'general') => {
    if (disableAI) return;
    const optionsText = formatOptionsForPrompt(question);
    const baseQuestion = question.question || question.sentence || '';
    const studentDraft = String(textAnswer || '').trim();
    const fillDraft = fillSelections.filter(Boolean).join(', ');
    const modeLabel = tutorModeLabel(aidMode);


    if (type === 'fill_in_blank') {
      const hasDraft = Boolean(fillDraft);
      const prompt = conciseAIPrompt([
        `Mức hỗ trợ: ${modeLabel}.`,
        `Câu điền khuyết số ${index + 1}: "${baseQuestion}".`,
        `Các lựa chọn: ${optionsText || 'không có'}.`,
        hasDraft ? `Học sinh đã điền: "${fillDraft}".` : 'Học sinh chưa điền đủ đáp án.',
        submitted ? `Đáp án đúng để đối chiếu sau khi làm: "${(question.correctAnswers || []).join(', ')}".` : '',
        submitted
          ? 'Hãy nhận xét ngắn vì sao cách điền đúng/sai và nhắc từ khóa cần nhớ.'
          : 'Hãy hướng dẫn cách nhận biết từ khóa cần điền, chưa cho trực tiếp đáp án cuối cùng.',
        'Định dạng: Em cần nhìn vào... / Cách suy luận... / Điểm cần nhớ...',
      ].filter(Boolean).join('\n'));
      onAskAI?.(prompt, `Hỏi AI về câu ${index + 1}`);
      return;
    }

    const hasChoice = Boolean(selectedOption);
    const prompt = conciseAIPrompt([
      `Mức hỗ trợ: ${modeLabel}.`,
      `Câu ${index + 1}: "${baseQuestion}".`,
      `Các đáp án: ${optionsText || 'không có'}.`,
      hasChoice ? `Học sinh đã chọn: "${selectedOption}".` : 'Học sinh chưa chọn đáp án.',
      hasChoice ? `Đáp án đúng để đối chiếu sau khi học sinh đã chọn: "${question.correctAnswer}".` : '',
      hasChoice
        ? 'Hãy giải thích vì sao lựa chọn của học sinh đúng/sai, nêu điểm dễ nhầm và nhắc lại kiến thức liên quan.'
        : 'Hãy hướng dẫn phân tích yêu cầu câu hỏi và cách loại trừ đáp án sai, chưa nêu đáp án đúng trực tiếp.',
      'Định dạng: Câu hỏi đang hỏi về... / Cách suy luận... / Điểm dễ nhầm...',
    ].filter(Boolean).join('\n'));
    onAskAI?.(prompt, `Hỏi AI về câu ${index + 1}`);
  };

  const renderFeedback = () => {
    if (hideFeedback) return null;
    if (!submitted) return null;

    const correctAnswerText = type === 'fill_in_blank'
      ? (question.correctAnswers || []).join(', ')
      : question.correctAnswer;

    return (
      <div className={[
        'mt-4 rounded-2xl border px-4 py-4 text-sm leading-7',
        isCorrect ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800',
      ].join(' ')}>
        <div className="flex items-start gap-3">
          <div className={isCorrect ? 'text-emerald-600' : 'text-rose-600'}>
            {isCorrect ? <CheckCircle2 className="mt-0.5 h-5 w-5" /> : <AlertCircle className="mt-0.5 h-5 w-5" />}
          </div>
          <div>
            <p className="font-semibold">{isCorrect ? 'Chính xác rồi!' : 'Chưa đúng, thử xem lại nhé.'}</p>
            {correctAnswerText ? (
              <p className="mt-1">
                <span className="font-semibold">Đáp án đúng:</span> {correctAnswerText}
              </p>
            ) : null}
            {question.explanation ? (
              <p className="mt-1">
                <span className="font-semibold">Giải thích:</span> {question.explanation}
              </p>
            ) : null}
            {!isCorrect && question.wrongAnswerExplanations && selectedOption ? (
              <p className="mt-1">
                <span className="font-semibold">Em dễ nhầm ở chỗ:</span>{' '}
                {question.wrongAnswerExplanations[extractOptionKey(selectedOption)] || 'Cần đối chiếu lại nội dung bài học và các từ khóa quan trọng.'}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    );
  };

  const renderSingleChoice = () => (
    <div className="mt-4 grid gap-3">
      {(question.options || []).map((option, optionIndex) => {
        const selected = selectedOption === option;
        const optionIsCorrect = isCorrectSelection(option, question.correctAnswer);
        const allowAnswerFeedback = !hideFeedback;
        const showCorrect = allowAnswerFeedback && submitted && optionIsCorrect;
        const showWrong = allowAnswerFeedback && submitted && selected && !optionIsCorrect;

        return (
          <button
            key={`${option}-${optionIndex}`}
            type="button"
            onClick={() => handleSelect(option)}
            className={[
              'rounded-2xl border px-4 py-3 text-left text-sm transition',
              showCorrect
                ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                : showWrong
                  ? 'border-rose-300 bg-rose-50 text-rose-800'
                  : selected
                    ? 'border-indigo-300 bg-indigo-50 text-indigo-800'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-indigo-200 hover:bg-indigo-50/60',
            ].join(' ')}
          >
            <span className="flex items-start gap-3">
              <span className={[
                'mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold',
                showCorrect
                  ? 'bg-emerald-100 text-emerald-700'
                  : showWrong
                    ? 'bg-rose-100 text-rose-700'
                    : selected
                      ? 'bg-indigo-100 text-indigo-700'
                      : 'bg-white text-slate-500 ring-1 ring-slate-200',
              ].join(' ')}>
                {getOptionLetter(optionIndex)}
              </span>
              <span className="flex-1 leading-6">{option}</span>
            </span>
          </button>
        );
      })}
    </div>
  );

  const renderShortAnswer = () => (
    <div className="mt-4">
      <textarea
        value={textAnswer}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
        onChange={(event) => {
          setTextAnswer(event.target.value);
          if (submitted) setSubmitted(false);
        }}
        rows={4}
        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-7 text-slate-800 outline-none transition focus:border-indigo-300 focus:bg-white focus:ring-4 focus:ring-indigo-100"
        placeholder="Nhập câu trả lời của em..."
      />
    </div>
  );

  const renderFillInBlank = () => {
    const blanks = question.correctAnswers || [''];
    const parts = sentenceParts(question.sentence || question.question, blanks.length);
    const choices = (question.choices?.length ? question.choices : (question.options || [])).slice(0, 4);

    return (
      <div className="mt-4 space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-8 text-slate-800">
          {parts.map((part, partIndex) => (
            <span key={`${part}-${partIndex}`}>
              {part}
              {partIndex < blanks.length ? (
                <button
                  type="button"
                  onClick={() => setActiveBlankIndex(partIndex)}
                  className={[
                    'mx-2 inline-flex min-w-[160px] items-center justify-center rounded-2xl border px-4 py-2 text-sm font-semibold transition',
                    fillSelections[partIndex]
                      ? 'border-indigo-200 bg-white text-indigo-700 shadow-sm'
                      : 'border-dashed border-indigo-300 bg-indigo-50 text-indigo-500',
                    activeBlankIndex === partIndex ? 'ring-2 ring-indigo-200' : '',
                  ].join(' ')}
                >
                  {fillSelections[partIndex] || `Ô trống ${partIndex + 1}`}
                </button>
              ) : null}
            </span>
          ))}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            <Sparkles className="h-3.5 w-3.5 text-indigo-500" /> Chọn từ hoặc cụm từ để điền
          </div>
          <div className="flex flex-wrap gap-2">
            {choices.map((choice, choiceIndex) => {
              const used = fillSelections.some((item) => normalizeText(item) === normalizeText(choice));
              return (
                <button
                  key={`${choice}-${choiceIndex}`}
                  type="button"
                  onClick={() => handleChoiceClick(choice)}
                  className={[
                    'rounded-full border px-4 py-2 text-sm font-medium transition',
                    used
                      ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-indigo-200 hover:bg-indigo-50',
                  ].join(' ')}
                >
                  {choice}
                </button>
              );
            })}
          </div>
        </div>

      </div>
    );
  };

  const renderQuestionInput = () => {
    if (type === 'fill_in_blank') return renderFillInBlank();
    return renderSingleChoice();
  };

  const renderActionToolbar = () => {
    const canSubmitFill = fillSelections.every((item) => item.trim());
    const needsChoiceHint = !examMode && !submitted && type !== 'fill_in_blank';
    const needsFillHint = !examMode && !submitted && type === 'fill_in_blank';

    return (
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
        {type === 'fill_in_blank' ? (
          <button
            type="button"
            onClick={handleSubmitFill}
            disabled={!canSubmitFill}
            className="inline-flex items-center gap-2 rounded-full bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> Kiểm tra đáp án
          </button>
        ) : null}
        {!disableReset ? (
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <RefreshCcw className="h-3.5 w-3.5" /> Làm lại
          </button>
        ) : null}
        {!disableAI ? (
          <button
            type="button"
            onClick={() => askAI()}
            className="inline-flex items-center gap-2 rounded-full bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
          >
            <Sparkles className="h-3.5 w-3.5" /> Hỏi AI về câu này
          </button>
        ) : null}
        {needsChoiceHint ? (
          <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-2 text-xs font-medium text-slate-600">
            <HelpCircle className="h-3.5 w-3.5" /> Chọn một đáp án để xem phản hồi.
          </span>
        ) : null}
        {needsFillHint ? (
          <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-2 text-xs font-medium text-slate-600">
            <HelpCircle className="h-3.5 w-3.5" /> Chọn đủ ô trống rồi kiểm tra.
          </span>
        ) : null}
      </div>
    );
  };

  return (
    <div className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm lg:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-base font-semibold leading-7 text-slate-900">
            {type === 'fill_in_blank' ? `Câu ${index + 1}. Điền từ hoặc cụm từ thích hợp` : `Câu ${index + 1}. ${question.question}`}
          </p>
          {question.hint ? <p className="mt-2 text-sm text-slate-500">Gợi ý: {question.hint}</p> : null}
        </div>
        {question.level ? (
          <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-100">
            {levelLabel}
          </span>
        ) : null}
      </div>

      {renderQuestionInput()}
      {renderFeedback()}

      {renderActionToolbar()}
    </div>
  );
}
