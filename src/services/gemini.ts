import { GoogleGenAI } from '@google/genai';
import {
  ChatMessage,
  GoogleSlidePromptItem,
  GoogleSlidesPromptResult,
  LessonBuilderSettings,
  LessonComposerValues,
  LessonContent,
  LessonStageKey,
  QuizQuestion,
  QuizQuestionType,
  UploadedSourceFile,
} from '../types';

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

const DEFAULT_FILL_DISTRACTORS = ['dữ liệu', 'thông tin', 'vật mang tin', 'xử lí thông tin', 'máy tính', 'bộ xử lí', 'Internet', 'phần mềm'];

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
  const base = uniqueByText([...correct, ...rawChoices, ...DEFAULT_FILL_DISTRACTORS]);
  const result = base.slice(0, 4);
  while (result.length < 4) result.push(`Lựa chọn ${result.length + 1}`);
  return result;
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
      const result: QuizQuestion = {
        id: String(raw?.id || `SC${index + 1}`),
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
      };
      return result;
    })
    .filter(Boolean) as LessonContent['luyen_tap']['trac_nghiem'];
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
      question_mix: settings.question_mix || 'mixed',
      difficulty: settings.difficulty || 'medium',
      include_examples: settings.include_examples !== false,
      include_summary: settings.include_summary !== false,
      allow_retry: settings.allow_retry !== false,
      show_explanation: settings.show_explanation !== false,
      interactive_weight: Number(settings.interactive_weight || assessment.interactive_weight || 40),
      final_quiz_weight: Number(settings.final_quiz_weight || assessment.final_quiz_weight || 60),
      pass_score: Number(settings.pass_score || assessment.pass_score || 5),
      lesson_time_minutes: Number(settings.lesson_time_minutes || 45),
      auto_finish_lesson_on_timeout: settings.auto_finish_lesson_on_timeout !== false,
      final_exam_time_minutes: Number(settings.final_exam_time_minutes || 15),
      shuffle_final_questions: settings.shuffle_final_questions !== false,
      shuffle_final_options: settings.shuffle_final_options !== false,
      show_final_answers_after_submit: settings.show_final_answers_after_submit !== false,
      allow_exam_retry: settings.allow_exam_retry !== false,
      max_exam_attempts: Number(settings.max_exam_attempts || 2),
      exam_score_policy: settings.exam_score_policy || 'best',
      ai_instructions: cleanTextValue(settings.ai_instructions || ''),
    },
    sections,
    final_quiz: finalQuiz.map((q, index) => ({ ...q, id: q.id || `FQ${index + 1}` })),
    assessment: {
      interactive_weight: Number(assessment.interactive_weight || settings.interactive_weight || 40),
      final_quiz_weight: Number(assessment.final_quiz_weight || settings.final_quiz_weight || 60),
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

export function normalizeLessonContent(raw: any): LessonContent {
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
    const message = error instanceof Error ? error.message : String(error || 'Không rõ lỗi');
    throw new Error(`AI trả về JSON chưa hợp lệ và hệ thống không thể tự sửa. Chi tiết: ${message}`);
  }
}

async function repairLessonJsonWithAI(apiKey: string, model: string, brokenJsonText: string, originalError: unknown) {
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model,
    contents: [{
      role: 'user',
      parts: [{ text: `JSON sau bị lỗi cú pháp khi phân tích bài học. Hãy sửa thành JSON hợp lệ theo schema lesson_v2. Không thêm markdown, không giải thích. Lưu ý: nếu trong chuỗi có dấu ngoặc kép tiếng Việt như "bộ não", hãy đổi thành dấu nháy đơn hoặc escape đúng chuẩn JSON.\n\nLỗi: ${originalError instanceof Error ? originalError.message : String(originalError || '')}\n\nJSON cần sửa:\n${sliceLikelyJson(brokenJsonText).slice(0, 65000)}` }],
    }],
    config: {
      systemInstruction: 'Bạn chỉ sửa cú pháp JSON. Luôn trả về JSON hợp lệ, không markdown.',
      responseMimeType: 'application/json',
      temperature: 0.05,
    },
  });
  return tryParseJsonCandidate(response.text || '');
}

