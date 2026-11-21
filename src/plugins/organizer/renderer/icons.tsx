import type { SVGProps } from "react";

const paths: Record<string, React.ReactNode> = {
  "folder-media": (
    <>
      <path d="M3 6h7l2 2h9v11H3V6Z" />
      <path d="m10.5 12 4 2.5-4 2.5v-5Z" />
    </>
  ),
  "folder-in": (
    <>
      <path d="M3 6h7l2 2h9v11H3V6Z" />
      <path d="M9 13h6M12 10l3 3-3 3" />
    </>
  ),
  "folder-out": (
    <>
      <path d="M3 6h7l2 2h9v11H3V6Z" />
      <path d="M15 13H9M12 10l-3 3 3 3" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
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
      {paths[name] ?? paths.check}
    </svg>
  );
}
