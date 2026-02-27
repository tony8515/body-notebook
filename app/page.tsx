"use client";
export const dynamic = "force-dynamic";
export const revalidate = 0;
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

/** ---------------- Types ---------------- */
type Entry = {
  id: string;
  date: string; // YYYY-MM-DD
  weight: string;
  bp_s: string;
  bp_d: string;
  exerciseMin: string;
  plankMin: string;
  kneePain: string; // 0-10
  notes: string;
  createdAt?: string;
};

type MedDocRow = {
  id: string;
  user_id: string;
  doc_type: string; // 'med_list'
  title: string;
  file_paths: string[];
  created_at: string;
  updated_at: string;
};

const MED_DOC_TYPE = "med_list";
const MED_BUCKET = "meddocs"; // Supabase Storage bucket name

/** ---------------- Helpers ---------------- */
function todayYMD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toNumOrNull(v: string) {
  const n = Number(v);
  return Number.isFinite(n) && v !== "" ? n : null;
}

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** ---------------- Page ---------------- */
export default function Home() {
  /** Auth */
  const [userEmail, setUserEmail] = useState<string>("tony8515@gmail.com");
  const [password, setPassword] = useState<string>("");
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loginBusy, setLoginBusy] = useState(false);

  /** Entries */
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState<Omit<Entry, "id" | "createdAt">>({
    date: todayYMD(),
    weight: "",
    bp_s: "",
    bp_d: "",
    exerciseMin: "",
    plankMin: "",
    kneePain: "0",
    notes: "",
  });

  const [editing, setEditing] = useState<{ id: string; originalDate: string } | null>(null);

  /** Med docs */
  const [medDoc, setMedDoc] = useState<MedDocRow | null>(null);
  const [medTitle, setMedTitle] = useState<string>("");
  const [medBusy, setMedBusy] = useState(false);
  const [medUrls, setMedUrls] = useState<Record<string, string>>({});
  const [medStatus, setMedStatus] = useState<string>("");

  /** ---------------- Auth funcs ---------------- */
  async function signIn() {
    const email = userEmail.trim();
    if (!isValidEmail(email)) {
      alert("이메일을 정확히 입력하세요.");
      return;
    }
    if (!password) {
      alert("비밀번호를 입력하세요.");
      return;
    }

    setLoginBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        alert("로그인 실패: " + error.message);
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      const uid = session?.user?.id ?? null;
      setSessionEmail(session?.user?.email ?? null);
      setUserId(uid);

      await loadEntries(uid);
      if (uid) await loadMedDoc(uid);
    } finally {
      setLoginBusy(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    setSessionEmail(null);
    setUserId(null);
    setEntries([]);
    setMedDoc(null);
    setMedUrls({});
    setEditing(null);
    setMedStatus("");
  }

  async function sendPasswordReset() {
    const email = userEmail.trim();
    if (!isValidEmail(email)) {
      alert("이메일을 정확히 입력하세요.");
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    if (error) {
      alert("비밀번호 재설정 메일 전송 실패: " + error.message);
      return;
    }
    alert("비밀번호 재설정 이메일을 보냈습니다. 메일함을 확인하세요.");
  }

  /** ---------------- Entries funcs ---------------- */
  async function loadEntries(uid?: string | null) {
    const realUid = uid ?? userId;
    if (!realUid) return;

    const { data, error } = await supabase
      .from("body_entries")
      .select("*")
      .eq("user_id", realUid)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      alert("불러오기 실패: " + error.message);
      console.log(error);
      return;
    }

    const mapped: Entry[] = (data ?? []).map((r: any) => ({
      id: r.id,
      date: r.date ?? "",
      weight: r.weight == null ? "" : String(r.weight),
      bp_s: r.bp_s == null ? "" : String(r.bp_s),
      bp_d: r.bp_d == null ? "" : String(r.bp_d),
      exerciseMin: r.exercise_min == null ? "" : String(r.exercise_min),
      plankMin: r.plank_min == null ? "" : String(r.plank_min),
      kneePain: r.knee_pain == null ? "0" : String(r.knee_pain),
      notes: r.notes ?? "",
      createdAt: r.created_at ?? "",
    }));

    setEntries(mapped);
  }

  async function saveEntry() {
    setLoading(true);
    try {
      if (!userId) {
        alert("로그인이 필요합니다.");
        return;
      }

      if (!form.date) {
        alert("날짜를 입력하세요.");
        return;
      }

      const payload: any = {
        user_id: userId,
        date: form.date,
        weight: toNumOrNull(form.weight),
        bp_s: toNumOrNull(form.bp_s),
        bp_d: toNumOrNull(form.bp_d),
        exercise_min: toNumOrNull(form.exerciseMin),
        plank_min: toNumOrNull(form.plankMin),
        knee_pain: toNumOrNull(form.kneePain) ?? 0,
        notes: form.notes || null,
      };

      if (editing && editing.originalDate !== form.date) {
        await supabase.from("body_entries").delete().eq("id", editing.id).eq("user_id", userId);
      }

      const { error } = await supabase.from("body_entries").upsert(payload, { onConflict: "user_id,date" });

      if (error) {
        alert("저장 실패: " + error.message);
        console.log(error);
        return;
      }

      await loadEntries(userId);

      setForm((p) => ({
        ...p,
        weight: "",
        bp_s: "",
        bp_d: "",
        exerciseMin: "",
        plankMin: "",
        kneePain: "0",
        notes: "",
      }));
      setEditing(null);
    } finally {
      setLoading(false);
    }
  }

  function startEdit(e: Entry) {
    setEditing({ id: e.id, originalDate: e.date });
    setForm({
      date: e.date,
      weight: e.weight ?? "",
      bp_s: e.bp_s ?? "",
      bp_d: e.bp_d ?? "",
      exerciseMin: e.exerciseMin ?? "",
      plankMin: e.plankMin ?? "",
      kneePain: e.kneePain ?? "0",
      notes: e.notes ?? "",
    });

    try {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {}
  }

  function cancelEdit() {
    setEditing(null);
    setForm({
      date: todayYMD(),
      weight: "",
      bp_s: "",
      bp_d: "",
      exerciseMin: "",
      plankMin: "",
      kneePain: "0",
      notes: "",
    });
  }

  async function deleteEntry(e: Entry) {
    const ok = confirm(`${e.date} 기록을 삭제할까요?`);
    if (!ok) return;

    if (!userId) {
      alert("로그인이 필요합니다.");
      return;
    }

    const { error } = await supabase.from("body_entries").delete().eq("id", e.id).eq("user_id", userId);

    if (error) {
      alert("삭제 실패: " + error.message);
      return;
    }

    if (editing?.id === e.id) cancelEdit();
    await loadEntries(userId);
  }

  /** ---------------- Med docs funcs ---------------- */

  async function refreshMedSignedUrls(paths: string[]) {
    const next: Record<string, string> = {};
    for (const p of paths) {
      const { data, error } = await supabase.storage.from(MED_BUCKET).createSignedUrl(p, 60 * 60);
      if (!error && data?.signedUrl) next[p] = data.signedUrl;
    }
    setMedUrls(next);
  }

  // ✅ 핵심: loadMedDoc 반드시 존재 + 없으면 생성
  async function loadMedDoc(uid: string) {
    setMedStatus("약/영양제 문서 확인중...");

    const { data: found, error: selErr } = await supabase
      .from("med_docs")
      .select("*")
      .eq("user_id", uid)
      .eq("doc_type", MED_DOC_TYPE)
      .order("created_at", { ascending: true })
      .limit(1);

    if (selErr) {
      setMedStatus("med_docs 조회 실패: " + selErr.message);
      return null;
    }

    let doc: MedDocRow | null = (found && found.length > 0 ? (found[0] as MedDocRow) : null);

    if (!doc) {
      setMedStatus("문서가 없어서 새로 생성중...");
      const { data: ins, error: insErr } = await supabase
        .from("med_docs")
        .insert({
          user_id: uid,
          doc_type: MED_DOC_TYPE,
          title: "처방약/영양제",
          file_paths: [],
        })
        .select("*")
        .single();

      if (insErr) {
        setMedStatus("med_docs 생성 실패: " + insErr.message);
        return null;
      }
      doc = ins as MedDocRow;
    }

    setMedDoc(doc);

    // 제목 자동 채우기
    setMedTitle((prev) => (prev.trim() ? prev : doc?.title ?? ""));

    // signed url 갱신
    await refreshMedSignedUrls(doc.file_paths ?? []);

    setMedStatus("");
    return doc;
  }

  async function uploadMedFiles(files: FileList | null) {
    try {
      setMedStatus(`STEP1 files: ${files?.length ?? 0}`);
      if (!files || files.length === 0) return;

      setMedStatus(`STEP2 userId(state): ${userId ?? "null"}`);
      if (!userId) {
        setMedStatus("로그인이 필요합니다.");
        return;
      }

      setMedBusy(true);

      // doc 준비
      let doc = medDoc;
      if (!doc) {
        setMedStatus("STEP3 loadMedDoc...");
        doc = await loadMedDoc(userId);
      }
      if (!doc) {
        setMedStatus("STEP3 FAIL: medDoc 로드/생성 실패");
        return;
      }

      setMedStatus("STEP4 uploading...");
      const newPaths: string[] = [];

      for (const file of Array.from(files)) {
        const cleaned = safeFileName(file.name);
        const fileName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${cleaned}`;
        const path = `${userId}/${doc.id}/${fileName}`;

        const { error: upErr } = await supabase.storage
          .from(MED_BUCKET)
          .upload(path, file, { upsert: true, contentType: file.type });

        if (upErr) {
          setMedStatus("UPLOAD ERROR: " + upErr.message);
          return;
        }

        newPaths.push(path);
      }

      setMedStatus("STEP5 DB update...");
      const merged = [...(doc.file_paths ?? []), ...newPaths];

      const { data: upd, error: updErr } = await supabase
        .from("med_docs")
        .update({
          ...(medTitle.trim() ? { title: medTitle.trim() } : {}),
          file_paths: merged,
        })
        .eq("id", doc.id)
        .select("*")
        .single();

      if (updErr) {
        setMedStatus("DB UPDATE ERROR: " + updErr.message);
        return;
      }

      const updatedDoc = upd as MedDocRow;
      setMedDoc(updatedDoc);

      setMedStatus("STEP6 signed url...");
      await refreshMedSignedUrls(updatedDoc.file_paths ?? []);

      setMedStatus("✅ 완료! 사진이 저장되었습니다.");
      setTimeout(() => setMedStatus(""), 2500);
    } catch (e: any) {
      setMedStatus(`❌ EXCEPTION: ${e?.message ?? String(e)}`);
    } finally {
      setMedBusy(false);
    }
  }

  async function deleteMedFile(path: string) {
    if (!medDoc) return;

    const ok = confirm("이 사진을 삭제할까요?");
    if (!ok) return;

    if (!userId) {
      alert("로그인이 필요합니다.");
      return;
    }

    setMedBusy(true);
    try {
      const { error: delErr } = await supabase.storage.from(MED_BUCKET).remove([path]);
      if (delErr) throw delErr;

      const nextPaths = (medDoc.file_paths ?? []).filter((p) => p !== path);

      const { data: upd, error: updErr } = await supabase
        .from("med_docs")
        .update({ file_paths: nextPaths })
        .eq("id", medDoc.id)
        .select("*")
        .single();

      if (updErr) throw updErr;

      const updatedDoc = upd as MedDocRow;
      setMedDoc(updatedDoc);
      await refreshMedSignedUrls(updatedDoc.file_paths ?? []);
    } catch (e: any) {
      console.log(e);
      alert("삭제 실패: " + (e?.message ?? String(e)));
    } finally {
      setMedBusy(false);
    }
  }

  /** ---------------- Bootstrap ---------------- */
  useEffect(() => {
    let mounted = true;

    async function bootstrap() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!mounted) return;

      if (session?.user) {
        const uid = session.user.id;
        setSessionEmail(session.user.email ?? null);
        setUserEmail(session.user.email ?? userEmail);
        setUserId(uid);

        await loadEntries(uid);
        await loadMedDoc(uid);
      } else {
        setSessionEmail(null);
        setUserId(null);
      }
    }

    bootstrap();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return;

      if (session?.user) {
        const uid = session.user.id;
        setSessionEmail(session.user.email ?? null);
        setUserEmail(session.user.email ?? userEmail);
        setUserId(uid);

        await loadEntries(uid);
        await loadMedDoc(uid);
      } else {
        setSessionEmail(null);
        setUserId(null);
        setEntries([]);
        setMedDoc(null);
        setMedUrls({});
        setEditing(null);
        setMedStatus("");
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = useMemo(() => {
    if (entries.length === 0) return null;
    const latest = entries[0];
    const weightNum = Number(latest.weight);
    const exNum = Number(latest.exerciseMin);
    return {
      latestDate: latest.date,
      latestWeight: Number.isFinite(weightNum) ? weightNum : null,
      latestExercise: Number.isFinite(exNum) ? exNum : null,
      latestKneePain: latest.kneePain,
    };
  }, [entries]);

  /** ---------------- UI ---------------- */
  return (
    <main className="wrap">
      <style jsx global>{`
        .wrap {
          max-width: 980px;
          margin: 0 auto;
          padding: 20px;
          font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial;
        }
        .sub {
          margin-bottom: 16px;
          color: #666;
        }
        .card {
          border: 1px solid #e5e5e5;
          border-radius: 12px;
          padding: 16px;
          margin-bottom: 16px;
        }
        .row {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
          align-items: center;
        }
        .grid {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr 1fr;
          gap: 12px;
        }
        @media (max-width: 820px) {
          .grid {
            grid-template-columns: 1fr 1fr;
          }
        }
        @media (max-width: 520px) {
          .grid {
            grid-template-columns: 1fr;
          }
          .btnPrimary {
            width: 100%;
          }
        }
        label {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .hint {
          font-size: 12px;
          color: #666;
        }
        .input {
          padding: 10px;
          border-radius: 10px;
          border: 1px solid #ddd;
        }
        .btn {
          padding: 10px 12px;
          border-radius: 10px;
          border: 1px solid #bbb;
          background: #fff;
          cursor: pointer;
        }
        .btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .btnPrimary {
          margin-top: 14px;
          padding: 12px 18px;
          border-radius: 12px;
          border: 1px solid #222;
          background: #111;
          color: #fff;
          font-weight: 700;
          cursor: pointer;
          width: 220px;
        }
        .btnDanger {
          border: 1px solid #f0c3c3;
          background: #fff;
          color: #b00020;
        }
        .small {
          font-size: 12px;
          opacity: 0.75;
          word-break: break-all;
        }
        .thumb {
          width: 100%;
          height: 140px;
          object-fit: cover;
          border-radius: 8px;
          margin-top: 8px;
          background: #f5f5f5;
        }
        .actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          margin-top: 8px;
        }
      `}</style>

      <h1 style={{ marginBottom: 6 }}>Body Notebook</h1>
      <div className="sub">건강/운동/무릎 통증을 간단히 기록해봅시다.</div>

      {/* Auth */}
      <section className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div style={{ color: "#666", fontSize: 14 }}>
            {sessionEmail ? (
              <>
                로그인: <b>{sessionEmail}</b>
              </>
            ) : (
              <>로그인 전 (비밀번호로 로그인)</>
            )}
          </div>

          {sessionEmail ? (
            <button className="btn" onClick={signOut}>
              로그아웃
            </button>
          ) : null}
        </div>

        {!sessionEmail ? (
          <div style={{ marginTop: 12 }}>
            <div className="grid">
              <label>
                <span className="hint">이메일</span>
                <input
                  className="input"
                  value={userEmail}
                  onChange={(e) => setUserEmail(e.target.value)}
                  placeholder="예: tony8515@gmail.com"
                  inputMode="email"
                />
              </label>

              <label>
                <span className="hint">비밀번호</span>
                <input
                  className="input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="비밀번호"
                />
              </label>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <span className="hint"> </span>
                <button className="btn" onClick={signIn} disabled={loginBusy}>
                  {loginBusy ? "로그인 중..." : "로그인"}
                </button>

                <button className="btn" onClick={sendPasswordReset} disabled={loginBusy}>
                  비밀번호 재설정 메일
                </button>
              </div>
            </div>

            <div className="hint" style={{ marginTop: 8 }}>
              ✅ OTP(이메일 링크) 방식 제거됨 → 이제 <b>rate limit</b> 문제 없습니다.
            </div>
          </div>
        ) : null}
      </section>

      {/* Stats */}
      <section className="card">
        <div className="row" style={{ gap: 24 }}>
          <div>
            <div className="hint">Latest</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{stats ? stats.latestDate : "No entries yet"}</div>
          </div>
          <div>
            <div className="hint">Weight</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{stats?.latestWeight ?? "-"}</div>
          </div>
          <div>
            <div className="hint">Exercise (min)</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{stats?.latestExercise ?? "-"}</div>
          </div>
          <div>
            <div className="hint">Knee pain (0-10)</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{stats?.latestKneePain ?? "-"}</div>
          </div>
        </div>
      </section>

      {/* New entry */}
      <section className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>{editing ? "기록 수정" : "새 기록"}</h2>
          {editing ? (
            <button className="btn btnDanger" onClick={cancelEdit}>
              수정 취소
            </button>
          ) : null}
        </div>

        <div className="grid" style={{ marginTop: 12 }}>
          <label>
            <span className="hint">날짜</span>
            <input
              className="input"
              type="date"
              value={form.date}
              onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
            />
          </label>

          <label>
            <span className="hint">체중</span>
            <input
              className="input"
              inputMode="decimal"
              placeholder="예: 78.5"
              value={form.weight}
              onChange={(e) => setForm((p) => ({ ...p, weight: e.target.value }))}
            />
          </label>

          <label>
            <span className="hint">혈압(수축)</span>
            <input
              className="input"
              inputMode="numeric"
              placeholder="예: 120"
              value={form.bp_s}
              onChange={(e) => setForm((p) => ({ ...p, bp_s: e.target.value }))}
            />
          </label>

          <label>
            <span className="hint">혈압(이완)</span>
            <input
              className="input"
              inputMode="numeric"
              placeholder="예: 80"
              value={form.bp_d}
              onChange={(e) => setForm((p) => ({ ...p, bp_d: e.target.value }))}
            />
          </label>

          <label>
            <span className="hint">운동시간(분)</span>
            <input
              className="input"
              inputMode="numeric"
              placeholder="예: 120"
              value={form.exerciseMin}
              onChange={(e) => setForm((p) => ({ ...p, exerciseMin: e.target.value }))}
            />
          </label>

          <label>
            <span className="hint">플랭크(분)</span>
            <input
              className="input"
              inputMode="numeric"
              placeholder="예: 3"
              value={form.plankMin}
              onChange={(e) => setForm((p) => ({ ...p, plankMin: e.target.value }))}
            />
          </label>

          <label>
            <span className="hint">무릎 통증(0-10)</span>
            <input
              type="range"
              min={0}
              max={10}
              value={form.kneePain}
              onChange={(e) => setForm((p) => ({ ...p, kneePain: e.target.value }))}
            />
            <div className="hint">현재: {form.kneePain}</div>
          </label>

          <label style={{ gridColumn: "1 / -1" }}>
            <span className="hint">메모</span>
            <input
              className="input"
              placeholder="예: 아침 첫걸음이 아팠음, 탁구 후 괜찮아짐"
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
            />
          </label>
        </div>

        <button className="btnPrimary" onClick={saveEntry} disabled={loading || !sessionEmail}>
          {!sessionEmail ? "로그인 필요" : loading ? "저장 중..." : editing ? "수정 저장" : "저장"}
        </button>

        <div className="hint" style={{ marginTop: 10 }}>
          ✅ Supabase DB에 저장됩니다. (같은 날짜는 자동으로 덮어쓰기)
        </div>
      </section>

      {/* Med docs */}
      <section className="card">
        <h2 style={{ fontSize: 18, fontWeight: 700, marginTop: 0 }}>처방약/영양제 (사진 보관)</h2>
        <p style={{ opacity: 0.8, marginTop: 6 }}>현재 복용 중인 약/영양제 목록을 사진으로 보관합니다. (여러 장 가능)</p>

        {!sessionEmail ? (
          <div className="hint">로그인 후 사용 가능합니다.</div>
        ) : (
          <>
            {medStatus ? (
              <div className="hint" style={{ marginTop: 10 }}>
                {medStatus}
              </div>
            ) : null}

            <div className="row" style={{ marginTop: 10, alignItems: "center", gap: 12 }}>
              <input
                className="input"
                style={{ flex: 1 }}
                value={medTitle}
                onChange={(e) => setMedTitle(e.currentTarget.value)}
                placeholder="예: 현재 복용 약/영양제"
              />

              <label className="btn">
                📷 사진 찍기 / 추가
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  capture="environment"
                  style={{ display: "none" }}
                  onClick={(e) => (((e.currentTarget as HTMLInputElement).value = ""), null)}
                  onChange={(e) => uploadMedFiles(e.currentTarget.files)}
                  disabled={medBusy || !userId}
                />
              </label>
            </div>

            {medBusy && (
              <div className="hint" style={{ marginTop: 10 }}>
                처리 중...
              </div>
            )}

            {!medDoc ? (
              <p style={{ marginTop: 12 }}>문서를 준비 중입니다…</p>
            ) : (
              <div style={{ marginTop: 14 }}>
                {medDoc.file_paths?.length ? (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                      gap: 12,
                    }}
                  >
                    {medDoc.file_paths.map((p) => (
                      <div key={p} style={{ border: "1px solid #eee", borderRadius: 10, padding: 10 }}>
                        <div className="small">{p.split("/").slice(-1)[0]}</div>

                        {medUrls[p] ? <img src={medUrls[p]} alt={p} className="thumb" /> : <div className="thumb" />}

                        <button
                          className="btn btnDanger"
                          onClick={() => deleteMedFile(p)}
                          disabled={medBusy}
                          style={{ marginTop: 8, width: "100%" }}
                        >
                          삭제
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ marginTop: 12 }}>아직 사진이 없습니다. 위에서 사진을 추가해보세요.</p>
                )}
              </div>
            )}
          </>
        )}
      </section>

      {/* Recent entries */}
      <section className="card">
        <h2 style={{ marginTop: 0, marginBottom: 12, fontSize: 18 }}>최근 기록</h2>

        {!sessionEmail ? (
          <div className="hint">로그인 후 기록을 볼 수 있습니다.</div>
        ) : entries.length === 0 ? (
          <div className="hint">아직 기록이 없습니다. 위에서 하나 저장해보세요.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {entries.map((e) => (
              <div key={e.id} style={{ border: "1px solid #eee", borderRadius: 12, padding: 12 }}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <b>{e.date}</b>
                  <span className="hint">{e.createdAt ? new Date(e.createdAt).toLocaleString() : ""}</span>
                </div>

                <div className="row" style={{ marginTop: 6, gap: 14, color: "#333" }}>
                  <span>체중: {e.weight || "-"}</span>
                  <span>
                    혈압: {e.bp_s || "-"} / {e.bp_d || "-"}
                  </span>
                  <span>운동(분): {e.exerciseMin || "-"}</span>
                  <span>플랭크(분): {e.plankMin || "-"}</span>
                  <span>무릎: {e.kneePain}</span>
                </div>

                {e.notes ? <div style={{ marginTop: 6, color: "#444" }}>메모: {e.notes}</div> : null}

                <div className="actions">
                  <button className="btn" onClick={() => startEdit(e)}>
                    수정
                  </button>
                  <button className="btn btnDanger" onClick={() => deleteEntry(e)}>
                    삭제
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}