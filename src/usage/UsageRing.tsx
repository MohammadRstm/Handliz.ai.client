import { Link } from "react-router-dom";
import { Dropdown } from "../components/Dropdown";
import { UsageBar } from "./UsageBar";
import { usageColor, usageRingLabel } from "./usageFormat";
import { useUsage } from "./useUsage";
import styles from "./UsageRing.module.css";

const RADIUS = 8;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * The small ring + "N left" pill (model chip's neighbor in the project header, or a standalone
 * pill in the home header) - clicking it opens the full trial/daily/weekly breakdown. Reads
 * from UsageContext rather than fetching its own copy, so it always reflects the same
 * snapshot a just-completed generation elsewhere just refreshed.
 */
export function UsageRing() {
  const { usage, isLoading } = useUsage();

  if (!usage) {
    // First load (or a fetch failure with no prior snapshot) - render nothing rather than
    // a placeholder ring, since there's no fraction to show yet and a skeleton for
    // something this small would be more distracting than useful.
    return null;
  }

  const fraction = usage.worstFractionUsed;
  const color = usageColor(fraction);
  const offset = CIRCUMFERENCE * (1 - fraction);

  return (
    <Dropdown
      side="below"
      align="right"
      trigger={
        <span className={styles.trigger} aria-label={`Usage: ${usageRingLabel(usage)}`}>
          <svg width="20" height="20" viewBox="0 0 20 20" className={isLoading ? styles.spinning : undefined}>
            <circle cx="10" cy="10" r={RADIUS} fill="none" stroke="var(--color-border)" strokeWidth="2.5" />
            <circle
              cx="10"
              cy="10"
              r={RADIUS}
              fill="none"
              stroke={color}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={offset}
              transform="rotate(-90 10 10)"
            />
          </svg>
          <span className={styles.label}>{usageRingLabel(usage)}</span>
        </span>
      }
    >
      <div className={styles.popover}>
        <div className={styles.popoverHeader}>
          <span className={styles.planName}>{usage.planDisplayName}</span>
          {usage.isTrial && <span className={styles.trialBadge}>One-time trial</span>}
        </div>

        {usage.isTrial && usage.trial && (
          <UsageBar label="Trial credits" used={usage.trial.used} held={usage.trial.held} cap={usage.trial.granted} />
        )}

        {!usage.isTrial && usage.daily && (
          <UsageBar
            label="Today"
            used={usage.daily.used}
            held={usage.daily.held}
            cap={usage.daily.cap}
            resetsAtUtc={usage.daily.resetsAtUtc}
          />
        )}

        {!usage.isTrial && usage.weekly && (
          <UsageBar
            label="This week"
            used={usage.weekly.used}
            held={usage.weekly.held}
            cap={usage.weekly.cap}
            resetsAtUtc={usage.weekly.resetsAtUtc}
          />
        )}

        {usage.isTrial && usage.trial && usage.trial.remaining === 0 && (
          <p className={styles.exhaustedNote}>Your trial credits are used up. Subscribe to a plan to keep generating.</p>
        )}

        <Link to="/billing" className={styles.manageLink}>
          {usage.isTrial ? "View plans" : "Manage plan"}
        </Link>
      </div>
    </Dropdown>
  );
}
