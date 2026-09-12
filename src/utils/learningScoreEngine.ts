import type { LessonProgressRecord, SectionLearningProgress } from '../types';

export interface SectionScoreInput {
  sectionId: string;
  timeSpentSeconds: number;
  requiredSeconds: number;
  answeredCount: number;
  correctCount: number;
  questionTotal: number;
  previous?: SectionLearningProgress | null;
  nowIso?: string;
}

/**
 * Kept for API compatibility with older UI code. From Score Model V4 onward
 * learning activities never produce points, so score/scorable counts are empty.
 */
export interface LearningProcessScoreSummary {
  score?: number;
  scoredCount: number;
  scorableCount: number;
  pendingScorableCount: number;
  nonScorableCount: number;
}

/** Compatibility name retained to avoid a wide migration of callers. */
export interface AssessmentScoreV3Input {
  learningProcessScore?: number;
  learningProcessAvailable?: boolean;
  finalQuizScore?: number;
  finalQuizExists?: boolean;
  finalSubmitted?: boolean;
  allRequiredSectionsCompleted?: boolean;
  learningWeight?: number;
  finalWeight?: number;
}

/** Compatibility name retained; semantics are Score Model V4. */
export interface AssessmentScoreV3Result {
  currentScore?: number;
  finalScore?: number;
  scoreStatus: 'in_progress' | 'finalized' | 'not_applicable';
  learningComponentWeight: number;
  finalComponentWeight: number;
  availableComponentCount: number;
}

export function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
}

export function roundScore(value: number) {
  return Math.round(Math.max(0, Math.min(10, Number(value || 0))) * 10) / 10;
}

function finiteScore(value: unknown): number | undefined {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? roundScore(numberValue) : undefined;
}

/**
 * Video chuẩn bị chỉ tạo trạng thái chuẩn bị và không tham gia điểm.
 * Hàm legacy này được giữ để tương thích consent học cùng V5.
 */
export type PreparationScoreStatus = 'not_started' | 'in_progress' | 'prepared' | 'late_completed' | 'unknown';

export function preparationScoreFromStatus(status?: PreparationScoreStatus | string, neutralUnknown = false) {
  if (status === 'prepared') return 10;
  if (status === 'unknown' && neutralUnknown) return 10;
  return 0;
}

/**
 * V6.81.0 – Learning activity completion only.
 * - Hoạt động KHÔNG tạo điểm, kể cả khi có câu hỏi tương tác.
 * - Thời gian + hoàn thành tương tác chỉ quyết định trạng thái hoàn thành.
 * - correctCount vẫn được giữ để phản hồi học tập, nhưng không được quy đổi thành điểm.
 */
export function calculateSectionProgress(input: SectionScoreInput): SectionLearningProgress {
  const required = Math.max(1, Number(input.requiredSeconds || 1));
  const timeSpent = Math.max(Number(input.previous?.timeSpentSeconds || 0), Number(input.timeSpentSeconds || 0));
  const total = Math.max(0, Number(input.questionTotal || 0));
  const answered = total > 0
    ? Math.max(0, Math.min(total, Number(input.answeredCount || 0)))
    : 0;
  const correct = total > 0
    ? Math.max(0, Math.min(answered, Number(input.correctCount || 0)))
    : 0;
  const timePercent = clampPercent((timeSpent / required) * 100);
  const interactionPercent = total > 0 ? clampPercent((answered / total) * 100) : 100;
  const completionPercent = total > 0
    ? clampPercent(timePercent * 0.4 + interactionPercent * 0.6)
    : timePercent;
  const completed = timeSpent >= required && (total === 0 || answered >= total);
  const now = input.nowIso || new Date().toISOString();
  const opened = Boolean(input.previous?.opened) || timeSpent > 0 || answered > 0;
  let status: SectionLearningProgress['status'] = 'not_started';
  if (completed) status = 'completed';
  else if (opened && timePercent < 100) status = 'viewing';
  else if (opened && total > 0 && answered < total) status = 'need_interaction';
  else if (opened) status = 'viewing';

  return {
    sectionId: input.sectionId,
    opened,
    status,
    timeSpentSeconds: timeSpent,
    requiredSeconds: required,
    interactionCount: answered,
    answeredQuestionIds: input.previous?.answeredQuestionIds || [],
    correctCount: correct,
    questionTotal: total,
    timePercent: Math.round(timePercent),
    interactionPercent: Math.round(interactionPercent),
    completionPercent: Math.round(completionPercent),
    section_score: undefined,
    score_status: 'not_applicable',
    score_calculated_at: undefined,
    completedAt: completed ? (input.previous?.completedAt || now) : '',
    lastVisitedAt: input.previous?.lastVisitedAt || now,
  };
}

