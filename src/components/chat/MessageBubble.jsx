import { useState } from "react";
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
          className="max-h-64 rounded-lg object-cover"
        />
      </a>
    );
  }

  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noreferrer"
      className="mt-2 flex items-center gap-2 rounded-lg bg-black/15 px-3 py-2"
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

export default function MessageBubble({
  message,
  mine,
  currentUserId,
  onReact,
}) {
  const [reactionMenuOpen, setReactionMenuOpen] = useState(false);
  const reactionCounts = getMessageReactionCounts(message.reactions);
  const myReaction = currentUserId ? message.reactions?.[currentUserId] : "";

  async function chooseReaction(emoji) {
    setReactionMenuOpen(false);
    await onReact(message, emoji);
  }

  return (
    <div>
      <div
        className={`relative max-w-[82%] px-4 py-2 text-sm leading-relaxed ${
          mine
            ? "ml-auto rounded-2xl rounded-br-sm bg-blue-600 text-white"
            : "mr-auto rounded-2xl rounded-bl-sm bg-neutral-800 text-neutral-100"
        }`}
      >
        <MessageText text={message.text} />
        <AttachmentPreview attachment={message.attachment} />

        <div className={`mt-1 flex items-end gap-2 ${mine ? "justify-end" : "justify-between"}`}>
          {!mine && (
            <div className="relative -mb-0.5 -ml-1">
              {reactionMenuOpen && (
                <div className="absolute bottom-7 left-0 z-10 flex gap-1 rounded-full border border-neutral-700 bg-neutral-950 px-2 py-1 shadow-xl">
                  {REACTION_OPTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => chooseReaction(emoji)}
                      className={`rounded-full px-1.5 py-0.5 text-base transition ${
                        myReaction === emoji
                          ? "bg-blue-600/60"
                          : "hover:bg-neutral-700"
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={() => setReactionMenuOpen((open) => !open)}
                aria-label="Reakcija"
                aria-expanded={reactionMenuOpen}
                className={`flex h-6 min-w-6 items-center justify-center rounded-full px-1 transition ${
                  myReaction
                    ? "bg-neutral-700/60 text-neutral-100"
                    : "bg-transparent text-neutral-400 hover:bg-neutral-700/60 hover:text-neutral-100"
                }`}
              >
                <SmileIcon className="h-4 w-4" />
              </button>
            </div>
          )}

          <p className="text-right text-[10px] opacity-60">
            {formatMessageTime(message.createdAt)}
            {mine && ` · ${getMessageStatus(message)}`}
          </p>
        </div>
      </div>

      {reactionCounts.length > 0 && (
        <div className={`mt-1 flex gap-1 ${mine ? "justify-end pr-2" : "justify-start pl-2"}`}>
          {reactionCounts.map(({ emoji, count }) => (
            <span
              key={emoji}
              className="rounded-full bg-neutral-900 px-2 py-0.5 text-xs text-neutral-100 shadow"
            >
              {emoji}{count > 1 ? ` ${count}` : ""}
            </span>
          ))}
        </div>
      )}

    </div>
  );
}
