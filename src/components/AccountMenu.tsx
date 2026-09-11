import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { Dropdown } from "./Dropdown";
import styles from "./AccountMenu.module.css";

/** Account/nav dropdown (Chats / Settings / Billing / Log out) - the one place these live, used from both HomePage and ChatPage's headers. */
export function AccountMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const initial = (user?.displayName ?? "?").trim().charAt(0).toUpperCase() || "?";

  return (
    <Dropdown
      side="below"
      align="right"
      trigger={
        <span className={styles.trigger}>
          <span className={styles.avatar}>{initial}</span>
        </span>
      }
    >
      <div className={styles.menu}>
        <div className={styles.identity}>
          <div className={styles.identityName}>{user?.displayName}</div>
          <div className={styles.identityEmail}>{user?.email}</div>
        </div>
        <div className={styles.divider} />
        <Link to="/" className={styles.item}>
          Chats
        </Link>
        <Link to="/settings" className={styles.item}>
          Settings
        </Link>
        <Link to="/billing" className={styles.item}>
          Billing
        </Link>
        <div className={styles.divider} />
        <button type="button" className={styles.logoutItem} onClick={() => void handleLogout()}>
          Log out
        </button>
      </div>
    </Dropdown>
  );
}
