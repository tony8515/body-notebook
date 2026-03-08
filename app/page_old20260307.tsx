"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

/** =========================
 *  Types
 *  ========================= */
type EntryRow = {
  id: string;
  user_id: string;
  date: string; // YYYY-MM-DD
  weight: number | null;
  bp_s: number | null;
  bp_d: number | null;
  exercise_min: number | null;
  plank_min: number | null;
  knee_pain: number | null; // 0-10
  notes: string | null;
  created_at: string;
};

type FormState = {
  date: string;
  weight: string;
  bp_s: string;
  bp_d: string;
  exercise_min: string;
  plank_min: string;
  knee_pain: string;
  notes: string;
};

/** =========================
 *  Helpers
 *  ========================= */
function todayYMD(): string {
  const d = new Date();
  // Local date (not UTC) so it matches user expectation
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toNumOrNull(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function clampInt0to10(n: number | null): number | null {
  if (n === null) return null;
  const x = Math.round(n);
  if (x < 0) return 0;
  if (x > 10) return 10;
  return x;
}

function ymdToLabel(ymd: string): string {
  // "2026-03-05" -> "3/5"
  const [y, m, d] = ymd.split("-").map((x) => Number(x));
  if (!y || !m || !d) return ymd;
  return `${m}/${d}`;
}

/** =========================
 *  Component
 *  ========================= */
export default function Page() {
  const [userId, setUserId] = useState<string | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  const [rows, setRows] = useState<EntryRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);

  const [editing, setEditing] = useState<EntryRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string>("");

  const [form, setForm] = useState<FormState>({
    date: todayYMD(),
    weight: "",
    bp_s: "",
    bp_d: "",
    exercise_min: "",
    plank_min: "",
    knee_pain: "",
    notes: "",
  });

  /** ---------- Auth bootstrap ---------- */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoadingAuth(true);
      const { data, error } = await supabase.auth.getSession();
      if (cancelled) return;

      if (error) {
        setStatusMsg(`세션 읽기 오류: ${error.message}`);
        setUserId(null);
        setLoadingAuth(false);
        return;
      }

      const uid = data.session?.user?.id ?? null;
      setUserId(uid);
      setLoadingAuth(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  /** ---------- Load entries ---------- */
  async function loadRows() {
    if (!userId) return;
    setLoadingRows(true);
    setStatusMsg("");

    const { data, error } = await supabase
      .from("body_entries")
      .select("*")
      .eq("user_id", userId)
      // ✅ 최신순 (날짜/시간 역순). created_at이 가장 정확함
      .order("created_at", { ascending: false });

    if (error) {
      setStatusMsg(`불러오기 오류: ${error.message}`);
      setRows([]);
      setLoadingRows(false);
      return;
    }

    setRows((data as EntryRow[]) ?? []);
    setLoadingRows(false);
  }

  useEffect(() => {
    if (!userId) return;
    loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  /** ---------- Chart data ---------- */
  const chartData = useMemo(() => {
    // For charts, it’s more intuitive in chronological order
    const asc = [...rows].sort((a, b) => (a.created_at < b.created_at ? -1 : 1));

    // Single combined chart dataset
    return asc.map((r) => ({
      date: ymdToLabel(r.date),
      weight: r.weight ?? undefined,
      bp_s: r.bp_s ?? undefined,
      bp_d: r.bp_d ?? undefined,
      exercise_min: r.exercise_min ?? undefined,
      plank_min: r.plank_min ?? undefined,
      knee_pain: r.knee_pain ?? undefined,
    }));
  }, [rows]);

  /** ---------- Form fill ---------- */
  function resetToNew() {
    setEditing(null);
    setForm({
      date: todayYMD(),
      weight: "",
      bp_s: "",
      bp_d: "",
      exercise_min: "",
      plank_min: "",
      knee_pain: "",
      notes: "",
    });
  }

  function fillFromRow(r: EntryRow) {
    setEditing(r);
    setForm({
      date: r.date ?? todayYMD(),
      weight: r.weight?.toString() ?? "",
      bp_s: r.bp_s?.toString() ?? "",
      bp_d: r.bp_d?.toString() ?? "",
      exercise_min: r.exercise_min?.toString() ?? "",
      plank_min: r.plank_min?.toString() ?? "",
      knee_pain: r.knee_pain?.toString() ?? "",
      notes: r.notes ?? "",
    });
  }

  /** ---------- Save (insert/update) ---------- */
  async function save() {
    if (!userId) {
      setStatusMsg("로그인이 필요합니다.");
      return;
    }

    const date = form.date.trim();
    if (!date) {
      setStatusMsg("날짜를 입력하세요.");
      return;
    }

    const payload = {
      user_id: userId,
      date,
      weight: toNumOrNull(form.weight),
      bp_s: toNumOrNull(form.bp_s),
      bp_d: toNumOrNull(form.bp_d),
      exercise_min: toNumOrNull(form.exercise_min),
      plank_min: toNumOrNull(form.plank_min),
      knee_pain: clampInt0to10(toNumOrNull(form.knee_pain)),
      notes: form.notes.trim() ? form.notes.trim() : null,
    };

    setSaving(true);
    setStatusMsg("저장중...");

    if (editing) {
      const { error } = await supabase
        .from("body_entries")
        .update(payload)
        .eq("id", editing.id)
        .eq("user_id", userId);

      if (error) {
        setStatusMsg(`수정 저장 오류: ${error.message}`);
        setSaving(false);
        return;
      }
      setStatusMsg("수정 저장 완료");
    } else {
      const { error } = await supabase.from("body_entries").insert(payload);
      if (error) {
        setStatusMsg(`새 기록 저장 오류: ${error.message}`);
        setSaving(false);
        return;
      }
      setStatusMsg("새 기록 저장 완료");
    }

    setSaving(false);
    resetToNew();
    await loadRows();
  }

  /** ---------- Delete ---------- */
  async function removeRow(r: EntryRow) {
    if (!userId) return;
    const ok = confirm("이 기록을 삭제할까요?");
    if (!ok) return;

    setStatusMsg("삭제중...");
    const { error } = await supabase
      .from("body_entries")
      .delete()
      .eq("id", r.id)
      .eq("user_id", userId);

    if (error) {
      setStatusMsg(`삭제 오류: ${error.message}`);
      return;
    }

    setStatusMsg("삭제 완료");
    if (editing?.id === r.id) resetToNew();
    await loadRows();
  }

  /** ---------- Simple login UI ---------- */
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  async function login() {
    setLoggingIn(true);
    setStatusMsg("로그인중...");

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setStatusMsg(`로그인 실패: ${error.message}`);
      setLoggingIn(false);
      return;
    }

    setStatusMsg("로그인 성공");
    setLoggingIn(false);
  }

  async function logout() {
    await supabase.auth.signOut();
    setStatusMsg("로그아웃 했습니다.");
    setRows([]);
    resetToNew();
  }

  /** =========================
   *  UI
   *  ========================= */
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Centered container */}
      <div className="mx-auto w-full max-w-4xl px-4 py-6">
        <header className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold">몸계부</h1>
          {userId ? (
            <button
              onClick={logout}
              className="rounded-lg bg-gray-800 px-3 py-2 text-sm text-white hover:bg-gray-700"
            >
              로그아웃
            </button>
          ) : null}
        </header>

        {/* Status */}
        {statusMsg ? (
          <div className="mb-4 rounded-lg border bg-white px-3 py-2 text-sm">
            {statusMsg}
          </div>
        ) : null}

        {/* Auth */}
        {loadingAuth ? (
          <div className="rounded-lg border bg-white p-4">세션 확인중...</div>
        ) : !userId ? (
          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <div className="mb-3 text-lg font-semibold">로그인</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm text-gray-600">Email</label>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2"
                  placeholder="email"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-gray-600">
                  Password
                </label>
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  className="w-full rounded-lg border px-3 py-2"
                  placeholder="password"
                />
              </div>
            </div>
            <button
              onClick={login}
              disabled={loggingIn}
              className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-500 disabled:opacity-60"
            >
              로그인
            </button>
          </div>
        ) : (
          <>
            {/* ✅ Graph FIRST (above recent records) */}
            <section className="mb-4 rounded-2xl border bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-lg font-semibold">그래프</div>
                <div className="text-sm text-gray-500">
                  (체중/혈압/운동/플랭크/무릎통증)
                </div>
              </div>

              {rows.length === 0 ? (
                <div className="text-sm text-gray-600">
                  아직 기록이 없습니다. 아래에서 새 기록을 입력해 보세요.
                </div>
              ) : (
                <div style={{ width: "100%", height: 320 }}>
                  <ResponsiveContainer>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="weight" dot={false} />
                      <Line type="monotone" dataKey="bp_s" dot={false} />
                      <Line type="monotone" dataKey="bp_d" dot={false} />
                      <Line type="monotone" dataKey="exercise_min" dot={false} />
                      <Line type="monotone" dataKey="plank_min" dot={false} />
                      <Line type="monotone" dataKey="knee_pain" dot={false} />
                      {/* 아내는 빨간색: 
                         - 같은 프로젝트에서 "wife" 라인을 따로 그리려면
                           DB에 wife_weight 같은 컬럼이나 user 구분이 필요합니다.
                           현재는 단일 사용자 데이터라 기본 라인만 표시합니다. */}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>

            {/* ✅ New/Edit form ALWAYS visible */}
            <section className="mb-4 rounded-2xl border bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-lg font-semibold">
                  {editing ? "기록 수정" : "새 기록 입력"}
                </div>
                {editing ? (
                  <button
                    onClick={resetToNew}
                    className="rounded-lg border px-3 py-2 text-sm hover:bg-gray-50"
                  >
                    새로 입력으로 전환
                  </button>
                ) : null}
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-sm text-gray-600">날짜</label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    className="w-full rounded-lg border px-3 py-2"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm text-gray-600">체중</label>
                  <input
                    inputMode="decimal"
                    value={form.weight}
                    onChange={(e) => setForm({ ...form, weight: e.target.value })}
                    className="w-full rounded-lg border px-3 py-2"
                    placeholder="예: 175.5"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm text-gray-600">
                    운동(분)
                  </label>
                  <input
                    inputMode="numeric"
                    value={form.exercise_min}
                    onChange={(e) =>
                      setForm({ ...form, exercise_min: e.target.value })
                    }
                    className="w-full rounded-lg border px-3 py-2"
                    placeholder="예: 60"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm text-gray-600">
                    혈압(수축)
                  </label>
                  <input
                    inputMode="numeric"
                    value={form.bp_s}
                    onChange={(e) => setForm({ ...form, bp_s: e.target.value })}
                    className="w-full rounded-lg border px-3 py-2"
                    placeholder="예: 125"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm text-gray-600">
                    혈압(이완)
                  </label>
                  <input
                    inputMode="numeric"
                    value={form.bp_d}
                    onChange={(e) => setForm({ ...form, bp_d: e.target.value })}
                    className="w-full rounded-lg border px-3 py-2"
                    placeholder="예: 78"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm text-gray-600">
                    플랭크(분)
                  </label>
                  <input
                    inputMode="numeric"
                    value={form.plank_min}
                    onChange={(e) =>
                      setForm({ ...form, plank_min: e.target.value })
                    }
                    className="w-full rounded-lg border px-3 py-2"
                    placeholder="예: 3"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm text-gray-600">
                    무릎통증(0~10)
                  </label>
                  <input
                    inputMode="numeric"
                    value={form.knee_pain}
                    onChange={(e) =>
                      setForm({ ...form, knee_pain: e.target.value })
                    }
                    className="w-full rounded-lg border px-3 py-2"
                    placeholder="예: 4"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="mb-1 block text-sm text-gray-600">메모</label>
                  <input
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    className="w-full rounded-lg border px-3 py-2"
                    placeholder="특이사항"
                  />
                </div>
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  onClick={save}
                  disabled={saving}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-500 disabled:opacity-60"
                >
                  {saving ? "저장중..." : "저장"}
                </button>
                {editing ? (
                  <button
                    onClick={() => removeRow(editing)}
                    className="rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-500"
                  >
                    삭제
                  </button>
                ) : null}
              </div>
            </section>

            {/* ✅ Recent records (latest first) */}
            <section className="rounded-2xl border bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-lg font-semibold">최근 기록</div>
                <button
                  onClick={loadRows}
                  disabled={loadingRows}
                  className="rounded-lg border px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-60"
                >
                  새로고침
                </button>
              </div>

              {loadingRows ? (
                <div className="text-sm text-gray-600">불러오는 중...</div>
              ) : rows.length === 0 ? (
                <div className="text-sm text-gray-600">최근 기록이 없습니다.</div>
              ) : (
                <div className="space-y-2">
                  {rows.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => fillFromRow(r)}
                      className="w-full rounded-xl border px-3 py-3 text-left hover:bg-gray-50"
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-semibold">{r.date}</div>
                        <div className="text-xs text-gray-500">
                          {new Date(r.created_at).toLocaleString()}
                        </div>
                      </div>

                      <div className="mt-2 grid gap-1 text-sm sm:grid-cols-3">
                        <div>체중: {r.weight ?? "-"}</div>
                        <div>
                          혈압: {r.bp_s ?? "-"} / {r.bp_d ?? "-"}
                        </div>
                        <div>운동: {r.exercise_min ?? "-"}분</div>
                        <div>플랭크: {r.plank_min ?? "-"}분</div>
                        <div>무릎: {r.knee_pain ?? "-"} / 10</div>
                        <div className="sm:col-span-3 text-gray-600">
                          메모: {r.notes ?? "-"}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
