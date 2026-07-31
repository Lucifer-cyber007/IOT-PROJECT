"use client";

import { useRef, useState } from "react";
import { MAX_FILE_BYTES } from "@/lib/api";

const ACCEPTED_MIME = ["image/jpeg", "image/jpg", "image/png", "image/webp", "application/pdf"];
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

interface UploadDropzoneProps {
  multiple?: boolean;
  maxFiles?: number;
  onFiles: (files: File[]) => void;
}

/** Drag-and-drop + click-to-browse file picker, adapted from the old
 * single-purpose frontend's UploadPanel.tsx - upload/drag-drop only, no live
 * camera capture (this is the desktop companion to the platform; the phone
 * already owns "point a camera at a meter" via the native mobile app). */
export default function UploadDropzone({
  multiple = false,
  maxFiles,
  onFiles,
}: UploadDropzoneProps) {
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (incoming: FileList | File[]) => {
    const candidates = Array.from(incoming);
    const accepted: File[] = [];
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
      accepted.push(file);
    }

    let final = accepted;
    if (maxFiles && accepted.length > maxFiles) {
      problems.push(`Only ${maxFiles} files can be processed at once.`);
      final = accepted.slice(0, maxFiles);
    }

    setError(problems.length ? problems.join(" · ") : null);
    if (final.length) onFiles(final);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="space-y-3">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          if (event.dataTransfer.files?.length) handleFiles(event.dataTransfer.files);
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
        aria-label="Choose files to upload"
        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2 ${
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
          Drop {multiple ? "files" : "a file"} here, or <span className="underline">browse</span>
        </p>
        <p className="mt-1 text-xs text-slate-500">
          JPG, PNG, WEBP or PDF &middot; up to 10 MB{multiple && maxFiles ? ` each · up to ${maxFiles} at once` : ""}
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        multiple={multiple}
        className="hidden"
        onChange={(event) => {
          if (event.target.files?.length) handleFiles(event.target.files);
        }}
      />

      {error && (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}
    </div>
  );
}
