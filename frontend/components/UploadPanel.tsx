"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

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

interface UploadPanelProps {
  onSubmit: (file: File) => void;
}

export default function UploadPanel({ onSubmit }: UploadPanelProps) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Object URLs are revoked when the preview changes or the panel unmounts.
  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const selectFile = useCallback((candidate: File) => {
    if (!isAccepted(candidate)) {
      setError("Unsupported file type. Please choose a JPG, PNG, WEBP or PDF.");
      return;
    }
    if (candidate.size > MAX_FILE_BYTES) {
      setError(
        `That file is ${formatSize(candidate.size)}. The limit is 10 MB — try a smaller photo.`
      );
      return;
    }
    if (candidate.size === 0) {
      setError("That file is empty.");
      return;
    }

    setError(null);
    setFile(candidate);
    setPreviewUrl(
      candidate.type === "application/pdf" ? null : URL.createObjectURL(candidate)
    );
  }, []);

  const clearFile = () => {
    setFile(null);
    setPreviewUrl(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const dropped = event.dataTransfer.files?.[0];
    if (dropped) selectFile(dropped);
  };

  const isPdf = file?.type === "application/pdf" || !!file?.name.toLowerCase().endsWith(".pdf");

  return (
    <div className="space-y-4">
      {!file ? (
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              inputRef.current?.click();
            }
          }}
          role="button"
          tabIndex={0}
          aria-label="Choose a bill file to upload"
          className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2 ${
            isDragging
              ? "border-slate-900 bg-slate-100"
              : "border-slate-300 bg-slate-50 hover:border-slate-400 hover:bg-slate-100"
          }`}
        >
          <svg
            className="mb-3 h-10 w-10 text-slate-400"
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
            Drop your bill here, or <span className="underline">browse</span>
          </p>
          <p className="mt-1 text-xs text-slate-500">JPG, PNG, WEBP or PDF — up to 10 MB</p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-start gap-4">
            {previewUrl && !isPdf ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt="Preview of the selected bill"
                className="h-24 w-24 shrink-0 rounded-lg border border-slate-200 object-cover"
              />
            ) : (
              <div className="flex h-24 w-24 shrink-0 flex-col items-center justify-center rounded-lg border border-slate-200 bg-slate-50">
                <svg
                  className="h-8 w-8 text-rose-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25M9 16.5v.75m3-3v3M15 12v5.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                  />
                </svg>
                <span className="mt-1 text-[10px] font-semibold tracking-wide text-slate-500">
                  PDF
                </span>
              </div>
            )}

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-900">{file.name}</p>
              <p className="mt-0.5 text-xs text-slate-500">{formatSize(file.size)}</p>
              <button
                type="button"
                onClick={clearFile}
                className="mt-2 text-xs font-medium text-slate-600 underline underline-offset-2 hover:text-slate-900"
              >
                Choose a different file
              </button>
            </div>
          </div>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(event) => {
          const chosen = event.target.files?.[0];
          if (chosen) selectFile(chosen);
        }}
      />

      {error && (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      <button
        type="button"
        disabled={!file}
        onClick={() => file && onSubmit(file)}
        className="w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
      >
        Extract Details
      </button>
    </div>
  );
}
