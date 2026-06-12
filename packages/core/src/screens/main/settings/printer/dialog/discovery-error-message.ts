import type { DiscoveryError } from '@wcpos/printer';

type Translate = (key: string, fallback: string) => string;

/** Map a typed discovery error to a translated, user-facing message. */
export function formatDiscoveryError(error: DiscoveryError, t: Translate): string {
	switch (error.code) {
		case 'bt-none-found':
			return t(
				'settings.bt_none_found',
				'No Bluetooth (BLE) printers found. Make sure the printer is powered on and in pairing mode. Bluetooth Classic printers cannot be discovered by this scan — if your printer is paired with this computer, it appears under Paired or Installed printers.'
			);
		case 'bt-connect-failed':
			return t('settings.bt_connect_failed', 'Could not connect to the selected Bluetooth device.');
		case 'usb-none-found':
			return t('settings.usb_none_found', 'No USB printers found.');
		case 'network-none-found':
			return t(
				'settings.network_none_found',
				'No network printers found. Make sure the printer is on the same network, or enter its IP address manually.'
			);
		case 'ipc-unavailable':
			return t(
				'settings.printer_ipc_unavailable',
				'Printer discovery is unavailable in this window.'
			);
		case 'discovery-failed':
		default:
			return t('settings.printer_discovery_error', 'Printer discovery error: %s').replace(
				'%s',
				error.detail ?? ''
			);
	}
}
