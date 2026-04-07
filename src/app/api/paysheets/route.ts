import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sheets = await prisma.paysheet.findMany({
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, createdAt: true, updatedAt: true, _count: { select: { rows: true } } },
  });
  return NextResponse.json(sheets);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, columns } = await req.json();
  const sheet = await prisma.paysheet.create({
    data: { name, columns: JSON.stringify(columns || []) },
  });
  return NextResponse.json(sheet);
}
