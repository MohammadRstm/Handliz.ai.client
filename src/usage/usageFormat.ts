import type { UsageResponse } from "../api/usageTypes";

/** Same thresholds the ring and every progress bar use, so "which one turns red" has one definition. */
export function usageColor(fraction: number): string {
  if (fraction >= 0.9) return "var(--color-danger)";
  if (fraction >= 0.7) return "var(--color-warning-text)";
  return "var(--color-accent)";
}

/** Compact trigger label, e.g. "46 left" (trial) or "62 left today" / "210 left this week" (paid, whichever window is tightest). */
export function usageRingLabel(usage: UsageResponse): string {
  if (usage.isTrial) {
    return usage.trial ? `${usage.trial.remaining} left` : "";
  }
  if (usage.worstWindow === "daily" && usage.daily) {
    return `${usage.daily.remaining} left today`;
  }
  if (usage.weekly) {
    return `${usage.weekly.remaining} left this week`;
  }
  return "";
}

/** "Resets in 6h" / "Resets in 2d" / "Resets shortly" - all derived from the server's ResetsAtUtc rather than re-deriving a window length here. */
export function formatResetsIn(resetsAtUtc: string): string {
  const ms = new Date(resetsAtUtc).getTime() - Date.now();
  if (ms <= 0) return "Resets shortly";
  const hours = Math.round(ms / 3_600_000);
  if (hours < 1) return "Resets in less than an hour";
  if (hours < 24) return `Resets in ${hours}h`;
  return `Resets in ${Math.round(hours / 24)}d`;
}
