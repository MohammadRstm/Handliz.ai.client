import { Link } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { AccountMenu } from "../components/AccountMenu";
import { BackArrowIcon } from "../components/icons";
import { UsageRing } from "../usage/UsageRing";
import styles from "./SettingsPage.module.css";

/**
 * Read-only for now: there is no update-profile or change-password endpoint on the backend
 * yet (AuthController only has signup/login/google/refresh/logout/me), so this page shows
 * account info rather than pretending fields here could be edited and saved.
 */
export function SettingsPage() {
  const { user } = useAuth();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link to="/" className={styles.backIconLink} aria-label="Back to chats" title="Back to chats">
          <BackArrowIcon />
        </Link>
        <h1 className={styles.title}>Settings</h1>
        <div className={styles.headerActions}>
          <UsageRing />
          <AccountMenu />
        </div>
      </header>

      <main className={styles.main}>
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Account</h2>
          <div className={styles.card}>
            <div className={styles.row}>
              <span className={styles.rowLabel}>Display name</span>
              <span className={styles.rowValue}>{user?.displayName}</span>
            </div>
            <div className={styles.divider} />
            <div className={styles.row}>
              <span className={styles.rowLabel}>Email</span>
              <span className={styles.rowValue}>{user?.email}</span>
            </div>
          </div>
          <p className={styles.note}>
            Editing your name, email, or password isn't available in this preview yet.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Plan &amp; usage</h2>
          <p className={styles.note}>
            See your current plan and credit usage on the <Link to="/billing">Billing page</Link>.
          </p>
        </section>
      </main>
    </div>
  );
}
