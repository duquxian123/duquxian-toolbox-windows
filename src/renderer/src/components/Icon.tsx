import type { SVGProps } from "react";

const paths: Record<string, React.ReactNode> = {
  camera: (
    <>
      <path d="M4 7h3l1.5-2h7L17 7h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z" />
      <circle cx="12" cy="13" r="4" />
    </>
  ),
  battery: (
    <>
      <rect x="3" y="6" width="17" height="12" rx="3" />
      <path d="M20 10v4M7 10v4M11 10v4" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  mouse: (
    <>
      <rect x="7" y="2.5" width="10" height="19" rx="5" />
      <path d="M12 3v6" />
    </>
  ),
  headset: (
    <>
      <path d="M4 13v-1a8 8 0 0 1 16 0v1" />
      <path d="M4 13h3v7H5a1 1 0 0 1-1-1v-6ZM20 13h-3v7h2a1 1 0 0 0 1-1v-6Z" />
    </>
  ),
  controller: (
    <>
      <path d="M7 8h10a5 5 0 0 1 4.6 6.9l-1.2 3a2.2 2.2 0 0 1-3.7.6L14 16h-4l-2.7 2.5a2.2 2.2 0 0 1-3.7-.6l-1.2-3A5 5 0 0 1 7 8Z" />
      <path d="M8 11v4M6 13h4M16 12h.01M18 14h.01" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
    </>
  ),
  monitor: (
    <>
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </>
  ),
  repeat: (
    <>
      <path d="m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15" />
      <path d="m7 22-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3" />
    </>
  ),
  clipboard: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4V2h6v2M9 9h6M9 13h6M9 17h4" />
    </>
  ),
  save: (
    <>
      <path d="M5 3h12l3 3v15H4V3h1Z" />
      <path d="M8 3v6h8V3M8 21v-7h8v7" />
    </>
  ),
  pin: (
    <>
      <path d="m9 3 6 6M14 4l6 6-4 2-4 4-1 5-3-3-3 3 3-3-3-3 5-1 4-4 2-4Z" />
    </>
  ),
  close: <path d="m5 5 14 14M19 5 5 19" />,
  copy: (
    <>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </>
  ),
  folder: (
    <path d="M3 6h7l2 2h9v11H3V6Z" />
  ),
  trash: (
    <path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6" />
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </>
  ),
  undo: <path d="m9 7-5 5 5 5M5 12h8a6 6 0 0 1 6 6" />,
  redo: <path d="m15 7 5 5-5 5M19 12h-8a6 6 0 0 0-6 6" />,
  rectangle: <rect x="4" y="5" width="16" height="14" rx="1" />,
  ellipse: <ellipse cx="12" cy="12" rx="8" ry="6" />,
  arrow: <path d="M4 20 20 4M12 4h8v8" />,
  pen: <path d="m4 20 4-1 11-11-3-3L5 16l-1 4ZM14 7l3 3" />,
  text: <path d="M5 6V4h14v2M12 4v16M8 20h8" />,
  mosaic: (
    <>
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
    </>
  ),
  select: <path d="m5 3 14 10-7 1-3 7L5 3Z" />,
  shield: <path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.1 7.5 9.5 4.3-1.4 7.5-4.9 7.5-9.5V6L12 3Z" />,
  spark: <path d="m12 3 1.8 4.7L18 10l-4.2 2.3L12 17l-1.8-4.7L6 10l4.2-2.3L12 3ZM19 16l.7 1.8 1.8.7-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7L19 16Z" />,
  chevron: <path d="m9 5 7 7-7 7" />,
  keyboard: (
    <>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M18 14h.01M9 14h6" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
};

export function Icon({
  name,
  size = 18,
  ...props
}: SVGProps<SVGSVGElement> & { name: string; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name] ?? paths.spark}
    </svg>
  );
}

