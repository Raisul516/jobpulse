// Shows how many days are left to apply. Red when 3 days or fewer.
import { CalendarClock } from "lucide-react";

// Whole days from today until the deadline (0 = today, negative = passed).
export function daysLeft(deadline: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(`${deadline}T00:00:00`);
  return Math.round((end.getTime() - today.getTime()) / 86_400_000);
}

type Props = {
  deadline: string | null;
  // Once you've applied, the deadline doesn't matter much any more: show it grey, never red.
  muted?: boolean;
};

export default function DeadlineBadge({ deadline, muted = false }: Props) {
  if (!deadline) {
    return <span className="badge badge-gray">No deadline listed</span>;
  }

  const days = daysLeft(deadline);
  let label: string;
  if (days < 0) label = "Deadline passed";
  else if (days === 0) label = "Last day today";
  else label = `${days} day${days === 1 ? "" : "s"} left`;

  const color = muted || days < 0 ? "badge-gray" : days <= 3 ? "badge-red" : "badge-blue";

  return (
    <span className={`badge ${color}`} title={`Apply by ${deadline}`}>
      <CalendarClock size={12} aria-hidden />
      {label} · {deadline}
    </span>
  );
}
