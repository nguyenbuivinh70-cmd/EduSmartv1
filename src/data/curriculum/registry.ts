import {
  CURRICULUM_PROGRAM,
  CURRICULUM_REFERENCE_URL,
  CURRICULUM_VERSION,
  TEXTBOOK_SERIES_KNTT,
  TEXTBOOK_REFERENCE_URL,
  INFORMATICS_REQUIREMENTS,
  KNTT_INFORMATICS_LESSONS,
  type CurriculumRequirement,
  type TextbookLessonEntry,
  normalizeVietnamese,
} from './informaticsKntt';
import { PHASE2_CATALOG_VERSION, PHASE2_LESSONS, PHASE2_REQUIREMENTS, PHASE2_SUBJECT_PROFILES, resolvePhase2Subject } from './phase2Kntt';

export type { CurriculumRequirement, TextbookLessonEntry };
export { CURRICULUM_PROGRAM, CURRICULUM_REFERENCE_URL, CURRICULUM_VERSION, TEXTBOOK_SERIES_KNTT, TEXTBOOK_REFERENCE_URL, normalizeVietnamese };

export const TEXTBOOK_CATALOG_VERSION = `KNTT-THCS-MULTI-2026.10`;

const ALL_LESSONS = [...KNTT_INFORMATICS_LESSONS, ...PHASE2_LESSONS];
const ALL_REQUIREMENTS = [...INFORMATICS_REQUIREMENTS, ...PHASE2_REQUIREMENTS];
const lessonMap = new Map(ALL_LESSONS.map((item) => [item.id, item]));
const requirementMap = new Map(ALL_REQUIREMENTS.map((item) => [item.id, item]));

export type CurriculumCatalogSubject = {
  key: string;
  label: string;
  catalogVersion: string;
  referenceUrl: string;
  assessmentGuidance: string;
};

const INFORMATICS_PROFILE: CurriculumCatalogSubject = {
  key: 'INFORMATICS',
  label: 'Tin học',
  catalogVersion: 'KNTT-TIN-THCS-2026.10',
  referenceUrl: TEXTBOOK_REFERENCE_URL,
  assessmentGuidance: 'Ưu tiên thao tác số, tạo sản phẩm, phân tích tình huống và giải quyết vấn đề; câu hỏi phải bám động từ YCCD thay vì chỉ kiểm tra ghi nhớ.',
};

export function resolveCurriculumSubject(subjectName: string): CurriculumCatalogSubject | undefined {
  const n = normalizeVietnamese(subjectName);
  if (n === 'tin hoc' || n.includes('tin hoc')) return INFORMATICS_PROFILE;
  const profile = resolvePhase2Subject(subjectName);
  return profile ? { key: profile.key, label: profile.label, catalogVersion: profile.catalogVersion, referenceUrl: profile.referenceUrl, assessmentGuidance: profile.assessmentGuidance } : undefined;
}

export function isCurriculumCatalogAvailable(subjectName: string, grade: string | number) {
  const subject = resolveCurriculumSubject(subjectName);
  const g = String(grade || '').trim();
  if (!subject || !['6','7','8','9'].includes(g)) return false;
  const prefix = subject.key === 'INFORMATICS' ? 'KNTT-TIN' : `KNTT-${subject.key}-`;
  return ALL_LESSONS.some((lesson) => lesson.grade === g && lesson.id.startsWith(prefix));
}

function subjectLessonPrefix(subjectName: string) {
  const subject = resolveCurriculumSubject(subjectName);
  if (!subject) return '';
  return subject.key === 'INFORMATICS' ? 'KNTT-TIN' : `KNTT-${subject.key}-`;
}

export function getKnttLessons(subjectName: string, grade: string | number) {
  const prefix = subjectLessonPrefix(subjectName);
  const g = String(grade || '').trim();
  return ALL_LESSONS.filter((lesson) => lesson.grade === g && lesson.id.startsWith(prefix));
}

export function getTextbookLessonById(id?: string | null) {
  return id ? lessonMap.get(String(id)) : undefined;
}

export function getCurriculumRequirementsByIds(ids?: string[] | null) {
  return Array.from(new Set(ids || [])).map((id) => requirementMap.get(id)).filter(Boolean) as CurriculumRequirement[];
}

export function getTopicOptionsForSubjectGrade(subjectName: string, grade: string | number) {
  const map = new Map<string,string>();
  for (const lesson of getKnttLessons(subjectName, grade)) if (!map.has(lesson.topicId)) map.set(lesson.topicId, lesson.topicTitle);
  return Array.from(map, ([id,title]) => ({ id, title }));
}

export function getTextbookCatalogVersion(subjectName: string) {
  return resolveCurriculumSubject(subjectName)?.catalogVersion || TEXTBOOK_CATALOG_VERSION;
}

export function getTextbookReferenceUrl(subjectName: string) {
  return resolveCurriculumSubject(subjectName)?.referenceUrl || TEXTBOOK_REFERENCE_URL;
}

export function getSubjectAssessmentGuidance(subjectName: string) {
  return resolveCurriculumSubject(subjectName)?.assessmentGuidance || '';
}

export function textbookLessonOptionLabel(lesson: TextbookLessonEntry) {
  return `Bài ${lesson.lessonNumber}: ${lesson.title}`;
}

export function buildTextbookLessonTitle(lesson: TextbookLessonEntry) {
  return `Bài ${lesson.lessonNumber}: ${lesson.title}`;
}

export const MULTI_SUBJECT_CATALOG_SUMMARY = {
  phase: '2A',
  subjects: ['Tin học', ...PHASE2_SUBJECT_PROFILES.map((p) => p.label)],
  phase2Version: PHASE2_CATALOG_VERSION,
  lessons: ALL_LESSONS.length,
  requirements: ALL_REQUIREMENTS.length,
};
