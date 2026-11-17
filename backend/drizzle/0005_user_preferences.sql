CREATE TABLE "user_preferences" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"keywords" text[] DEFAULT '{}'::text[] NOT NULL,
	"exclude_keywords" text[] DEFAULT '{}'::text[] NOT NULL,
	"categories" "job_category"[] DEFAULT '{}'::job_category[] NOT NULL,
	"job_types" "job_type"[] DEFAULT '{}'::job_type[] NOT NULL,
	"locations" text[] DEFAULT '{}'::text[] NOT NULL,
	"min_salary" integer,
	"match_threshold" integer DEFAULT 70 NOT NULL,
	"notify_enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;