import { GoogleGenAI } from '@google/genai';
import {
  ChatMessage,
  GoogleSlidePromptItem,
  GoogleSlidesPromptResult,
  LessonBuilderSettings,
  LessonComposerValues,
  LessonContent,
  LessonStageKey,
  LessonPresentationPage,
  QuizQuestion,
  QuizQuestionType,
  UploadedSourceFile,
} from '../types';
import { isQuizQuestionQualityAcceptable, sanitizeQuizQuestion } from '../utils/quizSanitizer';
import { AI_MODELS, normalizeGeminiModelName } from '../constants';
import { CURRICULUM_PROGRAM, CURRICULUM_REFERENCE_URL, CURRICULUM_VERSION, TEXTBOOK_CATALOG_VERSION, TEXTBOOK_SERIES_KNTT, getCurriculumRequirementsByIds, getSubjectAssessmentGuidance, getTextbookCatalogVersion, getTextbookLessonById, getTextbookReferenceUrl } from '../data/curriculum/registry';
import { completeCurriculumReferences, normalizeCurriculumAlignment } from '../utils/curriculumAlignment';


// V6.98.7: Production-safe Gemini request layer.
// Google documents 429/5xx (especially 503 UNAVAILABLE/high demand) as transient
// conditions that should be retried with exponential backoff. On a deployed web
// app we also fail over to another compatible Flash model so a temporary capacity
// spike on one model does not block lesson creation.
const GEMINI_RUNTIME_HINT_TTL_MS = 10 * 60 * 1000;
const GEMINI_DEFAULT_TOTAL_TIMEOUT_MS = 120 * 1000;
const GEMINI_DEFAULT_ATTEMPT_TIMEOUT_MS = 55 * 1000;
const geminiRuntimeModelHints = new Map<string, { model: string; expiresAt: number }>();
const GEMINI_MODEL_CATALOG_TTL_MS = 15 * 60 * 1000;
const geminiAvailableModelCache = new Map<string, { models: string[]; expiresAt: number }>();

type ReliableGeminiOptions = {
  allowFallback?: boolean;
  label?: string;
  signal?: AbortSignal;
  totalTimeoutMs?: number;
  attemptTimeoutMs?: number;
  maxCandidates?: number;
  primaryAttempts?: number;
};

function waitFor(ms: number, signal?: AbortSignal) {
  if (!signal) return new Promise<void>((resolve) => globalThis.setTimeout(resolve, ms));
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      const error = new Error('AI_REQUEST_CANCELLED');
      (error as any).name = 'AbortError';
      reject(error);
      return;
    }
    const timer = globalThis.setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      globalThis.clearTimeout(timer);
      const error = new Error('AI_REQUEST_CANCELLED');
      (error as any).name = 'AbortError';
      reject(error);
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function createGeminiTimeoutError(label: string, timeoutMs: number) {
  const error = new Error(`EDUSMART_AI_TIMEOUT:${label}:${timeoutMs}`);
  (error as any).name = 'GeminiTimeoutError';
  (error as any).code = 'EDUSMART_AI_TIMEOUT';
  return error;
}

function isGeminiAbortError(error: unknown) {
  const value = error as any;
  return value?.name === 'AbortError' || /AI_REQUEST_CANCELLED/i.test(String(value?.message || ''));
}

async function runGeminiBounded<T>(operation: () => Promise<T>, timeoutMs: number, label: string, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) {
    const error = new Error('AI_REQUEST_CANCELLED');
    (error as any).name = 'AbortError';
    throw error;
  }
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (fn: (value: any) => void, value: any) => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      fn(value);
    };
    const timer = globalThis.setTimeout(() => finish(reject, createGeminiTimeoutError(label, timeoutMs)), Math.max(1000, timeoutMs));
    const onAbort = () => {
      const error = new Error('AI_REQUEST_CANCELLED');
      (error as any).name = 'AbortError';
      finish(reject, error);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    Promise.resolve()
      .then(operation)
      .then((value) => finish(resolve, value), (error) => finish(reject, error));
  });
}

function geminiErrorText(error: unknown) {
  const value = error as any;
  const parts = [
    value?.error?.message,
    value?.message,
    value?.status,
    value?.code,
    typeof error === 'string' ? error : '',
  ].filter(Boolean).map((item) => String(item));
  const joined = parts.join(' | ').trim();
  if (!joined) return 'UNKNOWN_GEMINI_ERROR';
  try {
    const firstBrace = joined.indexOf('{');
    const lastBrace = joined.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      const parsed = JSON.parse(joined.slice(firstBrace, lastBrace + 1));
      const nested = parsed?.error?.message || parsed?.message;
      if (nested) return `${nested} | ${joined}`;
    }
  } catch {
    // Keep original diagnostic text.
  }
  return joined;
}

function geminiHttpStatus(error: unknown) {
  const value = error as any;
  const direct = Number(value?.status || value?.statusCode || value?.error?.code || value?.code);
  if ([400, 401, 403, 404, 408, 409, 429, 500, 502, 503, 504].includes(direct)) return direct;
  const match = geminiErrorText(error).match(/(?:HTTP\s*)?(400|401|403|404|408|409|429|500|502|503|504)\b/i);
  return match ? Number(match[1]) : 0;
}

function isGeminiTransientError(error: unknown) {
  if ((error as any)?.code === 'EDUSMART_AI_TIMEOUT') return true;
  const status = geminiHttpStatus(error);
  const text = geminiErrorText(error).toLowerCase();
  return [408, 429, 500, 502, 503, 504].includes(status)
    || /unavailable|high demand|overload|overloaded|temporar|decode_preempted|resource[_ -]?exhausted|rate limit|timeout|timed out|network|fetch failed/.test(text);
}

function isGeminiModelUnavailable(error: unknown) {
  const status = geminiHttpStatus(error);
  const text = geminiErrorText(error).toLowerCase();
  return status === 404 || /model.+(?:not found|unavailable|not supported)|not supported for generatecontent/.test(text);
}

function safeGeminiUserError(error: unknown) {
  if (isGeminiAbortError(error)) {
    return new Error('Đã dừng tạo bài học. Học liệu và cấu hình hiện tại vẫn được giữ nguyên.');
  }
  if ((error as any)?.code === 'EDUSMART_AI_TIMEOUT' || /EDUSMART_AI_TIMEOUT/i.test(String((error as any)?.message || ''))) {
    return new Error('Dịch vụ AI phản hồi quá chậm nên hệ thống đã dừng yêu cầu để tránh treo màn hình. Hãy bấm tạo lại; học liệu và cấu hình hiện tại vẫn được giữ nguyên.');
  }
  const status = geminiHttpStatus(error);
  const text = geminiErrorText(error).toLowerCase();
  if (status === 503 || /high demand|overload|decode_preempted|service.+unavailable/.test(text)) {
    return new Error('Dịch vụ AI đang có nhiều yêu cầu. Hệ thống đã tự thử lại và chuyển sang mô hình dự phòng nhưng chưa hoàn tất. Vui lòng thử lại sau ít phút.');
  }
  if (status === 429 || /quota|resource[_ -]?exhausted|rate limit/.test(text)) {
    return new Error('Hạn mức sử dụng AI của tài khoản hiện đã đạt giới hạn. Vui lòng thử lại sau hoặc chọn API Key khác.');
  }
  if (status === 401 || status === 403 || /api key|permission denied|forbidden/.test(text)) {
    return new Error('Cấu hình AI của tài khoản chưa được chấp nhận. Vui lòng kiểm tra API Key và quyền sử dụng mô hình.');
  }
  if (isGeminiModelUnavailable(error)) {
    return new Error('Mô hình AI đang chọn chưa sẵn sàng. Hệ thống đã thử các mô hình dự phòng nhưng chưa thể hoàn tất yêu cầu.');
  }
  if (/network|fetch failed|failed to fetch|timeout|timed out/.test(text)) {
    return new Error('Kết nối tới dịch vụ AI đang gián đoạn. Vui lòng kiểm tra mạng và thử lại.');
  }
  return new Error('Chưa thể hoàn tất yêu cầu AI lúc này. Vui lòng thử lại sau ít phút.');
}

function geminiModelCandidates(requestedModel: string, allowFallback = true) {
  const requested = normalizeGeminiModelName(requestedModel);
  const hint = geminiRuntimeModelHints.get(requested);
  const hinted = hint && hint.expiresAt > Date.now() ? hint.model : '';
  if (hint && hint.expiresAt <= Date.now()) geminiRuntimeModelHints.delete(requested);
  if (!allowFallback) return [requested];

  // V6.98.7: chỉ ưu tiên các Flash production phù hợp cho luồng tạo bài trên web.
  // Giảm số model thử nối tiếp để một model quá tải không biến thành trạng thái
  // "đang tạo" kéo dài nhiều phút trên Netlify.
  const productionFallbacks = [
    'gemini-3.8-flash',
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
  ];
  return Array.from(new Set([hinted, requested, ...productionFallbacks, ...AI_MODELS].filter(Boolean)));
}

async function generateContentReliable(
  ai: GoogleGenAI,
  requestedModel: string,
  request: any,
  options: ReliableGeminiOptions = {},
): Promise<any> {
  const allowFallback = options.allowFallback !== false;
  const requested = normalizeGeminiModelName(requestedModel);
  const candidates = geminiModelCandidates(requested, allowFallback).slice(0, Math.max(1, options.maxCandidates || 4));
  const totalTimeoutMs = Math.max(15_000, options.totalTimeoutMs || GEMINI_DEFAULT_TOTAL_TIMEOUT_MS);
  const attemptTimeoutMs = Math.max(10_000, options.attemptTimeoutMs || GEMINI_DEFAULT_ATTEMPT_TIMEOUT_MS);
  const deadlineAt = Date.now() + totalTimeoutMs;
  let lastError: unknown = null;

  for (let modelIndex = 0; modelIndex < candidates.length; modelIndex += 1) {
    if (options.signal?.aborted) throw safeGeminiUserError(Object.assign(new Error('AI_REQUEST_CANCELLED'), { name: 'AbortError' }));
    const candidate = candidates[modelIndex];
    const maxAttempts = modelIndex === 0 ? Math.max(1, options.primaryAttempts || 2) : 1;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const remainingMs = deadlineAt - Date.now();
      if (remainingMs <= 1000) throw safeGeminiUserError(createGeminiTimeoutError(options.label || 'generateContent', totalTimeoutMs));
      try {
        const response = await runGeminiBounded(
          () => ai.models.generateContent({ ...request, model: candidate }),
          Math.min(attemptTimeoutMs, remainingMs),
          `${options.label || 'generateContent'}:${candidate}`,
          options.signal,
        );
        geminiRuntimeModelHints.set(requested, { model: candidate, expiresAt: Date.now() + GEMINI_RUNTIME_HINT_TTL_MS });
        if (candidate !== requested) console.info(`[EduSmart][AI] ${options.label || 'generateContent'} recovered with fallback model ${candidate}.`);
        return response;
      } catch (error) {
        if (isGeminiAbortError(error)) throw safeGeminiUserError(error);
        lastError = error;
        const transient = isGeminiTransientError(error);
        const modelUnavailable = isGeminiModelUnavailable(error);
        console.warn(`[EduSmart][AI] ${options.label || 'generateContent'} failed on ${candidate} (attempt ${attempt + 1}/${maxAttempts}).`, error);
        if (!transient && !modelUnavailable) throw safeGeminiUserError(error);
        if (transient && attempt + 1 < maxAttempts) {
          const remainingBeforeRetry = deadlineAt - Date.now();
          if (remainingBeforeRetry <= 1500) break;
          await waitFor(Math.min(attempt === 0 ? 900 : 1800, remainingBeforeRetry - 500), options.signal);
          continue;
        }
        break;
      }
    }
    const remainingBeforeFallback = deadlineAt - Date.now();
    if (modelIndex + 1 < candidates.length && remainingBeforeFallback > 1000) {
      await waitFor(Math.min(300, remainingBeforeFallback - 500), options.signal);
    }
  }

  throw safeGeminiUserError(lastError || createGeminiTimeoutError(options.label || 'generateContent', totalTimeoutMs));
}


function lessonModelCandidates(requestedModel: string, availableModels: string[] = []) {
  const requested = normalizeGeminiModelName(requestedModel);
  const hint = geminiRuntimeModelHints.get(requested);
  const hinted = hint && hint.expiresAt > Date.now() ? hint.model : '';
  if (hint && hint.expiresAt <= Date.now()) geminiRuntimeModelHints.delete(requested);

  // V6.99.0: lesson generation keeps the production-safe Flash fallback path from V6.98.8.
  // V6.98.7 put several newer/high-demand models before 2.5 and then truncated the
  // candidate list, so Netlify could exhaust all attempts without ever reaching a
  // stable fallback even though the API key supported it.
  const priority = [
    hinted,
    requested,
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-3.5-flash-lite',
    'gemini-3.5-flash',
    'gemini-3.8-flash',
    ...AI_MODELS,
  ].filter(Boolean).map((name) => normalizeGeminiModelName(name));
  const unique = Array.from(new Set(priority));
  if (!availableModels.length) return unique;
  const discovered = Array.from(new Set(availableModels.map((name) => normalizeGeminiModelName(name))));
  const available = new Set(discovered);
  const filtered = unique.filter((name) => available.has(name));
  // Keep every generateContent-capable model discovered for this exact API key as
  // a final fallback. This prevents a static client list from hiding a working
  // model introduced or aliased by Google after the app was deployed.
  return Array.from(new Set([...filtered, ...discovered]));
}

async function getAvailableGenerateModels(apiKey: string, signal?: AbortSignal): Promise<string[]> {
  const key = String(apiKey || '').trim();
  const cached = geminiAvailableModelCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.models;
  if (cached) geminiAvailableModelCache.delete(key);

  const controller = new AbortController();
  let timedOut = false;
  const timer = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 7000);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000', {
      headers: { 'x-goog-api-key': key },
      signal: controller.signal,
    });
    if (!response.ok) return [];
    const payload: any = await response.json();
    const models = (Array.isArray(payload?.models) ? payload.models : [])
      .filter((item: any) => Array.isArray(item?.supportedGenerationMethods) && item.supportedGenerationMethods.includes('generateContent'))
      .map((item: any) => String(item?.baseModelId || item?.name || '').replace(/^models\//, '').trim())
      .filter((name: string) => /^gemini-/i.test(name));
    const unique = Array.from(new Set(models)) as string[];
    if (unique.length) geminiAvailableModelCache.set(key, { models: unique, expiresAt: Date.now() + GEMINI_MODEL_CATALOG_TTL_MS });
    return unique;
  } catch (error) {
    if (signal?.aborted) throw Object.assign(new Error('AI_REQUEST_CANCELLED'), { name: 'AbortError' });
    if (timedOut) console.info('[EduSmart][AI] model catalog timed out; using local fallback order.');
    else console.info('[EduSmart][AI] model catalog unavailable; using local fallback order.');
    return [];
  } finally {
    globalThis.clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

function toGeminiRestBody(request: any) {
  const { config = {}, model: _ignoredModel, ...rest } = request || {};
  const { systemInstruction, ...generationConfig } = config || {};
  const body: any = { ...rest };
  if (systemInstruction) {
    body.systemInstruction = typeof systemInstruction === 'string'
      ? { parts: [{ text: systemInstruction }] }
      : systemInstruction;
  }
  if (Object.keys(generationConfig).length) body.generationConfig = generationConfig;
  return body;
}

function textFromGeminiRestPayload(payload: any) {
  return (Array.isArray(payload?.candidates) ? payload.candidates : [])
    .flatMap((candidate: any) => Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [])
    .map((part: any) => typeof part?.text === 'string' ? part.text : '')
    .filter(Boolean)
    .join('');
}

async function generateContentRestOnce(
  apiKey: string,
  model: string,
  request: any,
  timeoutMs: number,
  label: string,
  signal?: AbortSignal,
): Promise<any> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, Math.max(5000, timeoutMs));
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': String(apiKey || '').trim(),
      },
      body: JSON.stringify(toGeminiRestBody(request)),
      signal: controller.signal,
    });
    let payload: any = null;
    try { payload = await response.json(); } catch { payload = null; }
    if (!response.ok) {
      const error: any = new Error(String(payload?.error?.message || payload?.message || `Gemini request failed (${response.status})`));
      error.status = response.status;
      error.statusCode = response.status;
      error.code = payload?.error?.code || response.status;
      error.error = payload?.error || payload;
      throw error;
    }
    return { ...(payload || {}), text: textFromGeminiRestPayload(payload) };
  } catch (error) {
    if (signal?.aborted) throw Object.assign(new Error('AI_REQUEST_CANCELLED'), { name: 'AbortError' });
    if (timedOut) throw createGeminiTimeoutError(label, timeoutMs);
    throw error;
  } finally {
    globalThis.clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

async function generateLessonContentReliableRest(
  apiKey: string,
  requestedModel: string,
  request: any,
  options: ReliableGeminiOptions = {},
): Promise<any> {
  const requested = normalizeGeminiModelName(requestedModel);
  const totalTimeoutMs = Math.max(20_000, options.totalTimeoutMs || 95_000);
  const attemptTimeoutMs = Math.max(12_000, options.attemptTimeoutMs || 30_000);
  const deadlineAt = Date.now() + totalTimeoutMs;
  let lastError: unknown = null;

  const availableModels = await getAvailableGenerateModels(apiKey, options.signal);
  const candidates = lessonModelCandidates(requested, availableModels)
    .slice(0, Math.max(1, options.maxCandidates || 4));

  for (let modelIndex = 0; modelIndex < candidates.length; modelIndex += 1) {
    if (options.signal?.aborted) throw safeGeminiUserError(Object.assign(new Error('AI_REQUEST_CANCELLED'), { name: 'AbortError' }));
    const candidate = candidates[modelIndex];
    const remainingMs = deadlineAt - Date.now();
    if (remainingMs <= 1500) break;
    try {
      const response = await generateContentRestOnce(
        apiKey,
        candidate,
        request,
        Math.min(attemptTimeoutMs, remainingMs),
        `${options.label || 'lesson-generation'}:${candidate}`,
        options.signal,
      );
      geminiRuntimeModelHints.set(requested, { model: candidate, expiresAt: Date.now() + GEMINI_RUNTIME_HINT_TTL_MS });
      if (candidate !== requested) console.info(`[EduSmart][AI] ${options.label || 'lesson-generation'} recovered with ${candidate}.`);
      return response;
    } catch (error) {
      if (isGeminiAbortError(error)) throw safeGeminiUserError(error);
      lastError = error;
      console.warn(`[EduSmart][AI] ${options.label || 'lesson-generation'} REST attempt failed on ${candidate}.`, error);
      if (!isGeminiTransientError(error) && !isGeminiModelUnavailable(error)) throw safeGeminiUserError(error);
      const remainingBeforeFallback = deadlineAt - Date.now();
      if (modelIndex + 1 < candidates.length && remainingBeforeFallback > 1000) {
        await waitFor(Math.min(250, remainingBeforeFallback - 500), options.signal);
      }
    }
  }

  throw safeGeminiUserError(lastError || createGeminiTimeoutError(options.label || 'lesson-generation', totalTimeoutMs));
}

async function generateContentStreamReliable(
  ai: GoogleGenAI,
  requestedModel: string,
  request: any,
): Promise<any> {
  const requested = normalizeGeminiModelName(requestedModel);
  const candidates = geminiModelCandidates(requested, true).slice(0, 4);
  const deadlineAt = Date.now() + 65_000;
  let lastError: unknown = null;
  for (let modelIndex = 0; modelIndex < candidates.length; modelIndex += 1) {
    const candidate = candidates[modelIndex];
    const remainingMs = deadlineAt - Date.now();
    if (remainingMs <= 1000) break;
    try {
      const response = await runGeminiBounded(
        () => ai.models.generateContentStream({ ...request, model: candidate }),
        Math.min(30_000, remainingMs),
        `stream:${candidate}`,
      );
      geminiRuntimeModelHints.set(requested, { model: candidate, expiresAt: Date.now() + GEMINI_RUNTIME_HINT_TTL_MS });
      return response;
    } catch (error) {
      lastError = error;
      console.warn(`[EduSmart][AI] stream start failed on ${candidate}.`, error);
      if (!isGeminiTransientError(error) && !isGeminiModelUnavailable(error)) throw safeGeminiUserError(error);
      if (modelIndex + 1 < candidates.length && deadlineAt - Date.now() > 1000) await waitFor(400);
    }
  }
  throw safeGeminiUserError(lastError || createGeminiTimeoutError('stream', 65_000));
}

function cleanTextValue(value: unknown): string {
  return String(value ?? '')
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .replace(/^[\-•·▪◦]+\s*/gm, '')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function safeArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => cleanTextValue(item))
    .filter(Boolean);
}

