/** One rolling window's usage (daily or weekly, paid plans only). */
export interface UsageWindowDto {
  cap: number;
  used: number;
  /** Credits tied up in reservations that haven't settled or released yet - an in-flight generation, mid-call. */
  held: number;
  remaining: number;
  resetsAtUtc: string;
}

/** The trial's lifetime grant - no resetsAtUtc, since a spent trial never resets. */
export interface UsageTrialDto {
  granted: number;
  used: number;
  held: number;
  remaining: number;
}

/** Exactly one of trial or (daily and weekly) is populated, matching isTrial. */
export interface UsageResponse {
  success: true;
  planKey: string;
  planDisplayName: string;
  isTrial: boolean;
  trial: UsageTrialDto | null;
  daily: UsageWindowDto | null;
  weekly: UsageWindowDto | null;
  /** 0-1. Drives the ring's fill and color. */
  worstFractionUsed: number;
  /** "trial" | "daily" | "weekly" - which figure worstFractionUsed came from. */
  worstWindow: string;
}

export interface PlanDto {
  key: string;
  displayName: string;
  description: string;
  isTrial: boolean;
  /** Trial only. */
  lifetimeCredits: number | null;
  /** Paid plans only. */
  weeklyCredits: number | null;
  /** Paid plans only. */
  dailyCredits: number | null;
  /** Paid plans only. */
  priceUsd: number | null;
}

export interface PlansResponse {
  success: true;
  plans: PlanDto[];
  currentPlanKey: string;
}
