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

export function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
}

export function roundScore(value: number) {
  return Math.round(Math.max(0, Math.min(10, Number(value || 0))) * 10) / 10;
}

export type PreparationScoreStatus = 'not_started' | 'in_progress' | 'prepared' | 'late_completed' | 'unknown';

export function preparationScoreFromStatus(status?: PreparationScoreStatus | string, neutralUnknown = false) {
  if (status === 'prepared') return 10;
  if (status === 'unknown' && neutralUnknown) return 10;
  return 0;
}

export function calculateWeightedAssessmentScore(input: {
  learningProcessScore: number;
  finalQuizScore?: number;
  finalSubmitted?: boolean;
  learningWeight?: number;
  finalWeight?: number;
  preparationWeight?: number;
  preparationScore?: number;
}) {
  const learningProcessScore = roundScore(Number(input.learningProcessScore || 0));
  const finalQuizScore = roundScore(Number(input.finalQuizScore || 0));
  const preparationScore = roundScore(Number(input.preparationScore || 0));
  const preparationWeight = Math.max(0, Math.min(30, Number(input.preparationWeight || 0)));
  const remainingWeight = Math.max(0, 100 - preparationWeight);
  const learningWeight = Math.max(0, Number(input.learningWeight ?? 40));
  const finalWeight = Math.max(0, Number(input.finalWeight ?? 60));
  const baseWeight = Math.max(1, learningWeight + finalWeight);
  const learningComponentWeight = input.finalSubmitted
    ? (remainingWeight * learningWeight) / baseWeight
    : remainingWeight;
  const finalComponentWeight = input.finalSubmitted
    ? (remainingWeight * finalWeight) / baseWeight
    : 0;
  const score = roundScore((
    learningProcessScore * learningComponentWeight
    + finalQuizScore * finalComponentWeight
    + preparationScore * preparationWeight
  ) / 100);
  return {
    score,
    preparationWeight,
    learningComponentWeight: Math.round(learningComponentWeight * 10) / 10,
    finalComponentWeight: Math.round(finalComponentWeight * 10) / 10,
  };
}

export function calculateSectionProgress(input: SectionScoreInput): SectionLearningProgress {
  const required = Math.max(1, Number(input.requiredSeconds || 1));
  const timeSpent = Math.max(Number(input.previous?.timeSpentSeconds || 0), Number(input.timeSpentSeconds || 0));
  const total = Math.max(0, Number(input.questionTotal || 0));
  const answered = Math.max(Number(input.previous?.interactionCount || 0), Math.min(total || Number.MAX_SAFE_INTEGER, Number(input.answeredCount || 0)));
  const correct = Math.max(Number(input.previous?.correctCount || 0), Math.min(total || Number.MAX_SAFE_INTEGER, Number(input.correctCount || 0)));
  const timePercent = clampPercent((timeSpent / required) * 100);
  const interactionPercent = total > 0 ? clampPercent((answered / total) * 100) : 100;
  const completionPercent = total > 0
    ? clampPercent(timePercent * 0.4 + interactionPercent * 0.6)
    : timePercent;
  const completed = timeSpent >= required && (total === 0 || answered >= total);
  const accuracy = total > 0 ? clampPercent((correct / total) * 100) : 100;
  const score = completed ? roundScore((0.3 * 100 + 0.7 * accuracy) / 10) : undefined;
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
    section_score: score ?? input.previous?.section_score,
    score_status: completed ? 'completed' : 'pending',
    score_calculated_at: completed ? (input.previous?.score_calculated_at || now) : input.previous?.score_calculated_at,
    completedAt: completed ? (input.previous?.completedAt || now) : '',
    lastVisitedAt: input.previous?.lastVisitedAt || now,
  };
}

export function deriveSectionScores(sectionProgress?: Record<string, SectionLearningProgress>) {
  const entries = Object.entries(sectionProgress || {});
  const scores: Record<string, number> = {};
  entries.forEach(([sectionId, item]) => {
    if (item.status === 'completed' && Number.isFinite(Number(item.section_score))) {
      scores[sectionId] = roundScore(Number(item.section_score));
    }
  });
  return scores;
}

export function calculateLearningProcessScore(sectionProgress?: Record<string, SectionLearningProgress>) {
  const items = Object.values(sectionProgress || {});
  if (!items.length) return 0;
  const total = items.reduce((sum, item) => sum + (item.status === 'completed' ? Number(item.section_score || 0) : 0), 0);
  return roundScore(total / items.length);
}

