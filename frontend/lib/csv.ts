/** Direct port of the old single-purpose frontend's CSV export pattern,
 * generalized to take an arbitrary column list instead of a hardcoded schema. */

export interface CsvColumn {
  key: string;
  label: string;
}

function escapeCsv(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function downloadCsv(
  columns: CsvColumn[],
  rows: Array<Record<string, string | null | undefined>>,
  filenamePrefix: string
): void {
  const header = columns.map((column) => escapeCsv(column.label)).join(",");
  const body = rows
    .map((row) => columns.map((column) => escapeCsv(row[column.key] ?? "")).join(","))
    .join("\n");

  const blob = new Blob([`${header}\n${body}\n`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${filenamePrefix}-${timestampSlug()}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function timestampSlug(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(
    now.getHours()
  )}${pad(now.getMinutes())}`;
}
