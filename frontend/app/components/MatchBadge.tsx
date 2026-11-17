// "Match 85%" badge with a small expandable list of reasons.
import { Sparkles } from "lucide-react";
import { MatchResult } from "../types/job";

export default function MatchBadge({ match }: { match: MatchResult }) {
  const ineligible = match.eligibility?.status === "fail";
  const label = match.isMatch
    ? `Match ${match.score}%`
    : !match.passesFilters
      ? "Doesn't fit your filters"
      : ineligible
        ? `${match.score}% — but not eligible`
        : `${match.score}% — below your threshold`;
  const color = match.isMatch ? "badge-green" : match.passesFilters && !ineligible ? "badge-gray" : "badge-orange";

  return (
    // <details> opens and closes on click without any JavaScript
    <details className="group text-sm">
      <summary className={`badge ${color} cursor-pointer list-none`}>
        <Sparkles size={12} aria-hidden />
        {label}
      </summary>
      <ul className="mt-2 space-y-1 rounded-xl bg-surface-2 p-3">
        {match.reasons.map((r) => (
          <li key={r.text} className={r.good ? "text-emerald-600 dark:text-emerald-400" : "text-orange-600 dark:text-orange-400"}>
            {r.good ? "✓" : "✗"} {r.text}
          </li>
        ))}
      </ul>
    </details>
  );
}
