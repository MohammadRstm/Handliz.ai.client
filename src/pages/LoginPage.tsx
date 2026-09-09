import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { GoogleSignInButton } from "../auth/GoogleSignInButton";
import { ErrorBanner } from "../components/ErrorBanner";
import { Spinner } from "../components/Spinner";
import styles from "../auth/AuthForm.module.css";

export function LoginPage() {
  const { login, loginWithGoogle } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      await login(email.trim(), password);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Login failed."));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleCredential = async (idToken: string) => {
    setError(null);
    try {
      await loginWithGoogle(idToken);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Google sign-in failed."));
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.brand}>Handliz.ai</h1>
        <p className={styles.subtitle}>Sign in to your account</p>

        {error && <ErrorBanner error={error} onDismiss={() => setError(null)} />}

        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.field}>
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              disabled={isSubmitting}
            />
          </label>
          <label className={styles.field}>
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              disabled={isSubmitting}
            />
          </label>
          <button type="submit" className={styles.submitButton} disabled={isSubmitting}>
            {isSubmitting ? <Spinner label="Signing in..." /> : "Sign in"}
          </button>
        </form>

        <div className={styles.divider}>or</div>

        <div className={styles.googleRow}>
          <GoogleSignInButton onCredential={handleGoogleCredential} disabled={isSubmitting} />
        </div>

        <p className={styles.footer}>
          Don't have an account? <Link to="/signup">Sign up</Link>
        </p>
      </div>
    </div>
  );
}
