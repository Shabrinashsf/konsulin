// Components styled after tracer-study-web (its real mids.css / mids.light.css).
import {
  createContext,
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router";

const cx = (...c: (string | false | null | undefined)[]) =>
  c.filter(Boolean).join(" ");

export const Icon = ({
  name,
  fill,
  className,
}: {
  name: string;
  fill?: boolean;
  className?: string;
}) => (
  <span
    aria-hidden
    className={cx("icon", fill && "icon-fill", className ?? "text-[20px]")}
  >
    {name}
  </span>
);
/** tracer's 60px bordered icon box (Beranda cards). */
export const IconBox = ({
  icon,
  className,
}: {
  icon: string;
  className?: string;
}) => (
  <span
    className={cx(
      "flex size-[60px] shrink-0 items-center justify-center rounded-md border border-border",
      className,
    )}
  >
    <Icon name={icon} fill className="text-[36px] text-primary" />
  </span>
);

// ---------- Button (.btn) ----------
type BtnStyle =
  | "primary"
  | "secondary"
  | "subtle"
  | "outline"
  | "danger"
  | "ghost"
  | "subtle-danger"
  | "shadow";
const btnStyle: Record<BtnStyle, string> = {
  primary:
    "border-primary bg-primary text-fg-inverse hover:border-primary-hover hover:bg-primary-hover",
  secondary: "border-border bg-surface text-fg hover:bg-surface-muted", // tracer default .btn
  subtle:
    "border-primary-subtle bg-primary-subtle text-primary hover:border-primary-line hover:bg-primary-line hover:text-primary-hover",
  outline: "border-primary text-primary hover:bg-primary-soft",
  danger:
    "border-danger bg-danger text-fg-inverse hover:border-danger-hover hover:bg-danger-hover",
  ghost: "border-transparent text-primary hover:bg-primary-soft", // .btn-shadow-primary
  "subtle-danger":
    "border-danger-subtle bg-danger-subtle text-danger hover:border-danger-line hover:bg-danger-line",
  shadow: "border-transparent text-fg hover:bg-surface-muted", // .btn-shadow-dark
};
const btnSize = {
  sm: "min-h-10 px-4 gap-1.5",
  md: "min-h-[46px] px-5 gap-2",
  lg: "min-h-14 px-5 gap-2 text-[15px]",
};
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: BtnStyle;
  size?: keyof typeof btnSize;
  icon?: string;
  loading?: boolean;
};
export function Button({
  variant = "primary",
  size = "md",
  icon,
  loading,
  className,
  children,
  disabled,
  ...rest
}: BtnProps) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || loading}
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-md border text-sm font-medium whitespace-nowrap transition disabled:pointer-events-none disabled:opacity-60",
        btnStyle[variant],
        btnSize[size],
        className,
      )}
    >
      {loading ? <Spinner /> : icon && <Icon name={icon} />}
      {children}
    </button>
  );
}
/** .btn-icon: square, same radius as Button. */
export function IconButton({
  icon,
  label,
  variant = "shadow",
  size = "md",
  fill,
  className,
  ...rest
}: Omit<BtnProps, "children"> & {
  icon: string;
  label: string;
  fill?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...rest}
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-md border transition disabled:opacity-60",
        btnStyle[variant],
        size === "sm" ? "size-10" : "size-[46px]",
        className,
      )}
    >
      <Icon
        name={icon}
        fill={fill}
        className={size === "sm" ? "text-[20px]" : "text-[24px]"}
      />
    </button>
  );
}
export const Spinner = () => (
  <span className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" />
);

// ---------- Badge (.badge-subtle-*) ----------
export type Tone =
  | "primary"
  | "navy"
  | "success"
  | "danger"
  | "warning"
  | "info"
  | "secondary"
  | "orange";
const subtle: Record<Tone, string> = {
  primary: "bg-primary-subtle text-primary",
  navy: "bg-purple-subtle text-purple",
  success: "bg-success-subtle text-success",
  danger: "bg-danger-subtle text-danger",
  warning: "bg-warning-subtle text-warning",
  info: "bg-info-subtle text-info",
  secondary: "bg-secondary-subtle text-fg-muted",
  orange: "bg-orange-subtle text-orange",
};
export const Badge = ({
  tone = "primary",
  icon,
  children,
}: {
  tone?: Tone;
  icon?: string;
  children: ReactNode;
}) => (
  <span
    className={cx(
      "inline-flex items-center gap-1 rounded-sm px-2.5 py-[5px] text-xs leading-none font-semibold whitespace-nowrap",
      subtle[tone],
    )}
  >
    {icon && <Icon name={icon} fill className="text-[14px]" />}
    {children}
  </span>
);

