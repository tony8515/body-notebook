"use client";

import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
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
  knee_pain: number | null;
  notes: string | null;
  group_id: string | null;
  created_at: string;
  updated_at?: string | null;
};

type EditorState = {
  open: boolean;
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
function todayYMD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 빈 문자열이면 undefined(=업데이트 안함), 숫자면 number/null(입력은 했지만 비우면 null) */
function toNumUndef(v: string): number | undefined {
  const s = v.trim();
  if (s === "") return undefined;
  const n = Number(s);
  if (Number.isNaN(n)) return undefined;
  return n;
}

function clampIntUndef(v: string, min: number, max: number): number | undefined {
  const n = toNumUndef(v);
  if (n === undefined) return undefined;
  const i = Math.round(n);
  return Math.max(min, Math.min(max, i));
}

function asStr(v: any): string {
  return typeof v === "string" ? v : "";
}

function fmtNumOrDash(n: number | null | undefined) {
  if (n === null || n === undefined) return "-";
  return String(n);
}

function fmtBP(s: number | null | undefined, d: number | null | undefined) {
  if (!s || !d) return "- / -";
  return `${s} / ${d}`;
}

function rowToEditor(row: EntryRow): EditorState {
  return {
    open: false,
    date: row.date,
    weight: row.weight === null ? "" : String(row.weight),
    bp_s: row.bp_s === null ? "" : String(row.bp_s),
    bp_d: row.bp_d === null ? "" : String(row.bp_d),
    exercise_min: row.exercise_min === null ? "" : String(row.exercise_min),
    plank_min: row.plank_min === null ? "" : String(row.plank_min),
    knee_pain: row.knee_pain === null ? "" : String(row.knee_pain),
    notes: row.notes ?? "",
  };
}

/** =========================
 *  UI Styles
 *  ========================= */
const styles = {
  page: {
    maxWidth: 980,
    margin: "24px auto",
    padding: "0 16px 40px",
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji","Segoe UI Emoji"',
    color: "#111827",
  } as React.CSSProperties,
  title: { fontSize: 44, fontWeight: 800, margin: "6px 0 4px" } as React.CSSProperties,
  subtitle: { margin: "0 0 18px", color: "#6b7280" } as React.CSSProperties,

  card: {
    background: "#f3f4f6",
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    border: "1px solid #e5e7eb",
  } as React.CSSProperties,

  row: { display: "flex", gap: 12, flexWrap: "wrap" } as React.CSSProperties,
  col: { flex: "1 1 280px", minWidth: 260 } as React.CSSProperties,

  h2: { margin: "0 0 10px", fontSize: 22, fontWeight: 800 } as React.CSSProperties,
  label: { fontSize: 12, color: "#6b7280", marginBottom: 6 } as React.CSSProperties,

  input: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #d1d5db",
    outline: "none",
    background: "white",
    fontSize: 14,
  } as React.CSSProperties,

  textarea: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #d1d5db",
    outline: "none",
    background: "white",
    fontSize: 14,
    minHeight: 70,
    resize: "vertical" as const,
  },

  buttonRed: {
    width: "100%",
    background: "#b91c1c",
    color: "white",
    border: "none",
    borderRadius: 12,
    padding: "12px 14px",
    fontSize: 16,
    fontWeight: 800,
    cursor: "pointer",
  } as React.CSSProperties,

  buttonGray: {
    background: "#111827",
    color: "white",
    border: "none",
    borderRadius: 12,
    padding: "10px 12px",
    fontSize: 14,
    fontWeight: 800,
    cursor: "pointer",
  } as React.CSSProperties,

  buttonGhost: {
    background: "transparent",
    border: "1px solid #d1d5db",
    borderRadius: 12,
    padding: "10px 12px",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
  } as React.CSSProperties,

  banner: {
    background: "#fff7ed",
    border: "1px solid #fed7aa",
    color: "#9a3412",
    padding: "10px 12px",
    borderRadius: 12,
    marginBottom: 10,
    fontSize: 14,
  } as React.CSSProperties,

  listItem: {
    background: "white",
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  } as React.CSSProperties,

  listHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
  } as React.CSSProperties,

  small: { fontSize: 12, color: "#6b7280" } as React.CSSProperties,

  pillRow: { display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6 } as React.CSSProperties,
  pill: {
    fontSize: 12,
    color: "#111827",
    background: "#f9fafb",
    border: "1px solid #e5e7eb",
    padding: "4px 8px",
    borderRadius: 999,
  } as React.CSSProperties,
};

