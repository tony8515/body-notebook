
"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";

type EntryRow = {
  id: string;
  user_id: string;
  date: string;
  weight: number | null;
  bp_s: number | null;
  bp_d: number | null;
  exercise_min: number | null;
  plank_min: number | null;
  knee_pain: number | null;
  notes: string | null;
  created_at?: string | null;
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

type SessionLike = {
  user?: {
    id: string;
    email?: string;
  };
};

function todayYMD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toNumOrNull(v: string) {
  const t = v.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function fmtDate(value?: string | null) {
  if (!value) return "-";
  return value;
}

function safeText(v?: string | null) {
  return v?.trim() ? v : "";
}

function getWeightDomain(email?: string) {
  const e = (email || "").toLowerCase();
  if (e === "tony8515@gmail.com") return [150, 175] as [number, number];
  if (e === "sunny8515@gmail.com") return [110, 130] as [number, number];
  return ["auto", "auto"] as ["auto", "auto"];
}

function cardShadow() {
  return "0 8px 24px rgba(15, 23, 42, 0.08)";
}

function inputStyle(): React.CSSProperties {
  return {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid #d7deea",
    outline: "none",
    fontSize: 16,
    background: "#fff",
    boxSizing: "border-box",
  };
}

function labelStyle(): React.CSSProperties {
  return {
    fontSize: 14,
    color: "#475569",
    marginBottom: 6,
    fontWeight: 600,
  };
}

function sectionTitleStyle(): React.CSSProperties {
  return {
    fontSize: 22,
    fontWeight: 800,
    margin: "0 0 14px 0",
    color: "#0f172a",
  };
}

function StatCard({
  title,
  value,
  sub,
}: {
  title: string;
  value: string;
  sub?: string;
}) {
  return (
    <div
      style={{
        background: "#ffffff",
        borderRadius: 22,
        padding: 22,
        boxShadow: cardShadow(),
        border: "1px solid #e8eef6",
      }}
    >
      <div style={{ fontSize: 15, color: "#64748b", marginBottom: 10 }}>{title}</div>
      <div style={{ fontSize: 42, fontWeight: 800, color: "#0f172a", lineHeight: 1.1 }}>
        {value}
      </div>
      {sub ? (
        <div style={{ fontSize: 14, color: "#64748b", marginTop: 8 }}>{sub}</div>
      ) : null}
    </div>
  );
}

function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "#ffffff",
        borderRadius: 24,
        padding: 20,
        boxShadow: cardShadow(),
        border: "1px solid #e8eef6",
      }}
    >
      <div style={{ ...sectionTitleStyle(), marginBottom: 16 }}>{title}</div>
      {children}
    </div>
  );
}

