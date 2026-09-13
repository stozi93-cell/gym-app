import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { Panel } from "../components/ui/Primitives";

const RULES = [
  {
    title: "Poštuj rezervisani termin",
    text: "Dođi u vreme koje si rezervisao i otkaži termin čim znaš da nećeš stići.",
  },
  {
    title: "Vrati opremu na mesto",
    text: "Tegove, rekvizite i klupe ostavi spremne za sledeću osobu.",
  },
  {
    title: "Čuvaj prostor",
    text: "Koristi peškir i obriši opremu nakon treninga kada je potrebno.",
  },
  {
    title: "Treniraj bezbedno",
    text: "Za nepoznatu vežbu, bol ili nelagodnost obrati se treneru pre nastavka.",
  },
  {
    title: "Poštuj druge članove",
    text: "Ne zauzimaj opremu duže nego što je potrebno i omogući drugima nesmetan trening.",
  },
];

const INSTRUCTIONS = [
  {
    title: "Rezervacija termina",
    text: "Otvori Termini, izaberi dan i dodirni Rezerviši kod željenog vremena.",
  },
  {
    title: "Profil i članarina",
    text: "Dodirni svoju fotografiju gore desno i otvori Profil za dolaske, članarine i lične podatke.",
  },
  {
    title: "Poruke treneru",
    text: "U Porukama izaberi trenera, napiši poruku ili pošalji fotografiju i dokument.",
  },
  {
    title: "Praćenje napretka",
    text: "U Profilu otvori Napredak kada želiš da upišeš san, ishranu ili telesne mere.",
  },
  {
    title: "Obaveštenja",
    text: "U Podešavanjima možeš uključiti ili isključiti svaku vrstu obaveštenja.",
  },
];

export default function ClientInfo({ type }) {
  const [packages, setPackages] = useState([]);

  useEffect(() => {
    if (type !== "pricing") return undefined;

    return onSnapshot(
      collection(db, "subscriptions"),
      (snapshot) => {
        setPackages(
          snapshot.docs
            .map((item) => ({ id: item.id, ...item.data() }))
            .filter((item) => item.active !== false)
            .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
        );
      },
      (error) => {
        console.error("Pricing load failed", error);
        setPackages([]);
      }
    );
  }, [type]);

  if (type === "rules") {
    return <InfoList title="Pravila teretane" intro="Radna verzija osnovnih pravila." items={RULES} />;
  }

  if (type === "instructions") {
    return <InfoList title="Uputstvo za aplikaciju" intro="Kratak pregled najvažnijih funkcija." items={INSTRUCTIONS} numbered />;
  }

  return (
    <div className="mx-auto max-w-md space-y-3">
      <div className="px-1">
        <h1 className="text-lg font-semibold text-white">Cenovnik</h1>
        <p className="mt-1 text-xs text-neutral-500">Aktivni paketi članarine.</p>
      </div>

      {packages.length ? (
        <div className="space-y-2">
          {packages.map((item) => (
            <Panel key={item.id} className="flex items-center justify-between gap-4 p-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{item.name}</p>
                <p className="mt-1 text-xs text-neutral-500">
                  {formatPackageDetails(item)}
                </p>
              </div>
              <p className="shrink-0 text-base font-semibold text-brand-blue-200">
                {formatPrice(item.price)}
              </p>
            </Panel>
          ))}
        </div>
      ) : (
        <Panel className="px-4 py-6 text-center text-sm text-neutral-400">
          Cenovnik trenutno nije dostupan.
        </Panel>
      )}

      <p className="px-1 text-[11px] leading-relaxed text-neutral-600">
        Za izbor ili promenu paketa obrati se treneru.
      </p>
    </div>
  );
}

function InfoList({ title, intro, items, numbered = false }) {
  return (
    <div className="mx-auto max-w-md space-y-3">
      <div className="px-1">
        <h1 className="text-lg font-semibold text-white">{title}</h1>
        <p className="mt-1 text-xs text-neutral-500">{intro}</p>
      </div>

      <Panel className="divide-y divide-white/[0.07] px-4">
        {items.map((item, index) => (
          <div key={item.title} className="flex gap-3 py-3.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-blue-500/10 text-[11px] font-semibold text-brand-blue-300">
              {numbered ? index + 1 : "✓"}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-white">{item.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-neutral-400">{item.text}</p>
            </div>
          </div>
        ))}
      </Panel>
    </div>
  );
}

function formatPackageDetails(item) {
  const duration = Number(item.durationDays);
  const visits = item.defaultCheckIns;
  const durationLabel = duration ? `${duration} dana` : "Trajanje po dogovoru";
  const visitsLabel =
    visits === "unlimited"
      ? "neograničeni dolasci"
      : Number(visits)
        ? `${visits} dolazaka nedeljno`
        : "broj dolazaka po dogovoru";
  return `${durationLabel} · ${visitsLabel}`;
}

function formatPrice(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "Po dogovoru";
  return `${amount.toLocaleString("sr-Latn-RS")} RSD`;
}
