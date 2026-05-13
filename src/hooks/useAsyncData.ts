import { useCallback, useEffect, useState } from "react";
import { getErrorMessage } from "@/utils/errors";

export function useAsyncData<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const next = await loader();
      setData(next);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, deps);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, loading, error, reload };
}