function normalizeQuestionType(value: unknown): QuizQuestionType {
  const normalized = String(value || '').trim().toLowerCase();
  if (['true_false', 'dung_sai', 'truefalse', 'dung-sai'].includes(normalized)) return 'true_false';
  if (['fill_in_blank', 'dien_khuyet', 'dien_vao_cho_trong', 'fillblank', 'chon_tu_dien_khuyet', 'chon_cum_tu'].includes(normalized)) return 'fill_in_blank';
  // Từ phiên bản V6.23, câu trả lời ngắn được thay bằng dạng chọn từ/cụm từ điền vào chỗ trống.
  // Vẫn nhận diện các nhãn cũ để tự chuyển đổi dữ liệu cũ hoặc phản hồi AI chưa theo prompt mới.
  if (['short_answer', 'tu_luan_ngan', 'tu_luan', 'cau_hoi_mo', 'open_answer', 'open_ended'].includes(normalized)) return 'fill_in_blank';
  return 'single_choice';
}


function uniqueByText(items: string[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const cleaned = cleanTextValue(item);
    const key = cleaned.toLowerCase();
    if (!cleaned || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function compactAnswerPhrase(value: unknown) {
  const cleaned = cleanTextValue(value);
  if (!cleaned) return '';
  const first = cleaned.split(/[.;:\n]/)[0].trim();
  const words = first.split(/\s+/).filter(Boolean);
  return words.slice(0, Math.min(5, words.length)).join(' ');
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}


function ensureFillSentence(question: string, answer: string) {
  const cleanedQuestion = cleanTextValue(question);
  const cleanedAnswer = cleanTextValue(answer);
  if (/_{3,}/.test(cleanedQuestion)) return cleanedQuestion.replace(/_{2,}/g, '_____');
  if (cleanedAnswer) {
    const answerRegex = new RegExp(escapeRegExp(cleanedAnswer), 'i');
    if (answerRegex.test(cleanedQuestion)) return cleanedQuestion.replace(answerRegex, '_____');
  }
  return cleanedQuestion.endsWith('?')
    ? `${cleanedQuestion.replace(/\?+$/, '')}: _____.`
    : `${cleanedQuestion} _____.`;
}

function ensureFourFillChoices(correctAnswers: string[], rawChoices: string[]) {
  const correct = uniqueByText(correctAnswers).slice(0, 1);
  // V6.84.5: không tự bịa phương án nhiễu chung chung. Nếu AI không tạo đủ
  // 4 lựa chọn chất lượng, Question Quality Gate sẽ loại câu và yêu cầu lần tạo
  // sau tuân thủ prompt thay vì đưa câu hỏi kém chất lượng cho học sinh.
  return uniqueByText([...correct, ...rawChoices]).slice(0, 4);
}

function normalizeLevel(value: unknown) {
  const normalized = String(value || '').trim().toLowerCase();
  if (['nhan_biet', 'nhận biết', 'nhanbiet'].includes(normalized)) return 'nhan_biet';
  if (['thong_hieu', 'thông hiểu', 'thonghieu'].includes(normalized)) return 'thong_hieu';
  if (['van_dung', 'vận dụng', 'vandung'].includes(normalized)) return 'van_dung';
  return normalized || 'nhan_biet';
}

function mapTrueFalseLabel(value: unknown) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (['true', 'đúng', 'dung'].includes(normalized)) return 'Đúng';
  if (['false', 'sai'].includes(normalized)) return 'Sai';
  return cleanTextValue(value ?? '') || 'Đúng';
}

function safeQuizArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      const raw = item as any;
      const type = normalizeQuestionType(raw?.type || raw?.loai_cau_hoi || raw?.questionType);
      const explanation = cleanTextValue(raw?.explanation ?? raw?.giai_thich ?? '');
      const hint = cleanTextValue(raw?.hint ?? raw?.goi_y ?? '');
      const sourceSection = cleanTextValue(raw?.sourceSection ?? raw?.nguon_muc ?? '');
      const level = normalizeLevel(raw?.level ?? raw?.muc_do);
      const requirementIds = safeArray(raw?.requirement_ids ?? raw?.curriculum_requirement_ids ?? raw?.yccd_ids);
      const assessmentEvidence = cleanTextValue(raw?.assessment_evidence ?? raw?.minh_chung_danh_gia ?? '');
      const wrongAnswerExplanations = typeof raw?.wrongAnswerExplanations === 'object' && raw?.wrongAnswerExplanations
        ? Object.fromEntries(
            Object.entries(raw.wrongAnswerExplanations).map(([key, val]) => [cleanTextValue(key), cleanTextValue(val ?? '')]).filter(([, val]) => val),
          )
        : undefined;

      if (type === 'true_false') {
        const question = cleanTextValue(raw?.question ?? raw?.statement ?? raw?.cau_hoi ?? '');
        const correctAnswer = mapTrueFalseLabel(raw?.correctAnswer ?? raw?.dap_an ?? raw?.answer);
        if (!question || !correctAnswer) return null;
        const result: QuizQuestion = {
          id: String(raw?.id || `TF${index + 1}`),
          requirement_ids: requirementIds,
          assessment_evidence: assessmentEvidence,
          type,
          question,
          options: ['Đúng', 'Sai'],
          correctAnswer,
          explanation,
          level,
          hint,
          sourceSection,
          source: cleanTextValue(raw?.source ?? raw?.nguon ?? ''),
        };
        return result;
      }

      if (type === 'fill_in_blank') {
        const rawQuestion = cleanTextValue(raw?.sentence ?? raw?.question ?? raw?.cau_hoi ?? raw?.prompt ?? '');
        const explicitAnswers = safeArray(raw?.correctAnswers ?? raw?.dap_an_dung ?? raw?.answers);
        const fallbackAnswer = compactAnswerPhrase(raw?.correctAnswer ?? raw?.dap_an ?? raw?.answer ?? raw?.suggestedAnswer ?? raw?.suggested_answer ?? raw?.dap_an_goi_y ?? raw?.goi_y_dap_an ?? '');
        const correctAnswers = explicitAnswers.length ? explicitAnswers.slice(0, 1) : fallbackAnswer ? [fallbackAnswer] : [];
        if (!rawQuestion || !correctAnswers.length) return null;
        const choices = ensureFourFillChoices(correctAnswers, safeArray(raw?.choices ?? raw?.options ?? raw?.lua_chon));
        const sentence = ensureFillSentence(rawQuestion, correctAnswers[0]);
        const result: QuizQuestion = {
          id: String(raw?.id || `FB${index + 1}`),
          requirement_ids: requirementIds,
          assessment_evidence: assessmentEvidence,
          type: 'fill_in_blank',
          question: sentence,
          sentence,
          choices,
          correctAnswers,
          explanation,
          level,
          hint,
          sourceSection,
          source: cleanTextValue(raw?.source ?? raw?.nguon ?? ''),
        };
        return result;
      }

      const options = Array.isArray(raw?.options)
        ? raw.options.map((option: unknown) => String(option ?? '').trim()).filter(Boolean)
        : [];
      const correctAnswer = cleanTextValue(raw?.correctAnswer ?? raw?.dap_an ?? '');
      const question = cleanTextValue(raw?.question ?? raw?.cau_hoi ?? '');
      if (!question || options.length < 2 || !correctAnswer) return null;
      const result = sanitizeQuizQuestion({
        id: String(raw?.id || `SC${index + 1}`),
        requirement_ids: requirementIds,
        assessment_evidence: assessmentEvidence,
        type: 'single_choice',
        question,
        options,
        correctAnswer,
        explanation,
        level,
        hint,
        sourceSection,
        source: cleanTextValue(raw?.source ?? raw?.nguon ?? ''),
        suggestedAnswer: cleanTextValue(raw?.suggestedAnswer ?? raw?.suggested_answer ?? raw?.dap_an_goi_y ?? ''),
        rubric: cleanTextValue(raw?.rubric ?? raw?.tieu_chi_cham ?? ''),
        wrongAnswerExplanations,
      });
      // Một câu trắc nghiệm có ít hơn 2 lựa chọn khác nhau sau khi loại trùng
      // không đủ chất lượng để đưa vào bài kiểm tra.
      return (result.options?.length || 0) >= 2 && result.correctAnswer ? result : null;
    })
    .filter(Boolean)
    .map((question) => sanitizeQuizQuestion(question as QuizQuestion))
    .filter((question) => isQuizQuestionQualityAcceptable(question)) as LessonContent['luyen_tap']['trac_nghiem'];
}

export function getVietnameseLevelLabel(level?: string) {
  const normalized = normalizeLevel(level);
  if (normalized === 'thong_hieu') return 'Thông hiểu';
  if (normalized === 'van_dung') return 'Vận dụng';
  return 'Nhận biết';
}


function toQuestionIdPrefix(type: QuizQuestionType) {
  if (type === 'true_false') return 'TF';
  if (type === 'fill_in_blank') return 'FB';
  
  return 'SC';
}

function normalizeContentBlocks(blocks: any[]): any[] {
  if (!Array.isArray(blocks)) return [];
  return blocks
    .map((block) => ({
      type: ['paragraph', 'key_point', 'example', 'note', 'activity'].includes(String(block?.type || '')) ? block.type : 'paragraph',
      title: cleanTextValue(block?.title || block?.tieu_de || block?.heading || block?.label || ''),
      category: cleanTextValue(block?.category || block?.nhom_noi_dung || block?.loai || ''),
      theme: cleanTextValue(block?.theme || block?.mau_nen || block?.color || ''),
      text: cleanTextValue(block?.text || block?.content || block?.noi_dung || ''),
    }))
    .filter((block) => block.text || block.title);
}

function normalizeSectionV2(section: any, index: number) {
  const interactive = safeQuizArray(section?.interactive_questions || section?.cau_hoi_tuong_tac || section?.questions || []);
  const contentBlocks = normalizeContentBlocks(section?.content_blocks || section?.blocks || section?.noi_dung_khoi || []);
  return {
    section_id: cleanTextValue(section?.section_id || section?.id || `S${index + 1}`),
    title: cleanTextValue(section?.title || section?.tieu_de || section?.tieu_muc || `Nội dung ${index + 1}`),
    content: cleanTextValue(section?.content || section?.noi_dung || (Array.isArray(section?.noi_dung_chinh) ? section.noi_dung_chinh.join('\\n') : '')),
    content_blocks: contentBlocks.length ? contentBlocks : undefined,
    summary: cleanTextValue(section?.summary || section?.ghi_nho || section?.tom_tat || ''),
    source_note: cleanTextValue(section?.source_note || section?.ghi_nho || section?.summary || ''),
    examples: safeArray(section?.examples || section?.vi_du),
    youtube_url: cleanTextValue(section?.youtube_url || section?.video_url || ''),
    youtube_embed_url: cleanTextValue(section?.youtube_embed_url || section?.youtube_url || section?.video_url || ''),
    interactive_questions: interactive.map((q, qIndex) => ({ ...q, id: q.id || `${toQuestionIdPrefix(q.type || 'single_choice')}_S${index + 1}_${qIndex + 1}` })),
  };
}

function buildLegacyFromV2(sections: ReturnType<typeof normalizeSectionV2>[], finalQuiz: QuizQuestion[]) {
  return {
    hinh_thanh_kien_thuc: sections.map((section, index) => ({
      id: section.section_id || `M${index + 1}`,
      tieu_muc: section.title,
      muc_tieu: '',
      noi_dung_chinh: section.content ? section.content.split(/\n+/).filter(Boolean) : [],
      vi_du: section.examples || [],
      ghi_nho: section.summary ? [section.summary] : [],
      cau_hoi_nhanh: (section.interactive_questions || []).map((q) => q.question || q.sentence || '').filter(Boolean),
    })),
    luyen_tap: {
      muc_tieu: 'Củng cố kiến thức thông qua câu hỏi tương tác và bài tập cuối bài.',
      trac_nghiem: [...sections.flatMap((section) => section.interactive_questions || []), ...finalQuiz],
      tu_luan_ngan: [],
      bai_tap_nhanh: [],
    },
  };
}

