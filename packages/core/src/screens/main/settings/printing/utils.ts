import type { IconName } from '@wcpos/components/icon';
import { Platform } from '@wcpos/utils/platform';

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

/**
 * Rollout/kill-switch seam for the network-scan UI.
 * - Native + Electron: always supported (mDNS / vendor SDK).
 * - Web: dev-only for now. The sweep currently only has `localhost` as a candidate (it finds the
 *   dev virtual printer, not real LAN printers), and an https origin can't reach http printers
 *   anyway. Re-enable web in production once a real candidate source exists (subnet input /
 *   `.local` / scan-to-pair). Manual IP entry and WebUSB (Phase 3a) remain the web prod paths.
 */
export function isNetworkScanSupported(): boolean {
	if (Platform.isWeb) {
		return typeof __DEV__ !== 'undefined' && __DEV__;
	}
	return true;
}
