import type { QuizQuestion } from '../types';

function clean(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Removes legacy answer labels embedded inside the option text.
 * Examples: "A. Dữ liệu", "B) Thông tin", "C - Vật mang tin" -> content only.
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

function looseChoice(value: unknown) {
  return canonicalChoice(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function answerLetterOnly(value: unknown) {
  const match = clean(value).match(/^([A-H])\s*[.)\-:]?\s*$/i);
  return match ? match[1].toUpperCase() : '';
}

function levenshtein(a: string, b: string) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const old = previous[j];
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diagonal = old;
    }
  }
  return previous[b.length];
}

function similarity(left: string, right: string) {
  if (!left || !right) return 0;
  if (left === right) return 1;
  const longest = Math.max(left.length, right.length);
  return longest ? 1 - levenshtein(left, right) / longest : 0;
}

function uniqueOptions(raw: unknown[]) {
  const seen = new Set<string>();
  const options: string[] = [];
  raw.map(stripChoicePrefix).forEach((option) => {
    const key = canonicalChoice(option);
    if (!option || !key || seen.has(key)) return;
    seen.add(key);
    options.push(option);
  });
  return options;
}

/**
 * Resolves a stored correct answer to the exact option text shown to students.
 * Besides legacy A/B/C/D answers, V6.84.5 can repair one obvious typo only when
 * a single option is clearly closer than all alternatives. Ambiguous answers are
 * deliberately rejected instead of guessing and potentially grading a student wrong.
 */
export function resolveCorrectOption(optionsInput: unknown[], correctAnswer: unknown) {
  const rawOptions = Array.isArray(optionsInput) ? optionsInput.map(clean).filter(Boolean) : [];
  if (!rawOptions.length) return '';

  const letter = answerLetterOnly(correctAnswer);
  if (letter) {
    const index = letter.charCodeAt(0) - 65;
    return index >= 0 && index < rawOptions.length ? stripChoicePrefix(rawOptions[index]) : '';
  }

  const options = uniqueOptions(rawOptions);
  const target = stripChoicePrefix(correctAnswer);
  if (!target) return '';
  const canonicalTarget = canonicalChoice(target);
  const exact = options.find((option) => canonicalChoice(option) === canonicalTarget);
  if (exact) return exact;

  const looseTarget = looseChoice(target);
  const looseMatches = options.filter((option) => looseChoice(option) === looseTarget);
  if (looseMatches.length === 1) return looseMatches[0];

  // Conservative typo repair: sufficiently long target, strong match, clear margin.
  if (looseTarget.length < 8) return '';
  const ranked = options
    .map((option) => ({ option, score: similarity(looseTarget, looseChoice(option)) }))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  const second = ranked[1];
  const margin = best ? best.score - (second?.score ?? 0) : 0;
  if (best && best.score >= 0.86 && (ranked.length === 1 || margin >= 0.08)) return best.option;
  return '';
}

export function sanitizeSingleChoiceQuestion(question: QuizQuestion): QuizQuestion {
  const rawOptions = Array.isArray(question.options) ? question.options.map(clean).filter(Boolean) : [];
  const resolvedBeforeDedupe = resolveCorrectOption(rawOptions, question.correctAnswer);
  const options = uniqueOptions(rawOptions);
  const correctText = resolveCorrectOption(options, resolvedBeforeDedupe || question.correctAnswer);

  return {
    ...question,
    options,
    correctAnswer: correctText,
  };
}

function sanitizeTrueFalseQuestion(question: QuizQuestion): QuizQuestion {
  const raw = clean(question.correctAnswer).toLocaleLowerCase('vi-VN');
  const correctAnswer = ['true', 'đúng', 'dung'].includes(raw)
    ? 'Đúng'
    : ['false', 'sai'].includes(raw)
      ? 'Sai'
      : resolveCorrectOption(['Đúng', 'Sai'], question.correctAnswer);
  return {
    ...question,
    type: 'true_false',
    options: ['Đúng', 'Sai'],
    correctAnswer,
  };
}

function sanitizeFillInBlankQuestion(question: QuizQuestion): QuizQuestion {
  const rawChoices = Array.isArray(question.choices) && question.choices.length
    ? question.choices
    : (question.options || []);
  const choices = uniqueOptions(rawChoices);
  const rawCorrect = clean(question.correctAnswers?.[0] || question.correctAnswer || '');
  let correct = resolveCorrectOption(choices, rawCorrect);

  // If the generator returned a valid answer but forgot to include it in a short
  // choice list, insert it. Never evict one of four choices to force a guess.
  if (!correct && rawCorrect && choices.length < 4) {
    choices.unshift(stripChoicePrefix(rawCorrect));
    correct = choices[0];
  }

  return {
    ...question,
    type: 'fill_in_blank',
    choices: uniqueOptions(choices).slice(0, 4),
    options: undefined,
    correctAnswer: undefined,
    correctAnswers: correct ? [correct] : [],
  };
}

export function sanitizeQuizQuestion(question: QuizQuestion): QuizQuestion {
  const type = question.type === 'short_answer' ? 'fill_in_blank' : (question.type || 'single_choice');
  if (type === 'true_false') return sanitizeTrueFalseQuestion({ ...question, type });
  if (type === 'fill_in_blank') return sanitizeFillInBlankQuestion({ ...question, type });
  return sanitizeSingleChoiceQuestion({ ...question, type: 'single_choice' });
}

export function hasDuplicateChoices(question: QuizQuestion) {
  if ((question.type || 'single_choice') !== 'single_choice') return false;
  const raw = Array.isArray(question.options) ? question.options : [];
  const keys = raw.map(canonicalChoice).filter(Boolean);
  return new Set(keys).size !== keys.length;
}

export function isQuizQuestionQualityAcceptable(question: QuizQuestion) {
  const sanitized = sanitizeQuizQuestion(question);
  const type = sanitized.type || 'single_choice';
  const prompt = clean(sanitized.question || sanitized.sentence || '');
  if (prompt.length < 6) return false;

  if (type === 'true_false') {
    return sanitized.correctAnswer === 'Đúng' || sanitized.correctAnswer === 'Sai';
  }

  if (type === 'fill_in_blank') {
    const choices = sanitized.choices || [];
    const correct = clean(sanitized.correctAnswers?.[0] || '');
    const sentence = clean(sanitized.sentence || sanitized.question || '');
    return /_{3,}/.test(sentence)
      && choices.length === 4
      && Boolean(correct)
      && Boolean(resolveCorrectOption(choices, correct));
  }

  const options = sanitized.options || [];
  return options.length === 4
    && Boolean(sanitized.correctAnswer)
    && Boolean(resolveCorrectOption(options, sanitized.correctAnswer));
}
