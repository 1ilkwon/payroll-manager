import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import ExcelJS from "exceljs";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sheetId = req.nextUrl.searchParams.get("sheetId");
  if (!sheetId) return NextResponse.json({ error: "sheetId required" }, { status: 400 });

  const sheet = await prisma.paysheet.findUnique({ where: { id: sheetId } });
  if (!sheet) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const columns: { key: string; label: string }[] = JSON.parse(sheet.columns);
  const rows = await prisma.payrollRow.findMany({
    where: { paysheetId: sheetId },
    orderBy: { rowOrder: "asc" },
  });

  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet(sheet.name);

  // Header
  ws.addRow(columns.map((c) => c.label));
  // Style header
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
    cell.border = {
      bottom: { style: "thin" },
    };
  });

  // Data
  for (const row of rows) {
    const data = JSON.parse(row.data);
    ws.addRow(columns.map((c) => data[c.key] ?? ""));
  }

  // Auto width
  ws.columns.forEach((col) => {
    let maxLen = 10;
    col.eachCell?.((cell) => {
      const len = String(cell.value || "").length;
      if (len > maxLen) maxLen = len;
    });
    col.width = Math.min(maxLen + 2, 40);
  });

  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(sheet.name)}.xlsx"`,
    },
  });
}
