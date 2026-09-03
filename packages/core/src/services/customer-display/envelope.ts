export interface DisplayEnvelope<T extends object = Record<string, unknown>> {
	wcpos: 1;
	id: string;
	action: string;
	payload: T;
}

export function uuid(): string {
	const crypto = globalThis.crypto;
	if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID();
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (token) => {
		const random = Math.floor(Math.random() * 16);
		return (token === 'x' ? random : (random & 0x3) | 0x8).toString(16);
	});
}

export function makeEnvelope<T extends object>(
	action: string,
	payload: T,
	id = uuid()
): DisplayEnvelope<T> {
	return { wcpos: 1, id, action, payload };
}
