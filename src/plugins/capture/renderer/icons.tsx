import type { SVGProps } from "react";

const paths: Record<string, React.ReactNode> = {
  camera: (
    <>
      <path d="M4 7h3l1.5-2h7L17 7h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z" />
      <circle cx="12" cy="13" r="4" />
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
  pin: <path d="m9 3 6 6M14 4l6 6-4 2-4 4-1 5-3-3-3 3 3-3-3-3 5-1 4-4 2-4Z" />,
  close: <path d="m5 5 14 14M19 5 5 19" />,
  copy: (
    <>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </>
  ),
  folder: <path d="M3 6h7l2 2h9v11H3V6Z" />,
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
  trash: (
    <>
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />
    </>
  ),
  select: <path d="m5 3 14 10-7 1-3 7L5 3Z" />,
  chevron: <path d="m9 5 7 7-7 7" />,
  check: <path d="m5 12 4 4L19 6" />,
  spark: <path d="m12 3 1.8 4.7L18 10l-4.2 2.3L12 17l-1.8-4.7L6 10l4.2-2.3L12 3ZM19 16l.7 1.8 1.8.7-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7L19 16Z" />,
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
