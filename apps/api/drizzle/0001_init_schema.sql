CREATE TYPE "public"."consultation_mode" AS ENUM('offline', 'online');--> statement-breakpoint
CREATE TYPE "public"."consultation_origin" AS ENUM('student_request', 'lecturer_scheduled');--> statement-breakpoint
CREATE TYPE "public"."consultation_status" AS ENUM('requested', 'approved', 'rejected', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."degree" AS ENUM('S1', 'S2', 'S3');--> statement-breakpoint
CREATE TYPE "public"."email_status" AS ENUM('pending', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."invitation_status" AS ENUM('pending', 'accepted', 'declined', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."project_type" AS ENUM('s1_thesis_proposal', 's1_thesis', 's2_thesis_proposal', 's2_thesis', 's3_dissertation_proposal', 's3_dissertation', 'research', 'publication', 'competition', 'external_project');--> statement-breakpoint
CREATE TYPE "public"."revision_status" AS ENUM('open', 'addressed', 'verified', 'reopened');--> statement-breakpoint
CREATE TYPE "public"."track_mode" AS ENUM('individual', 'shared');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('student', 'lecturer');--> statement-breakpoint
CREATE TABLE "study_programs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(20) NOT NULL,
	"name" varchar(150) NOT NULL,
	"degree" "degree" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "study_programs_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(128) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"user_agent" varchar(512),
	"ip_address" varchar(45),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refresh_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"full_name" varchar(100) NOT NULL,
	"role" "user_role" NOT NULL,
	"nrp" varchar(10),
	"nip" varchar(30),
	"study_program_id" uuid,
	"cohort_year" smallint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "users_profile_by_role" CHECK (("users"."role" = 'student' and "users"."study_program_id" is not null and "users"."cohort_year" is not null and "users"."nrp" is not null)
          or ("users"."role" = 'lecturer' and "users"."study_program_id" is null and "users"."cohort_year" is null))
);
--> statement-breakpoint
CREATE TABLE "project_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"status" "invitation_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lecturer_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"type" "project_type" NOT NULL,
	"track_mode" "track_mode" NOT NULL,
	"required_degree" "degree",
	"start_date" date,
	"end_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "projects_dates_valid" CHECK ("projects"."end_date" >= "projects"."start_date")
);
--> statement-breakpoint
CREATE TABLE "blackout_dates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lecturer_id" uuid NOT NULL,
	"date" date NOT NULL,
	"reason" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "office_hours" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lecturer_id" uuid NOT NULL,
	"day_of_week" smallint NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"slot_minutes" smallint NOT NULL,
	"default_location" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "office_hours_valid" CHECK ("office_hours"."end_time" > "office_hours"."start_time" and "office_hours"."day_of_week" between 1 and 7 and "office_hours"."slot_minutes" in (15, 30, 45, 60))
);
--> statement-breakpoint
CREATE TABLE "consultations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"lecturer_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"origin" "consultation_origin" NOT NULL,
	"status" "consultation_status" NOT NULL,
	"mode" "consultation_mode" NOT NULL,
	"topic" varchar(255) NOT NULL,
	"agenda" text,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"location" varchar(255),
	"rejection_reason" text,
	"cancellation_reason" text,
	"cancelled_by" uuid,
	"summary" text,
	"completed_at" timestamp with time zone,
	"ics_uid" varchar(255),
	"ics_sequence" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "consultations_ics_uid_unique" UNIQUE("ics_uid"),
	CONSTRAINT "consultations_time_valid" CHECK ("consultations"."end_at" > "consultations"."start_at")
);
--> statement-breakpoint
CREATE TABLE "submission_folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"student_id" uuid,
	"created_by" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"deadline_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "submission_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"folder_id" uuid NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"note" text,
	"original_name" varchar(255) NOT NULL,
	"stored_key" varchar(512) NOT NULL,
	"mime_type" varchar(127) NOT NULL,
	"size_bytes" bigint NOT NULL,
	"checksum_sha256" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "submission_versions_folder_version_uq" UNIQUE("folder_id","version_number")
);
--> statement-breakpoint
CREATE TABLE "feedbacks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"lecturer_id" uuid NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "revision_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"feedback_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"description" text NOT NULL,
	"status" "revision_status" DEFAULT 'open' NOT NULL,
	"addressed_in_version_id" uuid,
	"addressed_note" text,
	"addressed_at" timestamp with time zone,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "email_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_user_id" uuid,
	"recipient_email" varchar(255) NOT NULL,
	"template" varchar(100) NOT NULL,
	"subject" varchar(255) NOT NULL,
	"dedupe_key" varchar(255),
	"payload" jsonb,
	"status" "email_status" DEFAULT 'pending' NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"last_error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_logs_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_study_program_id_study_programs_id_fk" FOREIGN KEY ("study_program_id") REFERENCES "public"."study_programs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_invitations" ADD CONSTRAINT "project_invitations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_invitations" ADD CONSTRAINT "project_invitations_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_lecturer_id_users_id_fk" FOREIGN KEY ("lecturer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blackout_dates" ADD CONSTRAINT "blackout_dates_lecturer_id_users_id_fk" FOREIGN KEY ("lecturer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "office_hours" ADD CONSTRAINT "office_hours_lecturer_id_users_id_fk" FOREIGN KEY ("lecturer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_lecturer_id_users_id_fk" FOREIGN KEY ("lecturer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_folders" ADD CONSTRAINT "submission_folders_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_folders" ADD CONSTRAINT "submission_folders_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_folders" ADD CONSTRAINT "submission_folders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_versions" ADD CONSTRAINT "submission_versions_folder_id_submission_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."submission_folders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_versions" ADD CONSTRAINT "submission_versions_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedbacks" ADD CONSTRAINT "feedbacks_version_id_submission_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."submission_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedbacks" ADD CONSTRAINT "feedbacks_lecturer_id_users_id_fk" FOREIGN KEY ("lecturer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revision_items" ADD CONSTRAINT "revision_items_feedback_id_feedbacks_id_fk" FOREIGN KEY ("feedback_id") REFERENCES "public"."feedbacks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revision_items" ADD CONSTRAINT "revision_items_addressed_in_version_id_submission_versions_id_fk" FOREIGN KEY ("addressed_in_version_id") REFERENCES "public"."submission_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "refresh_tokens_user_idx" ON "refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree (lower("email")) WHERE "users"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "users_nrp_uq" ON "users" USING btree ("nrp") WHERE "users"."nrp" is not null and "users"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "users_nip_uq" ON "users" USING btree ("nip") WHERE "users"."nip" is not null and "users"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "project_invitations_pending_uq" ON "project_invitations" USING btree ("project_id","student_id") WHERE "project_invitations"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "project_invitations_student_idx" ON "project_invitations" USING btree ("student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_members_uq" ON "project_members" USING btree ("project_id","student_id") WHERE "project_members"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "project_members_student_idx" ON "project_members" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "projects_lecturer_idx" ON "projects" USING btree ("lecturer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "blackout_dates_uq" ON "blackout_dates" USING btree ("lecturer_id","date") WHERE "blackout_dates"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "office_hours_lecturer_idx" ON "office_hours" USING btree ("lecturer_id");--> statement-breakpoint
CREATE INDEX "consultations_lecturer_start_idx" ON "consultations" USING btree ("lecturer_id","start_at");--> statement-breakpoint
CREATE INDEX "consultations_student_start_idx" ON "consultations" USING btree ("student_id","start_at");--> statement-breakpoint
CREATE INDEX "consultations_project_idx" ON "consultations" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "submission_folders_project_idx" ON "submission_folders" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "submission_folders_student_idx" ON "submission_folders" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "feedbacks_version_idx" ON "feedbacks" USING btree ("version_id");--> statement-breakpoint
CREATE INDEX "revision_items_feedback_idx" ON "revision_items" USING btree ("feedback_id");--> statement-breakpoint
CREATE INDEX "email_logs_status_idx" ON "email_logs" USING btree ("status");