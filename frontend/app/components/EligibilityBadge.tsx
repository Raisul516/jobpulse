// "Eligible ✓ / Not eligible ✗ / Check eligibility ?" with the individual checks underneath.
// Shown separately from the match score on purpose: a high score never hides a failed requirement.
import { ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import { Eligibility } from "../types/job";

const LOOK = {
  pass: { label: "Eligible", color: "badge-green", Icon: ShieldCheck },
  fail: { label: "Not eligible", color: "badge-red", Icon: ShieldAlert },
  unknown: { label: "Check eligibility", color: "badge-amber", Icon: ShieldQuestion },
};

const ICON = { pass: "✓", fail: "✗", unknown: "?" };
const TEXT_COLOR = {
  pass: "text-emerald-600 dark:text-emerald-400",
  fail: "text-red-600 dark:text-red-400",
  unknown: "text-amber-600 dark:text-amber-400",
};

export default function EligibilityBadge({ eligibility }: { eligibility: Eligibility }) {
  if (eligibility.status === "none") return null; // the job lists no requirements we could read

  const { label, color, Icon } = LOOK[eligibility.status];
  return (
    <details className="text-sm">
      <summary className={`badge ${color} cursor-pointer list-none`}>
        <Icon size={12} aria-hidden />
        {label}
      </summary>
      <ul className="mt-2 space-y-1 rounded-xl bg-surface-2 p-3">
        {eligibility.checks.map((c) => (
          <li key={c.requirement} className={TEXT_COLOR[c.status]}>
            {ICON[c.status]} {c.requirement} — {c.reason}
          </li>
        ))}
        <li className="hint">Read automatically from the job text — always confirm in the original post.</li>
      </ul>
    </details>
  );
}
