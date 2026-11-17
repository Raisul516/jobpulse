import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { ExtractedJob } from "../types/extracted";

// ---------- Enums (fixed lists of allowed values) ----------

export const jobTypeEnum = pgEnum("job_type", [
  "Full-time",
  "Part-time",
  "Internship",
  "Contract",
]);

export const jobCategoryEnum = pgEnum("job_category", [
  "Government",
  "Private",
  "Bank",
  "NGO",
  "Internship",
]);

export const jobStatusEnum = pgEnum("job_status", ["open", "expired", "closed"]);

export const sourceKindEnum = pgEnum("source_kind", [
  "manual", // a link the user pasted
  "government",
  "company",
  "portal",
]);

// A collected listing is a DRAFT until the user reviews it.
export const reviewStatusEnum = pgEnum("review_status", [
  "pending", // waiting for the user to check it
  "approved", // became (or was linked to) a job
  "rejected", // user said it's not useful
]);

export const applicationStatusEnum = pgEnum("application_status", [
  "saved",
  "applied",
  "interview",
  "offer",
  "rejected",
]);

// ---------- Users ----------

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- Jobs ----------

// One canonical vacancy. The same vacancy found on several websites
// is ONE row here, with several rows in job_source_records.
export const jobs = pgTable(
  "jobs",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    company: text("company").notNull(),
    location: text("location").notNull(),
    jobType: jobTypeEnum("job_type").notNull(),
    category: jobCategoryEnum("category").notNull(),
    salaryMin: integer("salary_min"), // BDT per month; null = not stated
    salaryMax: integer("salary_max"),
    description: text("description"),
    applyUrl: text("apply_url"), // official application link, preferred
    deadline: date("deadline"), // last date to apply
    status: jobStatusEnum("status").notNull().default("open"),
    isDemo: boolean("is_demo").notNull().default(false), // demo data is never mixed up with real jobs
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Trigram indexes make "contains" search (ILIKE '%dev%') fast, and work for Bangla text too.
    index("jobs_title_trgm_idx").using("gin", sql`${t.title} gin_trgm_ops`),
    index("jobs_company_trgm_idx").using("gin", sql`${t.company} gin_trgm_ops`),
    index("jobs_deadline_idx").on(t.deadline),
  ]
);

// A website or platform that jobs come from.
export const jobSources = pgTable("job_sources", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  kind: sourceKindEnum("kind").notNull(),
  baseUrl: text("base_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// The original listing as found on one source. Keeps attribution
// and a raw snapshot so we can re-parse later.
export const jobSourceRecords = pgTable(
  "job_source_records",
  {
    id: serial("id").primaryKey(),
    sourceId: integer("source_id")
      .notNull()
      .references(() => jobSources.id),
    // null until the record is linked to a canonical job (or confirmed as a duplicate)
    jobId: integer("job_id").references(() => jobs.id, { onDelete: "set null" }),
    sourceUrl: text("source_url").notNull(),
    normalizedUrl: text("normalized_url").notNull(),
    rawTitle: text("raw_title"),
    rawCompany: text("raw_company"),
    rawContent: text("raw_content"), // HTML/text snapshot
    contentHash: text("content_hash"), // detect when a listing changes
    fetchError: text("fetch_error"), // why the page couldn't be read (user can still fill the form by hand)
    // What the parser guessed. Shown to the user as a draft; never trusted as-is.
    extracted: jsonb("extracted").$type<ExtractedJob>(),
    reviewStatus: reviewStatusEnum("review_status").notNull().default("pending"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("source_records_source_url_uniq").on(t.sourceId, t.normalizedUrl),
    index("source_records_job_idx").on(t.jobId),
  ]
);

// ---------- Saved jobs / application tracking ----------

export const savedJobs = pgTable(
  "saved_jobs",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    jobId: integer("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    status: applicationStatusEnum("status").notNull().default("saved"),
    notes: text("notes"),
    savedAt: timestamp("saved_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.jobId] })]
);
