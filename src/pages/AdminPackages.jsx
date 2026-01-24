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
} from "firebase/firestore";
import { db } from "../firebase";
import { useSearchParams } from "react-router-dom";

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

  useEffect(() => {
    loadPackages();
    loadClients();
  }, []);

  useEffect(() => {
    if (clientIdFromParam) setUserId(clientIdFromParam);
  }, [clientIdFromParam]);

  useEffect(() => {
    if (userId) loadCurrentSubs(userId);
    else setCurrentSubs([]);
  }, [userId]);

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

  /* ─────────────────────────────
     ACTIONS
  ───────────────────────────── */
  async function assignSubscription() {
    if (!userId || !packageId) return alert("Sva polja su obavezna");

    const pkg = packages.find((p) => p.id === packageId);
    if (!pkg) return;

    const start = startDate ? new Date(startDate) : new Date();
    const end = new Date(start);
    end.setDate(end.getDate() + pkg.durationDays);

    const weeklyCheckIns = Number(
  checkInOption || pkg.defaultCheckIns || 6
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

    for (const d of existing.docs) {
      await updateDoc(doc(db, "clientSubscriptions", d.id), {
        active: false,
      });
    }

    await addDoc(collection(db, "clientSubscriptions"), {
      userId,
      subscriptionId: packageId,
      startDate: start,
      endDate: end,
      active: true,
      weeklyCheckIns,
      checkInsArray,
    });

    const auth = getAuth();
    await addDoc(collection(db, "billing"), {
      clientId: userId,
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
    <div className="px-2 py-1 space-y-6">
      <h1 className="px-2 text-xl font-semibold text-white">
        Paketi
      </h1>

      {/* ASSIGN */}
      <div className="mx-2 rounded-xl bg-neutral-900 p-4 space-y-3">
        <p className="font-medium text-white">Dodela pretplate</p>

        <select
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          className="w-full rounded bg-neutral-800 px-3 py-2 text-sm"
        >
          <option value="">Klijent</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} {u.surname}
            </option>
          ))}
        </select>

        {currentSubs.length > 0 && (
          <p className="text-xs text-neutral-400">
            Aktivna: {currentSubs[0].name} do{" "}
            {formatDate(currentSubs[0].endDate)}
          </p>
        )}

        <select
          value={packageId}
          onChange={(e) => setPackageId(e.target.value)}
          className="w-full rounded bg-neutral-800 px-3 py-2 text-sm"
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
          className="w-full rounded bg-neutral-800 px-3 py-2 text-sm"
        >
          {checkInOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="w-full rounded bg-neutral-800 px-3 py-2 text-sm"
        />

        <button
          onClick={assignSubscription}
          className="rounded bg-blue-600 py-2 text-sm text-white"
        >
          Dodeli pretplatu
        </button>
      </div>

      {/* CREATE PACKAGE */}
      <div className="mx-2 rounded-xl bg-neutral-900 p-4 space-y-3">
        <p className="font-medium text-white">Novi paket</p>

        <input
          placeholder="Naziv"
          value={newPackage.name}
          onChange={(e) =>
            setNewPackage({ ...newPackage, name: e.target.value })
          }
          className="w-full rounded bg-neutral-800 px-3 py-2 text-sm"
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
          className="w-full rounded bg-neutral-800 px-3 py-2 text-sm"
        />
        <input
          type="number"
          placeholder="Cena"
          value={newPackage.price}
          onChange={(e) =>
            setNewPackage({ ...newPackage, price: e.target.value })
          }
          className="w-full rounded bg-neutral-800 px-3 py-2 text-sm"
        />

        <select
          value={newPackage.defaultCheckIns}
          onChange={(e) =>
            setNewPackage({
              ...newPackage,
              defaultCheckIns: e.target.value,
            })
          }
          className="w-full rounded bg-neutral-800 px-3 py-2 text-sm"
        >
          {checkInOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <button
          onClick={createPackage}
          className="rounded bg-green-600 py-2 text-sm text-white"
        >
          Kreiraj paket
        </button>
      </div>

      {/* PACKAGE LIST */}
      {/* PACKAGE LIST */}
<div className="space-y-3">
  {packages.map((p, i) => (
    <div
      key={p.id}
      className="mx-2 rounded-xl bg-neutral-900 p-4 space-y-3"
    >
      {/* NAME */}
      <input
        value={p.name}
        onChange={(e) =>
          updatePackage(p.id, "name", e.target.value)
        }
        className="w-full rounded bg-neutral-800 px-2 py-2 text-sm"
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
          className="w-full sm:flex-1 rounded bg-neutral-800 px-2 py-2 text-sm"
          placeholder="Trajanje (dani)"
        />

        <input
          type="number"
          value={p.price}
          onChange={(e) =>
            updatePackage(p.id, "price", e.target.value)
          }
          className="w-full sm:flex-1 rounded bg-neutral-800 px-2 py-2 text-sm"
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
        className="w-full rounded bg-neutral-800 px-2 py-2 text-sm"
      >
        {checkInOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      {/* STATUS + ACTIONS */}
      <div className="flex items-center justify-between pt-2">
        <span
          className={`text-sm font-medium ${
            p.active ? "text-green-500" : "text-red-400"
          }`}
        >
          {p.active ? "Aktivan" : "Neaktivan"}
        </span>

        <div className="flex items-center gap-2">
          <button
            onClick={() => toggleActive(p)}
            className="rounded-md bg-neutral-800 px-3 py-1.5 text-sm text-blue-400 hover:bg-neutral-700 transition"
          >
            {p.active ? "Deaktiviraj" : "Aktiviraj"}
          </button>

          <button
            disabled={i === 0}
            onClick={() => movePackage(p.id, "up")}
            className="rounded-md bg-neutral-800 px-2 py-1.5 text-lg disabled:opacity-40 hover:bg-neutral-700 transition"
          >
            ⬆
          </button>

          <button
            disabled={i === packages.length - 1}
            onClick={() => movePackage(p.id, "down")}
            className="rounded-md bg-neutral-800 px-2 py-1.5 text-lg disabled:opacity-40 hover:bg-neutral-700 transition"
          >
            ⬇
          </button>
        </div>
      </div>
    </div>
  ))}
</div>
    </div>
  );
}