export function deriveSectionScores(_sectionProgress?: Record<string, SectionLearningProgress>) {
  return {} as Record<string, number>;
}

export function getLearningProcessScoreSummary(sectionProgress?: Record<string, SectionLearningProgress>): LearningProcessScoreSummary {
  const count = Object.values(sectionProgress || {}).length;
  return {
    score: undefined,
    scoredCount: 0,
    scorableCount: 0,
    pendingScorableCount: 0,
    nonScorableCount: count,
  };
}

/** Legacy helper. From V4 learning activities never have an aggregate score. */
export function calculateLearningProcessScore(_sectionProgress?: Record<string, SectionLearningProgress>) {
  return 0;
}

/**
 * Score Model V4 – SINGLE OFFICIAL SCORE.
 * - Chỉ kiểm tra cuối bài tạo điểm.
 * - Học sinh phải hoàn thành TẤT CẢ mục học tập trước khi điểm được chốt.
 * - Trước khi bấm Nộp bài không có điểm tạm tính.
 * - Khi hợp lệ: assessment_score = current_score = final_quiz_score (100%).
 * - Bài không có kiểm tra cuối bài: không áp dụng điểm số.
 */
export function calculateFairAssessmentScore(input: AssessmentScoreV3Input): AssessmentScoreV3Result {
  const finalQuizExists = input.finalQuizExists === true;
  if (!finalQuizExists) {
    return {
      currentScore: undefined,
      finalScore: undefined,
      scoreStatus: 'not_applicable',
      learningComponentWeight: 0,
      finalComponentWeight: 0,
      availableComponentCount: 0,
    };
  }

  const finalQuizScore = finiteScore(input.finalQuizScore);
  const canFinalize = input.finalSubmitted === true
    && input.allRequiredSectionsCompleted === true
    && finalQuizScore !== undefined;

  return {
    currentScore: canFinalize ? finalQuizScore : undefined,
    finalScore: canFinalize ? finalQuizScore : undefined,
    scoreStatus: canFinalize ? 'finalized' : 'in_progress',
    learningComponentWeight: 0,
    finalComponentWeight: 100,
    availableComponentCount: canFinalize ? 1 : 0,
  };
}

export interface ProgressScoreV3Weights {
  learningWeight?: number;
  finalWeight?: number;
  finalQuizExists?: boolean;
  allRequiredSectionsCompleted?: boolean;
}

/**
 * Áp dụng Score Model V4. Tên hàm V3 được giữ vì nhiều caller cũ đang import;
 * record sinh ra luôn mang score_model_version=4.
 */
