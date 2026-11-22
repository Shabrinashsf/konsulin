-- the consultation time is always negotiated, so only blackout dates limit a lecturer's schedule.
DROP TRIGGER IF EXISTS "users_default_office_hours" ON "users";
DROP FUNCTION IF EXISTS "default_office_hours"();
DROP TABLE "office_hours";
