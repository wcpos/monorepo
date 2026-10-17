/**
 * Web and Electron: the instance id lives in localStorage under its own key, separate from
 * the telemetry install id that consent denial removes. Undefined when storage is missing
 * or blocked; the header is then omitted.
 */
export function getInstanceId(): string | undefined {
	if (typeof window === 'undefined') return undefined;
	try {
		const stored = window.localStorage.getItem('wcpos_instance_id');
		if (stored) return stored;
		const id = window.crypto.randomUUID();
		window.localStorage.setItem('wcpos_instance_id', id);
		return id;
	} catch {
		return undefined;
	}
}
