// Eligibility: does the job's MANDATORY requirements fit your confirmed profile?
//
// Kept separate from the match score on purpose (handoff rule): a great score never hides
// "you're over the age limit". Every check is pass / fail / unknown — "unknown" means
// "JobPulse couldn't tell, check the circular yourself", never a silent pass.
//
// 1. extractRequirements(): finds requirements in the job text with rules (no AI)
// 2. checkEligibility():    compares them with your profile
import type { EducationEntry } from "../db/schema";

// ---------- requirements ----------

export type EducationLevel = EducationEntry["level"];

export type Requirements = {
  maxAge?: number;
  minAge?: number;
  ageReferenceDate?: string; // "age as on 01/11/2026" (YYYY-MM-DD)
  minEducation?: EducationLevel;
  subjects?: string[]; // required subjects, e.g. ["CSE", "EEE"]
  minCgpa?: number; // on a 4.00 scale
  minExperienceYears?: number;
  freshersWelcome?: boolean;
};

// Lowest to highest
const LEVEL_ORDER: EducationLevel[] = ["SSC", "HSC", "Diploma", "Bachelor", "Masters", "PhD"];

const BANGLA_DIGITS = /[০-৯]/g;
const toAsciiDigits = (s: string) => s.replace(BANGLA_DIGITS, (d) => String(d.charCodeAt(0) - 0x09e6));

// Sentences that talk about something nice-to-have, not mandatory
const PREFERRED = /\b(preferred|preferable|is a plus|will be a plus|an advantage|added advantage|desirable|nice to have|bonus)\b/i;

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?।])\s+|\n+|•|·/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// Subject names people write, mapped to one short code
// (Short codes like CS / IT / ICT only count in CAPITALS: "it" and "cs" are ordinary words.)
const SUBJECTS: [RegExp, string][] = [
  [/\b(cse|computer science(?:\s*(?:&|and)\s*engineering)?|computer engineering|software engineering)\b|\bCS\b/i, "CSE"],
  [/\b(eee|electrical(?:\s*(?:&|and)\s*electronics?)?(?:\s+engineering)?)\b/i, "EEE"],
  [/\b(ece|electronics?(?:\s*(?:&|and)\s*(?:tele)?communication)(?:\s+engineering)?|ete)\b/i, "ECE"],
  [/\bIT\b|\bICT\b|\b[Ii]nformation (?:and [Cc]ommunication )?[Tt]echnology\b/, "IT"],
  [/\b(mathematics|math|statistics)\b/i, "Math/Statistics"],
  [/\b(physics)\b/i, "Physics"],
  [/\b(bba|business administration|management|finance|accounting|marketing)\b/i, "Business"],
  [/\b(economics)\b/i, "Economics"],
  [/\b(civil engineering)\b/i, "Civil"],
  [/\b(mechanical engineering)\b/i, "Mechanical"],
];

export function subjectsIn(text: string): string[] {
  const found = new Set<string>();
  for (const [pattern, name] of SUBJECTS) if (pattern.test(text)) found.add(name);
  return [...found];
}

