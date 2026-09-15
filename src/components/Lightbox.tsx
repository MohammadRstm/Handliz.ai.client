import { useEffect, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "./icons";
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

  // Two levels: the default catalogue preview (image capped at a modest height, caption
  // and filmstrip visible below it) and, one click on the image further in, a true
  // full-screen view with those trimmed away so the image itself gets the space. Local
  // state rather than something the caller tracks - it's purely a display mode of this
  // component, and resets for free every time the Lightbox unmounts (ChatPage/
  // ImageUploader both render it conditionally on activeIndex, so closing and reopening
  // always starts back at the catalogue level, never stuck zoomed in from a prior image).
  const [isZoomed, setIsZoomed] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Escape steps back one level at a time: out of full-screen first, only closing
      // the whole viewer on a second press (or immediately, if never zoomed in).
      if (event.key === "Escape") {
        if (isZoomed) setIsZoomed(false);
        else onClose();
      }
      // Arrow keys move through the catalogue at either level - zoomed stays zoomed as
      // the image underneath changes, rather than dropping back to the preview.
      if (event.key === "ArrowRight") onNavigate((activeIndex + 1) % items.length);
      if (event.key === "ArrowLeft") onNavigate((activeIndex - 1 + items.length) % items.length);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [activeIndex, items.length, onNavigate, onClose, isZoomed]);

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
            <ChevronLeftIcon />
          </button>
        )}

        <div className={`${styles.contentColumn} ${isZoomed ? styles.contentColumnZoomed : ""}`}>
          {/* Click toggles between the two levels - same gesture both ways, which is why
              this is on the image itself rather than a separate "expand" button: zoom in
              from the catalogue view, zoom back out from full-screen. Arrow-key/filmstrip
              navigation underneath it doesn't change this mode either way. */}
          <img
            src={item.src}
            alt={item.label}
            className={`${styles.image} ${isZoomed ? styles.imageZoomed : ""}`}
            decoding="async"
            onClick={() => setIsZoomed((z) => !z)}
            title={isZoomed ? "Click to shrink" : "Click to view full-size"}
          />

          {!isZoomed && (
            <>
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
            </>
          )}
        </div>

        {items.length > 1 && (
          <button
            type="button"
            className={styles.navButton}
            onClick={() => onNavigate((activeIndex + 1) % items.length)}
            aria-label="Next"
          >
            <ChevronRightIcon />
          </button>
        )}
      </div>
    </div>
  );
}