export function applyProgressScoreModelV3(
  record: LessonProgressRecord,
  weights?: ProgressScoreV3Weights,
  nowIso = new Date().toISOString(),
): LessonProgressRecord {
  const detail = record.step_details?.luyen_tap;
  const sectionProgress = detail?.sectionProgress || {};
  const finalExam = detail?.finalExam;
  const finalSubmitted = ['submitted', 'auto_submitted', 'expired'].includes(String(finalExam?.status || ''));
  const detectedFinalTotal = Number(finalExam?.total_count || 0);
  const finalQuizExists = weights?.finalQuizExists ?? detectedFinalTotal > 0;
  const finalQuizScore = finalQuizExists && finalSubmitted && Number.isFinite(Number(finalExam?.score))
    ? roundScore(Number(finalExam?.score))
    : undefined;
  const allSectionItems = Object.values(sectionProgress);
  const allRequiredSectionsCompleted = weights?.allRequiredSectionsCompleted
    ?? allSectionItems.every((item) => item.status === 'completed');
  const assessment = calculateFairAssessmentScore({
    finalQuizScore,
    finalQuizExists,
    finalSubmitted,
    allRequiredSectionsCompleted,
  });

  return {
    ...record,
    section_scores: {},
    learning_process_score: undefined,
    final_quiz_score: finalQuizScore,
    current_score: assessment.currentScore,
    assessment_score: assessment.finalScore,
    preparation_score: 0,
    preparation_weight: 0,
    learning_component_weight: 0,
    final_component_weight: finalQuizExists ? 100 : 0,
    score_status: assessment.scoreStatus,
    score_model_version: 4,
    scored_section_count: 0,
    scorable_section_count: 0,
    score_calculated_at: nowIso,
  };
}

export function finalizeProgressScore(
  record: LessonProgressRecord,
  nowIso = new Date().toISOString(),
  weights?: ProgressScoreV3Weights,
): LessonProgressRecord {
  return {
    ...applyProgressScoreModelV3(record, weights, nowIso),
    last_closed_at: nowIso,
    save_state: 'saving',
  };
}

/**
 * Monotonic merge for progress. Score fields of learning sections are deliberately
 * discarded in V4; only completion/time/interaction evidence is merged.
 */
export function mergeSectionProgressMonotonic(current?: Record<string, SectionLearningProgress>, incoming?: Record<string, SectionLearningProgress>) {
  const keys = new Set([...Object.keys(current || {}), ...Object.keys(incoming || {})]);
  const result: Record<string, SectionLearningProgress> = {};
  keys.forEach((key) => {
    const a = current?.[key];
    const b = incoming?.[key];
    if (!a) {
      if (b) result[key] = { ...b, section_score: undefined, score_status: 'not_applicable', score_calculated_at: undefined };
      return;
    }
    if (!b) {
      result[key] = { ...a, section_score: undefined, score_status: 'not_applicable', score_calculated_at: undefined };
      return;
    }
    const completed = a.status === 'completed' || b.status === 'completed';
    const answeredIds = Array.from(new Set([...(a.answeredQuestionIds || []), ...(b.answeredQuestionIds || [])]));
    const questionTotal = Math.max(Number(a.questionTotal || 0), Number(b.questionTotal || 0));
    result[key] = {
      ...a,
      ...b,
      opened: a.opened || b.opened,
      status: completed ? 'completed' : (b.status || a.status),
      timeSpentSeconds: Math.max(Number(a.timeSpentSeconds || 0), Number(b.timeSpentSeconds || 0)),
      requiredSeconds: Math.max(1, Number(b.requiredSeconds || a.requiredSeconds || 1)),
      interactionCount: Math.max(Number(a.interactionCount || 0), Number(b.interactionCount || 0)),
      answeredQuestionIds: answeredIds,
      correctCount: Math.max(Number(a.correctCount || 0), Number(b.correctCount || 0)),
      questionTotal,
      timePercent: Math.max(Number(a.timePercent || 0), Number(b.timePercent || 0)),
      interactionPercent: Math.max(Number(a.interactionPercent || 0), Number(b.interactionPercent || 0)),
      completionPercent: Math.max(Number(a.completionPercent || 0), Number(b.completionPercent || 0)),
      section_score: undefined,
      score_status: 'not_applicable',
      completedAt: a.completedAt || b.completedAt,
      score_calculated_at: undefined,
      lastVisitedAt: b.lastVisitedAt || a.lastVisitedAt,
    };
  });
  return result;
}
