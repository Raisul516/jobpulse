CREATE TABLE "duplicate_dismissals" (
	"job_a_id" integer NOT NULL,
	"job_b_id" integer NOT NULL,
	"dismissed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "duplicate_dismissals_job_a_id_job_b_id_pk" PRIMARY KEY("job_a_id","job_b_id")
);
--> statement-breakpoint
ALTER TABLE "duplicate_dismissals" ADD CONSTRAINT "duplicate_dismissals_job_a_id_jobs_id_fk" FOREIGN KEY ("job_a_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duplicate_dismissals" ADD CONSTRAINT "duplicate_dismissals_job_b_id_jobs_id_fk" FOREIGN KEY ("job_b_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;