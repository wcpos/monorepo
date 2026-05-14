import type { IconName } from '@wcpos/components/icon';

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
 * `ESC/POS 80mm` for thermal templates, `HTML` for everything else.
 */
export function templateTypeLabel(template: {
	output_type?: string | null;
	paper_width?: string | number | null;
}): string {
	if (template.output_type === 'escpos') {
		return `ESC/POS ${template.paper_width ?? ''}`.trim();
	}
	return 'HTML';
}
