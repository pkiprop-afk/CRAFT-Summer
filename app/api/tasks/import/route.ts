import { NextResponse } from "next/server";
import { getTasks, saveTasks } from "@/lib/db";
import { parseCsv } from "@/lib/csv";
import { parseXlsxRows } from "@/lib/xlsxParse";
import { validateTaskRows, type TaskImportRow } from "@/lib/taskImport";
import { computeTaskDiff, parseImportMode } from "@/lib/taskDiff";

export async function POST(request: Request) {
  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dryRun") === "true";
  const mode = parseImportMode(url.searchParams.get("mode"));
  const requestedSheet = url.searchParams.get("sheet") ?? undefined;

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  }

  let rows: TaskImportRow[];
  let sheetName: string | null = null;
  let availableSheets: string[] = [];

  try {
    if (file.name.toLowerCase().endsWith(".xlsx")) {
      const parsed = await parseXlsxRows(await file.arrayBuffer(), requestedSheet);
      rows = parsed.rows;
      sheetName = parsed.sheetName;
      availableSheets = parsed.availableSheets;
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
      {
        error: "No rows found in the uploaded file.",
        dryRun,
        mode,
        sheetName,
        availableSheets,
        importedCount: 0,
        rejectedCount: 0,
        totalRows: 0,
        errors: [],
      },
      { status: 400 }
    );
  }

  const result = validateTaskRows(rows);
  const existing = await getTasks();
  const { diff, resultingTasks } = computeTaskDiff(existing, result.tasks, mode);

  const report = {
    dryRun,
    mode,
    sheetName,
    availableSheets,
    importedCount: result.importedCount,
    rejectedCount: result.rejectedCount,
    totalRows: result.totalRows,
    errors: result.errors,
    headerNormalizations: result.headerNormalizations,
    domainMappings: result.domainMappings,
    domainMappedCount: result.domainMappedCount,
    constraintReports: result.constraintReports,
    constraintFlaggedCount: result.constraintFlaggedCount,
    ignoredCraftPromptRows: result.ignoredCraftPromptRows,
    diff,
    existingCount: existing.length,
    resultingCount: resultingTasks.length,
  };

  // Dry run: report and diff only, never touch the store.
  if (dryRun) {
    return NextResponse.json({ ...report, written: false, tasks: result.tasks });
  }

  if (result.importedCount === 0) {
    return NextResponse.json(
      {
        ...report,
        error: "Every row failed validation — the existing task registry was not modified.",
        written: false,
      },
      { status: 422 }
    );
  }

  await saveTasks(resultingTasks);

  return NextResponse.json({ ...report, written: true, tasks: resultingTasks });
}
