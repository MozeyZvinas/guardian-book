CREATE TYPE "public"."assessment_status" AS ENUM('proposed', 'uncertain', 'failed');--> statement-breakpoint
CREATE TYPE "public"."attempt_kind" AS ENUM('typed', 'photo');--> statement-breakpoint
CREATE TYPE "public"."attempt_mode" AS ENUM('assisted', 'independent', 'retention');--> statement-breakpoint
CREATE TYPE "public"."calendar_confidence" AS ENUM('high', 'low');--> statement-breakpoint
CREATE TYPE "public"."calendar_scope" AS ENUM('class', 'learner');--> statement-breakpoint
CREATE TYPE "public"."calendar_status" AS ENUM('proposed', 'confirmed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."consistency_check" AS ENUM('agree', 'disagree', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."event_basis" AS ENUM('model_high', 'teacher_confirmed', 'none');--> statement-breakpoint
CREATE TYPE "public"."guideline_step_type" AS ENUM('M', 'A', 'CA');--> statement-breakpoint
CREATE TYPE "public"."help_plan_status" AS ENUM('issued', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."input_kind" AS ENUM('work', 'notice', 'question');--> statement-breakpoint
CREATE TYPE "public"."intervention_outcome" AS ENUM('improved', 'no_change', 'needs_more');--> statement-breakpoint
CREATE TYPE "public"."intervention_status" AS ENUM('open', 'checking', 'closed');--> statement-breakpoint
CREATE TYPE "public"."item_status" AS ENUM('draft', 'approved');--> statement-breakpoint
CREATE TYPE "public"."learning_event_kind" AS ENUM('attempt_submitted', 'assessed', 'retried', 'review_confirmed', 'review_released', 'fixed_independently', 'support_given', 'notice_confirmed', 'plan_issued', 'note_sent', 'profile_set', 'independent_check_completed', 'retention_check_completed', 'guideline_approved', 'feedback_teacher_added', 'intervention_assigned', 'intervention_closed');--> statement-breakpoint
CREATE TYPE "public"."model_run_purpose" AS ENUM('classify', 'profile_cards', 'assess', 'notice', 'plan', 'note');--> statement-breakpoint
CREATE TYPE "public"."model_run_status" AS ENUM('accepted', 'retried', 'exhausted', 'failed');--> statement-breakpoint
CREATE TYPE "public"."note_audience" AS ENUM('learner', 'guardian', 'teacher_only');--> statement-breakpoint
CREATE TYPE "public"."note_origin" AS ENUM('ai_suggested', 'teacher_approved', 'teacher_added', 'teacher_revised');--> statement-breakpoint
CREATE TYPE "public"."note_status" AS ENUM('draft', 'approved', 'sent');--> statement-breakpoint
CREATE TYPE "public"."provenance" AS ENUM('original_human', 'school_provided', 'teacher_verified', 'student_provided', 'model_generated', 'licensed_content', 'synthetic_self_generated');--> statement-breakpoint
CREATE TYPE "public"."review_feedback_kind" AS ENUM('agree', 'correct', 'add');--> statement-breakpoint
CREATE TYPE "public"."review_state" AS ENUM('confirmed', 'released');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('learner', 'guardian', 'teacher', 'admin');--> statement-breakpoint
CREATE TYPE "public"."school_kind" AS ENUM('fictional', 'pilot', 'live');--> statement-breakpoint
CREATE TYPE "public"."topic_state_value" AS ENUM('new', 'practising', 'secure');--> statement-breakpoint
CREATE TYPE "public"."training_permission" AS ENUM('not_permitted', 'evaluation_only', 'permitted');--> statement-breakpoint
CREATE TABLE "account" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assessments" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"status" "assessment_status" NOT NULL,
	"total" integer,
	"steps" jsonb NOT NULL,
	"ambiguity_reasons" text[] DEFAULT '{}'::text[] NOT NULL,
	"transcription_confidence" real,
	"model_id" text NOT NULL,
	"prompt_version" text NOT NULL,
	"consistency_check" "consistency_check" NOT NULL,
	"latency_ms" integer NOT NULL,
	"cost_usd" numeric(10, 6) NOT NULL,
	"request_id" text NOT NULL,
	"provenance" "provenance" NOT NULL,
	"provenance_detail" jsonb,
	"training_permission" "training_permission" DEFAULT 'not_permitted' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assessments_attempt_id_unique" UNIQUE("attempt_id")
);
--> statement-breakpoint
CREATE TABLE "attempts" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"learner_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"item_revision" integer NOT NULL,
	"kind" "attempt_kind" NOT NULL,
	"mode" "attempt_mode" DEFAULT 'assisted' NOT NULL,
	"answer_text" text,
	"image_key" text,
	"parent_attempt_id" uuid,
	"idempotency_key" text NOT NULL,
	"provenance" "provenance" NOT NULL,
	"provenance_detail" jsonb,
	"training_permission" "training_permission" DEFAULT 'not_permitted' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attempts_learner_idempotency" UNIQUE("learner_id","idempotency_key"),
	CONSTRAINT "attempts_answer_text_len" CHECK (char_length("attempts"."answer_text") <= 4000),
	CONSTRAINT "attempts_text_xor_image" CHECK (("attempts"."answer_text" is not null and "attempts"."image_key" is null) or ("attempts"."answer_text" is null and "attempts"."image_key" is not null))
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text,
	"outcome" text NOT NULL,
	"request_id" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendar_events" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"scope_type" "calendar_scope" NOT NULL,
	"scope_id" uuid NOT NULL,
	"title" text NOT NULL,
	"subject" text,
	"paper" text,
	"on_date" date NOT NULL,
	"source_input_id" uuid NOT NULL,
	"source_line" text NOT NULL,
	"confidence" "calendar_confidence" NOT NULL,
	"status" "calendar_status" DEFAULT 'proposed' NOT NULL,
	"confirmed_by" uuid,
	"provenance" "provenance" NOT NULL,
	"provenance_detail" jsonb,
	"training_permission" "training_permission" DEFAULT 'not_permitted' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_events_source_line_len" CHECK (char_length("calendar_events"."source_line") <= 300)
);
--> statement-breakpoint
CREATE TABLE "class_members" (
	"class_id" uuid NOT NULL,
	"learner_id" uuid NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "class_members_class_id_learner_id_pk" PRIMARY KEY("class_id","learner_id")
);
--> statement-breakpoint
CREATE TABLE "classes" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"name" text NOT NULL,
	"teacher_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "classes_code_hash_unique" UNIQUE("code_hash")
);
--> statement-breakpoint
CREATE TABLE "guardian_invite_codes" (
	"learner_id" uuid PRIMARY KEY NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guardian_invite_codes_code_hash_unique" UNIQUE("code_hash")
);
--> statement-breakpoint
CREATE TABLE "guardian_links" (
	"learner_id" uuid NOT NULL,
	"guardian_id" uuid NOT NULL,
	"invite_code_hash" text NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "guardian_links_learner_id_guardian_id_pk" PRIMARY KEY("learner_id","guardian_id")
);
--> statement-breakpoint
CREATE TABLE "guideline_approvals" (
	"class_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"item_revision" integer NOT NULL,
	"approved_by" uuid NOT NULL,
	"approved_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guideline_approvals_class_id_item_id_item_revision_pk" PRIMARY KEY("class_id","item_id","item_revision")
);
--> statement-breakpoint
CREATE TABLE "guideline_steps" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"item_id" uuid NOT NULL,
	"step_no" integer NOT NULL,
	"step_type" "guideline_step_type" NOT NULL,
	"criterion" text NOT NULL,
	"marks" integer NOT NULL,
	"skill_tag" text NOT NULL,
	"notes" text,
	"provenance" "provenance" NOT NULL,
	"provenance_detail" jsonb,
	"training_permission" "training_permission" DEFAULT 'not_permitted' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guideline_steps_item_step_no" UNIQUE("item_id","step_no"),
	CONSTRAINT "guideline_steps_marks_nonneg" CHECK ("guideline_steps"."marks" >= 0)
);
--> statement-breakpoint
CREATE TABLE "help_plans" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"learner_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"gap_skill_tag" text NOT NULL,
	"learner_view" jsonb NOT NULL,
	"guardian_view" jsonb NOT NULL,
	"teacher_view" jsonb NOT NULL,
	"evidence_event_ids" uuid[] NOT NULL,
	"resource_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"agent_trace" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"model_run_id" uuid,
	"status" "help_plan_status" DEFAULT 'issued' NOT NULL,
	"provenance" "provenance" NOT NULL,
	"provenance_detail" jsonb,
	"training_permission" "training_permission" DEFAULT 'not_permitted' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "help_plans_evidence_nonempty" CHECK (cardinality("help_plans"."evidence_event_ids") >= 1)
);
--> statement-breakpoint
CREATE TABLE "inputs" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"learner_id" uuid NOT NULL,
	"kind" "input_kind" NOT NULL,
	"kind_overridden" boolean DEFAULT false NOT NULL,
	"text" text,
	"object_key" text,
	"attempt_id" uuid,
	"provenance" "provenance" NOT NULL,
	"provenance_detail" jsonb,
	"training_permission" "training_permission" DEFAULT 'not_permitted' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inputs_text_len" CHECK (char_length("inputs"."text") <= 4000),
	CONSTRAINT "inputs_text_xor_object" CHECK (("inputs"."text" is not null and "inputs"."object_key" is null) or ("inputs"."text" is null and "inputs"."object_key" is not null))
);
--> statement-breakpoint
CREATE TABLE "interventions" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"learner_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"skill_tag" text NOT NULL,
	"help_plan_id" uuid,
	"owner_id" uuid NOT NULL,
	"action" text NOT NULL,
	"follow_up_on" date NOT NULL,
	"status" "intervention_status" DEFAULT 'open' NOT NULL,
	"outcome" "intervention_outcome",
	"outcome_evidence_event_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "interventions_action_len" CHECK (char_length("interventions"."action") <= 300),
	CONSTRAINT "interventions_closed_needs_outcome" CHECK ("interventions"."status" <> 'closed' or ("interventions"."outcome" is not null and cardinality("interventions"."outcome_evidence_event_ids") >= 1 and "interventions"."closed_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"slug" text NOT NULL,
	"topic" text NOT NULL,
	"skill_tags" text[] NOT NULL,
	"prompt_md" text NOT NULL,
	"diagram_key" text,
	"max_marks" integer NOT NULL,
	"status" "item_status" DEFAULT 'draft' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"author" text NOT NULL,
	"reviewer" text NOT NULL,
	"reviewed_at" timestamp with time zone,
	"source" text DEFAULT 'original' NOT NULL,
	"provenance" "provenance" NOT NULL,
	"provenance_detail" jsonb,
	"training_permission" "training_permission" DEFAULT 'not_permitted' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "items_slug_unique" UNIQUE("slug"),
	CONSTRAINT "items_source_original" CHECK ("items"."source" = 'original'),
	CONSTRAINT "items_max_marks_pos" CHECK ("items"."max_marks" > 0)
);
--> statement-breakpoint
CREATE TABLE "learning_events" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"learner_id" uuid NOT NULL,
	"kind" "learning_event_kind" NOT NULL,
	"attempt_id" uuid,
	"item_id" uuid,
	"skill_tag" text,
	"basis" "event_basis" NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_runs" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"purpose" "model_run_purpose" NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"model_id" text NOT NULL,
	"tier" text DEFAULT 'standard' NOT NULL,
	"prompt_version" text NOT NULL,
	"request_id" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(10, 6) DEFAULT '0' NOT NULL,
	"latency_ms" integer NOT NULL,
	"output" jsonb,
	"checks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"attempt_no" integer DEFAULT 1 NOT NULL,
	"status" "model_run_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "model_runs_tier_standard" CHECK ("model_runs"."tier" = 'standard'),
	CONSTRAINT "model_runs_attempt_no_range" CHECK ("model_runs"."attempt_no" between 1 and 3)
);
--> statement-breakpoint
CREATE TABLE "model_usage_daily" (
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"calls" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(10, 6) DEFAULT '0' NOT NULL,
	CONSTRAINT "model_usage_daily_user_id_day_pk" PRIMARY KEY("user_id","day")
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"teacher_id" uuid NOT NULL,
	"learner_id" uuid NOT NULL,
	"guardian_id" uuid NOT NULL,
	"draft_text" text NOT NULL,
	"final_text" text,
	"model_run_id" uuid,
	"status" "note_status" DEFAULT 'draft' NOT NULL,
	"approved_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"origin" "note_origin" NOT NULL,
	"audience" "note_audience" NOT NULL,
	"provenance" "provenance" NOT NULL,
	"provenance_detail" jsonb,
	"training_permission" "training_permission" DEFAULT 'not_permitted' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notes_draft_text_len" CHECK (char_length("notes"."draft_text") <= 600),
	CONSTRAINT "notes_sent_after_approved" CHECK ("notes"."sent_at" is null or "notes"."approved_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"role" "role" NOT NULL,
	"nickname" text NOT NULL,
	"age_attested_at" timestamp with time zone NOT NULL,
	"school_id" uuid,
	"cards" jsonb,
	"cards_source_text" text,
	"cards_model_run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_cards_source_text_len" CHECK (char_length("profiles"."cards_source_text") <= 2000),
	CONSTRAINT "profiles_nickname_len" CHECK (char_length("profiles"."nickname") between 1 and 40)
);
--> statement-breakpoint
CREATE TABLE "recommendations" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"learner_id" uuid NOT NULL,
	"from_attempt_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"basis_event_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"followed_attempt_id" uuid
);
--> statement-breakpoint
CREATE TABLE "resources" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"licence" text NOT NULL,
	"attribution" text NOT NULL,
	"free" boolean DEFAULT true NOT NULL,
	"skill_tags" text[] NOT NULL,
	"approved" boolean DEFAULT false NOT NULL,
	"provenance" "provenance" NOT NULL,
	"provenance_detail" jsonb,
	"training_permission" "training_permission" DEFAULT 'not_permitted' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_feedback" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"review_id" uuid NOT NULL,
	"kind" "review_feedback_kind" NOT NULL,
	"text" text,
	"audience" "note_audience" NOT NULL,
	"origin" "note_origin" NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_feedback_text_len" CHECK (char_length("review_feedback"."text") <= 600)
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"assessment_id" uuid NOT NULL,
	"teacher_id" uuid NOT NULL,
	"steps" jsonb NOT NULL,
	"total" integer NOT NULL,
	"comment" text,
	"state" "review_state" NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"confirmed_at" timestamp with time zone NOT NULL,
	"released_at" timestamp with time zone,
	"provenance" "provenance" NOT NULL,
	"provenance_detail" jsonb,
	"training_permission" "training_permission" DEFAULT 'not_permitted' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_assessment_id_unique" UNIQUE("assessment_id")
);
--> statement-breakpoint
CREATE TABLE "schools" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"name" text NOT NULL,
	"kind" "school_kind" DEFAULT 'fictional' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" uuid NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "skill_evidence" (
	"learner_id" uuid NOT NULL,
	"skill_tag" text NOT NULL,
	"assisted_correct" integer DEFAULT 0 NOT NULL,
	"assisted_total" integer DEFAULT 0 NOT NULL,
	"independent_correct" integer DEFAULT 0 NOT NULL,
	"independent_total" integer DEFAULT 0 NOT NULL,
	"retained_correct" integer DEFAULT 0 NOT NULL,
	"retained_total" integer DEFAULT 0 NOT NULL,
	"confidence_sure_correct" integer DEFAULT 0 NOT NULL,
	"confidence_sure_total" integer DEFAULT 0 NOT NULL,
	"evidence_count" integer DEFAULT 0 NOT NULL,
	"last_checked_at" timestamp with time zone,
	CONSTRAINT "skill_evidence_learner_id_skill_tag_pk" PRIMARY KEY("learner_id","skill_tag")
);
--> statement-breakpoint
CREATE TABLE "topic_state" (
	"learner_id" uuid NOT NULL,
	"skill_tag" text NOT NULL,
	"state" "topic_state_value" NOT NULL,
	"evidence_event_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "topic_state_learner_id_skill_tag_pk" PRIMARY KEY("learner_id","skill_tag")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_learner_id_user_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_source_input_id_inputs_id_fk" FOREIGN KEY ("source_input_id") REFERENCES "public"."inputs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_confirmed_by_user_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_members" ADD CONSTRAINT "class_members_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_members" ADD CONSTRAINT "class_members_learner_id_user_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_teacher_id_user_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardian_invite_codes" ADD CONSTRAINT "guardian_invite_codes_learner_id_user_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardian_links" ADD CONSTRAINT "guardian_links_learner_id_user_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardian_links" ADD CONSTRAINT "guardian_links_guardian_id_user_id_fk" FOREIGN KEY ("guardian_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guideline_approvals" ADD CONSTRAINT "guideline_approvals_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guideline_approvals" ADD CONSTRAINT "guideline_approvals_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guideline_approvals" ADD CONSTRAINT "guideline_approvals_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guideline_steps" ADD CONSTRAINT "guideline_steps_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "help_plans" ADD CONSTRAINT "help_plans_learner_id_user_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "help_plans" ADD CONSTRAINT "help_plans_model_run_id_model_runs_id_fk" FOREIGN KEY ("model_run_id") REFERENCES "public"."model_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inputs" ADD CONSTRAINT "inputs_learner_id_user_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inputs" ADD CONSTRAINT "inputs_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interventions" ADD CONSTRAINT "interventions_learner_id_user_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interventions" ADD CONSTRAINT "interventions_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interventions" ADD CONSTRAINT "interventions_help_plan_id_help_plans_id_fk" FOREIGN KEY ("help_plan_id") REFERENCES "public"."help_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interventions" ADD CONSTRAINT "interventions_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_events" ADD CONSTRAINT "learning_events_learner_id_user_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_events" ADD CONSTRAINT "learning_events_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_events" ADD CONSTRAINT "learning_events_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_usage_daily" ADD CONSTRAINT "model_usage_daily_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_teacher_id_user_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_learner_id_user_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_guardian_id_user_id_fk" FOREIGN KEY ("guardian_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_model_run_id_model_runs_id_fk" FOREIGN KEY ("model_run_id") REFERENCES "public"."model_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_learner_id_user_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_from_attempt_id_attempts_id_fk" FOREIGN KEY ("from_attempt_id") REFERENCES "public"."attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_followed_attempt_id_attempts_id_fk" FOREIGN KEY ("followed_attempt_id") REFERENCES "public"."attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_feedback" ADD CONSTRAINT "review_feedback_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_feedback" ADD CONSTRAINT "review_feedback_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_teacher_id_user_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_evidence" ADD CONSTRAINT "skill_evidence_learner_id_user_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_state" ADD CONSTRAINT "topic_state_learner_id_user_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "attempts_item_idx" ON "attempts" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "audit_events_actor_idx" ON "audit_events" USING btree ("actor_id","at");--> statement-breakpoint
CREATE INDEX "calendar_events_scope_idx" ON "calendar_events" USING btree ("scope_type","scope_id");--> statement-breakpoint
CREATE INDEX "class_members_learner_idx" ON "class_members" USING btree ("learner_id");--> statement-breakpoint
CREATE INDEX "classes_teacher_id_idx" ON "classes" USING btree ("teacher_id");--> statement-breakpoint
CREATE INDEX "guardian_links_guardian_idx" ON "guardian_links" USING btree ("guardian_id");--> statement-breakpoint
CREATE INDEX "help_plans_learner_week_idx" ON "help_plans" USING btree ("learner_id","week_start");--> statement-breakpoint
CREATE INDEX "interventions_class_follow_up_idx" ON "interventions" USING btree ("class_id","follow_up_on");--> statement-breakpoint
CREATE INDEX "learning_events_learner_occurred_idx" ON "learning_events" USING btree ("learner_id","occurred_at");--> statement-breakpoint
CREATE INDEX "model_runs_subject_idx" ON "model_runs" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "notes_guardian_idx" ON "notes" USING btree ("guardian_id");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");