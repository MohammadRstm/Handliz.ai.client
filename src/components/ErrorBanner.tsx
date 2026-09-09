import { ApiError } from "../api/client";
import styles from "./ErrorBanner.module.css";

interface ErrorBannerProps {
  error: ApiError | Error;
  onDismiss?: () => void;
}

/**
 * Renders any API failure. Distinguishes a field-level validation error (shows each
 * field's message) from a general business/upstream failure (shows the message and,
 * for debugging, which pipeline stage failed).
 */
export function ErrorBanner({ error, onDismiss }: ErrorBannerProps) {
  const apiError = error instanceof ApiError ? error : null;

  return (
    <div className={styles.banner} role="alert">
      <div className={styles.content}>
        <p className={styles.message}>{error.message}</p>
        {apiError?.stage && <p className={styles.meta}>Stage: {apiError.stage}</p>}
        {apiError?.fieldErrors && (
          <ul className={styles.fieldList}>
            {Object.entries(apiError.fieldErrors).map(([field, messages]) => (
              <li key={field}>
                <strong>{field}:</strong> {messages.join(" ")}
              </li>
            ))}
          </ul>
        )}
      </div>
      {onDismiss && (
        <button type="button" className={styles.dismiss} onClick={onDismiss} aria-label="Dismiss">
          ✕
        </button>
      )}
    </div>
  );
}
