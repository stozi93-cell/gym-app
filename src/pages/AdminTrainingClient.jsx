import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";

export default function AdminTrainingClient() {
  const { uid } = useParams();
  const navigate = useNavigate();

  const [weeks, setWeeks] = useState([]);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);

  /* 🟡 NEW */
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  /* ─────────────────────────────
     Helpers
  ───────────────────────────── */
  const markDirty = useCallback(() => {
    setDirty(true);
  }, []);

  /* ─────────────────────────────
     Load
  ───────────────────────────── */
  useEffect(() => {
    async function load() {
      const ref = doc(db, "trainingPlans", uid);
      const snap = await getDoc(ref);

      if (snap.exists()) {
        const data = snap.data();
        setWeeks(data.weeks || []);
        setNotes(data.notes || "");
      }

      setLoading(false);
    }

    load();
  }, [uid]);

  /* ─────────────────────────────
     SAVE
  ───────────────────────────── */
  async function save() {
    setSaving(true);

    await setDoc(
      doc(db, "trainingPlans", uid),
      {
        weeks,
        notes,
        updatedAt: new Date(),
      },
      { merge: true }
    );

    setDirty(false);
    setSaving(false);
  }

  /* ─────────────────────────────
     WARN ON LEAVE (refresh / close)
  ───────────────────────────── */
  useEffect(() => {
    const handler = (e) => {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = "";
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  /* ─────────────────────────────
     WARN ON ROUTE CHANGE
  ───────────────────────────── */
  const safeNavigate = (to) => {
    if (dirty) {
      const ok = window.confirm(
        "Imaš nesačuvane izmene. Da li si siguran da želiš da napustiš stranicu?"
      );
      if (!ok) return;
    }
    navigate(to);
  };

  if (loading) return null;

  return (
    <div className="px-4 py-2 space-y-4">

      {/* 🟢 SAVE BAR */}
      <div className="sticky top-0 z-10 bg-neutral-950/90 backdrop-blur border-b border-neutral-800 p-3 flex items-center justify-between">
        <p className="text-sm text-neutral-400">
          {dirty ? "Nesačuvane izmene" : "Sve je sačuvano"}
        </p>

        <button
          onClick={save}
          disabled={!dirty || saving}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
            dirty
              ? "bg-blue-600 hover:bg-blue-700 text-white"
              : "bg-neutral-700 text-neutral-400 cursor-not-allowed"
          }`}
        >
          {saving ? "Čuvanje..." : "Sačuvaj"}
        </button>
      </div>

      {/* 📝 NOTES */}
      <div className="rounded-xl bg-neutral-900 p-4">
        <p className="mb-2 text-sm text-neutral-400">Napomene trenera</p>
        <textarea
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
            markDirty();
          }}
          rows={3}
          className="w-full rounded-lg bg-neutral-800 p-3 text-white outline-none"
        />
      </div>

      {/* WEEKS */}
      <div className="space-y-4">
        {weeks.map((week, wi) => (
          <div
            key={week.id}
            className="rounded-xl border border-neutral-700 bg-neutral-900"
          >
            {/* everything inside week stays EXACTLY as you already have it */}

            {/* EXAMPLE of marking dirty */}
            {/* 
              setWeeks(...) 
              markDirty();
            */}
          </div>
        ))}
      </div>

      {/* Example back button using safeNavigate */}
      <button
        onClick={() => safeNavigate("/admin")}
        className="text-sm text-neutral-400 underline"
      >
        Nazad
      </button>
    </div>
  );
}