// ---------- Alert (.alert-*) ----------
const alertTone = {
  info: ["bg-primary-subtle border-primary-line", "text-primary", "info"],
  success: [
    "bg-success-subtle border-success-line",
    "text-success",
    "check_circle",
  ],
  warning: ["bg-warning-subtle border-warning-line", "text-warning", "warning"],
  danger: ["bg-danger-subtle border-danger-line", "text-danger", "error"],
} as const;
export function Alert({
  tone = "info",
  title,
  children,
}: {
  tone?: keyof typeof alertTone;
  title?: string;
  children?: ReactNode;
}) {
  const [box, fg, icon] = alertTone[tone];
  return (
    <div
      role="alert"
      className={cx(
        "flex gap-3 rounded-md border-2 px-5 py-[15px] text-fg",
        box,
      )}
    >
      <Icon name={icon} fill className={cx("text-[22px]", fg)} />
      <div className="min-w-0 flex-1">
        {title && <p className="mb-0.5 text-title-sub font-medium">{title}</p>}
        {children && <div>{children}</div>}
      </div>
    </div>
  );
}

// ---------- Card (.card) ----------
export const Card = ({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) => <div className={cx("card p-5", className)}>{children}</div>;

// ---------- Form (.form-floating) ----------
/** Floating-label field: the label sits inside the control, as tracer's form-floating. */
export function Field({
  label,
  error,
  hint,
  required,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="relative block [&>*]:w-full [&>input]:h-[58px] [&>input]:pt-6 [&>select]:h-[58px] [&>select]:pt-6 [&>textarea]:pt-7">
        {children}
        <span
          className={cx(
            "pointer-events-none absolute top-2 left-[11px] text-xs",
            error ? "text-danger" : "text-fg-muted",
          )}
        >
          {label}
          {required && <span className="text-danger"> *</span>}
        </span>
      </label>
      {(error || hint) && (
        <span
          className={cx(
            "px-1 text-xs",
            error ? "text-danger" : "text-fg-muted",
          )}
        >
          {error || hint}
        </span>
      )}
    </div>
  );
}
const control =
  "min-w-0 rounded-md border border-border bg-surface px-2.5 text-sm text-fg outline-none transition placeholder:text-fg-muted focus:border-primary disabled:opacity-60";
export const Input = ({
  className,
  ...p
}: InputHTMLAttributes<HTMLInputElement>) => (
  <input {...p} className={cx(control, "h-[46px] pr-3", className)} />
);
export const Textarea = ({
  className,
  ...p
}: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea
    rows={3}
    {...p}
    className={cx(control, "min-h-[100px] resize-y py-2.5", className)}
  />
);
export const Select = ({
  children,
  className,
  ...p
}: SelectHTMLAttributes<HTMLSelectElement>) => (
  <select {...p} className={cx(control, "select h-[46px]", className)}>
    {children}
  </select>
);
export const Check = ({
  label,
  ...p
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) => (
  <label className="inline-flex items-center gap-2">
    <input type="checkbox" {...p} className="size-4 accent-primary" />
    {label}
  </label>
);

// ---------- Chip (.chip.chip-primary.chip-check) & Tabs (.nav-line) ----------
export const Chip = ({
  active,
  children,
  onClick,
}: {
  active?: boolean;
  children: ReactNode;
  onClick?: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={cx(
      "inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm font-medium transition",
      active
        ? "border-primary-subtle bg-primary-subtle text-primary"
        : "border-border bg-surface text-fg hover:bg-surface-muted",
    )}
  >
    {active && <Icon name="check" className="-ml-0.5 text-[18px]" />}
    {children}
  </button>
);
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: T; label: string; count?: number }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div
      role="tablist"
      className="no-scrollbar flex gap-5 overflow-x-auto shadow-[inset_0_-2px_0_var(--color-border)]"
    >
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={t.id === value}
          onClick={() => onChange(t.id)}
          className={cx(
            "shrink-0 border-b-2 py-2 text-sm font-medium whitespace-nowrap transition",
            t.id === value
              ? "border-primary text-fg"
              : "border-transparent text-fg-soft hover:text-fg",
          )}
        >
          {t.label}
          {t.count !== undefined && (
            <span className="ml-1.5 rounded-sm bg-secondary-subtle px-1.5 py-0.5 text-xs text-fg-soft">
              {t.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// ---------- Modal (.modal-content.bd-0) ----------
export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-dark/50 p-4 sm:pt-[8vh]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal
        aria-label={title}
        className={cx(
          "w-full rounded-xl bg-surface",
          wide ? "max-w-2xl" : "max-w-lg",
        )}
      >
        <div className="flex items-center gap-3 px-5 pt-5 pr-4">
          <h2 className="flex-1 text-title-section font-medium">{title}</h2>
          <IconButton icon="close" label="Tutup" size="sm" onClick={onClose} />
        </div>
        <div className="flex flex-col gap-4 px-5 py-4">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 px-5 pb-5">{footer}</div>
        )}
      </div>
    </div>
  );
}

// ---------- Toast (.toast.toast-*) ----------
type ToastMsg = {
  id: number;
  tone: "success" | "danger" | "info" | "warning";
  title: string;
  text?: string;
};
const ToastCtx = createContext<(t: Omit<ToastMsg, "id">) => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastMsg[]>([]);
  const push = useCallback((t: Omit<ToastMsg, "id">) => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { ...t, id }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 5000);
  }, []);
  const color = {
    success: ["text-success", "check_circle"],
    danger: ["text-danger", "error"],
    info: ["text-primary", "info"],
    warning: ["text-warning", "warning"],
  } as const;
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed top-[70px] right-4 z-50 flex w-[350px] max-w-[calc(100vw-2rem)] flex-col gap-3">
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            className="pointer-events-auto relative rounded-xl bg-surface py-4 pr-10 pl-12 shadow-overlay"
          >
            <Icon
              name={color[t.tone][1]}
              fill
              className={cx(
                "absolute top-4 left-4 text-[24px]",
                color[t.tone][0],
              )}
            />
            <p className="font-medium">{t.title}</p>
            {t.text && <p className="text-[13px] text-fg-muted">{t.text}</p>}
            <button
              aria-label="Tutup"
              className="absolute top-4 right-4 text-fg-muted hover:text-fg-soft"
              onClick={() => setItems((x) => x.filter((i) => i.id !== t.id))}
            >
              <Icon name="close" />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ---------- Page header: back + title live in the top bar, as tracer's content header ----------
