export type OutputType     = "text" | "json" | "image" | "audio" | "slides" | "video";
export type PlaygroundMode = "story" | "code" | "art" | "quiz" | "free";
export type AgeGroup       = "5-7" | "8-10" | "11-13" | "14+";
export type CreationType   = "story" | "code" | "art" | "quiz" | "chat" | "mixed";

export type ReadingLevel         = "below_grade" | "at_grade" | "above_grade";
export type LanguagePreference   = "en" | "hi" | "en_with_hi_terms";
export type LearningStyle        = "visual" | "hands_on" | "story" | "facts_and_logic";
export type DifficultyPreference = "challenge_me" | "explain_gently" | "let_me_pick";

export interface Profile {
  id:                string;
  clerk_user_id:     string;
  display_name:      string;
  avatar_emoji:      string;
  avatar_url?:       string;
  age_group:         AgeGroup;
  interests:         string[];
  xp:                number;
  level:             number;
  active_arena:      number;
  streak_days:       number;
  last_active_date?: string;
  badges:            { id: string; earned_at: string }[];
  created_at:        string;
  updated_at:        string;

  // Phase 3 personalisation (all nullable — existing rows have NULL).
  reading_level?:         ReadingLevel | null;
  language_preference?:   LanguagePreference | null;
  learning_style?:        LearningStyle | null;
  difficulty_preference?: DifficultyPreference | null;
  current_grade?:         number | null;
  board?:                 string | null;

  // Adaptive Learner Model (lazy parsed via lib/learnerModel/types.ts)
  learner_model?: Record<string, unknown> | null;
}

export type ReflectionSurface =
  | "aida_chat"
  | "playground"
  | "validator"
  | "classroom_test"
  | "classroom_teacher"
  | "diagnostic"
  | "weekly_cron";

export interface Creation {
  id:           string;
  profile_id:   string;
  title:        string;
  type:         CreationType;
  output_type:  OutputType;
  content:      string;
  file_url?:    string;
  tags:         string[];
  is_favourite: boolean;
  is_public?:   boolean;
  share_token?: string;
  project_id?:  string;
  session_id?:  string;
  prompt_used?: string;
  created_at:   string;
  updated_at:   string;
}

export interface Session {
  id:            string;
  profile_id:    string;
  mode:          PlaygroundMode;
  title?:        string;
  message_count: number;
  started_at:    string;
  ended_at?:     string;
}

export interface Project {
  id:              string;
  profile_id:      string;
  name:            string;
  creation_count?: number;
  created_at:      string;
}

// ── Classroom ─────────────────────────────────────────────────────────────────

export interface Chapter {
  id:             string;
  subject:        string;
  chapter_number: number;
  chapter_title:  string;
  grade:          number;
  board:          string;
  created_at:     string;
}

export type MCQDifficulty = "easy" | "medium" | "hard";

export interface MCQQuestion {
  id:           string;
  difficulty:   MCQDifficulty;
  marks:        number;
  question:     string;
  options:      string[];   // 4 items, labelled "A) ..." already
  // correct_index and explanation are stripped before sending to client
  correct_index?: number;
  explanation?:   string;
}

export interface QuestionPaper {
  id:          string;
  chapter_id:  string;
  type:        "mcq" | "written";
  questions:   MCQQuestion[];
  total_marks: number;
  created_at:  string;
}

export interface MCQAttempt {
  id:                string;
  profile_id:        string;
  question_paper_id: string;
  question_ids:      string[];
  answers:           Record<string, number>;   // qId → chosen option index
  score?:            number;
  max_score?:        number;
  feedback?:         Record<string, MCQFeedbackItem>;
  time_taken_secs?:  number;
  submitted_at:      string;
}

export interface MCQFeedbackItem {
  correct:       boolean;
  correct_index: number;
  explanation:   string;
}

export type WrittenSection = "A" | "B" | "C";

export interface WrittenQuestion {
  id:              string;
  section:         WrittenSection;
  marks:           number;
  question:        string;
  expected_answer: string;   // used server-side only for GPT-4o prompt
  marking_scheme:  string;   // used server-side only
}

export interface WrittenFeedbackItem {
  score:    number;
  max:      number;
  feedback: string;
}

export interface WrittenAttempt {
  id:                string;
  profile_id:        string;
  question_paper_id: string;
  question_ids:      string[];
  image_urls:        string[];
  score?:            number;
  max_score?:        number;
  feedback?:         Record<string, WrittenFeedbackItem>;
  time_taken_secs?:  number;
  submitted_at:      string;
}

// ── Notes Correction ─────────────────────────────────────────────────────────

export type CorrectionIssueType = "wrong_formula" | "spelling" | "missing_content" | "conceptual_error";
export type CorrectionSeverity  = "high" | "medium" | "low";

export interface CorrectionIssue {
  type:             CorrectionIssueType;
  student_wrote:    string | null;   // exact text from notes; null for missing_content
  correct_version:  string;
  description:      string;
  severity:         CorrectionSeverity;
  approx_line_pct?: number;   // 0–100: vertical position of error from top of image
  approx_x_pct?:   number;   // 0–100: horizontal position of the wrong fragment from left
}

export interface CorrectionResult {
  accuracy_score:        number;        // 0–100
  teacher_summary:       string;
  issues:                CorrectionIssue[];
  positives:             string[];
  image_urls:            string[];      // original uploaded pages (for display)
  annotated_image_urls?: string[];      // teacher-annotated pages (underlines, circles, ticks)
}

// ── Teacher Dashboard ─────────────────────────────────────────────────────────

export interface TeacherProfile {
  id:            string;
  clerk_user_id: string;
  display_name:  string;
  email?:        string;
  created_at:    string;
}

export type StudentStatus = "active" | "slipping" | "inactive";

export interface StudentRosterItem {
  id:               string;
  display_name:     string;
  avatar_emoji:     string;
  avatar_url?:      string;
  level:            number;
  xp:               number;
  streak_days:      number;
  last_active_date?: string;
  total_attempts:   number;
  avg_score_pct:    number;   // 0–100
  last_attempt_at?: string;
  status:           StudentStatus;
}

export interface PaperSummary {
  id:            string;
  chapter_id:    string;
  type:          "mcq" | "written";
  total_marks:   number;
  chapter_title: string;
  subject:       string;
  grade:         number;
  board:         string;
  attempt_count: number;
}

// ── ChatRequest ───────────────────────────────────────────────────────────────

export interface ChatRequest {
  message:      string;
  sessionId:    string;
  mode:         PlaygroundMode;
  outputType?:  OutputType;
  profile:      Pick<Profile, "display_name" | "age_group" | "interests" | "active_arena">;
  history:      Array<{ role: "user" | "assistant"; content: string }>;
  attachments?: Array<{ data: string; mimeType: string; name: string }>;
}
