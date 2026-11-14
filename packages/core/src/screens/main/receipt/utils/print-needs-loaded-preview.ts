import { isOrderBasedCloudProfile, usesSystemPrintDialog } from '@wcpos/printer';
import type { PrinterProfile } from '@wcpos/printer';

interface PrintInputs {
	/** The profile handed to `usePrint` (undefined = system dialog). */
	printerProfile: PrinterProfile | undefined;
	receiptData: unknown;
	/** HTML already rendered on the device (the preview's srcDoc). */
	html: string | undefined;
}

/**
 * Whether the print `usePrint` will run reads the receipt preview frame, so auto-print
 * must wait for the frame to load. Mirrors usePrint's branches, in the same order:
 *
 * 1. order-based cloud printer: the server renders the order, nothing local is read;
 * 2. raw/thermal profile with receipt data: encoded on the device from the data;
 * 3. system dialog: prints `html` when it is already rendered; otherwise it reads the
 *    frame's document (an unloaded frame is an empty page, so it would print blank),
 *    falling back to fetching the receipt URL only when the frame is unreadable.
 *
 * Only case 3 without HTML needs the frame: on a slow site that frame is a full
 * WordPress page, and prints that never use it must not wait for it.
 */
export function printNeedsLoadedPreview({ printerProfile, receiptData, html }: PrintInputs) {
	if (printerProfile && isOrderBasedCloudProfile(printerProfile)) return false;
	if (printerProfile && !usesSystemPrintDialog(printerProfile) && receiptData) return false;
	return !html;
}
