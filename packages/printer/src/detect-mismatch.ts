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
 * - `html-template-cloud-thermal-only`: an HTML template is going to an order-based cloud printer
 *   whose provider the server renders thermal templates only for, so the job prints nothing.
 *
 * The UI maps each code to translated copy; this module stays language-free.
 */
export type PrintMismatch =
	| 'thermal-template-prints-preview'
	| 'html-template-prints-default-layout'
	| 'html-template-cloud-thermal-only';

/**
 * Order-based cloud providers the plugin renders only thermal templates for
 * (`Provider::CAPABILITIES` `template_engines` = 'thermal'); any other engine renders nothing.
 * PrintNode renders every engine (HTML becomes a PDF). The plugin's `star-online` is also
 * thermal-only but has no client profile, so it never reaches the order-based branch.
 */
const THERMAL_ONLY_CLOUD_PROVIDERS: readonly string[] = ['star-cloudprnt', 'epson-sdp'];

/**
 * Mirrors the branches in `usePrint`: no profile or the dialog profile → system print dialog;
 * an order-based cloud profile → the server renders the selected template, if its provider
 * supports the template's engine;
 * any other profile → client-encoded raw bytes (winspool queues included).
 */
export function detectMismatch(
	template: TemplateInfo,
	printer: PrinterProfile | null
): PrintMismatch | null {
	if (printer && isOrderBasedCloudProfile(printer)) {
		return template.output_type === 'html' &&
			THERMAL_ONLY_CLOUD_PROVIDERS.includes(printer.cloudProvider ?? '')
			? 'html-template-cloud-thermal-only'
			: null;
	}

	const printsThroughDialog = !printer || usesSystemPrintDialog(printer);

	if (template.output_type === 'escpos' && printsThroughDialog) {
		return 'thermal-template-prints-preview';
	}

	if (template.output_type === 'html' && !printsThroughDialog) {
		return 'html-template-prints-default-layout';
	}

	return null;
}
