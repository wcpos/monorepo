import type { PrinterTransport } from "../types";

interface ElectronIpc {
  invoke: (channel: string, args: unknown) => Promise<unknown>;
}

function getIpc(): ElectronIpc {
  const ipc = (window as any).ipcRenderer as ElectronIpc | undefined;
  if (!ipc) throw new Error("Electron ipcRenderer not available");
  return ipc;
}

const PRINT_TIMEOUT_MS = 30_000;

/**
 * Electron network adapter.
 * Sends raw ESC/POS bytes to a printer via TCP through the main process.
 */
export class NetworkAdapter implements PrinterTransport {
  readonly name = "network-electron";

  constructor(
    private host: string,
    private port: number = 9100,
    _vendor?: string,
  ) {}

  async printRaw(data: Uint8Array): Promise<void> {
    const ipc = getIpc();
    // Send as regular array — Uint8Array doesn't serialize across IPC cleanly
    const result = Promise.race([
      ipc.invoke("print-raw-tcp", {
        host: this.host,
        port: this.port,
        data: Array.from(data),
      }),
      new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(new Error(`Print timed out after ${PRINT_TIMEOUT_MS}ms`)),
          PRINT_TIMEOUT_MS,
        ),
      ),
    ]);
    await result;
  }

  async printHtml(_html: string): Promise<void> {
    throw new Error(
      "NetworkAdapter does not support HTML printing. Use printRaw instead.",
    );
  }

  async disconnect(): Promise<void> {
    // TCP connections are per-request; nothing to clean up
  }
}
