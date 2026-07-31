import type { Machine } from "@/lib/types";
import Button from "@/components/ui/Button";

/** Shown when a scan can't be resolved to exactly one machine (status
 * "ambiguous" or "no_match"). Picking a candidate re-submits the same file
 * with an explicit machine_id to resolve it - adapted from mobile's
 * ScanBillFlow resolve stage; used identically by both the single-scan page
 * and each unresolved item in batch-scan review. */
interface CandidatePickerProps {
  candidates: Machine[];
  noMatch: boolean;
  onPick: (machineId: number) => void;
  onStartOver: () => void;
}

export default function CandidatePicker({
  candidates,
  noMatch,
  onPick,
  onStartOver,
}: CandidatePickerProps) {
  if (candidates.length === 0) {
    return (
      <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
        No registered machine matched this document, and there are no candidates to choose
        from. Add the machine first, then try scanning again.
        <div className="mt-3">
          <Button variant="secondary" onClick={onStartOver}>
            Start Over
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        {noMatch
          ? "This document didn't match any registered machine automatically. Pick the one it belongs to:"
          : "This document matched more than one machine. Pick the correct one:"}
      </p>
      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
        {candidates.map((machine) => (
          <li key={machine.id}>
            <button
              type="button"
              onClick={() => onPick(machine.id)}
              className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-slate-50"
            >
              <span>
                <span className="block text-sm font-medium text-slate-900">{machine.name}</span>
                <span className="block text-xs text-slate-500">
                  {machine.template.name} &middot; {machine.identifier_value}
                </span>
              </span>
              <svg
                className="h-4 w-4 text-slate-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </li>
        ))}
      </ul>
      <Button variant="secondary" onClick={onStartOver}>
        Start Over
      </Button>
    </div>
  );
}
