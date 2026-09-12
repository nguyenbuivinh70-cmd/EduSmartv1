import type { QuizQuestion } from '../types';

function clean(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Removes legacy answer labels embedded inside the option text.
 * Examples: "A. Dữ liệu", "B) Thông tin", "C - Vật mang tin" -> content only.
 * Repeated labels are removed too, so malformed values such as "A. B. Dữ liệu"
 * still become "Dữ liệu".
 */
export function stripChoicePrefix(value: unknown) {
  let text = clean(value);
  for (let i = 0; i < 3; i += 1) {
    const next = text.replace(/^[A-H]\s*(?:[.)\-:]\s*|\.\s*)/i, '').trim();
    if (next === text) break;
    text = next;
  }
  return text;
}

function canonicalChoice(value: unknown) {
  return stripChoicePrefix(value)
    .toLocaleLowerCase('vi-VN')
    .normalize('NFC')
    .replace(/[\s\u00a0]+/g, ' ')
    .replace(/[.!?;:,]+$/g, '')
    .trim();
}

function answerLetterOnly(value: unknown) {
  const match = clean(value).match(/^([A-H])\s*[.)\-:]?\s*$/i);
  return match ? match[1].toUpperCase() : '';
}

/**
 * Sanitizes a single-choice question without changing its semantic answer.
 * - strips A./B./C./D. prefixes from the stored option text;
 * - removes duplicate options by normalized content;
 * - converts a letter-only correctAnswer to the actual answer text before options
 *   are deduplicated/shuffled;
 * - keeps at least the original surviving choices; no fake distractors are invented.
 */
export function sanitizeSingleChoiceQuestion(question: QuizQuestion): QuizQuestion {
  const rawOptions = Array.isArray(question.options) ? question.options.map(clean).filter(Boolean) : [];
  const correctRaw = clean(question.correctAnswer);
  const correctLetter = answerLetterOnly(correctRaw);
  const correctIndex = correctLetter ? correctLetter.charCodeAt(0) - 65 : -1;
  const indexedCorrect = correctIndex >= 0 && correctIndex < rawOptions.length ? stripChoicePrefix(rawOptions[correctIndex]) : '';
  const explicitCorrect = correctLetter ? '' : stripChoicePrefix(correctRaw);
  let correctText = indexedCorrect || explicitCorrect;

  const seen = new Set<string>();
  const options: string[] = [];
  rawOptions.forEach((option) => {
    const stripped = stripChoicePrefix(option);
    const key = canonicalChoice(stripped);
    if (!stripped || !key || seen.has(key)) return;
    seen.add(key);
    options.push(stripped);
  });

  // Some legacy generators stored "A. Nội dung" in correctAnswer while options
  // already contained plain content. Normalize and bind it to the surviving option.
  if (correctText) {
    const correctKey = canonicalChoice(correctText);
    const matching = options.find((option) => canonicalChoice(option) === correctKey);
    if (matching) correctText = matching;
  }

  return {
    ...question,
    options,
    correctAnswer: correctText || stripChoicePrefix(correctRaw),
  };
}

export function sanitizeQuizQuestion(question: QuizQuestion): QuizQuestion {
  if ((question.type || 'single_choice') !== 'single_choice') return question;
  return sanitizeSingleChoiceQuestion(question);
}

export function hasDuplicateChoices(question: QuizQuestion) {
  if ((question.type || 'single_choice') !== 'single_choice') return false;
  const raw = Array.isArray(question.options) ? question.options : [];
  const keys = raw.map(canonicalChoice).filter(Boolean);
  return new Set(keys).size !== keys.length;
}
