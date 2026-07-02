import { useEffect, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { EmptyState, Panel, StatusPill } from "../components/ui/Primitives";
import { useAuth } from "../context/AuthContext";
import { db } from "../firebase";

export default function MySubscriptions() {
  const { user } = useAuth();
  const [subs, setSubs] = useState([]);

  useEffect(() => {
    if (user) load();
  }, [user]);

  async function load() {
    const snap = await getDocs(
      query(
        collection(db, "clientSubscriptions"),
        where("userId", "==", user.uid)
      )
    );

    const data = [];

    for (const d of snap.docs) {
      const cs = d.data();
      const pkgSnap = await getDoc(doc(db, "subscriptions", cs.subscriptionId));
      const startDate = cs.startDate?.toDate
        ? cs.startDate.toDate()
        : new Date(cs.startDate);
      const endDate = cs.endDate?.toDate
        ? cs.endDate.toDate()
        : new Date(cs.endDate);

      data.push({
        id: d.id,
        ...pkgSnap.data(),
        startDate,
        endDate,
      });
    }

    setSubs(data);
  }

  const today = new Date();

  const formatDate = (date) =>
    date instanceof Date
      ? date.toLocaleDateString("sr-Latn-RS", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        })
      : date?.toDate
        ? date.toDate().toLocaleDateString("sr-Latn-RS", {
            day: "2-digit",
            month: "long",
            year: "numeric",
          })
        : "-";

  if (!subs.length) {
    return (
      <EmptyState
        title="Nemaš nijednu pretplatu"
        description="Kada trener dodeli članarinu, prikazaće se ovde."
      />
    );
  }

  return (
    <div className="space-y-3">
      {subs.map((subscription) => {
        const active = subscription.endDate >= today;

        return (
          <Panel key={subscription.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate font-semibold text-white">
                  {subscription.name}
                </h3>
                <p className="mt-1 text-xs text-neutral-400">
                  {formatDate(subscription.startDate)} -{" "}
                  {formatDate(subscription.endDate)}
                </p>
              </div>
              <StatusPill tone={active ? "green" : "red"}>
                {active ? "Aktivna" : "Istekla"}
              </StatusPill>
            </div>

            <p className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-neutral-300">
              Cena:{" "}
              <span className="font-medium text-white">
                {subscription.price ?? "-"} RSD
              </span>
            </p>
          </Panel>
        );
      })}
    </div>
  );
}
