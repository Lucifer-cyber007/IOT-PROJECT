"use client";

import dynamic from "next/dynamic";
import { useCallback, useRef, useState } from "react";
import UploadPanel, { makeQueuedFile, type QueuedFile } from "@/components/UploadPanel";
import ResultsView from "@/components/ResultsView";
import { extractBills } from "@/lib/api";
import type { BillEntry } from "@/lib/types";

// react-webcam touches getUserMedia, so keep it out of the server render.
const CameraPanel = dynamic(() => import("@/components/CameraPanel"), {
  ssr: false,
  loading: () => (
    <div className="flex h-64 items-center justify-center rounded-xl border border-slate-200 bg-slate-50">
      <p className="text-sm text-slate-500">Loading camera…</p>
    </div>
  ),
});

type Stage = "input" | "processing" | "results" | "error";
type InputTab = "upload" | "camera";

export default function Home() {
  const [stage, setStage] = useState<Stage>("input");
  const [tab, setTab] = useState<InputTab>("upload");
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [entries, setEntries] = useState<BillEntry[]>([]);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const lastFilesRef = useRef<File[]>([]);

  const runExtraction = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    lastFilesRef.current = files;
    setStage("processing");
    setErrorMessage("");

    try {
      setEntries(await extractBills(files));
      setStage("results");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Something went wrong. Please try again."
      );
      setStage("error");
    }
  }, []);

  const submitQueue = () => {
    void runExtraction(queue.map((item) => item.file));
  };

  const releasePreviews = () => {
    queue.forEach((item) => item.previewUrl && URL.revokeObjectURL(item.previewUrl));
  };

  const startOver = () => {
    releasePreviews();
    setQueue([]);
    setEntries([]);
    lastFilesRef.current = [];
    setErrorMessage("");
    setStage("input");
  };

  const retry = () => {
    if (lastFilesRef.current.length) {
      void runExtraction(lastFilesRef.current);
    } else {
      startOver();
    }
  };

  const queueCount = queue.length;

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="mb-8 text-center">
        <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900">
          <svg
            className="h-6 w-6 text-amber-400"
            fill="currentColor"
            viewBox="0 0 20 20"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Electricity Bill Extractor
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
          Upload or photograph your bills — one or many — and export them all to a single
          spreadsheet.
        </p>
      </header>

      {stage === "input" && (
        <section className="animate-fade-in-up rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div
            role="tablist"
            aria-label="Bill input method"
            className="mb-5 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1"
          >
            {(
              [
                { id: "upload", label: "Upload Files" },
                { id: "camera", label: "Use Camera" },
              ] as const
            ).map((option) => (
              <button
                key={option.id}
                role="tab"
                type="button"
                aria-selected={tab === option.id}
                onClick={() => setTab(option.id)}
                className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                  tab === option.id
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          {tab === "upload" ? (
            <UploadPanel queue={queue} onQueueChange={setQueue} onSubmit={submitQueue} />
          ) : (
            <CameraPanel
              queueCount={queueCount}
              onCapture={(file) => setQueue((previous) => [...previous, makeQueuedFile(file)])}
              onSubmit={submitQueue}
              onSwitchToUpload={() => setTab("upload")}
            />
          )}
        </section>
      )}

      {stage === "processing" && (
        <section className="animate-fade-in-up flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white px-6 py-16 shadow-sm">
          <svg
            className="h-10 w-10 animate-spin text-slate-900"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle
              className="opacity-20"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-90"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          <p className="mt-4 text-sm font-medium text-slate-900">
            {lastFilesRef.current.length > 1
              ? `Reading ${lastFilesRef.current.length} bills…`
              : "Reading your bill…"}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Scanning the text and pulling out the billing details.
          </p>
        </section>
      )}

      {stage === "error" && (
        <section className="animate-fade-in-up rounded-2xl border border-rose-200 bg-white p-6 shadow-sm">
          <div className="text-center">
            <svg
              className="mx-auto h-10 w-10 text-rose-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
              />
            </svg>
            <h2 className="mt-3 text-lg font-semibold text-slate-900">
              We couldn&apos;t read that
            </h2>
            <p role="alert" className="mx-auto mt-2 max-w-md text-sm text-slate-600">
              {errorMessage}
            </p>
          </div>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={retry}
              className="rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
            >
              Try Again
            </button>
            <button
              type="button"
              onClick={startOver}
              className="rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            >
              Start Over
            </button>
          </div>
        </section>
      )}

      {stage === "results" && entries.length > 0 && (
        <div className="animate-fade-in-up">
          <ResultsView entries={entries} onStartOver={startOver} />
        </div>
      )}
    </main>
  );
}
