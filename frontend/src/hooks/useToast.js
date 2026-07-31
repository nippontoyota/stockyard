import { useCallback, useEffect, useRef, useState } from "react";

export function useToast(durationMs = 3500) {
  const [message, setMessage] = useState("");
  const timerRef = useRef(null);

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setMessage("");
  }, []);

  const toast = useCallback(
    (msg) => {
      clear();
      setMessage(msg);
      timerRef.current = setTimeout(() => {
        setMessage("");
        timerRef.current = null;
      }, durationMs);
    },
    [clear, durationMs]
  );

  useEffect(() => () => clear(), [clear]);

  return { toastMessage: message, toast, clearToast: clear };
}
