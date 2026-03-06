import type { PrinterTransport } from '../types';

interface ElectronIpc {
  invoke: (channel: string, args: unknown) => Promise<unknown>;
}

function getIpc(): ElectronIpc {
  const ipc = (window as any).ipcRenderer as ElectronIpc | undefined;
  if (!ipc) throw new Error('Electron ipcRenderer not available');
  return ipc;
}

/**
 * Electron network adapter.
 * Sends raw ESC/POS bytes to a printer via TCP through the main process.
 */
export class NetworkAdapter implements PrinterTransport {
  readonly name = 'network-electron';

  constructor(
    private host: string,
    private port: number = 9100,
  ) {}

  async printRaw(data: Uint8Array): Promise<void> {
    const ipc = getIpc();
    // Send as regular array — Uint8Array doesn't serialize across IPC cleanly
    await ipc.invoke('print-raw-tcp', {
      host: this.host,
      port: this.port,
      data: Array.from(data),
    });
  }

  async printHtml(_html: string): Promise<void> {
    throw new Error('NetworkAdapter does not support HTML printing. Use printRaw instead.');
  }
}