/** =========================
 *  Chart helper
 *  ========================= */
function ChartCard(props: {
  title: string;
  subtitle?: string;
  data: any[];
  yLabel?: string;
  lines: { key: string; name: string; color: string }[];
  height?: number;
}) {
  const { title, subtitle, data, yLabel, lines, height = 240 } = props;

  return (
    <div style={styles.card}>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 18, fontWeight: 900 }}>{title}</div>
        {subtitle ? <div style={styles.small}>{subtitle}</div> : null}
      </div>

      {data.length < 2 ? (
        <div style={styles.small}>데이터가 2개 이상 있어야 그래프가 표시됩니다.</div>
      ) : (
        <div style={{ width: "100%", height }}>
          <ResponsiveContainer>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis
                domain={["auto", "auto"]}
                label={
                  yLabel
                    ? { value: yLabel, angle: -90, position: "insideLeft" as const }
                    : undefined
                }
              />
              <Tooltip />
              <Legend />
              {lines.map((ln) => (
                <Line
                  key={ln.key}
                  type="monotone"
                  dataKey={ln.key}
                  name={ln.name}
                  stroke={ln.color}
                  strokeWidth={3}
                  dot={{ r: 3 }}
                  connectNulls={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

/** =========================
 *  Main Page
 *  ========================= */
export default function Page() {
  // Auth
  const [session, setSession] = useState<Session | null>(null);
  const me = session?.user?.id ?? null;

  // Login form
  const [email, setEmail] = useState("tony8515@gmail.com");
  const [password, setPassword] = useState("");

  // Group + spouse
  const [groupId, setGroupId] = useState<string | null>(null);
  const [spouseId, setSpouseId] = useState<string | null>(null);

  // Data
  const [myRows, setMyRows] = useState<EntryRow[]>([]);
  const [spouseRows, setSpouseRows] = useState<EntryRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  // New entry form (나)
  const [fDate, setFDate] = useState(todayYMD());
  const [fWeight, setFWeight] = useState("");
  const [fBpS, setFBpS] = useState("");
  const [fBpD, setFBpD] = useState("");
  const [fExercise, setFExercise] = useState("");
  const [fPlank, setFPlank] = useState("");
  const [fKnee, setFKnee] = useState("");
  const [fNotes, setFNotes] = useState("");

  // Editors (최근 기록 수정)
  const [editMine, setEditMine] = useState<Record<string, EditorState>>({});
  const [editSpouse, setEditSpouse] = useState<Record<string, EditorState>>({});

  /** -------------------------
   *  auth bootstrap
   *  ------------------------- */
  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session ?? null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  /** -------------------------
   *  load everything when logged in
   *  ------------------------- */
  useEffect(() => {
    if (!me) return;
    reloadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  async function onSignIn() {
    setBanner(null);
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } catch (e: any) {
      setBanner(e?.message ?? "로그인 실패");
    } finally {
      setBusy(false);
    }
  }

  async function onSignOut() {
    setBanner(null);
    setBusy(true);
    try {
      await supabase.auth.signOut();
      setGroupId(null);
      setSpouseId(null);
      setMyRows([]);
      setSpouseRows([]);
      setEditMine({});
      setEditSpouse({});
    } catch (e: any) {
      setBanner(e?.message ?? "로그아웃 실패");
    } finally {
      setBusy(false);
    }
  }

  /** -------------------------
   *  Core: reload
   *  ------------------------- */
  async function reloadAll() {
    if (!me) return;
    setBusy(true);
    setBanner(null);

    try {
      // 1) 내 최신 row에서 group_id 추정
      const { data: latestMine, error: e1 } = await supabase
        .from("body_entries")
        .select("*")
        .eq("user_id", me)
        .order("date", { ascending: false })
        .limit(1);

      if (e1) throw e1;

      const g = latestMine?.[0]?.group_id ?? null;
      setGroupId(g);

      // 2) 내 최근 기록 30개
      const { data: mine, error: e2 } = await supabase
        .from("body_entries")
        .select("*")
        .eq("user_id", me)
        .order("date", { ascending: false })
        .limit(30);

      if (e2) throw e2;

      const mineRows = (mine ?? []) as EntryRow[];
      setMyRows(mineRows);

      // 3) 가족 공유면: 동일 group_id의 다른 user_id 기록도 일부 로드해서 배우자 식별
      if (g) {
        const { data: grp, error: e3 } = await supabase
          .from("body_entries")
          .select("*")
          .eq("group_id", g)
          .order("date", { ascending: false })
          .limit(200);

        if (e3) throw e3;

        const groupRows = (grp ?? []) as EntryRow[];
        const other = groupRows.find((r) => r.user_id !== me)?.user_id ?? null;
        setSpouseId(other);

        if (other) {
          const spouseOnly = groupRows.filter((r) => r.user_id === other).slice(0, 30);
          setSpouseRows(spouseOnly);
        } else {
          setSpouseRows([]);
        }
      } else {
        setSpouseRows([]);
      }

      // editors 초기화(필요시)
      setEditMine({});
      setEditSpouse({});
    } catch (e: any) {
      setBanner(e?.message ?? "데이터 로드 실패");
    } finally {
      setBusy(false);
    }
  }

  /** -------------------------
   *  Save (중요) : 기존 row를 읽어서 merge 후 upsert
   *  - 빈칸은 '수정 안함'으로 처리(=기존값 유지)
   *  - 그래서 혈압만 넣어도 weight가 사라지지 않습니다
   *  ------------------------- */
  async function upsertMerged(params: {
    targetUserId: string;
    date: string;
    groupIdToUse: string | null;
    patch: Partial<EntryRow>;
  }) {
    const { targetUserId, date, groupIdToUse, patch } = params;

    // 기존 row 1개 가져오기
    const { data: existing, error: e1 } = await supabase
      .from("body_entries")
      .select("*")
      .eq("user_id", targetUserId)
      .eq("date", date)
      .limit(1);

    if (e1) throw e1;
    const old = (existing?.[0] as EntryRow | undefined) ?? null;

    // group_id는 기존값 우선, 없으면 groupIdToUse
    const finalGroupId = old?.group_id ?? groupIdToUse ?? null;

    // 최종 row: old 기반 + patch 반영
    const merged: any = {
      ...(old ?? {
        user_id: targetUserId,
        date,
      }),
      ...patch,
      user_id: targetUserId,
      date,
      group_id: finalGroupId,
    };

    // upsert (user_id + date unique 라고 가정)
    const { error: e2 } = await supabase
      .from("body_entries")
      .upsert(merged, { onConflict: "user_id,date" });

    if (e2) throw e2;
  }

  async function onSaveNew() {
    if (!me) return;
    setBanner(null);

    if (!fDate.trim()) {
      setBanner("날짜를 입력하세요.");
      return;
    }

    setBusy(true);
    try {
      // 빈칸은 undefined로 만들어 '수정 안함' 처리
      const patch: Partial<EntryRow> = {};

      const w = toNumUndef(fWeight);
      if (w !== undefined) patch.weight = w;

      const s = clampIntUndef(fBpS, 40, 300);
      if (s !== undefined) patch.bp_s = s;

      const d = clampIntUndef(fBpD, 20, 200);
      if (d !== undefined) patch.bp_d = d;

      const ex = clampIntUndef(fExercise, 0, 1440);
      if (ex !== undefined) patch.exercise_min = ex;

      const pl = clampIntUndef(fPlank, 0, 1440);
      if (pl !== undefined) patch.plank_min = pl;

      const kn = clampIntUndef(fKnee, 0, 10);
      if (kn !== undefined) patch.knee_pain = kn;

      const nt = fNotes.trim();
      if (nt !== "") patch.notes = nt;
      // notes를 비우고 싶으면 "공백 1칸" 같은 방식은 싫죠. 필요하면 삭제버튼 추가 가능.

      await upsertMerged({
        targetUserId: me,
        date: fDate,
        groupIdToUse: groupId,
        patch,
      });

      // 폼은 날짜 유지하고 나머지 비우기(원하시면 날짜도 today로 리셋 가능)
      setFWeight("");
      setFBpS("");
      setFBpD("");
      setFExercise("");
      setFPlank("");
      setFKnee("");
      setFNotes("");

      await reloadAll();
    } catch (e: any) {
      setBanner(e?.message ?? "저장 실패");
    } finally {
      setBusy(false);
    }
  }

  async function onSaveEdit(which: "me" | "spouse", row: EntryRow) {
    const targetUserId = which === "me" ? me : spouseId;
    if (!targetUserId) return;

    const stateMap = which === "me" ? editMine : editSpouse;
    const st = stateMap[row.date];
    if (!st) return;

    setBanner(null);
    setBusy(true);
    try {
      const patch: Partial<EntryRow> = {};

      const w = toNumUndef(st.weight);
      if (w !== undefined) patch.weight = w;

      const s = clampIntUndef(st.bp_s, 40, 300);
      if (s !== undefined) patch.bp_s = s;

      const d = clampIntUndef(st.bp_d, 20, 200);
      if (d !== undefined) patch.bp_d = d;

      const ex = clampIntUndef(st.exercise_min, 0, 1440);
      if (ex !== undefined) patch.exercise_min = ex;

      const pl = clampIntUndef(st.plank_min, 0, 1440);
      if (pl !== undefined) patch.plank_min = pl;

      const kn = clampIntUndef(st.knee_pain, 0, 10);
      if (kn !== undefined) patch.knee_pain = kn;

      const nt = st.notes.trim();
      if (nt !== "") patch.notes = nt;

      await upsertMerged({
        targetUserId,
        date: row.date,
        groupIdToUse: groupId,
        patch,
      });

      // 편집 닫기
      if (which === "me") {
        setEditMine((prev) => ({
          ...prev,
          [row.date]: { ...prev[row.date], open: false },
        }));
      } else {
        setEditSpouse((prev) => ({
          ...prev,
          [row.date]: { ...prev[row.date], open: false },
        }));
      }

      await reloadAll();
    } catch (e: any) {
      setBanner(e?.message ?? "수정 저장 실패");
    } finally {
      setBusy(false);
    }
  }

  function toggleEdit(which: "me" | "spouse", row: EntryRow) {
    if (which === "me") {
      setEditMine((prev) => {
        const cur = prev[row.date] ?? rowToEditor(row);
        return { ...prev, [row.date]: { ...cur, open: !cur.open } };
      });
    } else {
      setEditSpouse((prev) => {
        const cur = prev[row.date] ?? rowToEditor(row);
        return { ...prev, [row.date]: { ...cur, open: !cur.open } };
      });
    }
  }

  function setEditField(
    which: "me" | "spouse",
    date: string,
    key: keyof EditorState,
    value: string | boolean
  ) {
    if (which === "me") {
      setEditMine((prev) => ({
        ...prev,
        [date]: { ...(prev[date] ?? ({} as any)), [key]: value } as any,
      }));
    } else {
      setEditSpouse((prev) => ({
        ...prev,
        [date]: { ...(prev[date] ?? ({} as any)), [key]: value } as any,
      }));
    }
  }

  /** -------------------------
   *  Summary
   *  ------------------------- */
  const latestMe = myRows[0] ?? null;
  const latestSp = spouseRows[0] ?? null;

  /** -------------------------
   *  Charts data (체중 + 혈압만)
   *  - 날짜별로 me/spouse 값을 한 row에 합쳐서 overlay
   *  ------------------------- */
  const chartDays = useMemo(() => {
    // 최근 30개 내역의 date를 모아 정렬(오름차순)
    const dates = new Set<string>();
    myRows.forEach((r) => dates.add(r.date));
    spouseRows.forEach((r) => dates.add(r.date));
    return Array.from(dates).sort((a, b) => (a < b ? -1 : 1)).slice(-30);
  }, [myRows, spouseRows]);

  const weightChartData = useMemo(() => {
    const map = new Map<string, any>();
    chartDays.forEach((d) => map.set(d, { date: d, me: null as any, spouse: null as any }));

    for (const r of myRows) {
      if (map.has(r.date) && r.weight !== null) map.get(r.date).me = r.weight;
    }
    for (const r of spouseRows) {
      if (map.has(r.date) && r.weight !== null) map.get(r.date).spouse = r.weight;
    }
    return Array.from(map.values());
  }, [chartDays, myRows, spouseRows]);

  const bpSChartData = useMemo(() => {
    const map = new Map<string, any>();
    chartDays.forEach((d) => map.set(d, { date: d, me: null as any, spouse: null as any }));
    for (const r of myRows) {
      if (map.has(r.date) && r.bp_s !== null) map.get(r.date).me = r.bp_s;
    }
    for (const r of spouseRows) {
      if (map.has(r.date) && r.bp_s !== null) map.get(r.date).spouse = r.bp_s;
    }
    return Array.from(map.values()).filter((x) => x.me !== null || x.spouse !== null);
  }, [chartDays, myRows, spouseRows]);

  const bpDChartData = useMemo(() => {
    const map = new Map<string, any>();
    chartDays.forEach((d) => map.set(d, { date: d, me: null as any, spouse: null as any }));
    for (const r of myRows) {
      if (map.has(r.date) && r.bp_d !== null) map.get(r.date).me = r.bp_d;
    }
    for (const r of spouseRows) {
      if (map.has(r.date) && r.bp_d !== null) map.get(r.date).spouse = r.bp_d;
    }
    return Array.from(map.values()).filter((x) => x.me !== null || x.spouse !== null);
  }, [chartDays, myRows, spouseRows]);

  /** -------------------------
   *  Render
   *  ------------------------- */
  if (!session) {
    return (
      <div style={styles.page}>
        <div style={styles.title}>Body Notebook</div>
        <div style={styles.subtitle}>건강/운동/무릎 통증을 기록해봅시다.</div>

        {banner ? <div style={styles.banner}>{banner}</div> : null}

        <div style={styles.card}>
          <div style={styles.h2}>로그인</div>

          <div style={{ marginBottom: 10 }}>
            <div style={styles.label}>이메일</div>
            <input
              style={styles.input}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={styles.label}>비밀번호</div>
            <input
              style={styles.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>

          <button style={styles.buttonRed} onClick={onSignIn} disabled={busy}>
            {busy ? "로그인 중..." : "로그인"}
          </button>

          <div style={{ marginTop: 10, ...styles.small }}>
            * 이메일/비번은 Supabase Auth에 등록된 계정으로 로그인합니다.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.title}>Body Notebook</div>
      <div style={styles.subtitle}>건강/운동/무릎 통증을 기록해봅시다.</div>

      {banner ? <div style={styles.banner}>{banner}</div> : null}

      {/* Account */}
      <div style={styles.card}>
        <div style={styles.h2}>계정</div>
        <div style={{ ...styles.small, marginBottom: 6 }}>
          현재: <b>{session.user.email}</b>
        </div>
        <div style={{ ...styles.small, marginBottom: 12 }}>
          모드:{" "}
          <b>
            {groupId ? `가족 공유 (group_id 연결됨)` : "개인"}
          </b>
          {groupId ? (
            <>
              {" "}
              · role: <b>owner</b>
            </>
          ) : null}
        </div>

        <button style={styles.buttonRed} onClick={onSignOut} disabled={busy}>
          로그아웃
        </button>
      </div>

      {/* New Entry Form (항상 표시) */}
      <div style={styles.card}>
        <div style={styles.h2}>새 기록 입력</div>

        <div style={styles.row}>
          <div style={styles.col}>
            <div style={styles.label}>날짜</div>
            <input
              style={styles.input}
              value={fDate}
              onChange={(e) => setFDate(e.target.value)}
              placeholder="YYYY-MM-DD"
            />
          </div>

          <div style={styles.col}>
            <div style={styles.label}>체중 (lb)</div>
            <input
              style={styles.input}
              value={fWeight}
              onChange={(e) => setFWeight(e.target.value)}
              placeholder="예: 165.7"
              inputMode="decimal"
            />
          </div>
        </div>

        <div style={{ height: 10 }} />

        <div style={styles.row}>
          <div style={styles.col}>
            <div style={styles.label}>혈압 수축(S)</div>
            <input
              style={styles.input}
              value={fBpS}
              onChange={(e) => setFBpS(e.target.value)}
              placeholder="예: 120"
              inputMode="numeric"
            />
          </div>

          <div style={styles.col}>
            <div style={styles.label}>혈압 이완(D)</div>
            <input
              style={styles.input}
              value={fBpD}
              onChange={(e) => setFBpD(e.target.value)}
              placeholder="예: 80"
              inputMode="numeric"
            />
          </div>
        </div>

        <div style={{ height: 10 }} />

        <div style={styles.row}>
          <div style={styles.col}>
            <div style={styles.label}>운동(분)</div>
            <input
              style={styles.input}
              value={fExercise}
              onChange={(e) => setFExercise(e.target.value)}
              placeholder="예: 30"
              inputMode="numeric"
            />
          </div>

          <div style={styles.col}>
            <div style={styles.label}>플랭크(분)</div>
            <input
              style={styles.input}
              value={fPlank}
              onChange={(e) => setFPlank(e.target.value)}
              placeholder="예: 2"
              inputMode="numeric"
            />
          </div>

          <div style={styles.col}>
            <div style={styles.label}>무릎통증(0-10)</div>
            <input
              style={styles.input}
              value={fKnee}
              onChange={(e) => setFKnee(e.target.value)}
              placeholder="예: 3"
              inputMode="numeric"
            />
          </div>
        </div>

        <div style={{ height: 10 }} />

        <div>
          <div style={styles.label}>메모</div>
          <textarea
            style={styles.textarea}
            value={fNotes}
            onChange={(e) => setFNotes(e.target.value)}
            placeholder="짧게 메모..."
          />
        </div>

        <div style={{ height: 12 }} />

        <button style={styles.buttonRed} onClick={onSaveNew} disabled={busy}>
          {busy ? "저장 중..." : "저장"}
        </button>

        <div style={{ marginTop: 10, ...styles.small }}>
          * 같은 날짜는 자동으로 수정 저장(upsert)됩니다. (빈칸은 기존값 유지)
        </div>
      </div>

      {/* Summary */}
      <div style={styles.card}>
        <div style={styles.h2}>요약</div>
        <div style={styles.row}>
          <div style={styles.col}>
            <div style={{ fontWeight: 900, marginBottom: 6 }}>나</div>
            <div style={styles.small}>
              Latest(나): <b>{latestMe?.date ?? "-"}</b>
            </div>
            <div style={styles.small}>
              Weight: <b>{fmtNumOrDash(latestMe?.weight)}</b>
            </div>
            <div style={styles.small}>
              Blood Pressure: <b>{fmtBP(latestMe?.bp_s, latestMe?.bp_d)}</b>
            </div>
          </div>

          <div style={styles.col}>
            <div style={{ fontWeight: 900, marginBottom: 6 }}>배우자</div>
            <div style={styles.small}>
              Latest(배우자): <b>{latestSp?.date ?? "-"}</b>
            </div>
            <div style={styles.small}>
              Weight: <b>{fmtNumOrDash(latestSp?.weight)}</b>
            </div>
            <div style={styles.small}>
              Blood Pressure: <b>{fmtBP(latestSp?.bp_s, latestSp?.bp_d)}</b>
            </div>
          </div>
        </div>
      </div>

      {/* Charts (그래프를 최근기록 위에) */}
      <ChartCard
        title="체중 그래프"
        subtitle="최근 기록(최대 30) · 배우자=빨간색"
        data={weightChartData.filter((x) => x.me !== null || x.spouse !== null)}
        lines={[
          { key: "me", name: "나", color: "#2563eb" },
          { key: "spouse", name: "배우자", color: "#dc2626" },
        ]}
        yLabel="lb"
      />

      <ChartCard
        title="혈압 그래프 (수축 S)"
        subtitle="배우자=빨간색"
        data={bpSChartData}
        lines={[
          { key: "me", name: "나", color: "#2563eb" },
          { key: "spouse", name: "배우자", color: "#dc2626" },
        ]}
        yLabel="S"
      />

      <ChartCard
        title="혈압 그래프 (이완 D)"
        subtitle="배우자=빨간색"
        data={bpDChartData}
        lines={[
          { key: "me", name: "나", color: "#2563eb" },
          { key: "spouse", name: "배우자", color: "#dc2626" },
        ]}
        yLabel="D"
      />

      {/* Recent list (항상 표시 + 수정/저장 버튼) */}
      <div style={styles.card}>
        <div style={styles.h2}>최근 기록</div>

        {/* Mine */}
        <div style={{ fontWeight: 900, marginBottom: 8 }}>최근 기록 (나)</div>
        {myRows.length === 0 ? (
          <div style={styles.small}>내 기록이 없습니다.</div>
        ) : (
          myRows.map((r) => {
            const st = editMine[r.date] ?? rowToEditor(r);
            const open = st.open;

            return (
              <div key={`me-${r.date}`} style={styles.listItem}>
                <div style={styles.listHeader}>
                  <div>
                    <div style={{ fontWeight: 900 }}>{r.date}</div>
                    <div style={styles.pillRow}>
                      <span style={styles.pill}>체중: {fmtNumOrDash(r.weight)}</span>
                      <span style={styles.pill}>혈압: {fmtBP(r.bp_s, r.bp_d)}</span>
                      <span style={styles.pill}>운동: {fmtNumOrDash(r.exercise_min)}분</span>
                      <span style={styles.pill}>플랭크: {fmtNumOrDash(r.plank_min)}분</span>
                      <span style={styles.pill}>무릎: {fmtNumOrDash(r.knee_pain)}</span>
                    </div>
                    {r.notes ? <div style={{ ...styles.small, marginTop: 6 }}>메모: {r.notes}</div> : null}
                  </div>

                  <div style={{ display: "flex", gap: 8 }}>
                    <button style={styles.buttonGhost} onClick={() => toggleEdit("me", r)}>
                      {open ? "닫기" : "수정"}
                    </button>
                  </div>
                </div>

                {open ? (
                  <div style={{ marginTop: 12 }}>
                    <div style={styles.row}>
                      <div style={styles.col}>
                        <div style={styles.label}>체중(lb)</div>
                        <input
                          style={styles.input}
                          value={st.weight}
                          onChange={(e) => setEditField("me", r.date, "weight", e.target.value)}
                          placeholder="빈칸이면 기존값 유지"
                        />
                      </div>
                      <div style={styles.col}>
                        <div style={styles.label}>혈압 수축(S)</div>
                        <input
                          style={styles.input}
                          value={st.bp_s}
                          onChange={(e) => setEditField("me", r.date, "bp_s", e.target.value)}
                          placeholder="빈칸이면 기존값 유지"
                        />
                      </div>
                      <div style={styles.col}>
                        <div style={styles.label}>혈압 이완(D)</div>
                        <input
                          style={styles.input}
                          value={st.bp_d}
                          onChange={(e) => setEditField("me", r.date, "bp_d", e.target.value)}
                          placeholder="빈칸이면 기존값 유지"
                        />
                      </div>
                    </div>

                    <div style={{ height: 10 }} />

                    <div style={styles.row}>
                      <div style={styles.col}>
                        <div style={styles.label}>운동(분)</div>
                        <input
                          style={styles.input}
                          value={st.exercise_min}
                          onChange={(e) => setEditField("me", r.date, "exercise_min", e.target.value)}
                          placeholder="빈칸이면 기존값 유지"
                        />
                      </div>
                      <div style={styles.col}>
                        <div style={styles.label}>플랭크(분)</div>
                        <input
                          style={styles.input}
                          value={st.plank_min}
                          onChange={(e) => setEditField("me", r.date, "plank_min", e.target.value)}
                          placeholder="빈칸이면 기존값 유지"
                        />
                      </div>
                      <div style={styles.col}>
                        <div style={styles.label}>무릎통증(0-10)</div>
                        <input
                          style={styles.input}
                          value={st.knee_pain}
                          onChange={(e) => setEditField("me", r.date, "knee_pain", e.target.value)}
                          placeholder="빈칸이면 기존값 유지"
                        />
                      </div>
                    </div>

                    <div style={{ height: 10 }} />

                    <div>
                      <div style={styles.label}>메모</div>
                      <textarea
                        style={styles.textarea}
                        value={st.notes}
                        onChange={(e) => setEditField("me", r.date, "notes", e.target.value)}
                        placeholder="빈칸이면 기존값 유지(메모 삭제 기능은 필요하면 추가)"
                      />
                    </div>

                    <div style={{ height: 10 }} />

                    <div style={{ display: "flex", gap: 8 }}>
                      <button style={styles.buttonGray} onClick={() => onSaveEdit("me", r)} disabled={busy}>
                        {busy ? "저장중..." : "저장"}
                      </button>
                      <button
                        style={styles.buttonGhost}
                        onClick={() =>
                          setEditMine((prev) => ({ ...prev, [r.date]: { ...rowToEditor(r), open: false } }))
                        }
                      >
                        취소
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })
        )}

        <div style={{ height: 14 }} />

        {/* Spouse */}
        <div style={{ fontWeight: 900, marginBottom: 8 }}>최근 기록 (배우자)</div>
        {!groupId ? (
          <div style={styles.small}>개인 모드에서는 배우자 기록을 표시하지 않습니다.</div>
        ) : !spouseId ? (
          <div style={styles.small}>같은 group_id를 쓰는 다른 사용자 기록이 아직 없습니다.</div>
        ) : spouseRows.length === 0 ? (
          <div style={styles.small}>배우자 기록이 없습니다.</div>
        ) : (
          spouseRows.map((r) => {
            const st = editSpouse[r.date] ?? rowToEditor(r);
            const open = st.open;

            return (
              <div key={`sp-${r.date}`} style={styles.listItem}>
                <div style={styles.listHeader}>
                  <div>
                    <div style={{ fontWeight: 900 }}>{r.date}</div>
                    <div style={styles.pillRow}>
                      <span style={styles.pill}>체중: {fmtNumOrDash(r.weight)}</span>
                      <span style={styles.pill}>혈압: {fmtBP(r.bp_s, r.bp_d)}</span>
                      <span style={styles.pill}>운동: {fmtNumOrDash(r.exercise_min)}분</span>
                      <span style={styles.pill}>플랭크: {fmtNumOrDash(r.plank_min)}분</span>
                      <span style={styles.pill}>무릎: {fmtNumOrDash(r.knee_pain)}</span>
                    </div>
                    {r.notes ? <div style={{ ...styles.small, marginTop: 6 }}>메모: {r.notes}</div> : null}
                  </div>

                  <div style={{ display: "flex", gap: 8 }}>
                    <button style={styles.buttonGhost} onClick={() => toggleEdit("spouse", r)}>
                      {open ? "닫기" : "수정"}
                    </button>
                  </div>
                </div>

                {open ? (
                  <div style={{ marginTop: 12 }}>
                    <div style={styles.row}>
                      <div style={styles.col}>
                        <div style={styles.label}>체중(lb)</div>
                        <input
                          style={styles.input}
                          value={st.weight}
                          onChange={(e) => setEditField("spouse", r.date, "weight", e.target.value)}
                          placeholder="빈칸이면 기존값 유지"
                        />
                      </div>
                      <div style={styles.col}>
                        <div style={styles.label}>혈압 수축(S)</div>
                        <input
                          style={styles.input}
                          value={st.bp_s}
                          onChange={(e) => setEditField("spouse", r.date, "bp_s", e.target.value)}
                          placeholder="빈칸이면 기존값 유지"
                        />
                      </div>
                      <div style={styles.col}>
                        <div style={styles.label}>혈압 이완(D)</div>
                        <input
                          style={styles.input}
                          value={st.bp_d}
                          onChange={(e) => setEditField("spouse", r.date, "bp_d", e.target.value)}
                          placeholder="빈칸이면 기존값 유지"
                        />
                      </div>
                    </div>

                    <div style={{ height: 10 }} />

                    <div style={styles.row}>
                      <div style={styles.col}>
                        <div style={styles.label}>운동(분)</div>
                        <input
                          style={styles.input}
                          value={st.exercise_min}
                          onChange={(e) => setEditField("spouse", r.date, "exercise_min", e.target.value)}
                          placeholder="빈칸이면 기존값 유지"
                        />
                      </div>
                      <div style={styles.col}>
                        <div style={styles.label}>플랭크(분)</div>
                        <input
                          style={styles.input}
                          value={st.plank_min}
                          onChange={(e) => setEditField("spouse", r.date, "plank_min", e.target.value)}
                          placeholder="빈칸이면 기존값 유지"
                        />
                      </div>
                      <div style={styles.col}>
                        <div style={styles.label}>무릎통증(0-10)</div>
                        <input
                          style={styles.input}
                          value={st.knee_pain}
                          onChange={(e) => setEditField("spouse", r.date, "knee_pain", e.target.value)}
                          placeholder="빈칸이면 기존값 유지"
                        />
                      </div>
                    </div>

                    <div style={{ height: 10 }} />

                    <div>
                      <div style={styles.label}>메모</div>
                      <textarea
                        style={styles.textarea}
                        value={st.notes}
                        onChange={(e) => setEditField("spouse", r.date, "notes", e.target.value)}
                        placeholder="빈칸이면 기존값 유지"
                      />
                    </div>

                    <div style={{ height: 10 }} />

                    <div style={{ display: "flex", gap: 8 }}>
                      <button style={styles.buttonGray} onClick={() => onSaveEdit("spouse", r)} disabled={busy}>
                        {busy ? "저장중..." : "저장"}
                      </button>
                      <button
                        style={styles.buttonGhost}
                        onClick={() =>
                          setEditSpouse((prev) => ({ ...prev, [r.date]: { ...rowToEditor(r), open: false } }))
                        }
                      >
                        취소
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })
        )}

        <div style={{ marginTop: 8 }}>
          <button style={styles.buttonGhost} onClick={reloadAll} disabled={busy}>
            {busy ? "새로고침 중..." : "새로고침"}
          </button>
        </div>
      </div>
    </div>
  );
}