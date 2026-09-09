import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { GoogleSignInButton } from "../auth/GoogleSignInButton";
import { ErrorBanner } from "../components/ErrorBanner";
import { Spinner } from "../components/Spinner";
import styles from "../auth/AuthForm.module.css";

export function SignupPage() {
  const { signup, loginWithGoogle } = useAuth();
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      await signup(email.trim(), password, displayName.trim());
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Sign up failed."));
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
        <p className={styles.subtitle}>Create your account</p>

        {error && <ErrorBanner error={error} onDismiss={() => setError(null)} />}

        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.field}>
            <span>Name</span>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              autoComplete="name"
              required
              disabled={isSubmitting}
            />
          </label>
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
              autoComplete="new-password"
              minLength={8}
              required
              disabled={isSubmitting}
            />
          </label>
          <button type="submit" className={styles.submitButton} disabled={isSubmitting}>
            {isSubmitting ? <Spinner label="Creating account..." /> : "Create account"}
          </button>
        </form>

        <div className={styles.divider}>or</div>

        <div className={styles.googleRow}>
          <GoogleSignInButton onCredential={handleGoogleCredential} disabled={isSubmitting} />
        </div>

        <p className={styles.footer}>
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
