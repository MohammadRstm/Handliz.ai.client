import { useEffect } from "react";
import styles from "./Lightbox.module.css";

export interface LightboxItem {
  id: string;
  /** Already absolute - resolved by the caller. */
  src: string;
  /** Small variant for the filmstrip, so opening the viewer doesn't fetch every image at full size. */
  thumbnailSrc: string;
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

      {/* Prev/next are flex siblings of the content column (image + caption + thumbnail
          strip) in one row, not absolutely positioned against the full-screen overlay -
          that's what let them drift off-center whenever the content's actual height
          (which varies with image aspect ratio, and now the thumbnail strip below it)
          didn't happen to match the viewport's own center. Flexbox's own vertical
          centering keeps them aligned to the real content height at any size. */}
      <div className={styles.viewerRow} onClick={(e) => e.stopPropagation()}>
        {items.length > 1 && (
          <button
            type="button"
            className={styles.navButton}
            onClick={() => onNavigate((activeIndex - 1 + items.length) % items.length)}
            aria-label="Previous"
          >
            ‹
          </button>
        )}

        <div className={styles.contentColumn}>
          <img src={item.src} alt={item.label} className={styles.image} decoding="async" />
          <p className={styles.caption}>
            {item.label} ({activeIndex + 1}/{items.length})
          </p>

          {items.length > 1 && (
            <div className={styles.thumbnailStrip} role="listbox" aria-label="All images">
              {items.map((thumbItem, index) => (
                <button
                  key={thumbItem.id}
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  className={`${styles.thumbnail} ${index === activeIndex ? styles.thumbnailActive : ""}`}
                  onClick={() => onNavigate(index)}
                >
                  <img src={thumbItem.thumbnailSrc} alt={thumbItem.label} className={styles.thumbnailImg} loading="lazy" decoding="async" />
                </button>
              ))}
            </div>
          )}
        </div>

        {items.length > 1 && (
          <button
            type="button"
            className={styles.navButton}
            onClick={() => onNavigate((activeIndex + 1) % items.length)}
            aria-label="Next"
          >
            ›
          </button>
        )}
      </div>
    </div>
  );
}
