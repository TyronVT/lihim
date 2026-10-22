"use client";

import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./icons";

export type SortDirection = "ascending" | "descending";
export interface SortState {
  key: string;
  direction: SortDirection;
}

export interface DataTableColumn<T> {
  key: string;
  /** Header text. Always give one, even for an actions column (hide it with `headerHidden`). */
  header: ReactNode;
  cell: (row: T, index: number) => ReactNode;
  /** Makes the column sortable (header button + aria-sort). Return a string or number. */
  sortValue?: (row: T) => string | number;
  align?: "start" | "end";
  /** CSS width, e.g. "40%" or "4rem". */
  width?: string;
  /** Visually hide the header text (the `⋯` column); it stays for screen readers. */
  headerHidden?: boolean;
  /** Extra classes for this column's cells (td). */
  className?: string;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Table caption: what the table lists. Visually hidden unless `captionVisible`. */
  caption: ReactNode;
  captionVisible?: boolean;
  /** Controlled sort. Omit both for uncontrolled sorting from `defaultSort`. */
  sort?: SortState | null;
  onSortChange?: (sort: SortState) => void;
  defaultSort?: SortState | null;
  /**
   * Scroll inside the panel past this height (L9: "scrolls inside its panel past 20 rows"),
   * with the header sticky inside it. Omit to let the page scroll (header sticks to the viewport top).
   */
  maxHeight?: string;
  /** Shown in a single full-width row when `rows` is empty. */
  empty?: ReactNode;
  /** Monospace + tabular body (L9 receipts). */
  mono?: boolean;
  className?: string;
}

/**
 * Table with column headers for the L4 roster and L9 answers at ≥ lg (lihim-UIUX-SPEC.md §3:
 * "Lists → Table with column headers"). Sortable headers are buttons with `aria-sort` on the
 * <th>; the header row is sticky; rows get a --surface-raised hover (120 ms) and carry
 * `group/row`, so an actions cell can use REVEAL_ON_ROW_HOVER (components/shell-classes.ts).
 * No avatars or initials anywhere (design rule).
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  captionVisible,
  sort: sortProp,
  onSortChange,
  defaultSort = null,
  maxHeight,
  empty,
  mono,
  className,
}: DataTableProps<T>) {
  const [innerSort, setInnerSort] = useState<SortState | null>(defaultSort);
  const sort = sortProp !== undefined ? sortProp : innerSort;

  const sorted = useMemo(() => {
    const col = sort && columns.find((c) => c.key === sort.key);
    if (!sort || !col?.sortValue) return rows;
    const value = col.sortValue;
    const dir = sort.direction === "ascending" ? 1 : -1;
    return rows.slice().sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "en-PH");
      return cmp * dir;
    });
  }, [rows, columns, sort]);

  const toggle = (key: string) => {
    const next: SortState = {
      key,
      direction: sort?.key === key && sort.direction === "ascending" ? "descending" : "ascending",
    };
    if (sortProp === undefined) setInnerSort(next);
    onSortChange?.(next);
  };

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-surface shadow-raised",
        // clip (not hidden) keeps the sticky header working against the page scroll.
        maxHeight ? "overflow-auto" : "overflow-clip",
        className,
      )}
      style={maxHeight ? { maxHeight } : undefined}
      // A scrollable panel must be reachable by keyboard to scroll it.
      tabIndex={maxHeight ? 0 : undefined}
    >
      <table className={cn("w-full border-separate border-spacing-0 text-left", mono && "font-mono tabular")}>
        <caption className={cn(captionVisible ? "px-4 pt-3 pb-2 text-left font-sans text-caption text-text-3" : "sr-only")}>{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => {
              const active = sort?.key === c.key;
              const ariaSort = c.sortValue ? (active ? sort!.direction : "none") : undefined;
              return (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={ariaSort}
                  style={c.width ? { width: c.width } : undefined}
                  className={cn(
                    "sticky top-0 z-10 h-11 border-b border-border bg-surface px-4 font-sans text-overline font-medium text-text-3 uppercase",
                    c.align === "end" && "text-right",
                  )}
                >
                  {c.sortValue ? (
                    <button
                      type="button"
                      onClick={() => toggle(c.key)}
                      className={cn(
                        "-mx-2 inline-flex min-h-9 items-center gap-1 rounded-sm px-2 uppercase transition-colors duration-fast hover:text-text-1",
                        active && "text-text-1",
                      )}
                    >
                      {c.header}
                      <Icon
                        icon={active ? (sort!.direction === "ascending" ? ArrowUp : ArrowDown) : ChevronsUpDown}
                        size={14}
                        className="shrink-0"
                      />
                    </button>
                  ) : (
                    <span className={cn(c.headerHidden && "sr-only")}>{c.header}</span>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 && empty ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-6 text-center font-sans text-body text-text-2">
                {empty}
              </td>
            </tr>
          ) : (
            sorted.map((row, i) => (
              <tr key={rowKey(row)} className="group/row transition-colors duration-fast hover:bg-surface-raised">
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      // 56 px rows whether or not a 48 px control (⋯, hash chip) sits in them.
                      "h-14 border-b border-border px-4 py-1 align-middle text-body text-text-1 group-last/row:border-b-0",
                      mono ? "text-mono" : "font-sans",
                      c.align === "end" && "text-right",
                      c.className,
                    )}
                  >
                    {c.cell(row, i)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