function normalizeLessonV2(raw: any): LessonContent {
  const metadata = raw?.metadata || {};
  const settings = raw?.settings || {};
  const sections = (Array.isArray(raw?.sections) ? raw.sections : [])
    .map((section: any, index: number) => normalizeSectionV2(section, index))
    .filter((section: ReturnType<typeof normalizeSectionV2>) => section.title || section.content);
  const finalQuiz = safeQuizArray(raw?.final_quiz || raw?.finalQuiz || raw?.bai_tap_cuoi_bai || []);
  const questionBank = safeQuizArray(raw?.question_bank || raw?.questionBank || raw?.ngan_hang_cau_hoi || []);
  const legacy = buildLegacyFromV2(sections, finalQuiz);
  const assessment = raw?.assessment || {};
  return {
    schema_version: 'lesson_v2',
    title: cleanTextValue(raw?.title || metadata?.tieu_de || ''),
    intro_video_url: cleanTextValue(raw?.intro_video_url || raw?.lesson_video_url || raw?.video_bai_hoc_url || ''),
    intro_video_embed_url: cleanTextValue(raw?.intro_video_embed_url || raw?.intro_video_url || raw?.lesson_video_url || raw?.video_bai_hoc_url || ''),
    settings: {
      content_count: Number(settings.content_count || sections.length || 4),
      interactive_questions_per_section: Number(settings.interactive_questions_per_section || 1),
      final_quiz_count: Number(settings.final_quiz_count || finalQuiz.length || 10),
      final_quiz_source_mode: settings.final_quiz_source_mode === 'random_bank' ? 'random_bank' : 'fixed',
      question_bank_size: Number(settings.question_bank_size || questionBank.length || Math.max(30, finalQuiz.length)),
      question_mix: settings.question_mix || 'mixed',
      difficulty: settings.difficulty || 'medium',
      include_examples: settings.include_examples !== false,
      include_summary: settings.include_summary !== false,
      allow_retry: settings.allow_retry !== false,
      show_explanation: settings.show_explanation !== false,
      interactive_weight: 0,
      final_quiz_weight: 100,
      pass_score: Number(settings.pass_score || assessment.pass_score || 5),
      lesson_time_minutes: Number(settings.lesson_time_minutes || 45),
      auto_finish_lesson_on_timeout: settings.auto_finish_lesson_on_timeout !== false,
      final_exam_time_minutes: Number(settings.final_exam_time_minutes || 15),
      shuffle_final_questions: settings.shuffle_final_questions !== false,
      shuffle_final_options: settings.shuffle_final_options !== false,
      show_final_answers_after_submit: settings.show_final_answers_after_submit !== false,
      show_final_explanations_after_submit: settings.show_final_explanations_after_submit !== false,
      allow_exam_retry: settings.allow_exam_retry !== false,
      max_exam_attempts: Number(settings.max_exam_attempts || 2),
      exam_score_policy: settings.exam_score_policy || 'best',
      ai_instructions: cleanTextValue(settings.ai_instructions || ''),
    },
    sections,
    final_quiz: finalQuiz.map((q, index) => ({ ...q, id: q.id || `FQ${index + 1}` })),
    question_bank: (questionBank.length ? questionBank : finalQuiz).map((q, index) => ({ ...q, id: q.id || `QB${index + 1}` })),
    assessment: {
      interactive_weight: 0,
      final_quiz_weight: 100,
      score_scale: Number(assessment.score_scale || 10),
      pass_score: Number(assessment.pass_score || settings.pass_score || 5),
    },
    metadata: {
      tieu_de: cleanTextValue(metadata.tieu_de || raw?.title || ''),
      mon_hoc: cleanTextValue(metadata.mon_hoc || ''),
      khoi: cleanTextValue(metadata.khoi || ''),
      chu_de: cleanTextValue(metadata.chu_de || ''),
      tom_tat: cleanTextValue(metadata.tom_tat || raw?.summary || ''),
      muc_tieu_bai_hoc: safeArray(metadata.muc_tieu_bai_hoc || raw?.objectives || raw?.muc_tieu_bai_hoc),
      tu_khoa: safeArray(metadata.tu_khoa || raw?.tu_khoa),
      thong_diep_chinh: cleanTextValue(metadata.thong_diep_chinh || ''),
      thoi_luong_goi_y: cleanTextValue(metadata.thoi_luong_goi_y || ''),
    },
    khoi_dong: {
      muc_tieu: '',
      tinh_huong: cleanTextValue(raw?.intro || raw?.khoi_dong?.tinh_huong || ''),
      yeu_cau: '',
      cau_hoi_goi_mo: safeArray(raw?.khoi_dong?.cau_hoi_goi_mo),
      dap_an_goi_y: safeArray(raw?.khoi_dong?.dap_an_goi_y),
      tu_khoa_mo_dau: safeArray(raw?.khoi_dong?.tu_khoa_mo_dau),
    },
    hinh_thanh_kien_thuc: legacy.hinh_thanh_kien_thuc,
    luyen_tap: legacy.luyen_tap,
    van_dung: {
      muc_tieu: '',
      nhiem_vu: safeArray(raw?.van_dung?.nhiem_vu),
      goi_y: safeArray(raw?.van_dung?.goi_y),
      san_pham_mong_doi: safeArray(raw?.van_dung?.san_pham_mong_doi),
    },
    tong_ket: {
      ghi_nho_trong_tam: sections.map((section) => section.summary || '').filter(Boolean),
      canh_bao_loi_sai: [],
      loi_khuyen_hoc: [],
    },
    tro_ly_ai: raw?.tro_ly_ai || {},
    raw_text_excerpt: cleanTextValue(raw?.raw_text_excerpt || ''),
  };
}

function presentationWordCount(value: unknown) {
  return cleanTextValue(value).split(/\s+/).filter(Boolean).length;
}

function splitPresentationText(value: string, maxWords = 55) {
  const cleaned = cleanTextValue(value);
  if (!cleaned || presentationWordCount(cleaned) <= maxWords) return cleaned ? [cleaned] : [];
  const sentences = cleaned.split(/(?<=[.!?])\s+/).map((item) => item.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = '';
  const pushCurrent = () => { if (current.trim()) chunks.push(current.trim()); current = ''; };
  for (const sentence of sentences.length > 1 ? sentences : [cleaned]) {
    const sentenceWords = sentence.split(/\s+/).filter(Boolean);
    if (sentenceWords.length > maxWords) {
      pushCurrent();
      for (let i = 0; i < sentenceWords.length; i += maxWords) chunks.push(sentenceWords.slice(i, i + maxWords).join(' '));
      continue;
    }
    const candidate = current ? `${current} ${sentence}` : sentence;
    if (presentationWordCount(candidate) > maxWords) pushCurrent();
    current = current ? `${current} ${sentence}` : sentence;
  }
  pushCurrent();
  return chunks;
}

function splitPresentationBlock(block: any) {
  const parts = splitPresentationText(cleanTextValue(block?.text || ''), 58);
  if (parts.length <= 1) return [{ ...block, text: parts[0] || cleanTextValue(block?.text || '') }];
  return parts.map((part, index) => ({
    ...block,
    title: index === 0 ? cleanTextValue(block?.title || '') : cleanTextValue(block?.title || '') ? `${cleanTextValue(block.title)} (tiếp)` : '',
    text: part,
  }));
}

function normalizePageVisual(page: any) {
  const visual = page?.visual || {};
  const allowedTypes = ['none', 'icon_cards', 'hub_spoke', 'process', 'comparison', 'timeline', 'device_diagram', 'concept_map', 'numbered_steps'];
  const explicitType = cleanTextValue(visual?.type || page?.visual_type || page?.kieu_minh_hoa || '');
  const explicitItemsSource = visual?.items || page?.visual_items || page?.noi_dung_minh_hoa || [];
  const legacyItemsSource = page?.illustration_keywords || page?.tu_khoa_minh_hoa || [];
  const itemsSource = Array.isArray(explicitItemsSource) && explicitItemsSource.length ? explicitItemsSource : legacyItemsSource;
  const items = Array.isArray(itemsSource) ? itemsSource.map((item: any) => cleanTextValue(item)).filter(Boolean).slice(0, 5) : [];
  const layout = String(page?.layout || '');
  const derivedType = items.length
    ? (['task', 'story_visual'].includes(layout) ? 'hub_spoke'
      : ['process', 'process_steps'].includes(layout) ? 'process'
        : ['comparison', 'compare_grid', 'two_column'].includes(layout) ? 'comparison'
          : layout === 'timeline' ? 'timeline'
            : ['visual_explain', 'image_explain'].includes(layout) ? 'icon_cards'
              : 'concept_map')
    : 'none';
  return {
    type: allowedTypes.includes(explicitType) ? explicitType : derivedType,
    title: cleanTextValue(visual?.title || page?.visual_title || page?.tieu_de_minh_hoa || ''),
    items,
    center_label: cleanTextValue(visual?.center_label || page?.visual_center_label || page?.nhan_trung_tam || ''),
    relationship: cleanTextValue(visual?.relationship || page?.visual_relationship || page?.moi_quan_he || ''),
  };
}

function normalizePresentationPage(page: any, activityIndex: number, pageIndex: number) {
  const blocks = normalizeContentBlocks(page?.blocks || page?.content_blocks || page?.noi_dung || []);
  const fallbackText = cleanTextValue(page?.content || page?.text || '');
  const allowedLayouts = ['title_content', 'concept_focus', 'example_focus', 'two_column', 'image_explain', 'compare_grid', 'process_steps', 'highlight', 'timeline', 'remember', 'task', 'hero_concept', 'story_visual', 'visual_explain', 'comparison', 'process', 'card_grid'];
  return {
    page_id: cleanTextValue(page?.page_id || page?.id || `A${activityIndex + 1}_P${pageIndex + 1}`),
    title: cleanTextValue(page?.title || page?.tieu_de || `Trang ${pageIndex + 1}`),
    subtitle: cleanTextValue(page?.subtitle || page?.mo_ta || ''),
    layout: allowedLayouts.includes(String(page?.layout || '')) ? page.layout : 'title_content',
    blocks: blocks.length ? blocks : (fallbackText ? [{ type: 'paragraph', title: '', category: 'giai_thich', theme: 'blue', text: fallbackText }] : []),
    teacher_notes: cleanTextValue(page?.teacher_notes || page?.loi_dan_giao_vien || ''),
    student_prompt: cleanTextValue(page?.student_prompt || page?.nhiem_vu_hoc_sinh || ''),
    visual_hint: cleanTextValue(page?.visual_hint || page?.goi_y_trinh_bay || page?.goi_y_minh_hoa || ''),
    illustration_keywords: Array.isArray(page?.illustration_keywords || page?.tu_khoa_minh_hoa) ? (page?.illustration_keywords || page?.tu_khoa_minh_hoa).map((item: any) => cleanTextValue(item)).filter(Boolean).slice(0, 6) : [],
    visual: normalizePageVisual(page),
  };
}

function applyPresentationQualityGuard(pages: any[], activityIndex: number) {
  const guarded: any[] = [];
  pages.forEach((page, sourceIndex) => {
    const splitBlocks = (page.blocks || []).flatMap((block: any) => splitPresentationBlock(block)).filter((block: any) => cleanTextValue(block.text || block.title));
    if (!splitBlocks.length) {
      guarded.push(page);
      return;
    }
    const groups: any[][] = [];
    let current: any[] = [];
    let currentWords = 0;
    splitBlocks.forEach((block: any) => {
      const blockWords = presentationWordCount(block.text);
      if (current.length && (current.length >= 3 || currentWords + blockWords > 105)) {
        groups.push(current);
        current = [];
        currentWords = 0;
      }
      current.push(block);
      currentWords += blockWords;
    });
    if (current.length) groups.push(current);

    groups.forEach((group, groupIndex) => {
      const isFirst = groupIndex === 0;
      const isLast = groupIndex === groups.length - 1;
      const continuationTitle = cleanTextValue(group[0]?.title || '');
      guarded.push({
        ...page,
        page_id: isFirst ? page.page_id : `${page.page_id}_Q${groupIndex + 1}`,
        title: isFirst ? page.title : (continuationTitle && continuationTitle.toLowerCase() !== cleanTextValue(page.title).toLowerCase() ? continuationTitle : `${page.title} – tiếp theo`),
        blocks: group,
        teacher_notes: isFirst ? page.teacher_notes : '',
        student_prompt: isLast ? page.student_prompt : '',
        visual: isFirst ? page.visual : { type: 'none', title: '', items: [], center_label: '', relationship: '' },
        visual_hint: isFirst ? page.visual_hint : '',
        illustration_keywords: isFirst ? page.illustration_keywords : [],
      });
    });
  });
  return guarded.map((page, pageIndex) => ({
    ...page,
    page_id: cleanTextValue(page.page_id || `A${activityIndex + 1}_P${pageIndex + 1}`),
  }));
}

function normalizeActivityV3(activity: any, index: number) {
  const normalizedPages = (Array.isArray(activity?.pages) ? activity.pages : []).map((page: any, pageIndex: number) => normalizePresentationPage(page, index, pageIndex));
  const pages = applyPresentationQualityGuard(normalizedPages, index);
  const interactions = safeQuizArray(activity?.interactions || activity?.interactive_questions || activity?.questions || []);
  return {
    activity_id: cleanTextValue(activity?.activity_id || activity?.id || `A${index + 1}`),
    requirement_ids: safeArray(activity?.requirement_ids || activity?.curriculum_requirement_ids || activity?.yccd_ids),
    title: cleanTextValue(activity?.title || activity?.tieu_de || `Hoạt động ${index + 1}`),
    objective: cleanTextValue(activity?.objective || activity?.muc_tieu || ''),
    activity_type: cleanTextValue(activity?.activity_type || activity?.loai_hoat_dong || (index === 0 ? 'warmup' : 'knowledge')) as any,
    estimated_minutes: Math.max(1, Number(activity?.estimated_minutes || activity?.thoi_gian_phut || 8)),
    pages,
    interactions: interactions.map((q, qIndex) => ({ ...q, id: q.id || `${toQuestionIdPrefix(q.type || 'single_choice')}_A${index + 1}_${qIndex + 1}` })),
    summary: cleanTextValue(activity?.summary || activity?.ghi_nho || ''),
    released: activity?.released === true,
    locked: activity?.locked === true,
  };
}

function normalizeLessonV3(raw: any): LessonContent {
  const base = normalizeLessonV2({ ...raw, schema_version: 'lesson_v2', sections: raw?.sections || [], final_quiz: raw?.final_quiz || [] });
  const activities = (Array.isArray(raw?.activities) ? raw.activities : [])
    .map((activity: any, index: number) => normalizeActivityV3(activity, index))
    .filter((activity: any) => activity.title);
  const syntheticSections = activities.map((activity: any, index: number) => normalizeSectionV2({
    section_id: activity.activity_id,
    title: activity.title,
    content: activity.pages.flatMap((page: any) => page.blocks || []).map((block: any) => block.text || '').filter(Boolean).join('\n\n'),
    content_blocks: activity.pages.flatMap((page: any) => page.blocks || []),
    summary: activity.summary,
    interactive_questions: activity.interactions,
  }, index));
  const legacy = buildLegacyFromV2(syntheticSections, base.final_quiz || []);
  const rawMetadata = raw?.metadata || {};
  return {
    ...base,
    schema_version: 'lesson_v3',
    metadata: {
      ...base.metadata,
      curriculum_program: cleanTextValue(rawMetadata.curriculum_program || ''),
      curriculum_version: cleanTextValue(rawMetadata.curriculum_version || ''),
      textbook_series: cleanTextValue(rawMetadata.textbook_series || ''),
      textbook_catalog_version: cleanTextValue(rawMetadata.textbook_catalog_version || ''),
      textbook_lesson_id: cleanTextValue(rawMetadata.textbook_lesson_id || ''),
      textbook_lesson_code: cleanTextValue(rawMetadata.textbook_lesson_code || ''),
      textbook_topic_id: cleanTextValue(rawMetadata.textbook_topic_id || ''),
      curriculum_requirement_ids: safeArray(rawMetadata.curriculum_requirement_ids),
      curriculum_requirements: Array.isArray(rawMetadata.curriculum_requirements)
        ? rawMetadata.curriculum_requirements.map((item: any) => ({ id: cleanTextValue(item?.id), text: cleanTextValue(item?.text), competency: cleanTextValue(item?.competency), source_kind: cleanTextValue(item?.source_kind) as 'official_normalized' | 'normalized_profile', source_url: cleanTextValue(item?.source_url) })).filter((item: any) => item.id && item.text)
        : [],
      curriculum_source_url: cleanTextValue(rawMetadata.curriculum_source_url || ''),
      textbook_source_url: cleanTextValue(rawMetadata.textbook_source_url || ''),
    },
    activities,
    sections: syntheticSections,
    hinh_thanh_kien_thuc: legacy.hinh_thanh_kien_thuc,
    luyen_tap: legacy.luyen_tap,
  };
}

export function normalizeLessonContent(raw: any): LessonContent {
  if (raw?.schema_version === 'lesson_v3' || Array.isArray(raw?.activities)) return normalizeLessonV3(raw);
  if (raw?.schema_version === 'lesson_v2' || Array.isArray(raw?.sections) || Array.isArray(raw?.final_quiz)) {
    return normalizeLessonV2(raw);
  }
  const metadata = raw?.metadata || {};
  const khoiDong = raw?.khoi_dong || {};
  const htk = Array.isArray(raw?.hinh_thanh_kien_thuc) ? raw.hinh_thanh_kien_thuc : [];
  const luyenTap = raw?.luyen_tap || {};
  const vanDung = raw?.van_dung || {};
  const tongKet = raw?.tong_ket || {};
  const troLyAI = raw?.tro_ly_ai || {};

  return {
    metadata: {
      tieu_de: cleanTextValue(metadata.tieu_de || raw?.title || ''),
      mon_hoc: cleanTextValue(metadata.mon_hoc || ''),
      khoi: cleanTextValue(metadata.khoi || ''),
      chu_de: cleanTextValue(metadata.chu_de || ''),
      tom_tat: cleanTextValue(metadata.tom_tat || raw?.summary || ''),
      muc_tieu_bai_hoc: safeArray(metadata.muc_tieu_bai_hoc || raw?.muc_tieu_bai_hoc),
      tu_khoa: safeArray(metadata.tu_khoa || raw?.tu_khoa),
      thong_diep_chinh: cleanTextValue(metadata.thong_diep_chinh || ''),
      thoi_luong_goi_y: cleanTextValue(metadata.thoi_luong_goi_y || ''),
    },
    khoi_dong: {
      muc_tieu: cleanTextValue(khoiDong.muc_tieu || ''),
      tinh_huong: cleanTextValue(khoiDong.tinh_huong || ''),
      yeu_cau: cleanTextValue(khoiDong.yeu_cau || ''),
      cau_hoi_goi_mo: safeArray(khoiDong.cau_hoi_goi_mo),
      dap_an_goi_y: safeArray(khoiDong.dap_an_goi_y),
      tu_khoa_mo_dau: safeArray(khoiDong.tu_khoa_mo_dau),
    },
    hinh_thanh_kien_thuc: htk
      .map((item: any, index: number) => ({
        id: String(item?.id || `M${index + 1}`),
        tieu_muc: cleanTextValue(item?.tieu_muc || item?.tieu_de || ''),
        muc_tieu: cleanTextValue(item?.muc_tieu || ''),
        noi_dung_chinh: safeArray(item?.noi_dung_chinh || item?.noi_dung || item?.y_chinh),
        vi_du: safeArray(item?.vi_du),
        ghi_nho: safeArray(item?.ghi_nho),
        cau_hoi_nhanh: safeArray(item?.cau_hoi_nhanh),
      }))
      .filter((item) => item.tieu_muc || item.noi_dung_chinh.length),
    luyen_tap: {
      muc_tieu: cleanTextValue(luyenTap.muc_tieu || ''),
      trac_nghiem: safeQuizArray(luyenTap.trac_nghiem || luyenTap.cau_hoi),
      tu_luan_ngan: safeArray(luyenTap.tu_luan_ngan),
      bai_tap_nhanh: safeArray(luyenTap.bai_tap_nhanh),
    },
    van_dung: {
      muc_tieu: cleanTextValue(vanDung.muc_tieu || ''),
      nhiem_vu: safeArray(vanDung.nhiem_vu),
      goi_y: safeArray(vanDung.goi_y),
      san_pham_mong_doi: safeArray(vanDung.san_pham_mong_doi),
    },
    tong_ket: {
      ghi_nho_trong_tam: safeArray(tongKet.ghi_nho_trong_tam || raw?.ghi_nho_trong_tam),
      canh_bao_loi_sai: safeArray(tongKet.canh_bao_loi_sai),
      loi_khuyen_hoc: safeArray(tongKet.loi_khuyen_hoc),
    },
    tro_ly_ai: {
      khoi_dong: safeArray(troLyAI.khoi_dong),
      hinh_thanh_kien_thuc: safeArray(troLyAI.hinh_thanh_kien_thuc),
      luyen_tap: safeArray(troLyAI.luyen_tap),
      van_dung: safeArray(troLyAI.van_dung),
    },
    raw_text_excerpt: cleanTextValue(raw?.raw_text_excerpt || ''),
  };
}

export function upgradeLessonToV3(content: LessonContent): LessonContent {
  const normalized = normalizeLessonContent(content);
  if (normalized.schema_version === 'lesson_v3' && normalized.activities?.length) return normalized;

  const sections = normalized.sections || [];
  const activities = sections.map((section, index) => {
    const sourceBlocks = section.content_blocks?.length
      ? section.content_blocks
      : (section.content ? [{ type: 'paragraph' as const, title: '', category: 'giai_thich', theme: 'blue', text: section.content }] : []);
    const pageGroups = sourceBlocks.length > 3
      ? [sourceBlocks.slice(0, Math.ceil(sourceBlocks.length / 2)), sourceBlocks.slice(Math.ceil(sourceBlocks.length / 2))]
      : [sourceBlocks];
    const pages: LessonPresentationPage[] = pageGroups.filter((group) => group.length).map((blocks, pageIndex) => ({
      page_id: `A${index + 1}_P${pageIndex + 1}`,
      title: pageIndex === 0 ? (section.title || `Hoạt động ${index + 1}`) : `${section.title || `Hoạt động ${index + 1}`} – tiếp theo`,
      subtitle: '',
      layout: pageIndex === pageGroups.length - 1 && section.summary ? 'remember' as const : 'hero_concept' as const,
      blocks,
      teacher_notes: '',
      student_prompt: '',
      visual: { type: 'concept_map' as const, title: '', center_label: section.title || `Hoạt động ${index + 1}`, items: blocks.map((block) => cleanTextValue(block.title || '')).filter(Boolean).slice(0, 4), relationship: '' },
    }));
    if (section.summary && !pages.some((page) => page.layout === 'remember')) {
      pages.push({
        page_id: `A${index + 1}_P${pages.length + 1}`,
        title: 'Ghi nhớ',
        subtitle: '',
        layout: 'remember' as const,
        blocks: [{ type: 'key_point' as const, title: 'Ghi nhớ', category: 'ghi_nho', theme: 'emerald', text: section.summary }],
        teacher_notes: '',
        student_prompt: '',
        visual: { type: 'none' as const, title: '', center_label: '', items: [], relationship: '' },
      });
    }
    if (!pages.length) {
      pages.push({
        page_id: `A${index + 1}_P1`,
        title: section.title || `Hoạt động ${index + 1}`,
        subtitle: '',
        layout: 'hero_concept' as const,
        blocks: [],
        teacher_notes: '',
        student_prompt: '',
        visual: { type: 'none' as const, title: '', center_label: '', items: [], relationship: '' },
      });
    }
    return {
      activity_id: section.section_id || `A${index + 1}`,
      title: section.title || `Hoạt động ${index + 1}`,
      objective: section.summary || '',
      activity_type: index === 0 ? 'warmup' : 'knowledge',
      estimated_minutes: index === 0 ? 5 : 8,
      pages,
      interactions: section.interactive_questions || [],
      summary: section.summary || '',
      released: false,
      locked: true,
    };
  });

  return normalizeLessonV3({ ...normalized, schema_version: 'lesson_v3', activities });
}

function stripCodeFence(text: string) {
  return String(text || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/i, '')
    .trim();
}

function sliceLikelyJson(text: string) {
  const source = stripCodeFence(text);
  const first = source.indexOf('{');
  const last = source.lastIndexOf('}');
  if (first < 0 || last <= first) return source;
  return source.slice(first, last + 1).trim();
}

function escapeUnsafeJsonStringChars(jsonText: string) {
  let output = '';
  let inString = false;
  let escaped = false;

  for (let i = 0; i < jsonText.length; i += 1) {
    const char = jsonText[i];

    if (!inString) {
      output += char;
      if (char === '"') {
        inString = true;
        escaped = false;
      }
      continue;
    }

    if (escaped) {
      output += char;
      escaped = false;
      continue;
    }

    if (char === '\\') {
      output += char;
      escaped = true;
      continue;
    }

    if (char === '\n') {
      output += '\\n';
      continue;
    }

    if (char === '\r') {
      output += '\\r';
      continue;
    }

    if (char === '\t') {
      output += '\\t';
      continue;
    }

    if (char === '"') {
      let nextIndex = i + 1;
      while (nextIndex < jsonText.length && /\s/.test(jsonText[nextIndex])) nextIndex += 1;
      const next = jsonText[nextIndex] || '';
      if (next === ':' || next === ',' || next === '}' || next === ']') {
        output += char;
        inString = false;
      } else {
        output += '\\"';
      }
      continue;
    }

    output += char;
  }

  return output;
}

function removeTrailingCommas(jsonText: string) {
  return jsonText.replace(/,\s*([}\]])/g, '$1');
}

