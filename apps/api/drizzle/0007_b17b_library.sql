CREATE TYPE "public"."practice_kind" AS ENUM('paper', 'topic');--> statement-breakpoint
CREATE TABLE "class_practice" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"class_id" uuid NOT NULL,
	"kind" "practice_kind" NOT NULL,
	"title" text NOT NULL,
	"skill_tag" text,
	"paper_ref" jsonb,
	"item_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"due_on" date NOT NULL,
	"assigned_by" uuid NOT NULL,
	"provenance" "provenance" NOT NULL,
	"provenance_detail" jsonb,
	"training_permission" "training_permission" DEFAULT 'not_permitted' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "class_practice_title_len" CHECK (char_length("class_practice"."title") between 1 and 160),
	CONSTRAINT "class_practice_kind_ref" CHECK (("class_practice"."kind" = 'paper' and "class_practice"."paper_ref" is not null) or ("class_practice"."kind" = 'topic' and "class_practice"."skill_tag" is not null))
);
--> statement-breakpoint
ALTER TABLE "items" DROP CONSTRAINT "items_source_original";--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "source_ref" jsonb;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "attribution" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "held_out" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "class_practice" ADD CONSTRAINT "class_practice_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_practice" ADD CONSTRAINT "class_practice_assigned_by_user_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "class_practice_class_due_idx" ON "class_practice" USING btree ("class_id","due_on");--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_source_known" CHECK ("items"."source" in ('original', 'dbe_nsc'));--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_dbe_nsc_ref" CHECK ("items"."source" <> 'dbe_nsc' or ("items"."source_ref" is not null and "items"."attribution" is not null));