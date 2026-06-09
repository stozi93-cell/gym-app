import { useEffect, useRef } from "react";
import { isAllowedChatAttachment } from "../../chat/messageTracking";

function AttachIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21.44 11.05 12.25 20.24a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.82-2.83l8.48-8.48" />
    </svg>
  );
}

function SendIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M6 12L3 21l18-9L3 3l3 9z" />
      <path d="M6 12h12" />
    </svg>
  );
}

function formatSize(size) {
  if (!size) return "";
  if (size < 1024 * 1024) return `${Math.ceil(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ChatComposer({
  text,
  setText,
  selectedFile,
  setSelectedFile,
  sending,
  sendError,
  onSend,
  onFileError,
}) {
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const canSend = text.trim().length > 0 || !!selectedFile;

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 128)}px`;
  }, [text]);

  async function sendAndFocus() {
    await onSend();
    window.requestAnimationFrame(() => textareaRef.current?.focus());
  }

  function chooseFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!isAllowedChatAttachment(file)) {
      onFileError(
        "Možeš poslati sliku ili dokument. Video trenutno nije podržan."
      );
      return;
    }

    setSelectedFile(file);
    window.requestAnimationFrame(() => textareaRef.current?.focus());
  }

  return (
    <div className="border-t border-neutral-800 px-1 py-1">
      {selectedFile && (
        <div className="mb-1 flex items-center justify-between gap-2 rounded-lg bg-neutral-900 px-3 py-2 text-xs text-neutral-200">
          <span className="min-w-0 truncate">
            {selectedFile.name} {formatSize(selectedFile.size) && `· ${formatSize(selectedFile.size)}`}
          </span>
          <button
            type="button"
            onClick={() => setSelectedFile(null)}
            className="shrink-0 text-red-300"
          >
            Ukloni
          </button>
        </div>
      )}

      <div className="flex items-end gap-1">
        <button
          type="button"
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => fileInputRef.current?.click()}
          aria-label="Dodaj fajl"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-neutral-300 transition hover:text-white"
        >
          <AttachIcon className="h-5 w-5" />
        </button>

        <textarea
          ref={textareaRef}
          value={text}
          rows={1}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              sendAndFocus();
            }
          }}
          placeholder="Napiši poruku..."
          className="max-h-32 min-h-10 flex-1 resize-none overflow-y-auto bg-transparent py-2 text-sm text-white outline-none placeholder:text-neutral-400"
        />

        <button
          type="button"
          disabled={sending || !canSend}
          onPointerDown={(event) => event.preventDefault()}
          onClick={sendAndFocus}
          aria-label="Pošalji poruku"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black transition disabled:opacity-50"
        >
          <SendIcon className={`h-5 w-5 ${canSend ? "text-blue-400" : "text-neutral-400"}`} />
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain,text/csv"
          onChange={chooseFile}
          className="hidden"
        />
      </div>

      {sendError && (
        <p className="px-2 pb-1 text-xs text-red-300">{sendError}</p>
      )}
    </div>
  );
}
