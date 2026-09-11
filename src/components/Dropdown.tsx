import { useEffect, useId, useRef, useState } from "react";
import styles from "./Dropdown.module.css";

const DROPDOWN_OPEN_EVENT = "handliz:dropdown-open";

interface DropdownProps {
  /** Full trigger content - callers own their own icon/text/arrow, Dropdown adds no chevron of its own. */
  trigger: React.ReactNode;
  disabled?: boolean;
  children: React.ReactNode;
  /** Which edge of the trigger the panel's matching edge aligns to. Default "left". */
  align?: "left" | "right";
  /**
   * Which side of the trigger the panel opens toward. Default "above" - the original (and
   * still most common) use is the in-chat composer's settings menu, anchored near the
   * bottom of the viewport where there's no room below it. Top-of-page triggers (account
   * menu, usage ring) want "below" instead.
   */
  side?: "above" | "below";
}

/**
 * A button that toggles a floating panel below it, closing on outside click, Escape, or
 * (via a broadcast custom event, since each instance is otherwise independent) whenever a
 * different Dropdown on the page opens - only one should ever be open at a time. The
 * trigger itself has no background/border by default, only a hover state - see
 * Dropdown.module.css.
 */
export function Dropdown({ trigger, disabled, children, align = "left", side = "above" }: DropdownProps) {
  const instanceId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOtherOpened = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== instanceId) {
        setIsOpen(false);
      }
    };
    document.addEventListener(DROPDOWN_OPEN_EVENT, handleOtherOpened);
    return () => document.removeEventListener(DROPDOWN_OPEN_EVENT, handleOtherOpened);
  }, [instanceId]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const handleToggle = () => {
    setIsOpen((wasOpen) => {
      const willOpen = !wasOpen;
      if (willOpen) {
        document.dispatchEvent(new CustomEvent(DROPDOWN_OPEN_EVENT, { detail: instanceId }));
      }
      return willOpen;
    });
  };

  return (
    <div className={styles.wrapper} ref={wrapperRef}>
      <button type="button" className={styles.trigger} onClick={handleToggle} disabled={disabled}>
        {trigger}
      </button>
      {isOpen && !disabled && (
        <div
          className={styles.panel}
          style={{
            ...(align === "right" ? { right: 0, left: "auto" } : undefined),
            ...(side === "below" ? { top: "calc(100% + 8px)", bottom: "auto" } : undefined),
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      )}
    </div>
  );
}
