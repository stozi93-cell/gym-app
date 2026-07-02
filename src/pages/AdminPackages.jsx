import { getAuth } from "firebase/auth";
import { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  query,
  where,
  getDoc,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase";
import { useSearchParams } from "react-router-dom";
import { Panel, StatusPill } from "../components/ui/Primitives";

export default function AdminPackages() {
  const [packages, setPackages] = useState([]);
  const [users, setUsers] = useState([]);
  const [currentSubs, setCurrentSubs] = useState([]);

  const [userId, setUserId] = useState("");
  const [packageId, setPackageId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [checkInOption, setCheckInOption] = useState("default");

  const [newPackage, setNewPackage] = useState({
    name: "",
    durationDays: "",
    price: "",
    defaultCheckIns: "6",
  });

  const [searchParams] = useSearchParams();
  const clientIdFromParam = searchParams.get("clientId");

  const checkInOptions = [
    { value: "default", label: "Podrazumevano" },
    { value: "1", label: "1× nedeljno" },
    { value: "2", label: "2× nedeljno" },
    { value: "3", label: "3× nedeljno" },
    { value: "4", label: "4× nedeljno" },
    { value: "5", label: "5× nedeljno" },
    { value: "6", label: "6x nedeljno" },
  ];

  /* ─────────────────────────────
     LOADERS
  ───────────────────────────── */
  async function loadPackages() {
    const snap = await getDocs(collection(db, "subscriptions"));
    let data = snap.docs.map((d, i) => ({
      id: d.id,
      ...d.data(),
      order: d.data().order ?? i,
    }));
    data.sort((a, b) => a.order - b.order);
    setPackages(data);
  }

  async function loadClients() {
    const snap = await getDocs(
      query(
        collection(db, "users"),
        where("role", "==", "client"),
        where("active", "==", true)
      )
    );
    setUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }

  async function loadCurrentSubs(uid) {
    const snap = await getDocs(
      query(
        collection(db, "clientSubscriptions"),
        where("userId", "==", uid),
        where("active", "==", true)
      )
    );

    const subs = [];
    for (const d of snap.docs) {
      const sub = d.data();
      const pkgSnap = await getDoc(
        doc(db, "subscriptions", sub.subscriptionId)
      );
      if (!pkgSnap.exists()) continue;

      subs.push({
        ...pkgSnap.data(),
        startDate: sub.startDate?.toDate(),
        endDate: sub.endDate?.toDate(),
      });
    }

    subs.sort((a, b) => b.endDate - a.endDate);
    setCurrentSubs(subs.length ? [subs[0]] : []);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadPackages();
      loadClients();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!clientIdFromParam) return;
    const timer = window.setTimeout(() => setUserId(clientIdFromParam), 0);
    return () => window.clearTimeout(timer);
  }, [clientIdFromParam]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (userId) loadCurrentSubs(userId);
      else setCurrentSubs([]);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [userId]);

  /* ─────────────────────────────
     ACTIONS
  ───────────────────────────── */
  async function assignSubscription() {
    if (!userId || !packageId) return alert("Sva polja su obavezna");

    const pkg = packages.find((p) => p.id === packageId);
    if (!pkg) return;

    const start = startDate ? new Date(`${startDate}T00:00:00`) : new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + pkg.durationDays);

    const weeklyCheckIns = Number(
      checkInOption === "default"
        ? pkg.defaultCheckIns || 6
        : checkInOption
    );

    const weeks = Math.ceil(
      (end - start) / (7 * 24 * 60 * 60 * 1000)
    );

    const checkInsArray = Array.from({ length: weeks }, () => 0);

    const existing = await getDocs(
      query(
        collection(db, "clientSubscriptions"),
        where("userId", "==", userId),
        where("active", "==", true)
      )
    );

    const newSubscriptionRef = doc(collection(db, "clientSubscriptions"));
    const billingRef = doc(collection(db, "billing"));
    const batch = writeBatch(db);

    for (const d of existing.docs) {
      batch.update(doc(db, "clientSubscriptions", d.id), {
        active: false,
      });
    }

    batch.set(newSubscriptionRef, {
      userId,
      subscriptionId: packageId,
      startDate: start,
      endDate: end,
      active: true,
      weeklyCheckIns,
      checkInsArray,
      createdAt: serverTimestamp(),
    });

    const auth = getAuth();
    batch.set(billingRef, {
      clientId: userId,
      clientSubscriptionId: newSubscriptionRef.id,
      clientName: `${users.find((u) => u.id === userId)?.name || ""} ${
        users.find((u) => u.id === userId)?.surname || ""
      }`,
      subscriptionId: packageId,
      subscriptionName: pkg.name,
      amount: Number(pkg.price),
      currency: "RSD",
      status: "pending",
      createdAt: new Date(),
      createdBy: auth.currentUser?.uid || null,
      note: "",
    });

    await batch.commit();

    alert("Pretplata dodeljena");
    setUserId("");
    setPackageId("");
    setStartDate("");
    setCheckInOption("default");
    setCurrentSubs([]);
  }

  async function createPackage() {
    if (!newPackage.name || !newPackage.durationDays || !newPackage.price)
      return alert("Popunite sva polja");

    await addDoc(collection(db, "subscriptions"), {
  name: newPackage.name,
  durationDays: Number(newPackage.durationDays),
  price: Number(newPackage.price),
  defaultCheckIns: Number(newPackage.defaultCheckIns) || 6,
  active: true,
  order: packages.length,
});

    setNewPackage({
      name: "",
      durationDays: "",
      price: "",
      defaultCheckIns: "default",
    });
    loadPackages();
  }

  async function updatePackage(id, field, value) {
    await updateDoc(doc(db, "subscriptions", id), {
      [field]:
        field === "name" || field === "defaultCheckIns"
          ? value
          : Number(value),
    });
    loadPackages();
  }

  async function toggleActive(pkg) {
    await updateDoc(doc(db, "subscriptions", pkg.id), {
      active: !pkg.active,
    });
    loadPackages();
  }

  async function movePackage(id, dir) {
    const i = packages.findIndex((p) => p.id === id);
    const j = dir === "up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= packages.length) return;

    await updateDoc(doc(db, "subscriptions", packages[i].id), {
      order: packages[j].order,
    });
    await updateDoc(doc(db, "subscriptions", packages[j].id), {
      order: packages[i].order,
    });

    loadPackages();
  }

  const formatDate = (d) =>
    d?.toLocaleDateString("sr-Latn-RS", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });

  return (
    <div className="space-y-4">
      

      {/* ASSIGN */}
      <Panel className="space-y-3 p-4">
        <p className="font-medium text-white">Dodela članarine</p>

        <select
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          className="w-full rounded-xl border border-white/10 bg-neutral-950/60 px-3 py-2.5 text-sm text-white outline-none focus:border-brand-blue-500"
        >
          <option value="">Klijent</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} {u.surname}
            </option>
          ))}
        </select>

        {currentSubs.length > 0 && (
          <p className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-neutral-300">
            Aktivna: {currentSubs[0].name} do{" "}
            {formatDate(currentSubs[0].endDate)}
          </p>
        )}

        <select
          value={packageId}
          onChange={(e) => setPackageId(e.target.value)}
          className="w-full rounded-xl border border-white/10 bg-neutral-950/60 px-3 py-2.5 text-sm text-white outline-none focus:border-brand-blue-500"
        >
          <option value="">Paket</option>
          {packages.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.durationDays} dana)
            </option>
          ))}
        </select>

        <select
          value={checkInOption}
          onChange={(e) => setCheckInOption(e.target.value)}
          className="w-full rounded-xl border border-white/10 bg-neutral-950/60 px-3 py-2.5 text-sm text-white outline-none focus:border-brand-blue-500"
        >
          {checkInOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <label className="text-xs text-neutral-400">
          Početak članarine
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="mt-1 w-full rounded-xl border border-white/10 bg-neutral-950/60 px-3 py-2.5 text-sm text-white outline-none focus:border-brand-blue-500"
          />
        </label>

        <button
          onClick={assignSubscription}
          className="rounded-xl bg-brand-blue-500 px-3 py-2.5 text-sm font-semibold text-white shadow-glow transition hover:bg-brand-blue-600"
        >
          Dodeli članarinu
        </button>
      </Panel>

      {/* CREATE PACKAGE */}
      <details className="group overflow-hidden rounded-2xl border border-white/10 bg-neutral-900/80 shadow-premium backdrop-blur-xl">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 font-medium text-white [&::-webkit-details-marker]:hidden">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-sm text-neutral-300 transition-transform group-open:rotate-90">
            &gt;
          </span>
          <span>Kreiranje novog paketa</span>
        </summary>

        <div className="space-y-3 border-t border-white/10 p-4">

        <input
          placeholder="Naziv"
          value={newPackage.name}
          onChange={(e) =>
            setNewPackage({ ...newPackage, name: e.target.value })
          }
          className="w-full rounded-xl border border-white/10 bg-neutral-950/60 px-3 py-2.5 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-brand-blue-500"
        />
        <input
          type="number"
          placeholder="Trajanje (dani)"
          value={newPackage.durationDays}
          onChange={(e) =>
            setNewPackage({
              ...newPackage,
              durationDays: e.target.value,
            })
          }
          className="w-full rounded-xl border border-white/10 bg-neutral-950/60 px-3 py-2.5 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-brand-blue-500"
        />
        <input
          type="number"
          placeholder="Cena"
          value={newPackage.price}
          onChange={(e) =>
            setNewPackage({ ...newPackage, price: e.target.value })
          }
          className="w-full rounded-xl border border-white/10 bg-neutral-950/60 px-3 py-2.5 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-brand-blue-500"
        />

        <select
          value={newPackage.defaultCheckIns}
          onChange={(e) =>
            setNewPackage({
              ...newPackage,
              defaultCheckIns: e.target.value,
            })
          }
          className="w-full rounded-xl border border-white/10 bg-neutral-950/60 px-3 py-2.5 text-sm text-white outline-none focus:border-brand-blue-500"
        >
          {checkInOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <button
          onClick={createPackage}
          className="rounded-xl border border-brand-green-500/25 bg-brand-green-500/10 px-3 py-2.5 text-sm font-semibold text-brand-green-300 transition hover:bg-brand-green-500/15"
        >
          Kreiraj paket
        </button>
        </div>
      </details>

      {/* PACKAGE LIST */}
      <details className="group overflow-hidden rounded-2xl border border-white/10 bg-neutral-900/80 shadow-premium backdrop-blur-xl">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 font-medium text-white [&::-webkit-details-marker]:hidden">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-sm text-neutral-300 transition-transform group-open:rotate-90">
            &gt;
          </span>
          <span>Spisak paketa</span>
          <StatusPill tone="neutral" className="ml-auto">{packages.length}</StatusPill>
        </summary>

        <div className="space-y-3 border-t border-white/10 p-4">
  {packages.map((p, i) => (
    <Panel
      key={p.id}
      className="space-y-3 p-4"
    >
      {/* NAME */}
      <input
        value={p.name}
        onChange={(e) =>
          updatePackage(p.id, "name", e.target.value)
        }
        className="w-full rounded-xl border border-white/10 bg-neutral-950/60 px-3 py-2.5 text-sm text-white outline-none focus:border-brand-blue-500"
      />

      {/* DURATION + PRICE */}
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="number"
          value={p.durationDays}
          onChange={(e) =>
            updatePackage(
              p.id,
              "durationDays",
              e.target.value
            )
          }
          className="w-full rounded-xl border border-white/10 bg-neutral-950/60 px-3 py-2.5 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-brand-blue-500 sm:flex-1"
          placeholder="Trajanje (dani)"
        />

        <input
          type="number"
          value={p.price}
          onChange={(e) =>
            updatePackage(p.id, "price", e.target.value)
          }
          className="w-full rounded-xl border border-white/10 bg-neutral-950/60 px-3 py-2.5 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-brand-blue-500 sm:flex-1"
          placeholder="Cena"
        />
      </div>

      {/* CHECK-INS */}
      <select
        value={p.defaultCheckIns || "default"}
        onChange={(e) =>
          updatePackage(
            p.id,
            "defaultCheckIns",
            e.target.value
          )
        }
        className="w-full rounded-xl border border-white/10 bg-neutral-950/60 px-3 py-2.5 text-sm text-white outline-none focus:border-brand-blue-500"
      >
        {checkInOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      {/* STATUS + ACTIONS */}
      <div className="flex items-center justify-between pt-2">
        <StatusPill tone={p.active ? "green" : "red"}>
          {p.active ? "Aktivan" : "Neaktivan"}
        </StatusPill>

        <div className="flex items-center gap-2">
          <button
            onClick={() => toggleActive(p)}
            className="rounded-xl border border-brand-blue-500/25 bg-brand-blue-500/10 px-3 py-2 text-xs font-medium text-brand-blue-300 transition hover:bg-brand-blue-500/15"
          >
            {p.active ? "Deaktiviraj" : "Aktiviraj"}
          </button>

          <button
            disabled={i === 0}
            onClick={() => movePackage(p.id, "up")}
            className="rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5 text-lg text-neutral-200 transition hover:bg-white/10 disabled:opacity-40"
          >
            ⬆
          </button>

          <button
            disabled={i === packages.length - 1}
            onClick={() => movePackage(p.id, "down")}
            className="rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5 text-lg text-neutral-200 transition hover:bg-white/10 disabled:opacity-40"
          >
            ⬇
          </button>
        </div>
      </div>
    </Panel>
  ))}
        </div>
      </details>
    </div>
  );
}
