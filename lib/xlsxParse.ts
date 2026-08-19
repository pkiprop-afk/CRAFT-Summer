import ExcelJS from "exceljs";
import type { TaskImportRow } from "@/lib/taskImport";

export async function parseXlsxRows(buffer: ArrayBuffer): Promise<TaskImportRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) return [];

  const headers: string[] = [];
  worksheet.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber] = String(cell.value ?? "").trim();
  });

  const rows: TaskImportRow[] = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const isBlank = row.actualCellCount === 0;
    if (isBlank) return;
    const record: TaskImportRow = {};
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const key = headers[colNumber];
      if (!key) return;
      record[key] = cell.value === null || cell.value === undefined ? "" : String(cell.value);
    });
    rows.push(record);
  });

  return rows;
}
