import type { ReactNode } from "react";

function Icon({ size = 18, width = 2, children }: { size?: number; width?: number; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const BracesIcon = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <path d="M8 4H6a2 2 0 0 0-2 2v4l-2 2 2 2v4a2 2 0 0 0 2 2h2" />
    <path d="M16 4h2a2 2 0 0 1 2 2v4l2 2-2 2v4a2 2 0 0 1-2 2h-2" />
  </Icon>
);

export const LockIcon = () => (
  <Icon size={16}>
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </Icon>
);

export const UploadIcon = ({ size = 18 }: { size?: number }) => (
  <Icon size={size}>
    <path d="M12 16V4" />
    <path d="M7 9l5-5 5 5" />
    <path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
  </Icon>
);

export const FileIcon = ({ size = 18 }: { size?: number }) => (
  <Icon size={size}>
    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
    <path d="M14 3v6h6" />
  </Icon>
);

export const ClipboardIcon = () => (
  <Icon>
    <rect x="8" y="3" width="8" height="4" rx="1" />
    <path d="M16 5h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2" />
  </Icon>
);

export const ChevronRight = ({ size = 18, width = 2 }: { size?: number; width?: number }) => (
  <Icon size={size} width={width}>
    <path d="M9 6l6 6-6 6" />
  </Icon>
);

export const ChevronUp = () => (
  <Icon size={16}>
    <path d="M6 15l6-6 6 6" />
  </Icon>
);

export const ChevronDown = () => (
  <Icon size={16}>
    <path d="M6 9l6 6 6-6" />
  </Icon>
);

export const SearchIcon = ({ size = 16 }: { size?: number }) => (
  <Icon size={size}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-4-4" />
  </Icon>
);

export const IncludeIcon = () => (
  <Icon>
    <path d="M4 7h10" />
    <path d="M10 12h10" />
    <path d="M14 17h6" />
    <path d="M4 7v10h6" />
  </Icon>
);

export const CheckIcon = () => (
  <Icon size={14} width={2.5}>
    <path d="M5 12l5 5 9-10" />
  </Icon>
);

export const AlertIcon = () => (
  <Icon size={14} width={2.2}>
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
    <path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
  </Icon>
);
