"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient, type Session } from "@supabase/supabase-js";

/** =========================
 *  Supabase Client
 *  ========================= */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true },
});

const TABLE = "body_entries";

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
  created_at: string;
};

function todayYMD() {
  const d = new Date();
  // local date -> YYYY-MM-DD (local)
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toNumOrNull(v: string): number | null {
  const t = (v ?? "").trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function fmtDT(dt: string) {
  const d = new Date(dt);
  if (Number.isNaN(d.getTime())) return dt;
  return d.toLocaleString();
}

export default function Home() {
  /** =========================
   *  Auth state
   *  ========================= */
  const [session, setSession] = useState<Session | null>(null);
  const [authBusy, setAuthBusy] = useState(false);

  // login form
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");

  /** =========================
   *  Data state
   *  ========================= */
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [saving, setSaving] = useState(false);

  // form fields
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
   *  Styles (LIGHT THEME)
   *  ========================= */
  const pageStyle: React.CSSProperties = {
    minHeight: "100vh",
    background: "#f6f7fb",
    color: "#111",
    padding: 18,
    display: "flex",
    justifyContent: "center",
  };

  const wrapStyle: React.CSSProperties = {
    width: "100%",
    maxWidth: 560,
  };

  const cardStyle: React.CSSProperties = {
    background: "#ffffff",
    border: "1px solid rgba(0,0,0,0.10)",
    borderRadius: 18,
    padding: 16,
    marginTop: 14,
    boxShadow: "0 6px 18px rgba(0,0,0,0.08)",
  };

  const h2Style: React.CSSProperties = {
    fontSize: 22,
    fontWeight: 900,
    margin: 0,
    marginBottom: 10,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 13,
    opacity: 0.75,
    marginBottom: 6,
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "14px 14px",
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.14)",
    background: "#ffffff",
    color: "#111",
    outline: "none",
    fontSize: 18,
  };

  const row2Style: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
  };

  const btnStyle: React.CSSProperties = {
    padding: "12px 16px",
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.16)",
    background: "#f3f4f6",
    color: "#111",
    fontSize: 16,
    fontWeight: 800,
    cursor: "pointer",
    minWidth: 120,
  };

  const btnPrimaryStyle: React.CSSProperties = {
    ...btnStyle,
    background: "#111827",
    color: "#fff",
    border: "1px solid rgba(0,0,0,0.18)",
  };

  const btnDangerStyle: React.CSSProperties = {
    ...btnStyle,
    background: "#b91c1c",
    color: "#fff",
    border: "1px solid rgba(0,0,0,0.18)",
  };

  const smallText: React.CSSProperties = {
    fontSize: 13,
    opacity: 0.8,
  };

  /** =========================
   *  Auth bootstrap
   *  ========================= */
  useEffect(() => {
    let alive = true;

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!alive) return;
      setSession(data.session ?? null);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess ?? null);
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  /** =========================
   *  Fetch entries
   *  ========================= */
  async function fetchEntries(uid: string) {
    setLoadingList(true);
    try {
      const { data, error } = await supabase
        .from(TABLE)
        .select(
          "id,user_id,date,weight,bp_s,bp_d,exercise_min,plank_min,knee_pain,notes,created_at"
        )
        .eq("user_id", uid)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) throw error;
      setEntries((data as EntryRow[]) ?? []);
    } catch (e: any) {
      console.error(e);
      alert("목록 불러오기 실패: " + (e?.message ?? String(e)));
    } finally {
      setLoadingList(false);
    }
  }

  useEffect(() => {
    if (!userId) {
      setEntries([]);
      return;
    }
    fetchEntries(userId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  /** =========================
   *  Auth actions
   *  ========================= */
  async function signUp() {
    setAuthBusy(true);
    try {
      const { error } = await supabase.auth.signUp({ email, password: pw });
      if (error) throw error;
      alert("가입 요청 완료! 이메일 확인(Confirm) 후 로그인하세요.");
    } catch (e: any) {
      console.error(e);
      alert("가입 실패: " + (e?.message ?? String(e)));
    } finally {
      setAuthBusy(false);
      // 모바일 자동완성/포커스 문제 방지
      setEmail("");
      setPw("");
      setTimeout(() => {
        (document.activeElement as HTMLElement | null)?.blur?.();
      }, 0);
    }
  }

  async function signIn() {
    setAuthBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password: pw,
      });
      if (error) throw error;
    } catch (e: any) {
      console.error(e);
      alert("로그인 실패: " + (e?.message ?? String(e)));
    } finally {
      setAuthBusy(false);
      setEmail("");
      setPw("");
      setTimeout(() => {
        (document.activeElement as HTMLElement | null)?.blur?.();
      }, 0);
    }
  }

  async function signOut() {
    setAuthBusy(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      alert("로그아웃 완료");
    } catch (e: any) {
      console.error(e);
      alert("로그아웃 실패: " + (e?.message ?? String(e)));
    } finally {
      setAuthBusy(false);
      setEmail("");
      setPw("");
    }
  }

  /** =========================
   *  Save entry
   *  ========================= */
  async function saveEntry() {
    if (!userId) {
      alert("먼저 로그인하세요.");
      return;
    }
    if (!date) {
      alert("날짜를 입력하세요.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        user_id: userId,
        date,
        weight: toNumOrNull(weight),
        bp_s: toNumOrNull(bpS),
        bp_d: toNumOrNull(bpD),
        exercise_min: toNumOrNull(exerciseMin),
        plank_min: toNumOrNull(plankMin),
        knee_pain: toNumOrNull(kneePain),
        notes: notes.trim() ? notes.trim() : null,
      };

      const { error } = await supabase.from(TABLE).insert(payload);
      if (error) throw error;

      // 폼 리셋
      setWeight("");
      setBpS("");
      setBpD("");
      setExerciseMin("");
      setPlankMin("");
      setKneePain("0");
      setNotes("");

      await fetchEntries(userId);
    } catch (e: any) {
      console.error(e);
      alert("저장 실패: " + (e?.message ?? String(e)));
    } finally {
      // ✅ 어떤 경우에도 “처리중” 해제
      setSaving(false);
      setTimeout(() => {
        (document.activeElement as HTMLElement | null)?.blur?.();
      }, 0);
    }
  }

  /** =========================
   *  Summary
   *  ========================= */
  const latest = useMemo(() => {
    if (!entries.length) return null;
    return entries[0];
  }, [entries]);

  /** =========================
   *  UI
   *  ========================= */
  return (
    <div style={pageStyle}>
      <div style={wrapStyle}>
        <h1 style={{ fontSize: 34, fontWeight: 950, margin: 0 }}>
          Body Notebook
        </h1>
        <p style={{ marginTop: 6, marginBottom: 0, opacity: 0.85 }}>
          건강/운동/무릎 통증을 기록해봅시다.
        </p>

        {/* Account */}
        <div style={cardStyle}>
          <h2 style={h2Style}>계정</h2>

          {session ? (
            <div style={{ display: "grid", gap: 10 }}>
              <div style={smallText}>현재: {session.user.email ?? "(unknown)"}</div>
              <button
                style={btnDangerStyle}
                onClick={signOut}
                disabled={authBusy}
              >
                {authBusy ? "처리중..." : "로그아웃"}
              </button>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              <div style={labelStyle}>로그인 (이메일로 로그인)</div>

              <input
                style={inputStyle}
                placeholder="이메일"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                inputMode="email"
              />
              <input
                style={inputStyle}
                placeholder="비밀번호"
                type="password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                autoComplete="current-password"
              />

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  style={btnPrimaryStyle}
                  onClick={signIn}
                  disabled={authBusy}
                >
                  {authBusy ? "처리중..." : "로그인"}
                </button>
                <button style={btnStyle} onClick={signUp} disabled={authBusy}>
                  {authBusy ? "처리중..." : "가입"}
                </button>
              </div>

              <div style={smallText}>
                가입 후 이메일에서 Confirm을 눌러야 로그인이 됩니다.
              </div>
            </div>
          )}
        </div>

        {/* Summary */}
        <div style={cardStyle}>
          <h2 style={h2Style}>요약</h2>

          {!userId ? (
            <div style={smallText}>로그인하면 요약/최근기록이 보입니다.</div>
          ) : loadingList ? (
            <div style={smallText}>불러오는 중...</div>
          ) : !latest ? (
            <div style={smallText}>No entries yet</div>
          ) : (
            <div style={{ lineHeight: 1.7 }}>
              <div>
                Latest: <b>{latest.date}</b>
              </div>
              <div>Weight: {latest.weight ?? "-"}</div>
              <div>
                Blood Pressure: {latest.bp_s ?? "-"} / {latest.bp_d ?? "-"}
              </div>
              <div>Exercise: {latest.exercise_min ?? 0} min</div>
              <div>Plank: {latest.plank_min ?? 0} min</div>
              <div>Knee pain: {latest.knee_pain ?? 0}</div>
            </div>
          )}
        </div>

        {/* New entry (BEFORE recent list) */}
        <div style={cardStyle}>
          <h2 style={h2Style}>새 기록</h2>

          <div style={{ display: "grid", gap: 10 }}>
            <input
              style={inputStyle}
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />

            <input
              style={inputStyle}
              placeholder="체중 (예: 165.7)"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              inputMode="decimal"
            />

            <div style={row2Style}>
              <input
                style={inputStyle}
                placeholder="혈압 S"
                value={bpS}
                onChange={(e) => setBpS(e.target.value)}
                inputMode="numeric"
              />
              <input
                style={inputStyle}
                placeholder="혈압 D"
                value={bpD}
                onChange={(e) => setBpD(e.target.value)}
                inputMode="numeric"
              />
            </div>

            <div style={row2Style}>
              <input
                style={inputStyle}
                placeholder="운동(분)"
                value={exerciseMin}
                onChange={(e) => setExerciseMin(e.target.value)}
                inputMode="numeric"
              />
              <input
                style={inputStyle}
                placeholder="플랭크(분)"
                value={plankMin}
                onChange={(e) => setPlankMin(e.target.value)}
                inputMode="numeric"
              />
            </div>

            <input
              style={inputStyle}
              placeholder="무릎통증 (0~10)"
              value={kneePain}
              onChange={(e) => setKneePain(e.target.value)}
              inputMode="numeric"
            />

            <input
              style={inputStyle}
              placeholder="메모"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />

            <button
              style={btnPrimaryStyle}
              onClick={saveEntry}
              disabled={saving || !userId}
            >
              {saving ? "처리중..." : "저장"}
            </button>

            {!userId ? (
              <div style={smallText}>저장하려면 로그인해야 합니다.</div>
            ) : null}
          </div>
        </div>

        {/* Recent entries list (BOTTOM) */}
        <div style={cardStyle}>
          <h2 style={h2Style}>최근 기록</h2>

          {!userId ? (
            <div style={smallText}>로그인 후 확인 가능합니다.</div>
          ) : loadingList ? (
            <div style={smallText}>불러오는 중...</div>
          ) : entries.length === 0 ? (
            <div style={smallText}>기록이 없습니다.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {entries.slice(0, 50).map((r) => (
                <div
                  key={r.id}
                  style={{
                    border: "1px solid rgba(0,0,0,0.10)",
                    borderRadius: 14,
                    padding: 12,
                    background: "#ffffff",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      alignItems: "baseline",
                    }}
                  >
                    <div style={{ fontWeight: 950 }}>{r.date}</div>
                    <div style={{ fontSize: 13, opacity: 0.7 }}>
                      {fmtDT(r.created_at)}
                    </div>
                  </div>

                  <div style={{ marginTop: 6, opacity: 0.95, lineHeight: 1.7 }}>
                    <div>체중: {r.weight ?? "-"}</div>
                    <div>혈압: {r.bp_s ?? "-"} / {r.bp_d ?? "-"}</div>
                    <div>운동: {r.exercise_min ?? 0}분</div>
                    <div>플랭크: {r.plank_min ?? 0}분</div>
                    <div>무릎통증: {r.knee_pain ?? 0}</div>
                    {r.notes ? <div>메모: {r.notes}</div> : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ height: 26 }} />
      </div>
    </div>
  );
}