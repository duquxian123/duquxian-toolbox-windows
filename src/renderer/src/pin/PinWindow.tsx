import { useEffect, useState } from "react";
import type { PinInfo } from "@shared/types";
import { Icon } from "../components/Icon";
import { errorMessage } from "../utils";

export function PinWindow({ pinId }: { pinId: string }) {
  const [pin, setPin] = useState<PinInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void window.toolbox
      .getPin(pinId)
      .then(setPin)
      .catch((loadError) => setError(errorMessage(loadError)));
  }, [pinId]);

  const copy = async () => {
    try {
      await window.toolbox.copyPin(pinId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch (copyError) {
      setError(errorMessage(copyError));
    }
  };

  if (error) {
    return (
      <div className="pin-error">
        <strong>贴图加载失败</strong>
        <span>{error}</span>
        <button onClick={() => void window.toolbox.closePin(pinId)}>关闭</button>
      </div>
    );
  }

  if (!pin) {
    return <div className="pin-loading" />;
  }

  return (
    <div className="pin-window">
      <div className="pin-toolbar">
        <span>贴图</span>
        <div>
          <button title="复制贴图" onClick={() => void copy()}>
            <Icon name={copied ? "check" : "copy"} size={15} />
          </button>
          <button title="关闭" onClick={() => void window.toolbox.closePin(pinId)}>
            <Icon name="close" size={15} />
          </button>
        </div>
      </div>
      <div className="pin-image-wrap" onDoubleClick={() => void copy()}>
        <img src={pin.imageUrl} alt="贴图" draggable={false} />
      </div>
      {copied && <div className="pin-copied">已复制</div>}
    </div>
  );
}

