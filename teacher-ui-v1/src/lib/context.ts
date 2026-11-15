import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import type { Dictionaries, User } from "../types";
export const AppContext = createContext<{
  user: User;
  dicts: Dictionaries;
  toast: (message: string) => void;
}>({
  user: null!,
  dicts: { departments: [], categories: [] },
  toast: () => {},
});
export const useApp = () => useContext(AppContext);
export function useResource<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const ref = useRef(loader);
  ref.current = loader;
  const reload = useCallback(async () => {
    const n = ++seq.current;
    setLoading(true);
    try {
      const result = await ref.current();
      if (n === seq.current) {
        setData(result);
        setError("");
      }
    } catch (e) {
      if (n === seq.current)
        setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      if (n === seq.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    setData(undefined);
    void reload();
    const timer = setInterval(() => {
      if (!document.hidden) void reload();
    }, 30000);
    return () => {
      clearInterval(timer);
      seq.current++;
    };
  }, [reload, ...deps]);
  return { data, error, loading, reload };
}
