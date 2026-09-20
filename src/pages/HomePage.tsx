import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as chatsApi from "../api/chatsApi";
import { ApiError } from "../api/client";
import type { ChatSummaryDto, ImageModelsResponse, StartChatParams } from "../api/chatTypes";
import { useAuth } from "../auth/useAuth";
import { AccountMenu } from "../components/AccountMenu";
import { ChatCard } from "../components/ChatCard";
import { ChatComposer } from "../components/ChatComposer";
import { ErrorBanner } from "../components/ErrorBanner";
import { Spinner } from "../components/Spinner";
import { UsageRing } from "../usage/UsageRing";
import styles from "./HomePage.module.css";

function toError(err: unknown): ApiError | Error {
  if (err instanceof ApiError || err instanceof Error) return err;
  return new Error("Something went wrong.");
}

const PAGE_SIZE = 12;

export function HomePage() {
  const { accessToken } = useAuth();
  const navigate = useNavigate();

  const [catalog, setCatalog] = useState<ImageModelsResponse | null>(null);
  const [chats, setChats] = useState<ChatSummaryDto[] | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loadError, setLoadError] = useState<Error | null>(null);

  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState<Error | null>(null);

  const [deletingChatId, setDeletingChatId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<Error | null>(null);
  // The chat most recently deleted, kept only so it can be offered back. Deletion is soft
  // server-side, so this is a convenience rather than the only way back - losing it (by
  // navigating away) costs nothing permanent.
  const [undoable, setUndoable] = useState<{ id: string; label: string } | null>(null);
  // Bumped to force the list effect to re-run after a delete or restore, rather than
  // patching `chats` locally: the server owns totalCount, page contents and the 30-chat
  // cap, so after a mutation only a refetch can be trusted to agree with it.
  const [listVersion, setListVersion] = useState(0);

  // Models load once; the chat page reloads on its own whenever `page` changes, so it's
  // kept out of the same Promise.all as the one-time models fetch below.
  useEffect(() => {
    if (!accessToken) return;
    const controller = new AbortController();
    chatsApi
      .getImageModels(accessToken, controller.signal)
      .then(setCatalog)
      .catch((err) => {
        if (!controller.signal.aborted) setLoadError(toError(err));
      });
    return () => controller.abort();
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) return;
    const controller = new AbortController();
    chatsApi
      .listChats(accessToken, { page, pageSize: PAGE_SIZE }, controller.signal)
      .then((response) => {
        setChats(response.chats);
        setTotalCount(response.totalCount);
      })
      .catch((err) => {
        if (!controller.signal.aborted) setLoadError(toError(err));
      });
    return () => controller.abort();
  }, [accessToken, page, listVersion]);

  const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const handleDelete = async (chat: ChatSummaryDto) => {
    if (!accessToken || deletingChatId) return;
    setDeletingChatId(chat.id);
    setDeleteError(null);
    try {
      await chatsApi.deleteChat(chat.id, accessToken);
      setUndoable({ id: chat.id, label: chat.title ?? chat.location });
      setListVersion((v) => v + 1);
    } catch (err) {
      setDeleteError(toError(err));
    } finally {
      setDeletingChatId(null);
    }
  };

  const handleUndo = async () => {
    if (!accessToken || !undoable) return;
    const target = undoable;
    setUndoable(null);
    setDeleteError(null);
    try {
      await chatsApi.restoreChat(target.id, accessToken);
      setListVersion((v) => v + 1);
    } catch (err) {
      setDeleteError(toError(err));
      setUndoable(target); // restore failed - keep the offer available to retry
    }
  };

  // Deleting every chat on the last page (or a page emptying out from the 30-chat cap
  // evicting one elsewhere) can leave `page` past the end once totalCount shrinks - pull
  // it back rather than showing a page permanently stuck empty.
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const handleStartChat = async (params: StartChatParams) => {
    if (!accessToken) return;
    setIsStarting(true);
    setStartError(null);
    try {
      const response = await chatsApi.startChat(params, accessToken);
      // No navigation state needed: ChatPage detects missing image indices itself and
      // starts generating them, whether the chat is brand new or was left incomplete.
      navigate(`/chats/${response.chatId}`);
    } catch (err) {
      setStartError(toError(err));
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.accountBar}>
          <UsageRing />
          <AccountMenu />
        </div>
        <h1 className={styles.brand}>Handliz.ai</h1>
        <p className={styles.tagline}>Turn a reference photo into on-site renders for any place, time, and weather.</p>
      </header>

      <main className={styles.main}>
        {loadError && <ErrorBanner error={loadError} />}

        {!catalog && !loadError && (
          <div className={styles.loading}>
            <Spinner label="Loading..." />
          </div>
        )}

        {catalog && (
          <>
            {undoable && (
              <div className={styles.undoBar}>
                <span>Deleted "{undoable.label}".</span>
                <button type="button" className={styles.undoButton} onClick={() => void handleUndo()}>
                  Undo
                </button>
                <button
                  type="button"
                  className={styles.undoDismiss}
                  onClick={() => setUndoable(null)}
                  aria-label="Dismiss"
                >
                  ✕
                </button>
              </div>
            )}

            {deleteError && <ErrorBanner error={deleteError} onDismiss={() => setDeleteError(null)} />}

            {chats && chats.length > 0 && (
              <div className={styles.grid}>
                {chats.map((chat) => (
                  <ChatCard
                    key={chat.id}
                    chat={chat}
                    onClick={() => navigate(`/chats/${chat.id}`)}
                    onDelete={() => void handleDelete(chat)}
                    isDeleting={deletingChatId === chat.id}
                  />
                ))}
              </div>
            )}

            {chats && chats.length === 0 && (
              <p className={styles.emptyState}>
                {totalCount === 0 ? "No chats yet - start one below." : "No chats on this page."}
              </p>
            )}

            {pageCount > 1 && (
              <div className={styles.pager}>
                <button
                  type="button"
                  className={styles.pagerButton}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  Previous
                </button>
                <span className={styles.pagerLabel}>
                  Page {page} of {pageCount} · {totalCount} chat{totalCount === 1 ? "" : "s"}
                </span>
                <button
                  type="button"
                  className={styles.pagerButton}
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  disabled={page >= pageCount}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </main>

      {catalog && (
        <div className={styles.composerBar}>
          {startError && (
            <div className={styles.errorSlot}>
              <ErrorBanner error={startError} onDismiss={() => setStartError(null)} />
            </div>
          )}
          <ChatComposer catalog={catalog} onSubmit={handleStartChat} isSubmitting={isStarting} />
        </div>
      )}
    </div>
  );
}
