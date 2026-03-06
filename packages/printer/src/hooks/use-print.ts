import * as React from "react";

import { mapReceiptData } from "../encoder/map-receipt-data";
import { PrinterService } from "../printer-service";

import type { ReceiptData } from "../encoder/types";
import type { PrinterProfile } from "../types";

const FETCH_TIMEOUT_MS = 10_000;

interface UsePrintOptions {
  /** Receipt data for ESC/POS encoding. Accepts both the canonical shape
   *  and the offline rendering shape — the mapper normalises automatically. */
  receiptData?: ReceiptData | Record<string, any>;
  /** HTML content for system print fallback */
  html?: string;
  /** Receipt URL — fetched and used as HTML for system print fallback */
  receiptUrl?: string;
  /** Active printer profile. If undefined, uses system print dialog. */
  printerProfile?: PrinterProfile;
  /** Callbacks */
  onBeforePrint?: () => void | Promise<void>;
  onAfterPrint?: () => void;
  onPrintError?: (error: Error) => void;
}

// Singleton service instance
let printerService: PrinterService | null = null;

function getService(): PrinterService {
  if (!printerService) {
    printerService = new PrinterService();
  }
  return printerService;
}

export function usePrint(options: UsePrintOptions) {
  const [isPrinting, setIsPrinting] = React.useState(false);
  const optionsRef = React.useRef(options);
  optionsRef.current = options;

  /** Track overlapping print calls so isPrinting stays true until all finish. */
  const activePrintsRef = React.useRef(0);

  const print = React.useCallback(async () => {
    const {
      receiptData,
      html,
      receiptUrl,
      printerProfile,
      onBeforePrint,
      onAfterPrint,
      onPrintError,
    } = optionsRef.current;

    activePrintsRef.current += 1;
    setIsPrinting(true);

    try {
      if (onBeforePrint) {
        await onBeforePrint();
      }

      const service = getService();

      if (
        printerProfile &&
        printerProfile.connectionType !== "system" &&
        receiptData
      ) {
        // Direct thermal printing — normalise shape then encode and send bytes
        const normalised = mapReceiptData(receiptData as Record<string, any>);
        await service.printReceipt(normalised, printerProfile);
      } else {
        // System print fallback — need HTML content
        let htmlContent = html;

        if (!htmlContent && receiptUrl) {
          const controller = new AbortController();
          const timeoutId = setTimeout(
            () => controller.abort(),
            FETCH_TIMEOUT_MS,
          );
          try {
            const response = await fetch(receiptUrl, {
              signal: controller.signal,
            });
            clearTimeout(timeoutId);
            if (!response.ok) {
              throw new Error(`Failed to fetch receipt: ${response.status}`);
            }
            htmlContent = await response.text();
          } catch (err) {
            clearTimeout(timeoutId);
            if (err instanceof DOMException && err.name === "AbortError") {
              throw new Error(
                `Receipt fetch timed out after ${FETCH_TIMEOUT_MS}ms`,
              );
            }
            throw err;
          }
        }

        if (!htmlContent) {
          throw new Error(
            "No printable content available (no HTML, no URL, no receipt data with printer profile)",
          );
        }

        await service.printHtml(htmlContent);
      }

      onAfterPrint?.();
    } catch (error) {
      onPrintError?.(error as Error);
      throw error;
    } finally {
      activePrintsRef.current -= 1;
      if (activePrintsRef.current <= 0) {
        activePrintsRef.current = 0;
        setIsPrinting(false);
      }
    }
  }, []);

  return { print, isPrinting };
}
