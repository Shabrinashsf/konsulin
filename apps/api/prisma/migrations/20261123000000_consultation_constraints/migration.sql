-- approved consultations of the same lecturer must not overlap.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "consultations" ADD CONSTRAINT "consultations_no_overlap"
  EXCLUDE USING gist (
    "lecturer_id" WITH =,
    tstzrange("start_at", "end_at", '[)') WITH &&
  ) WHERE ("status" = 'approved');

ALTER TABLE "consultations" ADD CONSTRAINT "consultations_time_valid"
  CHECK ("end_at" > "start_at");

-- Effective date for calendar filters and ordering: the agreed/proposed start,
-- or the requested date (00:00 WIB) while no time has been proposed.
ALTER TABLE "consultations" ADD COLUMN "sort_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now();

CREATE FUNCTION "consultations_sort_at"() RETURNS trigger AS $$
BEGIN
  NEW."sort_at" := COALESCE(
    NEW."start_at",
    NEW."requested_date"::timestamp AT TIME ZONE 'Asia/Jakarta'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "consultations_sort_at"
BEFORE INSERT OR UPDATE OF "start_at", "requested_date" ON "consultations"
FOR EACH ROW EXECUTE FUNCTION "consultations_sort_at"();

UPDATE "consultations"
SET "sort_at" = COALESCE("start_at", "requested_date"::timestamp AT TIME ZONE 'Asia/Jakarta');

CREATE INDEX "consultations_lecturer_sort" ON "consultations"("lecturer_id", "sort_at");
CREATE INDEX "consultations_project_sort" ON "consultations"("project_id", "sort_at");
