import ExcelJS from "exceljs";
import { normalizeHeader, TASK_FIELD_NAMES, type TaskImportRow } from "@/lib/taskImport";

export interface XlsxParseResult {
  rows: TaskImportRow[];
  sheetName: string;
  availableSheets: string[];
}

function cellToText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join("");
    }
    if ("text" in value && typeof value.text === "string") return value.text;
    if (value instanceof Date) return value.toISOString();
    if ("result" in value) return String(value.result ?? "");
  }
  return String(value);
}

function headersOf(worksheet: ExcelJS.Worksheet): string[] {
  const headers: string[] = [];
  worksheet.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber] = cellToText(cell.value).trim();
  });
  return headers;
}

function dataRowCount(worksheet: ExcelJS.Worksheet): number {
  let count = 0;
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1 && row.actualCellCount > 0) count++;
  });
  return count;
}

/**
 * A workbook may hold several sheets (schema docs, starter samples, results).
 * Pick the one that best matches the task field set: most required fields
 * matched, then fewest unrecognized columns, then most data rows.
 */
function pickWorksheet(workbook: ExcelJS.Workbook, requested?: string): ExcelJS.Worksheet | null {
  if (requested) return workbook.getWorksheet(requested) ?? null;

  let best: { sheet: ExcelJS.Worksheet; matched: number; extra: number; rows: number } | null = null;

  for (const sheet of workbook.worksheets) {
    const normalized = headersOf(sheet)
      .filter((h) => h !== undefined)
      .map(normalizeHeader)
      .filter(Boolean);
    const matched = TASK_FIELD_NAMES.filter((f) => normalized.includes(f)).length;
    const extra = normalized.filter((h) => !TASK_FIELD_NAMES.includes(h as never)).length;
    const rows = dataRowCount(sheet);
    if (matched === 0) continue;

    const better =
      !best ||
      matched > best.matched ||
      (matched === best.matched && extra < best.extra) ||
      (matched === best.matched && extra === best.extra && rows > best.rows);
    if (better) best = { sheet, matched, extra, rows };
  }

  return best?.sheet ?? workbook.worksheets[0] ?? null;
}

export async function parseXlsxRows(
  buffer: ArrayBuffer,
  requestedSheet?: string
): Promise<XlsxParseResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const availableSheets = workbook.worksheets.map((w) => w.name);

  const worksheet = pickWorksheet(workbook, requestedSheet);
  if (!worksheet) return { rows: [], sheetName: "", availableSheets };

  const headers = headersOf(worksheet);

  const rows: TaskImportRow[] = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    if (row.actualCellCount === 0) return;
    const record: TaskImportRow = {};
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const key = headers[colNumber];
      if (!key) return;
      record[key] = cellToText(cell.value);
    });
    rows.push(record);
  });

  return { rows, sheetName: worksheet.name, availableSheets };
}