export function finalizeProgressScore(
  record: LessonProgressRecord,
  nowIso = new Date().toISOString(),
  weights?: {
    learningWeight?: number;
    finalWeight?: number;
    preparationWeight?: number;
    preparationScore?: number;
    preparationStatus?: PreparationScoreStatus | string;
  },
): LessonProgressRecord {
  const detail = record.step_details?.luyen_tap;
  const sectionProgress = detail?.sectionProgress || {};
  const sectionScores = deriveSectionScores(sectionProgress);
  const learningProcessScore = calculateLearningProcessScore(sectionProgress);
  const finalExam = detail?.finalExam;
  const finalSubmitted = ['submitted', 'auto_submitted', 'expired'].includes(String(finalExam?.status || ''));
  const finalQuizScore = finalSubmitted && Number.isFinite(Number(finalExam?.score)) ? roundScore(Number(finalExam?.score)) : 0;
  const learningWeight = Math.max(0, Number(weights?.learningWeight ?? 40));
  const finalWeight = Math.max(0, Number(weights?.finalWeight ?? 60));
  const preparationWeight = Math.max(0, Math.min(30, Number(weights?.preparationWeight || 0)));
  const preparationScore = preparationWeight > 0
    ? roundScore(Number(weights?.preparationScore ?? preparationScoreFromStatus(weights?.preparationStatus)))
    : 0;
  // Điểm chuẩn bị bài là thành phần cá nhân. Phần còn lại của thang điểm giữ nguyên
  // tỷ lệ tương đối giữa quá trình học và kiểm tra cuối bài. Trước khi nộp kiểm tra,
  // current_score chỉ dùng phần quá trình + chuẩn bị để không phạt phần chưa phát sinh.
  const weighted = calculateWeightedAssessmentScore({
    learningProcessScore,
    finalQuizScore,
    finalSubmitted,
    learningWeight,
    finalWeight,
    preparationWeight,
    preparationScore,
  });
  const assessment = weighted.score;
  return {
    ...record,
    section_scores: sectionScores,
    learning_process_score: learningProcessScore,
    final_quiz_score: finalQuizScore,
    current_score: assessment,
    assessment_score: assessment,
    preparation_score: preparationScore,
    preparation_weight: weighted.preparationWeight,
    learning_component_weight: weighted.learningComponentWeight,
    final_component_weight: weighted.finalComponentWeight,
    score_status: record.status === 'completed' && finalSubmitted ? 'finalized' : 'in_progress',
    score_calculated_at: nowIso,
    last_closed_at: nowIso,
    save_state: 'saving',
  };
}

export function mergeSectionProgressMonotonic(current?: Record<string, SectionLearningProgress>, incoming?: Record<string, SectionLearningProgress>) {
  const keys = new Set([...Object.keys(current || {}), ...Object.keys(incoming || {})]);
  const result: Record<string, SectionLearningProgress> = {};
  keys.forEach((key) => {
    const a = current?.[key];
    const b = incoming?.[key];
    if (!a) { if (b) result[key] = b; return; }
    if (!b) { result[key] = a; return; }
    const completed = a.status === 'completed' || b.status === 'completed';
    const answeredIds = Array.from(new Set([...(a.answeredQuestionIds || []), ...(b.answeredQuestionIds || [])]));
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
      questionTotal: Math.max(Number(a.questionTotal || 0), Number(b.questionTotal || 0)),
      timePercent: Math.max(Number(a.timePercent || 0), Number(b.timePercent || 0)),
      interactionPercent: Math.max(Number(a.interactionPercent || 0), Number(b.interactionPercent || 0)),
      completionPercent: Math.max(Number(a.completionPercent || 0), Number(b.completionPercent || 0)),
      section_score: Math.max(Number(a.section_score || 0), Number(b.section_score || 0)) || undefined,
      score_status: completed ? 'completed' : (b.score_status || a.score_status || 'pending'),
      completedAt: a.completedAt || b.completedAt,
      score_calculated_at: a.score_calculated_at || b.score_calculated_at,
      lastVisitedAt: b.lastVisitedAt || a.lastVisitedAt,
    };
  });
  return result;
}