function insertLikelyMissingCommas(jsonText: string) {
  let output = '';
  let inString = false;
  let escaped = false;

  const isValueStarter = (char: string) => /[\"{\[\-0-9tfn]/.test(char || '');
  const nextMeaningfulChar = (index: number) => {
    let nextIndex = index + 1;
    while (nextIndex < jsonText.length && /\s/.test(jsonText[nextIndex])) nextIndex += 1;
    return jsonText[nextIndex] || '';
  };

  for (let i = 0; i < jsonText.length; i += 1) {
    const char = jsonText[i];

    if (inString) {
      output += char;
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = false;
        const next = nextMeaningfulChar(i);
        if (isValueStarter(next)) output += ',';
      }
      continue;
    }

    output += char;

    if (char === '"') {
      inString = true;
      escaped = false;
      continue;
    }

    if (char === '}' || char === ']') {
      const next = nextMeaningfulChar(i);
      if (isValueStarter(next)) output += ',';
    }
  }

  return output
    .replace(/}\s*{/g, '},{')
    .replace(/]\s*{/g, '],{')
    .replace(/}\s*\[/g, '},[')
    .replace(/]\s*\[/g, '],[')
    .replace(/\"\s*\"(?=\s*[:{\[])/g, '\",\"');
}

function balanceJsonClosers(jsonText: string) {
  let inString = false;
  let escaped = false;
  const stack: string[] = [];

  for (const char of jsonText) {
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"') inString = false;
      continue;
    }

    if (char === '"') {
      inString = true;
      escaped = false;
      continue;
    }
    if (char === '{') stack.push('}');
    if (char === '[') stack.push(']');
    if ((char === '}' || char === ']') && stack[stack.length - 1] === char) stack.pop();
  }

  return jsonText + stack.reverse().join('');
}

function normalizeJsonLikeText(text: string) {
  return stripCodeFence(text)
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\uFEFF/g, '')
    .trim();
}

function buildJsonParseAttempts(candidate: string) {
  const normalized = normalizeJsonLikeText(candidate);
  const sliced = sliceLikelyJson(normalized);
  const noTrailing = removeTrailingCommas(sliced);
  const escaped = escapeUnsafeJsonStringChars(noTrailing);
  const missingCommas = removeTrailingCommas(insertLikelyMissingCommas(escaped));
  const balanced = removeTrailingCommas(balanceJsonClosers(missingCommas));

  return Array.from(new Set([
    normalized,
    sliced,
    noTrailing,
    escaped,
    missingCommas,
    balanced,
  ].filter(Boolean)));
}

function tryParseJsonCandidate(candidate: string) {
  const attempts = buildJsonParseAttempts(candidate);

  let lastError: unknown = null;
  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('AI không trả về JSON hợp lệ.');
}

function extractJson(text: string) {
  try {
    return tryParseJsonCandidate(text);
  } catch (error) {
    console.warn('[EduSmart][AI] JSON parse failed after local repair attempts.', error);
    throw new Error('Nội dung AI trả về chưa hoàn chỉnh. Hệ thống sẽ thử tạo lại; nếu vẫn chưa được, vui lòng thử lại sau ít phút.');
  }
}

async function repairLessonJsonWithAI(apiKey: string, model: string, brokenJsonText: string, originalError: unknown, runtime?: { signal?: AbortSignal; totalTimeoutMs?: number }) {
  const response = await generateLessonContentReliableRest(apiKey, model, {
    contents: [{
      role: 'user',
      parts: [{ text: `JSON bài học sau bị lỗi cú pháp. Hãy chỉ sửa thành JSON hợp lệ, giữ nguyên nội dung chính và không thêm markdown. Nếu chuỗi có dấu ngoặc kép thô, hãy escape hoặc đổi sang dấu nháy đơn.\n\nLỗi: ${originalError instanceof Error ? originalError.message : String(originalError || '')}\n\nJSON cần sửa:\n${sliceLikelyJson(brokenJsonText).slice(0, 52000)}` }],
    }],
    config: {
      systemInstruction: 'Chỉ sửa cú pháp JSON lesson_v3. Chỉ trả JSON hợp lệ.',
      responseMimeType: 'application/json',
      temperature: 0.02,
    },
  }, {
    label: 'lesson-json-repair',
    signal: runtime?.signal,
    totalTimeoutMs: Math.max(10_000, runtime?.totalTimeoutMs || 30_000),
    attemptTimeoutMs: 22_000,
    maxCandidates: 2,
    primaryAttempts: 1,
  });
  return tryParseJsonCandidate(response.text || '');
}

function buildAnalysisPrompt(
  values: Pick<LessonComposerValues, 'tieu_de' | 'mon_id' | 'khoi' | 'source_text' | 'textbook_series' | 'textbook_catalog_version' | 'textbook_lesson_id' | 'textbook_lesson_code' | 'textbook_topic_id' | 'curriculum_program' | 'curriculum_version' | 'curriculum_requirement_ids'>,
  subjectLabel?: string,
  settings?: LessonBuilderSettings,
) {
  const config = settings || {} as LessonBuilderSettings;
  const coreFinalCount = Math.max(3, Math.min(6, Number(config.final_quiz_count || 10)));
  const requirements = getCurriculumRequirementsByIds(values.curriculum_requirement_ids || []);
  const catalogLesson = getTextbookLessonById(values.textbook_lesson_id);
  const subjectGuidance = getSubjectAssessmentGuidance(subjectLabel || values.mon_id || '');
  const catalogVersion = values.textbook_catalog_version || getTextbookCatalogVersion(subjectLabel || values.mon_id || '') || TEXTBOOK_CATALOG_VERSION;
  const hasNormalizedProfiles = requirements.some((item) => item.sourceKind === 'normalized_profile');
  const curriculumTargetHeading = hasNormalizedProfiles
    ? 'ĐÍCH HỌC TẬP CHUẨN HÓA BÁM CTGDPT 2018'
    : 'YÊU CẦU CẦN ĐẠT ĐƯỢC LIÊN KẾT VỚI CTGDPT 2018';
  const curriculumBlock = requirements.length
    ? requirements.map((item) => `- [${item.id}]${item.sourceKind ? ` [${item.sourceKind}]` : ''} ${item.text}${item.verbs?.length ? ` | Động từ trọng tâm: ${item.verbs.join(', ')}` : ''}`).join('\n')
    : '- Không có YCCD/đích học tập catalog bắt buộc; bám sát học liệu giáo viên cung cấp.';
  return `
Bạn là chuyên gia thiết kế bài học trực tuyến tương tác cho học sinh phổ thông Việt Nam.
Hãy đọc học liệu nguồn và tạo MỘT JSON lesson_v3 hợp lệ. Đây là bản lõi tối ưu cho môi trường web production: ưu tiên đúng kiến thức, đủ cấu trúc và JSON ngắn gọn; hệ thống sẽ tự bổ sung số lượng câu hỏi còn thiếu sau khi nhận kết quả.

Bối cảnh:
- Tiêu đề: ${values.tieu_de || 'Chưa nhập'}
- Môn: ${subjectLabel || values.mon_id || 'Chưa rõ'}
- Khối: ${values.khoi || 'Chưa rõ'}
- Chương trình: ${values.curriculum_program || CURRICULUM_PROGRAM} (${values.curriculum_version || CURRICULUM_VERSION})
- Bộ sách: ${values.textbook_series || TEXTBOOK_SERIES_KNTT}${catalogLesson ? ` – ${catalogLesson.topicTitle}` : ''}
- Mã bài SGK: ${values.textbook_lesson_code || catalogLesson?.lessonCode || 'Bài tùy chỉnh'}
- Phiên bản danh mục: ${catalogVersion}

${curriculumTargetHeading}:
${curriculumBlock}

Nguyên tắc bám chương trình và học liệu:
- Các yêu cầu/đích học tập ở trên là chuẩn đích của phiên tạo bài; KHÔNG được tự sửa sai nghĩa hoặc bịa thêm mã ngoài registry.
${hasNormalizedProfiles ? '- Với mục có source_kind=normalized_profile, đây là mô tả chuẩn hóa phục vụ thiết kế bài, không phải trích nguyên văn pháp lý; phải bám học liệu giáo viên và không được suy diễn vượt phạm vi.\n' : ''}- Học liệu giáo viên tải lên là nguồn nội dung cụ thể ưu tiên. Không đưa kiến thức ngoài phạm vi YCCD và học liệu nếu không thật sự cần để giải thích.
- Mỗi activity phải có requirement_ids là mảng chứa ít nhất một mã YCCD phù hợp trong danh sách trên.
- Mỗi câu interactions/final_quiz phải có requirement_ids và assessment_evidence mô tả ngắn minh chứng học sinh đạt YCCD nào.
- Chọn dạng câu hỏi theo động từ YCCD: “nêu/nhận biết” → nhận biết/thông hiểu; “giải thích/phân biệt” → lí giải/so sánh; “sử dụng/thực hiện/tạo” → tình huống vận dụng/thực hành; “đánh giá” → lựa chọn có căn cứ/lập luận.
- Mục tiêu bài học là sự cụ thể hóa YCCD/đích học tập, không thay thế chuẩn chương trình.
${subjectGuidance ? `- Hướng dẫn đánh giá theo môn: ${subjectGuidance}\n` : ''}
Yêu cầu sư phạm:
1. Tạo 3-6 mục tiêu ngắn gọn và tự chia thành các activity hợp lý theo học liệu; không tách vụn máy móc.
2. Mỗi activity có 1-4 pages theo trình tự phù hợp: tình huống/nhiệm vụ → giải thích/khái niệm → ví dụ/ứng dụng → ghi nhớ. Mỗi page tối đa 3 blocks, ít chữ, phù hợp trình chiếu 16:9.
3. layout chỉ dùng: hero_concept, story_visual, visual_explain, comparison, process, card_grid, remember, task.
4. visual.type chỉ dùng: none, icon_cards, hub_spoke, process, comparison, timeline, device_diagram, concept_map, numbered_steps.
5. content block gồm type, title, category, theme, text; category dùng khai_niem/giai_thich/vi_du/ung_dung/ghi_nho/hoat_dong/lien_he_thuc_te/mo_rong; theme dùng blue/violet/amber/emerald/rose/cyan/orange.
6. Mỗi activity chỉ cần tạo TỐI THIỂU 1 câu interactions chất lượng ở bản lõi. Chỉ dùng single_choice, true_false, fill_in_blank. Hệ thống sẽ tự bổ sung đến ${Number(config.interactive_questions_per_section || 1)} câu/hoạt động sau đó.
7. final_quiz chỉ tạo ${coreFinalCount} câu chất lượng ở bản lõi. Hệ thống sẽ tự hoàn thiện đến ${Number(config.final_quiz_count || 10)} câu. question_bank BẮT BUỘC để [] trong phản hồi để giảm kích thước; hệ thống sẽ dựng ngân hàng ${Number(config.question_bank_size || 30)} câu cục bộ sau đó.
8. Ưu tiên chuyển câu hỏi/hoạt động/luyện tập/vận dụng có sẵn trong học liệu thành câu tương tác; không bịa kiến thức ngoài nguồn.
9. single_choice: đúng 4 options, không có A/B/C/D, correctAnswer trùng chính xác 1 option. true_false: options ["Đúng","Sai"]. fill_in_blank: đúng một _____, đúng 4 choices, correctAnswers đúng 1 choice.
10. explanation phải ngắn gọn và thống nhất với đáp án. Không dùng short_answer. Không xuất HTML thô hoặc markdown.
11. teacher_notes chỉ cho giáo viên; nội dung học sinh nhìn thấy phải nằm trong blocks/student_prompt.
12. Nếu học liệu có Ghi nhớ/Kết luận/Em cần nhớ thì tạo page layout="remember".

Cấu hình phải lưu trong settings:
- interactive_questions_per_section: ${Number(config.interactive_questions_per_section || 1)}
- final_quiz_count: ${Number(config.final_quiz_count || 10)}
- final_quiz_source_mode: "${config.final_quiz_source_mode === 'random_bank' ? 'random_bank' : 'fixed'}"
- question_bank_size: ${Number(config.question_bank_size || 30)}
- question_mix: "${config.question_mix || 'mixed'}"
- difficulty: "${config.difficulty || 'medium'}"
- include_examples: ${config.include_examples !== false}
- include_summary: ${config.include_summary !== false}
- show_explanation: ${config.show_explanation !== false}
- pass_score: ${Number(config.pass_score || 5)}
- lesson_time_minutes: ${Number(config.lesson_time_minutes || 45)}
- auto_finish_lesson_on_timeout: ${config.auto_finish_lesson_on_timeout !== false}
- final_exam_time_minutes: ${Number(config.final_exam_time_minutes || 15)}
- shuffle_final_questions: ${config.shuffle_final_questions !== false}
- shuffle_final_options: ${config.shuffle_final_options !== false}
- show_final_answers_after_submit: ${config.show_final_answers_after_submit !== false}
- show_final_explanations_after_submit: ${config.show_final_explanations_after_submit !== false}
- allow_retry: false
- interactive_weight: 0
- final_quiz_weight: 100
- ai_instructions: ${JSON.stringify(config.ai_instructions || '')}

Schema tối thiểu bắt buộc:
{
  "schema_version":"lesson_v3",
  "title":"",
  "metadata":{"tieu_de":"","mon_hoc":"","khoi":"","chu_de":"","tom_tat":"","muc_tieu_bai_hoc":[""],"tu_khoa":[""],"thong_diep_chinh":"","thoi_luong_goi_y":"","curriculum_program":"${values.curriculum_program || CURRICULUM_PROGRAM}","curriculum_version":"${values.curriculum_version || CURRICULUM_VERSION}","textbook_series":"${values.textbook_series || TEXTBOOK_SERIES_KNTT}","textbook_catalog_version":"${catalogVersion}","textbook_lesson_id":"${values.textbook_lesson_id || ''}","textbook_lesson_code":"${values.textbook_lesson_code || ''}","textbook_topic_id":"${values.textbook_topic_id || ''}","curriculum_requirement_ids":${JSON.stringify(requirements.map((item) => item.id))}},
  "settings":{},
  "activities":[{
    "activity_id":"A1","requirement_ids":["${requirements[0]?.id || ''}"],"title":"","objective":"","activity_type":"warmup|knowledge|practice|application","estimated_minutes":5,
    "pages":[{"page_id":"A1_P1","title":"","subtitle":"","layout":"visual_explain","visual":{"type":"none","title":"","items":[],"center_label":"","relationship":""},"blocks":[{"type":"paragraph","title":"","category":"giai_thich","theme":"blue","text":""}],"teacher_notes":"","student_prompt":""}],
    "interactions":[{"id":"IQ_A1_1","requirement_ids":["${requirements[0]?.id || ''}"],"assessment_evidence":"","type":"single_choice","question":"","options":["","","",""],"correctAnswer":"","explanation":"","level":"nhan_biet"}],
    "summary":""
  }],
  "question_bank":[],
  "final_quiz":[{"id":"FQ1","requirement_ids":["${requirements[0]?.id || ''}"],"assessment_evidence":"","type":"single_choice","question":"","options":["","","",""],"correctAnswer":"","explanation":"","level":"thong_hieu"}],
  "assessment":{"interactive_weight":0,"final_quiz_weight":100,"score_scale":10,"pass_score":${Number(config.pass_score || 5)}},
  "raw_text_excerpt":""
}

Bắt buộc: chỉ trả JSON hợp lệ, không markdown, không giải thích. Nếu nguồn dài, giảm số trang chứ không được làm JSON dang dở.
`;
}

