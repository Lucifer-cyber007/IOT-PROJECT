"use client";

import { useCallback, useRef, useState } from "react";
import Webcam from "react-webcam";

const VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  facingMode: { ideal: "environment" },
  width: { ideal: 1920 },
  height: { ideal: 1080 },
};

/** Convert a canvas data URL into a File we can post as multipart/form-data. */
function dataUrlToFile(dataUrl: string, filename: string): File {
  const [header, base64] = dataUrl.split(",");
  const mime = header.match(/:(.*?);/)?.[1] ?? "image/jpeg";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new File([bytes], filename, { type: mime });
}

function describeCameraError(error: string | DOMException): string {
  if (typeof error === "string") return error;

  switch (error.name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return "Camera access was blocked. Allow camera permission for this site in your browser settings, then try again.";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "No camera was found on this device.";
    case "NotReadableError":
      return "The camera is already in use by another app. Close it and try again.";
    case "OverconstrainedError":
      return "No camera matched the requested settings.";
    default:
      return error.message || "The camera could not be started.";
  }
}

interface CameraPanelProps {
  /** Number of bills already queued, from either tab. */
  queueCount: number;
  onCapture: (file: File) => void;
  onSubmit: () => void;
  onSwitchToUpload: () => void;
}

export default function CameraPanel({
  queueCount,
  onCapture,
  onSubmit,
  onSwitchToUpload,
}: CameraPanelProps) {
  const webcamRef = useRef<Webcam>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  const capture = useCallback(() => {
    const screenshot = webcamRef.current?.getScreenshot();
    if (!screenshot) {
      setCameraError("Could not capture a frame. Give the camera a moment and try again.");
      return;
    }
    setCapturedImage(screenshot);
  }, []);

  const keepPhoto = () => {
    if (!capturedImage) return;
    onCapture(dataUrlToFile(capturedImage, `bill-capture-${queueCount + 1}.jpg`));
    setCapturedImage(null);
  };

  if (cameraError) {
    return (
      <div className="space-y-4">
        <div
          role="alert"
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-5 text-center"
        >
          <svg
            className="mx-auto h-8 w-8 text-amber-500"
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
          <p className="mt-2 text-sm font-medium text-amber-900">Camera unavailable</p>
          <p className="mt-1 text-sm text-amber-800">{cameraError}</p>
          {typeof window !== "undefined" && !window.isSecureContext && (
            <p className="mt-2 text-xs text-amber-700">
              Browsers only allow camera access over HTTPS or on localhost.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => {
              setCameraError(null);
              setIsReady(false);
            }}
            className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
          >
            Try camera again
          </button>
          <button
            type="button"
            onClick={onSwitchToUpload}
            className="w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
          >
            Upload files instead
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-900">
        {capturedImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={capturedImage} alt="Captured bill" className="block w-full" />
        ) : (
          <>
            <Webcam
              ref={webcamRef}
              audio={false}
              screenshotFormat="image/jpeg"
              screenshotQuality={0.92}
              videoConstraints={VIDEO_CONSTRAINTS}
              onUserMedia={() => setIsReady(true)}
              onUserMediaError={(error) => setCameraError(describeCameraError(error))}
              className="block w-full"
            />
            {!isReady && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
                <p className="text-sm text-slate-300">Starting camera…</p>
              </div>
            )}
            {isReady && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-4 rounded-lg border-2 border-dashed border-white/40"
              />
            )}
            {queueCount > 0 && (
              <span className="absolute right-3 top-3 rounded-full bg-slate-900/80 px-3 py-1 text-xs font-semibold text-white">
                {queueCount} captured
              </span>
            )}
          </>
        )}
      </div>

      {capturedImage ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => setCapturedImage(null)}
            className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
          >
            Retake
          </button>
          <button
            type="button"
            onClick={keepPhoto}
            className="w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
          >
            Use This Photo
          </button>
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={capture}
            disabled={!isReady}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z"
              />
            </svg>
            {queueCount > 0 ? "Capture Another Bill" : "Capture Photo"}
          </button>

          <button
            type="button"
            disabled={queueCount === 0}
            onClick={onSubmit}
            className="w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
          >
            {queueCount > 1 ? `Extract ${queueCount} Bills` : "Extract Details"}
          </button>

          <p className="text-center text-xs text-slate-500">
            Photograph each bill in turn — they all get extracted together.
          </p>
        </>
      )}
    </div>
  );
}
