// 24×24 stroke icons from the design (folio-lib.js). Always drawn next to text, so aria-hidden.
export const ICONS = {
  phone: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z",
  mail: "M3 6h18v12H3z M3 7l9 6 9-6",
  globe: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z M3 12h18 M12 3c3.5 3.5 3.5 14.5 0 18 M12 3c-3.5 3.5-3.5 14.5 0 18",
  pin: "M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z M12 7.5a2 2 0 1 0 0 4a2 2 0 1 0 0-4z",
  cal: "M4 6h16v14H4z M4 10h16 M8 3v4 M16 3v4",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  linkedin: "M4 4h16v16H4z M8 10.5V16 M8 7.5v.5 M11.5 16v-5.5 M11.5 13a2.5 2.5 0 0 1 5 0v3",
  github:
    "M9 19c-4.3 1.4-4.3-2.5-6-3 M15 21v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21",
  npm: "M3 8h18v8h-9v2H8v-2H3z M7 10.5v4 M11 10.5v5 M15 10.5v4",
  x: "M4 4l16 16 M20 4L4 20",
} as const;

export function Icon({ d, size = 12, width = 2.2 }: { d: string; size?: number; width?: number }) {
  return (
    <svg
      className="icon"
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
      <path d={d} />
    </svg>
  );
}
