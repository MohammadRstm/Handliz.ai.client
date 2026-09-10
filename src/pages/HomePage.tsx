import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as chatsApi from "../api/chatsApi";
import { ApiError } from "../api/client";
import type { ChatSummaryDto, ImageModelsResponse, StartChatParams } from "../api/chatTypes";
import { useAuth } from "../auth/useAuth";
import { ChatCard } from "../components/ChatCard";
import { ChatComposer } from "../components/ChatComposer";
import { ErrorBanner } from "../components/ErrorBanner";
import { Spinner } from "../components/Spinner";
import styles from "./HomePage.module.css";

function toError(err: unknown): ApiError | Error {
  if (err instanceof ApiError || err instanceof Error) return err;
  return new Error("Something went wrong.");
}

export function HomePage() {
  const { user, accessToken, logout } = useAuth();
  const navigate = useNavigate();

  const [catalog, setCatalog] = useState<ImageModelsResponse | null>(null);
  const [chats, setChats] = useState<ChatSummaryDto[] | null>(null);
  const [loadError, setLoadError] = useState<Error | null>(null);

  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState<Error | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    const controller = new AbortController();
    Promise.all([
      chatsApi.getImageModels(accessToken, controller.signal),
      chatsApi.listChats(accessToken, controller.signal),
    ])
      .then(([modelsResponse, chatsResponse]) => {
        setCatalog(modelsResponse);
        setChats(chatsResponse.chats);
      })
      .catch((err) => {
        if (!controller.signal.aborted) setLoadError(toError(err));
      });
    return () => controller.abort();
  }, [accessToken]);

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
          <span className={styles.accountName}>{user?.displayName}</span>
          <button type="button" className={styles.logoutButton} onClick={() => void logout()}>
            Log out
          </button>
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
            {startError && (
              <div className={styles.errorSlot}>
                <ErrorBanner error={startError} onDismiss={() => setStartError(null)} />
              </div>
            )}
            <ChatComposer catalog={catalog} onSubmit={handleStartChat} isSubmitting={isStarting} />

            {chats && chats.length > 0 && (
              <div className={styles.grid}>
                {chats.map((chat) => (
                  <ChatCard key={chat.id} chat={chat} onClick={() => navigate(`/chats/${chat.id}`)} />
                ))}
              </div>
            )}

            {chats && chats.length === 0 && (
              <p className={styles.emptyState}>No chats yet - start one above.</p>
            )}
          </>
        )}
      </main>
    </div>
  );
}
