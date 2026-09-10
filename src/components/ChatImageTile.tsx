import { Spinner } from "./Spinner";
import styles from "./ChatImageTile.module.css";

interface ChatImageTileProps {
  status: "loading" | "failed" | "loaded";
  dataUrl?: string;
  label: string;
  isSelected?: boolean;
  onClick?: () => void;
  onRetry?: () => void;
}

export function ChatImageTile({ status, dataUrl, label, isSelected, onClick, onRetry }: ChatImageTileProps) {
  return (
    <div className={`${styles.tile} ${isSelected ? styles.tileSelected : ""}`}>
      {status === "loaded" && dataUrl && (
        <button type="button" className={styles.tileButton} onClick={onClick}>
          <img src={dataUrl} alt={label} className={styles.image} />
        </button>
      )}

      {status === "loading" && (
        <div className={styles.statusOverlay}>
          <Spinner />
          <span>{label}</span>
        </div>
      )}

      {status === "failed" && (
        <div className={styles.statusOverlay}>
          <span>{label} failed</span>
          {onRetry && (
            <button type="button" className={styles.retryButton} onClick={onRetry}>
              Retry
            </button>
          )}
        </div>
      )}
    </div>
  );
}
