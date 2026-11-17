CREATE TYPE "public"."review_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
ALTER TABLE "job_source_records" ADD COLUMN "fetch_error" text;--> statement-breakpoint
ALTER TABLE "job_source_records" ADD COLUMN "extracted" jsonb;--> statement-breakpoint
ALTER TABLE "job_source_records" ADD COLUMN "review_status" "review_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "job_source_records" ADD COLUMN "reviewed_at" timestamp with time zone;