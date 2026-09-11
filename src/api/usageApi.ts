import { apiGet } from "./client";
import type { PlansResponse, UsageResponse } from "./usageTypes";

/**
 * Live usage snapshot for the signed-in user. Nothing is currently enforced against it
 * (see the backend's Phase 2/MeterOnly comments) - Remaining reaching zero doesn't block
 * anything yet, this is purely informational.
 */
export function getUsage(accessToken: string, signal?: AbortSignal): Promise<UsageResponse> {
  return apiGet<UsageResponse>("/api/usage", { accessToken, signal });
}

/** The plan catalog (trial included) plus the user's current plan key, for the billing page. */
export function getPlans(accessToken: string, signal?: AbortSignal): Promise<PlansResponse> {
  return apiGet<PlansResponse>("/api/plans", { accessToken, signal });
}
