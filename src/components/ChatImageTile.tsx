import { CheckIcon } from "./icons";
import { Spinner } from "./Spinner";
import styles from "./ChatImageTile.module.css";

interface ChatImageTileProps {
  status: "loading" | "failed" | "loaded";
  dataUrl?: string;
  label: string;
  /** Manual selection for editing (Chunk 8) - independent of the lightbox viewer, which opens on the image itself. */
  isChecked?: boolean;
  onToggleCheck?: () => void;
  /** Shown on an uploaded image added mid-chat (Chunk 5), never on the original upload set. */
  isNewlyAdded?: boolean;
  onClick?: () => void;
  onRetry?: () => void;
}

export function ChatImageTile({
  status,
  dataUrl,
  label,
  isChecked,
  onToggleCheck,
  isNewlyAdded,
  onClick,
  onRetry,
}: ChatImageTileProps) {
  return (
    <div className={`${styles.tile} ${isChecked ? styles.tileSelected : ""}`}>
      {status === "loaded" && dataUrl && (
        <button type="button" className={styles.tileButton} onClick={onClick}>
          <img src={dataUrl} alt={label} className={styles.image} />
        </button>
      )}

      {status === "loaded" && isNewlyAdded && <span className={styles.badge}>Added</span>}

      {status === "loaded" && onToggleCheck && (
        <button
          type="button"
          className={`${styles.checkBadge} ${isChecked ? styles.checkBadgeChecked : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleCheck();
          }}
          aria-pressed={isChecked}
          aria-label={isChecked ? `Deselect ${label}` : `Select ${label}`}
          title={isChecked ? "Deselect" : "Select for editing"}
        >
          {isChecked && <CheckIcon size={12} />}
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
