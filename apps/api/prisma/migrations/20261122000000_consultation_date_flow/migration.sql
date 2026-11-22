-- CreateEnum
CREATE TYPE "consultation_party" AS ENUM ('lecturer', 'student');

-- Consultations: date-first request, nullable time until proposed
ALTER TABLE "consultations" ADD COLUMN "note" TEXT,
ADD COLUMN "proposed_by" "consultation_party",
ADD COLUMN "requested_date" DATE,
ALTER COLUMN "start_at" DROP NOT NULL,
ALTER COLUMN "end_at" DROP NOT NULL;

-- Existing rows already have a time: derive the WIB date from it, and treat a
-- pending request's time as the student's proposal (lecturer's turn).
UPDATE "consultations"
SET "requested_date" = ("start_at" AT TIME ZONE 'Asia/Jakarta')::date,
    "proposed_by" = CASE WHEN "status" = 'requested' THEN 'student'::"consultation_party" END;
ALTER TABLE "consultations" ALTER COLUMN "requested_date" SET NOT NULL;

-- Times come in pairs; an approved (or later) consultation must have a time.
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_time_pair"
  CHECK (("start_at" IS NULL) = ("end_at" IS NULL));
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_approved_time"
  CHECK ("status" = 'requested' OR "start_at" IS NOT NULL);

CREATE INDEX "consultations_lecturer_date" ON "consultations"("lecturer_id", "requested_date");

-- Office hours: no more slots
ALTER TABLE "office_hours" DROP COLUMN "slot_minutes";

-- Default office hours Mon–Fri 07:00–18:00 for every new lecturer. A trigger
-- covers every way a lecturer is created (seeder, SQL, future admin API).
CREATE FUNCTION "default_office_hours"() RETURNS trigger AS $$
BEGIN
  IF NEW."role" = 'lecturer' THEN
    INSERT INTO "office_hours" ("lecturer_id", "day_of_week", "start_time", "end_time")
    SELECT NEW."id", d, TIME '07:00', TIME '18:00' FROM generate_series(1, 5) AS d;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "users_default_office_hours"
AFTER INSERT ON "users"
FOR EACH ROW EXECUTE FUNCTION "default_office_hours"();

-- Backfill lecturers that have no office hours yet.
INSERT INTO "office_hours" ("lecturer_id", "day_of_week", "start_time", "end_time")
SELECT u."id", d, TIME '07:00', TIME '18:00'
FROM "users" u CROSS JOIN generate_series(1, 5) AS d
WHERE u."role" = 'lecturer'
  AND NOT EXISTS (SELECT 1 FROM "office_hours" o WHERE o."lecturer_id" = u."id");
