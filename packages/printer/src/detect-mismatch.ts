import { isOrderBasedCloudProfile } from './transport/cloud-adapter';
import { usesSystemPrintDialog } from './transport/device-key';

import type { PrinterProfile } from './types';
import type { TemplateInfo } from './resolve-printer';

/**
 * What will actually come out of the printer when it differs from the selected template.
 *
 * - `thermal-template-prints-preview`: a thermal (ESC/POS) template is going to the print dialog,
 *   either because no raw printer resolved (`printer` is null) or the profile is the dialog itself.
 *   `usePrint` then prints the on-screen thermal preview HTML, not the template's raw output.
 * - `html-template-prints-default-layout`: an HTML template is going to a raw printer that the
 *   client encodes for. `usePrint` cannot encode HTML, so it substitutes the built-in thermal layout.
 *
 * The UI maps each code to translated copy; this module stays language-free.
 */
export type PrintMismatch =
	'thermal-template-prints-preview' | 'html-template-prints-default-layout';

/**
 * Mirrors the branches in `usePrint`: no profile or the dialog profile → system print dialog;
 * an order-based cloud profile → the server renders the selected template (no mismatch);
 * any other profile → client-encoded raw bytes (winspool queues included).
 */
export function detectMismatch(
	template: TemplateInfo,
	printer: PrinterProfile | null
): PrintMismatch | null {
	if (printer && isOrderBasedCloudProfile(printer)) return null;

	const printsThroughDialog = !printer || usesSystemPrintDialog(printer);

	if (template.output_type === 'escpos' && printsThroughDialog) {
		return 'thermal-template-prints-preview';
	}

	if (template.output_type === 'html' && !printsThroughDialog) {
		return 'html-template-prints-default-layout';
	}

	return null;
}
