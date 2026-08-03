import type { DiscoveryError } from '@wcpos/printer';

type Translate = (key: string) => string;

/** Map a typed discovery error to a translated, user-facing message. */
export function formatDiscoveryError(error: DiscoveryError, t: Translate): string {
	switch (error.code) {
		case 'bt-none-found':
			return t('settings.bt_none_found');
		case 'bt-connect-failed':
			return t('settings.bt_connect_failed');
		case 'usb-none-found':
			return t('settings.usb_none_found');
		case 'network-none-found':
			return t('settings.network_none_found');
		case 'ipc-unavailable':
			return t('settings.printer_ipc_unavailable');
		case 'discovery-failed':
		default:
			return t('settings.printer_discovery_error').replace('%s', error.detail ?? '');
	}
}
