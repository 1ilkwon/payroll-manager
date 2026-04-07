import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import ExcelJS from "exceljs";

function cellToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toLocaleDateString("ko-KR");
  // RichText
  if (typeof value === "object" && "richText" in value) {
    return (value as ExcelJS.CellRichTextValue).richText.map((r) => r.text).join("");
  }
  // Formula
  if (typeof value === "object" && "result" in value) {
    return cellToString((value as ExcelJS.CellFormulaValue).result as ExcelJS.CellValue);
  }
  // Hyperlink
  if (typeof value === "object" && "text" in value) {
    return String((value as any).text);
  }
  return String(value);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

    const arrayBuf = await file.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuf as any);

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      return NextResponse.json({ error: "Empty sheet" }, { status: 400 });
    }

    // Detect actual column count from header row
    const headerRow = worksheet.getRow(1);
    const actualColCount = headerRow.actualCellCount;
    const colCount = Math.max(headerRow.cellCount, actualColCount);

    if (colCount === 0) {
      return NextResponse.json({ error: "No columns found" }, { status: 400 });
    }

    // Build columns from header - use cellCount to include empty cells in between
    const columns: { key: string; label: string; type: string }[] = [];
    for (let c = 1; c <= colCount; c++) {
      const cell = headerRow.getCell(c);
      const label = cellToString(cell.value).trim() || `컬럼${c}`;
      columns.push({ key: `col_${c}`, label, type: "text" });
    }

    // Data rows
    const rows: Record<string, any>[] = [];
    const rowCount = worksheet.actualRowCount || worksheet.rowCount;

    for (let i = 2; i <= rowCount; i++) {
      const row = worksheet.getRow(i);
      const rowData: Record<string, any> = {};
      let hasValue = false;

      for (let c = 1; c <= colCount; c++) {
        const cell = row.getCell(c);
        const str = cellToString(cell.value);
        if (str !== "") hasValue = true;
        rowData[`col_${c}`] = str;
      }

      if (hasValue) rows.push(rowData);
    }

    return NextResponse.json({ columns, rows });
  } catch (err: any) {
    console.error("Excel import error:", err);
    return NextResponse.json({ error: err.message || "Import failed" }, { status: 500 });
  }
}
