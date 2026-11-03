-- Append-only tables (spec 03 §2, §8.1; CLAUDE.md rule 1): the database refuses UPDATE and
-- DELETE on learning_events, assessments and model_runs. Reviews are separate records; the
-- model's proposal is stored once and never overwritten.
CREATE OR REPLACE FUNCTION reject_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % rejected', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'raise_exception', HINT = 'Write a new row instead (a review, a new run, a new event).';
END
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER learning_events_append_only
  BEFORE UPDATE OR DELETE ON learning_events
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();
--> statement-breakpoint
CREATE TRIGGER assessments_append_only
  BEFORE UPDATE OR DELETE ON assessments
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();
--> statement-breakpoint
CREATE TRIGGER model_runs_append_only
  BEFORE UPDATE OR DELETE ON model_runs
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();
