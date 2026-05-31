import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { doc, getDoc, runTransaction, Timestamp } from "firebase/firestore";
import { db } from "../firebase";

/* ───────── helpers ───────── */

function formatDay(date) {
  if (!date) return "Nepoznat datum";

  const d =
    typeof date === "string"
      ? new Date(date)
      : date?.toDate?.() ?? new Date(date);

  if (isNaN(d)) return "Nepoznat datum";

  return d.toLocaleDateString("sr-Latn-RS", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
}

const createId = (prefix) =>
  `${prefix}_${crypto.randomUUID?.() || `${Date.now()}_${Math.random()}`}`;

const emptySet = () => ({ id: createId("set"), reps: 10, weight: "" });

const emptyExercise = () => ({
  id: createId("exercise"),
  name: "",
  sets: [emptySet()],
});

const emptyBlock = (index) => ({
  id: createId("block"),
  name: String.fromCharCode(65 + index),
  exercises: [],
});

const emptyTraining = () => ({
  id: createId("training"),
  date: new Date().toISOString().slice(0, 10),
  blocks: [emptyBlock(0)],
  open: false,
});

const emptyWeek = (index) => ({
  id: createId("week"),
  label: `Nedelja ${index}`,
  trainings: [emptyTraining()],
  open: false,
});

function normalizeSet(set = {}) {
  return {
    ...set,
    id: set.id || createId("set"),
    reps: set.reps ?? 10,
    weight: set.weight ?? "",
  };
}

function normalizeExercise(exercise = {}) {
  return {
    ...exercise,
    id: exercise.id || createId("exercise"),
    name: exercise.name || "",
    sets: (exercise.sets ?? []).map(normalizeSet),
  };
}

function normalizeBlock(block = {}, index = 0) {
  return {
    ...block,
    id: block.id || createId("block"),
    name: block.name || String.fromCharCode(65 + index),
    exercises: (block.exercises ?? []).map(normalizeExercise),
  };
}

function normalizeTraining(training = {}) {
  return {
    ...training,
    id: training.id || createId("training"),
    date:
      typeof training.date === "string"
        ? training.date
        : training.date?.toDate?.()?.toISOString()?.slice(0, 10) ??
          new Date().toISOString().slice(0, 10),
    blocks: (training.blocks ?? []).map(normalizeBlock),
    open: false,
  };
}

function normalizeWeek(week = {}, index = 0) {
  return {
    ...week,
    id: week.id || createId("week"),
    label: week.label || `Nedelja ${index + 1}`,
    trainings: (week.trainings ?? []).map(normalizeTraining),
    open: false,
  };
}

function cloneTraining(training) {
  return normalizeTraining({
    ...structuredClone(training),
    id: null,
    blocks: training.blocks.map((block) => ({
      ...structuredClone(block),
      id: null,
      exercises: block.exercises.map((exercise) => ({
        ...structuredClone(exercise),
        id: null,
        sets: exercise.sets.map((set) => ({
          ...structuredClone(set),
          id: null,
        })),
      })),
    })),
  });
}

function cloneWeek(week, label) {
  return normalizeWeek({
    ...structuredClone(week),
    id: null,
    label,
    trainings: week.trainings.map(cloneTraining),
  });
}

function serializeWeeks(weeks) {
  return weeks.map((week) => {
    const savedWeek = { ...week };
    delete savedWeek.open;
    savedWeek.trainings = week.trainings.map((training) => {
      const savedTraining = { ...training };
      delete savedTraining.open;
      return savedTraining;
    });
    return savedWeek;
  });
}

/* ───────── component ───────── */

export default function AdminTrainingClient() {
  const { clientId } = useParams();
  const isValidClientId =
    typeof clientId === "string" && clientId.length >= 5;
  const [notes, setNotes] = useState("");
  const [weeks, setWeeks] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [loadedUpdatedAt, setLoadedUpdatedAt] = useState(null);

  const markDirty = useCallback(() => {
    setDirty(true);
  }, []);

  /* ───────── load ───────── */

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError("");
      setNotes("");
      setWeeks([]);
      setDirty(false);
      setSaveMessage("");
      setLoadedUpdatedAt(null);

      if (!isValidClientId) {
        setLoading(false);
        return;
      }

      try {
        const ref = doc(db, "trainingPlans", clientId);
        const snap = await getDoc(ref);

        if (cancelled) return;

        if (snap.exists()) {
          const data = snap.data();
          setLoadedUpdatedAt(data.updatedAt?.toMillis?.() ?? null);

          if (typeof data.notes === "string") {
            setNotes(data.notes);
          }

          if (Array.isArray(data.weeks)) {
            setWeeks(data.weeks.map(normalizeWeek));
          }
        } else {
          setWeeks([emptyWeek(1)]);
        }
      } catch (e) {
        console.error("LOAD TRAINING ERROR", e);
        if (!cancelled) {
          setLoadError("Plan treninga nije učitan. Pokušajte ponovo.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [clientId, isValidClientId]);

  useEffect(() => {
    if (!dirty) return undefined;

    const message = "Imate nesačuvane izmene. Da li želite da napustite stranicu?";
    const warnBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const warnBeforeLinkNavigation = (event) => {
      const link = event.target.closest?.("a[href]");
      if (!link || window.confirm(message)) return;

      event.preventDefault();
      event.stopPropagation();
    };

    window.addEventListener("beforeunload", warnBeforeUnload);
    document.addEventListener("click", warnBeforeLinkNavigation, true);

    return () => {
      window.removeEventListener("beforeunload", warnBeforeUnload);
      document.removeEventListener("click", warnBeforeLinkNavigation, true);
    };
  }, [dirty]);

  /* ───────── save ───────── */

  async function save() {
    if (loading || loadError || saving) return;

    setSaving(true);
    setSaveMessage("");

    try {
      const ref = doc(db, "trainingPlans", clientId);
      const savedAt = Timestamp.now();

      await runTransaction(db, async (transaction) => {
        const latestSnap = await transaction.get(ref);
        const latestUpdatedAt =
          latestSnap.data()?.updatedAt?.toMillis?.() ?? null;

        if (latestUpdatedAt !== loadedUpdatedAt) {
          throw new Error("TRAINING_PLAN_CHANGED");
        }

        transaction.set(ref, {
          notes,
          weeks: serializeWeeks(weeks),
          updatedAt: savedAt,
        }, { merge: true });
      });

      setLoadedUpdatedAt(savedAt.toMillis());
      setDirty(false);
      setSaveMessage("Plan treninga je sačuvan.");
    } catch (error) {
      console.error("SAVE TRAINING ERROR", error);
      setSaveMessage(
        error.message === "TRAINING_PLAN_CHANGED"
          ? "Plan je u međuvremenu izmenjen na drugom uređaju. Osvežite stranicu pre novih izmena."
          : "Čuvanje nije uspelo. Izmene su i dalje na ekranu."
      );
    } finally {
      setSaving(false);
    }
  }

  /* ───────── weeks ───────── */

  function addWeek() {
    setWeeks((prev) => {
      const nextIndex = prev.length + 1;
      return [emptyWeek(nextIndex), ...prev];
    });
    markDirty();
  }

  function toggleWeek(i) {
    setWeeks((w) =>
      w.map((x, ix) => (ix === i ? { ...x, open: !x.open } : x))
    );
  }

  function duplicateWeek(i) {
    setWeeks((prev) => {
      const copy = cloneWeek(prev[i], `Nedelja ${prev.length + 1}`);

      return [copy, ...prev.slice(0, i), prev[i], ...prev.slice(i + 1)];
    });
    markDirty();
  }

  function deleteWeek(i) {
    setWeeks((w) => w.filter((_, ix) => ix !== i));
    markDirty();
  }

  /* ───────── trainings ───────── */

  function addTraining(wi) {
    setWeeks((w) =>
      w.map((x, ix) =>
        ix === wi
          ? { ...x, trainings: [{ ...emptyTraining(), open: false }, ...x.trainings] }
          : x
      )
    );
    markDirty();
  }

  function copyTraining(wi, ti) {
    setWeeks((w) =>
      w.map((x, ix) =>
        ix === wi
          ? {
              ...x,
              trainings: [
                cloneTraining(x.trainings[ti]),
                ...x.trainings,
              ],
            }
          : x
      )
    );
    markDirty();
  }

  function deleteTraining(wi, ti) {
    setWeeks((w) =>
      w.map((x, ix) =>
        ix === wi
          ? { ...x, trainings: x.trainings.filter((_, t) => t !== ti) }
          : x
      )
    );
    markDirty();
  }

  function toggleTraining(wi, ti) {
    setWeeks((w) =>
      w.map((x, ix) =>
        ix === wi
          ? {
              ...x,
              trainings: x.trainings.map((t, tx) =>
                tx === ti ? { ...t, open: !t.open } : t
              ),
            }
          : x
      )
    );
  }

  function updateTrainingDate(wi, ti, value) {
    setWeeks((w) =>
      w.map((x, ix) =>
        ix === wi
          ? {
              ...x,
              trainings: x.trainings.map((t, tx) =>
                tx === ti ? { ...t, date: value } : t
              ),
            }
          : x
      )
    );
    markDirty();
  }

  /* ───────── blocks / exercises / sets ───────── */

  function addBlock(wi, ti) {
    setWeeks((w) =>
      w.map((x, ix) =>
        ix === wi
          ? {
              ...x,
              trainings: x.trainings.map((t, tx) =>
                tx === ti
                  ? { ...t, blocks: [...t.blocks, emptyBlock(t.blocks.length)] }
                  : t
              ),
            }
          : x
      )
    );
    markDirty();
  }

  function addExercise(wi, ti, bi) {
    setWeeks((w) =>
      w.map((x, ix) =>
        ix === wi
          ? {
              ...x,
              trainings: x.trainings.map((t, tx) =>
                tx === ti
                  ? {
                      ...t,
                      blocks: t.blocks.map((b, bx) =>
                        bx === bi
                          ? { ...b, exercises: [...b.exercises, emptyExercise()] }
                          : b
                      ),
                    }
                  : t
              ),
            }
          : x
      )
    );
    markDirty();
  }

  function deleteExercise(wi, ti, bi, ei) {
    setWeeks((w) =>
      w.map((x, ix) =>
        ix === wi
          ? {
              ...x,
              trainings: x.trainings.map((t, tx) =>
                tx === ti
                  ? {
                      ...t,
                      blocks: t.blocks.map((b, bx) =>
                        bx === bi
                          ? {
                              ...b,
                              exercises: b.exercises.filter((_, ex) => ex !== ei),
                            }
                          : b
                      ),
                    }
                  : t
              ),
            }
          : x
      )
    );
    markDirty();
  }

  function addSet(wi, ti, bi, ei) {
    setWeeks((w) =>
      w.map((x, ix) =>
        ix === wi
          ? {
              ...x,
              trainings: x.trainings.map((t, tx) =>
                tx === ti
                  ? {
                      ...t,
                      blocks: t.blocks.map((b, bx) =>
                        bx === bi
                          ? {
                              ...b,
                              exercises: b.exercises.map((e, ex) =>
                                ex === ei
                                  ? { ...e, sets: [...e.sets, emptySet()] }
                                  : e
                              ),
                            }
                          : b
                      ),
                    }
                  : t
              ),
            }
          : x
      )
    );
    markDirty();
  }

  function deleteSet(wi, ti, bi, ei, si) {
    setWeeks((w) =>
      w.map((x, ix) =>
        ix === wi
          ? {
              ...x,
              trainings: x.trainings.map((t, tx) =>
                tx === ti
                  ? {
                      ...t,
                      blocks: t.blocks.map((b, bx) =>
                        bx === bi
                          ? {
                              ...b,
                              exercises: b.exercises.map((e, ex) =>
                                ex === ei
                                  ? {
                                      ...e,
                                      sets: e.sets.filter((_, sx) => sx !== si),
                                    }
                                  : e
                              ),
                            }
                          : b
                      ),
                    }
                  : t
              ),
            }
          : x
      )
    );
    markDirty();
  }

  function updateExerciseName(wi, ti, bi, ei, value) {
    setWeeks((w) =>
      w.map((x, ix) =>
        ix === wi
          ? {
              ...x,
              trainings: x.trainings.map((t, tx) =>
                tx === ti
                  ? {
                      ...t,
                      blocks: t.blocks.map((b, bx) =>
                        bx === bi
                          ? {
                              ...b,
                              exercises: b.exercises.map((e, ex) =>
                                ex === ei ? { ...e, name: value } : e
                              ),
                            }
                          : b
                      ),
                    }
                  : t
              ),
            }
          : x
      )
    );
    markDirty();
  }

  function updateSet(wi, ti, bi, ei, si, patch) {
    setWeeks((w) =>
      w.map((x, ix) =>
        ix === wi
          ? {
              ...x,
              trainings: x.trainings.map((t, tx) =>
                tx === ti
                  ? {
                      ...t,
                      blocks: t.blocks.map((b, bx) =>
                        bx === bi
                          ? {
                              ...b,
                              exercises: b.exercises.map((e, ex) =>
                                ex === ei
                                  ? {
                                      ...e,
                                      sets: e.sets.map((s, sx) =>
                                        sx === si ? { ...s, ...patch } : s
                                      ),
                                    }
                                  : e
                              ),
                            }
                          : b
                      ),
                    }
                  : t
              ),
            }
          : x
      )
    );
    markDirty();
  }

  /* ───────── UI ───────── */

  if (!isValidClientId) {
    return (
      <div className="p-4 text-neutral-400">
        Nevažeći ili nepostojeći klijent
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-3 px-4 py-3">
        <div className="h-4 w-2/3 rounded bg-neutral-800" />
        <div className="h-20 rounded bg-neutral-900" />
        <div className="h-16 rounded bg-neutral-900" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="px-4 py-3">
        <div className="rounded-lg border border-red-900 bg-red-950/30 p-3 text-sm text-red-300">
          {loadError}
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-2 space-y-6">
      {/* SAVE BAR */}
      <div className="sticky top-0 z-10 bg-neutral-950/90 border-b border-neutral-800 p-3 flex justify-between">
        <span className="text-sm text-neutral-400">
          {dirty ? "Nesačuvane izmene" : "Sve je sačuvano"}
        </span>
        <button
          onClick={save}
          disabled={!dirty || saving}
          className={`px-4 py-2 rounded-lg text-sm ${
            dirty ? "bg-blue-600 text-white" : "bg-neutral-700 text-neutral-400"
          }`}
        >
          {saving ? "Čuvanje..." : "Sačuvaj"}
        </button>
      </div>

      {saveMessage && (
        <div className="rounded-lg bg-neutral-900 px-3 py-2 text-sm text-neutral-200">
          {saveMessage}
        </div>
      )}

      {/* NOTES */}
      <div className="rounded-xl bg-neutral-900 p-4">
        <p className="mb-2 text-sm text-neutral-300">Beleške</p>
        <textarea
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
            markDirty();
          }}
          rows={3}
          className="w-full rounded-lg bg-neutral-800 p-3 text-sm text-white"
        />
      </div>

      <button
        onClick={addWeek}
        className="w-full rounded-xl bg-neutral-800 py-3 text-sm text-green-400"
      >
        + Nova nedelja
      </button>

      {weeks.map((week, wi) => (
        <div
          key={week.id}
          className="rounded-xl bg-neutral-900 p-4 space-y-4 border border-neutral-800"
        >
          <div className="flex justify-between items-center">
            <button
              onClick={() => toggleWeek(wi)}
              className="text-white font-medium"
            >
              {week.label}
            </button>

            <div className="flex gap-3 text-xs">
              <button
                onClick={() => duplicateWeek(wi)}
                className="text-blue-400"
              >
                Dupliraj
              </button>
              <button
                onClick={() => deleteWeek(wi)}
                className="text-red-400"
              >
                Obriši
              </button>
            </div>
          </div>

          {week.open && (
            <>
              <button
                onClick={() => addTraining(wi)}
                className="text-sm text-green-400"
              >
                + Novi trening
              </button>

              {week.trainings.map((t, ti) => (
                <div
                  key={t.id}
                  className="rounded-xl bg-neutral-900 p-4 space-y-4 border border-neutral-700"
                >
                  <div className="flex justify-between items-center">
                    <button
                      onClick={() => toggleTraining(wi, ti)}
                      className="text-white capitalize"
                    >
                      {formatDay(t.date)}
                    </button>

                    <div className="flex gap-3 text-xs">
                      <button
                        onClick={() => copyTraining(wi, ti)}
                        className="text-blue-400"
                      >
                        Kopiraj
                      </button>
                      <button
                        onClick={() => deleteTraining(wi, ti)}
                        className="text-red-400"
                      >
                        Obriši
                      </button>
                    </div>
                  </div>

                  {t.open && (
                    <>
                      <label className="text-xs text-neutral-400">
                        Datum treninga
                        <input
                          type="date"
                          value={t.date}
                          onChange={(e) =>
                            updateTrainingDate(wi, ti, e.target.value)
                          }
                          className="mt-1 block rounded bg-neutral-800 px-2 py-1 text-sm text-white"
                        />
                      </label>

                      {t.blocks.map((b, bi) => (
                        <div
                          key={b.id}
                          className="rounded bg-neutral-800 p-3 space-y-3 border-l-4 border-blue-500"
                        >
                          <p className="text-sm font-medium text-white">
                            Blok {b.name}
                          </p>

                          {b.exercises.map((e, ei) => (
                            <div
                              key={e.id}
                              className="rounded bg-neutral-900 p-3 space-y-2"
                            >
                              <div className="flex justify-between items-center">
                                <input
                                  value={e.name}
                                  onChange={(ev) =>
                                    updateExerciseName(
                                      wi,
                                      ti,
                                      bi,
                                      ei,
                                      ev.target.value
                                    )
                                  }
                                  placeholder="Vežba"
                                  className="flex-1 rounded bg-neutral-800 px-2 py-1 text-sm text-white"
                                />
                                <button
                                  onClick={() =>
                                    deleteExercise(
                                      wi,
                                      ti,
                                      bi,
                                      ei
                                    )
                                  }
                                  className="ml-2 text-xs text-red-400"
                                >
                                  ✕
                                </button>
                              </div>

                              {e.sets.map((s, si) => (
                                <div
                                  key={s.id}
                                  className="flex gap-2 items-center"
                                >
                                  <input
                                    type="number"
                                    value={s.reps}
                                    onChange={(ev) =>
                                      updateSet(
                                        wi,
                                        ti,
                                        bi,
                                        ei,
                                        si,
                                        {
                                          reps: Number(ev.target.value),
                                        }
                                      )
                                    }
                                    className="w-1/2 rounded bg-neutral-800 px-2 py-1 text-sm text-white"
                                  />
                                  <input
                                    value={s.weight}
                                    onChange={(ev) =>
                                      updateSet(
                                        wi,
                                        ti,
                                        bi,
                                        ei,
                                        si,
                                        {
                                          weight: ev.target.value,
                                        }
                                      )
                                    }
                                    className="w-1/2 rounded bg-neutral-800 px-2 py-1 text-sm text-white"
                                  />
                                  <button
                                    onClick={() =>
                                      deleteSet(
                                        wi,
                                        ti,
                                        bi,
                                        ei,
                                        si
                                      )
                                    }
                                    className="text-xs text-red-400"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ))}

                              <button
                                onClick={() =>
                                  addSet(wi, ti, bi, ei)
                                }
                                className="text-xs text-blue-400"
                              >
                                + Set
                              </button>
                            </div>
                          ))}

                          <button
                            onClick={() =>
                              addExercise(wi, ti, bi)
                            }
                            className="text-sm text-green-400"
                          >
                            + Vežba
                          </button>
                        </div>
                      ))}

                      <button
                        onClick={() => addBlock(wi, ti)}
                        className="text-sm text-blue-400"
                      >
                        + Dodaj blok
                      </button>
                    </>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      ))}
    </div>
  );
}
