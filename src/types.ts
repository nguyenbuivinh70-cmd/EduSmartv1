export type Role = 'admin' | 'teacher' | 'student';
export type ToastType = 'success' | 'error' | 'info';
export type LessonStageKey = 'khoi_dong' | 'hinh_thanh_kien_thuc' | 'luyen_tap' | 'van_dung' | 'tong_ket';
export type QuizQuestionType = 'single_choice' | 'true_false' | 'fill_in_blank' | 'short_answer';
export type FinalQuizQuestionType = 'single_choice' | 'true_false' | 'fill_in_blank';
export type ReviewPracticeType = 'chapter' | 'midterm' | 'final' | 'topic' | 'custom';
export type LessonSchemaVersion = 'lesson_v1' | 'lesson_v2' | 'lesson_v3';
export type LearningStatus = 'not_started' | 'in_progress' | 'completed';
export type StudyMode = 'single' | 'co_learning';
export type LessonAccessMode = 'teacher_controlled' | 'self_study';
export type LearningResultState = 'valid' | 'cancelled_retake' | 'invalid_cheating';
export type LearningResultActionType = 'allow_retake' | 'invalidate_cheating';

export interface User {
  user_id: string;
  ten_dang_nhap: string;
  ho_ten: string;
  vai_tro: Role;
  token: string;
  lop_id?: string;
  khoi?: string;
  khoi_phu_trach?: string[];
  tat_ca_khoi?: boolean;
  quyen_admin?: boolean | string;
  nam_hoc?: string;
  auth_provider?: 'firebase' | 'legacy';
  firebase_uid?: string;
}

export interface CatalogClass {
  lop_id: string;
  ten_lop: string;
  khoi: string;
  mo_ta?: string;
  diem_truong?: string;
  si_so?: number;
  ma_vemis?: string;
  giao_vien_chu_nhiem?: string;
  ten_dang_nhap_gvcn?: string;
  mo_hinh?: string;
  trang_thai?: string;
  created_at?: string;
  updated_at?: string;
  nam_hoc?: string;
}

