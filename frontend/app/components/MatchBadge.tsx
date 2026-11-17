// "Match 85%" badge with a small expandable list of reasons.
import { MatchResult } from "../types/job";

export default function MatchBadge({ match }: { match: MatchResult }) {
  const label = match.isMatch
    ? `Match ${match.score}%`
    : match.passesFilters
      ? `${match.score}% — below your threshold`
      : "Doesn't fit your filters";
  const color = match.isMatch
    ? "bg-green-100 text-green-800 border-green-300"
    : match.passesFilters
      ? "bg-gray-100 text-gray-700 border-gray-300"
      : "bg-orange-100 text-orange-800 border-orange-300";

  return (
    // <details> opens and closes on click without any JavaScript
    <details className="text-sm">
      <summary className={`inline-block cursor-pointer rounded-full border px-2 py-0.5 ${color}`}>{label}</summary>
      <ul className="mt-1 ml-1 space-y-0.5">
        {match.reasons.map((r) => (
          <li key={r.text} className={r.good ? "text-green-600" : "text-orange-600"}>
            {r.good ? "✓" : "✗"} {r.text}
          </li>
        ))}
      </ul>
    </details>
  );
}
