import React from "react";
import { createRoot } from "react-dom/client";
import { SlotColumn } from "../src/pages/Bookings.jsx";
import DayPicker, { buildDayPickerDays } from "../src/components/ui/DayPicker.jsx";
import { Panel } from "../src/components/ui/Primitives.jsx";
import "../src/index.css";

const today = new Date();
today.setHours(0, 0, 0, 0);
const makeSlots = (hours) => hours.map((time, index) => {
  const timestamp = new Date(today);
  const [hour, minute] = time.split(":");
  timestamp.setHours(Number(hour), Number(minute));
  return { id: `${time}-${index}`, timestamp, locked: false };
});
const morning = makeSlots(["08:00", "08:30", "09:00", "09:30", "10:00", "10:30", "11:00"]);
const afternoon = makeSlots(["15:30", "16:00", "16:30", "17:00", "17:30", "18:00", "18:30", "19:00", "19:30"]);
const reserved = morning[6];
const bookings = [{ id: "demo", slotId: reserved.id, checkedIn: false }];
const availability = Object.fromEntries([...morning, ...afternoon].map((slot) => [slot.id, { available: slot.id === reserved.id ? 3 : 4 }]));
const formatTime = (date) => date.toLocaleTimeString("sr-Latn-RS", { hour: "2-digit", minute: "2-digit" });
const common = {
  bookings, availabilityBySlot: availability, actionPending: false,
  userBookingForDay: bookings[0], hasSlotId: (slot, id) => slot.id === id,
  formatTime, book: () => {}, cancel: () => {}, canBook: () => true,
  scrollTargetSlotId: reserved.id,
};

export function Preview() {
  const days = buildDayPickerDays(today, 6);
  return <div className="flex h-screen flex-col bg-background-dark text-text-primaryDark">
    <header className="h-14 shrink-0 border-b border-white/10" />
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-4 pb-24">
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <Panel className="shrink-0 p-3"><DayPicker days={days} selectedKey={days[0].key} onSelect={() => {}} /></Panel>
        <div className="min-h-0 flex-1">
          <div className="grid h-full min-h-0 grid-cols-2 gap-3">
            <SlotColumn title="Prepodne" slots={morning} {...common} />
            <SlotColumn title="Popodne" slots={afternoon} {...common} />
          </div>
        </div>
      </div>
    </main>
    <nav className="fixed inset-x-0 bottom-0 h-20 border-t border-white/10 bg-neutral-950/95" />
  </div>;
}

createRoot(document.getElementById("root")).render(<Preview />);
