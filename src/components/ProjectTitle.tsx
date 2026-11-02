import { useState } from "react";
import { Spinner } from "./Spinner";
import styles from "./ProjectTitle.module.css";

const MAX_TITLE_LENGTH = 100;

interface ProjectTitleProps {
  /** Null while the suggested title is still being written. */
  title: string | null;
  /** Shown until there is a title. */
  fallback: string;
  /** Resolves once saved; rejects to put the previous title back. */
  onRename: (title: string) => Promise<void>;
}

/**
 * The project's name in the header: the AI's suggestion (from the original photo) until the
 * user clicks it and types their own. Enter or leaving the field saves; Escape cancels.
 */
export function ProjectTitle({ title, fallback, onRename }: ProjectTitleProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const commit = async () => {
    if (draft === null) return;
    const next = draft.trim();
    setDraft(null);
    if (!next || next === title) return;
    setIsSaving(true);
    try {
      await onRename(next);
    } catch {
      // The page shows the error; the saved title stays.
    } finally {
      setIsSaving(false);
    }
  };

  if (draft !== null) {
    return (
      <input
        type="text"
        className={styles.input}
        value={draft}
        maxLength={MAX_TITLE_LENGTH}
        aria-label="Project title"
        autoFocus
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setDraft(null);
        }}
      />
    );
  }

  return (
    <h1 className={styles.title}>
      <button
        type="button"
        className={styles.button}
        onClick={() => setDraft(title ?? "")}
        disabled={isSaving}
        title="Rename this project"
      >
        {title ?? fallback}
      </button>
      {isSaving && <Spinner />}
      {!title && !isSaving && <span className={styles.loading} aria-label="Suggesting a title" />}
    </h1>
  );
}