export async function reviseLessonWithAI(
  apiKey: string,
  model: string,
  lesson: LessonContent,
  request: string,
  settings?: LessonBuilderSettings,
): Promise<LessonContent> {
  const ai = new GoogleGenAI({ apiKey });
  const response = await generateLessonContentReliableRest(apiKey, model, {
    contents: [{
      role: 'user',
      parts: [{ text: `Bạn là chuyên gia thiết kế bài học trực tuyến. Hãy chỉnh sửa JSON bài học theo yêu cầu của giáo viên, giữ nguyên schema_version lesson_v3, bảo toàn cấu trúc activities, pages, interactions, final_quiz, assessment. Nếu metadata có curriculum_requirement_ids/curriculum_requirements thì đó là YCCD CTGDPT 2018 bắt buộc: KHÔNG được đổi mã hoặc sửa nội dung chuẩn; mọi activity/interactions/final_quiz sau chỉnh sửa phải tiếp tục có requirement_ids phù hợp và câu hỏi phải bám động từ của YCCD. Không tạo tiêu đề dạng "Nội dung 1" dư thừa, không trả HTML thô như <br>, ưu tiên giữ ghi nhớ và câu hỏi lấy từ học liệu gốc; không ép câu hỏi mở thành đúng/sai; nếu cần câu hỏi mở, hãy chuyển thành fill_in_blank với 1 chỗ trống và 4 từ/cụm từ lựa chọn. Với content_blocks, đặt title ngắn gọn theo đúng ý chính, gán category/theme để giao diện hiển thị màu nền nhẹ phù hợp. Mọi single_choice phải có correctAnswer trùng nguyên văn đúng một option; mọi fill_in_blank phải có đúng 4 choices và correctAnswers trùng nguyên văn đúng một choice. Loại bỏ câu hỏi mơ hồ, cụt ý, sai chính tả hoặc có hơn một đáp án hợp lý; explanation phải thống nhất với đáp án đúng.\n\nYêu cầu chỉnh sửa: ${request}\n\nCấu hình hiện tại: ${JSON.stringify(settings || lesson.settings || {})}\n\nJSON bài học hiện tại:\n${JSON.stringify(lesson).slice(0, 60000)}\n\nChỉ trả về JSON bài học đã chỉnh sửa, không giải thích thêm.` }],
    }],
    config: {
      systemInstruction: 'Luôn trả về JSON hợp lệ theo schema lesson_v3. Không trả về markdown.',
      responseMimeType: 'application/json',
      temperature: 0.25,
    },
  });
  let parsed: any;
  try {
    parsed = extractJson(response.text || '');
  } catch (error) {
    parsed = await repairLessonJsonWithAI(apiKey, model, response.text || '', error);
  }
  let normalized = normalizeLessonContent(parsed);
  normalized = await ensureLessonQuestionQuotas(ai, model, normalized, settings || lesson.settings);
  const curriculumIds = Array.isArray(lesson.metadata?.curriculum_requirement_ids) ? lesson.metadata.curriculum_requirement_ids : [];
  normalized = completeCurriculumReferences(normalizeCurriculumAlignment(normalized, curriculumIds), curriculumIds);
  normalized.metadata = { ...normalized.metadata, ...lesson.metadata, curriculum_requirement_ids: curriculumIds };
  return normalized;
}


function normalizeSlidePromptItem(raw: any, index: number): GoogleSlidePromptItem {
  const keyContent = safeArray(raw?.key_content || raw?.noi_dung_chinh || raw?.bullets || raw?.content_points);
  const imageSuggestions = safeArray(raw?.image_suggestions || raw?.goi_y_hinh_anh || raw?.images || raw?.visuals);
  const title = cleanTextValue(raw?.title || raw?.tieu_de || `Slide ${index + 1}`);
  const learningGoal = cleanTextValue(raw?.learning_goal || raw?.muc_tieu || raw?.goal || '');
  const slideType = cleanTextValue(raw?.slide_type || raw?.loai_slide || raw?.type || 'content');
  const teacherScript = cleanTextValue(raw?.teacher_script || raw?.loi_dan_giao_vien || raw?.teacher_notes || '');
  const studentActivity = cleanTextValue(raw?.student_activity || raw?.hoat_dong_hoc_sinh || raw?.activity || '');
  const quickQuestion = cleanTextValue(raw?.quick_question || raw?.cau_hoi_nhanh || raw?.question || '');
  const notes = cleanTextValue(raw?.notes || raw?.ghi_chu || '');
  const rawLessonContent = raw?.lesson_content || raw?.noi_dung_bai_hoc || raw?.noi_dung_slide || raw?.slide_content || raw?.content_to_include || raw?.exact_lesson_content;
  const lessonContent = Array.isArray(rawLessonContent)
    ? rawLessonContent.map((item) => cleanTextValue(item)).filter(Boolean).join('\n')
    : cleanTextValue(rawLessonContent || '');
  const slideText = safeArray(raw?.slide_text || raw?.allowed_text || raw?.chu_duoc_phep_hien_thi || raw?.noi_dung_chu_tren_slide || raw?.text_on_slide || raw?.slide_copy || raw?.content_text);
  const allowedText = safeArray(raw?.allowed_text || raw?.chu_duoc_phep_hien_thi || raw?.allowed_slide_text || raw?.slide_text || raw?.noi_dung_chu_tren_slide);
  const visualDirection = safeArray(raw?.visual_direction || raw?.content_aware_visual_direction || raw?.dinh_huong_mau_sac_hinh_minh_hoa || raw?.dinh_huong_truc_quan || raw?.visual_theme);
  const designRequirements = safeArray(raw?.design_requirements || raw?.yeu_cau_thiet_ke || raw?.layout_requirements || raw?.design_rules);
  const colorTextRules = safeArray(raw?.color_text_rules || raw?.yeu_cau_dinh_dang_mau_sac_van_ban || raw?.typography_color_rules || raw?.text_color_rules);
  const qualityRules = safeArray(raw?.quality_rules || raw?.quy_tac_chat_luong || raw?.constraints || raw?.slide_rules);
  const rawDesignPrompt = cleanTextValue(raw?.design_prompt || raw?.prompt || raw?.google_slides_prompt || '');
  const contentForPrompt = lessonContent || (keyContent.length ? keyContent.map((item) => `- ${item}`).join('\n') : 'Tóm tắt nội dung cốt lõi của slide theo bài học hiện tại.');
  const displayText = (allowedText.length ? allowedText : slideText.length ? slideText : contentForPrompt.split('\n').map((item) => item.replace(/^[-•]\s*/, '').trim()).filter(Boolean).slice(0, 5))
    .map((item) => cleanTextValue(item))
    .filter(Boolean)
    .slice(0, 7);

  const defaultVisualDirection = [
    'Màu sắc, hình minh họa, biểu tượng và phong cách trình bày phải được suy ra từ nội dung bài học, không dùng mẫu chung cố định.',
    'Ưu tiên hình minh họa phản ánh đúng khái niệm hoặc tình huống của slide; không dùng hình ảnh chung chung nếu không liên quan trực tiếp đến nội dung.',
    imageSuggestions.length ? `Hình minh họa/biểu tượng phù hợp: ${imageSuggestions.join(', ')}.` : 'Chọn hình minh họa, biểu tượng hoặc sơ đồ phù hợp với chủ đề kiến thức của slide.',
  ];
  const defaultDesignRequirements = [
    'Thiết kế theo tỉ lệ 16:9, phù hợp trình chiếu trên màn hình lớp học.',
    'Mỗi slide chỉ tập trung vào một thông điệp chính, ưu tiên bố cục trực quan bằng thẻ nội dung, sơ đồ, hình ảnh hoặc biểu tượng.',
    'Bố cục thoáng, có lề an toàn; không đặt chữ sát mép và không tạo chữ nhỏ ở cuối slide.',
  ];
  const defaultColorTextRules = [
    'Bảng màu phải bám vào nội dung bài học và loại slide; không dùng màu chung chung hoặc lệch chủ đề.',
    'Nền ưu tiên màu sáng hoặc màu rất nhạt phù hợp chủ đề; tiêu đề dùng màu đậm, nổi bật, dễ đọc.',
    'Nội dung chính dùng màu đen, xanh navy hoặc xám đậm để tương phản tốt với nền.',
    'Từ khóa quan trọng có thể in đậm và dùng màu nhấn phù hợp với chủ đề; không dùng quá 3 màu chủ đạo trên một slide.',
    'Tiêu đề nên tương đương 36-44 pt; nội dung chính nên tương đương 24-32 pt; không dùng chữ quá nhỏ.',
    'Nếu đặt chữ trên hình ảnh, phải có lớp nền mờ hoặc khung sáng phía sau chữ để bảo đảm dễ đọc.',
    'Font chữ rõ ràng, hiện đại, không chân; ưu tiên Arial, Roboto, Aptos hoặc font tương tự.',
  ];
  const defaultStrictRules = [
    'Chỉ dùng đúng các dòng chữ trong mục “Chữ được phép hiển thị trên slide”.',
    'Toàn bộ chữ trên slide phải là tiếng Việt có dấu, không dùng tiếng Anh, không dùng chữ giả hoặc văn bản mẫu.',
    'Không thêm slogan, watermark, phụ đề, dòng trang trí hoặc chữ nhỏ không có trong nội dung đã cho.',
    'Không thêm kiến thức ngoài nội dung bài học đã cung cấp.',
    'Không trình bày thành đoạn văn dài; mỗi ý ngắn gọn, dễ đọc, phù hợp học sinh THCS quan sát từ xa.',
  ];
  const mergedVisualDirection = visualDirection.length ? visualDirection : defaultVisualDirection;
  const mergedDesignRequirements = designRequirements.length ? designRequirements : defaultDesignRequirements;
  const mergedColorTextRules = colorTextRules.length ? colorTextRules : defaultColorTextRules;
  const mergedQualityRules = uniqueByText([...(qualityRules.length ? qualityRules : []), ...defaultStrictRules]);

  void rawDesignPrompt;
  const design_prompt = [
    `Tạo một trang trình bày cho Slide ${index + 1} với tiêu đề “${title}”.`,
    learningGoal ? `Mục tiêu của slide: ${learningGoal}.` : '',
    '',
    '**Chữ được phép hiển thị trên slide:**',
    displayText.length ? displayText.map((item) => `- ${item}`).join('\n') : '- [Giữ nội dung thật ngắn gọn theo bài học]',
    '',
    '**Định hướng màu sắc và hình minh họa dựa trên nội dung bài học:**',
    mergedVisualDirection.map((item) => `- ${item}`).join('\n'),
    '',
    '**Yêu cầu thiết kế:**',
    mergedDesignRequirements.map((item) => `- ${item}`).join('\n'),
    '',
    '**Yêu cầu định dạng màu sắc và văn bản:**',
    mergedColorTextRules.map((item) => `- ${item}`).join('\n'),
    '',
    '**Ràng buộc bắt buộc:**',
    mergedQualityRules.map((item) => `- ${item}`).join('\n'),
  ].filter((item) => item !== '').join('\n');

  return {
    slide_number: Number(raw?.slide_number || raw?.stt || raw?.number || index + 1) || index + 1,
    title,
    slide_type: slideType,
    learning_goal: learningGoal,
    key_content: keyContent,
    lesson_content: lessonContent || contentForPrompt,
    slide_text: displayText,
    allowed_text: displayText,
    visual_direction: mergedVisualDirection,
    design_requirements: mergedDesignRequirements,
    color_text_rules: mergedColorTextRules,
    quality_rules: mergedQualityRules,
    design_prompt,
    image_suggestions: imageSuggestions,
    teacher_script: teacherScript,
    student_activity: studentActivity,
    quick_question: quickQuestion,
    notes,
  };
}

