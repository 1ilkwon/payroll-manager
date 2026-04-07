"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface PaysheetSummary {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  _count: { rows: number };
}

export default function HomePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [sheets, setSheets] = useState<PaysheetSummary[]>([]);
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated") fetchSheets();
  }, [status]);

  const fetchSheets = async () => {
    const res = await fetch("/api/paysheets");
    if (res.ok) setSheets(await res.json());
    setLoading(false);
  };

  const createSheet = async () => {
    if (!newName.trim()) return;
    const res = await fetch("/api/paysheets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), columns: [] }),
    });
    if (res.ok) {
      const sheet = await res.json();
      setNewName("");
      router.push(`/sheets/${sheet.id}`);
    }
  };

  const deleteSheet = async (id: string, name: string) => {
    if (!confirm(`"${name}" 시트를 삭제하시겠습니까?`)) return;
    await fetch(`/api/payroll?sheetId=${id}`, { method: "DELETE" });
    fetchSheets();
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const importRes = await fetch("/api/excel/import", { method: "POST", body: formData });
      if (!importRes.ok) {
        const err = await importRes.json();
        alert(err.error || "파일을 읽는데 실패했습니다");
        return;
      }
      const { columns, rows } = await importRes.json();

      const sheetName = file.name.replace(/\.(xlsx|xls)$/i, "");
      const sheetRes = await fetch("/api/paysheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: sheetName, columns }),
      });
      if (!sheetRes.ok) return;
      const sheet = await sheetRes.json();

      await fetch("/api/payroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheetId: sheet.id, rows }),
      });

      router.push(`/sheets/${sheet.id}`);
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  };

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-slate-400 text-sm">로딩 중...</div>
      </div>
    );
  }

  if (!session) return null;
  const isAdmin = (session.user as any).role === "admin";

  return (
    <div className="min-h-screen">
      {/* Nav */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <h1 className="text-lg font-bold tracking-tight">급여 관리</h1>
          <div className="flex items-center gap-3">
            <div className="text-sm text-slate-500">
              {session.user?.name}
              {isAdmin && (
                <span className="ml-1.5 text-[11px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full font-medium">
                  관리자
                </span>
              )}
            </div>
            {isAdmin && (
              <button
                onClick={() => router.push("/users")}
                className="text-sm text-slate-500 hover:text-slate-800 transition"
              >
                사용자 관리
              </button>
            )}
            <div className="w-px h-4 bg-slate-200" />
            <button
              onClick={() => signOut()}
              className="text-sm text-slate-400 hover:text-red-500 transition"
            >
              로그아웃
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {/* Actions */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 flex gap-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createSheet()}
                placeholder="새 시트 이름 (예: 2024년 3월 급여)"
                className="flex-1 border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              />
              <button
                onClick={createSheet}
                className="bg-blue-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition whitespace-nowrap"
              >
                새 시트
              </button>
            </div>
            <label className={`cursor-pointer inline-flex items-center gap-2 bg-emerald-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-emerald-700 transition whitespace-nowrap ${importing ? "opacity-50 pointer-events-none" : ""}`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              {importing ? "가져오는 중..." : "엑셀 가져오기"}
              <input type="file" accept=".xlsx,.xls" onChange={handleImport} className="hidden" disabled={importing} />
            </label>
          </div>
        </div>

        {/* Sheets */}
        <div>
          <h2 className="text-sm font-medium text-slate-500 mb-3 px-1">저장된 시트</h2>
          {sheets.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 py-16 text-center">
              <div className="text-slate-300 mb-2">
                <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <p className="text-slate-400 text-sm">아직 시트가 없습니다</p>
              <p className="text-slate-300 text-xs mt-1">새 시트를 만들거나 엑셀 파일을 가져오세요</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {sheets.map((sheet) => (
                <div
                  key={sheet.id}
                  className="bg-white rounded-xl border border-slate-200 px-5 py-4 flex items-center justify-between hover:border-slate-300 hover:shadow-sm transition cursor-pointer group"
                  onClick={() => router.push(`/sheets/${sheet.id}`)}
                >
                  <div className="min-w-0">
                    <div className="font-medium text-sm group-hover:text-blue-600 transition truncate">
                      {sheet.name}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {sheet._count.rows}행 · {new Date(sheet.updatedAt).toLocaleDateString("ko-KR")} 수정
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <a
                      href={`/api/excel/export?sheetId=${sheet.id}`}
                      className="text-xs text-emerald-600 hover:text-emerald-700 px-3 py-1.5 rounded-lg border border-emerald-200 hover:bg-emerald-50 transition"
                    >
                      내보내기
                    </a>
                    <button
                      onClick={() => deleteSheet(sheet.id, sheet.name)}
                      className="text-xs text-slate-400 hover:text-red-500 px-3 py-1.5 rounded-lg border border-slate-200 hover:border-red-200 hover:bg-red-50 transition"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
