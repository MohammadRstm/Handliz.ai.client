import { useEffect } from "react";
import styles from "./Lightbox.module.css";

export interface LightboxItem {
  id: string;
  dataUrl: string;
  label: string;
}

interface LightboxProps {
  items: LightboxItem[];
  activeIndex: number;
  onNavigate: (index: number) => void;
  onClose: () => void;
}

export function Lightbox({ items, activeIndex, onNavigate, onClose }: LightboxProps) {
  const item = items[activeIndex];

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") onNavigate((activeIndex + 1) % items.length);
      if (event.key === "ArrowLeft") onNavigate((activeIndex - 1 + items.length) % items.length);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [activeIndex, items.length, onNavigate, onClose]);

  if (!item) return null;

  return (
    <div className={styles.overlay} onClick={onClose} role="dialog" aria-label={item.label}>
      <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close">
        ✕
      </button>

      {items.length > 1 && (
        <button
          type="button"
          className={`${styles.navButton} ${styles.prevButton}`}
          onClick={(e) => {
            e.stopPropagation();
            onNavigate((activeIndex - 1 + items.length) % items.length);
          }}
          aria-label="Previous"
        >
          ‹
        </button>
      )}

      <div className={styles.imageWrapper} onClick={(e) => e.stopPropagation()}>
        <img src={item.dataUrl} alt={item.label} className={styles.image} />
        <p className={styles.caption}>
          {item.label} ({activeIndex + 1}/{items.length})
        </p>
      </div>

      {items.length > 1 && (
        <button
          type="button"
          className={`${styles.navButton} ${styles.nextButton}`}
          onClick={(e) => {
            e.stopPropagation();
            onNavigate((activeIndex + 1) % items.length);
          }}
          aria-label="Next"
        >
          ›
        </button>
      )}
    </div>
  );
}