function normalizeGoogleSlidesPromptResult(raw: any, lesson: LessonContent, subjectLabel?: string, grade?: string): GoogleSlidesPromptResult {
  const slides = Array.isArray(raw?.slides)
    ? raw.slides.map((item: any, index: number) => normalizeSlidePromptItem(item, index)).filter((item: GoogleSlidePromptItem) => item.title || item.design_prompt)
    : [];
  const title = cleanTextValue(raw?.title || raw?.tieu_de || lesson.metadata?.tieu_de || lesson.title || 'Bài trình chiếu');
  const suggestedStyle = cleanTextValue(raw?.suggested_style || raw?.phong_cach_de_xuat || raw?.style || 'Hiện đại, trực quan, phù hợp học sinh THCS');
  const rationale = cleanTextValue(raw?.rationale || raw?.phan_tich || raw?.ly_do_de_xuat || 'AI tự xác định số slide và phong cách dựa trên nội dung bài học.');
  const usageGuide = safeArray(raw?.usage_guide || raw?.huong_dan_su_dung || []);

  return {
    title,
    subject: cleanTextValue(raw?.subject || raw?.mon_hoc || subjectLabel || lesson.metadata?.mon_hoc || ''),
    grade: cleanTextValue(raw?.grade || raw?.khoi || grade || lesson.metadata?.khoi || ''),
    suggested_slide_count: Number(raw?.suggested_slide_count || raw?.so_slide_de_xuat || slides.length || 0) || slides.length || 8,
    suggested_style: suggestedStyle,
    rationale,
    slides,
    usage_guide: usageGuide.length ? usageGuide : [
      'Mở Google Slides và tạo bản trình bày mới.',
      'Mở Gemini trong Google Slides.',
      'Dán lần lượt prompt của từng slide, bắt đầu từ Slide 1 đến slide cuối.',
      'Sau mỗi lần Gemini tạo slide, giáo viên rà soát nội dung và chỉnh hình ảnh cho phù hợp lớp học.',
    ],
  };
}

function buildGoogleSlidesPromptGenerationPrompt(lesson: LessonContent, subjectLabel?: string, grade?: string, extraRequest?: string) {
  const sections = (lesson.sections || []).map((section, index) => ({
    index: index + 1,
    title: section.title,
    content: section.content,
    blocks: (section.content_blocks || []).map((block) => ({ title: block.title, category: block.category, text: block.text })).slice(0, 8),
    summary: section.summary || section.source_note || '',
    examples: section.examples || [],
    interactive_questions: (section.interactive_questions || []).map((question) => question.question).slice(0, 5),
  }));

  const lessonContentOutline = [
    lesson.metadata?.tom_tat ? `Tóm tắt: ${lesson.metadata.tom_tat}` : '',
    Array.isArray(lesson.metadata?.muc_tieu_bai_hoc) && lesson.metadata.muc_tieu_bai_hoc.length ? `Mục tiêu bài học:\n${lesson.metadata.muc_tieu_bai_hoc.map((item) => `- ${item}`).join('\n')}` : '',
    lesson.khoi_dong?.tinh_huong ? `Khởi động: ${lesson.khoi_dong.tinh_huong}` : '',
    ...sections.map((section) => [
      `Mục ${section.index}. ${section.title || ''}`,
      section.content ? `Nội dung: ${section.content}` : '',
      section.blocks?.length ? `Các ý/khối nội dung:\n${section.blocks.map((block) => `- ${block.title || block.category || 'Ý'}: ${block.text || ''}`).join('\n')}` : '',
      section.examples?.length ? `Ví dụ: ${section.examples.join('; ')}` : '',
      section.interactive_questions?.length ? `Câu hỏi tương tác: ${section.interactive_questions.join('; ')}` : '',
    ].filter(Boolean).join('\n')),
    lesson.tong_ket?.ghi_nho_trong_tam?.length ? `Ghi nhớ trọng tâm:\n${lesson.tong_ket.ghi_nho_trong_tam.map((item) => `- ${item}`).join('\n')}` : '',
    lesson.van_dung?.nhiem_vu?.length ? `Vận dụng:\n${lesson.van_dung.nhiem_vu.map((item) => `- ${item}`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n').slice(0, 42000);

  const lessonBrief = {
    title: lesson.metadata?.tieu_de || lesson.title || '',
    subject: subjectLabel || lesson.metadata?.mon_hoc || '',
    grade: grade || lesson.metadata?.khoi || '',
    summary: lesson.metadata?.tom_tat || '',
    objectives: lesson.metadata?.muc_tieu_bai_hoc || [],
    keywords: lesson.metadata?.tu_khoa || [],
    opening: lesson.khoi_dong,
    sections,
    final_quiz: (lesson.final_quiz || []).map((question) => question.question).slice(0, 10),
    conclusion: lesson.tong_ket,
    lesson_content_outline: lessonContentOutline,
  };

  return `
Bạn là chuyên gia thiết kế bài giảng trình chiếu cho giáo viên THCS Việt Nam, am hiểu Google Slides và Gemini trong Google Workspace.

Nhiệm vụ:
- Phân tích bài học tương tác hiện tại và tạo DANH SÁCH PROMPT RIÊNG CHO TỪNG SLIDE để giáo viên dán vào Gemini trong Google Slides.
- KHÔNG tạo prompt tổng thể cho toàn bộ bài trình chiếu.
- AI phải TỰ quyết định số slide phù hợp, giáo viên không cần chọn số slide.
- AI phải TỰ chọn phong cách trình bày phù hợp với môn học, khối lớp, nội dung bài và lứa tuổi học sinh THCS.
- Mỗi slide phải có một prompt riêng, copy dùng ngay được khi dán vào Gemini trong Google Slides.
- Prompt từng slide BẮT BUỘC phải có phần “Chữ được phép hiển thị trên slide”. Những dòng này là toàn bộ chữ được phép xuất hiện trên slide.
- Prompt từng slide BẮT BUỘC phải có phần “Định hướng màu sắc và hình minh họa dựa trên nội dung bài học”. Màu sắc, hình minh họa, biểu tượng và phong cách phải được suy ra từ nội dung bài học, không dùng mẫu chung cố định.
- Prompt từng slide BẮT BUỘC phải có phần “Yêu cầu định dạng màu sắc và văn bản” để kiểm soát màu chữ, màu nền, cỡ chữ, tương phản và font chữ.
- Prompt phải hướng tới slide ít chữ, chữ lớn, dễ quan sát, có hình ảnh/sơ đồ/biểu tượng phù hợp với chủ đề, hoạt động học sinh và lời dẫn giáo viên nếu phù hợp.
- Nếu bài ngắn: 6-8 slide; bài vừa: 8-10 slide; bài nhiều nội dung: 10-14 slide; bài ôn tập/chủ đề: 12-16 slide. Tự chọn theo dữ liệu bài học, không hỏi lại.
- Với môn Tin học, ưu tiên phong cách công nghệ, dữ liệu, quy trình, biểu tượng máy tính; với Toán ưu tiên rõ ràng từng bước; với KHTN ưu tiên khám phá khoa học, sơ đồ/thí nghiệm; với môn xã hội ưu tiên tình huống, bản đồ, dòng thời gian nếu phù hợp.
- Trả về DUY NHẤT một JSON hợp lệ, không giải thích ngoài JSON. Riêng chuỗi design_prompt phải trình bày dạng Markdown rõ ràng.

Yêu cầu thêm của giáo viên:
${extraRequest?.trim() || 'Không có. AI tự tối ưu theo nội dung bài học.'}

Dữ liệu bài học:
${JSON.stringify(lessonBrief).slice(0, 52000)}

JSON bắt buộc:
{
  "title": "Tên bài trình chiếu",
  "subject": "Môn học",
  "grade": "Khối lớp",
  "suggested_slide_count": 10,
  "suggested_style": "Phong cách trình bày do AI tự chọn, ghi rõ lý do phù hợp",
  "rationale": "Phân tích ngắn vì sao chọn số slide và phong cách này dựa trên nội dung bài học",
  "usage_guide": ["Hướng dẫn ngắn cho giáo viên: dán lần lượt prompt từng slide vào Gemini trong Google Slides"],
  "slides": [
    {
      "slide_number": 1,
      "title": "Tiêu đề slide",
      "slide_type": "cover | objectives | warmup | concept | explanation | example | activity | quick_check | summary | application",
      "learning_goal": "Mục tiêu của slide",
      "key_content": ["Ý chính 1", "Ý chính 2"],
      "lesson_content": "Nội dung bài học cụ thể làm căn cứ cho slide này, viết đủ ý để Gemini không cần xem tài liệu gốc",
      "slide_text": ["Dòng chữ ngắn 1 phải xuất hiện trên slide", "Dòng chữ ngắn 2 phải xuất hiện trên slide"],
      "allowed_text": ["Toàn bộ chữ được phép hiển thị trên slide, lấy từ nội dung bài học, không thêm dòng thừa"],
      "visual_direction": ["Định hướng màu sắc, phong cách, hình minh họa, biểu tượng phải bám sát nội dung bài học và loại slide"],
      "design_requirements": ["Yêu cầu bố cục và cách trình bày theo loại slide"],
      "color_text_rules": ["Quy định màu nền, màu chữ, màu nhấn, cỡ chữ, font chữ, độ tương phản"],
      "design_prompt": "Prompt hoàn chỉnh cho Gemini trong Google Slides, viết dạng Markdown. Bắt buộc gồm các nhãn Markdown: **Chữ được phép hiển thị trên slide:**, **Định hướng màu sắc và hình minh họa dựa trên nội dung bài học:**, **Yêu cầu thiết kế:**, **Yêu cầu định dạng màu sắc và văn bản:**, **Ràng buộc bắt buộc:**",
      "image_suggestions": ["Gợi ý hình ảnh/minh họa/biểu tượng đúng chủ đề bài học"],
      "quality_rules": ["Chỉ dùng đúng chữ được phép", "Tiếng Việt có dấu", "Không thêm chữ giả", "Ít chữ, chữ lớn, dễ quan sát"],
      "teacher_script": "Lời dẫn ngắn cho giáo viên khi trình chiếu slide này",
      "student_activity": "Hoạt động/câu hỏi học sinh thực hiện nếu có",
      "quick_question": "Câu hỏi nhanh nếu phù hợp",
      "notes": "Lưu ý khi chỉnh slide"
    }
  ]
}

Quy tắc chất lượng:
- Không trả về trường overall_prompt hoặc prompt_tong.
- Không tạo prompt tổng thể cho toàn bộ bài trình chiếu.
- design_prompt từng slide phải copy dùng ngay được, không phụ thuộc vào lời giải thích ngoài JSON.
- design_prompt không được chỉ viết “thiết kế slide...” chung chung; phải ghi rõ “Chữ được phép hiển thị trên slide” và ràng buộc không thêm chữ khác.
- Trường slide_text và allowed_text phải là các dòng chữ ngắn, đúng kiến thức, có thể đưa trực tiếp lên slide.
- Trường lesson_content phải chứa nội dung kiến thức/hoạt động/câu hỏi cụ thể trích từ bài học tương ứng với slide.
- Trường visual_direction phải giải thích vì sao chọn màu sắc/hình minh họa đó dựa vào chủ đề bài học; không gợi ý hình ảnh chung chung.
- Trường color_text_rules phải yêu cầu màu chữ tương phản tốt, tiêu đề lớn, nội dung rõ, không quá 3 màu chủ đạo và không có chữ nhỏ ở cuối slide.
- Mỗi slide chỉ nên có 1 thông điệp chính và tối đa 3-5 ý ngắn.
- Bắt buộc có các slide: trang bìa, mục tiêu, khởi động, kiến thức chính, hoạt động/luyện tập, ghi nhớ/vận dụng.
- Nếu bài có câu hỏi tương tác, hãy đưa một số câu phù hợp vào slide kiểm tra nhanh/hoạt động.
- Không tạo nội dung sai hoặc mở rộng xa bài học.
- Trong design_prompt được dùng Markdown đơn giản như **tiêu đề mục**, danh sách gạch đầu dòng. Không dùng bảng phức tạp.
- Mỗi design_prompt phải có đúng một khối prompt hoàn chỉnh, không lặp lại các phần ngoài prompt.
- Trong phần “Ràng buộc bắt buộc”, luôn ghi rõ: chỉ dùng đúng chữ được phép, toàn bộ chữ phải là tiếng Việt có dấu, không thêm tiếng Anh/chữ giả/watermark/slogan/phụ đề/dòng chữ nhỏ.
- Nếu có dấu ngoặc kép trong nội dung tiếng Việt, hãy dùng dấu nháy đơn hoặc escape đúng chuẩn JSON.

Chỉ trả về JSON hợp lệ.`;

}

async function repairGoogleSlidesPromptJsonWithAI(apiKey: string, model: string, brokenJsonText: string, originalError: unknown) {
  const ai = new GoogleGenAI({ apiKey });
  const response = await generateContentReliable(ai, model, {
    contents: [{
      role: 'user',
      parts: [{ text: `JSON tạo prompt Google Slides sau bị lỗi cú pháp. Hãy sửa thành JSON hợp lệ theo đúng schema, không thêm markdown, không giải thích.\n\nLỗi: ${originalError instanceof Error ? originalError.message : String(originalError || '')}\n\nJSON cần sửa:\n${sliceLikelyJson(brokenJsonText).slice(0, 65000)}` }],
    }],
    config: {
      systemInstruction: 'Bạn chỉ sửa cú pháp JSON. Luôn trả về JSON hợp lệ, không markdown.',
      responseMimeType: 'application/json',
      temperature: 0.05,
    },
  });
  return tryParseJsonCandidate(response.text || '');
}

export async function generateGoogleSlidesPrompts(
  apiKey: string,
  model: string,
  lesson: LessonContent,
  subjectLabel?: string,
  grade?: string,
  extraRequest?: string,
): Promise<GoogleSlidesPromptResult> {
  const ai = new GoogleGenAI({ apiKey });
  const response = await generateContentReliable(ai, model, {
    contents: [{
      role: 'user',
      parts: [{ text: buildGoogleSlidesPromptGenerationPrompt(lesson, subjectLabel, grade, extraRequest) }],
    }],
    config: {
      systemInstruction: 'Bạn tạo danh sách prompt riêng cho từng slide Google Slides. Không tạo prompt tổng thể. Chỉ trả JSON hợp lệ. Trường design_prompt phải viết bằng Markdown rõ ràng.',
      responseMimeType: 'application/json',
      temperature: 0.35,
    },
  });

  let parsed: any;
  try {
    parsed = extractJson(response.text || '');
  } catch (error) {
    try {
      parsed = await repairGoogleSlidesPromptJsonWithAI(apiKey, model, response.text || '', error);
    } catch (repairError) {
      const retryResponse = await generateContentReliable(ai, model, {
        contents: [{
          role: 'user',
          parts: [{ text: `${buildGoogleSlidesPromptGenerationPrompt(lesson, subjectLabel, grade, extraRequest)}\n\nLần tạo trước bị lỗi JSON: ${repairError instanceof Error ? repairError.message : String(repairError || '')}\nHãy tạo lại JSON ngắn hơn nhưng hợp lệ tuyệt đối. Không dùng markdown.` }],
        }],
        config: {
          systemInstruction: 'Chỉ trả JSON hợp lệ. Không markdown. Ưu tiên ngắn gọn nhưng đúng cú pháp.',
          responseMimeType: 'application/json',
          temperature: 0.08,
        },
      });
      parsed = extractJson(retryResponse.text || '');
    }
  }

  const normalized = normalizeGoogleSlidesPromptResult(parsed, lesson, subjectLabel, grade);
  if (!normalized.slides.length) {
    throw new Error('AI chưa tạo được danh sách prompt từng slide. Hãy bấm tạo lại hoặc bổ sung yêu cầu ngắn gọn hơn.');
  }
  return normalized;
}

export async function fileToUploadedSourceFile(file: File): Promise<UploadedSourceFile> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Không đọc được file.'));
    reader.readAsDataURL(file);
  });

  const [, base64 = ''] = dataUrl.split(',');
  return {
    name: file.name,
    mimeType: file.type || 'application/octet-stream',
    base64,
    size: file.size,
  };
}


async function ensureInteractiveQuestionCount(
  ai: GoogleGenAI,
  model: string,
  lesson: LessonContent,
  requestedCount: number,
  options: { localOnly?: boolean } = {},
): Promise<LessonContent> {
  const target = Math.max(0, Math.min(10, Math.floor(Number(requestedCount || 0))));
  if (!target || !Array.isArray(lesson.activities) || !lesson.activities.length) return lesson;

  const shortages = lesson.activities
    .map((activity, index) => ({
      activity,
      index,
      missing: Math.max(0, target - (activity.interactions?.length || 0)),
    }))
    .filter((item) => item.missing > 0);
  if (!shortages.length) return lesson;

  let supplemental: Record<string, QuizQuestion[]> = {};
  if (!options.localOnly) try {
    const compactActivities = shortages.map(({ activity, missing }) => ({
      activity_id: activity.activity_id,
      title: activity.title,
      objective: activity.objective,
      missing,
      content: (activity.pages || []).flatMap((page) => (page.blocks || []).map((block) => block.text || '')).filter(Boolean).join(' ').slice(0, 2400),
      existing_questions: (activity.interactions || []).map((question) => question.question || question.sentence || '').filter(Boolean),
    }));
    const response = await generateContentReliable(ai, model, {
      contents: [{
        role: 'user',
        parts: [{ text: `Bổ sung câu hỏi tương tác còn thiếu cho các hoạt động dưới đây.\nMỗi activity_id phải có ĐÚNG số câu bằng trường missing.\nChỉ dùng 3 loại: single_choice, true_false, fill_in_blank.\nCâu hỏi phải bám sát nội dung của đúng hoạt động, không lặp câu đã có.\n- single_choice: đúng 4 options, correctAnswer trùng nguyên văn 1 option.\n- true_false: options [\"Đúng\",\"Sai\"], correctAnswer là \"Đúng\" hoặc \"Sai\".\n- fill_in_blank: sentence có đúng một _____, choices đúng 4, correctAnswers đúng 1 choice.\nMỗi câu phải có explanation và level.\nChỉ trả JSON dạng {\"questionsByActivity\":{\"A1\":[...],\"A2\":[...]}}.\n\nDữ liệu hoạt động:\n${JSON.stringify(compactActivities)}` }],
      }],
      config: {
        systemInstruction: 'Chỉ trả JSON hợp lệ. Phải tạo đủ chính xác số câu còn thiếu cho từng activity_id.',
        responseMimeType: 'application/json',
        temperature: 0.25,
      },
    });
    const parsed = extractJson(response.text || '');
    const rawMap = parsed?.questionsByActivity && typeof parsed.questionsByActivity === 'object' ? parsed.questionsByActivity : {};
    supplemental = Object.fromEntries(Object.entries(rawMap).map(([activityId, raw]) => [activityId, safeQuizArray(raw)]));
  } catch (error) {
    console.warn('[EduSmart][AI] supplemental interactive generation failed; using fallback pool', error);
  }

  const fallbackPool = [
    ...(lesson.question_bank || []),
    ...(lesson.final_quiz || []),
    ...lesson.activities.flatMap((activity) => activity.interactions || []),
  ];

  const activities = lesson.activities.map((activity, activityIndex) => {
    const current = [...(activity.interactions || [])];
    const needed = Math.max(0, target - current.length);
    if (!needed) return activity;
    const generated = (supplemental[activity.activity_id] || []).slice(0, needed);
    generated.forEach((question, index) => current.push({
      ...question,
      id: `IQ_${activity.activity_id}_${current.length + index + 1}`,
    }));
    while (current.length < target && fallbackPool.length) {
      const source = fallbackPool[(activityIndex * target + current.length) % fallbackPool.length];
      current.push({
        ...source,
        id: `IQ_${activity.activity_id}_${current.length + 1}`,
        question: source.question || source.sentence || `Câu hỏi tương tác ${current.length + 1}`,
      });
    }
    const activitySeed = [activity.title, activity.objective, activity.summary]
      .map((value) => cleanTextValue(value || ''))
      .find(Boolean) || lesson.metadata?.tieu_de || lesson.title || 'Nội dung bài học';
    while (current.length < target) {
      const idx = current.length;
      current.push(makeGuaranteedFallbackQuestion(activitySeed, `IQ_${activity.activity_id}_FALLBACK_${idx + 1}`, idx));
    }
    return { ...activity, interactions: current.slice(0, target) };
  });

  return normalizeLessonV3({ ...lesson, schema_version: 'lesson_v3', activities });
}