export interface Subject {
  mon_id: string;
  ten_mon: string;
  khoi_ap_dung?: string;
  trang_thai?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Account {
  user_id: string;
  firebase_uid?: string;
  email?: string;
  ho_ten: string;
  ten_dang_nhap: string;
  vai_tro: Role;
  lop_id?: string;
  khoi?: string;
  khoi_phu_trach?: string[];
  tat_ca_khoi?: boolean;
  ten_lop?: string;
  ten_lop_hien_thi?: string;
  trang_thai?: string;
  created_at?: string;
  updated_at?: string;
  ghi_chu?: string;
  ma_hoc_sinh?: string;
  ngay_sinh?: string;
  gioi_tinh?: 'Nam' | 'Nữ' | string;
  tai_khoan_dinh_danh?: string;
  mat_khau_khoi_tao?: string;
  so_luot_dang_nhap?: number | string;
  lan_dang_nhap_cuoi?: string;
  so_dien_thoai?: string;
  nguon_du_lieu?: string;
  da_doi_mat_khau?: boolean | string;
  quyen_admin?: boolean | string;
  nam_hoc?: string;
  provisioning_status?: 'ready' | 'pending';
}

export type LessonSemester = 'HK1' | 'HK2';

export interface SchoolYear {
  nam_hoc_id: string;
  ten_nam_hoc: string;
  ngay_bat_dau?: string;
  ngay_ket_thuc?: string;
  trang_thai?: 'dang_hoat_dong' | 'tam_khoa' | 'luu_tru' | 'chua_mo' | string;
  la_hien_hanh?: boolean | string;
  ghi_chu?: string;
  created_at?: string;
  updated_at?: string;
}


export interface SchoolYearTransferPayload {
  source_nam_hoc: string;
  target_nam_hoc: string;
  grade_scope?: string[];
  class_ids?: string[];
  include_classes?: boolean;
  include_students?: boolean;
  graduate_final_grade?: boolean;
  set_target_current?: boolean;
  archive_source_classes?: boolean;
}

export interface SchoolYearTransferSummary {
  source_nam_hoc: string;
  target_nam_hoc: string;
  classes_created: number;
  classes_updated: number;
  students_moved: number;
  students_graduated: number;
  skipped_students: number;
  skipped_classes: number;
  logs: string[];
}

export interface MoveStudentsPayload {
  school_year?: string;
  source_lop_id: string;
  target_lop_id: string;
  user_ids?: string[];
  move_all?: boolean;
}

export interface MoveStudentsSummary {
  source_lop_id: string;
  target_lop_id: string;
  source_ten_lop?: string;
  target_ten_lop?: string;
  moved_accounts: number;
  moved_progress: number;
  moved_co_learning?: number;
  moved_user_ids?: string[];
  skipped?: string[];
}

export interface LessonRow {
  lesson_id: string;
  tieu_de: string;
  lesson_number?: number;
  lesson_name?: string;
  lesson_key?: string;
  arena_question_count?: number;
  arena_ready?: boolean;
  lop_id?: string;
  khoi: string;
  mon_id: string;
  nguoi_tao_id: string;
  pham_vi: 'private' | 'shared';
  trang_thai: string;
  source_file_id?: string;
  json_file_id?: string;
  tom_tat?: string;
  tu_khoa?: string;
  nam_hoc?: string;
  hoc_ky?: LessonSemester | string;
  thoi_gian_bat_dau?: string;
  thoi_gian_ket_thuc?: string;
  cho_phep_hoc_sau_han?: boolean | string;
  cho_phep_nop_sau_han?: boolean | string;
  is_locked?: boolean;
  access_mode?: LessonAccessMode;
  allow_retake_after_completion?: boolean;
  locked_at?: string;
  locked_by_uid?: string;
  locked_by_name?: string;
  intro_video_url?: string;
  intro_video_embed_url?: string;
  pre_lesson_enabled?: boolean;
  pre_lesson_allow_when_locked?: boolean;
  pre_lesson_required?: boolean;
  pre_lesson_completion_threshold?: number;
  pre_lesson_deadline?: string;
  pre_lesson_score_enabled?: boolean;
  pre_lesson_score_weight?: number;
  content_schema_version?: LessonSchemaVersion;
  builder_settings?: LessonBuilderSettings;
  created_at?: string;
  updated_at?: string;
}

export interface Lesson {
  id: string;
  lesson_id: string;
  tieu_de: string;
  lesson_number?: number;
  lesson_name?: string;
  lesson_key?: string;
  arena_question_count?: number;
  arena_ready?: boolean;
  mo_ta: string;
  mon_id: string;
  mon_hoc: string;
  khoi: string;
  lop_id: string;
  lop: string;
  trang_thai: string;
  nguoi_tao_id: string;
  nguoi_tao: string;
  ngay_tao: string;
  updated_at?: string;
  pham_vi: 'private' | 'shared';
  nam_hoc?: string;
  hoc_ky?: LessonSemester | string;
  thoi_gian_bat_dau?: string;
  thoi_gian_ket_thuc?: string;
  cho_phep_hoc_sau_han?: boolean | string;
  cho_phep_nop_sau_han?: boolean | string;
  is_locked?: boolean;
  access_mode?: LessonAccessMode;
  allow_retake_after_completion?: boolean;
  locked_at?: string;
  locked_by_uid?: string;
  locked_by_name?: string;
  intro_video_url?: string;
  intro_video_embed_url?: string;
  pre_lesson_enabled?: boolean;
  pre_lesson_allow_when_locked?: boolean;
  pre_lesson_required?: boolean;
  pre_lesson_completion_threshold?: number;
  pre_lesson_deadline?: string;
  pre_lesson_score_enabled?: boolean;
  pre_lesson_score_weight?: number;
  content_schema_version?: LessonSchemaVersion;
  raw?: LessonRow;
}

export type AIConfigOpenReason = 'manual' | 'quota';

export interface AIConfig {
  apiKey: string;
  model: string;
  apiKeyMasked?: string;
  hasServerKey?: boolean;
  updatedAt?: string;
  clearApiKey?: boolean;
}


export type VideoDisplayMode = 'every_visit' | 'session_once' | 'daily_once';

export interface VideoPopupConfig {
  enabled: boolean;
  youtubeUrl: string;
  embedUrl: string;
  title1: string;
  title2: string;
  title3: string;
  description: string;
  displayMode: VideoDisplayMode;
  targetRoles: Role[];
  dismissible: boolean;
  primaryButtonLabel: string;
  secondaryButtonLabel: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface ApiResponse<T = any> {
  ok: boolean;
  message: string;
  data?: T;
  error?: unknown;
}

export interface SystemDiagnosticIssue {
  severity: 'error' | 'warning';
  code: string;
  title: string;
  detail: string;
}

export interface SystemDiagnosticSection {
  key: string;
  label: string;
  issue_count: number;
  issues: SystemDiagnosticIssue[];
}

export interface SystemDiagnostics {
  generated_at: string;
  summary: {
    total_issues: number;
    error_count: number;
    warning_count: number;
    scanned_accounts: number;
    scanned_classes: number;
    scanned_subjects: number;
    scanned_lessons: number;
    scanned_progress: number;
    scanned_shares: number;
  };
  sections: SystemDiagnosticSection[];
}


export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export interface LessonContentResponse {
  lesson: LessonRow;
  content: LessonContent;
}

export interface CatalogResponse {
  user: Omit<User, 'token'>;
  classes: CatalogClass[];
  subjects: Subject[];
  allowed_models: string[];
}

export interface UploadedSourceFile {
  name: string;
  mimeType: string;
  base64: string;
  size?: number;
}


export type ExamScorePolicy = 'best' | 'last' | 'average';

export interface LessonBuilderSettings {
  content_count: number;
  interactive_questions_per_section: number;
  final_quiz_count: number;
  question_mix: 'mixed' | 'single_choice' | 'true_false' | 'fill_in_blank';
  final_quiz_question_types?: FinalQuizQuestionType[];
  difficulty: 'easy' | 'medium' | 'hard' | 'mixed';
  include_examples: boolean;
  include_summary: boolean;
  allow_retry: boolean;
  show_explanation: boolean;
  interactive_weight: number;
  final_quiz_weight: number;
  pass_score: number;
  ai_instructions?: string;
  lesson_time_minutes?: number;
  auto_finish_lesson_on_timeout?: boolean;
  final_exam_time_minutes?: number;
  shuffle_final_questions?: boolean;
  shuffle_final_options?: boolean;
  show_final_answers_after_submit?: boolean;
  allow_exam_retry?: boolean;
  max_exam_attempts?: number;
  exam_score_policy?: ExamScorePolicy;
  review_enabled?: boolean;
  review_question_count?: number;
  review_question_types?: FinalQuizQuestionType[];
  review_time_minutes?: number;
  review_shuffle_questions?: boolean;
  review_shuffle_options?: boolean;
  review_show_answers_after_submit?: boolean;
  review_allow_retry?: boolean;
}


export interface LessonBuilderDefaultsResponse {
  settings: LessonBuilderSettings | null;
  updated_at?: string;
  updated_by?: string;
  has_defaults?: boolean;
}

export interface ReviewPracticeRow {
  review_id: string;
  tieu_de: string;
  loai_on_tap: ReviewPracticeType | string;
  nam_hoc?: string;
  hoc_ky?: LessonSemester | string;
  mon_id: string;
  mon_hoc?: string;
  khoi: string;
  lop_id?: string;
  pham_vi?: 'private' | 'shared' | string;
  lesson_ids?: string;
  source_lesson_titles?: string;
  so_cau?: number | string;
  thoi_gian?: number | string;
  cau_hinh?: string;
  trang_thai?: string;
  nguoi_tao_id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ReviewPracticeConfig {
  question_types: FinalQuizQuestionType[];
  question_count: number;
  time_limit_minutes?: number;
  shuffle_questions?: boolean;
  shuffle_options?: boolean;
  show_answers_after_submit?: boolean;
  allow_retry?: boolean;
  source_mode?: 'random' | 'balanced' | 'manual';
  include_interactive?: boolean;
}

export interface ReviewPracticeContentResponse {
  review: ReviewPracticeRow;
  lessons: LessonRow[];
  questions: QuizQuestion[];
  config?: ReviewPracticeConfig;
}

export interface ReviewPracticeAttempt {
  attempt_id: string;
  review_id: string;
  user_id: string;
  lop_id?: string;
  nam_hoc?: string;
  hoc_ky?: string;
  diem?: number | string;
  so_cau_dung?: number | string;
  tong_so_cau?: number | string;
  so_lan_lam?: number | string;
  answers_json?: string;
  started_at?: string;
  submitted_at?: string;
  auto_submitted?: boolean | string;
  time_spent_seconds?: number | string;
}

export interface ReviewPracticeResultStudent {
  user_id: string;
  ho_ten: string;
  lop_id?: string;
  ten_lop?: string;
  khoi?: string;
  status: 'completed' | 'not_started' | string;
  attempt_count: number;
  best_score?: number | string;
  latest_score?: number | string;
  average_score?: number | string;
  best_correct?: number | string;
  best_total?: number | string;
  last_submitted_at?: string;
  auto_submitted_count?: number | string;
}

export interface ReviewPracticeResultSummary {
  review_id?: string;
  total_students: number;
  completed_students: number;
  not_started_students: number;
  total_attempts: number;
  average_best_score: number;
  average_latest_score: number;
  highest_score: number;
  lowest_score: number;
}

export interface ReviewPracticeResultsResponse {
  review?: ReviewPracticeRow;
  items?: ReviewPracticeAttempt[];
  attempts?: ReviewPracticeAttempt[];
  students?: ReviewPracticeResultStudent[];
  summary?: ReviewPracticeResultSummary;
  total?: number;
}

export interface LessonContentBlock {
  type?: 'paragraph' | 'key_point' | 'example' | 'note' | 'activity';
  title?: string;
  category?: string;
  theme?: string;
  text: string;
}

export interface LessonSectionV2 {
  section_id: string;
  title: string;
  content: string;
  content_blocks?: LessonContentBlock[];
  summary?: string;
  source_note?: string;
  examples?: string[];
  youtube_url?: string;
  youtube_embed_url?: string;
  interactive_questions: QuizQuestion[];
  // V6.76.0: lesson_v3 activity compatibility fields used by LessonViewer.
  pages?: LessonPresentationPage[];
  activity_type?: LessonActivityType;
  objective?: string;
  estimated_minutes?: number;
  released?: boolean;
  locked?: boolean;
}

export type LessonActivityType = 'warmup' | 'knowledge' | 'practice' | 'application' | 'discussion' | 'custom';
export type LessonPageLayout = 'title_content' | 'concept_focus' | 'example_focus' | 'two_column' | 'image_explain' | 'remember' | 'task' | 'compare_grid' | 'process_steps' | 'highlight' | 'timeline' | 'hero_concept' | 'story_visual' | 'visual_explain' | 'comparison' | 'process' | 'card_grid';
export type LessonVisualType = 'none' | 'icon_cards' | 'hub_spoke' | 'process' | 'comparison' | 'timeline' | 'device_diagram' | 'concept_map' | 'numbered_steps';

export interface LessonPageVisual {
  type: LessonVisualType;
  title?: string;
  items?: string[];
  center_label?: string;
  relationship?: string;
}

export interface LessonPresentationPage {
  page_id: string;
  title: string;
  subtitle?: string;
  layout?: LessonPageLayout;
  blocks: LessonContentBlock[];
  teacher_notes?: string;
  student_prompt?: string;
  visual_hint?: string;
  illustration_keywords?: string[];
  visual?: LessonPageVisual;
}

export interface LessonActivityV3 {
  activity_id: string;
  title: string;
  objective?: string;
  activity_type?: LessonActivityType;
  estimated_minutes?: number;
  pages: LessonPresentationPage[];
  interactions: QuizQuestion[];
  summary?: string;
  released?: boolean;
  locked?: boolean;
}

export interface TeachingSession {
  session_id: string;
  lesson_id: string;
  class_id: string;
  grade: string;
  status: 'idle' | 'live' | 'ended';
  current_activity_id?: string;
  current_page_id?: string;
  released_activity_ids: string[];
  started_at?: string;
  ended_at?: string;
  updated_at?: string;
  updated_by_uid?: string;
  updated_by_name?: string;
}

export interface PreLessonProgress {
  progress_id: string;
  lesson_id: string;
  user_id: string;
  ownerUid?: string;
  khoi: string;
  lop_id?: string;
  video_status: 'not_started' | 'in_progress' | 'completed';
  /** Số giây nội dung video đã được phủ duy nhất; xem lại cùng đoạn không cộng lại. */
  watched_seconds: number;
  /** Tổng số giây video thực tế. */
  duration_seconds: number;
  /** % độ phủ nội dung video, dùng để đánh giá chuẩn bị bài. */
  watch_percent: number;
  /** Tổng thời gian phát thực tế, kể cả xem lại; chỉ dùng phân tích, không dùng chấm hoàn thành. */
  playback_seconds?: number;
  /** Vị trí phát gần nhất để học sinh tiếp tục khi mở lại video. */
  last_position_seconds?: number;
  /** Các khoảng giây nội dung đã xem, dạng "0-12", "18-25"; dùng để chống cộng trùng khi xem lại. */
  watched_ranges?: string[];
  coverage_model?: 'legacy_elapsed' | 'unique_seconds_v1';
  preparation_status?: 'not_started' | 'in_progress' | 'prepared' | 'late_completed';
  started_at?: string;
  last_watched_at?: string;
  completed_at?: string;
  completed_before_deadline?: boolean;
  schemaVersion?: number;
}

export interface LessonAssessmentV2 {
  interactive_weight: number;
  final_quiz_weight: number;
  score_scale: number;
  pass_score: number;
}

export interface LessonMetadata {
  tieu_de: string;
  lesson_number?: number;
  lesson_name?: string;
  mon_hoc?: string;
  khoi?: string;
  chu_de?: string;
  tom_tat?: string;
  muc_tieu_bai_hoc?: string[];
  tu_khoa?: string[];
  thong_diep_chinh?: string;
  thoi_luong_goi_y?: string;
}

export interface LessonKnowledgeUnit {
  id?: string;
  tieu_muc: string;
  muc_tieu?: string;
  noi_dung_chinh: string[];
  vi_du?: string[];
  ghi_nho?: string[];
  cau_hoi_nhanh?: string[];
}

export interface QuizQuestion {
  id?: string;
  type?: QuizQuestionType;
  question: string;
  options?: string[];
  correctAnswer?: string;
  correctAnswers?: string[];
  explanation?: string;
  level?: string;
  hint?: string;
  sourceSection?: string;
  source?: 'from_lesson' | 'ai_generated' | string;
  suggestedAnswer?: string;
  rubric?: string;
  wrongAnswerExplanations?: Record<string, string>;
  sentence?: string;
  choices?: string[];
}

export interface LessonContent {
  schema_version?: LessonSchemaVersion;
  title?: string;
  intro_video_url?: string;
  intro_video_embed_url?: string;
  settings?: LessonBuilderSettings;
  sections?: LessonSectionV2[];
  activities?: LessonActivityV3[];
  final_quiz?: QuizQuestion[];
  assessment?: LessonAssessmentV2;
  metadata: LessonMetadata;
  khoi_dong: {
    muc_tieu?: string;
    tinh_huong?: string;
    yeu_cau?: string;
    cau_hoi_goi_mo: string[];
    dap_an_goi_y?: string[];
    tu_khoa_mo_dau?: string[];
  };
  hinh_thanh_kien_thuc: LessonKnowledgeUnit[];
  luyen_tap: {
    muc_tieu?: string;
    trac_nghiem: QuizQuestion[];
    tu_luan_ngan?: string[];
    bai_tap_nhanh?: string[];
  };
  van_dung: {
    muc_tieu?: string;
    nhiem_vu: string[];
    goi_y?: string[];
    san_pham_mong_doi?: string[];
  };
  tong_ket: {
    ghi_nho_trong_tam: string[];
    canh_bao_loi_sai?: string[];
    loi_khuyen_hoc?: string[];
  };
  tro_ly_ai?: {
    khoi_dong?: string[];
    hinh_thanh_kien_thuc?: string[];
    luyen_tap?: string[];
    van_dung?: string[];
  };
  raw_text_excerpt?: string;
}


export interface GoogleSlidePromptItem {
  slide_number: number;
  title: string;
  slide_type?: string;
  learning_goal?: string;
  key_content?: string[];
  lesson_content?: string;
  slide_text?: string[];
  allowed_text?: string[];
  visual_direction?: string[];
  design_requirements?: string[];
  color_text_rules?: string[];
  quality_rules?: string[];
  design_prompt: string;
  image_suggestions?: string[];
  teacher_script?: string;
  student_activity?: string;
  quick_question?: string;
  notes?: string;
}

export interface GoogleSlidesPromptResult {
  title: string;
  subject?: string;
  grade?: string;
  suggested_slide_count: number;
  suggested_style: string;
  rationale: string;
  slides: GoogleSlidePromptItem[];
  usage_guide?: string[];
  overall_prompt?: string;
  follow_up_prompt?: string;
}


export interface GoogleSlidesPromptRecord {
  prompt_id: string;
  lesson_id?: string;
  tieu_de_bai_hoc?: string;
  mon_id?: string;
  khoi?: string;
  lop_id?: string;
  nam_hoc?: string;
  hoc_ky?: string;
  so_slide_de_xuat?: number | string;
  phong_cach_de_xuat?: string;
  rationale?: string;
  prompt_json_file_id?: string;
  doc_file_id?: string;
  txt_file_id?: string;
  doc_url?: string;
  txt_url?: string;
  json_url?: string;
  nguoi_tao_id?: string;
  ho_ten_nguoi_tao?: string;
  created_at?: string;
  updated_at?: string;
  trang_thai?: string;
  ghi_chu?: string;
}

export interface GoogleSlidesPromptSaveResponse {
  prompt: GoogleSlidesPromptRecord;
  result?: GoogleSlidesPromptResult;
}

export interface GoogleSlidesPromptDetailResponse extends GoogleSlidesPromptSaveResponse {}

export interface LessonComposerValues {
  lesson_id?: string;
  tieu_de: string;
  lesson_number?: number;
  lesson_name: string;
  lesson_key?: string;
  tom_tat: string;
  mon_id: string;
  khoi: string;
  lop_id: string;
  pham_vi: 'private' | 'shared';
  share_now: boolean;
  save_mode?: 'draft' | 'publish';
  keep_editor_open?: boolean;
  tu_khoa: string;
  lesson_json: LessonContent | null;
  builder_settings?: LessonBuilderSettings;
  intro_video_url?: string;
  pre_lesson_enabled?: boolean;
  pre_lesson_allow_when_locked?: boolean;
  pre_lesson_required?: boolean;
  pre_lesson_completion_threshold?: number;
  pre_lesson_deadline?: string;
  pre_lesson_score_enabled?: boolean;
  pre_lesson_score_weight?: number;
  section_video_links?: string;
  ai_revision_request?: string;
  source_text: string;
  source_file?: UploadedSourceFile | null;
  nam_hoc?: string;
  hoc_ky?: LessonSemester | string;
  thoi_gian_bat_dau?: string;
  thoi_gian_ket_thuc?: string;
  cho_phep_hoc_sau_han?: boolean;
  cho_phep_nop_sau_han?: boolean;
  access_mode?: LessonAccessMode;
  allow_retake_after_completion?: boolean;
}

export interface LessonComment {
  comment_id: string;
  lesson_id: string;
  user_id: string;
  ho_ten?: string;
  lop_id?: string;
  parent_id?: string;
  noi_dung: string;
  loai?: 'cau_hoi' | 'binh_luan' | 'tra_loi' | string;
  trang_thai?: 'visible' | 'hidden' | 'resolved' | string;
  replied_by?: string;
  created_at?: string;
  updated_at?: string;
}

export interface PendingShareItem {
  share: {
    share_id: string;
    lesson_id: string;
    nguoi_gui_id: string;
    ngay_gui?: string;
    trang_thai_duyet: string;
    admin_duyet_id?: string;
    ngay_duyet?: string;
    ghi_chu_admin?: string;
  };
  lesson: LessonRow | null;
}


export interface LessonQuestionAnswerState {
  questionId: string;
  type?: QuizQuestionType;
  submitted: boolean;
  isCorrect: boolean;
  selectedOption?: string | null;
  fillSelections?: string[];
  textAnswer?: string;
}

export type SectionLearningStatus = 'not_started' | 'viewing' | 'need_interaction' | 'completed';

export interface SectionLearningProgress {
  sectionId: string;
  opened: boolean;
  status: SectionLearningStatus;
  timeSpentSeconds: number;
  requiredSeconds: number;
  interactionCount: number;
  answeredQuestionIds: string[];
  correctCount?: number;
  questionTotal?: number;
  timePercent?: number;
  interactionPercent?: number;
  completionPercent?: number;
  section_score?: number;
  score_status?: 'pending' | 'scored' | 'not_applicable' | 'completed';
  score_calculated_at?: string;
  completedAt?: string;
  lastVisitedAt?: string;
}

export interface LessonCloseSnapshot {
  answered: number;
  correct: number;
  total: number;
  answers: Record<string, LessonQuestionAnswerState>;
  sectionProgress: Record<string, SectionLearningProgress>;
  finalExam?: FinalExamProgressDetail;
}

export interface FinalExamSecurityEvents {
  copy_attempts: number;
  right_click_attempts: number;
  tab_leave_count: number;
  select_attempts: number;
  reload_attempts: number;
}

export interface FinalExamProgressDetail {
  started_at?: string;
  submitted_at?: string;
  time_limit_minutes?: number;
  time_spent_seconds?: number;
  status?: 'not_started' | 'in_progress' | 'submitted' | 'auto_submitted' | 'expired';
  score?: number;
  total_score?: number;
  learning_process_score?: number;
  correct_count?: number;
  total_count?: number;
  unanswered_count?: number;
  attempt_number?: number;
  security_events?: FinalExamSecurityEvents;
}

export interface LearningStepProgress {
  opened: boolean;
  viewedComplete: boolean;
  completed: boolean;
  quizAnswered?: number;
  quizCorrect?: number;
  quizTotal?: number;
  quizAnswers?: Record<string, LessonQuestionAnswerState>;
  sectionProgress?: Record<string, SectionLearningProgress>;
  finalExam?: FinalExamProgressDetail;
  percent?: number;
  lastVisitedAt?: string;
}

export interface LessonProgressRecord {
  progress_id: string;
  user_id: string;
  lesson_id: string;
  lesson_title: string;
  mon_hoc: string;
  khoi: string;
  lop_id?: string;
  status: LearningStatus;
  completion_percent: number;
  completed_steps: number;
  total_steps: number;
  last_stage?: LessonStageKey;
  updated_at: string;
  updated_at_display?: string;
  updated_at_ts?: number;
  step_details: Record<LessonStageKey, LearningStepProgress>;
  quiz_total?: number;
  quiz_answered?: number;
  quiz_correct?: number;
  quiz_percent?: number;
  assessment_score?: number;
  section_scores?: Record<string, number>;
  learning_process_score?: number;
  final_quiz_score?: number;
  current_score?: number;
  score_status?: 'in_progress' | 'finalized' | 'not_applicable';
  score_calculated_at?: string;
  last_closed_at?: string;
  save_state?: 'saving' | 'saved' | 'save_failed';
  result_state?: LearningResultState;
  result_group_id?: string;
  result_version?: number;
  retake_allowed?: boolean;
  /** V6.84.0: quyền học lại chính thức do giáo viên cấp; 1 quyền = 1 lần nộp mới. */
  official_retake_remaining?: number;
  official_retake_grant_id?: string;
  official_retake_granted_at?: string;
  official_retake_granted_by_uid?: string;
  official_retake_granted_by_name?: string;
  official_retake_last_consumed_at?: string;
  official_retake_count?: number;
  previous_official_score?: number;
  score_reason?: 'submitted' | 'deadline_missed' | 'official_retake' | string;
  deadline_status?: 'not_due' | 'on_time' | 'missed' | 'overridden' | string;
  deadline_finalized_at?: string;
  invalidated_reason?: string;
  invalidated_at?: string;
  invalidated_by_uid?: string;
  invalidated_by_name?: string;
  last_result_action_id?: string;
  study_mode?: StudyMode;
  co_learning_session_id?: string;
  co_learner_ids?: string;
  co_learner_user_ids?: string[];
  co_learner_names?: string[];
  nam_hoc?: string;
  pre_lesson_status?: 'not_started' | 'in_progress' | 'completed';
  pre_lesson_watch_percent?: number;
  pre_lesson_watched_seconds?: number;
  pre_lesson_completed_at?: string;
  pre_lesson_completed_before_deadline?: boolean;
  pre_lesson_preparation_status?: 'not_started' | 'in_progress' | 'prepared' | 'late_completed';
  preparation_score?: number;
  preparation_weight?: number;
  learning_component_weight?: number;
  final_component_weight?: number;
  /** V6.81.0: 4 = chỉ kiểm tra cuối bài tạo điểm; mục học tập/video chỉ ghi nhận tiến độ. */
  score_model_version?: number;
  scored_section_count?: number;
  scorable_section_count?: number;
}


export interface LessonRetakeAttempt {
  attempt_id: string;
  attempt_number: number;
  lesson_id: string;
  user_id: string;
  ownerUid?: string;
  status: 'in_progress' | 'completed';
  is_official: boolean;
  retake_mode?: 'reference' | 'official_update';
  official_retake_grant_id?: string;
  reference_score?: number;
  official_score_snapshot?: number;
  learning_process_score?: number;
  final_quiz_score?: number;
  completion_percent: number;
  score_status?: 'in_progress' | 'finalized' | 'not_applicable';
  score_model_version?: number;
  progress: LessonProgressRecord;
  started_at: string;
  updated_at: string;
  completed_at?: string;
  schoolId?: string;
  schemaVersion?: number;
}

export interface CoLearningSession {
  co_learning_session_id: string;
  session_id?: string;
  lesson_id: string;
  lesson_title?: string;
  host_user_id: string;
  host_uid?: string;
  partner_user_id?: string;
  partner_uid?: string;
  partner_name?: string;
  participant_user_ids?: string[];
  participant_uids?: string[];
  participant_names?: string[];
  participant_keys?: string[];
  participant_preparation_statuses?: Array<'not_started' | 'in_progress' | 'prepared' | 'late_completed' | 'unknown'>;
  participant_preparation_scores?: number[];
  participant_preparation_watch_percents?: number[];
  participant_assessment_scores?: number[];
  preparation_snapshot_at?: string;
  schemaVersion?: number;
  group_size?: number;
  study_mode: 'co_learning';
  status?: 'active' | 'completed' | 'cancelled_retake' | 'invalid_cheating' | string;
  started_at?: string;
  last_active_at?: string;
  verified_at?: string;
  supersedes_session_id?: string;
  superseded_by_session_id?: string;
  membership_version?: number;
  membership_updated_at?: string;
  membership_updated_by_uid?: string;
}

export interface CoLearningPartnerCredential {
  user_id: string;
  identifier: string;
  password: string;
}



export type AssessmentMilestoneKey = 'midterm1' | 'finalterm1' | 'midterm2' | 'finalterm2' | 'annual';

export interface ScoreTrackingConfig {
  config_id: string;
  academic_year: string;
  subject_id: string;
  grade: string;
  class_id?: string;
  midterm1_lesson_ids: string[];
  finalterm1_lesson_ids: string[];
  midterm2_lesson_ids: string[];
  finalterm2_lesson_ids: string[];
  annual_mode: 'auto' | 'manual';
  annual_lesson_ids: string[];
  schemaVersion: number;
  schoolId?: string;
  updatedByUid?: string;
  updatedByName?: string;
  updated_at?: string;
  /** Chỉ dùng phía client để báo cấu hình lớp đang kế thừa cấu hình chung khối/môn. */
  inherited_from_grade?: boolean;
  /** V6.84.0: governance cho mốc điểm. */
  milestone_status?: Partial<Record<AssessmentMilestoneKey, 'draft' | 'locked'>>;
  milestone_locked_at?: Partial<Record<AssessmentMilestoneKey, string>>;
  milestone_locked_by_name?: Partial<Record<AssessmentMilestoneKey, string>>;
}

export interface StudentLearningAnalyticsRow {
  user_id: string;
  ho_ten: string;
  vai_tro: Role;
  khoi?: string;
  lop_id?: string;
  lesson_id: string;
  lesson_title: string;
  mon_hoc: string;
  status: LearningStatus;
  completion_percent: number;
  completed_steps: number;
  total_steps: number;
  quiz_percent?: number;
  quiz_correct?: number;
  quiz_total?: number;
  assessment_score?: number;
  result_state?: LearningResultState;
  result_group_id?: string;
  retake_allowed?: boolean;
  official_retake_remaining?: number;
  official_retake_grant_id?: string;
  official_retake_count?: number;
  previous_official_score?: number;
  score_reason?: string;
  deadline_status?: string;
  deadline_finalized_at?: string;
  study_mode?: StudyMode;
  co_learning_session_id?: string;
  co_learner_ids?: string;
  co_learner_user_ids?: string[];
  co_learner_names?: string[];
  invalidated_reason?: string;
  invalidated_at?: string;
  invalidated_by_name?: string;
  last_stage?: LessonStageKey;
  updated_at: string;
  updated_at_display?: string;
  updated_at_ts?: number;
  nam_hoc?: string;
  pre_lesson_status?: 'not_started' | 'in_progress' | 'completed';
  pre_lesson_watch_percent?: number;
  pre_lesson_watched_seconds?: number;
  pre_lesson_completed_at?: string;
  pre_lesson_completed_before_deadline?: boolean;
  pre_lesson_preparation_status?: 'not_started' | 'in_progress' | 'prepared' | 'late_completed';
  preparation_score?: number;
  preparation_weight?: number;
  learning_process_score?: number;
  final_quiz_score?: number;
  current_score?: number;
  score_status?: 'in_progress' | 'finalized' | 'not_applicable';
  score_model_version?: number;
  scored_section_count?: number;
  scorable_section_count?: number;
}

export interface LearningResultModerationPayload {
  progress_id: string;
  action: LearningResultActionType;
  reason?: string;
}

export interface LearningResultModerationSummary {
  action_id: string;
  action: LearningResultActionType;
  affected_user_ids: string[];
  affected_count: number;
  result_group_id?: string;
}
