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
  selectedFiles,
  setSelectedFiles,
  sending,
  sendError,
  onSend,
  onFileError,
}) {
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const canSend = text.trim().length > 0 || selectedFiles.length > 0;

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
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;

    const allowedFiles = files.filter((file) => isAllowedChatAttachment(file));
    if (allowedFiles.length !== files.length) {
      onFileError(
        "Možeš poslati sliku ili dokument. Video trenutno nije podržan."
      );
    }

    if (allowedFiles.length) {
      onFileError("");
      setSelectedFiles((currentFiles) => [...currentFiles, ...allowedFiles]);
    }
    window.requestAnimationFrame(() => textareaRef.current?.focus());
  }

  function removeFile(fileIndex) {
    setSelectedFiles((currentFiles) =>
      currentFiles.filter((_, index) => index !== fileIndex)
    );
  }

  return (
    <div className="border-t border-neutral-800 px-1 py-1">
      {selectedFiles.length > 0 && (
        <div className="mb-1 max-h-28 space-y-1 overflow-y-auto rounded-lg bg-neutral-900 px-2 py-2 text-xs text-neutral-200">
          <div className="flex items-center justify-between gap-2 px-1">
            <span className="text-neutral-400">
              {selectedFiles.length === 1 ? "1 fajl" : `${selectedFiles.length} fajlova`}
            </span>
            <button
              type="button"
              onClick={() => setSelectedFiles([])}
              className="shrink-0 text-red-300"
            >
              Ukloni sve
            </button>
          </div>
          {selectedFiles.map((file, index) => (
            <div key={`${file.name}-${file.size}-${index}`} className="flex items-center justify-between gap-2 rounded-md bg-black/20 px-2 py-1.5">
              <span className="min-w-0 truncate">
                {file.name} {formatSize(file.size) && `· ${formatSize(file.size)}`}
              </span>
              <button
                type="button"
                onClick={() => removeFile(index)}
                className="shrink-0 text-red-300"
              >
                Ukloni
              </button>
            </div>
          ))}
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
          multiple
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
