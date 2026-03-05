"use client";

import React, { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase";

const supabase = getSupabase();

const TABLE = "body_entries";

type EntryRow = {
  id: string;
  user_id: string;
  group_id: string | null;
  date: string; // YYYY-MM-DD
  weight: number | null;
  bp_s: number | null;
  bp_d: number | null;
  exercise_min: number | null;
  plank_min: number | null;
  knee_pain: number | null;
  notes: string | null;
  created_at: string;
};

type MembershipRow = {
  group_id: string;
  role: "owner" | "member" | string;
};

function todayYMD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function numOrNull(v: string) {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function fmtNum(n: number | null | undefined, digits = 1) {
  if (n === null || n === undefined) return "-";
  const f = Number(n);
  if (!Number.isFinite(f)) return "-";
  return f.toFixed(digits);
}

function fmtInt(n: number | null | undefined) {
  if (n === null || n === undefined) return "-";
  const f = Number(n);
  if (!Number.isFinite(f)) return "-";
  return String(Math.round(f));
}

function compareEntryDesc(a: EntryRow, b: EntryRow) {
  // 최신순: date desc, created_at desc
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? 1 : -1;
  return 0;
}

type LinePoint = { x: number; y: number };

function buildLinePoints(values: number[], w: number, h: number, pad = 24): LinePoint[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const innerW = Math.max(1, w - pad * 2);
  const innerH = Math.max(1, h - pad * 2);

  return values.map((v, i) => {
    const x = pad + (innerW * (values.length === 1 ? 0.5 : i / (values.length - 1)));
    const y = pad + innerH * (1 - (v - min) / span);
    return { x, y };
  });
}

function pointsToPolyline(points: LinePoint[]) {
  return points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
}

function ChartCard(props: {
  title: string;
  subtitle?: string;
  seriesA: { label: string; values: number[] };
  seriesB?: { label: string; values: number[] };
  xLabels: string[]; // same length as values
  height?: number;
}) {
  const { title, subtitle, seriesA, seriesB, xLabels, height = 160 } = props;

  const w = 640; // viewBox 기준
  const h = height;

  const hasA = seriesA.values.length >= 2;
  const hasB = seriesB ? seriesB.values.length >= 2 : false;

  const allValues = [
    ...(hasA ? seriesA.values : []),
    ...(hasB && seriesB ? seriesB.values : []),
  ];
  const canDraw = allValues.length >= 2;

  const pad = 28;

  const min = canDraw ? Math.min(...allValues) : 0;
  const max = canDraw ? Math.max(...allValues) : 1;
  const mid = (min + max) / 2;

  const aPts = hasA ? buildLinePoints(seriesA.values, w, h, pad) : [];
  const bPts = hasB && seriesB ? buildLinePoints(seriesB.values, w, h, pad) : [];

  // x축 양끝 라벨만
  const leftLabel = xLabels[0] ?? "";
  const rightLabel = xLabels[xLabels.length - 1] ?? "";

  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{title}</div>
          {subtitle ? <div style={{ fontSize: 13, opacity: 0.75, marginTop: 2 }}>{subtitle}</div> : null}
        </div>
        <div style={{ fontSize: 13, opacity: 0.8, textAlign: "right" }}>
          <div>
            <span style={{ fontWeight: 700 }}>{seriesA.label}</span>
            {seriesB ? (
              <>
                {"  "}·{"  "}
                <span style={{ fontWeight: 700 }}>{seriesB.label}</span>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        {!canDraw ? (
          <div style={{ fontSize: 13, opacity: 0.75 }}>데이터가 2개 이상 있어야 그래프가 표시됩니다.</div>
        ) : (
          <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} role="img" aria-label={title}>
            {/* grid */}
            <line x1={pad} y1={pad} x2={pad} y2={h - pad} stroke="rgba(0,0,0,0.12)" />
            <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="rgba(0,0,0,0.12)" />
            <line x1={pad} y1={(pad + (h - pad)) / 2} x2={w - pad} y2={(pad + (h - pad)) / 2} stroke="rgba(0,0,0,0.08)" />

            {/* y labels */}
            <text x={4} y={pad + 4} fontSize="12" fill="rgba(0,0,0,0.55)">
              {fmtNum(max, 1)}
            </text>
            <text x={4} y={(pad + (h - pad)) / 2 + 4} fontSize="12" fill="rgba(0,0,0,0.55)">
              {fmtNum(mid, 1)}
            </text>
            <text x={4} y={h - pad + 4} fontSize="12" fill="rgba(0,0,0,0.55)">
              {fmtNum(min, 1)}
            </text>

            {/* x labels */}
            <text x={pad} y={h - 6} fontSize="12" fill="rgba(0,0,0,0.55)">
              {leftLabel}
            </text>
            <text x={w - pad} y={h - 6} fontSize="12" textAnchor="end" fill="rgba(0,0,0,0.55)">
              {rightLabel}
            </text>

            {/* lines */}
            {aPts.length ? (
              <>
                <polyline
                  points={pointsToPolyline(aPts)}
                  fill="none"
                  stroke="rgba(0,0,0,0.85)"
                  strokeWidth="3"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {aPts.map((p, i) => (
                  <circle key={`a-${i}`} cx={p.x} cy={p.y} r="4" fill="rgba(0,0,0,0.85)" />
                ))}
              </>
            ) : null}

            {bPts.length ? (
              <>
                <polyline
                  points={pointsToPolyline(bPts)}
                  fill="none"
                  stroke="rgba(0,0,0,0.35)"
                  strokeWidth="3"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {bPts.map((p, i) => (
                  <circle key={`b-${i}`} cx={p.x} cy={p.y} r="4" fill="rgba(0,0,0,0.35)" />
                ))}
              </>
            ) : null}
          </svg>
        )}
      </div>
    </div>
  );
}

export default function Home() {
  /** =========================
   *  Auth state
   *  ========================= */
  const [session, setSession] = useState<Session | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");

  /** =========================
   *  Group state
   *  ========================= */
  const [groupId, setGroupId] = useState<string | null>(null);
  const [groupRole, setGroupRole] = useState<string | null>(null);

  /** =========================
   *  Data state
   *  ========================= */
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  /** =========================
   *  Editing
   *  ========================= */
  const [editingId, setEditingId] = useState<string | null>(null);

  /** =========================
   *  Form fields
   *  ========================= */
  const [date, setDate] = useState(todayYMD());
  const [weight, setWeight] = useState("");
  const [bpS, setBpS] = useState("");
  const [bpD, setBpD] = useState("");
  const [exerciseMin, setExerciseMin] = useState("");
  const [plankMin, setPlankMin] = useState("");
  const [kneePain, setKneePain] = useState("0");
  const [notes, setNotes] = useState("");

  const userId = session?.user?.id ?? null;

  /** =========================
   *  Load session + subscribe
   *  ========================= */
  useEffect(() => {
    let alive = true;

    (async () => {
      const { data, error } = await supabase.auth.getSession();
      if (!alive) return;
      if (error) setErr(error.message);
      setSession(data.session ?? null);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession ?? null);
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  /** =========================
   *  Load group membership when logged in
   *  ========================= */
  useEffect(() => {
    if (!userId) {
      setGroupId(null);
      setGroupRole(null);
      return;
    }

    let alive = true;
    (async () => {
      setErr(null);
      const { data, error } = await supabase
        .from("share_group_members")
        .select("group_id, role")
        .eq("user_id", userId)
        .maybeSingle<MembershipRow>();

      if (!alive) return;

      if (error) {
        // 테이블/정책이 아직 없을 수도 있으니 치명적 에러로 만들지 않음
        setGroupId(null);
        setGroupRole(null);
        return;
      }

      setGroupId(data?.group_id ?? null);
      setGroupRole(data?.role ?? null);
    })();

    return () => {
      alive = false;
    };
  }, [userId]);

  /** =========================
   *  Load entries (group if exists else personal)
   *  ========================= */
  async function loadEntries() {
    if (!userId) return;
    setLoadingList(true);
    setErr(null);

    try {
      let q = supabase.from(TABLE).select("*").order("date", { ascending: true }).order("created_at", { ascending: true });

      if (groupId) {
        q = q.eq("group_id", groupId);
      } else {
        q = q.eq("user_id", userId);
      }

      const { data, error } = await q;
      if (error) throw error;

      setEntries((data as EntryRow[]) ?? []);
    } catch (e: any) {
      setErr(e?.message ?? "Load failed");
    } finally {
      setLoadingList(false);
    }
  }

  useEffect(() => {
    if (!userId) return;
    // groupId가 결정된 뒤에 로드되도록 의존성에 groupId 포함
    loadEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, groupId]);

  /** =========================
   *  Derived views
   *  ========================= */
  const entriesDesc = useMemo(() => [...entries].sort(compareEntryDesc), [entries]);

  const latestOverall = useMemo(() => {
    if (!entriesDesc.length) return null;
    return entriesDesc[0];
  }, [entriesDesc]);

  const myLatest = useMemo(() => {
    if (!userId) return null;
    const mine = entriesDesc.find((e) => e.user_id === userId);
    return mine ?? null;
  }, [entriesDesc, userId]);

  const partnerId = useMemo(() => {
    if (!userId) return null;
    const other = entries.find((e) => e.user_id !== userId);
    return other?.user_id ?? null;
  }, [entries, userId]);

  const weightSeries = useMemo(() => {
    // 최근 30개 (날짜 오름차순 유지)
    const sorted = [...entries].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.created_at < b.created_at ? -1 : 1));
    const sliced = sorted.slice(Math.max(0, sorted.length - 30));

    const xLabels = sliced.map((e) => e.date);
    const a = sliced.filter((e) => e.user_id === userId).map((e) => e.weight).filter((v): v is number => typeof v === "number");
    const b = partnerId
      ? sliced.filter((e) => e.user_id === partnerId).map((e) => e.weight).filter((v): v is number => typeof v === "number")
      : [];

    // ⚠️ 위 방식은 “각자 기록 개수”가 다르면 길이가 달라집니다.
    // 그래프를 깔끔히 맞추기 위해, x축 기준(날짜)으로 “두 시리즈 모두 같은 순서”로 재구성합니다.
    const mapA = new Map<string, number>();
    const mapB = new Map<string, number>();
    for (const e of sliced) {
      if (e.weight === null) continue;
      if (e.user_id === userId) mapA.set(e.date, e.weight);
      if (partnerId && e.user_id === partnerId) mapB.set(e.date, e.weight);
    }
    const dates = Array.from(new Set(sliced.map((e) => e.date))).sort();
    const valuesA = dates.map((d) => mapA.get(d)).filter((v): v is number => typeof v === "number");
    const valuesB = partnerId ? dates.map((d) => mapB.get(d)).filter((v): v is number => typeof v === "number") : [];

    return {
      xLabels: dates,
      a: valuesA,
      b: valuesB,
      count: dates.length,
    };
  }, [entries, userId, partnerId]);

  const bpSeries = useMemo(() => {
    const sorted = [...entries].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.created_at < b.created_at ? -1 : 1));
    const sliced = sorted.slice(Math.max(0, sorted.length - 30));

    const mapA = new Map<string, { s?: number; d?: number }>();
    const mapB = new Map<string, { s?: number; d?: number }>();

    for (const e of sliced) {
      if (e.user_id === userId) {
        mapA.set(e.date, { s: e.bp_s ?? undefined, d: e.bp_d ?? undefined });
      } else if (partnerId && e.user_id === partnerId) {
        mapB.set(e.date, { s: e.bp_s ?? undefined, d: e.bp_d ?? undefined });
      }
    }

    const dates = Array.from(new Set(sliced.map((e) => e.date))).sort();

    // 혈압은 “수축(S)” 차트만 그리면 아쉬워서: S는 라인, D는 리스트로 요약 표시(안전/간단)
    const aS = dates.map((d) => mapA.get(d)?.s).filter((v): v is number => typeof v === "number");
    const bS = partnerId ? dates.map((d) => mapB.get(d)?.s).filter((v): v is number => typeof v === "number") : [];

    const lastA = dates.length ? mapA.get(dates[dates.length - 1]) : undefined;
    const lastB = partnerId && dates.length ? mapB.get(dates[dates.length - 1]) : undefined;

    return {
      xLabels: dates,
      aS,
      bS,
      lastA,
      lastB,
    };
  }, [entries, userId, partnerId]);

  function resetForm() {
    setEditingId(null);
    setDate(todayYMD());
    setWeight("");
    setBpS("");
    setBpD("");
    setExerciseMin("");
    setPlankMin("");
    setKneePain("0");
    setNotes("");
  }

  /** =========================
   *  Auth actions
   *  ========================= */
  async function handleAuth() {
    setAuthBusy(true);
    setErr(null);

    try {
      if (authMode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({ email, password: pw });
        if (error) throw error;
        // 이메일 인증을 켜두셨다면 여기서 “메일 확인”이 필요할 수 있습니다.
      }
    } catch (e: any) {
      setErr(e?.message ?? "Auth failed");
    } finally {
      setAuthBusy(false);
    }
  }

  async function logout() {
    setErr(null);
    await supabase.auth.signOut();
    resetForm();
    setEntries([]);
  }

  /** =========================
   *  CRUD actions
   *  ========================= */
  async function saveEntry() {
    if (!userId) return;

    // 최소 입력: 체중 or 혈압 or 운동/플랭크/무릎/메모 중 하나라도
    const hasSomething =
      weight.trim() ||
      bpS.trim() ||
      bpD.trim() ||
      exerciseMin.trim() ||
      plankMin.trim() ||
      kneePain.trim() ||
      notes.trim();

    if (!hasSomething) {
      alert("저장할 내용이 없습니다. (체중/혈압/운동/플랭크/무릎/메모 중 하나라도 입력해주세요)");
      return;
    }

    setSaving(true);
    setErr(null);

    const payload = {
      user_id: userId,
      group_id: groupId ?? null,
      date,
      weight: numOrNull(weight),
      bp_s: numOrNull(bpS),
      bp_d: numOrNull(bpD),
      exercise_min: numOrNull(exerciseMin),
      plank_min: numOrNull(plankMin),
      knee_pain: numOrNull(kneePain),
      notes: notes.trim() ? notes.trim() : null,
    };

    try {
      if (editingId) {
        // ✅ 안전: 본인 기록만 수정 가능
        const { error } = await supabase
          .from(TABLE)
          .update(payload)
          .eq("id", editingId)
          .eq("user_id", userId);

        if (error) throw error;
      } else {
        const { error } = await supabase.from(TABLE).insert(payload);
        if (error) throw error;
      }

      resetForm();
      await loadEntries();
    } catch (e: any) {
      setErr(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(row: EntryRow) {
    // ✅ 본인 기록만 편집
    if (!userId || row.user_id !== userId) return;

    setEditingId(row.id);
    setDate(row.date);
    setWeight(row.weight === null ? "" : String(row.weight));
    setBpS(row.bp_s === null ? "" : String(row.bp_s));
    setBpD(row.bp_d === null ? "" : String(row.bp_d));
    setExerciseMin(row.exercise_min === null ? "" : String(row.exercise_min));
    setPlankMin(row.plank_min === null ? "" : String(row.plank_min));
    setKneePain(row.knee_pain === null ? "0" : String(row.knee_pain));
    setNotes(row.notes ?? "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function removeRow(row: EntryRow) {
    if (!userId) return;
    if (row.user_id !== userId) return; // ✅ 본인 것만 삭제

    const ok = confirm("정말 삭제할까요?");
    if (!ok) return;

    setErr(null);
    try {
      const { error } = await supabase.from(TABLE).delete().eq("id", row.id).eq("user_id", userId);
      if (error) throw error;
      await loadEntries();
    } catch (e: any) {
      setErr(e?.message ?? "Delete failed");
    }
  }

  /** =========================
   *  UI
   *  ========================= */
  if (!session) {
    return (
      <div style={pageStyle}>
        <div style={containerStyle}>
          <div style={{ ...cardStyle, padding: 18 }}>
            <div style={{ fontSize: 34, fontWeight: 900, letterSpacing: -0.5 }}>Body Notebook</div>
            <div style={{ marginTop: 6, fontSize: 14, opacity: 0.75 }}>건강/운동/무릎 통증을 기록해봅시다.</div>

            <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
              <button
                style={authMode === "signin" ? tabOn : tabOff}
                onClick={() => setAuthMode("signin")}
                disabled={authBusy}
              >
                로그인
              </button>
              <button
                style={authMode === "signup" ? tabOn : tabOff}
                onClick={() => setAuthMode("signup")}
                disabled={authBusy}
              >
                가입
              </button>
            </div>

            <div style={{ marginTop: 14 }}>
              <div style={labelStyle}>이메일</div>
              <input style={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email" />
              <div style={{ height: 10 }} />
              <div style={labelStyle}>암호</div>
              <input
                style={inputStyle}
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                placeholder="password"
                type="password"
              />
            </div>

            <button style={primaryBtn} onClick={handleAuth} disabled={authBusy || !email || !pw}>
              {authBusy ? "처리 중..." : authMode === "signin" ? "로그인" : "가입"}
            </button>

            {err ? <div style={errStyle}>{err}</div> : null}

            <div style={{ marginTop: 12, fontSize: 12, opacity: 0.7, lineHeight: 1.4 }}>
              ✅ 로그인하면 브라우저/폰에 세션이 저장되어, 보통은 다음부터 다시 로그인 안 해도 열립니다.
            </div>
          </div>
        </div>
      </div>
    );
  }

  const meLabel = "나";
  const partnerLabel = partnerId ? "배우자" : "상대";

  return (
    <div style={pageStyle}>
      <div style={containerStyle}>
        {/* Header */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 38, fontWeight: 900, letterSpacing: -0.6 }}>Body Notebook</div>
          <div style={{ marginTop: 2, fontSize: 14, opacity: 0.75 }}>건강/운동/무릎 통증을 기록해봅시다.</div>
        </div>

        {/* Account */}
        <div style={cardStyle}>
          <div style={{ fontSize: 22, fontWeight: 900 }}>계정</div>
          <div style={{ marginTop: 8, fontSize: 13, opacity: 0.85 }}>
            현재: <b>{session.user.email}</b>
          </div>
          <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>
            모드:{" "}
            {groupId ? (
              <>
                <b>가족 공유</b> (group_id 연결됨)
              </>
            ) : (
              <>
                <b>개인</b> (group_id 없음)
              </>
            )}
            {groupRole ? <> · role: {groupRole}</> : null}
          </div>
          <button style={logoutBtn} onClick={logout}>
            로그아웃
          </button>
        </div>

        {/* Summary */}
        <div style={cardStyle}>
          <div style={{ fontSize: 22, fontWeight: 900 }}>요약</div>

          <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr", gap: 6, fontSize: 15 }}>
            <div>
              Latest (전체): <b>{latestOverall?.date ?? "-"}</b>{" "}
              {latestOverall ? (
                <span style={{ opacity: 0.75 }}>
                  ({latestOverall.user_id === userId ? meLabel : partnerLabel})
                </span>
              ) : null}
            </div>
            <div>
              Latest (내): <b>{myLatest?.date ?? "-"}</b>
            </div>
            <div>
              Weight: <b>{latestOverall?.weight ?? "-"}</b>
            </div>
            <div>
              Blood Pressure:{" "}
              <b>
                {latestOverall?.bp_s ?? "-"} / {latestOverall?.bp_d ?? "-"}
              </b>
            </div>
            <div>
              Exercise: <b>{latestOverall?.exercise_min ?? 0}</b> min
            </div>
            <div>
              Plank: <b>{latestOverall?.plank_min ?? 0}</b> min
            </div>
            <div>
              Knee pain: <b>{latestOverall?.knee_pain ?? 0}</b>
            </div>
          </div>
        </div>

        {/* Weight Chart (two people if group) */}
        <ChartCard
          title="체중 그래프"
          subtitle={`최근 ${Math.min(weightSeries.count, 30)}개 (최대 30)`}
          seriesA={{ label: meLabel, values: weightSeries.a }}
          seriesB={partnerId ? { label: partnerLabel, values: weightSeries.b } : undefined}
          xLabels={weightSeries.xLabels}
          height={170}
        />

        {/* BP Chart (Systolic) + latest D info */}
        <div style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 900 }}>혈압 그래프 (S)</div>
              <div style={{ fontSize: 13, opacity: 0.75, marginTop: 2 }}>수축(S) 기준으로 그립니다. (D는 아래 요약)</div>
            </div>
            <div style={{ fontSize: 13, opacity: 0.8, textAlign: "right" }}>
              <div>
                <b>{meLabel}</b>{" "}
                <span style={{ opacity: 0.8 }}>
                  최신 {fmtInt(bpSeries.lastA?.s ?? null)} / {fmtInt(bpSeries.lastA?.d ?? null)}
                </span>
              </div>
              {partnerId ? (
                <div>
                  <b>{partnerLabel}</b>{" "}
                  <span style={{ opacity: 0.8 }}>
                    최신 {fmtInt(bpSeries.lastB?.s ?? null)} / {fmtInt(bpSeries.lastB?.d ?? null)}
                  </span>
                </div>
              ) : null}
            </div>
          </div>

          <div style={{ marginTop: 10 }}>
            <ChartCard
              title=""
              subtitle=""
              seriesA={{ label: meLabel, values: bpSeries.aS }}
              seriesB={partnerId ? { label: partnerLabel, values: bpSeries.bS } : undefined}
              xLabels={bpSeries.xLabels}
              height={170}
            />
          </div>
        </div>

        {/* Edit / New */}
        <div style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div style={{ fontSize: 22, fontWeight: 900 }}>{editingId ? "기록 수정" : "새 기록"}</div>
            {editingId ? (
              <button style={secondaryBtn} onClick={resetForm} disabled={saving}>
                취소
              </button>
            ) : null}
          </div>

          {editingId ? (
            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
              수정 중: <b>{date}</b> (저장하면 UPDATE 됩니다)
            </div>
          ) : null}

          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            <div>
              <div style={labelStyle}>날짜</div>
              <input style={inputStyle} value={date} onChange={(e) => setDate(e.target.value)} type="date" />
            </div>

            <div>
              <div style={labelStyle}>체중</div>
              <input style={inputStyle} value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="체중 (예: 165.7)" />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <div style={labelStyle}>혈압 S</div>
                <input style={inputStyle} value={bpS} onChange={(e) => setBpS(e.target.value)} placeholder="혈압 S" />
              </div>
              <div>
                <div style={labelStyle}>혈압 D</div>
                <input style={inputStyle} value={bpD} onChange={(e) => setBpD(e.target.value)} placeholder="혈압 D" />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <div style={labelStyle}>운동(분)</div>
                <input
                  style={inputStyle}
                  value={exerciseMin}
                  onChange={(e) => setExerciseMin(e.target.value)}
                  placeholder="운동(분)"
                />
              </div>
              <div>
                <div style={labelStyle}>플랭크(분)</div>
                <input
                  style={inputStyle}
                  value={plankMin}
                  onChange={(e) => setPlankMin(e.target.value)}
                  placeholder="플랭크(분)"
                />
              </div>
            </div>

            <div>
              <div style={labelStyle}>무릎통증 (0~10)</div>
              <input style={inputStyle} value={kneePain} onChange={(e) => setKneePain(e.target.value)} placeholder="0~10" />
            </div>

            <div>
              <div style={labelStyle}>메모</div>
              <textarea style={{ ...inputStyle, height: 80, resize: "vertical" }} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="메모" />
            </div>

            <button style={primaryBtn} onClick={saveEntry} disabled={saving}>
              {saving ? "저장 중..." : editingId ? "수정 저장" : "저장"}
            </button>

            {err ? <div style={errStyle}>{err}</div> : null}
          </div>
        </div>

        {/* Recent list */}
        <div style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div style={{ fontSize: 22, fontWeight: 900 }}>최근 기록</div>
            <button style={secondaryBtn} onClick={loadEntries} disabled={loadingList}>
              {loadingList ? "불러오는 중..." : "새로고침"}
            </button>
          </div>

          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            {!entriesDesc.length ? (
              <div style={{ fontSize: 13, opacity: 0.75 }}>No entries yet</div>
            ) : (
              entriesDesc.slice(0, 30).map((r) => {
                const isMine = r.user_id === userId;
                const who = isMine ? meLabel : partnerLabel;

                return (
                  <div key={r.id} style={itemStyle}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                      <div style={{ fontSize: 18, fontWeight: 900 }}>
                        {r.date}{" "}
                        <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.7 }}>
                          ({who})
                        </span>
                      </div>
                      <div style={{ fontSize: 12, opacity: 0.65 }}>
                        {new Date(r.created_at).toLocaleString()}
                      </div>
                    </div>

                    <div style={{ marginTop: 8, fontSize: 14, lineHeight: 1.5 }}>
                      체중: <b>{r.weight ?? "-"}</b>
                      <br />
                      혈압: <b>{r.bp_s ?? "-"} / {r.bp_d ?? "-"}</b>
                      <br />
                      운동: <b>{r.exercise_min ?? 0}</b>분 · 플랭크: <b>{r.plank_min ?? 0}</b>분
                      <br />
                      무릎통증: <b>{r.knee_pain ?? 0}</b>
                      {r.notes ? (
                        <>
                          <br />
                          메모: <span style={{ opacity: 0.85 }}>{r.notes}</span>
                        </>
                      ) : null}
                    </div>

                    <div style={{ marginTop: 10, display: "flex", gap: 10 }}>
                      <button style={isMine ? editBtn : disabledBtn} onClick={() => startEdit(r)} disabled={!isMine}>
                        수정
                      </button>
                      <button style={isMine ? deleteBtn : disabledBtn} onClick={() => removeRow(r)} disabled={!isMine}>
                        삭제
                      </button>
                    </div>

                    {!isMine ? (
                      <div style={{ marginTop: 8, fontSize: 12, opacity: 0.6 }}>
                        * 상대 기록은 보기만 가능(수정/삭제 불가)
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>

          <div style={{ marginTop: 14, fontSize: 12, opacity: 0.6, textAlign: "center" }}>
            v1 • local + vercel + supabase
          </div>
        </div>
      </div>
    </div>
  );
}

/** =========================
 *  Styles
 *  ========================= */
const pageStyle: CSSProperties = {
  minHeight: "100vh",
  background: "#f6f7fb",
  color: "#111",
  padding: 18,
  display: "flex",
  justifyContent: "center",
};

const containerStyle: CSSProperties = {
  width: "100%",
  maxWidth: 720,
  display: "grid",
  gap: 14,
};

const cardStyle: CSSProperties = {
  background: "white",
  borderRadius: 18,
  padding: 16,
  boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
  border: "1px solid rgba(0,0,0,0.06)",
};

const labelStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  opacity: 0.75,
  marginBottom: 6,
};

const inputStyle: CSSProperties = {
  width: "100%",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.12)",
  padding: "12px 12px",
  fontSize: 16,
  outline: "none",
  background: "rgba(0,0,0,0.02)",
};

const primaryBtn: CSSProperties = {
  width: "100%",
  marginTop: 12,
  borderRadius: 14,
  padding: "12px 14px",
  fontSize: 16,
  fontWeight: 900,
  border: "none",
  background: "#111",
  color: "white",
  cursor: "pointer",
};

const secondaryBtn: CSSProperties = {
  borderRadius: 12,
  padding: "10px 12px",
  fontSize: 14,
  fontWeight: 800,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "white",
  cursor: "pointer",
};

const logoutBtn: CSSProperties = {
  width: "100%",
  marginTop: 12,
  borderRadius: 14,
  padding: "12px 14px",
  fontSize: 16,
  fontWeight: 900,
  border: "none",
  background: "#b00020",
  color: "white",
  cursor: "pointer",
};

const errStyle: CSSProperties = {
  marginTop: 10,
  padding: 12,
  borderRadius: 12,
  background: "rgba(176,0,32,0.08)",
  border: "1px solid rgba(176,0,32,0.25)",
  color: "#7a0015",
  fontSize: 13,
  lineHeight: 1.4,
};

const itemStyle: CSSProperties = {
  borderRadius: 16,
  border: "1px solid rgba(0,0,0,0.10)",
  padding: 14,
  background: "rgba(0,0,0,0.02)",
};

const editBtn: CSSProperties = {
  borderRadius: 12,
  padding: "10px 12px",
  fontSize: 14,
  fontWeight: 900,
  border: "none",
  background: "#111",
  color: "white",
  cursor: "pointer",
  width: 84,
};

const deleteBtn: CSSProperties = {
  borderRadius: 12,
  padding: "10px 12px",
  fontSize: 14,
  fontWeight: 900,
  border: "none",
  background: "#b00020",
  color: "white",
  cursor: "pointer",
  width: 84,
};

const disabledBtn: CSSProperties = {
  borderRadius: 12,
  padding: "10px 12px",
  fontSize: 14,
  fontWeight: 900,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "rgba(0,0,0,0.04)",
  color: "rgba(0,0,0,0.35)",
  cursor: "not-allowed",
  width: 84,
};

const tabOn: CSSProperties = {
  ...secondaryBtn,
  background: "#111",
  color: "white",
  border: "1px solid #111",
};

const tabOff: CSSProperties = {
  ...secondaryBtn,
  background: "white",
  color: "#111",
};