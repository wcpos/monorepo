import { acceptsRawCloudUpload } from './transport/cloud-adapter';

import type { PrinterProfile } from './types';

/**
 * Whether a standalone cash-drawer kick can be sent to this profile.
 *
 * This exists so the question has exactly one answer. It previously lived
 * inline in the settings dialog, phrased in terms of `isOrderBasedCloudProfile`
 * — which was the same answer by accident, until Star CloudPRNT became
 * order-based for receipts while still accepting a raw drawer kick. At that
 * point the two questions diverged and the button silently vanished for every
 * Star printer.
 *
 * Two things have to be true:
 *
 * - The transport can carry a one-off raw payload. A drawer kick has no order
 *   and no template behind it, so the server cannot render it — see
 *   `acceptsRawCloudUpload`.
 * - The connection is one we can actually push bytes over. The system print
 *   dialog cannot fire a drawer, so it is excluded.
 */
export function canOpenDrawer(profile: PrinterProfile | undefined): boolean {
	if (!profile || !acceptsRawCloudUpload(profile)) {
		return false;
	}

	return (
		profile.connectionType === 'network' ||
		profile.connectionType === 'bluetooth' ||
		profile.connectionType === 'usb' ||
		profile.connectionType === 'cloud'
	);
}
