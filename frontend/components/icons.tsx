/** Minimal stroke icon set - hand-rolled to avoid adding an icon-library dependency. */

type IconProps = { className?: string };

const base = "h-5 w-5";

export function HomeIcon({ className = base }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 11.5 12 4l9 7.5M5.5 10v9a1 1 0 0 0 1 1H10v-5.5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1V20h3.5a1 1 0 0 0 1-1v-9" />
    </svg>
  );
}

export function GridIcon({ className = base }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </svg>
  );
}

export function ClockIcon({ className = base }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <circle cx="12" cy="12" r="8.5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 7.5V12l3 2" />
    </svg>
  );
}

export function UserIcon({ className = base }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <circle cx="12" cy="8" r="3.5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 20c1.2-3.8 4.2-6 7.5-6s6.3 2.2 7.5 6" />
    </svg>
  );
}

export function LogOutIcon({ className = base }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 17.5 20 12l-5-5.5M20 12H9M9 20H5.5A1.5 1.5 0 0 1 4 18.5v-13A1.5 1.5 0 0 1 5.5 4H9" />
    </svg>
  );
}

export function BuildingIcon({ className = base }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <rect x="4.5" y="3.5" width="10" height="17" rx="1" />
      <path strokeLinecap="round" d="M14.5 9.5H19a1 1 0 0 1 1 1V20a.5.5 0 0 1-.5.5H14.5M8 7.5h.01M11.5 7.5h.01M8 11h.01M11.5 11h.01M8 14.5h.01M11.5 14.5h.01" />
    </svg>
  );
}

export function FileIcon({ className = base }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 3.5h7l4 4V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 3.5V8h4M9 13h6M9 16.5h6" />
    </svg>
  );
}

export function PlusIcon({ className = base }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function ChevronRightIcon({ className = base }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m9 5 7 7-7 7" />
    </svg>
  );
}

export function UploadCloudIcon({ className = base }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 18a4 4 0 0 1-1-7.87A5.5 5.5 0 0 1 16.9 8.1 4.5 4.5 0 0 1 16.5 17H16" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 20v-7m0 0-2.5 2.5M12 13l2.5 2.5" />
    </svg>
  );
}

export function CheckCircleIcon({ className = base }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <circle cx="12" cy="12" r="8.5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="m8.5 12.5 2.3 2.3L15.5 9.5" />
    </svg>
  );
}

export function AlertTriangleIcon({ className = base }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.6 4.3a1.6 1.6 0 0 1 2.8 0l8 14.2a1.6 1.6 0 0 1-1.4 2.4H4a1.6 1.6 0 0 1-1.4-2.4l8-14.2Z" />
      <path strokeLinecap="round" d="M12 9.5v4M12 17h.01" />
    </svg>
  );
}

export function XCircleIcon({ className = base }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <circle cx="12" cy="12" r="8.5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="m9.5 9.5 5 5m0-5-5 5" />
    </svg>
  );
}

export function ScanIcon({ className = base }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V6a2 2 0 0 1 2-2h2M20 8V6a2 2 0 0 0-2-2h-2M4 16v2a2 2 0 0 0 2 2h2M20 16v2a2 2 0 0 1-2 2h-2M4 12h16" />
    </svg>
  );
}

export function EditIcon({ className = base }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m16.5 4.5 3 3L8 19H5v-3L16.5 4.5Z" />
    </svg>
  );
}

export function BarChartIcon({ className = base }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 20.5V13M9.5 20.5V7M14.5 20.5v-9M19.5 20.5V4" />
    </svg>
  );
}

export function UsersIcon({ className = base }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <circle cx="9" cy="8.5" r="3" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.5 20c1-3.4 3.4-5.5 5.5-5.5s4.5 2.1 5.5 5.5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.5 6a2.75 2.75 0 0 1 0 5.4M18 20c-.7-2.5-2-4.2-3.5-5" />
    </svg>
  );
}

export function InboxIcon({ className = base }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.5 13.5h4.5l1.5 2.5h5l1.5-2.5h4.5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M5.5 6.5h13l1.8 7v5a1 1 0 0 1-1 1H4.7a1 1 0 0 1-1-1v-5l1.8-7Z" />
    </svg>
  );
}

export function SparkIcon({ className = base }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3M6 6l2 2M16 16l2 2M6 18l2-2M16 8l2-2" />
    </svg>
  );
}
