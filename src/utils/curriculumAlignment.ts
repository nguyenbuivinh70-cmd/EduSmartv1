import { LessonContent, QuizQuestion } from '../types';
import { CurriculumRequirement, getCurriculumRequirementsByIds, normalizeVietnamese } from '../data/curriculum/registry';

export type CurriculumCoverageRow = {
  requirement: CurriculumRequirement;
  activityCount: number;
  questionCount: number;
  coveredByActivity: boolean;
  coveredByAssessment: boolean;
  status: 'full' | 'activity_only' | 'assessment_only' | 'missing';
};

function cleanIds(value: unknown, allowed: Set<string>) {
  return Array.from(new Set((Array.isArray(value) ? value : [])
    .map((item) => String(item || '').trim())
    .filter((id) => id && allowed.has(id))));
}

function textTokens(value: unknown) {
  const ignored = new Set(['duoc', 'va', 'mot', 'so', 'cac', 'cua', 'trong', 'voi', 'cho', 've', 'co', 'the', 'biet', 'neu', 'thuc', 'hien']);
  return normalizeVietnamese(value).split(/\s+/).filter((token) => token.length >= 3 && !ignored.has(token));
}

function scoreRequirement(text: string, requirement: CurriculumRequirement) {
  const haystack = new Set(textTokens(text));
  const tokens = textTokens(`${requirement.text} ${(requirement.verbs || []).join(' ')}`);
  return tokens.reduce((sum, token) => sum + (haystack.has(token) ? 1 : 0), 0);
}

function bestRequirementIds(text: string, requirements: CurriculumRequirement[]) {
  if (!requirements.length) return [];
  const ranked = requirements
    .map((requirement) => ({ requirement, score: scoreRequirement(text, requirement) }))
    .sort((a, b) => b.score - a.score);
  const top = ranked[0]?.score || 0;
  // Không tự gán YCCD khi nội dung không có tín hiệu phù hợp. Giữ trống để
  // ma trận độ phủ cảnh báo giáo viên thay vì tạo cảm giác "đủ 100%" giả.
  if (top <= 0) return [];
  return ranked.filter((item) => item.score === top).slice(0, 2).map((item) => item.requirement.id);
}

function evidenceForIds(ids: string[], requirements: CurriculumRequirement[]) {
  const map = new Map(requirements.map((item) => [item.id, item]));
  const labels = ids.map((id) => map.get(id)).filter(Boolean).map((item) => item!.id);
  return labels.length ? `Minh chứng đánh giá cho ${labels.join(', ')}` : '';
}

function activityText(activity: NonNullable<LessonContent['activities']>[number]) {
  return [
    activity.title,
    activity.objective,
    activity.summary,
    ...(activity.pages || []).flatMap((page) => [page.title, page.subtitle, page.student_prompt, ...(page.blocks || []).flatMap((block) => [block.title, block.text])]),
  ].filter(Boolean).join(' ');
}

function questionText(question: QuizQuestion) {
  return [question.question, question.explanation, ...(question.options || []), ...(question.choices || [])].filter(Boolean).join(' ');
}

/**
 * Chuẩn hoá các ID YCCD mà AI trả về, không cho phép AI bịa ID ngoài registry.
 */
export function normalizeCurriculumAlignment(lesson: LessonContent, requirementIds: string[]): LessonContent {
  const requirements = getCurriculumRequirementsByIds(requirementIds);
  const allowed = new Set(requirements.map((item) => item.id));
  if (!allowed.size) return lesson;

  const activities = (lesson.activities || []).map((activity) => ({
    ...activity,
    requirement_ids: cleanIds(activity.requirement_ids, allowed),
    interactions: (activity.interactions || []).map((question) => ({
      ...question,
      requirement_ids: cleanIds(question.requirement_ids, allowed),
    })),
  }));

  const finalQuiz = (lesson.final_quiz || []).map((question) => ({
    ...question,
    requirement_ids: cleanIds(question.requirement_ids, allowed),
  }));
  const questionBank = (lesson.question_bank || []).map((question) => ({
    ...question,
    requirement_ids: cleanIds(question.requirement_ids, allowed),
  }));

  return {
    ...lesson,
    activities,
    final_quiz: finalQuiz,
    question_bank: questionBank,
  };
}

/**
 * Hoàn thiện tham chiếu YCCD sau khi AI sinh bài và sau khi frontend bù quota câu hỏi.
 * Các câu được tạo cục bộ kế thừa YCCD từ hoạt động cha; câu cuối bài/ngân hàng
 * được gắn với YCCD gần nội dung nhất. Đây là metadata điều hướng/kiểm tra độ phủ,
 * không thay đổi nội dung chuẩn của CTGDPT 2018.
 */
