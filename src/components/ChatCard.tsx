import { useState } from "react";
import type { ChatSummaryDto } from "../api/chatTypes";
import styles from "./ChatCard.module.css";

interface ChatCardProps {
  chat: ChatSummaryDto;
  onClick: () => void;
}

function formatLastUsed(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function ChatCard({ chat, onClick }: ChatCardProps) {
  const [isHovering, setIsHovering] = useState(false);

  return (
    <button
      type="button"
      className={styles.card}
      onClick={onClick}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      {chat.thumbnailDataUrl ? (
        <img src={chat.thumbnailDataUrl} alt={chat.location} className={styles.thumbnail} />
      ) : (
        <div className={styles.placeholder}>No image yet</div>
      )}

      <div className={styles.footer}>
        <span className={styles.location}>{chat.location}</span>
        <span className={styles.count}>{chat.requestedImageCount} img</span>
      </div>

      {isHovering && <div className={styles.hoverDate}>Last used {formatLastUsed(chat.lastUsedAtUtc)}</div>}
    </button>
  );
}
