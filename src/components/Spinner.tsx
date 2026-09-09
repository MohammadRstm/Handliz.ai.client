import styles from "./Spinner.module.css";

interface SpinnerProps {
  label?: string;
}

export function Spinner({ label }: SpinnerProps) {
  return (
    <div className={styles.wrapper} role="status" aria-live="polite">
      <span className={styles.ring} aria-hidden="true" />
      {label && <span className={styles.label}>{label}</span>}
    </div>
  );
}
