"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

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
  kneePain: string; // 0-10
  notes: string;
  createdAt?: string;
};

type MedDocRow = {
  id: string;
  user_id: string;
  doc_type: string;
  title: string;
  file_paths: string[] | null;
  created_at?: string;
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
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function safeFileName(name: string) {
  // 파일명에 문제되는 문자 제거
  return name.replace(/[^\w.\-() ]+/g, "_");
}

const MED_BUCKET = "meddocs"; // ✅ Supabase Storage bucket name
const MED_DOC_TYPE = "rx_supplements"; // 필요하면 여기만 바꾸세요(테이블 enum/텍스트와 일치해야 함)

export default function Home() {
  // auth/session
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string>("");
  const [pw, setPw] = useState<string>("");
  const [userId, setUserId] = useState<string | null>(null);

  // entries
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
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

  // med docs
  const [medDoc, setMedDoc] = useState<MedDocRow | null>(null);
  const [medTitle, setMedTitle] = useState<string>("처방약/영양제");
  const [medBusy, setMedBusy] = useState(false);
  const [medStatus, setMedStatus] = useState<string>("");
  const [medUrls, setMedUrls] = useState<Record<string, string>>({});

  // ✅ 중복 요청/취소 방지용 request id
  const reqSeq = useRef(0);
  const lastLoadedUid = useRef<string | null>(null);

  const latest = useMemo(() => (entries.length ? entries[0] : null), [entries]);

  // --------------------------
  // Auth
  // --------------------------
  async function login() {
    try {
      setLoading(true);
      const { data, error } = await supabase.auth.signInWithPassword({
        email: userEmail.trim(),
        password: pw,
      });
      if (error) throw error;
      const uid = data.session?.user?.id ?? null;
      setUserId(uid);
      setSessionEmail(data.session?.user?.email ?? null);
      if (uid) {
        await loadEntries(uid);
        await loadMedDoc(uid);
      }
    } catch (e: any) {
      console.error("LOGIN ERROR:", e);
      alert(`로그인 실패: ${e?.message ?? String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    try {
      await supabase.auth.signOut();
      setUserId(null);
      setSessionEmail(null);
      setEntries([]);
      setEditing(null);
      setForm((p) => ({ ...p, date: todayYMD() }));
      setMedDoc(null);
      setMedUrls({});
      setMedStatus("");
    } catch (e: any) {
      console.error("LOGOUT ERROR:", e);
      alert(`로그아웃 실패: ${e?.message ?? String(e)}`);
    }
  }

  // --------------------------
  // Load entries (stable)
  // --------------------------
  async function loadEntries(uid?: string | null) {
    const realUid = uid ?? userId;
    if (!realUid) return;

    // ✅ 같은 uid를 연속으로 로딩할 때 중복 방지
    // (원하시면 주석 처리 가능)
    // if (lastLoadedUid.current === realUid && entries.length > 0) return;

    const myReq = ++reqSeq.current;

    try {
      const { data, error } = await supabase
        .from("body_entries")
        .select("*")
        .eq("user_id", realUid)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false });

      // ✅ 더 최신 요청이 있으면 이 결과는 무시
      if (myReq !== reqSeq.current) return;

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

      lastLoadedUid.current = realUid;
      setEntries(mapped);
    } catch (e: any) {
      console.error("LOAD ENTRIES ERROR:", e);
      // ✅ AbortError라도 메시지 더 자세히 보이게
      const msg = e?.message ?? String(e);
      alert(`불러오기 실패: ${msg}`);
    }
  }

  async function saveEntry() {
    if (!userId) {
      alert("로그인이 필요합니다.");
      return;
    }
    if (!form.date) {
      alert("날짜를 입력하세요.");
      return;
    }

    setLoading(true);
    try {
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

      // 날짜 변경 편집 시: 기존 row 삭제 후 upsert
      if (editing && editing.originalDate !== form.date) {
        const { error: delErr } = await supabase.from("body_entries").delete().eq("id", editing.id);
        if (delErr) throw delErr;
      }

      // ✅ date 중복은 upsert로 덮어쓰기(테이블에 unique(user_id, date) 추천)
      const { error } = await supabase.from("body_entries").upsert(payload);

      if (error) throw error;

      await loadEntries(userId);

      setForm((p) => ({
        ...p,
        // date는 유지(다음 입력 편하게)
        weight: "",
        bp_s: "",
        bp_d: "",
        exerciseMin: "",
        plankMin: "",
        kneePain: "0",
        notes: "",
      }));
      setEditing(null);
    } catch (e: any) {
      console.error("SAVE ERROR:", e);
      alert(`저장 실패: ${e?.message ?? String(e)}`);
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

    if (!userId) {
      alert("로그인이 필요합니다.");
      return;
    }

    try {
      const { error } = await supabase.from("body_entries").delete().eq("id", e.id);
      if (error) throw error;

      if (editing?.id === e.id) cancelEdit();
      await loadEntries(userId);
    } catch (err: any) {
      console.error("DELETE ERROR:", err);
      alert(`삭제 실패: ${err?.message ?? String(err)}`);
    }
  }

  // --------------------------
  // Med docs
  // --------------------------
  async function loadMedDoc(uid?: string | null) {
    const realUid = uid ?? userId;
    if (!realUid) return;

    try {
      const { data, error } = await supabase
        .from("med_docs")
        .select("*")
        .eq("user_id", realUid)
        .eq("doc_type", MED_DOC_TYPE)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setMedDoc(data as MedDocRow);
        // 제목 자동 채우기
        setMedTitle((prev) => (prev.trim() ? prev : (data as any).title ?? "처방약/영양제"));
        await refreshMedSignedUrls((data as any).file_paths ?? []);
      } else {
        setMedDoc(null);
        setMedUrls({});
      }
    } catch (e: any) {
      console.error("LOAD MEDDOC ERROR:", e);
      // 여기서 AbortError가 나면, 우선 네트워크/중복 호출 문제 가능성
      // 하지만 이제는 호출 구조가 안정화되어서 원인 파악이 쉬워집니다.
    }
  }

  async function ensureMedDoc(uid: string) {
    // 이미 있으면 사용
    if (medDoc?.id && medDoc.user_id === uid) return medDoc;

    // 없으면 생성
    const { data, error } = await supabase
      .from("med_docs")
      .insert({
        user_id: uid,
        doc_type: MED_DOC_TYPE,
        title: "처방약/영양제",
        file_paths: [],
      })
      .select("*")
      .single();

    if (error) throw error;

    const created = data as MedDocRow;
    setMedDoc(created);
    setMedTitle((prev) => (prev.trim() ? prev : created.title ?? "처방약/영양제"));
    return created;
  }

  async function refreshMedSignedUrls(paths: string[]) {
    const next: Record<string, string> = {};
    for (const p of paths) {
      try {
        const { data, error } = await supabase.storage.from(MED_BUCKET).createSignedUrl(p, 60 * 60);
        if (!error && data?.signedUrl) next[p] = data.signedUrl;
      } catch (e) {
        // ignore per file
      }
    }
    setMedUrls(next);
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

      setMedStatus("STEP3 ensureMedDoc...");
      const doc = await ensureMedDoc(userId);
      if (!doc?.id) {
        setMedStatus("STEP3 FAIL: medDoc 로드/생성 실패");
        return;
      }

      setMedStatus("STEP4 uploading...");
      const newPaths: string[] = [];

      for (const file of Array.from(files)) {
        const cleaned = safeFileName(file.name || "photo");
        const fileName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${cleaned}`;
        const path = `${userId}/${doc.id}/${fileName}`;

        const { error: upErr } = await supabase.storage.from(MED_BUCKET).upload(path, file, {
          upsert: true,
          contentType: file.type || "application/octet-stream",
        });

        if (upErr) {
          console.error("UPLOAD ERROR:", upErr);
          setMedStatus(`UPLOAD ERROR: ${upErr.message}`);
          continue;
        }

        newPaths.push(path);
      }

      setMedStatus("STEP5 DB update...");
      const merged = [...(doc.file_paths ?? []), ...newPaths];

      const updatePayload: any = { file_paths: merged };
      if (medTitle.trim()) updatePayload.title = medTitle.trim();

      const { data: upd, error: updErr } = await supabase
        .from("med_docs")
        .update(updatePayload)
        .eq("id", doc.id)
        .select("*")
        .single();

      if (updErr) {
        console.error("DB UPDATE ERROR:", updErr);
        setMedStatus(`DB UPDATE ERROR: ${updErr.message}`);
        return;
      }

      const updatedDoc = upd as MedDocRow;
      setMedDoc(updatedDoc);

      setMedStatus("STEP6 signed url...");
      await refreshMedSignedUrls(updatedDoc.file_paths ?? []);

      setMedStatus("✅ 완료! 사진이 저장되었습니다.");
      setTimeout(() => setMedStatus(""), 2500);
    } catch (e: any) {
      console.error("MED EXCEPTION:", e);
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
      console.error("DELETE MED FILE ERROR:", e);
      alert(`삭제 실패: ${e?.message ?? String(e)}`);
    } finally {
      setMedBusy(false);
    }
  }

  // --------------------------
  // Bootstrap (중복 로딩 방지 구조)
  // --------------------------
  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (!mounted) return;
        if (error) throw error;

        const sess = data.session;
        if (sess?.user) {
          const uid = sess.user.id;
          setUserId(uid);
          setSessionEmail(sess.user.email ?? null);
          setUserEmail(sess.user.email ?? "");
          // ✅ 여기서 한 번만 로딩
          await loadEntries(uid);
          await loadMedDoc(uid);
        } else {
          setUserId(null);
          setSessionEmail(null);
        }
      } catch (e: any) {
        console.error("INIT ERROR:", e);
        // 여기서 AbortError가 계속 난다면, 네트워크/브라우저/확장프로그램 가능성도 있음
      }
    }

    init();

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;

      if (session?.user) {
        const uid = session.user.id;
        setUserId(uid);
        setSessionEmail(session.user.email ?? null);
        setUserEmail(session.user.email ?? "");

        // ✅ 이벤트로 또 들어와도, 같은 uid면 loadEntries가 겹치지 않게 request-id가 보호해줌
        await loadEntries(uid);
        await loadMedDoc(uid);
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
      sub?.subscription?.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --------------------------
  // UI
  // --------------------------
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 p-4">
      <div className="max-w-2xl mx-auto space-y-4">
        <h1 className="text-2xl font-bold">Body Notebook</h1>
        <p className="text-sm text-neutral-400">건강/운동/무릎 통증을 간단히 기록해봅시다.</p>

        {/* Auth */}
        <div className="rounded-2xl border border-neutral-800 p-4 space-y-3">
          {sessionEmail ? (
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm">
                로그인: <span className="font-semibold">{sessionEmail}</span>
              </div>
              <button
                onClick={logout}
                className="px-3 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-sm"
              >
                로그아웃
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-sm text-neutral-300">로그인 전 (비밀번호로 로그인)</div>
              <input
                className="w-full px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-800"
                placeholder="이메일"
                value={userEmail}
                onChange={(e) => setUserEmail(e.target.value)}
              />
              <input
                className="w-full px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-800"
                placeholder="비밀번호"
                type="password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
              />
              <button
                onClick={login}
                disabled={loading}
                className="px-3 py-2 rounded-xl bg-neutral-200 text-neutral-900 hover:bg-white disabled:opacity-60"
              >
                로그인
              </button>
            </div>
          )}
        </div>

        {/* Latest summary */}
        <div className="rounded-2xl border border-neutral-800 p-4">
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <div className="text-neutral-400">Latest</div>
              <div className="font-semibold">{latest ? latest.date : "No entries yet"}</div>
            </div>
            <div>
              <div className="text-neutral-400">Weight</div>
              <div className="font-semibold">{latest ? (latest.weight || "-") : "-"}</div>
            </div>
            <div>
              <div className="text-neutral-400">Exercise (min)</div>
              <div className="font-semibold">{latest ? (latest.exerciseMin || "-") : "-"}</div>
            </div>
            <div>
              <div className="text-neutral-400">Knee pain (0-10)</div>
              <div className="font-semibold">{latest ? (latest.kneePain || "-") : "-"}</div>
            </div>
          </div>
        </div>

        {/* Entry form */}
        <div className="rounded-2xl border border-neutral-800 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-semibold">{editing ? "기록 수정" : "새 기록"}</div>
            <div className="text-xs text-neutral-500">Supabase DB에 저장됩니다. (같은 날짜는 자동 덮어쓰기)</div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <div className="text-xs text-neutral-400">날짜</div>
              <input
                type="date"
                className="w-full px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-800"
                value={form.date}
                onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
              />
            </div>

            <div className="space-y-1">
              <div className="text-xs text-neutral-400">체중</div>
              <input
                className="w-full px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-800"
                value={form.weight}
                onChange={(e) => setForm((p) => ({ ...p, weight: e.target.value }))}
              />
            </div>

            <div className="space-y-1">
              <div className="text-xs text-neutral-400">혈압(수축)</div>
              <input
                className="w-full px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-800"
                value={form.bp_s}
                onChange={(e) => setForm((p) => ({ ...p, bp_s: e.target.value }))}
              />
            </div>

            <div className="space-y-1">
              <div className="text-xs text-neutral-400">혈압(이완)</div>
              <input
                className="w-full px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-800"
                value={form.bp_d}
                onChange={(e) => setForm((p) => ({ ...p, bp_d: e.target.value }))}
              />
            </div>

            <div className="space-y-1">
              <div className="text-xs text-neutral-400">운동 시간(분)</div>
              <input
                className="w-full px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-800"
                value={form.exerciseMin}
                onChange={(e) => setForm((p) => ({ ...p, exerciseMin: e.target.value }))}
              />
            </div>

            <div className="space-y-1">
              <div className="text-xs text-neutral-400">플랭크(분)</div>
              <input
                className="w-full px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-800"
                value={form.plankMin}
                onChange={(e) => setForm((p) => ({ ...p, plankMin: e.target.value }))}
              />
            </div>

            <div className="col-span-2 space-y-1">
              <div className="text-xs text-neutral-400">무릎 통증(0-10): {form.kneePain}</div>
              <input
                type="range"
                min={0}
                max={10}
                className="w-full"
                value={Number(form.kneePain || 0)}
                onChange={(e) => setForm((p) => ({ ...p, kneePain: e.target.value }))}
              />
            </div>

            <div className="col-span-2 space-y-1">
              <div className="text-xs text-neutral-400">메모</div>
              <input
                className="w-full px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-800"
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              />
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={saveEntry}
              disabled={loading}
              className="px-4 py-2 rounded-xl bg-neutral-200 text-neutral-900 hover:bg-white disabled:opacity-60"
            >
              {editing ? "수정 저장" : "저장"}
            </button>
            {editing && (
              <button
                onClick={cancelEdit}
                className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700"
              >
                취소
              </button>
            )}
          </div>
        </div>

        {/* Med docs */}
        <div className="rounded-2xl border border-neutral-800 p-4 space-y-3">
          <div className="font-semibold">처방약/영양제 (사진 보관)</div>
          <div className="text-sm text-neutral-400">
            현재 복용 중인 약/영양제 목록을 사진으로 보관합니다. (여러 장 가능)
          </div>

          <div className="text-xs text-neutral-500">{medStatus}</div>

          <input
            className="w-full px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-800"
            value={medTitle}
            onChange={(e) => setMedTitle(e.target.value)}
          />

          <label className="inline-flex items-center gap-2">
            <input
              type="file"
              accept="image/*"
              multiple
              capture="environment"
              disabled={!userId || medBusy}
              onChange={(e) => uploadMedFiles(e.target.files)}
              className="hidden"
            />
            <span
              className={`px-4 py-2 rounded-xl cursor-pointer ${
                !userId || medBusy ? "bg-neutral-800 opacity-60" : "bg-neutral-700 hover:bg-neutral-600"
              }`}
            >
              📸 사진 찍기 / 추가
            </span>
          </label>

          {medBusy && <div className="text-sm text-neutral-400">처리 중...</div>}

          <div className="space-y-2">
            {(medDoc?.file_paths ?? []).length === 0 ? (
              <div className="text-sm text-neutral-500">아직 사진이 없습니다. 위에서 사진을 추가해보세요.</div>
            ) : (
              (medDoc?.file_paths ?? []).map((p) => (
                <div key={p} className="rounded-xl border border-neutral-800 p-3 space-y-2">
                  <div className="text-xs text-neutral-500 break-all">{p}</div>
                  {medUrls[p] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={medUrls[p]} alt="med" className="w-full rounded-xl border border-neutral-800" />
                  ) : (
                    <div className="text-sm text-neutral-500">이미지 URL 생성 중...</div>
                  )}
                  <button
                    onClick={() => deleteMedFile(p)}
                    disabled={medBusy}
                    className="px-3 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-sm disabled:opacity-60"
                  >
                    삭제
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent entries list */}
        <div className="rounded-2xl border border-neutral-800 p-4 space-y-3">
          <div className="font-semibold">최근 기록</div>
          {entries.length === 0 ? (
            <div className="text-sm text-neutral-500">기록이 없습니다.</div>
          ) : (
            <div className="space-y-3">
              {entries.slice(0, 10).map((e) => (
                <div key={e.id} className="rounded-2xl border border-neutral-800 p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-lg font-bold">{e.date}</div>
                    <div className="text-xs text-neutral-500">{e.createdAt ? new Date(e.createdAt).toLocaleString() : ""}</div>
                  </div>
                  <div className="text-sm mt-2 text-neutral-200 space-y-1">
                    <div>체중: {e.weight || "-"} &nbsp; 혈압: {e.bp_s || "-"} / {e.bp_d || "-"} &nbsp; 운동(분): {e.exerciseMin || "-"}</div>
                    <div>플랭크(분): {e.plankMin || "-"} &nbsp; 무릎: {e.kneePain || "0"}</div>
                    {e.notes ? <div className="text-neutral-300">메모: {e.notes}</div> : null}
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => startEdit(e)}
                      className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700"
                    >
                      수정
                    </button>
                    <button
                      onClick={() => deleteEntry(e)}
                      className="px-4 py-2 rounded-xl bg-rose-900 hover:bg-rose-800"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              ))}
              {entries.length > 10 && (
                <div className="text-xs text-neutral-500">최근 10개만 표시 중</div>
              )}
            </div>
          )}
        </div>

        <div className="text-xs text-neutral-600">
          문제가 계속되면: PC 크롬 개발자도구(Console)에서 <b>LOAD ENTRIES ERROR</b> 로그를 확인하면 원인이 더 정확히 나옵니다.
        </div>
      </div>
    </div>
  );
}