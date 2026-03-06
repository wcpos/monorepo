import type { PrinterTransport } from "../types";

interface ElectronIpc {
  send: (channel: string, args: unknown) => void;
  once: (channel: string, callback: (...args: unknown[]) => void) => void;
  removeListener: (
    channel: string,
    callback: (...args: unknown[]) => void,
  ) => void;
  invoke: (channel: string, args: unknown) => Promise<unknown>;
}

function getIpc(): ElectronIpc {
  const ipc = (window as any).ipcRenderer as ElectronIpc | undefined;
  if (!ipc) throw new Error("Electron ipcRenderer not available");
  return ipc;
}

/**
 * Electron system print adapter.
 * Sends print jobs to the main process via IPC.
 */
export class SystemPrintAdapter implements PrinterTransport {
  readonly name = "system-print-electron";

  async printRaw(_data: Uint8Array): Promise<void> {
    // Raw byte printing via Electron is handled by ElectronNetworkAdapter.
    throw new Error("SystemPrintAdapter does not support raw byte printing.");
  }

  async printHtml(html: string): Promise<void> {
    const ipc = getIpc();
    const jobId = crypto.randomUUID();

    return new Promise<void>((resolve, reject) => {
      const afterChannel = `onAfterPrint-${jobId}`;
      const errorChannel = `onPrintError-${jobId}`;

      const onAfter = () => {
        ipc.removeListener(errorChannel, onError);
        resolve();
      };
      const onError = (_error: unknown) => {
        ipc.removeListener(afterChannel, onAfter);
        reject(new Error(`Electron print failed: ${String(_error)}`));
      };

      ipc.once(afterChannel, onAfter);
      ipc.once(errorChannel, onError);

      // Send HTML as a data URL so the existing handler can load it
      const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
      ipc.send("print-external-url", {
        externalURL: dataUrl,
        printJobId: jobId,
      });
    });
  }
}
