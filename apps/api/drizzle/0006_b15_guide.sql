CREATE TYPE "public"."guide_status" AS ENUM('reading', 'ready', 'unsure', 'failed');--> statement-breakpoint
ALTER TYPE "public"."model_run_purpose" ADD VALUE 'guide';--> statement-breakpoint
CREATE TABLE "guides" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"learner_id" uuid NOT NULL,
	"input_id" uuid NOT NULL,
	"edited_from_id" uuid,
	"idempotency_key" text NOT NULL,
	"status" "guide_status" DEFAULT 'reading' NOT NULL,
	"question_md" text,
	"subject" text,
	"topic" text,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"final_answer" text,
	"confidence" text,
	"agreement" "consistency_check",
	"matched_item_id" uuid,
	"model_run_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"checks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reading_started_at" timestamp with time zone,
	"provenance" "provenance" NOT NULL,
	"provenance_detail" jsonb,
	"training_permission" "training_permission" DEFAULT 'not_permitted' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guides_learner_idempotency" UNIQUE("learner_id","idempotency_key"),
	CONSTRAINT "guides_confidence_level" CHECK ("guides"."confidence" is null or "guides"."confidence" in ('high', 'medium', 'low')),
	CONSTRAINT "guides_question_md_len" CHECK (char_length("guides"."question_md") <= 2000),
	CONSTRAINT "guides_ready_has_answer" CHECK ("guides"."status" <> 'ready' or ("guides"."question_md" is not null and "guides"."final_answer" is not null))
);
--> statement-breakpoint
ALTER TABLE "guides" ADD CONSTRAINT "guides_learner_id_user_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guides" ADD CONSTRAINT "guides_input_id_inputs_id_fk" FOREIGN KEY ("input_id") REFERENCES "public"."inputs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guides" ADD CONSTRAINT "guides_matched_item_id_items_id_fk" FOREIGN KEY ("matched_item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "guides_learner_created_idx" ON "guides" USING btree ("learner_id","created_at");--> statement-breakpoint
CREATE INDEX "guides_input_idx" ON "guides" USING btree ("input_id");