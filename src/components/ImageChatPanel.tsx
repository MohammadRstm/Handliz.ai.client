import { useState } from "react";
import type { ChatMessageDto } from "../api/types";
import { ApiError } from "../api/client";
import { MAX_INSTRUCTION_LENGTH } from "../constants";
import type { DisplayedImage } from "./ResultsGallery";
import { ErrorBanner } from "./ErrorBanner";
import { Spinner } from "./Spinner";
import styles from "./ImageChatPanel.module.css";

interface ImageChatPanelProps {
  image: DisplayedImage;
  history: ChatMessageDto[];
  historyTruncated: boolean;
  isRefining: boolean;
  error: ApiError | Error | null;
  onSubmit: (instruction: string) => void;
  onClose: () => void;
}

export function ImageChatPanel({
  image,
  history,
  historyTruncated,
  isRefining,
  error,
  onSubmit,
  onClose,
}: ImageChatPanelProps) {
  const [instruction, setInstruction] = useState("");

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = instruction.trim();
    if (!trimmed || isRefining) return;
    onSubmit(trimmed);
    setInstruction("");
  };

  return (
    <div className={styles.overlay} role="dialog" aria-label={`Refine image ${image.index + 1}`}>
      <div className={styles.panel}>
        <div className={styles.header}>
          <h3 className={styles.title}>Refine image {image.index + 1}</h3>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className={styles.preview}>
          <img src={image.dataUrl} alt={`Generated ${image.index + 1}`} className={styles.previewImg} />
        </div>

        <div className={styles.chatArea}>
          {historyTruncated && (
            <p className={styles.truncatedNotice}>Only the most recent messages are shown.</p>
          )}

          {history.length === 0 && (
            <p className={styles.emptyState}>
              Describe a change - e.g. "make the roof darker" or "add a parked car in the driveway".
            </p>
          )}

          <ul className={styles.messageList}>
            {history.map((msg, i) => (
              <li
                key={i}
                className={`${styles.message} ${msg.role === "user" ? styles.messageUser : styles.messageAssistant}`}
              >
                {msg.text}
              </li>
            ))}
          </ul>

          {isRefining && (
            <div className={styles.pendingRow}>
              <Spinner label="Applying your change..." />
            </div>
          )}

          {error && <ErrorBanner error={error} />}
        </div>

        <form className={styles.inputRow} onSubmit={handleSubmit}>
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="What would you like to change?"
            maxLength={MAX_INSTRUCTION_LENGTH}
            rows={2}
            disabled={isRefining}
            className={styles.textarea}
          />
          <button type="submit" className={styles.sendButton} disabled={isRefining || !instruction.trim()}>
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
