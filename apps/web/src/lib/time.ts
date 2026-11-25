// All calendar dates are WIB (Asia/Jakarta), as in the API.
const TZ = "Asia/Jakarta";
const ymd = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const hm = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  hour: "2-digit",
  minute: "2-digit",
});

export const wibDate = (d: Date | string) => ymd.format(new Date(d));
export const wibTime = (d: Date | string) => hm.format(new Date(d));
export const todayWIB = () => wibDate(new Date());
export const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const daysBetween = (a: string, b: string) =>
  Math.round(
    (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000,
  );
/** WIB date + "HH:mm" → ISO instant. */
export const wibIso = (date: string, time: string) =>
  new Date(`${date}T${time}:00+07:00`).toISOString();
export const startOfWibDay = (date: string) =>
  new Date(`${date}T00:00:00+07:00`);

const fmt = (o: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("id-ID", { timeZone: TZ, ...o });
const dDate = fmt({ day: "numeric", month: "short", year: "numeric" });
const dLong = fmt({
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const dDateTime = fmt({
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** Accepts an ISO instant or a WIB "YYYY-MM-DD". */
const parse = (v: string) => (v.length === 10 ? startOfWibDay(v) : new Date(v));
export const fmtDate = (v?: string | null) =>
  v ? dDate.format(parse(v)) : "-";
export const fmtLongDate = (v?: string | null) =>
  v ? dLong.format(parse(v)) : "-";
export const fmtDateTime = (v?: string | null) =>
  v ? `${dDateTime.format(parse(v))} WIB` : "-";
export const fmtRange = (start?: string | null, end?: string | null) =>
  start && end
    ? `${fmtLongDate(start)}, ${wibTime(start)}–${wibTime(end)} WIB`
    : "-";
export const fmtSize = (b: number) =>
  b >= 1_048_576
    ? `${(b / 1_048_576).toFixed(1)} MB`
    : `${Math.max(1, Math.round(b / 1024))} KB`;
