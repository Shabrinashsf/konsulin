-- Custom SQL migration file, put your code below! --
ALTER TABLE consultations ADD CONSTRAINT consultations_no_overlap
    EXCLUDE USING gist (
    lecturer_id WITH =,
    tstzrange(start_at, end_at, '[)') WITH &&
    ) WHERE (status IN ('requested', 'approved') AND deleted_at IS NULL);