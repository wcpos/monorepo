import { Platform } from 'react-native';

import * as Application from 'expo-application';
import { File, Paths } from 'expo-file-system';

/**
 * A stable per-installation id for the store's own bookkeeping (the plugin keys its
 * per-client integrity streak on it as `X-WCPOS-Instance`). It is NOT the telemetry
 * install id: that one is deleted when tracking consent is denied, and the store must
 * keep telling one till apart from another regardless. Native: a file in the document
 * directory, bound to the device identity so a backup restored to another device
 * self-heals by re-minting; no backup exclusion is needed.
 * Undefined when storage is unavailable; the header is then simply omitted.
 */
let cached: string | undefined;
const deviceIdentity = Promise.resolve()
	.then(() =>
		Platform.OS === 'ios' ? Application.getIosIdForVendorAsync() : Application.getAndroidId()
	)
	.catch(() => null);

export async function getInstanceId(): Promise<string | undefined> {
	const device = await deviceIdentity;
	if (cached !== undefined) return cached;
	try {
		const file = new File(Paths.document, 'wcpos_instance_id');
		const raw = file.exists ? file.textSync() : '';
		const stored: { id: string; device: string | null } = raw.startsWith('{')
			? JSON.parse(raw)
			: { id: raw, device: null };
		const id =
			!stored.id || (device && stored.device && stored.device !== device)
				? globalThis.crypto.randomUUID()
				: stored.id;
		const record = JSON.stringify({ id, device: device ?? stored.device });
		if (raw !== record) file.write(record);
		// Minted once per process: every sync and REST request asks, and the file never changes.
		cached = id;
		return id;
	} catch {
		return undefined;
	}
}
