import { useCallback, useEffect, useState } from "react";
import { checkBackendHealth, type BackendStatus } from "@/lib/backend-health";

const POLL_INTERVAL_MS = 15_000;

export function useBackendStatus(enabled = true) {
  const [status, setStatus] = useState<BackendStatus>("checking");

  const refresh = useCallback(async () => {
    setStatus("checking");
    const online = await checkBackendHealth();
    setStatus(online ? "online" : "offline");
    return online;
  }, []);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    const run = async () => {
      const online = await checkBackendHealth();
      if (!cancelled) setStatus(online ? "online" : "offline");
    };

    run();
    const interval = window.setInterval(run, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [enabled]);

  return { status, refresh };
}
