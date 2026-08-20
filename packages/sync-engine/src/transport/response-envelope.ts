export type ResponseEnvelopeMetadata = {
	v: 1;
	total?: number;
	total_pages?: number;
	page?: number;
	pressure?: 'low' | 'elevated' | 'high';
	server_load?: [number, number, number];
	memory_peak_bytes?: number;
	validator?: string;
};
export type ResponseEnvelopeTransportState = {
	responseHeadersReadable: boolean;
};
export type HydrateResponseOptions = {
	envelopeRequested: boolean;
	transportState?: ResponseEnvelopeTransportState;
	onDiagnostic?: (kind: 'divergent' | 'unreadable') => void;
};
type Envelope = { data: unknown; _wcpos: ResponseEnvelopeMetadata };
const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null;
const isSafeInteger = (value: unknown, minimum: number): value is number =>
	typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum;
const isLoad = (value: unknown): value is [number, number, number] =>
	Array.isArray(value) &&
	value.length === 3 &&
	value.every((sample) => typeof sample === 'number' && Number.isFinite(sample) && sample >= 0);
function isEnvelope(value: unknown): value is Envelope {
	if (!isObject(value) || !Object.prototype.hasOwnProperty.call(value, 'data')) return false;
	return isObject(value._wcpos) && value._wcpos.v === 1;
}
function safeHeaderGet(headers: Headers, name: string): string | null {
	try {
		return headers.get(name);
	} catch {
		return null;
	}
}
function validIntegerHeader(raw: string | null, minimum: number): boolean {
	if (raw === null || raw.trim() === '') return false;
	const parsed = Number(raw);
	return Number.isSafeInteger(parsed) && parsed >= minimum;
}
function validPressure(raw: unknown): boolean {
	const value = typeof raw === 'string' ? raw.trim().toLowerCase() : null;
	return value === 'low' || value === 'elevated' || value === 'high';
}
function validLoadHeader(raw: string | null): boolean {
	if (raw === null) return false;
	try {
		return isLoad(JSON.parse(raw));
	} catch {
		return false;
	}
}
function copyHeaders(headers: Headers): Headers {
	try {
		return new Headers(headers);
	} catch {
		return new Headers();
	}
}
function wrapResponse(
	response: Response,
	body: { json: () => Promise<unknown>; text: string },
	headers?: Headers
): Response {
	return new Proxy(Object.create(response) as Response, {
		get(_target, property) {
			if (property === 'headers' && headers) return headers;
			if (property === 'json') return body.json;
			if (property === 'text') return async () => body.text;
			const value: unknown = Reflect.get(response, property, response);
			return typeof value === 'function' ? value.bind(response) : value;
		},
	});
}
/** Unwrap opted-in metadata; unrequested traffic returns untouched without reading its body. */
export async function hydrateResponse(
	response: Response,
	options: HydrateResponseOptions
): Promise<Response> {
	if (!options.envelopeRequested || response.body === null) return response;
	// Hostile hosts answer JSON routes with HTML (challenge pages, edge error
	// pages). Hydration must never turn that into a rejection the caller did
	// not have before: parse defensively and keep the raw text readable, with
	// json() failing exactly the way fetch's own json() would have.
	const rawText = await response.text();
	let parsed: unknown;
	try {
		parsed = JSON.parse(rawText) as unknown;
	} catch (error) {
		return wrapResponse(response, {
			json: () => Promise.reject(error),
			text: rawText,
		});
	}
	if (!isEnvelope(parsed))
		return wrapResponse(response, { json: async () => parsed, text: rawText });
	const headers = copyHeaders(response.headers);
	const reads = {
		total: safeHeaderGet(response.headers, 'X-WP-Total'),
		totalPages: safeHeaderGet(response.headers, 'X-WP-TotalPages'),
		pressure: safeHeaderGet(response.headers, 'X-WCPOS-Pressure'),
		serverLoad: safeHeaderGet(response.headers, 'X-Server-Load'),
		memoryPeak: safeHeaderGet(response.headers, 'X-WCPOS-Memory-Peak'),
		validator: safeHeaderGet(response.headers, 'ETag'),
	};
	const metadata = parsed._wcpos;
	const divergent =
		(validIntegerHeader(reads.total, 0) &&
			isSafeInteger(metadata.total, 0) &&
			Number(reads.total) !== metadata.total) ||
		(validIntegerHeader(reads.totalPages, 1) &&
			isSafeInteger(metadata.total_pages, 1) &&
			Number(reads.totalPages) !== metadata.total_pages) ||
		(validPressure(reads.pressure) &&
			validPressure(metadata.pressure ?? null) &&
			reads.pressure!.trim().toLowerCase() !== metadata.pressure) ||
		(validLoadHeader(reads.serverLoad) &&
			isLoad(metadata.server_load) &&
			JSON.stringify(JSON.parse(reads.serverLoad!)) !== JSON.stringify(metadata.server_load)) ||
		(validIntegerHeader(reads.memoryPeak, 0) &&
			isSafeInteger(metadata.memory_peak_bytes, 0) &&
			Number(reads.memoryPeak) !== metadata.memory_peak_bytes) ||
		(reads.validator !== null &&
			reads.validator.trim() !== '' &&
			typeof metadata.validator === 'string' &&
			metadata.validator.trim() !== '' &&
			reads.validator.trim() !== metadata.validator);
	if (divergent) options.onDiagnostic?.('divergent');
	if (!validIntegerHeader(reads.total, 0) && isSafeInteger(metadata.total, 0))
		headers.set('X-WP-Total', String(metadata.total));
	if (!validIntegerHeader(reads.totalPages, 1) && isSafeInteger(metadata.total_pages, 1))
		headers.set('X-WP-TotalPages', String(metadata.total_pages));
	if (!validPressure(reads.pressure) && validPressure(metadata.pressure ?? null))
		headers.set('X-WCPOS-Pressure', metadata.pressure!);
	if (!validLoadHeader(reads.serverLoad) && isLoad(metadata.server_load))
		headers.set('X-Server-Load', JSON.stringify(metadata.server_load));
	if (!validIntegerHeader(reads.memoryPeak, 0) && isSafeInteger(metadata.memory_peak_bytes, 0))
		headers.set('X-WCPOS-Memory-Peak', String(metadata.memory_peak_bytes));
	if (
		(reads.validator === null || reads.validator.trim() === '') &&
		typeof metadata.validator === 'string' &&
		metadata.validator.trim() !== ''
	)
		headers.set('ETag', metadata.validator);
	if (Object.values(reads).every((value) => value === null)) {
		const state = options.transportState;
		if (state?.responseHeadersReadable !== false) {
			if (state) state.responseHeadersReadable = false;
			options.onDiagnostic?.('unreadable');
		}
	}
	const data = parsed.data;
	return wrapResponse(response, { json: async () => data, text: JSON.stringify(data) }, headers);
}
