import { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as usageApi from "../api/usageApi";
import type { UsageResponse } from "../api/usageTypes";
import { useAuth } from "../auth/useAuth";

interface UsageContextValue {
  usage: UsageResponse | null;
  isLoading: boolean;
  /**
   * Re-fetches usage from the server. Call this after any successful generate/edit/refine
   * so the ring reflects it immediately - per the "updates after every successful call"
   * requirement. Never call it after a failed call: a failed generation releases its
   * credit hold rather than spending it, so server-side usage hasn't actually changed, and
   * spamming an extra fetch on every failure would be pure waste.
   */
  refresh: () => void;
}

const UsageContext = createContext<UsageContextValue | undefined>(undefined);

/**
 * One shared usage snapshot for the whole app (mounted once in App.tsx, alongside
 * AuthProvider), rather than each page fetching its own copy - so a refresh() called from
 * deep inside ProjectPage (after a successful generation) is immediately visible to the
 * HomePage's account menu too, without any prop drilling between them.
 */
export function UsageProvider({ children }: { children: React.ReactNode }) {
  const { accessToken } = useAuth();
  const [usage, setUsage] = useState<UsageResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  // Guards against an in-flight fetch from a stale token (e.g. right after logout/login)
  // resolving after a newer one and clobbering it with older data.
  const requestIdRef = useRef(0);

  const fetchUsage = useCallback(() => {
    if (!accessToken) {
      setUsage(null);
      return;
    }
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    usageApi
      .getUsage(accessToken)
      .then((response) => {
        if (requestId === requestIdRef.current) setUsage(response);
      })
      .catch(() => {
        // Usage is a display, not a gate on anything yet (see the backend's MeterOnly
        // comments) - a failed fetch just leaves the ring showing its last known value,
        // or nothing at all on first load. Not worth surfacing as an error banner.
      })
      .finally(() => {
        if (requestId === requestIdRef.current) setIsLoading(false);
      });
  }, [accessToken]);

  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  const value = useMemo<UsageContextValue>(
    () => ({ usage, isLoading, refresh: fetchUsage }),
    [usage, isLoading, fetchUsage],
  );

  return <UsageContext.Provider value={value}>{children}</UsageContext.Provider>;
}

export { UsageContext };
