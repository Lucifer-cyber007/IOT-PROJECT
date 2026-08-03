"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 25;

const ACCEPTED_MIME = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "application/pdf",
];
const ACCEPTED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".pdf"];

function isAccepted(file: File): boolean {
  if (ACCEPTED_MIME.includes(file.type.toLowerCase())) return true;
  const name = file.name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface QueuedFile {
  id: string;
  file: File;
  previewUrl: string | null;
}

export function makeQueuedFile(file: File): QueuedFile {
  return {
    id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
    file,
    previewUrl: file.type === "application/pdf" ? null : URL.createObjectURL(file),
  };
}

interface UploadPanelProps {
  queue: QueuedFile[];
  onQueueChange: (next: QueuedFile[]) => void;
  onSubmit: () => void;
}

export default function UploadPanel({
  queue,
  onQueueChange,
  onSubmit,
}: UploadPanelProps) {
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback(
    (incoming: FileList | File[]) => {
      const candidates = Array.from(incoming);
      const accepted: QueuedFile[] = [];
      const problems: string[] = [];

      for (const file of candidates) {
        if (!isAccepted(file)) {
          problems.push(`${file.name}: unsupported type`);
          continue;
        }
        if (file.size === 0) {
          problems.push(`${file.name}: file is empty`);
          continue;
        }
        if (file.size > MAX_FILE_BYTES) {
          problems.push(`${file.name}: ${formatSize(file.size)} exceeds the 10 MB limit`);
          continue;
        }
        accepted.push(makeQueuedFile(file));
      }

      const room = MAX_FILES - queue.length;
      if (accepted.length > room) {
        problems.push(`Only ${MAX_FILES} bills can be processed at once.`);
        accepted.splice(Math.max(0, room));
      }

      setError(problems.length ? problems.join(" · ") : null);
      if (accepted.length) onQueueChange([...queue, ...accepted]);
    },
    [queue, onQueueChange]
  );

  const removeAt = (id: string) => {
    const target = queue.find((item) => item.id === id);
    if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
    onQueueChange(queue.filter((item) => item.id !== id));
    setError(null);
  };

  const clearAll = () => {
    queue.forEach((item) => item.previewUrl && URL.revokeObjectURL(item.previewUrl));
    onQueueChange([]);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  // Reset the native input so re-picking the same file still fires onChange.
  useEffect(() => {
    if (queue.length === 0 && inputRef.current) inputRef.current.value = "";
  }, [queue.length]);

  return (
    <div className="space-y-4">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          if (event.dataTransfer.files?.length) addFiles(event.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        role="button"
        tabIndex={0}
        aria-label="Choose bill files to upload"
        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 text-center transition-colors focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2 ${
          queue.length ? "py-7" : "py-12"
        } ${
          isDragging
            ? "border-slate-900 bg-slate-100"
            : "border-slate-300 bg-slate-50 hover:border-slate-400 hover:bg-slate-100"
        }`}
      >
        <svg
          className="mb-3 h-9 w-9 text-slate-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 7.5L12 3m0 0L7.5 7.5M12 3v13.5"
          />
        </svg>
        <p className="text-sm font-medium text-slate-700">
          {queue.length ? "Add more bills" : "Drop your bills here, or "}
          {!queue.length && <span className="underline">browse</span>}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          JPG, PNG, WEBP or PDF · up to 10 MB each · up to {MAX_FILES} at once
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        className="hidden"
        onChange={(event) => {
          if (event.target.files?.length) addFiles(event.target.files);
        }}
      />

      {queue.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
            <p className="text-sm font-semibold text-slate-900">
              {queue.length} bill{queue.length === 1 ? "" : "s"} ready
            </p>
            <button
              type="button"
              onClick={clearAll}
              className="text-xs font-medium text-slate-500 underline underline-offset-2 hover:text-slate-900"
            >
              Clear all
            </button>
          </div>

          <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto">
            {queue.map((item) => (
              <li key={item.id} className="flex items-center gap-3 px-4 py-2.5">
                {item.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.previewUrl}
                    alt=""
                    className="h-10 w-10 shrink-0 rounded border border-slate-200 object-cover"
                  />
                ) : (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-slate-200 bg-slate-50 text-[9px] font-bold text-rose-500">
                    PDF
                  </span>
                )}

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-slate-800">{item.file.name}</p>
                  <p className="text-xs text-slate-500">{formatSize(item.file.size)}</p>
                </div>

                <button
                  type="button"
                  onClick={() => removeAt(item.id)}
                  aria-label={`Remove ${item.file.name}`}
                  className="shrink-0 rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      <button
        type="button"
        disabled={queue.length === 0}
        onClick={onSubmit}
        className="w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
      >
        {queue.length > 1 ? `Extract ${queue.length} Bills` : "Extract Details"}
      </button>
    </div>
  );
}
