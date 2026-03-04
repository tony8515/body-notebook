"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

const TABLE = "body_entries";

type EntryRow = {
  id: string;
  user_id: string;
  date: string; // YYYY-MM-DD
  weight: number | string | null;
  bp_s: number | null;
  bp_d: number | null;
  exercise_min: number | null;
  plank_min: number | null;
  knee_pain: number | null;
  notes: string | null;
  created_at: string;
};

type WeightPoint = { date: string; weight: number };

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

function intOrNull(v: string) {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function toLocalDateTime(s: string) {
  // Supabase timestamptz → 브라우저 로컬 시간
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString();
}

export default function Home() {
  /** =========================
   *  Auth state
   *  ========================= */
  const [session, setSession] = useState<any>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");

  /** =========================
   *  Data state
   *  ========================= */
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [saving, setSaving] = useState(false);

  // editing
  const [editingId, setEditingId] = useState<string | null>(null);

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
    maxWidth: 520,
  };

  const titleStyle: React.CSSProperties = {
    fontSize: 34,
    fontWeight: 900,
    margin: "12px 0 6px",
    letterSpacing: -0.5,
  };

  const subStyle: React.CSSProperties = {
    opacity: 0.75,
    marginTop: 0,
    marginBottom: 14,
  };

  const cardStyle: React.CSSProperties = {
    background: "#fff",
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
    border: "1px solid rgba(0,0,0,0.06)",
  };

  const h2Style: React.CSSProperties = {
    fontSize: 18,
    fontWeight: 900,
    margin: "0 0 10px",
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "12px 12px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.16)",
    background: "#fff",
    color: "#111",
    outline: "none",
    fontSize: 16,
  };

  const grid2Style: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
  };

  const btnStyle: React.CSSProperties = {
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.14)",
    background: "#111",
    color: "#fff",
    fontWeight: 800,
    cursor: "pointer",
  };

  const btnGhostStyle: React.CSSProperties = {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.14)",
    background: "#fff",
    color: "#111",
    fontWeight: 800,
    cursor: "pointer",
  };

  const btnDangerStyle: React.CSSProperties = {
    ...btnStyle,
    background: "#d32f2f",
    border: "1px solid rgba(0,0,0,0.08)",
  };

  const btnSmallStyle: React.CSSProperties = {
    padding: "8px 10px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.14)",
    background: "#111",
    color: "#fff",
    fontWeight: 800,
    cursor: "pointer",
    fontSize: 13,
  };

  const btnSmallDangerStyle: React.CSSProperties = {
    ...btnSmallStyle,
    background: "#d32f2f",
  };

  const muted: React.CSSProperties = { opacity: 0.75, fontSize: 13 };

  /** =========================
   *  Auth bootstrap + listener
   *  ========================= */
  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session ?? null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession ?? null);
    });

    return () => {
      mounted = false;
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
        .select("*")
        .eq("user_id", uid)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      setEntries((data ?? []) as EntryRow[]);
    } catch (e: any) {
      console.error(e);
      alert("목록 로드 실패: " + (e?.message ?? String(e)));
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
    }
  }

  async function signIn() {
    setAuthBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
      if (error) throw error;

      // ✅ PC/폰 모두 로그인 성공 시 입력값 비우기
      setEmail("");
      setPw("");

      // 목록은 useEffect(userId)에서 자동 로드됨
    } catch (e: any) {
      console.error(e);
      alert("로그인 실패: " + (e?.message ?? String(e)));
    } finally {
      setAuthBusy(false);
    }
  }

  async function signOut() {
    setAuthBusy(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setEditingId(null);
      setDate(todayYMD());
      setWeight("");
      setBpS("");
      setBpD("");
      setExerciseMin("");
      setPlankMin("");
      setKneePain("0");
      setNotes("");
    } catch (e: any) {
      console.error(e);
      alert("로그아웃 실패: " + (e?.message ?? String(e)));
    } finally {
      setAuthBusy(false);
    }
  }

  /** =========================
   *  Summary
   *  ========================= */
  const latest = useMemo(() => {
    if (!entries.length) return null;
    // date desc + created_at desc로 받아오므로 0번이 최신
    return entries[0];
  }, [entries]);

  /** =========================
   *  Weight points for chart
   *  ========================= */
  const weightPoints = useMemo<WeightPoint[]>(() => {
    const pts = entries
      .map((e) => {
        const raw = e.weight;
        const w =
          typeof raw === "number"
            ? raw
            : typeof raw === "string"
            ? Number(raw)
            : NaN;

        // 0 이하면 그래프에서 제외 (원치 않으면 이 줄 지워도 됨)
        return Number.isFinite(w) && w > 0 ? { date: e.date, weight: w } : null;
      })
      .filter(Boolean) as WeightPoint[];

    // 오래된 → 최신
    pts.sort((a, b) => a.date.localeCompare(b.date));

    // 최근 30개만
    return pts.length > 30 ? pts.slice(pts.length - 30) : pts;
  }, [entries]);

  /** =========================
   *  CRUD actions
   *  ========================= */
  function fillFormForEdit(row: EntryRow) {
    setEditingId(row.id);
    setDate(row.date);
    setWeight(row.weight == null ? "" : String(row.weight));
    setBpS(row.bp_s == null ? "" : String(row.bp_s));
    setBpD(row.bp_d == null ? "" : String(row.bp_d));
    setExerciseMin(row.exercise_min == null ? "" : String(row.exercise_min));
    setPlankMin(row.plank_min == null ? "" : String(row.plank_min));
    setKneePain(row.knee_pain == null ? "0" : String(row.knee_pain));
    setNotes(row.notes ?? "");
    // 화면 위쪽 폼으로 시선 이동(모바일)
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
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

  async function saveEntry() {
    if (!userId) {
      alert("먼저 로그인하세요.");
      return;
    }

    // 최소 검증 (체중은 선택 입력 가능)
    if (!date) {
      alert("날짜를 입력하세요.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        user_id: userId,
        date,
        weight: numOrNull(weight),
        bp_s: intOrNull(bpS),
        bp_d: intOrNull(bpD),
        exercise_min: intOrNull(exerciseMin),
        plank_min: intOrNull(plankMin),
        knee_pain: intOrNull(kneePain) ?? 0,
        notes: notes.trim() ? notes.trim() : null,
      };

      if (editingId) {
        const { error } = await supabase.from(TABLE).update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from(TABLE).insert(payload);
        if (error) throw error;
      }

      // 성공 후 초기화 + 재조회
      cancelEdit();
      await fetchEntries(userId);
    } catch (e: any) {
      console.error(e);
      alert("저장 실패: " + (e?.message ?? String(e)));
    } finally {
      setSaving(false);
    }
  }

  async function deleteEntry(id: string) {
    if (!userId) return;
    const ok = confirm("정말 삭제할까요?");
    if (!ok) return;

    try {
      const { error } = await supabase.from(TABLE).delete().eq("id", id);
      if (error) throw error;
      await fetchEntries(userId);
    } catch (e: any) {
      console.error(e);
      alert("삭제 실패: " + (e?.message ?? String(e)));
    }
  }

  /** =========================
   *  Simple SVG chart renderer
   *  ========================= */
  const chart = useMemo(() => {
    if (weightPoints.length < 2) return null;

    const W = 640;
    const H = 220;
    const padL = 44;
    const padR = 18;
    const padT = 16;
    const padB = 34;

    const ys = weightPoints.map((p) => p.weight);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    // 같은 값만 있을 때 대비 (0으로 나누기 방지)
    const span = Math.max(0.0001, maxY - minY);
    const yMin = minY - span * 0.1;
    const yMax = maxY + span * 0.1;

    const x0 = padL;
    const x1 = W - padR;
    const y0 = H - padB;
    const y1 = padT;

    const n = weightPoints.length;
    const xStep = n === 1 ? 0 : (x1 - x0) / (n - 1);

    const toX = (i: number) => x0 + i * xStep;
    const toY = (v: number) => y0 - ((v - yMin) / (yMax - yMin)) * (y0 - y1);

    const d = weightPoints
      .map((p, i) => `${i === 0 ? "M" : "L"} ${toX(i).toFixed(2)} ${toY(p.weight).toFixed(2)}`)
      .join(" ");

    // y축 눈금 3개
    const ticks = [yMin, (yMin + yMax) / 2, yMax];

    const labelLeft = (v: number) => v.toFixed(1);

    const first = weightPoints[0].date;
    const last = weightPoints[n - 1].date;

    return (
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="190" role="img" aria-label="체중 그래프">
        {/* axes */}
        <line x1={x0} y1={y1} x2={x0} y2={y0} stroke="rgba(0,0,0,0.35)" strokeWidth="1" />
        <line x1={x0} y1={y0} x2={x1} y2={y0} stroke="rgba(0,0,0,0.35)" strokeWidth="1" />

        {/* y ticks */}
        {ticks.map((t, idx) => {
          const y = toY(t);
          return (
            <g key={idx}>
              <line x1={x0} y1={y} x2={x1} y2={y} stroke="rgba(0,0,0,0.08)" strokeWidth="1" />
              <text x={x0 - 10} y={y + 4} textAnchor="end" fontSize="12" fill="rgba(0,0,0,0.65)">
                {labelLeft(t)}
              </text>
            </g>
          );
        })}

        {/* line */}
        <path d={d} fill="none" stroke="#111" strokeWidth="2.5" />

        {/* points */}
        {weightPoints.map((p, i) => (
          <circle key={p.date} cx={toX(i)} cy={toY(p.weight)} r="3.2" fill="#111" />
        ))}

        {/* x labels */}
        <text x={x0} y={H - 10} textAnchor="start" fontSize="12" fill="rgba(0,0,0,0.65)">
          {first}
        </text>
        <text x={x1} y={H - 10} textAnchor="end" fontSize="12" fill="rgba(0,0,0,0.65)">
          {last}
        </text>
      </svg>
    );
  }, [weightPoints]);

  /** =========================
   *  Render
   *  ========================= */
  return (
    <div style={pageStyle}>
      <div style={wrapStyle}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <h1 style={titleStyle}>Body Notebook</h1>
        </div>
        <p style={subStyle}>건강/운동/무릎 통증을 기록해봅시다.</p>

        {/* Auth */}
        <div style={cardStyle}>
          <h2 style={h2Style}>계정</h2>

          {!session ? (
            <>
              <div style={{ display: "grid", gap: 10 }}>
                <input
                  style={inputStyle}
                  placeholder="이메일"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
                <input
                  style={inputStyle}
                  placeholder="비밀번호"
                  type="password"
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                  autoComplete="current-password"
                />
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
                <button style={btnStyle} onClick={signIn} disabled={authBusy}>
                  로그인
                </button>
                <button style={btnGhostStyle} onClick={signUp} disabled={authBusy}>
                  가입
                </button>
              </div>
              <div style={{ marginTop: 10, ...muted }}>현재: 로그인 안됨</div>
            </>
          ) : (
            <>
              <div style={{ ...muted, marginBottom: 10 }}>현재: {session?.user?.email}</div>
              <button style={btnDangerStyle} onClick={signOut} disabled={authBusy}>
                로그아웃
              </button>
            </>
          )}
        </div>

        {/* Summary */}
        <div style={cardStyle}>
          <h2 style={h2Style}>요약</h2>
          {!latest ? (
            <div style={muted}>{loadingList ? "불러오는 중..." : "No entries yet"}</div>
          ) : (
            <div style={{ lineHeight: 1.7 }}>
              <div>
                <b>Latest:</b> {latest.date}
              </div>
              <div>
                <b>Weight:</b> {latest.weight ?? "-"}
              </div>
              <div>
                <b>Blood Pressure:</b> {(latest.bp_s ?? "-") + " / " + (latest.bp_d ?? "-")}
              </div>
              <div>
                <b>Exercise:</b> {latest.exercise_min ?? 0} min
              </div>
              <div>
                <b>Plank:</b> {latest.plank_min ?? 0} min
              </div>
              <div>
                <b>Knee pain:</b> {latest.knee_pain ?? 0}
              </div>
            </div>
          )}
        </div>

        {/* Weight chart */}
        <div style={cardStyle}>
          <h2 style={h2Style}>체중 그래프</h2>
          {weightPoints.length < 2 ? (
            <div style={muted}>체중 데이터가 2개 이상 있어야 그래프가 표시됩니다.</div>
          ) : (
            <>
              {chart}
              <div style={{ ...muted, marginTop: 6 }}>
                최근 {weightPoints.length}개 표시 (최대 30개)
              </div>
            </>
          )}
        </div>

        {/* Form */}
        <div style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <h2 style={h2Style}>{editingId ? "기록 수정" : "새 기록"}</h2>
            {editingId ? (
              <button style={btnGhostStyle} onClick={cancelEdit} disabled={saving}>
                취소
              </button>
            ) : null}
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            <input
              style={inputStyle}
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />

            <input
              style={inputStyle}
              inputMode="decimal"
              placeholder="체중 (예: 165.7)"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
            />

            <div style={grid2Style}>
              <input
                style={inputStyle}
                inputMode="numeric"
                placeholder="혈압 S"
                value={bpS}
                onChange={(e) => setBpS(e.target.value)}
              />
              <input
                style={inputStyle}
                inputMode="numeric"
                placeholder="혈압 D"
                value={bpD}
                onChange={(e) => setBpD(e.target.value)}
              />
            </div>

            <div style={grid2Style}>
              <input
                style={inputStyle}
                inputMode="numeric"
                placeholder="운동(분)"
                value={exerciseMin}
                onChange={(e) => setExerciseMin(e.target.value)}
              />
              <input
                style={inputStyle}
                inputMode="numeric"
                placeholder="플랭크(분)"
                value={plankMin}
                onChange={(e) => setPlankMin(e.target.value)}
              />
            </div>

            <input
              style={inputStyle}
              inputMode="numeric"
              placeholder="무릎통증 (0~10)"
              value={kneePain}
              onChange={(e) => setKneePain(e.target.value)}
            />

            <input
              style={inputStyle}
              placeholder="메모"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />

            <button style={btnStyle} onClick={saveEntry} disabled={saving || !userId}>
              {saving ? "처리중..." : editingId ? "수정 저장" : "저장"}
            </button>

            {!userId ? <div style={muted}>로그인 후 저장할 수 있습니다.</div> : null}
          </div>
        </div>

        {/* Recent list */}
        <div style={cardStyle}>
          <h2 style={h2Style}>최근 기록</h2>

          {loadingList ? (
            <div style={muted}>불러오는 중...</div>
          ) : entries.length === 0 ? (
            <div style={muted}>No entries yet</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {entries.map((e) => (
                <div
                  key={e.id}
                  style={{
                    border: "1px solid rgba(0,0,0,0.10)",
                    borderRadius: 14,
                    padding: 12,
                    background: "#fff",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ fontWeight: 900, fontSize: 16 }}>{e.date}</div>
                    <div style={{ fontSize: 12, opacity: 0.65 }}>{toLocalDateTime(e.created_at)}</div>
                  </div>

                  <div style={{ marginTop: 8, lineHeight: 1.7 }}>
                    <div>체중: {e.weight ?? "-"}</div>
                    <div>혈압: {(e.bp_s ?? "-") + " / " + (e.bp_d ?? "-")}</div>
                    <div>운동: {e.exercise_min ?? 0}분</div>
                    <div>플랭크: {e.plank_min ?? 0}분</div>
                    <div>무릎통증: {e.knee_pain ?? 0}</div>
                    {e.notes ? <div style={{ marginTop: 6, opacity: 0.85 }}>메모: {e.notes}</div> : null}
                  </div>

                  <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                    <button style={btnSmallStyle} onClick={() => fillFormForEdit(e)} disabled={!userId}>
                      수정
                    </button>
                    <button style={btnSmallDangerStyle} onClick={() => deleteEntry(e.id)} disabled={!userId}>
                      삭제
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ ...muted, textAlign: "center", paddingBottom: 18 }}>
          v1 • local + vercel + supabase
        </div>
      </div>
    </div>
  );
}