export function completeCurriculumReferences(lesson: LessonContent, requirementIds: string[]): LessonContent {
  const requirements = getCurriculumRequirementsByIds(requirementIds);
  if (!requirements.length) return lesson;
  const allowed = new Set(requirements.map((item) => item.id));
  const normalized = normalizeCurriculumAlignment(lesson, requirementIds);

  const activities = (normalized.activities || []).map((activity) => {
    const ids = cleanIds(activity.requirement_ids, allowed);
    const activityIds = ids.length ? ids : bestRequirementIds(activityText(activity), requirements);
    return {
      ...activity,
      requirement_ids: activityIds,
      interactions: (activity.interactions || []).map((question) => {
        const questionIds = cleanIds(question.requirement_ids, allowed);
        const resolvedIds = questionIds.length ? questionIds : (activityIds.length ? activityIds : bestRequirementIds(questionText(question), requirements));
        return {
          ...question,
          requirement_ids: resolvedIds,
          assessment_evidence: question.assessment_evidence || evidenceForIds(resolvedIds, requirements),
        };
      }),
    };
  });

  // Không ép gắn YCCD còn thiếu vào hoạt động không liên quan. Nếu AI/học liệu
  // chưa thể hiện một YCCD, ma trận độ phủ sẽ giữ trạng thái thiếu để giáo viên rà soát.

  const completeQuestion = (question: QuizQuestion): QuizQuestion => {
    const ids = cleanIds(question.requirement_ids, allowed);
    const resolvedIds = ids.length ? ids : bestRequirementIds(questionText(question), requirements);
    return {
      ...question,
      requirement_ids: resolvedIds,
      assessment_evidence: question.assessment_evidence || evidenceForIds(resolvedIds, requirements),
    };
  };

  let finalQuiz = (normalized.final_quiz || []).map(completeQuestion);
  let questionBank = (normalized.question_bank || []).map(completeQuestion);

  // Không ép gắn YCCD còn thiếu vào câu hỏi. Đây là điều kiện để Coverage Validator
  // phản ánh đúng chất lượng tạo bài thay vì chỉ kiểm tra sự có mặt của metadata.

  // Câu tương tác local kế thừa YCCD cha khi bản thân câu chưa có tham chiếu hợp lệ.
  const alignedActivities = activities.map((activity) => ({
    ...activity,
    interactions: (activity.interactions || []).map((question) => {
      const resolvedIds = cleanIds(question.requirement_ids, allowed).length
        ? cleanIds(question.requirement_ids, allowed)
        : [...(activity.requirement_ids || [])];
      return {
        ...question,
        requirement_ids: resolvedIds,
        assessment_evidence: question.assessment_evidence || evidenceForIds(resolvedIds, requirements),
      };
    }),
  }));

  return {
    ...normalized,
    activities: alignedActivities,
    final_quiz: finalQuiz,
    question_bank: questionBank,
  };
}

export function getCurriculumCoverageStatus(lesson: LessonContent | null | undefined, requirementIds: string[]) {
  const requirements = getCurriculumRequirementsByIds(requirementIds);
  if (!lesson || !requirements.length) {
    return { rows: [] as CurriculumCoverageRow[], total: requirements.length, full: 0, activityCovered: 0, assessmentCovered: 0, percent: requirements.length ? 0 : 100, ok: requirements.length === 0 };
  }

  const activityRefs = new Map<string, number>();
  const questionRefs = new Map<string, number>();
  const countIds = (target: Map<string, number>, ids?: string[]) => {
    for (const id of ids || []) target.set(id, (target.get(id) || 0) + 1);
  };

  for (const activity of lesson.activities || []) {
    countIds(activityRefs, activity.requirement_ids);
    for (const question of activity.interactions || []) countIds(questionRefs, question.requirement_ids);
  }
  for (const question of lesson.final_quiz || []) countIds(questionRefs, question.requirement_ids);
  for (const question of lesson.question_bank || []) countIds(questionRefs, question.requirement_ids);

  const rows: CurriculumCoverageRow[] = requirements.map((requirement) => {
    const activityCount = activityRefs.get(requirement.id) || 0;
    const questionCount = questionRefs.get(requirement.id) || 0;
    const coveredByActivity = activityCount > 0;
    const coveredByAssessment = questionCount > 0;
    const status: CurriculumCoverageRow['status'] = coveredByActivity && coveredByAssessment
      ? 'full'
      : coveredByActivity
        ? 'activity_only'
        : coveredByAssessment
          ? 'assessment_only'
          : 'missing';
    return { requirement, activityCount, questionCount, coveredByActivity, coveredByAssessment, status };
  });
  const full = rows.filter((row) => row.status === 'full').length;
  const activityCovered = rows.filter((row) => row.coveredByActivity).length;
  const assessmentCovered = rows.filter((row) => row.coveredByAssessment).length;
  const percent = rows.length ? Math.round((full / rows.length) * 100) : 100;
  return { rows, total: rows.length, full, activityCovered, assessmentCovered, percent, ok: full === rows.length };
}

export function curriculumQuestionIds(question: QuizQuestion) {
  return Array.isArray(question.requirement_ids) ? question.requirement_ids.filter(Boolean) : [];
}
