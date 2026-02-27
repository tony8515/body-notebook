"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

/** =========================
 *  Config
 *  ========================= */
const MED_BUCKET = "med_docs_bucket"; // ✅ 본인 Storage bucket 이름으로 바꾸세요
const MED_DOC_TYPE = "rx_supplements"; // DB에 enum/텍스트로 쓰는 값. 기존과 다르면 바꾸세요

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
  created_at: string;
};

type Entry = {
  id: string;
  date: string;
  weight: string;
  bp_s: string;
  bp_d: string;
  exerciseMin: string;
  plankMin: string;
  kneePain: string; // 0~10 문자열
  notes: string;
  createdAt?: string;
};

type MedDocRow = {
  id: string;
  user_id: string;
  doc_type: string;
  title: string | null;
  file_paths: string[] | null;
  created_at: string;
};

function todayYMDLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toNumOrNull(v: string) {
  const s = (v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function safeFileName(name: string) {
  // 간단하게 위험문자 제거
  return name.replace(/[^\w.\-가-힣 ]+/g, "_").replace(/\s+/g, "_");
}

/** =========================
 *  Page
 *  ========================= */
export default function Home() {
  /** ---------- Auth ---------- */
  const [userId, setUserId] = useState<string | null>(null);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);

  // 로그인용 (이메일 매직링크)
  const [email, setEmail] = useState("");
  const [authBusy, setAuthBusy] = useState(false);

  /** ---------- Body form ---------- */
  const [form, setForm] = useState<Entry>(() => ({
    id: "",
    date: "",
    weight: "",
    bp_s: "",
    bp_d: "",
    exerciseMin: "",
    plankMin: "",
    kneePain: "0",
    notes: "",
  }));

  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [editing, setEditing] = useState<{ id: string; originalDate: string } | null>(null);

  /** ---------- Med Docs ---------- */
  const [medTitle, setMedTitle] = useState("");
  const [medDoc, setMedDoc] = useState<MedDocRow | null>(null);
  const [medBusy, setMedBusy] = useState(false);
  const [medStatus, setMedStatus] = useState("");
  const [medUrls, setMedUrls] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  /** ---------- Init: default date always set ---------- */
  useEffect(() => {
    // PC에서 date input이 빈 값으로 남는 경우가 있어 강제로 세팅
    setForm((p) => ({ ...p, date: p.date || todayYMDLocal() }));
  }, []);

  /** ---------- Bootstrap auth/session ---------- */
  useEffect(() => {
    let mounted = true;

    async function bootstrap() {
      const { data } = await supabase.auth.getSession();
      const session = data.session;

      if (!mounted) return;

      if (session?.user) {
        const uid = session.user.id;
        setUserId(uid);
        setSessionEmail(session.user.email ?? null);

        // 로그인 되면 데이터 로드
        await Promise.all([loadEntries(uid), loadMedDoc(uid)]);
      } else {
        setUserId(null);
        setSessionEmail(null);
        setEntries([]);
        setMedDoc(null);
        setMedUrls({});
      }
    }

    bootstrap();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return;

      if (session?.user) {
        const uid = session.user.id;
        setUserId(uid);
        setSessionEmail(session.user.email ?? null);
        await Promise.all([loadEntries(uid), loadMedDoc(uid)]);
      } else {
        setUserId(null);
        setSessionEmail(null);
        setEntries([]);
        setMedDoc(null);
        setMedUrls({});
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  /** =========================
   *  Body Entries
   *  ========================= */
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
        notes: (form.notes ?? "").trim() ? form.notes : null,
      };

      // 날짜를 바꾸는 편집인 경우: 기존 row 삭제 후 새로 upsert (당신 기존 로직 유지)
      if (editing && editing.originalDate !== form.date) {
        await supabase.from("body_entries").delete().eq("id", editing.id);
      }

      // upsert 기준은 테이블에 unique 제약이 있어야 가장 깔끔 (ex: user_id+date).
      // 없다면 그냥 insert만 하셔도 됩니다.
      const { error } = await supabase.from("body_entries").upsert(payload);

      if (error) {
        alert("저장 실패: " + error.message);
        console.log(error);
        return;
      }

      await loadEntries(userId);

      // 폼 리셋 (날짜는 오늘로 유지)
      setForm((p) => ({
        ...p,
        id: "",
        date: todayYMDLocal(),
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
      id: e.id,
      date: e.date || todayYMDLocal(),
      weight: e.weight ?? "",
      bp_s: e.bp_s ?? "",
      bp_d: e.bp_d ?? "",
      exerciseMin: e.exerciseMin ?? "",
      plankMin: e.plankMin ?? "",
      kneePain: e.kneePain ?? "0",
      notes: e.notes ?? "",
      createdAt: e.createdAt,
    });
  }

  function cancelEdit() {
    setEditing(null);
    setForm((p) => ({
      ...p,
      id: "",
      date: todayYMDLocal(),
      weight: "",
      bp_s: "",
      bp_d: "",
      exerciseMin: "",
      plankMin: "",
      kneePain: "0",
      notes: "",
    }));
  }

  async function deleteEntry(e: Entry) {
    const ok = confirm(`${e.date} 기록을 삭제할까요?`);
    if (!ok) return;

    if (!userId) {
      alert("로그인이 필요합니다.");
      return;
    }

    const { error } = await supabase.from("body_entries").delete().eq("id", e.id);

    if (error) {
      alert("삭제 실패: " + error.message);
      return;
    }

    if (editing?.id === e.id) cancelEdit();
    await loadEntries(userId);
  }

  /** =========================
   *  Med Docs
   *  ========================= */
  async function refreshMedSignedUrls(paths: string[]) {
    const next: Record<string, string> = {};
    for (const p of paths) {
      const { data, error } = await supabase.storage.from(MED_BUCKET).createSignedUrl(p, 60 * 60);
      if (!error && data?.signedUrl) next[p] = data.signedUrl;
    }
    setMedUrls(next);
  }

  async function loadMedDoc(uid?: string | null) {
    const realUid = uid ?? userId;
    if (!realUid) return null;

    setMedStatus("약/영양제 문서 확인중...");

    const { data, error } = await supabase
      .from("med_docs")
      .select("*")
      .eq("user_id", realUid)
      .eq("doc_type", MED_DOC_TYPE)
      .limit(1);

    if (error) {
      setMedStatus("med_docs 불러오기 실패: " + error.message);
      console.log(error);
      return null;
    }

    let doc: MedDocRow | null = (data && data.length > 0 ? (data[0] as any) : null) ?? null;

    // 없으면 생성
    if (!doc) {
      setMedStatus("문서가 없어서 새로 생성중...");
      const { data: ins, error: insErr } = await supabase
        .from("med_docs")
        .insert({
          user_id: realUid,
          doc_type: MED_DOC_TYPE,
          title: "처방약/영양제",
          file_paths: [],
        })
        .select("*")
        .single();

      if (insErr) {
        setMedStatus("med_docs 생성 실패: " + insErr.message);
        console.log(insErr);
        return null;
      }

      doc = ins as any;
    }

    setMedDoc(doc);
    setMedTitle((prev) => (prev.trim() ? prev : doc?.title ?? ""));
    await refreshMedSignedUrls(doc.file_paths ?? []);
    setMedStatus("");
    return doc;
  }

  async function uploadMedFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    if (!userId) {
      setMedStatus("로그인이 필요합니다.");
      return;
    }

    setMedBusy(true);
    try {
      // doc 준비
      let doc = medDoc;
      if (!doc) {
        setMedStatus("STEP3 loadMedDoc...");
        doc = await loadMedDoc(userId);
      }
      if (!doc) {
        setMedStatus("STEP3 FAIL: medDoc 로드/생성 실패");
        return; // ✅ finally에서 busy 해제됨
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
          continue;
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

      const updatedDoc = upd as any as MedDocRow;
      setMedDoc(updatedDoc);

      setMedStatus("STEP6 signed url...");
      await refreshMedSignedUrls(updatedDoc.file_paths ?? []);

      setMedStatus("✅ 완료! 사진이 저장되었습니다.");
      setTimeout(() => setMedStatus(""), 2500);

      // 파일 input 리셋 (같은 사진 다시 선택 가능)
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (e: any) {
      setMedStatus("❌ EXCEPTION: " + (e?.message ?? String(e)));
    } finally {
      setMedBusy(false); // ✅ 무조건 해제 → “계속 처리중” 해결
    }
  }

  async function deleteMedFile(path: string) {
    const ok = confirm("이 사진을 삭제할까요?");
    if (!ok) return;

    if (!userId) {
      alert("로그인이 필요합니다.");
      return;
    }
    if (!medDoc) return;

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

      const updatedDoc = upd as any as MedDocRow;
      setMedDoc(updatedDoc);
      await refreshMedSignedUrls(updatedDoc.file_paths ?? []);
    } catch (e: any) {
      console.log(e);
      alert("삭제 실패: " + (e?.message ?? String(e)));
    } finally {
      setMedBusy(false);
    }
  }

  /** =========================
   *  Auth actions
   *  ========================= */
  async function sendMagicLink() {
    const v = email.trim();
    if (!v) return alert("이메일을 입력하세요.");
    setAuthBusy(true);
    try {
      // redirectTo는 Vercel + 로컬 둘다 되도록 현재 origin 사용
      const redirectTo = `${window.location.origin}`;
      const { error } = await supabase.auth.signInWithOtp({
        email: v,
        options: { emailRedirectTo: redirectTo },
      });
      if (error) {
        alert("로그인 링크 발송 실패: " + error.message);
        return;
      }
      alert("로그인 링크를 이메일로 보냈습니다. 메일함을 확인하세요.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function logout() {
    await supabase.auth.signOut();
  }

  /** =========================
   *  UI helpers
   *  ========================= */
  const latest = entries[0];

  const cardStyle: React.CSSProperties = {
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    background: "rgba(0,0,0,0.35)",
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(0,0,0,0.25)",
    color: "white",
    outline: "none",
  };

  const labelStyle: React.CSSProperties = { fontSize: 13, opacity: 0.9, marginBottom: 6 };

  const buttonStyle: React.CSSProperties = {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(255,255,255,0.10)",
    color: "white",
    fontWeight: 700,
    cursor: "pointer",
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0b0b0b", color: "white", padding: 16 }}>
      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        <h1 style={{ fontSize: 22, marginBottom: 8 }}>Body Notebook</h1>

        {/* Auth bar */}
        <div style={{ ...cardStyle, display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 14 }}>
            {userId ? (
              <div>
                <div>로그인: <b>{sessionEmail ?? "(email 없음)"}</b></div>
                <div style={{ opacity: 0.8, fontSize: 12 }}>user_id: {userId.slice(0, 8)}...</div>
              </div>
            ) : (
              <div style={{ opacity: 0.9 }}>로그인이 필요합니다.</div>
            )}
          </div>

          {userId ? (
            <button onClick={logout} style={{ ...buttonStyle, width: 120 }}>
              로그아웃
            </button>
          ) : (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="이메일"
                style={{ ...inputStyle, width: 240 }}
              />
              <button onClick={sendMagicLink} disabled={authBusy} style={{ ...buttonStyle, width: 150, opacity: authBusy ? 0.6 : 1 }}>
                로그인 링크
              </button>
            </div>
          )}
        </div>

        {/* Latest summary */}
        <div style={cardStyle}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div>
              <div style={labelStyle}>Latest</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{latest?.date ?? "-"}</div>
            </div>
            <div>
              <div style={labelStyle}>Weight</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{latest?.weight ? `${latest.weight}` : "-"}</div>
            </div>
            <div>
              <div style={labelStyle}>Knee pain (0-10)</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{latest?.kneePain ?? "-"}</div>
            </div>
          </div>
        </div>

        {/* Entry form */}
        <div style={cardStyle}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
            <div>
              <div style={labelStyle}>날짜</div>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
                style={inputStyle}
              />
            </div>
            <div>
              <div style={labelStyle}>체중</div>
              <input value={form.weight} onChange={(e) => setForm((p) => ({ ...p, weight: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <div style={labelStyle}>혈압(수축)</div>
              <input value={form.bp_s} onChange={(e) => setForm((p) => ({ ...p, bp_s: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <div style={labelStyle}>혈압(이완)</div>
              <input value={form.bp_d} onChange={(e) => setForm((p) => ({ ...p, bp_d: e.target.value }))} style={inputStyle} />
            </div>

            <div>
              <div style={labelStyle}>운동 시간(분)</div>
              <input
                value={form.exerciseMin}
                onChange={(e) => setForm((p) => ({ ...p, exerciseMin: e.target.value }))}
                style={inputStyle}
              />
            </div>
            <div>
              <div style={labelStyle}>플랭크(분)</div>
              <input
                value={form.plankMin}
                onChange={(e) => setForm((p) => ({ ...p, plankMin: e.target.value }))}
                style={inputStyle}
              />
            </div>

            <div style={{ gridColumn: "span 2" }}>
              <div style={labelStyle}>무릎 통증(0-10)</div>
              <input
                type="range"
                min={0}
                max={10}
                value={Number(form.kneePain || "0")}
                onChange={(e) => setForm((p) => ({ ...p, kneePain: e.target.value }))}
                style={{ width: "100%" }}
              />
              <div style={{ fontSize: 13, opacity: 0.9 }}>현재: {form.kneePain || "0"}</div>
            </div>

            <div style={{ gridColumn: "span 4" }}>
              <div style={labelStyle}>메모</div>
              <input
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                placeholder="예: 아침 첫걸음이 아팠음, 탁구 후 괜찮아짐"
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
            <button onClick={saveEntry} disabled={loading} style={{ ...buttonStyle, opacity: loading ? 0.6 : 1 }}>
              {loading ? "저장 중..." : editing ? "수정 저장" : "저장"}
            </button>
            {editing && (
              <button onClick={cancelEdit} style={{ ...buttonStyle, width: 140 }}>
                취소
              </button>
            )}
          </div>

          <div style={{ marginTop: 10, fontSize: 13, opacity: 0.85 }}>
            ✅ Supabase DB에 저장됩니다. (같은 날짜는 자동으로 덮어쓰기)
          </div>
        </div>

        {/* Med docs */}
        <div style={cardStyle}>
          <h2 style={{ margin: 0, fontSize: 18 }}>처방약/영양제 (사진 보관)</h2>
          <div style={{ opacity: 0.9, fontSize: 13, marginTop: 6 }}>
            현재 복용 중인 약/영양제 목록을 사진으로 보관합니다. (여러 장 가능)
          </div>

          <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 220px", gap: 12 }}>
            <input
              value={medTitle}
              onChange={(e) => setMedTitle(e.target.value)}
              placeholder="예: 현재 복용 약/영양제"
              style={inputStyle}
            />

            <label
              style={{
                ...buttonStyle,
                display: "inline-flex",
                justifyContent: "center",
                alignItems: "center",
                gap: 8,
                opacity: medBusy ? 0.6 : 1,
              }}
            >
              📷 사진 찍기 / 추가
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                capture="environment"
                style={{ display: "none" }}
                disabled={medBusy}
                onChange={(e) => uploadMedFiles(e.target.files)}
              />
            </label>
          </div>

          <div style={{ marginTop: 10, fontSize: 13, opacity: 0.9 }}>
            {medBusy ? "처리 중..." : medStatus ? medStatus : medDoc ? "준비됨" : "문서를 준비 중입니다..."}
          </div>

          {/* Thumbnails */}
          <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 10 }}>
            {(medDoc?.file_paths ?? []).length === 0 ? (
              <div style={{ opacity: 0.7, fontSize: 13 }}>아직 사진이 없습니다.</div>
            ) : (
              (medDoc?.file_paths ?? []).map((p) => (
                <div key={p} style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: 8 }}>
                  {medUrls[p] ? (
                    <img src={medUrls[p]} alt="" style={{ width: "100%", borderRadius: 10, display: "block" }} />
                  ) : (
                    <div style={{ height: 80, opacity: 0.7, fontSize: 12 }}>이미지 로딩중...</div>
                  )}
                  <button
                    onClick={() => deleteMedFile(p)}
                    disabled={medBusy}
                    style={{
                      ...buttonStyle,
                      marginTop: 8,
                      padding: "8px 10px",
                      fontSize: 12,
                      background: "rgba(255,80,80,0.18)",
                    }}
                  >
                    삭제
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent entries */}
        <div style={cardStyle}>
          <h2 style={{ margin: 0, fontSize: 18 }}>최근 기록</h2>

          {entries.length === 0 ? (
            <div style={{ opacity: 0.7, marginTop: 10 }}>아직 기록이 없습니다. 위에서 하나 저장해보세요.</div>
          ) : (
            <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
              {entries.slice(0, 20).map((e) => (
                <div
                  key={e.id}
                  style={{
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 14,
                    padding: 12,
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr auto",
                    gap: 10,
                    alignItems: "center",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 800 }}>{e.date}</div>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>{e.notes ? e.notes : "메모 없음"}</div>
                  </div>

                  <div style={{ fontSize: 13, opacity: 0.9 }}>
                    체중: <b>{e.weight || "-"}</b> / 혈압: <b>{e.bp_s || "-"}</b>-<b>{e.bp_d || "-"}</b>
                  </div>

                  <div style={{ fontSize: 13, opacity: 0.9 }}>
                    운동: <b>{e.exerciseMin || "-"}</b>분 / 플랭크: <b>{e.plankMin || "-"}</b>분 / 무릎: <b>{e.kneePain}</b>
                  </div>

                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => startEdit(e)} style={{ ...buttonStyle, width: 72, padding: "10px 12px" }}>
                      수정
                    </button>
                    <button
                      onClick={() => deleteEntry(e)}
                      style={{
                        ...buttonStyle,
                        width: 72,
                        padding: "10px 12px",
                        background: "rgba(255,80,80,0.18)",
                      }}
                    >
                      삭제
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ opacity: 0.6, fontSize: 12, paddingBottom: 30 }}>
          문제가 계속되면: 크롬 개발자도구 Console 에러(PC) / 폰에서 “UPLOAD ERROR / DB UPDATE ERROR” 메시지 캡처를 보내주세요.
        </div>
      </div>
    </div>
  );
}