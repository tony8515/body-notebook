"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient, type Session } from "@supabase/supabase-js";

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

type Entry = {
  id: string;
  date: string;
  weight: string;
  bp_s: string;
  bp_d: string;
  exerciseMin: string;
  plankMin: string;
  kneePain: string;
  notes: string;
  createdAt?: string;
};

type MedDocRow = {
  id: string;
  user_id: string;
  title: string | null;
  file_paths: string[] | null;
  created_at: string;
  updated_at: string;
};

function todayYMD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toNumOrNull(v: string) {
  const s = (v ?? "").toString().trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function safeFileName(name: string) {
  // 파일명 안전하게 (공백/특수문자 최소화)
  return (name || "file")
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 140);
}

// ✅ 버킷 이름(사진에서 meddocs)
const MED_BUCKET = "meddocs";

// ✅ Supabase client (이 파일에서 직접 생성)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default function Home() {
  // ---- Auth UI ----
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");

  const [session, setSession] = useState<Session | null>(null);
  const userId = session?.user?.id ?? null;

  // ---- Body entries ----
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState(() => ({
    date: todayYMD(),
    weight: "",
    bp_s: "",
    bp_d: "",
    exerciseMin: "",
    plankMin: "",
    kneePain: "0",
    notes: "",
  }));

  const [editing, setEditing] = useState<{ id: string; originalDate: string } | null>(null);

  // ---- Med docs ----
  const [medTitle, setMedTitle] = useState("");
  const [medDoc, setMedDoc] = useState<MedDocRow | null>(null);
  const [medUrls, setMedUrls] = useState<Record<string, string>>({});
  const [medBusy, setMedBusy] = useState(false);
  const [medStatus, setMedStatus] = useState("");

  // ------------------- Auth bootstrap -------------------
  useEffect(() => {
    let mounted = true;

    async function bootstrap() {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(data.session ?? null);

      if (data.session?.user?.id) {
        await Promise.all([loadEntries(data.session.user.id), loadMedDoc(data.session.user.id)]);
      } else {
        setEntries([]);
        setMedDoc(null);
        setMedUrls({});
      }
    }

    bootstrap();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      if (!mounted) return;
      setSession(newSession);

      const uid = newSession?.user?.id ?? null;
      if (uid) {
        await Promise.all([loadEntries(uid), loadMedDoc(uid)]);
      } else {
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

  // ------------------- Auth actions -------------------
  async function signIn() {
    setLoading(true);
    try {
      const e = email.trim();
      if (!e || !pw) {
        alert("이메일과 비밀번호를 입력하세요.");
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({ email: e, password: pw });
      if (error) throw error;
    } catch (err: any) {
      alert("로그인 실패: " + (err?.message ?? String(err)));
    } finally {
      setLoading(false);
    }
  }

  async function signUp() {
    setLoading(true);
    try {
      const e = email.trim();
      if (!e || !pw) {
        alert("이메일과 비밀번호를 입력하세요.");
        return;
      }
      const { error } = await supabase.auth.signUp({ email: e, password: pw });
      if (error) throw error;
      alert("가입 완료! 이제 로그인하세요.");
    } catch (err: any) {
      alert("가입 실패: " + (err?.message ?? String(err)));
    } finally {
      setLoading(false);
    }
  }

  async function signOut() {
    setLoading(true);
    try {
      await supabase.auth.signOut();
    } finally {
      setLoading(false);
    }
  }

  // ------------------- DB: body_entries -------------------
  async function loadEntries(uid: string) {
    try {
      const { data, error } = await supabase
        .from("body_entries")
        .select("*")
        .eq("user_id", uid)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) throw error;

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
    } catch (err: any) {
      alert("불러오기 실패: " + (err?.message ?? String(err)));
      console.log(err);
    }
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
        notes: form.notes?.trim() ? form.notes.trim() : null,
      };

      // 날짜를 "키"처럼 쓰고 싶으면: 동일 날짜는 덮어쓰기(업서트)
      // 가장 쉬운 방법: (user_id, date) 유니크 인덱스가 DB에 있으면 upsert가 깔끔해요.
      // 지금은 id 기반이 아닐 수도 있으니, 편하게: 같은 날짜가 있으면 먼저 찾고 업데이트/없으면 insert
      // (유니크 인덱스 없을 때도 안전하게 동작)

      // 1) 같은 날짜 기존 row 찾기
      const { data: existing, error: findErr } = await supabase
        .from("body_entries")
        .select("id")
        .eq("user_id", userId)
        .eq("date", form.date)
        .limit(1);

      if (findErr) throw findErr;

      if (existing && existing.length > 0) {
        const id = existing[0].id;
        const { error: updErr } = await supabase.from("body_entries").update(payload).eq("id", id);
        if (updErr) throw updErr;
      } else {
        const { error: insErr } = await supabase.from("body_entries").insert(payload);
        if (insErr) throw insErr;
      }

      await loadEntries(userId);

      setForm((p) => ({
        ...p,
        date: todayYMD(),
        weight: "",
        bp_s: "",
        bp_d: "",
        exerciseMin: "",
        plankMin: "",
        kneePain: "0",
        notes: "",
      }));
      setEditing(null);
    } catch (err: any) {
      alert("저장 실패: " + (err?.message ?? String(err)));
      console.log(err);
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
  }

  function cancelEdit() {
    setEditing(null);
    setForm((p) => ({
      ...p,
      date: todayYMD(),
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

    setLoading(true);
    try {
      if (!userId) {
        alert("로그인이 필요합니다.");
        return;
      }
      const { error } = await supabase.from("body_entries").delete().eq("id", e.id);
      if (error) throw error;

      if (editing?.id === e.id) cancelEdit();
      await loadEntries(userId);
    } catch (err: any) {
      alert("삭제 실패: " + (err?.message ?? String(err)));
    } finally {
      setLoading(false);
    }
  }

  // ------------------- DB: med_docs + Storage -------------------
  async function loadMedDoc(uid: string) {
    try {
      setMedStatus("약/영양제 문서 확인중...");
      const { data, error } = await supabase
        .from("med_docs")
        .select("*")
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .limit(1);

      if (error) throw error;

      const doc = data?.[0] ?? null;
      setMedDoc(doc);
      setMedTitle(doc?.title ?? "");

      const paths = doc?.file_paths ?? [];
      await refreshMedSignedUrls(paths);

      setMedStatus("");
    } catch (err: any) {
      setMedStatus("불러오기 실패: " + (err?.message ?? String(err)));
      console.log(err);
    }
  }

  async function ensureMedDoc(uid: string) {
    // 없으면 하나 만들고 리턴
    const { data, error } = await supabase
      .from("med_docs")
      .select("*")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) throw error;
    if (data && data.length > 0) return data[0] as MedDocRow;

    const { data: created, error: insErr } = await supabase
      .from("med_docs")
      .insert({ user_id: uid, title: null, file_paths: [] })
      .select("*")
      .single();

    if (insErr) throw insErr;
    return created as MedDocRow;
  }

  async function refreshMedSignedUrls(paths: string[]) {
    const next: Record<string, string> = {};
    for (const p of paths) {
      const { data, error } = await supabase.storage.from(MED_BUCKET).createSignedUrl(p, 60 * 60);
      if (!error && data?.signedUrl) next[p] = data.signedUrl;
    }
    setMedUrls(next);
  }

  async function uploadMedFiles(files: FileList | null) {
    try {
      setMedStatus(`STEP1 files: ${files?.length ?? 0}`);
      if (!files || files.length === 0) return;

      setMedStatus(`STEP2 userId: ${userId ?? "null"}`);
      if (!userId) {
        setMedStatus("로그인이 필요합니다.");
        return;
      }

      setMedBusy(true);

      // doc 준비
      let doc = medDoc;
      if (!doc) {
        setMedStatus("STEP3 loadMedDoc...");
        doc = await ensureMedDoc(userId);
        setMedDoc(doc);
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
          continue;
        }
        newPaths.push(path);
      }

      setMedStatus("STEP5 DB update...");
      const merged = [...(doc.file_paths ?? []), ...newPaths];

      const updatePayload: any = {
        file_paths: merged,
      };
      if (medTitle.trim()) updatePayload.title = medTitle.trim();

      const { data: upd, error: updErr } = await supabase
        .from("med_docs")
        .update(updatePayload)
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
      setMedStatus("❌ EXCEPTION: " + (e?.message ?? String(e)));
      console.log(e);
    } finally {
      setMedBusy(false);
    }
  }

  async function deleteMedFile(path: string) {
    if (!medDoc) return;
    const ok = confirm("이 사진을 삭제할까요?");
    if (!ok) return;

    try {
      if (!userId) {
        alert("로그인이 필요합니다.");
        return;
      }

      setMedBusy(true);

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
      alert("삭제 실패: " + (e?.message ?? String(e)));
      console.log(e);
    } finally {
      setMedBusy(false);
    }
  }

  const latest = useMemo(() => entries?.[0] ?? null, [entries]);

  // ------------------- UI -------------------
  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: 16, color: "#eee" }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>Body Notebook</h1>
      <p style={{ opacity: 0.8, marginTop: 0 }}>
        건강/운동/무릎 통증을 간단히 기록해봅시다.
      </p>

      <div style={cardStyle}>
        <h2 style={h2Style}>로그인 (비밀번호로 로그인)</h2>

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
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            type="password"
            autoComplete="current-password"
          />

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button style={btnStyle} onClick={signIn} disabled={loading}>
              로그인
            </button>
            <button style={btnStyle} onClick={signUp} disabled={loading}>
              가입
            </button>
            <button style={btnStyle} onClick={signOut} disabled={loading || !session}>
              로그아웃
            </button>
          </div>

          <div style={{ opacity: 0.85, fontSize: 14 }}>
            현재: {session?.user?.email ?? "로그인 전"}
          </div>
        </div>
      </div>

      <div style={cardStyle}>
        <h2 style={h2Style}>요약</h2>
        {latest ? (
          <div style={{ lineHeight: 1.7 }}>
            <div>Latest: <b>{latest.date}</b></div>
            <div>Weight: {latest.weight || "-"}</div>
            <div>Blood Pressure: {latest.bp_s || "-"} / {latest.bp_d || "-"}</div>
            <div>Exercise (min): {latest.exerciseMin || "-"}</div>
            <div>Plank (min): {latest.plankMin || "-"}</div>
            <div>Knee pain (0-10): {latest.kneePain || "-"}</div>
          </div>
        ) : (
          <div style={{ opacity: 0.8 }}>No entries yet</div>
        )}
      </div>

      <div style={cardStyle}>
        <h2 style={h2Style}>{editing ? "기록 수정" : "새 기록"}</h2>

        <div style={{ display: "grid", gap: 10 }}>
          <input
            style={inputStyle}
            value={form.date}
            onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
            placeholder="YYYY-MM-DD"
          />
          <input
            style={inputStyle}
            value={form.weight}
            onChange={(e) => setForm((p) => ({ ...p, weight: e.target.value }))}
            placeholder="체중 (예: 165.7)"
          />
          <div style={{ display: "flex", gap: 10 }}>
            <input
              style={inputStyle}
              value={form.bp_s}
              onChange={(e) => setForm((p) => ({ ...p, bp_s: e.target.value }))}
              placeholder="혈압 S"
            />
            <input
              style={inputStyle}
              value={form.bp_d}
              onChange={(e) => setForm((p) => ({ ...p, bp_d: e.target.value }))}
              placeholder="혈압 D"
            />
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <input
              style={inputStyle}
              value={form.exerciseMin}
              onChange={(e) => setForm((p) => ({ ...p, exerciseMin: e.target.value }))}
              placeholder="운동(분)"
            />
            <input
              style={inputStyle}
              value={form.plankMin}
              onChange={(e) => setForm((p) => ({ ...p, plankMin: e.target.value }))}
              placeholder="플랭크(분)"
            />
          </div>

          <input
            style={inputStyle}
            value={form.kneePain}
            onChange={(e) => setForm((p) => ({ ...p, kneePain: e.target.value }))}
            placeholder="무릎통증 0~10"
          />

          <input
            style={inputStyle}
            value={form.notes}
            onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
            placeholder="메모 (예: 아침 첫걸음이 아팠음, 탁구 후 괜찮아짐)"
          />

          <button style={btnStyle} onClick={saveEntry} disabled={loading}>
            {loading ? "저장 중..." : editing ? "수정 저장" : "저장"}
          </button>

          {editing && (
            <button style={btnStyle} onClick={cancelEdit} disabled={loading}>
              수정 취소
            </button>
          )}

          <div style={{ opacity: 0.85, fontSize: 14 }}>
            ✅ Supabase DB에 저장됩니다. (같은 날짜는 자동으로 덮어쓰기)
          </div>
        </div>
      </div>

      <div style={cardStyle}>
        <h2 style={h2Style}>처방약/영양제 (사진 보관)</h2>
        <p style={{ opacity: 0.8, marginTop: 0 }}>
          현재 복용 중인 약/영양제 목록을 사진으로 보관합니다. (여러 장 가능)
        </p>

        <div style={{ display: "grid", gap: 10 }}>
          <input
            style={inputStyle}
            value={medTitle}
            onChange={(e) => setMedTitle(e.target.value)}
            placeholder="예: 현재 복용 약/영양제"
          />

          <label style={{ display: "inline-block" }}>
            <input
              type="file"
              accept="image/*"
              multiple
              capture="environment"
              style={{ display: "none" }}
              onChange={(e) => uploadMedFiles(e.target.files)}
              disabled={medBusy}
            />
            <button style={btnStyle} disabled={medBusy}>
              📷 사진 찍기 / 추가
            </button>
          </label>

          <div style={{ opacity: 0.85 }}>{medBusy ? "처리 중..." : ""}</div>
          <div style={{ opacity: 0.85 }}>{medStatus}</div>

          {(medDoc?.file_paths?.length ?? 0) === 0 ? (
            <div style={{ opacity: 0.8 }}>아직 사진이 없습니다. 위에서 사진을 추가해보세요.</div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {(medDoc?.file_paths ?? []).map((p) => (
                <div key={p} style={{ border: "1px solid #333", borderRadius: 12, padding: 10 }}>
                  <div style={{ fontSize: 12, opacity: 0.75, wordBreak: "break-all" }}>{p}</div>
                  {medUrls[p] ? (
                    <img
                      src={medUrls[p]}
                      alt="med"
                      style={{ width: "100%", borderRadius: 12, marginTop: 8 }}
                    />
                  ) : (
                    <div style={{ opacity: 0.8, marginTop: 8 }}>이미지 URL 생성중...</div>
                  )}
                  <button
                    style={{ ...btnStyle, marginTop: 8 }}
                    onClick={() => deleteMedFile(p)}
                    disabled={medBusy}
                  >
                    삭제
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={cardStyle}>
        <h2 style={h2Style}>최근 기록</h2>
        {entries.length === 0 ? (
          <div style={{ opacity: 0.8 }}>아직 기록이 없습니다. 위에서 하나 저장해보세요.</div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {entries.slice(0, 10).map((e) => (
              <div key={e.id} style={{ border: "1px solid #333", borderRadius: 12, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{e.date}</div>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>{e.createdAt ?? ""}</div>
                </div>

                <div style={{ marginTop: 8, lineHeight: 1.8 }}>
                  <div>체중: {e.weight || "-"}</div>
                  <div>혈압: {e.bp_s || "-"} / {e.bp_d || "-"}</div>
                  <div>운동(분): {e.exerciseMin || "-"}</div>
                  <div>플랭크(분): {e.plankMin || "-"}</div>
                  <div>무릎: {e.kneePain || "-"}</div>
                </div>

                <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                  <button style={btnStyle} onClick={() => startEdit(e)} disabled={loading}>
                    수정
                  </button>
                  <button style={{ ...btnStyle, background: "#6b1f2a" }} onClick={() => deleteEntry(e)} disabled={loading}>
                    삭제
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ------------------- simple styles -------------------
const cardStyle: React.CSSProperties = {
  border: "1px solid #333",
  borderRadius: 18,
  padding: 16,
  marginTop: 14,
  background: "rgba(0,0,0,0.25)",
};

const h2Style: React.CSSProperties = {
  marginTop: 0,
  marginBottom: 10,
  fontSize: 20,
  fontWeight: 800,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 12px",
  borderRadius: 12,
  border: "1px solid #333",
  background: "rgba(0,0,0,0.35)",
  color: "#eee",
  outline: "none",
};

const btnStyle: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid #333",
  background: "rgba(255,255,255,0.08)",
  color: "#eee",
  cursor: "pointer",
};