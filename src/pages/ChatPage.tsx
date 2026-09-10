import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import * as chatsApi from "../api/chatsApi";
import { ApiError } from "../api/client";
import type { ChatDetailResponse, GeneratedImageDto } from "../api/chatTypes";
import { useAuth } from "../auth/useAuth";
import { ChatImageTile } from "../components/ChatImageTile";
import { ErrorBanner } from "../components/ErrorBanner";
import { Lightbox, type LightboxItem } from "../components/Lightbox";
import { Spinner } from "../components/Spinner";
import { MAX_INSTRUCTION_LENGTH } from "../constants";
import styles from "./ChatPage.module.css";

function toError(err: unknown): ApiError | Error {
  if (err instanceof ApiError || err instanceof Error) return err;
  return new Error("Something went wrong.");
}

export function ChatPage() {
  const { chatId } = useParams<{ chatId: string }>();
  const { accessToken } = useAuth();

  const [chat, setChat] = useState<ChatDetailResponse | null>(null);
  const [loadError, setLoadError] = useState<Error | null>(null);

  const [images, setImages] = useState<GeneratedImageDto[]>([]);
  const [generatingIndices, setGeneratingIndices] = useState<Set<number>>(new Set());
  const [failedIndices, setFailedIndices] = useState<Set<number>>(new Set());

  const [activeImageId, setActiveImageId] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const [instruction, setInstruction] = useState("");
  const [isRefining, setIsRefining] = useState(false);
  const [refineError, setRefineError] = useState<Error | null>(null);

  const kickedOffForChatId = useRef<string | null>(null);

  const generateIndex = useCallback(
    (targetChatId: string, index: number) => {
      if (!accessToken) return;
      setFailedIndices((prev) => {
        const next = new Set(prev);
        next.delete(index);
        return next;
      });
      setGeneratingIndices((prev) => new Set(prev).add(index));

      chatsApi
        .generateChatImage(targetChatId, index, accessToken)
        .then((dto) => {
          setImages((prev) => [...prev.filter((img) => img.index !== index), dto].sort((a, b) => a.index - b.index));
        })
        .catch(() => {
          setFailedIndices((prev) => new Set(prev).add(index));
        })
        .finally(() => {
          setGeneratingIndices((prev) => {
            const next = new Set(prev);
            next.delete(index);
            return next;
          });
        });
    },
    [accessToken],
  );

  // Load the chat, then kick off generation for any slot that doesn't have an image yet -
  // this covers both a freshly-started chat (every slot missing) and reopening one where a
  // prior attempt failed. Guarded so React StrictMode's double-invoke (or a re-render)
  // never fires the same chat's generation twice.
  useEffect(() => {
    if (!chatId || !accessToken) return;
    let cancelled = false;

    chatsApi
      .getChat(chatId, accessToken)
      .then((response) => {
        if (cancelled) return;
        setChat(response);
        setImages(response.images);

        if (kickedOffForChatId.current !== chatId) {
          kickedOffForChatId.current = chatId;
          const presentIndices = new Set(response.images.map((img) => img.index));
          for (let i = 0; i < response.requestedImageCount; i++) {
            if (!presentIndices.has(i)) {
              generateIndex(chatId, i);
            }
          }
        }
      })
      .catch((err) => {
        if (!cancelled) setLoadError(toError(err));
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, accessToken]);

  const lightboxItems: LightboxItem[] = useMemo(() => {
    const generatedItems: LightboxItem[] = images
      .slice()
      .sort((a, b) => a.index - b.index)
      .map((img) => ({ id: img.imageId, dataUrl: img.dataUrl, label: `Generated image ${img.index + 1}` }));
    const referenceItems: LightboxItem[] =
      chat?.referenceImages.map((ref) => ({
        id: `reference-${ref.index}`,
        dataUrl: ref.dataUrl,
        label: `Reference photo ${ref.index + 1}`,
      })) ?? [];
    return [...generatedItems, ...referenceItems];
  }, [images, chat]);

  const openLightbox = (itemId: string, isGenerated: boolean) => {
    const index = lightboxItems.findIndex((item) => item.id === itemId);
    if (index === -1) return;
    setLightboxIndex(index);
    setActiveImageId(isGenerated ? itemId : null);
  };

  const handleLightboxNavigate = (index: number) => {
    setLightboxIndex(index);
    const item = lightboxItems[index];
    const isGenerated = item && !item.id.startsWith("reference-");
    setActiveImageId(isGenerated ? item.id : null);
  };

  const handleRefine = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!activeImageId || !instruction.trim() || !accessToken || isRefining) return;

    setIsRefining(true);
    setRefineError(null);
    try {
      const response = await chatsApi.refineImage(activeImageId, instruction.trim(), accessToken);
      setImages((prev) =>
        prev.map((img) => (img.imageId === response.imageId ? { ...img, dataUrl: response.dataUrl, mimeType: response.mimeType } : img)),
      );
      setInstruction("");
    } catch (err) {
      setRefineError(toError(err));
    } finally {
      setIsRefining(false);
    }
  };

  if (loadError) {
    return (
      <div className={styles.page}>
        <div className={styles.errorWrap}>
          <ErrorBanner error={loadError} />
          <Link to="/" className={styles.backLink}>
            ← Back to chats
          </Link>
        </div>
      </div>
    );
  }

  if (!chat) {
    return (
      <div className={styles.loadingPage}>
        <Spinner label="Loading chat..." />
      </div>
    );
  }

  const activeImage = images.find((img) => img.imageId === activeImageId);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link to="/" className={styles.backLink}>
          ← Chats
        </Link>
        <h1 className={styles.title}>{chat.location}</h1>
        <div className={styles.summary}>
          {chat.model.displayName} · {chat.imageSize} · {chat.aspectRatio} · {chat.timeOfDay} · {chat.weather}
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.grid}>
          {Array.from({ length: chat.requestedImageCount }, (_, index) => {
            const image = images.find((img) => img.index === index);
            if (image) {
              return (
                <ChatImageTile
                  key={`generated-${index}`}
                  status="loaded"
                  dataUrl={image.dataUrl}
                  label={`Generated image ${index + 1}`}
                  isSelected={activeImageId === image.imageId}
                  onClick={() => openLightbox(image.imageId, true)}
                />
              );
            }
            if (failedIndices.has(index)) {
              return (
                <ChatImageTile
                  key={`generated-${index}`}
                  status="failed"
                  label={`Image ${index + 1}`}
                  onRetry={() => chatId && generateIndex(chatId, index)}
                />
              );
            }
            return <ChatImageTile key={`generated-${index}`} status="loading" label={`Image ${index + 1}`} />;
          })}

          {chat.referenceImages.map((ref) => (
            <ChatImageTile
              key={`reference-${ref.index}`}
              status="loaded"
              dataUrl={ref.dataUrl}
              label={`Reference photo ${ref.index + 1}`}
              onClick={() => openLightbox(`reference-${ref.index}`, false)}
            />
          ))}
        </div>

        {generatingIndices.size === 0 && images.length > 0 && (
          <form className={styles.refineBar} onSubmit={handleRefine}>
            <div className={styles.refineTarget}>
              {activeImage
                ? `Refining image ${activeImage.index + 1}`
                : "Click a generated image above to refine it"}
            </div>
            <div className={styles.refineInputRow}>
              <input
                type="text"
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder="Describe a change..."
                maxLength={MAX_INSTRUCTION_LENGTH}
                disabled={!activeImageId || isRefining}
                className={styles.refineInput}
              />

              <div className={styles.lockedDropdown} title="Locked for this chat">
                {chat.model.displayName}
              </div>
              <div className={styles.lockedDropdown} title="Locked for this chat">
                {chat.aspectRatio} · {chat.imageSize}
              </div>

              <button type="submit" className={styles.sendButton} disabled={!activeImageId || !instruction.trim() || isRefining}>
                {isRefining ? <Spinner /> : "Send"}
              </button>
            </div>
            {refineError && <ErrorBanner error={refineError} onDismiss={() => setRefineError(null)} />}
          </form>
        )}
      </main>

      {lightboxIndex !== null && (
        <Lightbox
          items={lightboxItems}
          activeIndex={lightboxIndex}
          onNavigate={handleLightboxNavigate}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  );
}