function makeGuaranteedFallbackQuestion(seed: string, id: string, index: number): QuizQuestion {
  const title = cleanTextValue(seed || 'nội dung đang học') || 'nội dung đang học';
  const correct = title.length > 96 ? `${title.slice(0, 93)}…` : title;
  const distractors = [
    'Một nội dung không được đề cập trong phần học',
    'Một nhận định trái với nội dung đang học',
    'Một thao tác không liên quan đến nhiệm vụ học tập',
  ];
  const variant = index % 3;
  if (variant === 1) {
    return {
      id,
      type: 'true_false',
      question: `Nhận định sau phù hợp với nội dung bài học: “${correct}”.`,
      options: ['Đúng', 'Sai'],
      correctAnswer: 'Đúng',
      explanation: `Nội dung “${correct}” được rút ra từ phần học đang xét.`,
      level: 'thong_hieu',
    } as QuizQuestion;
  }
  if (variant === 2) {
    return {
      id,
      type: 'fill_in_blank',
      sentence: 'Một nội dung trọng tâm của phần học là _____.',
      choices: [correct, ...distractors].slice(0, 4),
      correctAnswers: [correct],
      explanation: `Đáp án phù hợp với trọng tâm phần học là “${correct}”.`,
      level: 'van_dung',
    } as QuizQuestion;
  }
  return {
    id,
    type: 'single_choice',
    question: `Ý nào phù hợp nhất với trọng tâm “${correct}”?`,
    options: [correct, ...distractors],
    correctAnswer: correct,
    explanation: `Trọng tâm của phần học là “${correct}”.`,
    level: 'nhan_biet',
  } as QuizQuestion;
}

function lessonFallbackSeeds(lesson: LessonContent) {
  const seeds = (lesson.activities || []).flatMap((activity) => [
    activity.title,
    activity.objective,
    activity.summary,
    ...(activity.pages || []).flatMap((page) => [page.title, page.subtitle, ...(page.blocks || []).map((block) => block.text)]),
  ]).map((item) => cleanTextValue(item || '')).filter(Boolean);
  return seeds.length ? seeds : [lesson.metadata?.tieu_de || lesson.title || 'Nội dung bài học'];
}

async function ensureFinalQuizCount(
  ai: GoogleGenAI,
  model: string,
  lesson: LessonContent,
  requestedCount: number,
  options: { localOnly?: boolean } = {},
): Promise<LessonContent> {
  const target = Math.max(0, Math.min(100, Math.floor(Number(requestedCount || 0))));
  if (!target) return lesson;
  let current = [...(lesson.final_quiz || [])];
  if (current.length >= target) return normalizeLessonV3({ ...lesson, final_quiz: current.slice(0, target) });
  const missing = target - current.length;
  if (!options.localOnly) try {
    const response = await generateContentReliable(ai, model, {
      contents: [{ role: 'user', parts: [{ text: `Bổ sung chính xác ${missing} câu kiểm tra cuối bài còn thiếu cho bài học sau.\nChỉ dùng single_choice, true_false, fill_in_blank.\nCâu hỏi phải bám sát nội dung bài học, không lặp câu đã có.\nMỗi câu phải có id, explanation, level và đáp án hợp lệ.\nChỉ trả JSON dạng {"questions":[...]}.\n\nBài học: ${JSON.stringify({ metadata: lesson.metadata, activities: lesson.activities, existing: current.map((q) => q.question || q.sentence) }).slice(0, 45000)}` }] }],
      config: { systemInstruction: 'Chỉ trả JSON hợp lệ và tạo đủ chính xác số câu được yêu cầu.', responseMimeType: 'application/json', temperature: 0.2 },
    });
    const parsed = extractJson(response.text || '');
    current.push(...safeQuizArray(parsed?.questions).slice(0, missing));
  } catch (error) {
    console.warn('[EduSmart][AI] supplemental final quiz generation failed; using deterministic fallback', error);
  }
  const pool = [...(lesson.question_bank || []), ...(lesson.activities || []).flatMap((a) => a.interactions || [])];
  let cursor = 0;
  while (current.length < target && pool.length) {
    const source = pool[cursor % pool.length];
    current.push({ ...source, id: `FQ_AUTO_${current.length + 1}` });
    cursor += 1;
  }
  const seeds = lessonFallbackSeeds(lesson);
  while (current.length < target) {
    const idx = current.length;
    current.push(makeGuaranteedFallbackQuestion(seeds[idx % seeds.length], `FQ_FALLBACK_${idx + 1}`, idx));
  }
  return normalizeLessonV3({ ...lesson, schema_version: 'lesson_v3', final_quiz: current.slice(0, target) });
}


function quizStem(question: QuizQuestion) {
  return cleanTextValue((question as any).question || (question as any).sentence || '').toLocaleLowerCase('vi');
}

function ensureQuestionBankCount(lesson: LessonContent, requestedCount: number): LessonContent {
  const target = Math.max(0, Math.min(120, Math.floor(Number(requestedCount || 0))));
  if (!target) return normalizeLessonV3({ ...lesson, question_bank: [] });
  const pool = [
    ...(lesson.question_bank || []),
    ...(lesson.final_quiz || []),
    ...(lesson.activities || []).flatMap((activity) => activity.interactions || []),
  ];
  const seen = new Set<string>();
  const bank: QuizQuestion[] = [];
  for (const raw of pool) {
    const normalized = sanitizeQuizQuestion(raw as QuizQuestion);
    if (!normalized) continue;
    const stem = quizStem(normalized);
    if (!stem || seen.has(stem)) continue;
    seen.add(stem);
    bank.push({ ...normalized, id: `QB${bank.length + 1}` });
    if (bank.length >= target) break;
  }
  const seeds = lessonFallbackSeeds(lesson);
  let cursor = 0;
  while (bank.length < target) {
    const seed = seeds[cursor % seeds.length];
    const generated = makeGuaranteedFallbackQuestion(seed, `QB${bank.length + 1}`, cursor);
    const stem = quizStem(generated);
    if (!seen.has(stem)) {
      seen.add(stem);
      bank.push(generated);
    } else {
      const uniqueSeed = `${seed} — ý ${cursor + 1}`;
      bank.push(makeGuaranteedFallbackQuestion(uniqueSeed, `QB${bank.length + 1}`, cursor));
    }
    cursor += 1;
  }
  return normalizeLessonV3({ ...lesson, schema_version: 'lesson_v3', question_bank: bank.slice(0, target) });
}

export function getLessonQuestionQuotaStatus(lesson: LessonContent, settings?: LessonBuilderSettings) {
  const effective = (settings || lesson.settings || {}) as Partial<LessonBuilderSettings>;
  const interactionTarget = Math.max(0, Math.floor(Number(effective.interactive_questions_per_section || 0)));
  const finalTarget = Math.max(0, Math.floor(Number(effective.final_quiz_count || 0)));
  const activities = (lesson.activities || []).map((activity, index) => ({
    activity_id: activity.activity_id,
    title: activity.title || `Hoạt động ${index + 1}`,
    actual: activity.interactions?.length || 0,
    target: interactionTarget,
    ok: (activity.interactions?.length || 0) >= interactionTarget,
  }));
  return { activities, final: { actual: lesson.final_quiz?.length || 0, target: finalTarget, ok: (lesson.final_quiz?.length || 0) >= finalTarget }, ok: activities.every((item) => item.ok) && (lesson.final_quiz?.length || 0) >= finalTarget };
}

async function ensureLessonQuestionQuotas(ai: GoogleGenAI, model: string, lesson: LessonContent, settings?: LessonBuilderSettings) {
  const effective = (settings || lesson.settings || {}) as Partial<LessonBuilderSettings>;
  // V6.98.7: quota phải không tạo thêm chuỗi request AI sau khi bài học chính đã
  // sinh xong. Trên Netlify, các lượt bổ sung nối tiếp là nguyên nhân phổ biến
  // khiến màn hình giữ trạng thái "đang tạo" quá lâu khi Gemini quá tải.
  // Ưu tiên câu AI đã có; phần còn thiếu được hoàn thiện cục bộ từ ngân hàng/nội dung.
  let repaired = normalizeLessonContent(lesson);
  repaired = await ensureInteractiveQuestionCount(ai, model, repaired, Number(effective.interactive_questions_per_section || 0), { localOnly: true });
  repaired = await ensureFinalQuizCount(ai, model, repaired, Number(effective.final_quiz_count || 0), { localOnly: true });
  repaired = normalizeLessonContent(repaired);
  repaired = await ensureInteractiveQuestionCount(ai, model, repaired, Number(effective.interactive_questions_per_section || 0), { localOnly: true });
  repaired = await ensureFinalQuizCount(ai, model, repaired, Number(effective.final_quiz_count || 0), { localOnly: true });
  repaired = ensureQuestionBankCount(repaired, Number(effective.question_bank_size || 0));
  const status = getLessonQuestionQuotaStatus(repaired, effective as LessonBuilderSettings);
  if (!status.ok) throw new Error(`Chưa hoàn thiện đủ số câu theo cấu hình. Tương tác: ${status.activities.map((x) => `${x.actual}/${x.target}`).join(', ')}; cuối bài: ${status.final.actual}/${status.final.target}.`);
  return repaired;
}

export async function analyzeLessonMaterial(
  apiKey: string,
  model: string,
  values: Pick<LessonComposerValues, 'tieu_de' | 'mon_id' | 'khoi' | 'source_text' | 'textbook_series' | 'textbook_catalog_version' | 'textbook_lesson_id' | 'textbook_lesson_code' | 'textbook_topic_id' | 'curriculum_program' | 'curriculum_version' | 'curriculum_requirement_ids'>,
  sourceFile?: UploadedSourceFile | null,
  subjectLabel?: string,
  settings?: LessonBuilderSettings,
  runtime?: { signal?: AbortSignal },
): Promise<LessonContent> {
  const ai = new GoogleGenAI({ apiKey });
  // V6.98.7: một lần tạo bài trên web có ngân sách thời gian tổng. Nếu Gemini
  // chậm/quá tải, yêu cầu phải kết thúc có kiểm soát thay vì giữ UI vô thời hạn.
  const taskDeadlineAt = Date.now() + 120_000;
  const taskBudget = (capMs: number) => {
    const remaining = taskDeadlineAt - Date.now();
    if (remaining <= 2_000) throw safeGeminiUserError(createGeminiTimeoutError('lesson-generation', 120_000));
    return Math.max(2_000, Math.min(capMs, remaining));
  };
  const parts: any[] = [{ text: buildAnalysisPrompt(values, subjectLabel, settings) }];

  if (sourceFile?.base64) {
    parts.push({
      inlineData: {
        mimeType: sourceFile.mimeType || 'application/pdf',
        data: sourceFile.base64,
      },
    });
  }

  if (values.source_text?.trim()) {
    parts.push({
      text: `Nguồn văn bản bổ sung:
${values.source_text.trim().slice(0, 25000)}`,
    });
  }

  const response = await generateLessonContentReliableRest(apiKey, model, {
    contents: [{ role: 'user', parts }],
    config: {
      systemInstruction: 'Bạn tạo học liệu số chất lượng cao cho học sinh phổ thông Việt Nam. Luôn xuất JSON hợp lệ.',
      responseMimeType: 'application/json',
      temperature: 0.3,
    },
  }, {
    label: 'lesson-analysis',
    signal: runtime?.signal,
    totalTimeoutMs: taskBudget(82_000),
    attemptTimeoutMs: 28_000,
    maxCandidates: 4,
    primaryAttempts: 1,
  });

  let parsed: any;
  try {
    parsed = extractJson(response.text || '');
  } catch (error) {
    try {
      parsed = await repairLessonJsonWithAI(apiKey, model, response.text || '', error, { signal: runtime?.signal, totalTimeoutMs: taskBudget(32_000) });
    } catch (repairError) {
      const retryParts: any[] = [{
        text: `${buildAnalysisPrompt(values, subjectLabel, settings)}

LẦN TẠO TRƯỚC BỊ LỖI JSON: ${error instanceof Error ? error.message : String(error || '')}
Hãy TẠO LẠI TOÀN BỘ JSON bài học từ đầu, không sửa từng mảnh.
Yêu cầu bắt buộc:
- Chỉ xuất một đối tượng JSON hợp lệ bắt đầu bằng { và kết thúc bằng }.
- Không dùng markdown, không dùng \`\`\`json.
- Mọi phần tử trong array phải có dấu phẩy ngăn cách.
- Không để dấu phẩy thừa ở phần tử cuối.
- Không dùng dấu ngoặc kép thô bên trong chuỗi; đổi sang dấu nháy đơn hoặc escape.
- Nếu học liệu dài, ưu tiên tạo bài học ngắn hơn nhưng JSON phải hợp lệ tuyệt đối.`
      }];

      if (sourceFile?.base64) {
        retryParts.push({
          inlineData: {
            mimeType: sourceFile.mimeType || 'application/pdf',
            data: sourceFile.base64,
          },
        });
      }

      if (values.source_text?.trim()) {
        retryParts.push({
          text: `Nguồn văn bản bổ sung:
${values.source_text.trim().slice(0, 18000)}`,
        });
      }

      const retryResponse = await generateLessonContentReliableRest(apiKey, model, {
        contents: [{ role: 'user', parts: retryParts }],
        config: {
          systemInstruction: 'Chỉ tạo JSON hợp lệ. Không markdown. Không giải thích. Ưu tiên JSON ngắn gọn nhưng đúng cú pháp.',
          responseMimeType: 'application/json',
          temperature: 0.05,
        },
      }, {
        label: 'lesson-json-regeneration',
        signal: runtime?.signal,
        totalTimeoutMs: taskBudget(32_000),
        attemptTimeoutMs: 22_000,
        maxCandidates: 3,
        primaryAttempts: 1,
      });

      try {
        parsed = extractJson(retryResponse.text || '');
      } catch (retryError) {
        try {
          parsed = await repairLessonJsonWithAI(apiKey, model, retryResponse.text || '', retryError, { signal: runtime?.signal, totalTimeoutMs: taskBudget(24_000) });
        } catch (finalError) {
          console.warn('[EduSmart][AI] lesson JSON regeneration failed.', finalError);
          throw new Error('Chưa thể hoàn tất nội dung bài học ở lần tạo này. Vui lòng bấm tạo lại; tài liệu và cấu hình hiện tại vẫn được giữ nguyên.');
        }
      }
    }
  }
  let normalized = normalizeLessonContent(parsed);
  normalized = await ensureLessonQuestionQuotas(ai, model, normalized, settings);
  const curriculumIds = Array.isArray(values.curriculum_requirement_ids) ? values.curriculum_requirement_ids : [];
  normalized = completeCurriculumReferences(normalizeCurriculumAlignment(normalized, curriculumIds), curriculumIds);
  const selectedRequirements = getCurriculumRequirementsByIds(curriculumIds);
  normalized.metadata = {
    ...normalized.metadata,
    curriculum_program: values.curriculum_program || CURRICULUM_PROGRAM,
    curriculum_version: values.curriculum_version || CURRICULUM_VERSION,
    textbook_series: values.textbook_series || TEXTBOOK_SERIES_KNTT,
    textbook_catalog_version: values.textbook_catalog_version || getTextbookCatalogVersion(subjectLabel || values.mon_id || '') || TEXTBOOK_CATALOG_VERSION,
    textbook_lesson_id: values.textbook_lesson_id || '',
    textbook_lesson_code: values.textbook_lesson_code || '',
    textbook_topic_id: values.textbook_topic_id || '',
    curriculum_requirement_ids: curriculumIds,
    curriculum_requirements: selectedRequirements.map((item) => ({ id: item.id, text: item.text, competency: item.competency, source_kind: item.sourceKind, source_url: item.sourceUrl || CURRICULUM_REFERENCE_URL })),
    curriculum_source_url: selectedRequirements.length ? CURRICULUM_REFERENCE_URL : normalized.metadata?.curriculum_source_url,
    textbook_source_url: values.textbook_lesson_id ? getTextbookReferenceUrl(subjectLabel || values.mon_id || '') : normalized.metadata?.textbook_source_url,
  };
  if (!normalized.metadata.tieu_de) {
    normalized.metadata.tieu_de = values.tieu_de || 'Bài học mới';
  }
  if (!normalized.metadata.mon_hoc && subjectLabel) {
    normalized.metadata.mon_hoc = subjectLabel;
  }
  if (!normalized.metadata.khoi) {
    normalized.metadata.khoi = values.khoi;
  }
  if (!normalized.metadata.tom_tat) {
    normalized.metadata.tom_tat = normalized.tong_ket.ghi_nho_trong_tam.slice(0, 2).join(' ');
  }
  return normalized;
}

