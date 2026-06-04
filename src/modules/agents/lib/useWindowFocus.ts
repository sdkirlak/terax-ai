import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";

type AlertFocusSnapshot = {
  windowFocused: boolean;
  documentFocused: boolean;
  documentHidden: boolean;
};

function readDocumentFocus(): Pick<
  AlertFocusSnapshot,
  "documentFocused" | "documentHidden"
> {
  if (typeof document === "undefined") {
    return { documentFocused: true, documentHidden: false };
  }
  return {
    documentFocused: document.hasFocus(),
    documentHidden: document.hidden,
  };
}

export function isWindowForegroundForAlerts({
  windowFocused,
  documentFocused,
  documentHidden,
}: AlertFocusSnapshot): boolean {
  if (documentHidden) return false;
  return windowFocused || documentFocused;
}

export function useWindowFocus(): boolean {
  const [snapshot, setSnapshot] = useState<AlertFocusSnapshot>(() => {
    const docFocus = readDocumentFocus();
    return { ...docFocus, windowFocused: docFocus.documentFocused };
  });

  useEffect(() => {
    let alive = true;
    let unlisten: (() => void) | undefined;

    const syncDocumentFocus = () => {
      setSnapshot((current) => ({ ...current, ...readDocumentFocus() }));
    };
    const setWindowFocused = (windowFocused: boolean) => {
      setSnapshot((current) => ({
        ...current,
        ...readDocumentFocus(),
        windowFocused,
      }));
    };
    const handleWindowFocus = () => setWindowFocused(true);
    const handleWindowBlur = () => setWindowFocused(false);

    const appWindow = getCurrentWindow();
    appWindow
      .isFocused()
      .then((focused) => {
        if (alive) setWindowFocused(focused);
      })
      .catch(() => {});
    appWindow
      .onFocusChanged(({ payload }) => setWindowFocused(payload))
      .then((u) => {
        if (alive) unlisten = u;
        else u();
      })
      .catch(() => {});

    if (typeof document !== "undefined") {
      document.addEventListener("focus", syncDocumentFocus, true);
      document.addEventListener("blur", syncDocumentFocus, true);
      document.addEventListener("visibilitychange", syncDocumentFocus);
    }
    if (typeof window !== "undefined") {
      window.addEventListener("focus", handleWindowFocus);
      window.addEventListener("blur", handleWindowBlur);
    }

    return () => {
      alive = false;
      unlisten?.();
      if (typeof document !== "undefined") {
        document.removeEventListener("focus", syncDocumentFocus, true);
        document.removeEventListener("blur", syncDocumentFocus, true);
        document.removeEventListener("visibilitychange", syncDocumentFocus);
      }
      if (typeof window !== "undefined") {
        window.removeEventListener("focus", handleWindowFocus);
        window.removeEventListener("blur", handleWindowBlur);
      }
    };
  }, []);

  return isWindowForegroundForAlerts(snapshot);
}
