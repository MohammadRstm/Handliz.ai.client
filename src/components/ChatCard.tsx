import { useState } from "react";
import type { ChatSummaryDto } from "../api/chatTypes";
import { imageUrl } from "../api/client";
import { TrashIcon } from "./icons";
import { Spinner } from "./Spinner";
import styles from "./ChatCard.module.css";

interface ChatCardProps {
  chat: ChatSummaryDto;
  onClick: () => void;
  onDelete: () => void;
  isDeleting?: boolean;
}

function formatLastUsed(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function ChatCard({ chat, onClick, onDelete, isDeleting }: ChatCardProps) {
  const [isHovering, setIsHovering] = useState(false);
  const label = chat.title ?? chat.location;

  // The card used to be one big <button>. It is now a div wrapping a button, because the
  // delete control has to be a real button too and nesting one inside another is invalid
  // HTML that browsers resolve unpredictably. Same structure ChatImageTile already uses
  // for its own overlay controls.
  return (
    <div
      className={styles.card}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      <button type="button" className={styles.cardButton} onClick={onClick}>
        {chat.thumbnailUrl ? (
          <img
            src={imageUrl(chat.thumbnailUrl)}
            alt={label}
            className={styles.thumbnail}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className={styles.placeholder}>No image yet</div>
        )}

        <div className={styles.footer}>
          <span className={styles.location}>{label}</span>
          <span className={styles.count}>{chat.requestedImageCount} img</span>
        </div>
      </button>

      {/* stopPropagation is belt and braces here - the two buttons are siblings rather
          than nested - but it keeps the delete click from ever reaching an ancestor
          handler if this card is later dropped into something clickable. */}
      <button
        type="button"
        className={styles.deleteButton}
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        disabled={isDeleting}
        aria-label={`Delete ${label}`}
        title="Delete this chat"
      >
        {isDeleting ? <Spinner /> : <TrashIcon size={14} />}
      </button>

      {isHovering && <div className={styles.hoverDate}>Last used {formatLastUsed(chat.lastUsedAtUtc)}</div>}
    </div>
  );
}
