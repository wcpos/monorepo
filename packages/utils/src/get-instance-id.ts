import { File, Paths } from 'expo-file-system';

/**
 * A stable per-installation id for the store's own bookkeeping (the plugin keys its
 * per-client integrity streak on it as `X-WCPOS-Instance`). It is NOT the telemetry
 * install id: that one is deleted when tracking consent is denied, and the store must
 * keep telling one till apart from another regardless. Native: a file in the document
 * directory. Like the telemetry id, backups can clone it: restored and original devices
 * share a drift streak until one re-mints. Expo File has no backup-exclusion flag.
 * Undefined when storage is unavailable; the header is then simply omitted.
 */
let cached: string | undefined;

export function getInstanceId(): string | undefined {
	if (cached !== undefined) return cached;
	try {
		const file = new File(Paths.document, 'wcpos_instance_id');
		let id = file.exists ? file.textSync() : '';
		if (!id) {
			id = globalThis.crypto.randomUUID();
			file.write(id);
		}
		// Minted once per process: every sync and REST request asks, and the file never changes.
		cached = id;
		return id;
	} catch {
		return undefined;
	}
}
