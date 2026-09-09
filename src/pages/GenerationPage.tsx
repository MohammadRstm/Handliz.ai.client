import { useEffect, useState } from "react";
import { ApiError } from "../api/client";
import { generateImages, getImageModels, refineImage } from "../api/imageGenerationApi";
import type { ChatMessageDto, GenerateImagesParams, GenerateImagesResponse, ImageModelsResponse } from "../api/types";
import { useAuth } from "../auth/useAuth";
import { ErrorBanner } from "../components/ErrorBanner";
import { GenerationForm } from "../components/GenerationForm";
import { ImageChatPanel } from "../components/ImageChatPanel";
import { ResultsGallery, type DisplayedImage } from "../components/ResultsGallery";
import { Spinner } from "../components/Spinner";
import styles from "./GenerationPage.module.css";

interface ImageHistoryState {
  history: ChatMessageDto[];
  historyTruncated: boolean;
}

function toError(err: unknown): ApiError | Error {
  if (err instanceof ApiError || err instanceof Error) return err;
  return new Error("Something went wrong.");
}

export function GenerationPage() {
  const { user, logout } = useAuth();
  const [catalog, setCatalog] = useState<ImageModelsResponse | null>(null);
  const [catalogError, setCatalogError] = useState<Error | null>(null);

  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<ApiError | Error | null>(null);
  const [result, setResult] = useState<GenerateImagesResponse | null>(null);
  const [images, setImages] = useState<DisplayedImage[]>([]);
  const [histories, setHistories] = useState<Record<string, ImageHistoryState>>({});

  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [isRefining, setIsRefining] = useState(false);
  const [refineError, setRefineError] = useState<ApiError | Error | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getImageModels(controller.signal)
      .then(setCatalog)
      .catch((err) => {
        if (!controller.signal.aborted) setCatalogError(toError(err));
      });
    return () => controller.abort();
  }, []);

  const handleGenerate = async (params: GenerateImagesParams) => {
    setIsGenerating(true);
    setGenerateError(null);
    try {
      const response = await generateImages(params);
      setResult(response);
      setImages(
        response.images.map((img) => ({
          imageId: img.imageId,
          index: img.index,
          mimeType: img.mimeType,
          dataUrl: img.dataUrl,
        })),
      );
      setHistories({});
      setSelectedImageId(null);
    } catch (err) {
      setGenerateError(toError(err));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleStartOver = () => {
    setResult(null);
    setImages([]);
    setHistories({});
    setSelectedImageId(null);
    setGenerateError(null);
  };

  const handleSelectImage = (imageId: string) => {
    setSelectedImageId(imageId);
    setRefineError(null);
  };

  const handleRefine = async (instruction: string) => {
    if (!selectedImageId) return;
    setIsRefining(true);
    setRefineError(null);
    try {
      const response = await refineImage({ imageId: selectedImageId, instruction });
      setImages((prev) =>
        prev.map((img) =>
          img.imageId === response.imageId
            ? { ...img, dataUrl: response.dataUrl, mimeType: response.mimeType }
            : img,
        ),
      );
      setHistories((prev) => ({
        ...prev,
        [response.imageId]: { history: response.history, historyTruncated: response.historyTruncated },
      }));
    } catch (err) {
      setRefineError(toError(err));
    } finally {
      setIsRefining(false);
    }
  };

  const selectedImage = images.find((img) => img.imageId === selectedImageId) ?? null;
  const selectedHistory = selectedImageId ? histories[selectedImageId] : undefined;

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
        {catalogError && <ErrorBanner error={catalogError} />}

        {!catalog && !catalogError && (
          <div className={styles.loadingCatalog}>
            <Spinner label="Loading models..." />
          </div>
        )}

        {catalog && !result && (
          <div className={styles.card}>
            {generateError && (
              <div className={styles.errorSlot}>
                <ErrorBanner error={generateError} onDismiss={() => setGenerateError(null)} />
              </div>
            )}
            <GenerationForm catalog={catalog} onSubmit={handleGenerate} isSubmitting={isGenerating} />
          </div>
        )}

        {result && (
          <div className={styles.card}>
            <ResultsGallery
              response={result}
              images={images}
              selectedImageId={selectedImageId}
              onSelectImage={handleSelectImage}
              onStartOver={handleStartOver}
            />
          </div>
        )}
      </main>

      {selectedImage && (
        <ImageChatPanel
          image={selectedImage}
          history={selectedHistory?.history ?? []}
          historyTruncated={selectedHistory?.historyTruncated ?? false}
          isRefining={isRefining}
          error={refineError}
          onSubmit={handleRefine}
          onClose={() => setSelectedImageId(null)}
        />
      )}
    </div>
  );
}
