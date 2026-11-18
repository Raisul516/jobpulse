// All supported platforms, and "which platform is this careers link from?"
import { bdjobs } from "./bdjobs";
import { greenhouse } from "./greenhouse";
import { lever } from "./lever";
import { smartRecruiters } from "./smartrecruiters";
import { Collector } from "./types";

export const COLLECTORS = {
  smartrecruiters: smartRecruiters,
  greenhouse,
  lever,
  bdjobs,
} satisfies Record<string, Collector>;

export type CollectorName = keyof typeof COLLECTORS;

export function detectPlatform(link: string): { adapter: CollectorName; key: string } | null {
  let url: URL;
  try {
    url = new URL(link.trim());
  } catch {
    return null;
  }
  for (const [adapter, collector] of Object.entries(COLLECTORS) as [CollectorName, Collector][]) {
    const key = collector.keyFromUrl(url);
    if (key) return { adapter, key };
  }
  return null;
}
