import { formatDayLabel, formatMessageTime } from "../../chat/messageDisplay";

export function PinIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m16 3 5 5-4.5 4.5 1 4.5-1 1-5-5L6 18.5 4.5 17l5.5-5.5-5-5 1-1 4.5 1L16 3Z" />
      <path d="m14 10-4 4" />
    </svg>
  );
}

function UnpinIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m16 3 5 5-4.5 4.5 1 4.5-1 1-5-5L6 18.5 4.5 17l5.5-5.5-5-5 1-1 4.5 1L16 3Z" />
      <path d="m14 10-4 4" />
      <path d="m3 3 18 18" />
    </svg>
  );
}

function getMessagePreview(message) {
  if (message.text?.trim()) return message.text.trim();
  if (message.attachment?.type === "image") return "Slika";
  if (message.attachment?.name) return `Fajl: ${message.attachment.name}`;
  return "Poruka";
}

export function PinnedMessagesButton({ count, open, onToggle }) {
  if (!count) return null;

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label="Pinovane poruke"
      aria-expanded={open}
      className={`relative ml-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition ${
        open
          ? "border-amber-300/45 bg-amber-400/15 text-amber-200"
          : "border-amber-300/25 bg-amber-400/10 text-amber-200 hover:bg-amber-400/15 hover:text-amber-100"
      }`}
    >
      <PinIcon className="h-5 w-5" />
      <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-400 px-1 text-[9px] font-semibold text-neutral-950">
        {count > 9 ? "9+" : count}
      </span>
    </button>
  );
}

export function PinnedMessagesPanel({ messages, onSelect, onUnpin }) {
  if (!messages.length) return null;

  return (
    <div className="border-b border-amber-300/15 bg-neutral-950/95 px-3 py-2 shadow-[0_12px_30px_rgba(0,0,0,0.28)]">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-amber-300">
        <PinIcon className="h-4 w-4" />
        Pinovane poruke
      </div>
      <div className="max-h-40 space-y-2 overflow-y-auto">
        {messages.map((message) => (
          <div
            key={message.id}
            className="flex items-stretch gap-2 rounded-xl border border-amber-300/15 bg-amber-400/10 px-2 py-2 transition hover:bg-amber-400/15"
          >
            <button
              type="button"
              onClick={() => onSelect(message)}
              className="min-w-0 flex-1 px-1 text-left"
            >
              <span className="line-clamp-2 whitespace-pre-wrap text-sm text-neutral-100">
                {getMessagePreview(message)}
              </span>
              <span className="mt-1 block text-[10px] text-neutral-500">
                {formatDayLabel(message.createdAt)} · {formatMessageTime(message.createdAt)}
              </span>
            </button>
            <button
              type="button"
              onClick={() => onUnpin(message)}
              aria-label="Otkači poruku"
              title="Otkači"
              className="flex w-9 shrink-0 items-center justify-center rounded-lg border border-amber-300/20 bg-neutral-950/50 text-amber-200 transition hover:bg-amber-400/15 hover:text-amber-100"
            >
              <UnpinIcon className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
