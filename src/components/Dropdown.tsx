import { useEffect, useRef, useState } from "react";
import styles from "./Dropdown.module.css";

interface DropdownProps {
  label: string;
  disabled?: boolean;
  children: React.ReactNode;
}

/** A button that toggles a floating panel below it, closing on outside click or Escape. */
export function Dropdown({ label, disabled, children }: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

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

  return (
    <div className={styles.wrapper} ref={wrapperRef}>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setIsOpen((v) => !v)}
        disabled={disabled}
      >
        {label}
        <span className={styles.chevron} aria-hidden="true">
          ▾
        </span>
      </button>
      {isOpen && !disabled && (
        <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
          {children}
        </div>
      )}
    </div>
  );
}
