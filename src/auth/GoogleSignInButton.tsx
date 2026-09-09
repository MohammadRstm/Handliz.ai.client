import { useEffect, useRef, useState } from "react";

interface GoogleSignInButtonProps {
  onCredential: (idToken: string) => void;
  disabled?: boolean;
}

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

/**
 * Renders Google's own "Sign in with Google" button via the Google Identity Services
 * script (loaded in index.html). The script loads async/defer, so this polls briefly for
 * window.google to appear rather than assuming it's ready on mount.
 */
export function GoogleSignInButton({ onCredential, disabled }: GoogleSignInButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scriptMissing, setScriptMissing] = useState(false);

  useEffect(() => {
    if (!CLIENT_ID) {
      return;
    }

    let cancelled = false;
    let attempts = 0;

    const tryInit = () => {
      if (cancelled) return;
      if (window.google?.accounts?.id && containerRef.current) {
        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: (response) => onCredential(response.credential),
        });
        window.google.accounts.id.renderButton(containerRef.current, {
          type: "standard",
          theme: "filled_black",
          size: "large",
          text: "continue_with",
          shape: "pill",
          width: 320,
        });
        return;
      }

      attempts += 1;
      if (attempts > 40) {
        // ~4 seconds of polling - the script likely failed to load (network/adblock).
        setScriptMissing(true);
        return;
      }
      setTimeout(tryInit, 100);
    };

    tryInit();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!CLIENT_ID) {
    return null; // Google sign-in simply isn't offered if unconfigured - not an error state.
  }

  if (scriptMissing) {
    return <p style={{ fontSize: 13, color: "var(--color-text-muted)" }}>Google sign-in is unavailable right now.</p>;
  }

  return <div ref={containerRef} aria-disabled={disabled} style={disabled ? { pointerEvents: "none", opacity: 0.5 } : undefined} />;
}
