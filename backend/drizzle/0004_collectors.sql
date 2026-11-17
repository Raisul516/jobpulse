CREATE TYPE "public"."source_adapter" AS ENUM('manual', 'smartrecruiters', 'greenhouse', 'lever');--> statement-breakpoint
ALTER TABLE "job_source_records" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "job_source_records" ADD COLUMN "last_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "job_source_records" ADD COLUMN "removed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "job_source_records" ADD COLUMN "review_reason" text;--> statement-breakpoint
ALTER TABLE "job_sources" ADD COLUMN "adapter" "source_adapter" DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "job_sources" ADD COLUMN "external_key" text;--> statement-breakpoint
ALTER TABLE "job_sources" ADD COLUMN "default_category" "job_category";--> statement-breakpoint
ALTER TABLE "job_sources" ADD COLUMN "enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "job_sources" ADD COLUMN "last_run_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "job_sources" ADD COLUMN "last_run_ok" boolean;--> statement-breakpoint
ALTER TABLE "job_sources" ADD COLUMN "last_run_message" text;--> statement-breakpoint
ALTER TABLE "job_sources" ADD COLUMN "last_found_count" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "job_sources_adapter_key_uniq" ON "job_sources" USING btree ("adapter","external_key");