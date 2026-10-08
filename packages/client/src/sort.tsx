import React, { useMemo, useState } from "react";

/** What a column sorts by: a number or text (missing values always go last). */
export type SortBy<T> = (r: T) => number | string | null | undefined;
export type SortState = { key: string; desc: boolean } | null;

/**
 * Click-to-sort columns for a table: `th(key, label)` renders a header that sorts by `cols[key]` (numbers
 * high to low first unless listed in `asc`, text A to Z first; click again to flip). Rows keep their incoming order until a header is clicked.
 */
export function useSort<T>(rows: T[], cols: Record<string, SortBy<T>>, opts: { init?: SortState; /** columns whose first click sorts low to high (ranks, positions, jersey numbers) */ asc?: string[] } = {}) {
  const [sort, setSort] = useState<SortState>(opts.init ?? null);
  const sorted = useMemo(() => {
    const f = sort && cols[sort.key];
    if (!f) return rows;
    const keyed = rows.map((r, i) => ({ r, i, v: f(r) }));
    keyed.sort((a, b) => {
      const na = a.v == null || a.v === "", nb = b.v == null || b.v === "";
      if (na || nb) return na === nb ? a.i - b.i : na ? 1 : -1;
      const c = typeof a.v === "number" && typeof b.v === "number" ? a.v - b.v : String(a.v).localeCompare(String(b.v));
      return (sort!.desc ? -c : c) || a.i - b.i;
    });
    return keyed.map((x) => x.r);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort]);
  const click = (key: string) => {
    const f = cols[key];
    // The first click on a column sorts numbers high to low and text A to Z.
    const numeric = rows.some((r) => typeof f(r) === "number");
    setSort((s) => (s?.key === key ? { key, desc: !s.desc } : { key, desc: numeric && !opts.asc?.includes(key) }));
  };
  const th = (key: string, label: React.ReactNode, props: React.ThHTMLAttributes<HTMLTableCellElement> = {}) => (
    <th {...props} className={`sortable${sort?.key === key ? " sorted" : ""}${props.className ? ` ${props.className}` : ""}`} onClick={() => click(key)}
      aria-sort={sort?.key === key ? (sort.desc ? "descending" : "ascending") : undefined}>
      {label}{sort?.key === key ? <span className="arrow">{sort.desc ? "▼" : "▲"}</span> : null}
    </th>
  );
  return { rows: sorted, th, sort, setSort };
}

/** One column of a SortTable: its header, its cell (with the row's place in the incoming order) and what it sorts by (no `by`: not sortable). */
export interface Col<T> {
  key: string; label: React.ReactNode; cell: (r: T, i: number) => React.ReactNode; by?: SortBy<T>;
  className?: string; /** the cells' class, when not the header's */ td?: string; title?: string; /** first click sorts low to high */ asc?: boolean;
}

/** A table whose columns sort on click; rows keep their incoming order (and their rank cells) until then. */
export function SortTable<T>({ rows, cols, rowKey, rowClass, className = "grid tight" }: {
  rows: T[]; cols: Col<T>[]; rowKey: (r: T) => React.Key; rowClass?: (r: T) => string | undefined; className?: string;
}) {
  const indexed = useMemo(() => rows.map((r, i) => ({ r, i })), [rows]);
  const by = Object.fromEntries(cols.filter((c) => c.by).map((c) => [c.key, (x: { r: T }) => c.by!(x.r)]));
  const { rows: sorted, th } = useSort(indexed, by, { asc: cols.filter((c) => c.asc).map((c) => c.key) });
  return (
    <table className={className}>
      <thead><tr>{cols.map((c) => (c.by ? <React.Fragment key={c.key}>{th(c.key, c.label, { className: c.className, title: c.title })}</React.Fragment>
        : <th key={c.key} className={c.className} title={c.title}>{c.label}</th>))}</tr></thead>
      <tbody>{sorted.map(({ r, i }) => <tr key={rowKey(r)} className={rowClass?.(r)}>{cols.map((c) => <td key={c.key} className={c.td ?? c.className}>{c.cell(r, i)}</td>)}</tr>)}</tbody>
    </table>
  );
}
