CREATE TABLE "cv_uploads" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"file_name" text NOT NULL,
	"text" text NOT NULL,
	"extracted" jsonb NOT NULL,
	"warnings" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"full_name" text,
	"date_of_birth" date,
	"skills" text[] DEFAULT '{}'::text[] NOT NULL,
	"education" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"experience_years" real,
	"summary" text,
	"embedding" vector(384),
	"cv_upload_id" integer,
	"confirmed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "embedding" vector(384);--> statement-breakpoint
ALTER TABLE "cv_uploads" ADD CONSTRAINT "cv_uploads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "jobs_embedding_idx" ON "jobs" USING hnsw ("embedding" vector_cosine_ops);