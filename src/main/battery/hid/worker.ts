import { listLogicalDevices } from "./catalog";
import { driverById, readBattery } from "./drivers";
import { capture } from "./inspector";

const parentPort = (process as unknown as {
  parentPort: {
    on(event: "message", listener: (event: { data: unknown }) => void): void;
    postMessage(message: unknown): void;
  };
}).parentPort;

async function handle(command: string, args: unknown[]): Promise<unknown> {
  if (command === "enumerate") return listLogicalDevices();
  if (command === "readBattery") {
    return readBattery(args[0] as string, args[1] as never, args[2] as never);
  }
  if (command === "identify") {
    const driver = driverById(args[0] as string);
    if (!driver.identify) throw new Error("driver cannot identify");
    return driver.identify(args[1] as never);
  }
  if (command === "capture") return capture(args[0] as never);
  throw new Error(`unknown hid command: ${command}`);
}

parentPort.on("message", ({ data }) => {
  const message = data as { id: number; cmd: string; args?: unknown[] };
  void handle(message.cmd, message.args ?? [])
    .then((result) => parentPort.postMessage({ id: message.id, ok: true, result }))
    .catch((error: unknown) => parentPort.postMessage({
      id: message.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }));
});