export const HeaderSlot = createContext<HTMLElement | null>(null);
export function PageHeader({
  title,
  subtitle,
  back,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  back?: string;
  actions?: ReactNode;
}) {
  const nav = useNavigate();
  const slot = useContext(HeaderSlot);
  const head = (
    <div className="flex min-w-0 items-center gap-1">
      {back && (
        <IconButton
          icon="arrow_back"
          label="Kembali"
          fill
          onClick={() => nav(back)}
        />
      )}
      <h1 className="truncate text-title-page font-medium">{title}</h1>
    </div>
  );
  return (
    <>
      {slot ? createPortal(head, slot) : head}
      {(subtitle || actions) && (
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1 text-fg-muted">{subtitle}</div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      )}
    </>
  );
}
export const Empty = ({
  icon = "inbox",
  title,
  children,
}: {
  icon?: string;
  title: string;
  children?: ReactNode;
}) => (
  <div className="flex flex-col items-center gap-3 py-10 text-center">
    <IconBox icon={icon} />
    <p className="text-title-sub font-medium">{title}</p>
    {children && <div className="max-w-sm text-fg-muted">{children}</div>}
  </div>
);
export const Loading = () => (
  <div className="flex justify-center py-10 text-primary">
    <Spinner />
  </div>
);
export const Avatar = ({
  name,
  className,
}: {
  name: string;
  className?: string;
}) => (
  <span
    className={cx(
      "inline-flex size-[30px] shrink-0 items-center justify-center rounded-full border border-border bg-primary-soft text-xs font-semibold text-primary",
      className,
    )}
  >
    {name
      .replace(/^(Dr|Prof)\.?\s*/i, "")
      .split(" ")
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase()}
  </span>
);
/** Pagination: range text, optional page-size select, ‹ 1 … 4 5 6 … 20 ›. */
export function Pager({
  meta,
  onPage,
  limit,
  onLimit,
  sizes = [10, 20, 50, 100],
}: {
  meta?: { page: number; limit?: number; totalPages: number; total: number };
  onPage: (p: number) => void;
  /** With onLimit, shows "Tampilkan N data"; the caller resets to page 1. */
  limit?: number;
  onLimit?: (n: number) => void;
  sizes?: number[];
}) {
  // one page still shows the footer (total + disabled controls); only an empty list hides it
  if (!meta || meta.total === 0) return null;
  const { page, totalPages, total } = meta;
  const size = limit ?? meta.limit ?? total;
  const from = (page - 1) * size + 1;
  const to = Math.min(page * size, total);
  const pages = [
    ...new Set([1, page - 1, page, page + 1, totalPages]),
  ].filter((n) => n >= 1 && n <= totalPages).sort((x, y) => x - y);
  const nav = (icon: string, label: string, target: number, off: boolean) => (
    <IconButton
      icon={icon}
      label={label}
      size="sm"
      variant="secondary"
      disabled={off}
      onClick={() => onPage(target)}
    />
  );
  return (
    <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 px-2 pt-3">
      <div className="mr-auto flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-fg-muted">
        {onLimit && (
          <label className="flex items-center gap-2">
            Tampilkan
            <Select
              className="h-10! w-auto min-w-[76px] py-0"
              value={limit}
              onChange={(e) => onLimit(Number(e.target.value))}
            >
              {sizes.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
            data
          </label>
        )}
        <span>
          {from}–{to} dari {total} data
        </span>
      </div>
      <div className="flex items-center gap-2">
        {nav("chevron_backward", "Sebelumnya", page - 1, page <= 1)}
        {pages.map((n, i) => (
          <Fragment key={n}>
            {i > 0 && n - pages[i - 1] > 1 && (
              <span className="px-1 text-fg-muted">…</span>
            )}
            {n === page ? (
              <span className="flex size-10 items-center justify-center rounded-md bg-primary font-medium text-fg-inverse">
                {n}
              </span>
            ) : (
              <button
                type="button"
                aria-label={`Halaman ${n}`}
                onClick={() => onPage(n)}
                className={cx(
                  "inline-flex size-10 items-center justify-center rounded-md border font-medium transition",
                  btnStyle.secondary,
                )}
              >
                {n}
              </button>
            )}
          </Fragment>
        ))}
        {nav("chevron_forward", "Berikutnya", page + 1, page >= totalPages)}
      </div>
    </div>
  );
}
export const Table = ({
  head,
  children,
}: {
  head: string[];
  children: ReactNode;
}) => (
  <div className="overflow-x-auto">
    <table className="w-full text-left">
      {head.length > 0 && (
        <thead>
          <tr>
            {head.map((h) => (
              <th
                key={h}
                className="border-b border-border p-4 text-sm font-semibold whitespace-nowrap"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
      )}
      <tbody className="[&_td]:border-b [&_td]:border-border [&_td]:p-4 [&_tr:hover]:bg-surface-muted">
        {children}
      </tbody>
    </table>
  </div>
);

/**
 * Confirmation step before anything destructive or hard to undo.
 * The confirm button says exactly what happens ("Hapus feedback"), never just "OK".
 */
export function ConfirmDialog({ open, title, children, confirmLabel, tone = "danger", loading, onConfirm, onClose }: {
  open: boolean; title: string; children: ReactNode; confirmLabel: string;
  tone?: "danger" | "warning"; loading?: boolean; onConfirm: () => void; onClose: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Batal</Button>
        <Button variant={tone === "danger" ? "danger" : "primary"} loading={loading} onClick={onConfirm}>{confirmLabel}</Button>
      </>}>
      <div className="flex gap-3">
        <span className={cx("flex size-11 shrink-0 items-center justify-center rounded-full", tone === "danger" ? "bg-danger-subtle text-danger" : "bg-warning-subtle text-warning")}>
          <Icon name={tone === "danger" ? "delete" : "warning"} fill className="text-[24px]" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-2 pt-1">{children}</div>
      </div>
    </Modal>
  );
}
