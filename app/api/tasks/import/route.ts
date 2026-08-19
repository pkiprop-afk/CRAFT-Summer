import { NextResponse } from "next/server";
import { saveTasks } from "@/lib/db";
import { parseCsv } from "@/lib/csv";
import { parseXlsxRows } from "@/lib/xlsxParse";
import { validateTaskRows, type TaskImportRow } from "@/lib/taskImport";

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  }

  let rows: TaskImportRow[];
  try {
    if (file.name.toLowerCase().endsWith(".xlsx")) {
      rows = await parseXlsxRows(await file.arrayBuffer());
    } else if (file.name.toLowerCase().endsWith(".csv")) {
      rows = parseCsv(await file.text());
    } else {
      return NextResponse.json(
        { error: "Unsupported file type. Upload a .csv or .xlsx task registry." },
        { status: 400 }
      );
    }
  } catch {
    return NextResponse.json(
      { error: "Could not read that file. It may be corrupt or not a valid CSV/XLSX file." },
      { status: 400 }
    );
  }

  if (rows.length === 0) {
    return NextResponse.json(
      { error: "No rows found in the uploaded file.", importedCount: 0, rejectedCount: 0, totalRows: 0, errors: [] },
      { status: 400 }
    );
  }

  const result = validateTaskRows(rows);

  if (result.importedCount === 0) {
    return NextResponse.json(
      {
        error: "Every row failed validation — the existing task registry was not modified.",
        importedCount: 0,
        rejectedCount: result.rejectedCount,
        totalRows: result.totalRows,
        errors: result.errors,
      },
      { status: 422 }
    );
  }

  await saveTasks(result.tasks);

  return NextResponse.json({
    importedCount: result.importedCount,
    rejectedCount: result.rejectedCount,
    totalRows: result.totalRows,
    errors: result.errors,
    tasks: result.tasks,
  });
}
