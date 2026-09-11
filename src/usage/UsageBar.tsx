import { formatResetsIn, usageColor } from "./usageFormat";
import styles from "./UsageBar.module.css";

interface UsageBarProps {
  label: string;
  used: number;
  held: number;
  cap: number;
  /** Omit for the trial's lifetime grant, which never resets. */
  resetsAtUtc?: string;
}

/** One progress bar (trial's lifetime grant, or one rolling window) - reused by UsagePopover for whichever of the two shapes CreditUsageSnapshot sent. */
export function UsageBar({ label, used, held, cap, resetsAtUtc }: UsageBarProps) {
  const consumed = used + held;
  const fraction = cap > 0 ? Math.min(1, consumed / cap) : 1;

  return (
    <div className={styles.bar}>
      <div className={styles.header}>
        <span>{label}</span>
        <span className={styles.numbers}>
          {consumed} / {cap}
        </span>
      </div>
      <div className={styles.track}>
        <div className={styles.fill} style={{ width: `${fraction * 100}%`, background: usageColor(fraction) }} />
      </div>
      <div className={styles.footer}>
        {held > 0 && <span>{held} in progress</span>}
        {resetsAtUtc && <span>{formatResetsIn(resetsAtUtc)}</span>}
      </div>
    </div>
  );
}