function buildAnalysisPrompt(
  values: Pick<LessonComposerValues, 'tieu_de' | 'mon_id' | 'khoi' | 'source_text'>,
  subjectLabel?: string,
  settings?: LessonBuilderSettings,
) {
  const config = settings || {} as LessonBuilderSettings;
  return `
Bạn là chuyên gia thiết kế bài học trực tuyến tương tác cho học sinh phổ thông Việt Nam.

Nhiệm vụ:
- Phân tích học liệu gốc và tạo DUY NHẤT 1 JSON hợp lệ bằng tiếng Việt.
- Tạo bài học theo cấu trúc SGK điện tử chất lượng cao: Mục tiêu bài học → Tình huống khởi động → Kiến thức theo mục → Hoạt động/quan sát → Ghi nhớ → Câu hỏi tương tác → Kiểm tra cuối bài → Vận dụng.
- Tự xác định số nội dung kiến thức dựa trên học liệu nguồn; mỗi section phải tương ứng với một mục kiến thức thật trong tài liệu, ví dụ: “Xử lí thông tin”, “Xử lí thông tin trong máy tính”, “Ứng dụng thực tế…”, “Tác động…”. Không tách vụn thành các đoạn nhỏ rời rạc.
- Mỗi nội dung kiến thức bắt buộc có ít nhất ${config.interactive_questions_per_section || 1} câu hỏi tương tác.
- Câu hỏi tương tác trong từng nội dung chỉ hỗ trợ 3 dạng: single_choice, true_false, fill_in_blank. Không tạo short_answer/tự luận ngắn trong bài học.
- Dạng fill_in_blank là câu chọn từ/cụm từ có sẵn để điền vào chỗ trống: mỗi câu có đúng 1 ô trống ký hiệu _____, đúng 4 choices, correctAnswers gồm đúng 1 từ/cụm từ đúng. Các câu mở dạng kể tên, nêu ý kiến, giải thích, liên hệ thực tế phải chuyển thành fill_in_blank bằng cách chọn một khái niệm/từ khóa/cụm từ trọng tâm để điền, không tạo ô nhập tự luận.
- Chỉ tạo true_false khi câu hỏi là một phát biểu có thể xác định Đúng hoặc Sai rõ ràng.
- Không dùng markdown thô như **, ##, ký tự đầu dòng rối trong nội dung.
- Không tạo tiêu đề dạng "Nội dung 1: ...", "Nội dung 2: ...". Nếu học liệu đã có tiêu đề "1. ...", "2. ..." thì giữ nguyên tiêu đề đó.
- Với mỗi content_blocks, bắt buộc đặt title ngắn gọn theo đúng ý chính của đoạn, không dùng title chung chung như "Ý 1", "Ý 2", "Kiến thức trọng tâm", "Hoạt động luyện hiểu". Không để nhiều khối liên tiếp trùng title. Ví dụ: "Dữ liệu từ tín hiệu giao thông", "Mối quan hệ giữa thông tin và dữ liệu", "Vật mang tin trong đời sống".
- Với mỗi content_blocks, gán category phù hợp: khai_niem, giai_thich, vi_du, ung_dung, ghi_nho, hoat_dong, lien_he_thuc_te, mo_rong. Gán theme màu nhẹ: blue, violet, amber, emerald, rose, cyan, orange.
- Mỗi section nên có 3-5 content_blocks theo trật tự sư phạm: tình huống/hoạt động nếu có → khái niệm/giải thích → ví dụ/ứng dụng → ghi nhớ. Mỗi block viết ngắn gọn, tối đa khoảng 80 từ, tránh một đoạn văn quá dài.
- Nếu học liệu có khung hoặc mục Ghi nhớ/Kết luận/Em cần nhớ/Lưu ý thì phải trích đúng nội dung đó vào source_note và summary của section tương ứng, đồng thời tạo một content_block category="ghi_nho".
- Nếu học liệu có câu hỏi/hoạt động/bài tập/Em hãy/Quan sát/Thảo luận thì phải ưu tiên chuyển các câu hỏi đó thành interactive_questions hoặc final_quiz; chỉ sinh thêm câu hỏi khi không đủ số lượng cấu hình.
- Với học liệu dạng SGK có các khối “Sau bài này em sẽ”, “Hoạt động”, “Hình”, “Luyện tập”, “Vận dụng”: hãy giữ logic sư phạm này. Hoạt động quan sát/hỏi đáp trong bài dùng làm interactive_questions; Luyện tập/Vận dụng dùng làm final_quiz hoặc fill_in_blank trong section nếu là câu hỏi mở.
- Không trả về HTML thô như <br>, <p>, <div>. Dùng xuống dòng \n hoặc content_blocks.
- Bắt buộc bảo đảm JSON hợp lệ tuyệt đối: nếu nội dung có dấu ngoặc kép trong câu như “bộ não”, hãy đổi sang dấu nháy đơn hoặc escape thành \"bộ não\"; không để dấu ngoặc kép thô bên trong chuỗi JSON.
- Không xuất markdown, không xuất chú thích ngoài JSON, không dùng danh sách bằng dấu • bên ngoài chuỗi. Mọi array phải có dấu phẩy giữa các phần tử; không để phần tử cuối có dấu phẩy thừa; không bỏ sót dấu đóng } hoặc ].
- Nếu không chắc chắn, hãy tạo JSON ngắn hơn nhưng đúng cú pháp, thay vì tạo JSON dài dễ lỗi.

Bối cảnh:
- Tiêu đề: ${values.tieu_de || 'Chưa nhập'}
- Môn học: ${subjectLabel || values.mon_id || 'Chưa rõ'}
- Khối lớp: ${values.khoi || 'Chưa rõ'}

Cấu hình bài học:
- Số câu hỏi tương tác mỗi nội dung: ${config.interactive_questions_per_section || 1}
- Số câu hỏi cuối bài: ${config.final_quiz_count || 10}
- Loại câu hỏi: ${config.question_mix || 'mixed'} (mixed = kết hợp single_choice, true_false, fill_in_blank)
- Mức độ: ${config.difficulty || 'medium'}
- Có ví dụ minh họa: ${config.include_examples !== false ? 'có' : 'không'}
- Có ghi nhớ cuối mỗi nội dung: ${config.include_summary !== false ? 'có' : 'không'}
- Hiển thị giải thích đáp án: ${config.show_explanation !== false ? 'có' : 'không'}
- Điểm đạt: ${config.pass_score || 5}/10
- Tỉ trọng điểm tương tác: ${config.interactive_weight || 40}%
- Tỉ trọng điểm cuối bài: ${config.final_quiz_weight || 60}%
- Thời gian học toàn bài: ${config.lesson_time_minutes || 45} phút
- Tự kết thúc khi hết thời gian học: ${config.auto_finish_lesson_on_timeout !== false ? 'có' : 'không'}
- Thời gian kiểm tra cuối bài: ${config.final_exam_time_minutes || 15} phút
- Đảo câu hỏi kiểm tra cuối bài: ${config.shuffle_final_questions !== false ? 'có' : 'không'}
- Đảo đáp án kiểm tra cuối bài: ${config.shuffle_final_options !== false ? 'có' : 'không'}
- Cho xem đáp án sau khi nộp: ${config.show_final_answers_after_submit !== false ? 'có' : 'không'}
- Cho phép làm lại kiểm tra: ${config.allow_exam_retry !== false ? 'có' : 'không'}
- Số lần làm lại tối đa: ${config.max_exam_attempts || 2}
- Cách lấy điểm kiểm tra: ${config.exam_score_policy || 'best'}
- Yêu cầu riêng: ${config.ai_instructions || 'Không có'}

Yêu cầu nội dung:
1. metadata.muc_tieu_bai_hoc có 3-5 ý ngắn gọn.
2. sections: tự chia theo các đơn vị kiến thức thật sự có trong học liệu; mỗi section có title, content, summary, examples, youtube_url để trống nếu chưa có, interactive_questions.
3. section.content là đoạn văn dễ học, có thể xuống dòng bằng \n, bám sát học liệu.
4. section.content_blocks phải chia nội dung thành các khối ngắn. Mỗi khối có type, title, category, theme, text. title phải bám sát nội dung, không dùng tiêu đề chung chung, không trùng title giữa các khối nếu nội dung khác nhau.
5. section.interactive_questions gồm câu hỏi kiểm tra ngay sau phần kiến thức và chỉ có 3 dạng: single_choice, true_false, fill_in_blank. Với fill_in_blank phải có sentence chứa đúng một _____, choices đúng 4 từ/cụm từ, correctAnswers đúng 1 từ/cụm từ đúng và explanation.
5. final_quiz gồm câu hỏi cuối bài khách quan dạng single_choice và true_false, có explanation; không dùng short_answer. Các đáp án phải có option rõ, đáp án đúng phải không phụ thuộc thứ tự hiển thị để hệ thống có thể đảo đáp án.
6. settings phải lưu đầy đủ cấu hình thời gian học, thời gian kiểm tra, đảo câu hỏi, đảo đáp án, xem đáp án sau khi nộp, làm lại kiểm tra.
7. assessment quy định thang điểm 10.
7. Nếu học liệu có nội dung vận dụng, đưa vào phần section hoặc final_quiz theo hướng đánh giá năng lực.

JSON bắt buộc:
{
  "schema_version": "lesson_v2",
  "title": "",
  "metadata": {
    "tieu_de": "",
    "mon_hoc": "",
    "khoi": "",
    "chu_de": "",
    "tom_tat": "",
    "muc_tieu_bai_hoc": [""],
    "tu_khoa": [""],
    "thong_diep_chinh": "",
    "thoi_luong_goi_y": ""
  },
  "settings": {
    "content_count": 0,
    "interactive_questions_per_section": ${config.interactive_questions_per_section || 1},
    "final_quiz_count": ${config.final_quiz_count || 10},
    "question_mix": "${config.question_mix || 'mixed'}",
    "difficulty": "${config.difficulty || 'medium'}",
    "include_examples": ${config.include_examples !== false},
    "include_summary": ${config.include_summary !== false},
    "allow_retry": ${config.allow_retry !== false},
    "show_explanation": ${config.show_explanation !== false},
    "interactive_weight": ${config.interactive_weight || 40},
    "final_quiz_weight": ${config.final_quiz_weight || 60},
    "pass_score": ${config.pass_score || 5},
    "lesson_time_minutes": ${config.lesson_time_minutes || 45},
    "auto_finish_lesson_on_timeout": ${config.auto_finish_lesson_on_timeout !== false},
    "final_exam_time_minutes": ${config.final_exam_time_minutes || 15},
    "shuffle_final_questions": ${config.shuffle_final_questions !== false},
    "shuffle_final_options": ${config.shuffle_final_options !== false},
    "show_final_answers_after_submit": ${config.show_final_answers_after_submit !== false},
    "allow_exam_retry": ${config.allow_exam_retry !== false},
    "max_exam_attempts": ${config.max_exam_attempts || 2},
    "exam_score_policy": "${config.exam_score_policy || 'best'}",
    "ai_instructions": ""
  },
  "sections": [
    {
      "section_id": "S1",
      "title": "",
      "content": "",
      "content_blocks": [
        { "type": "paragraph", "title": "Bộ xử lí là gì?", "category": "khai_niem", "theme": "blue", "text": "" },
        { "type": "example", "title": "Ví dụ trong đời sống", "category": "vi_du", "theme": "amber", "text": "" },
        { "type": "note", "title": "Điều em cần nhớ", "category": "ghi_nho", "theme": "emerald", "text": "" }
      ],
      "source_note": "",
      "summary": "",
      "examples": [""],
      "youtube_url": "",
      "youtube_embed_url": "",
      "interactive_questions": [
        {
          "id": "IQ1",
          "type": "single_choice",
          "question": "",
          "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
          "correctAnswer": "A",
          "explanation": "",
          "level": "nhan_biet"
        },
        {
          "id": "IQ2",
          "type": "true_false",
          "question": "",
          "options": ["Đúng", "Sai"],
          "correctAnswer": "Đúng",
          "explanation": "",
          "level": "thong_hieu"
        },
        {
          "id": "IQ3",
          "type": "fill_in_blank",
          "question": "Điền từ/cụm từ thích hợp vào chỗ trống.",
          "sentence": "_____ là khái niệm trọng tâm của nội dung vừa học.",
          "choices": ["dữ liệu", "thông tin", "vật mang tin", "xử lí thông tin"],
          "correctAnswers": ["dữ liệu"],
          "explanation": "Giải thích ngắn vì sao từ/cụm từ này phù hợp với chỗ trống.",
          "level": "van_dung",
          "source": "from_lesson"
        }
      ]
    }
  ],
  "final_quiz": [
    {
      "id": "FQ1",
      "type": "single_choice",
      "question": "",
      "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
      "correctAnswer": "A",
      "explanation": "",
      "level": "thong_hieu"
    },
    {
      "id": "FQ2",
      "type": "true_false",
      "question": "",
      "options": ["Đúng", "Sai"],
      "correctAnswer": "Sai",
      "explanation": "",
      "level": "van_dung"
    }
  ],
  "assessment": {
    "interactive_weight": ${config.interactive_weight || 40},
    "final_quiz_weight": ${config.final_quiz_weight || 60},
    "score_scale": 10,
    "pass_score": ${config.pass_score || 5}
  },
  "raw_text_excerpt": ""
}

Chỉ trả về JSON, không giải thích thêm.
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
  const response = await ai.models.generateContent({
    model,
    contents: [{
      role: 'user',
      parts: [{ text: `Bạn là chuyên gia thiết kế bài học trực tuyến. Hãy chỉnh sửa JSON bài học theo yêu cầu của giáo viên, giữ nguyên schema_version lesson_v2, bảo toàn cấu trúc sections, interactive_questions, final_quiz, assessment. Không tạo tiêu đề dạng "Nội dung 1" dư thừa, không trả HTML thô như <br>, ưu tiên giữ ghi nhớ và câu hỏi lấy từ học liệu gốc; không ép câu hỏi mở thành đúng/sai; nếu cần câu hỏi mở, hãy chuyển thành fill_in_blank với 1 chỗ trống và 4 từ/cụm từ lựa chọn. Với content_blocks, đặt title ngắn gọn theo đúng ý chính, gán category/theme để giao diện hiển thị màu nền nhẹ phù hợp.\n\nYêu cầu chỉnh sửa: ${request}\n\nCấu hình hiện tại: ${JSON.stringify(settings || lesson.settings || {})}\n\nJSON bài học hiện tại:\n${JSON.stringify(lesson).slice(0, 60000)}\n\nChỉ trả về JSON bài học đã chỉnh sửa, không giải thích thêm.` }],
    }],
    config: {
      systemInstruction: 'Luôn trả về JSON hợp lệ theo schema lesson_v2. Không trả về markdown.',
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
  return normalizeLessonContent(parsed);
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
  const response = await ai.models.generateContent({
    model,
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
  const response = await ai.models.generateContent({
    model,
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
      const retryResponse = await ai.models.generateContent({
        model,
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

export async function analyzeLessonMaterial(
  apiKey: string,
  model: string,
  values: Pick<LessonComposerValues, 'tieu_de' | 'mon_id' | 'khoi' | 'source_text'>,
  sourceFile?: UploadedSourceFile | null,
  subjectLabel?: string,
  settings?: LessonBuilderSettings,
): Promise<LessonContent> {
  const ai = new GoogleGenAI({ apiKey });
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

  const response = await ai.models.generateContent({
    model,
    contents: [{ role: 'user', parts }],
    config: {
      systemInstruction: 'Bạn tạo học liệu số chất lượng cao cho học sinh phổ thông Việt Nam. Luôn xuất JSON hợp lệ.',
      responseMimeType: 'application/json',
      temperature: 0.3,
    },
  });

  let parsed: any;
  try {
    parsed = extractJson(response.text || '');
  } catch (error) {
    try {
      parsed = await repairLessonJsonWithAI(apiKey, model, response.text || '', error);
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

      const retryResponse = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: retryParts }],
        config: {
          systemInstruction: 'Chỉ tạo JSON hợp lệ. Không markdown. Không giải thích. Ưu tiên JSON ngắn gọn nhưng đúng cú pháp.',
          responseMimeType: 'application/json',
          temperature: 0.05,
        },
      });

      try {
        parsed = extractJson(retryResponse.text || '');
      } catch (retryError) {
        try {
          parsed = await repairLessonJsonWithAI(apiKey, model, retryResponse.text || '', retryError);
        } catch (finalError) {
          throw new Error(`AI tạo nội dung chưa đúng định dạng JSON sau nhiều lần sửa. Vui lòng bấm tạo lại hoặc giảm độ dài tài liệu. Chi tiết: ${finalError instanceof Error ? finalError.message : String(finalError || '')}`);
        }
      }
    }
  }
  const normalized = normalizeLessonContent(parsed);
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

  const response = await ai.models.generateContent({
    model,
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

  const response = await ai.models.generateContentStream({
    model,
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
  for await (const chunk of response) {
    const chunkText = chunk.text;
    if (chunkText) {
      fullText += chunkText;
      onToken?.(chunkText);
    }
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
  const response = await ai.models.generateContent({
    model: 'gemini-3.1-flash-tts-preview',
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
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) {
    throw new Error('TTS_NO_AUDIO');
  }
  return pcmToWavBlob(base64ToUint8Array(base64Audio));
}

export async function testGeminiKey(apiKey: string, model: string) {
  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model,
      contents: 'Hello',
    });
    return !!response.text;
  } catch {
    return false;
  }
}





