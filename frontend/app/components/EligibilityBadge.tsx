// "Eligible ✓ / Not eligible ✗ / Check eligibility ?" with the individual checks underneath.
// Shown separately from the match score on purpose: a high score never hides a failed requirement.
import { Eligibility } from "../types/job";

const LOOK = {
  pass: { label: "Eligible ✓", color: "bg-green-100 text-green-800 border-green-300" },
  fail: { label: "Not eligible ✗", color: "bg-red-100 text-red-800 border-red-300" },
  unknown: { label: "Check eligibility ?", color: "bg-amber-100 text-amber-800 border-amber-300" },
};

const ICON = { pass: "✓", fail: "✗", unknown: "?" };
const TEXT_COLOR = { pass: "text-green-600", fail: "text-red-600", unknown: "text-amber-600" };

export default function EligibilityBadge({ eligibility }: { eligibility: Eligibility }) {
  if (eligibility.status === "none") return null; // the job lists no requirements we could read

  const look = LOOK[eligibility.status];
  return (
    <details className="text-sm">
      <summary className={`inline-block cursor-pointer rounded-full border px-2 py-0.5 ${look.color}`}>{look.label}</summary>
      <ul className="mt-1 ml-1 space-y-0.5">
        {eligibility.checks.map((c) => (
          <li key={c.requirement} className={TEXT_COLOR[c.status]}>
            {ICON[c.status]} {c.requirement} — {c.reason}
          </li>
        ))}
        <li className="text-xs text-gray-500">Read automatically from the job text — always confirm in the original post.</li>
      </ul>
    </details>
  );
}