function getStageSnippet(content: LessonContent | null | undefined, stage: LessonStageKey | undefined) {
  if (!content || !stage) return '';
  if (stage === 'khoi_dong') {
    return [content.khoi_dong.tinh_huong, ...(content.khoi_dong.cau_hoi_goi_mo || [])].filter(Boolean).join('\n');
  }
  if (stage === 'hinh_thanh_kien_thuc') {
    return (content.hinh_thanh_kien_thuc || [])
      .map((item) => `${item.tieu_muc}: ${(item.noi_dung_chinh || []).slice(0, 3).join('; ')}`)
      .join('\n');
  }
  if (stage === 'luyen_tap') {
    return (content.luyen_tap.trac_nghiem || []).slice(0, 4).map((item) => item.question).join('\n');
  }
  if (stage === 'van_dung') {
    return (content.van_dung.nhiem_vu || []).join('\n');
  }
  return (content.tong_ket.ghi_nho_trong_tam || []).join('\n');
}

export async function chatWithGemini(
  apiKey: string,
  model: string,
  history: ChatMessage[],
  message: string,
  lesson?: LessonContent | null,
  stage?: LessonStageKey,
  title?: string,
  extraContext?: any,
) {
  const ai = new GoogleGenAI({ apiKey });

  const stageLabelMap: Record<LessonStageKey, string> = {
    khoi_dong: 'Khởi động',
    hinh_thanh_kien_thuc: 'Hình thành kiến thức',
    luyen_tap: 'Luyện tập',
    van_dung: 'Vận dụng',
    tong_ket: 'Tổng kết',
  };

  const lessonSummary = lesson
    ? JSON.stringify({
        metadata: lesson.metadata,
        stageSnippet: getStageSnippet(lesson, stage),
      })
    : '';

  const contents = history.map((msg) => ({
    role: msg.role === 'user' ? 'user' : 'model',
    parts: [{ text: msg.text }],
  }));

  contents.push({ role: 'user', parts: [{ text: message }] });

  const response = await generateContentReliable(ai, model, {
    contents,
    config: {
      systemInstruction: [
        'Bạn là trợ lý học tập thông minh dành cho học sinh phổ thông tại Việt Nam.',
        'Nhiệm vụ chính: trả lời đúng câu hỏi hiện tại của học sinh, bám sát bài học và mục hiện tại.',
        'Ưu tiên tuyệt đối yêu cầu mới nhất của học sinh; không để lịch sử trò chuyện cũ làm lệch ngữ cảnh.',
        'Phong cách bắt buộc: ngắn gọn, đúng trọng tâm, dễ hiểu; không mở bài dài, không lan man.',
        'Nếu ngữ cảnh bổ sung có support_mode, phải tuân thủ định dạng của mode đó: summary = đúng 3 gạch đầu dòng; explain = Hiểu đơn giản/Em cần nhớ; example = Ví dụ gần gũi/Vì sao đúng; question = Câu hỏi tự kiểm tra/Gợi ý; answer_help = Cách hiểu câu hỏi/Ý cần nêu/Ví dụ minh họa.',
        'Giới hạn câu trả lời: ngắn gọn nhưng phải đủ ý và trọn câu. Không được trả lời cụt, không dừng giữa ý. Nếu học sinh hỏi về câu hỏi/bài tập, cần có đủ gợi ý để học sinh tự hoàn thiện câu trả lời.',
        title ? `Bài học hiện tại: ${title}.` : '',
        stage ? `Giai đoạn hiện tại: ${stageLabelMap[stage]}.` : '',
        lessonSummary ? `Dữ liệu bài học: ${lessonSummary}` : '',
        extraContext ? `Ngữ cảnh bổ sung: ${JSON.stringify(extraContext)}` : '',
        'Nếu câu hỏi có ngữ cảnh/nội dung bắt buộc, chỉ sử dụng đúng phần đó; không kéo sang mục khác.',
        'Khi học sinh hỏi về câu hỏi/bài tập: trình bày đủ 3 phần nếu cần: Cách hiểu câu hỏi, Ý cần nêu, Ví dụ minh họa; không làm thay toàn bộ nhưng không được thiếu ý chính.',
        'Khi cần liệt kê, dùng tối đa 3 gạch đầu dòng ngắn; không đánh số dài dòng; không bao giờ để dòng trống như "1." hoặc "-"; mọi câu trả lời phải kết thúc bằng câu hoàn chỉnh.',
        'Nếu học sinh hỏi mơ hồ, hiểu là hỏi về mục đang học và trả lời ngay vào ý chính.',
        'Nếu câu hỏi ngoài bài, nhắc ngắn gọn rằng em nên quay lại nội dung bài học.',
        'Không dùng markdown thô như **, __, ` hoặc ký hiệu kỹ thuật trong câu trả lời.',
      ].filter(Boolean).join('\n'),
      temperature: 0.35,
      maxOutputTokens: 900,
    },
  });

  return response.text || 'Xin lỗi, tôi chưa thể phản hồi lúc này.';
}

export async function streamGeminiChat(
  apiKey: string,
  model: string,
  history: ChatMessage[],
  message: string,
  lesson?: LessonContent | null,
  stage?: LessonStageKey,
  onToken?: (token: string) => void,
  onComplete?: (fullText: string) => void,
) {
  const ai = new GoogleGenAI({ apiKey });

  const stageLabelMap: Record<LessonStageKey, string> = {
    khoi_dong: 'Khởi động',
    hinh_thanh_kien_thuc: 'Hình thành kiến thức',
    luyen_tap: 'Luyện tập',
    van_dung: 'Vận dụng',
    tong_ket: 'Tổng kết',
  };

  const lessonSummary = lesson
    ? JSON.stringify({
        metadata: lesson.metadata,
        stageSnippet: getStageSnippet(lesson, stage),
      })
    : '';

  const contents = history.map((msg) => ({
    role: msg.role === 'user' ? 'user' : 'model',
    parts: [{ text: msg.text }],
  }));

  contents.push({ role: 'user', parts: [{ text: message }] });

  const response = await generateContentStreamReliable(ai, model, {
    contents,
    config: {
      systemInstruction: [
        'Bạn là trợ lý học tập thông minh dành cho học sinh phổ thông tại Việt Nam.',
        'Trả lời ngắn gọn, đúng trọng tâm, bám sát bài học và mục hiện tại.',
        'Tối đa 3 ý chính; mỗi ý 1 câu ngắn. Nếu yêu cầu là ví dụ thì chỉ đưa 1 ví dụ; nếu là tự kiểm tra thì chỉ đặt 1 câu hỏi.',
        'Nếu câu trả lời có đánh số thì phải có nội dung đầy đủ sau số, không để dòng trống như "1.".',
        stage ? `Giai đoạn hiện tại: ${stageLabelMap[stage]}.` : '',
        lessonSummary ? `Dữ liệu bài học: ${lessonSummary}` : '',
        'Không mở bài dài, không lan man. Khi hỏi bài tập, chỉ gợi ý cách nghĩ, không làm thay toàn bộ.',
      ].filter(Boolean).join('\n'),
      temperature: 0.35,
      maxOutputTokens: 900,
    },
  });

  let fullText = '';
  try {
    for await (const chunk of response) {
      const chunkText = chunk.text;
      if (chunkText) {
        fullText += chunkText;
        onToken?.(chunkText);
      }
    }
  } catch (error) {
    console.warn('[EduSmart][AI] streaming response interrupted.', error);
    if (!fullText.trim()) throw safeGeminiUserError(error);
  }
  onComplete?.(fullText);
}

function base64ToUint8Array(base64: string) {
  const normalized = String(base64 || '').trim();
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function pcmToWavBlob(pcmBytes: Uint8Array, sampleRate = 24000, channels = 1, bitDepth = 16) {
  const bytesPerSample = bitDepth / 8;
  const blockAlign = channels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcmBytes.length;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);
  new Uint8Array(buffer, 44).set(pcmBytes);

  return new Blob([buffer], { type: 'audio/wav' });
}

export async function synthesizeTeacherSpeech(apiKey: string, text: string): Promise<Blob> {
  const ai = new GoogleGenAI({ apiKey });
  const transcript = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 4000);
  const response = await generateContentReliable(ai, 'gemini-3.1-flash-tts-preview', {
    contents: [{
      parts: [{
        text: [
          '# AUDIO PROFILE: Giáo viên phổ thông Việt Nam',
          '## Director notes: Giọng đọc rõ ràng, ấm áp, tốc độ vừa phải, phát âm tiếng Việt tự nhiên, phù hợp để giảng bài cho học sinh.',
          '## Transcript:',
          transcript,
        ].join('\n'),
      }],
    }],
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Kore' },
        },
      },
    },
  }, { allowFallback: false, label: 'speech' });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) {
    throw new Error('TTS_NO_AUDIO');
  }
  return pcmToWavBlob(base64ToUint8Array(base64Audio));
}

export interface GeminiKeyTestResult {
  ok: boolean;
  keyValid: boolean;
  model: string;
  message: string;
  code: 'OK' | 'INVALID_KEY' | 'API_RESTRICTED' | 'MODEL_UNAVAILABLE' | 'QUOTA' | 'NETWORK' | 'UNKNOWN';
  availableModels?: string[];
  generationVerified?: boolean;
}

function parseGeminiApiError(payload: any, status: number) {
  const rawMessage = String(payload?.error?.message || payload?.message || '').trim();
  const normalized = rawMessage.toLowerCase();

  if (status === 429 || normalized.includes('quota') || normalized.includes('rate limit')) {
    return { code: 'QUOTA' as const, keyValid: true, message: 'API key hợp lệ nhưng hạn mức Gemini hiện tại đã hết hoặc đang bị giới hạn.' };
  }
  if (status === 404 || normalized.includes('not found') || normalized.includes('not supported')) {
    return { code: 'MODEL_UNAVAILABLE' as const, keyValid: true, message: 'Mô hình đã chọn không khả dụng cho API key này.' };
  }
  if (status === 400 && (normalized.includes('api key') || normalized.includes('key not valid'))) {
    return { code: 'INVALID_KEY' as const, keyValid: false, message: 'API key không hợp lệ. Hãy sao chép lại khóa từ Google AI Studio.' };
  }
  if (status === 401) {
    return { code: 'INVALID_KEY' as const, keyValid: false, message: 'API key không được chấp nhận. Hãy tạo hoặc sao chép lại API key từ Google AI Studio.' };
  }
  if (status === 403) {
    return { code: 'API_RESTRICTED' as const, keyValid: false, message: 'API key chưa được phép sử dụng Gemini API hoặc đang bị giới hạn.' };
  }
  return {
    code: 'UNKNOWN' as const,
    keyValid: false,
    message: rawMessage ? `Chưa xác minh được API key: ${rawMessage}` : 'Chưa thể kết nối Gemini API lúc này. Vui lòng thử lại.',
  };
}

async function fetchGeminiJson(url: string, apiKey: string, init?: RequestInit) {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = globalThis.setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(url, {
        ...init,
        headers: {
          'x-goog-api-key': apiKey,
          ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
          ...(init?.headers || {}),
        },
        signal: controller.signal,
      });
      let payload: any = null;
      try { payload = await response.json(); } catch { payload = null; }
      if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 2) return { response, payload };
      await waitFor(attempt === 0 ? 500 : 1200);
    } catch (error) {
      lastError = error;
      if (attempt === 2) throw error;
      await waitFor(attempt === 0 ? 500 : 1200);
    } finally {
      globalThis.clearTimeout(timeoutId);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Không thể kết nối dịch vụ AI lúc này.');
}

function chooseGeminiModel(requestedModel: string, availableModels: string[]) {
  const available = new Set(availableModels.map((name) => normalizeGeminiModelName(name)));
  const requested = normalizeGeminiModelName(requestedModel);
  if (available.has(requested)) return requested;
  const preferred = AI_MODELS.find((name) => available.has(name));
  if (preferred) return preferred;
  return availableModels.map((name) => normalizeGeminiModelName(name)).find((name) => available.has(name)) || requested;
}

export async function testGeminiKey(apiKey: string, model: string): Promise<GeminiKeyTestResult> {
  const normalizedKey = String(apiKey || '').trim();
  const requestedModel = normalizeGeminiModelName(model || AI_MODELS[0]);

  if (!normalizedKey || normalizedKey.length < 20) {
    return {
      ok: false,
      keyValid: false,
      model: requestedModel,
      code: 'INVALID_KEY',
      message: 'API key chưa đầy đủ. Hãy dán lại khóa Gemini API.',
    };
  }

  try {
    // V6.88.14: xác minh API key bằng Models API. Không dùng generateContent làm
    // cổng chặn cấu hình vì một số model/backend có thể trả INVALID_ARGUMENT
    // cho request kiểm tra cực ngắn dù key và quyền truy cập model là hợp lệ.
    const listUrl = 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000';
    const { response: listResponse, payload: listPayload } = await fetchGeminiJson(listUrl, normalizedKey);

    if (!listResponse.ok) {
      const detail = parseGeminiApiError(listPayload, listResponse.status);
      return {
        ok: false,
        keyValid: detail.keyValid,
        model: requestedModel,
        code: detail.code,
        message: detail.message,
      };
    }

    const availableModels = (Array.isArray(listPayload?.models) ? listPayload.models : [])
      .filter((item: any) => {
        const methods = Array.isArray(item?.supportedGenerationMethods) ? item.supportedGenerationMethods : [];
        return methods.includes('generateContent');
      })
      .map((item: any) => String(item?.baseModelId || item?.name || '').replace(/^models\//, '').trim())
      .filter((name: string) => /^gemini-/i.test(name));

    const uniqueAvailable = Array.from(new Set<string>(availableModels));
    if (!uniqueAvailable.length) {
      return {
        ok: false,
        keyValid: true,
        model: requestedModel,
        code: 'MODEL_UNAVAILABLE',
        message: 'API key hợp lệ nhưng tài khoản hiện chưa được cấp mô hình Gemini có thể tạo nội dung.',
        availableModels: [],
      };
    }

    const resolvedModel = chooseGeminiModel(requestedModel, uniqueAvailable);
    return {
      ok: true,
      keyValid: true,
      model: resolvedModel,
      code: 'OK',
      generationVerified: false,
      availableModels: uniqueAvailable,
      message: resolvedModel === requestedModel
        ? `API key hợp lệ. Mô hình ${resolvedModel} đã được Gemini API xác nhận khả dụng.`
        : `API key hợp lệ. Hệ thống đã tự chọn mô hình khả dụng ${resolvedModel}.`,
    };
  } catch (error) {
    const isAbort = error instanceof DOMException && error.name === 'AbortError';
    return {
      ok: false,
      keyValid: false,
      model: requestedModel,
      code: 'NETWORK',
      message: isAbort
        ? 'Kiểm tra API key quá thời gian. Hãy kiểm tra mạng và thử lại.'
        : 'Không thể kiểm tra Gemini API từ trình duyệt lúc này. Hãy kiểm tra mạng hoặc giới hạn API key.',
    };
  }
}





