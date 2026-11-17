// Fills the database with DEMO data. Safe to run many times:
// it only deletes and re-creates rows marked is_demo = true.
// Run with: npm run db:seed
import { eq } from "drizzle-orm";
import { db, pool } from "./client";
import { jobs, jobSources, users } from "./schema";

type NewJob = typeof jobs.$inferInsert;

// Date N days from today, as "YYYY-MM-DD".
function daysFromToday(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// Company names are made up on purpose: these are NOT real vacancies.
const demoJobBase: NewJob[] = [
  { title: "Frontend Developer", company: "Demo Tech Ltd", location: "Dhaka", jobType: "Full-time", category: "Private", salaryMin: 40000, salaryMax: 50000, deadline: daysFromToday(12) },
  { title: "Backend Developer", company: "Sample Software BD", location: "Dhaka", jobType: "Full-time", category: "Private", salaryMin: 50000, salaryMax: 65000, deadline: daysFromToday(20) },
  { title: "Python Developer Intern", company: "Example Labs", location: "Rajshahi", jobType: "Internship", category: "Internship", salaryMin: 15000, salaryMax: 15000, deadline: daysFromToday(5) },
  { title: "Database Engineer", company: "Placeholder Data Co", location: "Chattogram", jobType: "Full-time", category: "Private", salaryMin: 60000, salaryMax: 80000, deadline: daysFromToday(30) },
  { title: "Junior React Developer", company: "Demo Tech Ltd", location: "Remote", jobType: "Part-time", category: "Private", salaryMin: 25000, salaryMax: 30000, deadline: null },
  { title: "Assistant Programmer", company: "Demo Ministry Directorate", location: "Dhaka", jobType: "Full-time", category: "Government", salaryMin: null, salaryMax: null, deadline: daysFromToday(2) },
  { title: "Senior Officer (IT)", company: "Sample Commercial Bank", location: "Dhaka", jobType: "Full-time", category: "Bank", salaryMin: 70000, salaryMax: 90000, deadline: daysFromToday(9) },
  { title: "MIS Officer", company: "Example Development Foundation", location: "Sylhet", jobType: "Contract", category: "NGO", salaryMin: 45000, salaryMax: 55000, deadline: daysFromToday(15) },
];

const demoJobs: NewJob[] = demoJobBase.map((job) => ({
  ...job,
  isDemo: true,
  description: "Demo listing for testing JobPulse. Not a real vacancy.",
}));

async function main() {
  await db.delete(jobs).where(eq(jobs.isDemo, true));
  await db.insert(jobs).values(demoJobs);

  await db
    .insert(jobSources)
    .values({ name: "Manual link", kind: "manual" })
    .onConflictDoNothing();

  // Single local user until login is built.
  await db
    .insert(users)
    .values({ email: "me@jobpulse.local", name: "Local user" })
    .onConflictDoNothing();

  console.log(`Seeded ${demoJobs.length} demo jobs.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
