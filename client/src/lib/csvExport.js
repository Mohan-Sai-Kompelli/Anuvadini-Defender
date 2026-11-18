// Shared client-side CSV export helper. Given an array of row objects and a
// column list (label + accessor), builds a CSV string and triggers a browser
// download — the same approach already used by SpotCheckReport.js and
// Dashboard.js's attendance export, just factored out so every "Export"
// button on the dashboard can produce a REAL file instead of a fake toast.

const csvCell = (value) => {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

export function buildCsv(rows, columns) {
  const header = columns.map((c) => c.label).join(',');
  const body = rows
    .map((row) => columns.map((c) => csvCell(c.get(row))).join(','))
    .join('\n');
  return `${header}\n${body}`;
}

export function downloadCsv(filename, rows, columns) {
  const csv = buildCsv(rows, columns);
  // Leading BOM so Excel opens UTF-8 (e.g. names with diacritics) correctly.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}
