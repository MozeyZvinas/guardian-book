ALTER TABLE "attempts" ADD COLUMN "assessing_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "inputs" ADD COLUMN "idempotency_key" text NOT NULL;--> statement-breakpoint
CREATE INDEX "inputs_learner_created_idx" ON "inputs" USING btree ("learner_id","created_at");--> statement-breakpoint
ALTER TABLE "inputs" ADD CONSTRAINT "inputs_learner_idempotency" UNIQUE("learner_id","idempotency_key");