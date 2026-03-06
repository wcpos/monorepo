import * as React from 'react';

import { PrinterService } from '../printer-service';

import type { ReceiptData } from '../encoder/types';
import type { PrinterProfile } from '../types';

interface UsePrintOptions {
  /** Receipt data for ESC/POS encoding */
  receiptData?: ReceiptData;
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

    try {
      setIsPrinting(true);

      if (onBeforePrint) {
        await onBeforePrint();
      }

      const service = getService();

      if (printerProfile && printerProfile.connectionType !== 'system' && receiptData) {
        // Direct thermal printing — encode and send bytes
        await service.printReceipt(receiptData, printerProfile);
      } else {
        // System print fallback — need HTML content
        let htmlContent = html;

        if (!htmlContent && receiptUrl) {
          const response = await fetch(receiptUrl);
          if (!response.ok) {
            throw new Error(`Failed to fetch receipt: ${response.status}`);
          }
          htmlContent = await response.text();
        }

        if (!htmlContent) {
          throw new Error('No printable content available (no HTML, no URL, no receipt data with printer profile)');
        }

        await service.printHtml(htmlContent);
      }

      onAfterPrint?.();
    } catch (error) {
      onPrintError?.(error as Error);
    } finally {
      setIsPrinting(false);
    }
  }, []);

  return { print, isPrinting };
}
