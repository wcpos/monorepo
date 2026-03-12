import type { PrinterProfile } from './types';
import type { TemplateInfo } from './resolve-printer';

export function detectMismatch(
	template: TemplateInfo,
	printer: PrinterProfile | null
): string | null {
	if (!printer) return null;

	const isSystemPrinter = printer.connectionType === 'system';
	const isThermalTemplate = template.output_type === 'escpos';
	const isHtmlTemplate = template.output_type === 'html';

	if (isThermalTemplate && isSystemPrinter) {
		return 'Thermal template selected but printer uses system dialog — raw ESC/POS output will not render correctly.';
	}

	if (isHtmlTemplate && !isSystemPrinter) {
		return 'HTML template selected but printer expects raw bytes — HTML content may not print correctly.';
	}

	return null;
}
