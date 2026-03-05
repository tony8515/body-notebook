"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createClient, type Session } from "@supabase/supabase-js";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

/** =========================
 *  Supabase Client
 *  ========================= */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true },
});

/** =========================
 *  Types
 *  ========================= */
type EntryRow = {
  id: string;
  user_id: string;
  group_id: string | null;
  date: string; // YYYY-MM-DD
  weight: number | null;
  bp_s: number | null;
  bp_d: number | null;
  created_at: string;
};

type ChartPoint = {
  date: string;
  value: number;
};

function todayYMD() {
  const d = new Date();
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

function fmtBP(s: number | null, d: number | null) {
  if (s == null || d == null) return "- / -";
  return `${s} / ${d}`;
}

/** =========================
 *  Small UI helpers
 *  ========================= */
const styles = {
  wrap: { maxWidth: 980, margin: "0 auto", padding: "24px 16px" },
  title: { fontSize: 44, fontWeight: 900, marginBottom: 4 },
  subtitle: { opacity: 0.75, marginBottom: 18 },
  card: {
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(0,0,0,0.08)",
    borderRadius: 18,
    padding: 18,
    marginBottom: 14,
  } as React.CSSProperties,
  button: {
    width: "100%",
    padding: "14px 16px",
    borderRadius: 12,
    border: "none",
    background: "#9b0d2a",
    color: "white",
    fontWeight: 800,
    cursor: "pointer",
  } as React.CSSProperties,
  input: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(0,0,0,0.15)",
    background: "white",
  } as React.CSSProperties,
  grid2: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
  } as React.CSSProperties,
};

