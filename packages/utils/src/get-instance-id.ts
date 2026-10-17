import { File, Paths } from 'expo-file-system';

/**
 * A stable per-installation id for the store's own bookkeeping (the plugin keys its
 * per-client integrity streak on it as `X-WCPOS-Instance`). It is NOT the telemetry
 * install id: that one is deleted when tracking consent is denied, and the store must
 * keep telling one till apart from another regardless. Native: a file in the document
 * directory. Undefined when storage is unavailable; the header is then simply omitted.
 */
export function getInstanceId(): string | undefined {
	try {
		const file = new File(Paths.document, 'wcpos_instance_id');
		let id = file.exists ? file.textSync() : '';
		if (!id) {
			id = globalThis.crypto.randomUUID();
			file.write(id);
		}
		return id;
	} catch {
		return undefined;
	}
}
