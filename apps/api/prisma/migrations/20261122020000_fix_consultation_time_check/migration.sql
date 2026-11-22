-- A request rejected or cancelled before any time was proposed has no time;
-- only approved and completed consultations must have one.
ALTER TABLE "consultations" DROP CONSTRAINT "consultations_approved_time";
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_approved_time"
  CHECK ("status" NOT IN ('approved', 'completed') OR "start_at" IS NOT NULL);