function ChartCard(props: {
  title: string;
  subtitle?: string;
  data: ChartPoint[];
  yLabel?: string;
}) {
  const { title, subtitle, data } = props;

  return (
    <div style={styles.card}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 900 }}>{title}</div>
          {subtitle ? (
            <div style={{ opacity: 0.7, marginTop: 4 }}>{subtitle}</div>
          ) : null}
        </div>
      </div>

      <div style={{ height: 260, marginTop: 10 }}>
        {data.length < 2 ? (
          <div style={{ opacity: 0.75, padding: 12 }}>
            데이터가 2개 이상 있어야 그래프가 표시됩니다.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis domain={["auto", "auto"]} />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="value"
                strokeWidth={3}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
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

  /** ---------- auth bootstrap ---------- */
  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session ?? null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      setSession(s);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function signIn() {
    setBusy(true);
    setBanner(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
    } catch (e: any) {
      setBanner(`로그인 실패: ${e?.message ?? String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    setBanner(null);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (e: any) {
      setBanner(`로그아웃 실패: ${e?.message ?? String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  /** ---------- load group_id and spouse_id from body_entries ---------- */
  useEffect(() => {
    if (!me) {
      setGroupId(null);
      setSpouseId(null);
      setMyRows([]);
      setSpouseRows([]);
      return;
    }

    (async () => {
      setBanner(null);

      // 1) 내 최신 row에서 group_id 추출
      const { data: gRows, error: gErr } = await supabase
        .from("body_entries")
        .select("group_id, created_at")
        .eq("user_id", me)
        .not("group_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(1);

      if (gErr) {
        setBanner(`group_id 조회 실패: ${gErr.message}`);
        setGroupId(null);
        setSpouseId(null);
        return;
      }

      const gid = gRows?.[0]?.group_id ?? null;
      setGroupId(gid);

      if (!gid) {
        // 그룹이 아직 없다면(개인모드) 배우자 없음
        setSpouseId(null);
        return;
      }

      // 2) 같은 group_id 안에서 나 말고 다른 user_id 1명 찾기(배우자)
      const { data: uRows, error: uErr } = await supabase
        .from("body_entries")
        .select("user_id")
        .eq("group_id", gid)
        .neq("user_id", me)
        .limit(1);

      if (uErr) {
        setBanner(`배우자 user_id 조회 실패: ${uErr.message}`);
        setSpouseId(null);
        return;
      }

      const sid = uRows?.[0]?.user_id ?? null;
      setSpouseId(sid);
    })();
  }, [me]);

  /** ---------- load rows (my + spouse) ---------- */
  useEffect(() => {
    if (!me) return;

    (async () => {
      setBusy(true);
      setBanner(null);
      try {
        // 내 최근 30개 (date 기준)
        const { data: mine, error: e1 } = await supabase
          .from("body_entries")
          .select("id,user_id,group_id,date,weight,bp_s,bp_d,created_at")
          .eq("user_id", me)
          .order("date", { ascending: true })
          .limit(30);

        if (e1) throw e1;
        setMyRows((mine ?? []) as EntryRow[]);

        // 배우자 최근 30개
        if (spouseId) {
          const { data: spouse, error: e2 } = await supabase
            .from("body_entries")
            .select("id,user_id,group_id,date,weight,bp_s,bp_d,created_at")
            .eq("user_id", spouseId)
            .order("date", { ascending: true })
            .limit(30);

          if (e2) throw e2;
          setSpouseRows((spouse ?? []) as EntryRow[]);
        } else {
          setSpouseRows([]);
        }
      } catch (e: any) {
        setBanner(`데이터 로딩 실패: ${e?.message ?? String(e)}`);
      } finally {
        setBusy(false);
      }
    })();
  }, [me, spouseId]);

  /** ---------- latest summary ---------- */
  const myLatest = useMemo(() => {
    if (myRows.length === 0) return null;
    return myRows[myRows.length - 1];
  }, [myRows]);

  const spouseLatest = useMemo(() => {
    if (spouseRows.length === 0) return null;
    return spouseRows[spouseRows.length - 1];
  }, [spouseRows]);

  /** ---------- chart series (B: separate charts) ---------- */
  const myWeightSeries: ChartPoint[] = useMemo(() => {
    return myRows
      .filter((r) => r.weight != null)
      .map((r) => ({ date: r.date.slice(5), value: r.weight as number }));
  }, [myRows]);

  const spouseWeightSeries: ChartPoint[] = useMemo(() => {
    return spouseRows
      .filter((r) => r.weight != null)
      .map((r) => ({ date: r.date.slice(5), value: r.weight as number }));
  }, [spouseRows]);

  const myBPS: ChartPoint[] = useMemo(() => {
    return myRows
      .filter((r) => r.bp_s != null)
      .map((r) => ({ date: r.date.slice(5), value: r.bp_s as number }));
  }, [myRows]);

  const myBPD: ChartPoint[] = useMemo(() => {
    return myRows
      .filter((r) => r.bp_d != null)
      .map((r) => ({ date: r.date.slice(5), value: r.bp_d as number }));
  }, [myRows]);

  const spouseBPS: ChartPoint[] = useMemo(() => {
    return spouseRows
      .filter((r) => r.bp_s != null)
      .map((r) => ({ date: r.date.slice(5), value: r.bp_s as number }));
  }, [spouseRows]);

  const spouseBPD: ChartPoint[] = useMemo(() => {
    return spouseRows
      .filter((r) => r.bp_d != null)
      .map((r) => ({ date: r.date.slice(5), value: r.bp_d as number }));
  }, [spouseRows]);

  /** ---------- render ---------- */
  if (!session) {
    return (
      <div style={styles.wrap}>
        <div style={styles.title}>Body Notebook</div>
        <div style={styles.subtitle}>건강/운동/무릎 통증을 기록해봅시다.</div>

        {banner ? (
          <div
            style={{
              ...styles.card,
              borderColor: "rgba(255,0,0,0.25)",
              background: "rgba(255,0,0,0.06)",
            }}
          >
            {banner}
          </div>
        ) : null}

        <div style={styles.card}>
          <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 10 }}>
            로그인
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            <input
              style={styles.input}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email"
            />
            <input
              style={styles.input}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="password"
              type="password"
            />
            <button style={styles.button} onClick={signIn} disabled={busy}>
              {busy ? "처리중..." : "로그인"}
            </button>
            <div style={{ opacity: 0.65, fontSize: 13 }}>
              * 이메일/비번은 Supabase Auth에 등록된 계정으로 로그인합니다.
            </div>
          </div>
        </div>
      </div>
    );
  }

  const modeLabel = groupId ? "가족 공유 (group_id 연결됨)" : "개인";

  return (
    <div style={styles.wrap}>
      <div style={styles.title}>Body Notebook</div>
      <div style={styles.subtitle}>건강/운동/무릎 통증을 기록해봅시다.</div>

      {banner ? (
        <div
          style={{
            ...styles.card,
            borderColor: "rgba(255,0,0,0.25)",
            background: "rgba(255,0,0,0.06)",
          }}
        >
          {banner}
        </div>
      ) : null}

      {/* Account */}
      <div style={styles.card}>
        <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 8 }}>
          계정
        </div>
        <div style={{ opacity: 0.85 }}>현재: {session.user.email}</div>
        <div style={{ opacity: 0.85 }}>
          모드: <b>{modeLabel}</b> · role: owner
        </div>
        <div style={{ marginTop: 10 }}>
          <button style={styles.button} onClick={signOut} disabled={busy}>
            로그아웃
          </button>
        </div>
      </div>

      {/* Summary */}
      <div style={styles.card}>
        <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 8 }}>
          요약
        </div>

        <div style={styles.grid2}>
          <div>
            <div style={{ fontWeight: 900, marginBottom: 6 }}>나</div>
            <div>Latest (내): {myLatest?.date ?? "-"}</div>
            <div>Weight: {myLatest?.weight ?? "-"}</div>
            <div>Blood Pressure: {fmtBP(myLatest?.bp_s ?? null, myLatest?.bp_d ?? null)}</div>
          </div>

          <div>
            <div style={{ fontWeight: 900, marginBottom: 6 }}>배우자</div>
            <div>Latest (배우자): {spouseLatest?.date ?? "-"}</div>
            <div>Weight: {spouseLatest?.weight ?? "-"}</div>
            <div>
              Blood Pressure:{" "}
              {fmtBP(spouseLatest?.bp_s ?? null, spouseLatest?.bp_d ?? null)}
            </div>
          </div>
        </div>
      </div>

      {/* B: Weight split */}
      <ChartCard
        title="체중 그래프 (나)"
        subtitle={`최근 ${myWeightSeries.length}개 (최대 30)`}
        data={myWeightSeries}
      />

      <ChartCard
        title="체중 그래프 (배우자)"
        subtitle={`최근 ${spouseWeightSeries.length}개 (최대 30)`}
        data={spouseWeightSeries}
      />

      {/* BP split */}
      <ChartCard
        title="혈압 그래프 (수축 S · 나)"
        subtitle="Systolic"
        data={myBPS}
      />
      <ChartCard
        title="혈압 그래프 (이완 D · 나)"
        subtitle="Diastolic"
        data={myBPD}
      />

      <ChartCard
        title="혈압 그래프 (수축 S · 배우자)"
        subtitle="Systolic"
        data={spouseBPS}
      />
      <ChartCard
        title="혈압 그래프 (이완 D · 배우자)"
        subtitle="Diastolic"
        data={spouseBPD}
      />
    </div>
  );
}