// (?![a-z]) after each English form, so "b.a" doesn't match "bank" and "ma" doesn't match "manager".
// "Masters" is checked before "Bachelor" and "স্নাতকোত্তর" before "স্নাতক".
const LEVEL_PATTERNS: [RegExp, EducationLevel][] = [
  [/\b(ph\.?\s?d|doctorate)(?![a-z])/i, "PhD"],
  [/\b(master'?s?|m\.?\s?sc|mba|m\.?\s?s\.?s|post[\s-]?graduat\w*)(?![a-z])|স্নাতকোত্তর/i, "Masters"],
  [/\b(bachelor'?s?|b\.?\s?sc|bba|b\.?\s?s\.?s|b\.\s?a\.?|honou?rs|(?<!post[\s-]?)graduat(?:e|es|ion)|undergraduate degree)(?![a-z])|স্নাতক(?!োত্তর)/i, "Bachelor"],
  [/\bdiploma(?![a-z])/i, "Diploma"],
  [/\b(hsc|h\.s\.c|higher secondary)(?![a-z])|উচ্চ মাধ্যমিক|এইচএসসি/i, "HSC"],
  [/\b(ssc|s\.s\.c|secondary school certificate)(?![a-z])|(?<!উচ্চ )মাধ্যমিক|এসএসসি/i, "SSC"],
];

// (Bangla words sit outside \b: JavaScript's \b only understands English letters.)
const EDUCATION_CONTEXT = /\b(degree|education|qualification|required|minimum|must|graduate|graduation)|শিক্ষাগত যোগ্যতা|ডিগ্রি/i;

function parseDayFirstDate(text: string): string | undefined {
  const m = text.match(/(?<!\d)(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?!\d)/);
  if (!m) return undefined;
  const [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCMonth() === month - 1 && d.getUTCDate() === day ? d.toISOString().slice(0, 10) : undefined;
}

export function extractRequirements(rawText: string): Requirements {
  const text = toAsciiDigits(rawText);
  const req: Requirements = {};

  for (const sentence of sentences(text)) {
    const preferred = PREFERRED.test(sentence);

    // ----- age -----
    if (/\b(age|aged|years old)\b|বয়স/i.test(sentence) && !preferred) {
      let m: RegExpMatchArray | null;
      if ((m = sentence.match(/(\d{2})\s*(?:-|–|to|থেকে)\s*(\d{2})\s*(?:years|yrs|বছর)/i))) {
        req.minAge = Number(m[1]);
        req.maxAge = Number(m[2]);
      } else if (
        (m = sentence.match(
          /(?:not\s+(?:more|older)\s+than|maximum|max\.?|below|under|up\s*to|within|limit\s*[:\-]?|সর্বোচ্চ)\s*(?:age\s*(?:of|is|:)?\s*)?(\d{2})\s*(?:years|yrs|বছর)?/i
        ))
      ) {
        req.maxAge = Number(m[1]);
      } else if ((m = sentence.match(/(\d{2})\s*(?:years|yrs|বছর)\s*(?:or\s+(?:less|below|under)|(?:at\s+)?(?:the\s+)?maximum)/i))) {
        req.maxAge = Number(m[1]);
      }
      if (/\b(as\s+(?:on|of)|on)\b|তারিখে/i.test(sentence)) {
        const date = parseDayFirstDate(sentence);
        if (date) req.ageReferenceDate = date;
      }
    }

    // ----- experience -----
    if (/\bexperience|অভিজ্ঞতা/i.test(sentence) && !preferred) {
      if (/\b(fresh(?:er|ers)?|fresh graduates?|no experience (?:is )?(?:required|needed))\b/i.test(sentence)) {
        req.freshersWelcome = true;
      }
      const m =
        sentence.match(/(?:at\s+least|minimum(?:\s+of)?|min\.?|over|more\s+than)\s*(\d{1,2})\+?\s*(?:years?|yrs?)/i) ??
        sentence.match(/(\d{1,2})\s*(?:-|–|to)\s*\d{1,2}\s*(?:years?|yrs?)/i) ??
        sentence.match(/(\d{1,2})\+?\s*(?:years?|yrs?)(?:\s+of)?(?:\s+\w+){0,3}\s+experience/i);
      if (m) {
        const years = Number(m[1]);
        if (years <= 40) req.minExperienceYears = Math.max(req.minExperienceYears ?? 0, years);
      }
    }
    if (/\bfresh(?:er|ers)?\b|fresh graduates?/i.test(sentence) && /\b(apply|welcome|encouraged|eligible)\b/i.test(sentence)) {
      req.freshersWelcome = true;
    }

    // ----- education level + subject -----
    if (EDUCATION_CONTEXT.test(sentence) && !preferred) {
      // The LOWEST level mentioned is the minimum ("Bachelor's or Master's in CSE" -> Bachelor)
      const levels = LEVEL_PATTERNS.filter(([pattern]) => pattern.test(sentence)).map(([, level]) => level);
      if (levels.length) {
        const lowest = levels.reduce((a, b) => (LEVEL_ORDER.indexOf(a) <= LEVEL_ORDER.indexOf(b) ? a : b));
        if (!req.minEducation || LEVEL_ORDER.indexOf(lowest) > LEVEL_ORDER.indexOf(req.minEducation)) {
          req.minEducation = lowest;
        }
        const subjects = subjectsIn(sentence);
        if (subjects.length && !/\bany\s+(?:discipline|subject|background)\b/i.test(sentence)) {
          req.subjects = [...new Set([...(req.subjects ?? []), ...subjects])];
        }
      }
    }

    // ----- CGPA -----
    if (/c?gpa/i.test(sentence) && !preferred) {
      const m = sentence.match(/c?gpa[^\d]{0,30}(\d\.\d{1,2})/i) ?? sentence.match(/(\d\.\d{1,2})[^\d]{0,25}c?gpa/i);
      if (m) {
        const value = Number(m[1]);
        // Only 4.00-scale university CGPAs; "GPA 5.00" is an SSC/HSC result
        if (value > 0 && value <= 4) req.minCgpa = Math.max(req.minCgpa ?? 0, value);
      }
    }
  }

  // "Fresh graduates may apply" means no experience is required, whatever else is written
  if (req.freshersWelcome) delete req.minExperienceYears;
  return req;
}

// ---------- checking against your profile ----------

export type CheckStatus = "pass" | "fail" | "unknown";
export type EligibilityCheck = { requirement: string; status: CheckStatus; reason: string };
export type Eligibility = {
  status: CheckStatus | "none"; // none = no mandatory requirements found
  checks: EligibilityCheck[];
};

export type EligibilityProfile = {
  dateOfBirth: string | null;
  education: EducationEntry[];
  experienceYears: number | null;
};

function ageOn(dateOfBirth: string, onDate: string): number {
  const [by, bm, bd] = dateOfBirth.split("-").map(Number);
  const [y, m, d] = onDate.split("-").map(Number);
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

function cgpaOf(result: string | null): number | null {
  if (!result) return null;
  const m = result.match(/(\d\.\d{1,2})\s*(?:\/|out\s+of)?\s*(\d(?:\.\d{1,2})?)?/i);
  if (!m) return null;
  const value = Number(m[1]);
  const scale = m[2] ? Number(m[2]) : value > 4 ? 5 : 4;
  return scale === 4 ? value : null; // 5-point GPAs (SSC/HSC) aren't comparable with university CGPA
}

export function checkEligibility(
  req: Requirements,
  profile: EligibilityProfile,
  options: { deadline: string | null; isGovernment: boolean; today?: string }
): Eligibility {
  const checks: EligibilityCheck[] = [];
  const today = options.today ?? new Date().toISOString().slice(0, 10);

  // ----- age -----
  if (req.maxAge !== undefined || req.minAge !== undefined) {
    const label = req.minAge !== undefined ? `Age ${req.minAge}–${req.maxAge}` : `Age up to ${req.maxAge}`;
    if (!profile.dateOfBirth) {
      checks.push({ requirement: label, status: "unknown", reason: "Add your date of birth on My profile" });
    } else {
      const refDate = req.ageReferenceDate ?? options.deadline ?? today;
      const age = ageOn(profile.dateOfBirth, refDate);
      const when = req.ageReferenceDate ? `on ${refDate}` : options.deadline ? `on the deadline` : "today";
      if (req.maxAge !== undefined && age > req.maxAge) {
        checks.push({
          requirement: label,
          status: "fail",
          reason:
            `You are ${age} ${when}` +
            (options.isGovernment ? " (some quotas allow a higher age — check the circular)" : ""),
        });
      } else if (req.minAge !== undefined && age < req.minAge) {
        checks.push({ requirement: label, status: "fail", reason: `You are ${age} ${when}` });
      } else {
        checks.push({ requirement: label, status: "pass", reason: `You are ${age} ${when}` });
      }
    }
  }

  // ----- education -----
  const finished = profile.education.filter((e) => e.year === null || e.year <= Number(today.slice(0, 4)));
  const inProgress = profile.education.filter((e) => e.year !== null && e.year > Number(today.slice(0, 4)));
  const highest = (list: EducationEntry[]) =>
    list.reduce<EducationEntry | null>(
      (best, e) => (!best || LEVEL_ORDER.indexOf(e.level) > LEVEL_ORDER.indexOf(best.level) ? e : best),
      null
    );

  if (req.minEducation) {
    const need = LEVEL_ORDER.indexOf(req.minEducation);
    const best = highest(finished);
    const label = `${req.minEducation} degree${req.subjects?.length ? ` in ${req.subjects.join(" / ")}` : ""}`;
    if (profile.education.length === 0) {
      checks.push({ requirement: label, status: "unknown", reason: "Add your education on My profile" });
    } else if (best && LEVEL_ORDER.indexOf(best.level) >= need) {
      checks.push({ requirement: label, status: "pass", reason: `You have ${best.level}` });
    } else if (inProgress.some((e) => LEVEL_ORDER.indexOf(e.level) >= need)) {
      const e = inProgress.find((x) => LEVEL_ORDER.indexOf(x.level) >= need)!;
      checks.push({ requirement: label, status: "unknown", reason: `Your ${e.level} finishes in ${e.year} — check if final-year students may apply` });
    } else {
      checks.push({ requirement: label, status: "fail", reason: `Your highest is ${best?.level ?? "unknown"}` });
    }

    if (req.subjects?.length) {
      const relevant = profile.education.filter((e) => LEVEL_ORDER.indexOf(e.level) >= need);
      const yourSubjects = relevant.flatMap((e) => subjectsIn(`${e.degree} ${e.subject ?? ""}`));
      const subjectLabel = `Subject: ${req.subjects.join(" / ")}`;
      if (relevant.length === 0 || yourSubjects.length === 0) {
        checks.push({ requirement: subjectLabel, status: "unknown", reason: "Couldn't tell your subject — check yourself" });
      } else if (yourSubjects.some((s) => req.subjects!.includes(s))) {
        checks.push({ requirement: subjectLabel, status: "pass", reason: `Your subject: ${yourSubjects.join(", ")}` });
      } else {
        checks.push({ requirement: subjectLabel, status: "fail", reason: `Your subject: ${yourSubjects.join(", ")}` });
      }
    }
  }

  // ----- CGPA -----
  if (req.minCgpa !== undefined) {
    const label = `CGPA ${req.minCgpa.toFixed(2)}+`;
    const universityCgpas = profile.education
      .filter((e) => ["Bachelor", "Masters", "PhD", "Diploma"].includes(e.level))
      .map((e) => cgpaOf(e.result))
      .filter((v): v is number => v !== null);
    if (universityCgpas.length === 0) {
      checks.push({ requirement: label, status: "unknown", reason: "Add your CGPA (out of 4.00) on My profile" });
    } else {
      const best = Math.max(...universityCgpas);
      checks.push({
        requirement: label,
        status: best >= req.minCgpa ? "pass" : "fail",
        reason: `Your CGPA: ${best.toFixed(2)}`,
      });
    }
  }

  // ----- experience -----
  if (req.minExperienceYears !== undefined && req.minExperienceYears > 0) {
    const label = `${req.minExperienceYears}+ years experience`;
    if (profile.experienceYears === null) {
      checks.push({ requirement: label, status: "unknown", reason: "Add your years of experience on My profile" });
    } else {
      checks.push({
        requirement: label,
        status: profile.experienceYears >= req.minExperienceYears ? "pass" : "fail",
        reason: `You have ${profile.experienceYears} year${profile.experienceYears === 1 ? "" : "s"}`,
      });
    }
  }

  const status: Eligibility["status"] =
    checks.length === 0
      ? "none"
      : checks.some((c) => c.status === "fail")
        ? "fail"
        : checks.some((c) => c.status === "unknown")
          ? "unknown"
          : "pass";
  return { status, checks };
}
