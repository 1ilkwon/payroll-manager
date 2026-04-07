"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface User {
  id: string;
  name: string;
  loginId: string;
  role: string;
  createdAt: string;
}

export default function UsersPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [name, setName] = useState("");
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("user");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
    if (status === "authenticated" && (session?.user as any)?.role !== "admin") router.push("/");
  }, [status, session, router]);

  useEffect(() => {
    if (status === "authenticated") fetchUsers();
  }, [status]);

  const fetchUsers = async () => {
    const res = await fetch("/api/users");
    if (res.ok) setUsers(await res.json());
    setLoading(false);
  };

  const addUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, loginId, password, role }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "오류가 발생했습니다");
      return;
    }
    setName("");
    setLoginId("");
    setPassword("");
    setRole("user");
    fetchUsers();
  };

  const deleteUser = async (id: string, userName: string) => {
    if (!confirm(`"${userName}" 사용자를 삭제하시겠습니까?`)) return;
    const res = await fetch(`/api/users?id=${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error);
      return;
    }
    fetchUsers();
  };

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-slate-400 text-sm">로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-6 h-14 flex items-center gap-3">
          <button
            onClick={() => router.push("/")}
            className="text-slate-400 hover:text-slate-700 transition"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-base font-semibold">사용자 관리</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        {/* Add user */}
        <form onSubmit={addUser} className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-700">새 사용자 추가</h2>
          {error && (
            <div className="bg-red-50 text-red-600 px-4 py-2 rounded-lg text-sm border border-red-100">{error}</div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <input
              placeholder="이름"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
            />
            <input
              placeholder="아이디"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              required
              className="border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
            />
            <input
              placeholder="비밀번호"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition bg-white"
            >
              <option value="user">일반 사용자</option>
              <option value="admin">관리자</option>
            </select>
          </div>
          <button
            type="submit"
            className="bg-blue-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition"
          >
            추가
          </button>
        </form>

        {/* User list */}
        <div>
          <h2 className="text-sm font-medium text-slate-500 mb-3 px-1">등록된 사용자 ({users.length})</h2>
          <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
            {users.map((user) => (
              <div key={user.id} className="px-5 py-3.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-medium text-slate-500">
                    {user.name.charAt(0)}
                  </div>
                  <div>
                    <div className="text-sm font-medium">
                      {user.name}
                      <span className="text-slate-400 font-normal ml-1.5">@{user.loginId}</span>
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {user.role === "admin" ? "관리자" : "일반 사용자"}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => deleteUser(user.id, user.name)}
                  className="text-xs text-slate-400 hover:text-red-500 px-3 py-1.5 rounded-lg border border-slate-200 hover:border-red-200 hover:bg-red-50 transition"
                >
                  삭제
                </button>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
