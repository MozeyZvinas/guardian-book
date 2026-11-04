CREATE TYPE "public"."language_code" AS ENUM('en', 'af', 'zu', 'xh', 'tn', 'st');--> statement-breakpoint
CREATE TYPE "public"."translation_status" AS ENUM('ready', 'unavailable');--> statement-breakpoint
ALTER TYPE "public"."model_run_purpose" ADD VALUE 'translate';--> statement-breakpoint
CREATE TABLE "translations" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"source_kind" text NOT NULL,
	"source_id" uuid NOT NULL,
	"language" "language_code" NOT NULL,
	"source_hash" text NOT NULL,
	"text" text,
	"status" "translation_status" NOT NULL,
	"model_run_id" uuid,
	"provenance" "provenance" NOT NULL,
	"provenance_detail" jsonb,
	"training_permission" "training_permission" DEFAULT 'not_permitted' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "translations_source_hash_language" UNIQUE("source_hash","language"),
	CONSTRAINT "translations_text_len" CHECK (char_length("translations"."text") <= 2000),
	CONSTRAINT "translations_ready_has_text" CHECK ("translations"."status" <> 'ready' or "translations"."text" is not null),
	CONSTRAINT "translations_language_not_en" CHECK ("translations"."language" <> 'en')
);
--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "preferred_language" "language_code" DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "translations" ADD CONSTRAINT "translations_model_run_id_model_runs_id_fk" FOREIGN KEY ("model_run_id") REFERENCES "public"."model_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "translations_source_idx" ON "translations" USING btree ("source_kind","source_id");