import { createContext, useCallback, useEffect, useMemo, useState } from "react";
import * as authApi from "../api/authApi";
import { ApiError } from "../api/client";
import type { UserDto } from "../api/authTypes";

export interface AuthContextValue {
  user: UserDto | null;
  accessToken: string | null;
  /** True only while the initial silent-refresh-on-load check is in flight. */
  isInitializing: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, displayName: string) => Promise<void>;
  loginWithGoogle: (idToken: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserDto | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  // On load, the access token (kept only in memory, never localStorage) is gone even
  // though the httpOnly refresh cookie may still be valid - try one silent refresh so a
  // page reload doesn't force a fresh login.
  useEffect(() => {
    let cancelled = false;
    authApi
      .refresh()
      .then((response) => {
        if (cancelled) return;
        setAccessToken(response.accessToken);
        setUser(response.user);
      })
      .catch(() => {
        // No valid session cookie (or it expired) - that's a normal logged-out state, not an error to surface.
      })
      .finally(() => {
        if (!cancelled) setIsInitializing(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const response = await authApi.login({ email, password });
    setAccessToken(response.accessToken);
    setUser(response.user);
  }, []);

  const signup = useCallback(async (email: string, password: string, displayName: string) => {
    const response = await authApi.signup({ email, password, displayName });
    setAccessToken(response.accessToken);
    setUser(response.user);
  }, []);

  const loginWithGoogle = useCallback(async (idToken: string) => {
    const response = await authApi.googleLogin({ idToken });
    setAccessToken(response.accessToken);
    setUser(response.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch (err) {
      // Even if the network call fails, clear local state - the user asked to log out.
      if (!(err instanceof ApiError)) throw err;
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, accessToken, isInitializing, login, signup, loginWithGoogle, logout }),
    [user, accessToken, isInitializing, login, signup, loginWithGoogle, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
