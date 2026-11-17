CREATE TYPE "public"."application_status" AS ENUM('saved', 'applied', 'interview', 'offer', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."job_category" AS ENUM('Government', 'Private', 'Bank', 'NGO', 'Internship');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('open', 'expired', 'closed');--> statement-breakpoint
CREATE TYPE "public"."job_type" AS ENUM('Full-time', 'Part-time', 'Internship', 'Contract');--> statement-breakpoint
CREATE TYPE "public"."source_kind" AS ENUM('manual', 'government', 'company', 'portal');--> statement-breakpoint
CREATE TABLE "job_source_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_id" integer NOT NULL,
	"job_id" integer,
	"source_url" text NOT NULL,
	"normalized_url" text NOT NULL,
	"raw_title" text,
	"raw_company" text,
	"raw_content" text,
	"content_hash" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" "source_kind" NOT NULL,
	"base_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_sources_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"company" text NOT NULL,
	"location" text NOT NULL,
	"job_type" "job_type" NOT NULL,
	"category" "job_category" NOT NULL,
	"salary_min" integer,
	"salary_max" integer,
	"description" text,
	"apply_url" text,
	"deadline" date,
	"status" "job_status" DEFAULT 'open' NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_jobs" (
	"user_id" integer NOT NULL,
	"job_id" integer NOT NULL,
	"status" "application_status" DEFAULT 'saved' NOT NULL,
	"notes" text,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_jobs_user_id_job_id_pk" PRIMARY KEY("user_id","job_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "job_source_records" ADD CONSTRAINT "job_source_records_source_id_job_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."job_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_source_records" ADD CONSTRAINT "job_source_records_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_jobs" ADD CONSTRAINT "saved_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_jobs" ADD CONSTRAINT "saved_jobs_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "source_records_source_url_uniq" ON "job_source_records" USING btree ("source_id","normalized_url");--> statement-breakpoint
CREATE INDEX "source_records_job_idx" ON "job_source_records" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "jobs_title_trgm_idx" ON "jobs" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "jobs_company_trgm_idx" ON "jobs" USING gin ("company" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "jobs_deadline_idx" ON "jobs" USING btree ("deadline");