import type { PrinterTransport } from "../types";

/**
 * Web system print adapter.
 * Creates a hidden iframe, loads HTML, calls window.print().
 */
export class SystemPrintAdapter implements PrinterTransport {
  readonly name = "system-print-web";

  async printRaw(_data: Uint8Array): Promise<void> {
    throw new Error(
      "SystemPrintAdapter does not support raw byte printing. Use printHtml instead.",
    );
  }

  async printHtml(html: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      // Remove any existing print iframe
      const existing = document.getElementById("wcpos-print-frame");
      if (existing) {
        document.body.removeChild(existing);
      }

      const iframe = document.createElement("iframe");
      iframe.id = "wcpos-print-frame";
      iframe.style.position = "absolute";
      iframe.style.top = "-10000px";
      iframe.style.left = "-10000px";
      iframe.style.width = "0";
      iframe.style.height = "0";
      document.body.appendChild(iframe);

      const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
      if (!doc) {
        document.body.removeChild(iframe);
        reject(new Error("Cannot access iframe document"));
        return;
      }

      doc.open();
      doc.write(html);
      doc.close();

      // Wait for content to render before printing
      setTimeout(() => {
        try {
          const win = iframe.contentWindow;
          if (!win) {
            reject(new Error("Cannot access iframe window"));
            return;
          }

          // Use afterprint to detect when the print dialog closes so the
          // print queue waits for the actual operation to finish.
          const FALLBACK_TIMEOUT = 60_000;
          let settled = false;

          const settle = () => {
            if (settled) return;
            settled = true;
            clearTimeout(fallbackTimer);
            resolve();
            // Defer cleanup so the browser finishes spooling
            setTimeout(() => {
              const el = document.getElementById("wcpos-print-frame");
              if (el) document.body.removeChild(el);
            }, 1000);
          };

          const fallbackTimer = setTimeout(settle, FALLBACK_TIMEOUT);
          win.addEventListener("afterprint", settle, { once: true });

          win.focus();
          win.print();
        } catch (error) {
          const el = document.getElementById("wcpos-print-frame");
          if (el) document.body.removeChild(el);
          reject(error);
        }
      }, 500);
    });
  }

  async disconnect(): Promise<void> {
    // Nothing to clean up for system print
  }
}
