import type { PrinterTransport } from "../types";

/**
 * Global type declarations for the Epson ePOS SDK.
 *
 * The SDK is not published on npm and cannot be bundled. It must be loaded
 * via a `<script>` tag that exposes `window.epson.ePOSDevice`.
 *
 * Download the SDK from Epson:
 *   https://download.epson-biz.com/modules/pos/index.php?page=single_soft&cid=6679
 *
 * Then add it to your HTML:
 *   <script src="/path/to/epos-2.27.0.js"></script>
 */
interface EpsonePOSDevice {
  connect(ip: string, port: number, callback: (status: string) => void): void;
  createDevice(
    id: string,
    type: number,
    options: Record<string, unknown>,
    callback: (printer: EpsonPrinter | null, retcode: string) => void,
  ): void;
  disconnect(): void;
  DEVICE_TYPE_PRINTER: number;
}

interface EpsonPrinter {
  addCommand(data: string): void;
  send(): void;
  onreceive:
    | ((response: { success: boolean; code: string; status: number }) => void)
    | null;
  onerror: ((error: { status: number; responseText: string }) => void) | null;
}

/**
 * Epson ePOS adapter for web browsers.
 *
 * Wraps the Epson ePOS JavaScript SDK which communicates with Epson
 * TM-series printers over WebSocket (port 8008 for ws, 8043 for wss).
 *
 * **Prerequisites:**
 * The Epson ePOS SDK must be loaded globally before using this adapter.
 * Add the SDK script tag to your HTML page:
 *
 *   <script src="/path/to/epos-2.27.0.js"></script>
 *
 * The SDK is available from Epson's developer portal:
 *   https://download.epson-biz.com/modules/pos/index.php?page=single_soft&cid=6679
 *
 * **Connection behavior:**
 * The adapter lazily connects on the first print call and reuses the
 * connection for subsequent prints. Call disconnect() to clean up.
 */
export class EpsonEposAdapter implements PrinterTransport {
  readonly name = "epson-epos-web";

  private device: EpsonePOSDevice | null = null;
  private printer: EpsonPrinter | null = null;
  private connecting: Promise<void> | null = null;

  /**
   * @param host - Printer IP address or hostname (e.g., "192.168.1.100")
   * @param port - WebSocket port. Defaults to 8043 (wss). Use 8008 for ws.
   */
  constructor(
    private host: string,
    private port: number = 8043,
  ) {}

  async printRaw(data: Uint8Array): Promise<void> {
    await this.ensureConnected();

    // Convert bytes to a string of char codes (the SDK's addCommand format).
    // Process in chunks to avoid call stack limits on large receipts.
    const CHUNK_SIZE = 8192;
    const chunks: string[] = [];
    for (let i = 0; i < data.length; i += CHUNK_SIZE) {
      const chunk = data.subarray(i, i + CHUNK_SIZE);
      chunks.push(
        String.fromCharCode.apply(null, chunk as unknown as number[]),
      );
    }
    const rawString = chunks.join("");

    return new Promise<void>((resolve, reject) => {
      this.printer!.onreceive = (response) => {
        this.printer!.onreceive = null;
        this.printer!.onerror = null;

        if (response.success) {
          resolve();
        } else {
          reject(new Error(`Epson print failed with code: ${response.code}`));
        }
      };

      this.printer!.onerror = (error) => {
        this.printer!.onreceive = null;
        this.printer!.onerror = null;
        reject(
          new Error(
            `Epson print error (status ${error.status}): ${error.responseText}`,
          ),
        );
      };

      this.printer!.addCommand(rawString);
      this.printer!.send();
    });
  }

  async printHtml(_html: string): Promise<void> {
    throw new Error("EpsonEposAdapter does not support HTML printing.");
  }

  async disconnect(): Promise<void> {
    if (this.device) {
      this.device.disconnect();
      this.device = null;
      this.printer = null;
    }
  }

  /**
   * Lazily connect to the printer and create the device handle.
   * Reuses an existing connection if already established.
   */
  private async ensureConnected(): Promise<void> {
    if (this.printer) return;
    if (this.connecting) return this.connecting;

    this.connecting = this.doConnect().finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  private async doConnect(): Promise<void> {
    const epson = (window as any).epson;
    if (!epson?.ePOSDevice) {
      throw new Error(
        "Epson ePOS SDK not loaded. Add the ePOS SDK script to your HTML page before " +
          "using the Epson adapter. Download from: " +
          "https://download.epson-biz.com/modules/pos/index.php?page=single_soft&cid=6679",
      );
    }

    this.device = new epson.ePOSDevice() as EpsonePOSDevice;

    // Step 1: open WebSocket connection to the printer
    await new Promise<void>((resolve, reject) => {
      this.device!.connect(this.host, this.port, (status: string) => {
        if (status === "OK" || status === "SSL_CONNECT_OK") {
          resolve();
        } else {
          this.device = null;
          reject(new Error(`Epson connection failed: ${status}`));
        }
      });
    });

    // Step 2: create a printer device handle
    // Wrap in try-catch so a createDevice failure disconnects the socket
    // from Step 1, preventing orphaned WebSocket connections on retry.
    try {
      this.printer = await new Promise<EpsonPrinter>((resolve, reject) => {
        this.device!.createDevice(
          "local_printer",
          this.device!.DEVICE_TYPE_PRINTER,
          { crypto: this.port === 8043, buffer: false },
          (printer, retcode) => {
            if (retcode === "OK" && printer) {
              resolve(printer);
            } else {
              reject(new Error(`Epson device creation failed: ${retcode}`));
            }
          },
        );
      });
    } catch (error) {
      this.device?.disconnect();
      this.device = null;
      this.printer = null;
      throw error;
    }
  }
}
