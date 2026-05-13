// Lightweight client-side CSV export. No external deps.

const escapeCell = (value) => {
  if (value === null || value === undefined) return '';
  const s = String(value);
  // Quote-and-double-quote any cell containing comma, quote, newline or carriage return.
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

/**
 * Convert an array of rows + a column schema into a CSV string.
 *
 * @param {Array<object>} rows - source records
 * @param {Array<{ key: string, header: string, value?: (row) => any }>} columns
 *   `key` is just an identifier, `header` is the CSV column name, and optional
 *   `value(row)` lets you derive a cell (defaults to `row[key]`).
 * @returns {string} CSV text with CRLF line endings (Excel-friendly).
 */
export const buildCsv = (rows, columns) => {
  const headerLine = columns.map((c) => escapeCell(c.header)).join(',');
  const dataLines = rows.map((row) =>
    columns
      .map((c) => escapeCell(c.value ? c.value(row) : row[c.key]))
      .join(','),
  );
  return [headerLine, ...dataLines].join('\r\n');
};

/**
 * Trigger a browser download for the given text content.
 *
 * @param {string} filename - desired file name (timestamp typically appended by caller)
 * @param {string} content - file body
 * @param {string} mime - MIME type (default text/csv)
 */
export const downloadFile = (filename, content, mime = 'text/csv;charset=utf-8') => {
  // Prepend BOM so Excel opens UTF-8 cleanly.
  const blob = new Blob(['﻿', content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
};

/** YYYY-MM-DD_HHmm timestamp for filenames. */
export const fileTimestamp = (d = new Date()) => {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `_${pad(d.getHours())}${pad(d.getMinutes())}`
  );
};

/**
 * One-call helper: build CSV from rows + columns and start the download.
 *
 * @param {string} baseName - e.g. 'candidates' → becomes `candidates_2026-05-12_1410.csv`
 * @param {Array<object>} rows
 * @param {Array<{key:string, header:string, value?:(row)=>any}>} columns
 */
export const exportRowsAsCsv = (baseName, rows, columns) => {
  const csv = buildCsv(rows, columns);
  downloadFile(`${baseName}_${fileTimestamp()}.csv`, csv);
};
