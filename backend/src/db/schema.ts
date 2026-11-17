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

// How JobPulse reads a source. "manual" = links the user pastes; the others are
// recruitment platforms with a public job API that companies use for their career pages.
export const sourceAdapterEnum = pgEnum("source_adapter", ["manual", "smartrecruiters", "greenhouse", "lever"]);

// A website or platform that jobs come from.
export const jobSources = pgTable(
  "job_sources",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull().unique(),
    kind: sourceKindEnum("kind").notNull(),
    adapter: sourceAdapterEnum("adapter").notNull().default("manual"),
    // The company's ID on that platform, e.g. "NiftyCodersPvtLtd" on SmartRecruiters
    externalKey: text("external_key"),
    baseUrl: text("base_url"),
    // Category for jobs from this source (a bank's career page -> "Bank")
    defaultCategory: jobCategoryEnum("default_category"),
    enabled: boolean("enabled").notNull().default(true),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    lastRunOk: boolean("last_run_ok"),
    lastRunMessage: text("last_run_message"),
    lastFoundCount: integer("last_found_count"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("job_sources_adapter_key_uniq").on(t.adapter, t.externalKey)]
);

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
    // For collected listings: the platform's own ID, when we last saw it, and when it disappeared
    externalId: text("external_id"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    removedAt: timestamp("removed_at", { withTimezone: true }),
    // Why a collected listing needs the user's review instead of being added automatically
    reviewReason: text("review_reason"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("source_records_source_url_uniq").on(t.sourceId, t.normalizedUrl),
    index("source_records_job_idx").on(t.jobId),
  ]
);

// ---------- What the user is looking for ----------

// One row per user. Empty lists mean "any".
export const userPreferences = pgTable("user_preferences", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  // Words that make a job interesting: skills or titles ("react", "software engineer", "trainee")
  keywords: text("keywords").array().notNull().default(sql`'{}'::text[]`),
  // Words that rule a job out when they're in the title ("senior", "sales")
  excludeKeywords: text("exclude_keywords").array().notNull().default(sql`'{}'::text[]`),
  categories: jobCategoryEnum("categories").array().notNull().default(sql`'{}'::job_category[]`),
  jobTypes: jobTypeEnum("job_types").array().notNull().default(sql`'{}'::job_type[]`),
  locations: text("locations").array().notNull().default(sql`'{}'::text[]`),
  minSalary: integer("min_salary"), // BDT/month; jobs that don't state a salary are NOT excluded
  matchThreshold: integer("match_threshold").notNull().default(70), // % needed to count as a match / notify
  notifyEnabled: boolean("notify_enabled").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

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
    appliedAt: timestamp("applied_at", { withTimezone: true }), // set the first time status becomes "applied"
    savedAt: timestamp("saved_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.jobId] })]
);
