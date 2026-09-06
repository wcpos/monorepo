import type { IconName } from '@wcpos/components/icon';
import type { PrinterProfile } from '@wcpos/printer';

/** Sentinel value for the "Auto" routing option in the template printer Select. */
export const AUTO_VALUE = '__auto__';

/**
 * Icon for a printer profile row — `desktop` for the built-in System Print Dialog,
 * `printer` for every hardware connection type (network / bluetooth / usb).
 */
export function printerIconName(profile: { connectionType: string }): IconName {
	return profile.connectionType === 'system' ? 'desktop' : 'printer';
}

/**
 * Human-readable type-chip label for a receipt template:
 * `Thermal 80mm` for thermal templates, `HTML` for everything else.
 *
 * "Thermal" and not "ESC/POS": the template's `output_type` is `escpos` for
 * every thermal-engine template, but the bytes actually sent depend on the
 * printer (ESC/POS, StarPRNT, ePOS-XML, …) — naming one wire format here
 * misleads users with Star or Epson cloud printers.
 *
 * @param thermalLabel Translated word for "Thermal", supplied by the caller
 *                     so this util stays hook-free.
 */
export function templateTypeLabel(
	template: {
		output_type?: string | null;
		paper_width?: string | number | null;
	},
	thermalLabel = 'Thermal'
): string {
	if (template.output_type === 'escpos') {
		return `${thermalLabel} ${template.paper_width ?? ''}`.trim();
	}
	return 'HTML';
}

/**
 * Ports whose lane answers the print job: Epson ePOS (443/8043/80/8008) and Star WebPRNT
 * both reply once the printer has taken the bytes. A raw 9100 socket accepts and says
 * nothing, so the app can only claim the job was sent (roadmap#161 P1).
 */
const ACKNOWLEDGING_PORTS = [443, 8043, 80, 8008];

export function laneAcknowledgesPrint(profile: PrinterProfile): boolean {
	if (profile.connectionType === 'cloud') return true;
	return (
		profile.connectionType === 'network' &&
		(profile.vendor === 'epson' || profile.vendor === 'star') &&
		ACKNOWLEDGING_PORTS.includes(profile.port ?? 0)
	);
}
