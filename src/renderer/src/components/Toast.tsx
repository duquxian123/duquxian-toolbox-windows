import { useEffect } from "react";
import { Icon } from "./Icon";

export interface Notice {
  id: number;
  message: string;
  type: "success" | "error" | "info";
}

export function Toast({
  notice,
  onClose,
}: {
  notice: Notice | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!notice) {
      return;
    }
    const timer = window.setTimeout(onClose, 2800);
    return () => window.clearTimeout(timer);
  }, [notice, onClose]);

  if (!notice) {
    return null;
  }

  return (
    <div className={`toast toast-${notice.type}`} role="status">
      <span className="toast-icon">
        <Icon name={notice.type === "success" ? "check" : "info"} size={15} />
      </span>
      <span>{notice.message}</span>
    </div>
  );
}

