import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/payroll?sheetId=xxx
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sheetId = req.nextUrl.searchParams.get("sheetId");
  if (!sheetId) return NextResponse.json({ error: "sheetId required" }, { status: 400 });

  const sheet = await prisma.paysheet.findUnique({ where: { id: sheetId } });
  if (!sheet) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rows = await prisma.payrollRow.findMany({
    where: { paysheetId: sheetId },
    orderBy: { rowOrder: "asc" },
  });

  return NextResponse.json({
    sheet: { ...sheet, columns: JSON.parse(sheet.columns) },
    rows: rows.map((r) => ({ id: r.id, rowOrder: r.rowOrder, ...JSON.parse(r.data) })),
  });
}

// POST /api/payroll — save all rows (bulk upsert)
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { sheetId, columns, rows } = await req.json();
  if (!sheetId) return NextResponse.json({ error: "sheetId required" }, { status: 400 });

  // Update columns if provided
  if (columns) {
    await prisma.paysheet.update({
      where: { id: sheetId },
      data: { columns: JSON.stringify(columns) },
    });
  }

  // Delete existing rows and re-insert
  await prisma.payrollRow.deleteMany({ where: { paysheetId: sheetId } });

  if (rows && rows.length > 0) {
    await prisma.payrollRow.createMany({
      data: rows.map((row: any, idx: number) => {
        const { id: _id, rowOrder: _ro, ...data } = row;
        return {
          paysheetId: sheetId,
          data: JSON.stringify(data),
          rowOrder: idx,
        };
      }),
    });
  }

  return NextResponse.json({ ok: true });
}

// DELETE /api/payroll?sheetId=xxx
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sheetId = req.nextUrl.searchParams.get("sheetId");
  if (!sheetId) return NextResponse.json({ error: "sheetId required" }, { status: 400 });

  await prisma.paysheet.delete({ where: { id: sheetId } });
  return NextResponse.json({ ok: true });
}
