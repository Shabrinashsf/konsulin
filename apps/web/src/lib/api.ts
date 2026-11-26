// The one seam between the UI and the backend: the REST API at /api/v1 (proxied by Vite to :3000 in dev).
import type { ApiErrorBody, Page } from "./types";

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;
  constructor(b: ApiErrorBody) {
    // ValidationPipe sends one message per failed field
    super([b.message].flat().join(", "));
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

// Access token lives in memory only; the refresh token is the httpOnly cookie on /api/v1/auth.
let accessToken: string | null = null;
let refreshing: Promise<unknown> | null = null;
// AuthProvider registers this; called when the session can no longer be refreshed.
let onSessionEnd = () => {};
export const setSessionEndHandler = (fn: () => void) => (onSessionEnd = fn);

/**
 * Refresh tokens rotate and reusing an old one revokes every session, so refreshes never
 * overlap: one in flight per tab (StrictMode, parallel 401s) and one at a time across tabs.
 */
const refresh = () =>
  (refreshing ??= navigator.locks
    .request("konsulin-refresh", () => http("POST", "/auth/refresh"))
    .finally(() => (refreshing = null)));

const NO_RETRY = ["/auth/login", "/auth/register", "/auth/refresh"];

async function http(method: string, url: string, body?: unknown, retry = true): Promise<any> {
  const form = body instanceof FormData;
  const sent = accessToken;
  const res = await fetch(`/api/v1${url}`, {
    method,
    credentials: "include",
    // a reload mid-refresh must not drop the rotated cookie (the old one is already revoked)
    keepalive: url === "/auth/refresh",
    headers: {
      ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
      ...(body !== undefined && !form && { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : form ? body : JSON.stringify(body),
  }).catch(() => {
    throw new ApiError({ statusCode: 0, error: "Network", message: "Server tidak dapat dihubungi" });
  });

  if (res.status === 401 && retry && !NO_RETRY.includes(url)) {
    // another request may already have refreshed; otherwise refresh now
    if (sent === accessToken) await refresh().catch(() => (accessToken = null));
    if (accessToken && accessToken !== sent) return http(method, url, body, false);
    if (!accessToken) onSessionEnd(); // refresh refused: back to login instead of a dead page
  }

  if (res.status === 204) return null;
  const type = res.headers.get("content-type") ?? "";
  if (!type.includes("application/json")) {
    if (!res.ok)
      throw new ApiError({ statusCode: res.status, error: res.statusText, message: "Server tidak dapat dihubungi" });
    return { blob: await res.blob(), filename: filenameOf(res) };
  }
  const json = await res.json();
  if (!res.ok) throw new ApiError(json);
  if (url === "/auth/login" || url === "/auth/refresh") accessToken = json.data.accessToken;
  return json;
}

const filenameOf = (res: Response) => {
  const cd = res.headers.get("content-disposition") ?? "";
  const star = /filename\*=UTF-8''([^;]+)/i.exec(cd)?.[1];
  return star ? decodeURIComponent(star) : (/filename="([^"]+)"/i.exec(cd)?.[1] ?? "download");
};

async function send(method: string, url: string, body?: unknown) {
  // every refresh (app boot included) goes through the single-flight guard
  if (url === "/auth/refresh") return refresh();
  try {
    return await http(method, url, body);
  } finally {
    if (url === "/auth/logout") accessToken = null;
  }
}

/** `{ data }` → data; lists keep `{ data, meta }`. */
const unwrap = (res: any) => (res && "meta" in res ? res : (res?.data ?? null));

/** Every page of a list, for views that group or count on the client (the API caps a page at 100). */
async function listAll<T>(url: string, params?: Params): Promise<Page<T>> {
  const data: T[] = [];
  let totalPages = 1;
  // ponytail: stops at 50 pages (5000 rows); count server-side if a list can grow beyond that
  for (let page = 1; page <= Math.min(totalPages, 50); page++) {
    const res = await send("GET", withQuery(url, { ...params, page, limit: 100 }));
    data.push(...res.data);
    totalPages = res.meta.totalPages;
  }
  return {
    data,
    meta: { page: 1, limit: data.length, total: data.length, totalPages: 1 },
  };
}

export const api = {
  listAll,
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
    // in the document and revoked after the click is handled: Firefox/Safari can drop it otherwise
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
};

export const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : "Terjadi kesalahan";
