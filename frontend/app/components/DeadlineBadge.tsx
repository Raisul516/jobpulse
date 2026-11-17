// Shows how many days are left to apply. Red when 3 days or fewer.

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
    return <span className="text-sm text-gray-500">No deadline listed</span>;
  }

  const days = daysLeft(deadline);
  let label: string;
  if (days < 0) label = "Deadline passed";
  else if (days === 0) label = "Last day today";
  else label = `${days} day${days === 1 ? "" : "s"} left`;

  const color =
    muted || days < 0 ? "bg-gray-100 text-gray-600" : days <= 3 ? "bg-red-100 text-red-800" : "bg-gray-100 text-gray-700";

  return (
    <span className={`text-sm rounded-full px-2 py-0.5 whitespace-nowrap ${color}`}>
      {label} · {deadline}
    </span>
  );
}