export default function Page() {
  const [session, setSession] = useState<SessionLike | null>(null);
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);

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

  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        const { data } = await supabase.auth.getSession();
        if (!mounted) return;
        const sess = (data?.session as SessionLike | null) || null;
        setSession(sess);

        if (sess?.user?.id) {
          await loadEntries(sess.user.id);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, sess) => {
      const nextSession = (sess as SessionLike | null) || null;
      setSession(nextSession);

      if (nextSession?.user?.id) {
        await loadEntries(nextSession.user.id);
      } else {
        setEntries([]);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function loadEntries(userId: string) {
    const { data, error } = await supabase
      .from("body_entries")
      .select("*")
      .eq("user_id", userId)
      .order("date", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      setMessage(`불러오기 오류: ${error.message}`);
      return;
    }

    setEntries((data as EntryRow[]) || []);
  }

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function clearForm() {
    setEditingId(null);
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

  async function handleLoginOrSignup() {
    setMessage("");

    if (!email.trim() || !password.trim()) {
      setMessage("이메일과 비밀번호를 입력해 주세요.");
      return;
    }

    if (authMode === "login") {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setMessage(`로그인 실패: ${error.message}`);
        return;
      }

      setMessage("로그인되었습니다.");
      return;
    }

    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });

    if (error) {
      setMessage(`회원가입 실패: ${error.message}`);
      return;
    }

    setMessage("회원가입 요청이 완료되었습니다. 이메일 확인이 필요할 수 있습니다.");
  }

  async function handleLogout() {
    setMessage("");
    const { error } = await supabase.auth.signOut();
    if (error) {
      setMessage(`로그아웃 실패: ${error.message}`);
      return;
    }
    location.reload();
  }

  async function handleSave() {
    setMessage("");

    if (!session?.user?.id) {
      setMessage("로그인이 필요합니다.");
      return;
    }

    if (!form.date) {
      setMessage("날짜를 입력해 주세요.");
      return;
    }

    const payload = {
      user_id: session.user.id,
      date: form.date,
      weight: toNumOrNull(form.weight),
      bp_s: toNumOrNull(form.bp_s),
      bp_d: toNumOrNull(form.bp_d),
      exercise_min: toNumOrNull(form.exercise_min),
      plank_min: toNumOrNull(form.plank_min),
      knee_pain: toNumOrNull(form.knee_pain),
      notes: safeText(form.notes) || null,
    };

    setSaving(true);

    try {
      if (editingId) {
        const { error } = await supabase
          .from("body_entries")
          .update(payload)
          .eq("id", editingId)
          .eq("user_id", session.user.id);

        if (error) {
          setMessage(`수정 실패: ${error.message}`);
          return;
        }

        setMessage("기록이 수정되었습니다.");
      } else {
        const { error } = await supabase.from("body_entries").insert(payload);

        if (error) {
          setMessage(`저장 실패: ${error.message}`);
          return;
        }

        setMessage("기록이 저장되었습니다.");
      }

      await loadEntries(session.user.id);
      clearForm();
    } finally {
      setSaving(false);
    }
  }

  function handleEdit(row: EntryRow) {
    setEditingId(row.id);
    setForm({
      date: row.date || todayYMD(),
      weight: row.weight?.toString() ?? "",
      bp_s: row.bp_s?.toString() ?? "",
      bp_d: row.bp_d?.toString() ?? "",
      exercise_min: row.exercise_min?.toString() ?? "",
      plank_min: row.plank_min?.toString() ?? "",
      knee_pain: row.knee_pain?.toString() ?? "",
      notes: row.notes ?? "",
    });
    setMessage("수정 모드입니다. 값을 바꾸고 저장을 누르세요.");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDelete(row: EntryRow) {
    if (!session?.user?.id) {
      setMessage("로그인이 필요합니다.");
      return;
    }

    const ok = window.confirm(`${row.date} 기록을 삭제할까요?`);
    if (!ok) return;

    const { error } = await supabase
      .from("body_entries")
      .delete()
      .eq("id", row.id)
      .eq("user_id", session.user.id);

    if (error) {
      setMessage(`삭제 실패: ${error.message}`);
      return;
    }

    if (editingId === row.id) clearForm();

    setMessage("기록이 삭제되었습니다.");
    await loadEntries(session.user.id);
  }

  const sortedDesc = useMemo(() => {
    return [...entries].sort((a, b) => {
      const da = `${a.date || ""} ${a.created_at || ""}`;
      const db = `${b.date || ""} ${b.created_at || ""}`;
      return db.localeCompare(da);
    });
  }, [entries]);

  const latest = sortedDesc[0] || null;

  const latestWeight = latest?.weight ?? null;
  const latestBp =
    latest?.bp_s != null || latest?.bp_d != null
      ? `${latest?.bp_s ?? "-"} / ${latest?.bp_d ?? "-"}`
      : null;
  const latestExercise =
    latest?.exercise_min != null ? `${latest.exercise_min}분` : null;

  const chartData = useMemo(() => {
    return entries.map((r) => ({
      ...r,
      label: r.date?.slice(5) || r.date,
    }));
  }, [entries]);

  const weightDomain = useMemo(
    () => getWeightDomain(session?.user?.email),
    [session?.user?.email]
  );

  const latestDateText = latest ? fmtDate(latest.date) : "-";

  const containerStyle: React.CSSProperties = {
    maxWidth: 980,
    margin: "0 auto",
    padding: "20px 14px 48px",
  };

  const buttonPrimary: React.CSSProperties = {
    background: "linear-gradient(135deg,#2563eb,#60a5fa)",
    color: "#fff",
    border: "none",
    borderRadius: 14,
    padding: "12px 18px",
    fontSize: 16,
    fontWeight: 700,
    cursor: "pointer",
  };

  const buttonSecondary: React.CSSProperties = {
    background: "#fff",
    color: "#0f172a",
    border: "1px solid #d7deea",
    borderRadius: 14,
    padding: "12px 18px",
    fontSize: 16,
    fontWeight: 700,
    cursor: "pointer",
  };

  const smallButton: React.CSSProperties = {
    border: "1px solid #d7deea",
    background: "#fff",
    borderRadius: 12,
    padding: "8px 12px",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
  };

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#f5f7fb",
          color: "#334155",
          fontSize: 18,
        }}
      >
        불러오는 중...
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(180deg, #f8fbff 0%, #f3f6fb 35%, #eef3f9 100%)",
      }}
    >
      <div style={containerStyle}>
        <div
          style={{
            background: "linear-gradient(135deg,#1d4ed8 0%, #2563eb 45%, #60a5fa 100%)",
            color: "#fff",
            borderRadius: 34,
            padding: "26px 26px 24px",
            boxShadow: "0 14px 34px rgba(37, 99, 235, 0.25)",
            marginBottom: 18,
          }}
        >
          <div
            style={{
              fontSize: 15,
              opacity: 0.92,
              marginBottom: 12,
              fontWeight: 500,
            }}
          >
            Ready Notebook
          </div>

          <div
            style={{
              fontSize: 54,
              lineHeight: 1,
              fontWeight: 900,
              letterSpacing: "-0.03em",
              marginBottom: 12,
            }}
          >
            몸계부
          </div>

          <div
            style={{
              fontSize: 18,
              lineHeight: 1.6,
              opacity: 0.98,
            }}
          >
            체중 · 혈압 · 운동 · 플랭크 · 무릎통증을 한눈에 기록
          </div>
        </div>

        {message ? (
          <div
            style={{
              background: "#fff7ed",
              color: "#9a3412",
              border: "1px solid #fed7aa",
              borderRadius: 16,
              padding: "12px 14px",
              marginBottom: 16,
              boxShadow: cardShadow(),
            }}
          >
            {message}
          </div>
        ) : null}

        {!session ? (
          <div
            style={{
              background: "#ffffff",
              borderRadius: 28,
              padding: 22,
              boxShadow: cardShadow(),
              border: "1px solid #e8eef6",
              marginBottom: 18,
            }}
          >
            <div style={{ fontSize: 15, color: "#64748b", marginBottom: 6 }}>로그인</div>
            <div style={sectionTitleStyle()}>
              {authMode === "login" ? "계정으로 로그인" : "계정 만들기"}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr",
                gap: 14,
                marginBottom: 16,
              }}
            >
              <div>
                <div style={labelStyle()}>이메일</div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example@gmail.com"
                  style={inputStyle()}
                />
              </div>

              <div>
                <div style={labelStyle()}>비밀번호</div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="비밀번호"
                  style={inputStyle()}
                />
              </div>
            </div>

            <div
              style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <button style={buttonPrimary} onClick={handleLoginOrSignup}>
                {authMode === "login" ? "로그인" : "회원가입"}
              </button>

              <button
                style={buttonSecondary}
                onClick={() =>
                  setAuthMode((prev) => (prev === "login" ? "signup" : "login"))
                }
              >
                {authMode === "login" ? "회원가입 모드" : "로그인 모드"}
              </button>
            </div>
          </div>
        ) : (
          <div
            style={{
              background: "#ffffff",
              borderRadius: 28,
              padding: 22,
              boxShadow: cardShadow(),
              border: "1px solid #e8eef6",
              marginBottom: 18,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 16,
                alignItems: "flex-start",
                flexWrap: "wrap",
              }}
            >
              <div style={{ flex: "1 1 320px" }}>
                <div style={{ fontSize: 15, color: "#64748b", marginBottom: 6 }}>로그인</div>
                <div style={sectionTitleStyle()}>현재 사용자</div>

                <div
                  style={{
                    background: "#eff6ff",
                    border: "1px solid #bfdbfe",
                    borderRadius: 22,
                    padding: 18,
                  }}
                >
                  <div
                    style={{
                      fontSize: 14,
                      color: "#64748b",
                      marginBottom: 10,
                    }}
                  >
                    로그인된 계정
                  </div>
                  <div
                    style={{
                      fontSize: 28,
                      fontWeight: 900,
                      color: "#1d4ed8",
                      wordBreak: "break-word",
                      lineHeight: 1.2,
                    }}
                  >
                    {session.user?.email || "-"}
                  </div>
                  <div
                    style={{
                      marginTop: 12,
                      fontSize: 15,
                      lineHeight: 1.6,
                      color: "#475569",
                    }}
                  >
                    이 계정의 기록만 보입니다. 아내분은 아내분 계정으로 로그인하면
                    아내분 기록만 보입니다.
                  </div>
                </div>
              </div>

              <div>
                <button
                  onClick={handleLogout}
                  style={{
                    background: "#ef4444",
                    color: "#fff",
                    border: "none",
                    borderRadius: 18,
                    padding: "14px 22px",
                    fontSize: 18,
                    fontWeight: 800,
                    cursor: "pointer",
                    minWidth: 130,
                  }}
                >
                  로그아웃
                </button>
              </div>
            </div>
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
            gap: 14,
            marginBottom: 18,
          }}
        >
          <StatCard
            title="전체 기록"
            value={String(entries.length)}
            sub="누적 entries"
          />
          <StatCard
            title="최근 체중"
            value={latestWeight != null ? String(latestWeight) : "-"}
            sub={`기준일 ${latestDateText}`}
          />
          <StatCard
            title="최근 혈압"
            value={latestBp || "-"}
            sub={`기준일 ${latestDateText}`}
          />
          <StatCard
            title="최근 운동"
            value={latestExercise || "-"}
            sub={`기준일 ${latestDateText}`}
          />
        </div>

        <div
          style={{
            background: "#ffffff",
            borderRadius: 28,
            padding: 22,
            boxShadow: cardShadow(),
            border: "1px solid #e8eef6",
            marginBottom: 18,
          }}
        >
          <div style={{ fontSize: 15, color: "#64748b", marginBottom: 6 }}>
            {editingId ? "기록 수정" : "기록 입력"}
          </div>
          <div style={sectionTitleStyle()}>
            {editingId ? "기록 수정하기" : "새 기록 입력"}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 14,
              marginBottom: 16,
            }}
          >
            <div>
              <div style={labelStyle()}>날짜</div>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setField("date", e.target.value)}
                style={inputStyle()}
              />
            </div>

            <div>
              <div style={labelStyle()}>체중</div>
              <input
                value={form.weight}
                onChange={(e) => setField("weight", e.target.value)}
                placeholder="예: 165.2"
                style={inputStyle()}
              />
            </div>

            <div>
              <div style={labelStyle()}>혈압(수축)</div>
              <input
                value={form.bp_s}
                onChange={(e) => setField("bp_s", e.target.value)}
                placeholder="예: 130"
                style={inputStyle()}
              />
            </div>

            <div>
              <div style={labelStyle()}>혈압(이완)</div>
              <input
                value={form.bp_d}
                onChange={(e) => setField("bp_d", e.target.value)}
                placeholder="예: 79"
                style={inputStyle()}
              />
            </div>

            <div>
              <div style={labelStyle()}>운동(분)</div>
              <input
                value={form.exercise_min}
                onChange={(e) => setField("exercise_min", e.target.value)}
                placeholder="예: 40"
                style={inputStyle()}
              />
            </div>

            <div>
              <div style={labelStyle()}>플랭크(분)</div>
              <input
                value={form.plank_min}
                onChange={(e) => setField("plank_min", e.target.value)}
                placeholder="예: 3"
                style={inputStyle()}
              />
            </div>

            <div>
              <div style={labelStyle()}>무릎통증(0~10)</div>
              <input
                value={form.knee_pain}
                onChange={(e) => setField("knee_pain", e.target.value)}
                placeholder="예: 4"
                style={inputStyle()}
              />
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <div style={labelStyle()}>메모</div>
              <textarea
                value={form.notes}
                onChange={(e) => setField("notes", e.target.value)}
                placeholder="메모를 적어 주세요"
                rows={3}
                style={{
                  ...inputStyle(),
                  resize: "vertical",
                  minHeight: 90,
                }}
              />
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button style={buttonPrimary} onClick={handleSave} disabled={saving}>
              {saving ? "저장 중..." : editingId ? "수정 저장" : "저장"}
            </button>

            <button style={buttonSecondary} onClick={clearForm}>
              새로쓰기
            </button>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr",
            gap: 18,
            marginBottom: 18,
          }}
        >
          <ChartCard title="체중 그래프">
            <div style={{ width: "100%", height: 300 }}>
              <ResponsiveContainer>
                <LineChart data={chartData} margin={{ top: 10, right: 14, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#64748b" }} />
                  <YAxis
                    domain={weightDomain}
                    tick={{ fontSize: 12, fill: "#64748b" }}
                    tickCount={7}
                  />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="weight"
                    name="체중"
                    stroke="#2563eb"
                    strokeWidth={3}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard title="혈압 그래프">
            <div style={{ width: "100%", height: 300 }}>
              <ResponsiveContainer>
                <LineChart data={chartData} margin={{ top: 10, right: 14, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#64748b" }} />
                  <YAxis domain={[60, 150]} tick={{ fontSize: 12, fill: "#64748b" }} />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="bp_s"
                    name="수축혈압"
                    stroke="#ef4444"
                    strokeWidth={3}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="bp_d"
                    name="이완혈압"
                    stroke="#f59e0b"
                    strokeWidth={3}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard title="운동 그래프">
            <div style={{ width: "100%", height: 300 }}>
              <ResponsiveContainer>
                <LineChart data={chartData} margin={{ top: 10, right: 14, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#64748b" }} />
                  <YAxis domain={[0, 60]} tick={{ fontSize: 12, fill: "#64748b" }} />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="exercise_min"
                    name="운동(분)"
                    stroke="#16a34a"
                    strokeWidth={3}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="plank_min"
                    name="플랭크(분)"
                    stroke="#8b5cf6"
                    strokeWidth={3}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </div>

        <div
          style={{
            background: "#ffffff",
            borderRadius: 28,
            padding: 22,
            boxShadow: cardShadow(),
            border: "1px solid #e8eef6",
          }}
        >
          <div style={{ fontSize: 15, color: "#64748b", marginBottom: 6 }}>최근 기록</div>
          <div style={sectionTitleStyle()}>저장된 기록</div>

          {sortedDesc.length === 0 ? (
            <div
              style={{
                padding: "18px 0 6px",
                color: "#64748b",
                fontSize: 16,
              }}
            >
              아직 기록이 없습니다.
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: 14,
              }}
            >
              {sortedDesc.map((row) => (
                <div
                  key={row.id}
                  style={{
                    borderRadius: 22,
                    border: "1px solid #dbe6f3",
                    background: "#f8fbff",
                    padding: 16,
                  }}
                >
                  <div
                    style={{
                      fontSize: 20,
                      fontWeight: 800,
                      color: "#0f172a",
                      marginBottom: 10,
                    }}
                  >
                    {fmtDate(row.date)}
                  </div>

                  <div style={{ fontSize: 15, lineHeight: 1.75, color: "#334155" }}>
                    <div>체중: {row.weight ?? "-"}</div>
                    <div>
                      혈압: {row.bp_s ?? "-"} / {row.bp_d ?? "-"}
                    </div>
                    <div>운동: {row.exercise_min ?? "-"}분</div>
                    <div>플랭크: {row.plank_min ?? "-"}분</div>
                    <div>무릎: {row.knee_pain ?? "-"} / 10</div>
                    {row.notes ? <div>메모: {row.notes}</div> : null}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      marginTop: 14,
                      flexWrap: "wrap",
                    }}
                  >
                    <button style={smallButton} onClick={() => handleEdit(row)}>
                      수정
                    </button>
                    <button
                      style={{
                        ...smallButton,
                        color: "#b91c1c",
                        borderColor: "#fecaca",
                        background: "#fff5f5",
                      }}
                      onClick={() => handleDelete(row)}
                    >
                      삭제
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
