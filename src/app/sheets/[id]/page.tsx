"use client";

import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useState, useCallback, useRef } from "react";

interface Column {
  key: string;
  label: string;
  type: string;
  width: number;
}

type SortDir = "asc" | "desc" | null;

interface HistoryEntry {
  columns: Column[];
  rows: Record<string, any>[];
}

export default function SheetPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const sheetId = params.id as string;

  const [sheetName, setSheetName] = useState("");
  const [columns, setColumns] = useState<Column[]>([]);
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Active cell
  const [activeRow, setActiveRow] = useState<number | null>(null);
  const [activeCol, setActiveCol] = useState<string | null>(null);

  // Column editing
  const [editingCol, setEditingCol] = useState<string | null>(null);
  const [editingColLabel, setEditingColLabel] = useState("");

  // Resize
  const [resizing, setResizing] = useState<{ key: string; startX: number; startW: number } | null>(null);

  // Sort
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  // Multi-select
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());

  // Undo/Redo
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const skipHistoryRef = useRef(false);

  const tableRef = useRef<HTMLTableElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  const fetchData = useCallback(async () => {
    const res = await fetch(`/api/payroll?sheetId=${sheetId}`);
    if (!res.ok) { router.push("/"); return; }
    const data = await res.json();
    setSheetName(data.sheet.name);
    const cols = data.sheet.columns.map((c: any) => ({ ...c, width: c.width || 140 }));
    setColumns(cols);
    setRows(data.rows);
    setLoading(false);
    setDirty(false);
    // Init history
    setHistory([{ columns: cols, rows: data.rows }]);
    setHistoryIdx(0);
  }, [sheetId, router]);

  useEffect(() => {
    if (status === "authenticated") fetchData();
  }, [status, fetchData]);

  // Push to undo history
  const pushHistory = useCallback((cols: Column[], rws: Record<string, any>[]) => {
    if (skipHistoryRef.current) { skipHistoryRef.current = false; return; }
    setHistory((prev) => {
      const newHist = prev.slice(0, historyIdx + 1);
      newHist.push({ columns: cols, rows: rws });
      if (newHist.length > 50) newHist.shift();
      return newHist;
    });
    setHistoryIdx((prev) => Math.min(prev + 1, 50));
  }, [historyIdx]);

  // Wrap setState to track history
  const updateData = (newCols: Column[], newRows: Record<string, any>[]) => {
    setColumns(newCols);
    setRows(newRows);
    setDirty(true);
    pushHistory(newCols, newRows);
  };

  // Undo
  const undo = useCallback(() => {
    if (historyIdx <= 0) return;
    const prev = history[historyIdx - 1];
    skipHistoryRef.current = true;
    setColumns(prev.columns);
    setRows(prev.rows);
    setHistoryIdx(historyIdx - 1);
    setDirty(true);
  }, [history, historyIdx]);

  // Redo
  const redo = useCallback(() => {
    if (historyIdx >= history.length - 1) return;
    const next = history[historyIdx + 1];
    skipHistoryRef.current = true;
    setColumns(next.columns);
    setRows(next.rows);
    setHistoryIdx(historyIdx + 1);
    setDirty(true);
  }, [history, historyIdx]);

  // Save
  const save = useCallback(async () => {
    setSaving(true);
    await fetch("/api/payroll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sheetId, columns, rows }),
    });
    setSaving(false);
    setDirty(false);
  }, [sheetId, columns, rows]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); if (dirty && !saving) save(); }
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) { e.preventDefault(); redo(); }
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        setShowSearch(true);
        setTimeout(() => searchInputRef.current?.focus(), 50);
      }
      if (e.key === "Escape" && showSearch) { setShowSearch(false); setSearchQuery(""); }
      if (e.key === "Delete" && selectedRows.size > 0 && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault();
        deleteSelectedRows();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  // Resize
  const onResizeStart = (key: string, e: React.MouseEvent) => {
    e.preventDefault();
    const col = columns.find((c) => c.key === key);
    if (!col) return;
    setResizing({ key, startX: e.clientX, startW: col.width });
  };

  useEffect(() => {
    if (!resizing) return;
    const onMove = (e: MouseEvent) => {
      const diff = e.clientX - resizing.startX;
      setColumns((prev) => prev.map((c) => (c.key === resizing.key ? { ...c, width: Math.max(60, resizing.startW + diff) } : c)));
    };
    const onUp = () => { setResizing(null); setDirty(true); };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
  }, [resizing]);

  // Sort
  const handleSort = (key: string) => {
    if (sortKey === key) {
      if (sortDir === "asc") setSortDir("desc");
      else if (sortDir === "desc") { setSortKey(null); setSortDir(null); }
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  // Get display rows (sorted + filtered)
  const getDisplayRows = useCallback(() => {
    let display: Record<string, any>[] = rows.map((r, i) => ({ ...r, __origIdx: i }));

    // Filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      display = display.filter((r) =>
        columns.some((c) => String(r[c.key] ?? "").toLowerCase().includes(q))
      );
    }

    // Sort
    if (sortKey && sortDir) {
      display.sort((a, b) => {
        const va = String(a[sortKey] ?? "");
        const vb = String(b[sortKey] ?? "");
        // Try numeric sort
        const na = parseFloat(va.replace(/[,\s]/g, ""));
        const nb = parseFloat(vb.replace(/[,\s]/g, ""));
        if (!isNaN(na) && !isNaN(nb)) {
          return sortDir === "asc" ? na - nb : nb - na;
        }
        return sortDir === "asc" ? va.localeCompare(vb, "ko") : vb.localeCompare(va, "ko");
      });
    }

    return display;
  }, [rows, columns, searchQuery, sortKey, sortDir]);

  const displayRows = getDisplayRows();

  // Cell navigation
  const moveTo = (row: number, colIdx: number) => {
    if (row < 0 || row >= displayRows.length || colIdx < 0 || colIdx >= columns.length) return;
    const origIdx = displayRows[row].__origIdx;
    setActiveRow(origIdx);
    setActiveCol(columns[colIdx].key);
    setTimeout(() => {
      const input = document.querySelector(`[data-cell="${origIdx}-${columns[colIdx].key}"]`) as HTMLInputElement;
      input?.focus();
    }, 0);
  };

  const handleCellKeyDown = (e: React.KeyboardEvent, displayIdx: number, colKey: string) => {
    const colIdx = columns.findIndex((c) => c.key === colKey);
    if (e.key === "Tab") {
      e.preventDefault();
      if (e.shiftKey) {
        if (colIdx > 0) moveTo(displayIdx, colIdx - 1);
        else if (displayIdx > 0) moveTo(displayIdx - 1, columns.length - 1);
      } else {
        if (colIdx < columns.length - 1) moveTo(displayIdx, colIdx + 1);
        else if (displayIdx < displayRows.length - 1) moveTo(displayIdx + 1, 0);
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) { if (displayIdx > 0) moveTo(displayIdx - 1, colIdx); }
      else {
        if (displayIdx < displayRows.length - 1) moveTo(displayIdx + 1, colIdx);
        else if (!searchQuery && !sortKey) { addRow(); setTimeout(() => moveTo(displayRows.length, colIdx), 50); }
      }
    } else if (e.key === "Escape") {
      (e.target as HTMLInputElement).blur();
      setActiveRow(null); setActiveCol(null);
    }
  };

  // Column actions
  const addColumn = () => {
    const key = `col_${Date.now()}`;
    const newCols = [...columns, { key, label: "새 컬럼", type: "text", width: 140 }];
    updateData(newCols, rows);
    setTimeout(() => { setEditingCol(key); setEditingColLabel("새 컬럼"); }, 50);
  };

  const removeColumn = (key: string) => {
    if (!confirm("이 컬럼을 삭제하시겠습니까?")) return;
    updateData(columns.filter((c) => c.key !== key), rows.map((r) => { const { [key]: _, ...rest } = r; return rest; }));
  };

  const finishEditCol = () => {
    if (editingCol) {
      updateData(columns.map((c) => (c.key === editingCol ? { ...c, label: editingColLabel || c.label } : c)), rows);
      setEditingCol(null);
    }
  };

  // Row actions
  const addRow = () => {
    const newRow: Record<string, any> = {};
    columns.forEach((c) => (newRow[c.key] = ""));
    updateData(columns, [...rows, newRow]);
  };

  const removeRow = (origIdx: number) => {
    updateData(columns, rows.filter((_, i) => i !== origIdx));
    if (activeRow === origIdx) { setActiveRow(null); setActiveCol(null); }
    selectedRows.delete(origIdx);
    setSelectedRows(new Set(selectedRows));
  };

  const insertRowBelow = (origIdx: number) => {
    const newRow: Record<string, any> = {};
    columns.forEach((c) => (newRow[c.key] = ""));
    const updated = [...rows];
    updated.splice(origIdx + 1, 0, newRow);
    updateData(columns, updated);
  };

  const duplicateRow = (origIdx: number) => {
    const copy = { ...rows[origIdx] };
    delete copy.id;
    delete copy.rowOrder;
    const updated = [...rows];
    updated.splice(origIdx + 1, 0, copy);
    updateData(columns, updated);
  };

  const deleteSelectedRows = () => {
    if (selectedRows.size === 0) return;
    if (!confirm(`${selectedRows.size}개 행을 삭제하시겠습니까?`)) return;
    updateData(columns, rows.filter((_, i) => !selectedRows.has(i)));
    setSelectedRows(new Set());
    setActiveRow(null); setActiveCol(null);
  };

  const updateCell = (origIdx: number, colKey: string, value: string) => {
    const updated = [...rows];
    updated[origIdx] = { ...updated[origIdx], [colKey]: value };
    setRows(updated);
    setDirty(true);
    // Debounced history push
  };

  // Debounce history for cell edits
  const cellEditTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const updateCellWithHistory = (origIdx: number, colKey: string, value: string) => {
    updateCell(origIdx, colKey, value);
    if (cellEditTimer.current) clearTimeout(cellEditTimer.current);
    cellEditTimer.current = setTimeout(() => {
      const updated = [...rows];
      updated[origIdx] = { ...updated[origIdx], [colKey]: value };
      pushHistory(columns, updated);
    }, 500);
  };

  // Select row
  const toggleSelectRow = (origIdx: number, shiftKey: boolean) => {
    const next = new Set(selectedRows);
    if (shiftKey && selectedRows.size > 0) {
      const lastSelected = Array.from(selectedRows).pop()!;
      const from = Math.min(lastSelected, origIdx);
      const to = Math.max(lastSelected, origIdx);
      for (let i = from; i <= to; i++) next.add(i);
    } else {
      if (next.has(origIdx)) next.delete(origIdx); else next.add(origIdx);
    }
    setSelectedRows(next);
  };

  const selectAll = () => {
    if (selectedRows.size === rows.length) setSelectedRows(new Set());
    else setSelectedRows(new Set(rows.map((_, i) => i)));
  };

  // Import
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/excel/import", { method: "POST", body: formData });
    if (!res.ok) { alert("파일을 읽는데 실패했습니다"); return; }
    const data = await res.json();
    const newCols = data.columns.map((c: any) => ({ ...c, width: c.width || 140 }));
    updateData(newCols, data.rows);
    e.target.value = "";
  };

  // Context menu
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; origIdx: number } | null>(null);
  const handleContextMenu = (e: React.MouseEvent, origIdx: number) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, origIdx });
  };
  useEffect(() => { const close = () => setCtxMenu(null); window.addEventListener("click", close); return () => window.removeEventListener("click", close); }, []);

  if (status === "loading" || loading) {
    return <div className="min-h-screen flex items-center justify-center text-slate-400 text-sm">로딩 중...</div>;
  }
  if (!session) return null;

  const canUndo = historyIdx > 0;
  const canRedo = historyIdx < history.length - 1;

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ userSelect: resizing ? "none" : "auto" }}>
      {/* Title bar */}
      <div className="bg-white border-b border-slate-200 shrink-0">
        <div className="px-3 h-11 flex items-center justify-between border-b border-slate-100">
          <div className="flex items-center gap-2 min-w-0">
            <button onClick={() => router.push("/")} className="text-slate-400 hover:text-slate-700 transition p-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="text-sm font-semibold truncate">{sheetName}</span>
            {dirty && <span className="shrink-0 text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded font-medium">수정됨</span>}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <label className="cursor-pointer inline-flex items-center gap-1 text-slate-600 px-2.5 py-1 rounded text-[12px] font-medium border border-slate-200 hover:bg-slate-50 transition">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
              가져오기
              <input type="file" accept=".xlsx,.xls" onChange={handleImport} className="hidden" />
            </label>
            <a href={`/api/excel/export?sheetId=${sheetId}`} className="inline-flex items-center gap-1 text-emerald-700 px-2.5 py-1 rounded text-[12px] font-medium border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 transition">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              내보내기
            </a>
            <div className="w-px h-5 bg-slate-200 mx-0.5" />
            <button onClick={save} disabled={saving || !dirty} className="inline-flex items-center gap-1 bg-blue-600 text-white px-3 py-1 rounded text-[12px] font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition">
              {saving ? "저장 중..." : "저장"}
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="px-2 h-9 flex items-center gap-0.5 text-[12px]">
          {/* Undo/Redo */}
          <button onClick={undo} disabled={!canUndo} className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-30 transition" title="실행 취소 (Ctrl+Z)">
            <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a5 5 0 015 5v2M3 10l4-4M3 10l4 4" /></svg>
          </button>
          <button onClick={redo} disabled={!canRedo} className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-30 transition" title="다시 실행 (Ctrl+Y)">
            <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10H11a5 5 0 00-5 5v2M21 10l-4-4M21 10l-4 4" /></svg>
          </button>

          <div className="w-px h-4 bg-slate-200 mx-1" />

          <button onClick={addRow} className="inline-flex items-center gap-1 px-2 py-1 rounded text-slate-600 hover:bg-slate-100 transition">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            행
          </button>
          <button onClick={addColumn} className="inline-flex items-center gap-1 px-2 py-1 rounded text-slate-600 hover:bg-slate-100 transition">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            컬럼
          </button>

          {selectedRows.size > 0 && (
            <>
              <div className="w-px h-4 bg-slate-200 mx-1" />
              <span className="text-slate-500 px-1">{selectedRows.size}개 선택</span>
              <button onClick={deleteSelectedRows} className="inline-flex items-center gap-1 px-2 py-1 rounded text-red-600 hover:bg-red-50 transition">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                삭제
              </button>
            </>
          )}

          <div className="flex-1" />

          {/* Search */}
          {showSearch ? (
            <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded px-2 py-0.5">
              <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" strokeWidth={2} /><path strokeLinecap="round" strokeWidth={2} d="M21 21l-4.35-4.35" /></svg>
              <input
                ref={searchInputRef}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="검색..."
                className="bg-transparent border-none outline-none text-[12px] w-36 py-0.5"
              />
              {searchQuery && (
                <span className="text-[11px] text-slate-400">{displayRows.length}건</span>
              )}
              <button onClick={() => { setShowSearch(false); setSearchQuery(""); }} className="text-slate-400 hover:text-slate-600 ml-0.5">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          ) : (
            <button onClick={() => { setShowSearch(true); setTimeout(() => searchInputRef.current?.focus(), 50); }} className="p-1.5 rounded hover:bg-slate-100 transition" title="검색 (Ctrl+F)">
              <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" strokeWidth={2} /><path strokeLinecap="round" strokeWidth={2} d="M21 21l-4.35-4.35" /></svg>
            </button>
          )}

          {activeRow !== null && activeCol !== null && (
            <span className="text-[11px] text-slate-400 ml-2 tabular-nums">
              {activeRow + 1}행 {columns.findIndex((c) => c.key === activeCol) + 1}열
            </span>
          )}
        </div>
      </div>

      {/* Spreadsheet */}
      {columns.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center bg-white">
          <div className="text-slate-200 mb-4">
            <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
          </div>
          <p className="text-slate-500 text-sm font-medium">데이터가 없습니다</p>
          <p className="text-slate-400 text-xs mt-1 mb-5">컬럼을 추가하거나 엑셀 파일을 가져오세요</p>
          <button onClick={addColumn} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition">컬럼 추가</button>
        </div>
      ) : (
        <div className="spreadsheet-wrap">
          <table ref={tableRef} className="spreadsheet">
            <colgroup>
              <col style={{ width: 30 }} />
              <col style={{ width: 46 }} />
              {columns.map((col) => <col key={col.key} style={{ width: col.width }} />)}
              <col style={{ width: 40 }} />
            </colgroup>
            <thead>
              <tr>
                <th className="chk-col">
                  <input
                    type="checkbox"
                    checked={selectedRows.size === rows.length && rows.length > 0}
                    onChange={selectAll}
                    className="w-3 h-3 accent-blue-600 cursor-pointer"
                  />
                </th>
                <th className="row-num-col">#</th>
                {columns.map((col) => (
                  <th key={col.key}>
                    {editingCol === col.key ? (
                      <input autoFocus className="col-edit-input" value={editingColLabel}
                        onChange={(e) => setEditingColLabel(e.target.value)}
                        onBlur={finishEditCol}
                        onKeyDown={(e) => { if (e.key === "Enter") finishEditCol(); if (e.key === "Escape") setEditingCol(null); }}
                      />
                    ) : (
                      <div className="col-header" onClick={() => handleSort(col.key)} style={{ cursor: "pointer" }}>
                        <span className="col-header-label" onDoubleClick={(e) => { e.stopPropagation(); setEditingCol(col.key); setEditingColLabel(col.label); }} title="클릭: 정렬 · 더블클릭: 이름변경">
                          {col.label}
                          {sortKey === col.key && (
                            <span className="ml-1 text-blue-500">
                              {sortDir === "asc" ? "▲" : "▼"}
                            </span>
                          )}
                        </span>
                        <button className="col-header-btn" onClick={(e) => { e.stopPropagation(); removeColumn(col.key); }} title="컬럼 삭제">
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 2l6 6M8 2l-6 6" /></svg>
                        </button>
                      </div>
                    )}
                    <div className={`resize-handle ${resizing?.key === col.key ? "active" : ""}`} onMouseDown={(e) => onResizeStart(col.key, e)} />
                  </th>
                ))}
                <th className="add-col-th" onClick={addColumn} title="컬럼 추가">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ margin: "0 auto" }}><path d="M7 3v8M3 7h8" /></svg>
                </th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row, displayIdx) => {
                const origIdx = row.__origIdx;
                const isSelected = selectedRows.has(origIdx);
                return (
                  <tr key={origIdx} className={`${activeRow === origIdx ? "row-active" : ""} ${isSelected ? "row-checked" : ""}`} onContextMenu={(e) => handleContextMenu(e, origIdx)} onClick={() => setActiveRow(origIdx)}>
                    <td className="chk-col">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => toggleSelectRow(origIdx, (e.nativeEvent as any).shiftKey)}
                        className="w-3 h-3 accent-blue-600 cursor-pointer"
                      />
                    </td>
                    <td className="row-num-col">{origIdx + 1}</td>
                    {columns.map((col) => (
                      <td key={col.key} className={activeRow === origIdx && activeCol === col.key ? "active-cell" : ""} onClick={() => { setActiveRow(origIdx); setActiveCol(col.key); }}>
                        <input
                          data-cell={`${origIdx}-${col.key}`}
                          value={row[col.key] ?? ""}
                          onChange={(e) => updateCellWithHistory(origIdx, col.key, e.target.value)}
                          onFocus={() => { setActiveRow(origIdx); setActiveCol(col.key); }}
                          onKeyDown={(e) => handleCellKeyDown(e, displayIdx, col.key)}
                        />
                      </td>
                    ))}
                    <td style={{ background: "white" }} />
                  </tr>
                );
              })}
              {/* Add row */}
              {!searchQuery && !sortKey && (
                <tr className="add-row">
                  <td className="chk-col" style={{ background: "#fafafa" }} />
                  <td className="row-num-col" style={{ cursor: "pointer" }} onClick={addRow} title="행 추가">+</td>
                  {columns.map((col) => <td key={col.key} style={{ background: "#fafafa", cursor: "pointer" }} onClick={addRow} />)}
                  <td style={{ background: "#fafafa" }} />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer */}
      {columns.length > 0 && (
        <div className="sheet-footer">
          <span>{rows.length}행</span>
          <span>{columns.length}열</span>
          {searchQuery && <span className="text-blue-600">검색결과 {displayRows.length}건</span>}
          {selectedRows.size > 0 && <span className="text-blue-600">{selectedRows.size}개 선택 (Delete로 삭제)</span>}
          <div className="flex-1" />
          {dirty ? <span className="text-amber-600">Ctrl+S 저장</span> : <span className="text-emerald-600">저장됨</span>}
        </div>
      )}

      {/* Context Menu */}
      {ctxMenu && (
        <div className="fixed bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-50 text-[13px] min-w-[170px]" style={{ left: ctxMenu.x, top: ctxMenu.y }}>
          <button className="w-full text-left px-3 py-1.5 hover:bg-slate-50 text-slate-700" onClick={() => { insertRowBelow(ctxMenu.origIdx); setCtxMenu(null); }}>
            아래에 행 삽입
          </button>
          <button className="w-full text-left px-3 py-1.5 hover:bg-slate-50 text-slate-700" onClick={() => { duplicateRow(ctxMenu.origIdx); setCtxMenu(null); }}>
            행 복제
          </button>
          <button className="w-full text-left px-3 py-1.5 hover:bg-slate-50 text-slate-700" onClick={() => { addRow(); setCtxMenu(null); }}>
            맨 아래에 행 추가
          </button>
          <div className="border-t border-slate-100 my-1" />
          <button className="w-full text-left px-3 py-1.5 hover:bg-red-50 text-red-600" onClick={() => { removeRow(ctxMenu.origIdx); setCtxMenu(null); }}>
            이 행 삭제
          </button>
          {selectedRows.size > 1 && (
            <button className="w-full text-left px-3 py-1.5 hover:bg-red-50 text-red-600" onClick={() => { deleteSelectedRows(); setCtxMenu(null); }}>
              선택된 {selectedRows.size}개 행 삭제
            </button>
          )}
        </div>
      )}
    </div>
  );
}
