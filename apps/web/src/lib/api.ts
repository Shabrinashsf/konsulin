// The one seam between the UI and the backend. Today it calls the in-browser mock (src/mock);
// to use the real API, replace `send` with fetch/axios against `/api/v1` (Bearer token +
// single-flight refresh). Paths, bodies and response shapes stay the same.
import type { ApiErrorBody, Page } from "./types";
import { handle, HttpError } from "../mock/server";

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;
  constructor(b: ApiErrorBody) {
    super(b.message);
    this.status = b.statusCode;
    this.code = b.code;
    this.details = b.details;
  }
}

type Params = Record<string, string | number | boolean | null | undefined>;
const withQuery = (url: string, params?: Params) => {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {}))
    if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  return qs.size ? `${url}?${qs}` : url;
};

async function send(method: string, url: string, body?: unknown): Promise<any> {
  try {
    return await handle(method, url, body);
  } catch (e) {
    throw e instanceof HttpError ? new ApiError(e.body) : e;
  }
}
/** `{ data }` → data; lists keep `{ data, meta }`. */
const unwrap = (res: any) => (res && "meta" in res ? res : (res?.data ?? null));

export const api = {
  get: <T>(url: string, params?: Params): Promise<T> =>
    send("GET", withQuery(url, params)).then(unwrap),
  list: <T>(url: string, params?: Params): Promise<Page<T>> =>
    send("GET", withQuery(url, params)),
  post: <T = unknown>(url: string, body?: unknown): Promise<T> =>
    send("POST", url, body).then(unwrap),
  patch: <T = unknown>(url: string, body?: unknown): Promise<T> =>
    send("PATCH", url, body).then(unwrap),
  del: <T = unknown>(url: string, params?: Params): Promise<T> =>
    send("DELETE", withQuery(url, params)).then(unwrap),
  async download(url: string) {
    const { blob, filename } = await send("GET", url);
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(blob),
      download: filename,
    });
    a.click();
    URL.revokeObjectURL(a.href);
  },
};

export const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : "Terjadi kesalahan";
