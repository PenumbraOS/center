import { useEffect } from "react";

export function useBeforeUnload(when: boolean) {
  useEffect(() => {
    if (!when) {
      return undefined;
    }

    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handler);
    return () => {
      window.removeEventListener("beforeunload", handler);
    };
  }, [when]);
}
