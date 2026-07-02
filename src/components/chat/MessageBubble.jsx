import { useEffect, useRef, useState } from "react";
import {
  getMessageReactionCounts,
  REACTION_OPTIONS,
} from "../../chat/messageTracking";
import {
  formatMessageTime,
  getMessageStatus,
  linkifyText,
} from "../../chat/messageDisplay";

function FileIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}

function SmileIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2" />
      <path d="M9 9h.01" />
      <path d="M15 9h.01" />
    </svg>
  );
}

function DotsIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <circle cx="12" cy="5" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="12" cy="19" r="1.8" />
    </svg>
  );
}

function formatSize(size) {
  if (!size) return "";
  if (size < 1024 * 1024) return `${Math.ceil(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function MessageText({ text }) {
  const parts = linkifyText(text || "");
  if (!parts.length) return null;

  return (
    <p className="whitespace-pre-wrap break-words">
      {parts.map((part, index) =>
        part.href ? (
          <a
            key={`${part.text}-${index}`}
            href={part.href}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2"
          >
            {part.text}
          </a>
        ) : (
          <span key={`${part.text}-${index}`}>{part.text}</span>
        )
      )}
    </p>
  );
}

function AttachmentPreview({ attachment }) {
  if (!attachment?.url) return null;

  if (attachment.type === "image") {
    return (
      <a href={attachment.url} target="_blank" rel="noreferrer" className="mt-2 block">
        <img
          src={attachment.url}
          alt={attachment.name || "Slika"}
          className="max-h-64 rounded-xl border border-white/10 object-cover"
        />
      </a>
    );
  }

  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noreferrer"
      className="mt-2 flex items-center gap-2 rounded-xl border border-white/10 bg-black/15 px-3 py-2"
    >
      <FileIcon className="h-5 w-5 shrink-0" />
      <span className="min-w-0">
        <span className="block truncate text-sm">{attachment.name || "Fajl"}</span>
        {formatSize(attachment.size) && (
          <span className="block text-[10px] opacity-70">{formatSize(attachment.size)}</span>
        )}
      </span>
    </a>
  );
}

function ReplyPreview({ replyTo, mine }) {
  if (!replyTo) return null;

  return (
    <div
      className={`mb-2 rounded-xl border-l-2 px-3 py-2 text-xs ${
        mine
          ? "border-white/60 bg-white/10 text-white/80"
          : "border-brand-blue-500/60 bg-white/5 text-neutral-300"
      }`}
    >
      <p className="font-medium">{replyTo.senderName || "Poruka"}</p>
      <p className="mt-0.5 line-clamp-2 whitespace-pre-wrap opacity-80">
        {replyTo.text || replyTo.attachmentName || "Fajl"}
      </p>
    </div>
  );
}

export default function MessageBubble({
  message,
  mine,
  currentUserId,
  onReact,
  onReply,
  onCopy,
  onPin,
  onEdit,
}) {
  const menuRootRef = useRef(null);
  const [reactionMenuOpen, setReactionMenuOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.text || "");
  const [savingEdit, setSavingEdit] = useState(false);
  const reactionCounts = getMessageReactionCounts(message.reactions);
  const canEdit = mine && !!message.text?.trim();

  useEffect(() => {
    if (!reactionMenuOpen && !actionsOpen) return undefined;

    function closeOnOutsideClick(event) {
      if (!menuRootRef.current?.contains(event.target)) {
        setReactionMenuOpen(false);
        setActionsOpen(false);
      }
    }

    function closeOnEscape(event) {
      if (event.key === "Escape") {
        setReactionMenuOpen(false);
        setActionsOpen(false);
      }
    }

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [reactionMenuOpen, actionsOpen]);

  async function chooseReaction(emoji) {
    setReactionMenuOpen(false);
    await onReact(message, emoji);
  }

  function runAction(action) {
    setActionsOpen(false);
    action();
  }

  async function saveEdit() {
    if (!draft.trim() || draft.trimEnd() === (message.text || "").trimEnd()) {
      setEditing(false);
      return;
    }

    setSavingEdit(true);
    await onEdit(message, draft);
    setSavingEdit(false);
    setEditing(false);
  }

  const controls = (
    <div
      className={`absolute bottom-1 z-10 flex items-center gap-1 ${
        mine ? "right-full mr-1.5 flex-row-reverse" : "left-full ml-1.5"
      }`}
    >
      <div className="relative">
        <button
          type="button"
          onClick={() => {
            setReactionMenuOpen((open) => !open);
            setActionsOpen(false);
          }}
          aria-label="Reakcija"
          aria-expanded={reactionMenuOpen}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-neutral-950/80 text-neutral-400 shadow-lg transition hover:bg-white/10 hover:text-neutral-100"
        >
          <SmileIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="relative">
        <button
          type="button"
          onClick={() => {
            setActionsOpen((open) => !open);
            setReactionMenuOpen(false);
          }}
          aria-label="Opcije poruke"
          aria-expanded={actionsOpen}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-neutral-950/80 text-neutral-400 shadow-lg transition hover:bg-white/10 hover:text-neutral-100"
        >
          <DotsIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );

  return (
    <div
      ref={menuRootRef}
      className={`flex ${mine ? "justify-end pl-16" : "justify-start pr-16"}`}
    >
      <div
        className={`relative w-fit max-w-full border px-4 py-2 text-sm leading-relaxed shadow-[0_10px_24px_rgba(0,0,0,0.18)] transition-[min-width] duration-150 ${
          reactionMenuOpen ? "min-w-[188px]" : actionsOpen ? "min-w-[154px]" : ""
        } ${
          mine
            ? "rounded-2xl rounded-br-sm border-brand-blue-500/30 bg-brand-blue-500 text-white"
            : "rounded-2xl rounded-bl-sm border-white/10 bg-neutral-900 text-neutral-100"
        }`}
      >
        {controls}

        {reactionMenuOpen && (
          <div
            className={`absolute bottom-1 z-30 flex gap-1 rounded-full border border-white/10 bg-neutral-950/95 px-2 py-1 shadow-xl ${
              mine ? "left-2 animate-reaction-slide-right" : "right-2 animate-reaction-slide-left"
            }`}
          >
            {REACTION_OPTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => chooseReaction(emoji)}
                className="rounded-full px-1.5 py-0.5 text-base transition hover:bg-white/10"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        {actionsOpen && (
          <div
            className={`absolute bottom-1 z-30 w-36 overflow-hidden rounded-xl border border-white/10 bg-neutral-950/95 py-1 text-xs text-neutral-200 shadow-xl ${
              mine ? "left-2 animate-reaction-slide-right" : "right-2 animate-reaction-slide-left"
            }`}
          >
            <ActionButton onClick={() => runAction(() => onReply(message))}>
              Odgovori
            </ActionButton>
            <ActionButton onClick={() => runAction(() => onCopy(message))}>
              Kopiraj
            </ActionButton>
            <ActionButton onClick={() => runAction(() => onPin(message))}>
              {message.pinned ? "Otkači" : "Pinuj"}
            </ActionButton>
            {canEdit && (
              <ActionButton
                onClick={() =>
                  runAction(() => {
                    setDraft(message.text || "");
                    setEditing(true);
                  })
                }
              >
                Izmeni
              </ActionButton>
            )}
          </div>
        )}

        {message.pinned && (
          <p className={`mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${mine ? "text-amber-100" : "text-amber-300"}`}>
            Pinovano
          </p>
        )}

        <ReplyPreview replyTo={message.replyTo} mine={mine} />

        {editing ? (
          <div className="min-w-[210px] space-y-2">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={Math.min(4, Math.max(2, draft.split("\n").length))}
              className={`w-full resize-none rounded-xl border px-3 py-2 text-sm outline-none ${
                mine
                  ? "border-white/20 bg-white/10 text-white placeholder:text-white/50"
                  : "border-white/10 bg-neutral-950 text-white"
              }`}
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setDraft(message.text || "");
                  setEditing(false);
                }}
                className="rounded-lg border border-white/10 px-2.5 py-1 text-xs"
              >
                Otkaži
              </button>
              <button
                type="button"
                onClick={saveEdit}
                disabled={savingEdit}
                className="rounded-lg bg-white/15 px-2.5 py-1 text-xs font-medium disabled:opacity-50"
              >
                Sačuvaj
              </button>
            </div>
          </div>
        ) : (
          <>
            <MessageText text={message.text} />
            <AttachmentPreview attachment={message.attachment} />
          </>
        )}

        <p className="mt-1 text-right text-[10px] opacity-60">
          {formatMessageTime(message.createdAt)}
          {message.editedAt && " · izmenjeno"}
          {mine && ` · ${getMessageStatus(message)}`}
        </p>

        {reactionCounts.length > 0 && (
          <div className="absolute -bottom-3 left-2 flex gap-0.5">
            {reactionCounts.map(({ emoji, count }) => (
              <span
                key={emoji}
                className="rounded-full border border-white/10 bg-neutral-950 px-1.5 py-0.5 text-[11px] text-neutral-100 shadow"
              >
                {emoji}{count > 1 ? ` ${count}` : ""}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ActionButton({ children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full px-3 py-2 text-left transition hover:bg-white/10"
    >
      {children}
    </button>
  );
}
