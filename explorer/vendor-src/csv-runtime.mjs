import Papa from "papaparse";

export function parseDelimited(source, { delimiter = ",", maxRows = 1000, maxColumns = 200 } = {}) {
  const input = String(source);
  if (!input) return { rows: [], totalRows: 0, columnCount: 0, truncatedRows: false, truncatedColumns: false, issue: null };
  const result = Papa.parse(input, { delimiter, dynamicTyping: false });
  const parsedRows = result.data;
  if (/\r?\n$/.test(input) && parsedRows.at(-1)?.length === 1 && parsedRows.at(-1)[0] === "") parsedRows.pop();
  const columnCount = parsedRows.reduce((maximum, row) => Math.max(maximum, row.length), 0);
  const rows = parsedRows.slice(0, maxRows).map((row) => row.slice(0, maxColumns));
  return {
    rows,
    totalRows: parsedRows.length,
    columnCount,
    truncatedRows: parsedRows.length > rows.length,
    truncatedColumns: columnCount > maxColumns,
    issue: result.errors[0]?.message ?? null,
  };
}
