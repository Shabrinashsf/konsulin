import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "../components/ui";
import { errorMessage } from "./api";

/** Mutation + toast. Errors show as a toast unless `onError` handles them. */
export function useAction<V = void, R = unknown>(
  fn: (v: V) => Promise<R>,
  opts: {
    success?: string;
    onDone?: (r: R) => void;
    onError?: (e: unknown) => boolean | void;
  } = {},
) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r) => {
      qc.invalidateQueries();
      if (opts.success) toast({ tone: "success", title: opts.success });
      opts.onDone?.(r);
    },
    onError: (e) => {
      if (!opts.onError?.(e))
        toast({ tone: "danger", title: errorMessage(e) });
    },
  });
}
