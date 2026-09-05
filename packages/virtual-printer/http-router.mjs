/** Epson ePOS-Print SOAP endpoint path (served on port 8008 by real printers). */
export const EPSON_EPOS_PATH = '/cgi-bin/epos/service.cgi';

/** Star WebPRNT endpoint path (served on 80/443 by real printers). */
export const STAR_WEBPRNT_PATH = '/StarWebPRNT/SendMessage';

/** Epson ePOS-Print XML namespace — the real adapter parses for a `response` element in it. */
export const EPOS_PRINT_NS = 'http://www.epson-pos.com/schemas/2011/03/epos-print';

// A successful Epson ePOS print response (SOAP envelope). EpsonEposAdapter reads
// getElementsByTagNameNS(EPOS_PRINT_NS, 'response')[0] and checks success="true",
// so the response element MUST be in the ePOS namespace.
const EPSON_PRINT_RESPONSE =
	'<?xml version="1.0" encoding="utf-8"?>' +
	'<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body>' +
	`<response xmlns="${EPOS_PRINT_NS}" success="true" code="" status="251658262" battery="0"/>` +
	'</s:Body></s:Envelope>';

// A successful Star WebPRNT response — StarWebPrntAdapter throws unless <Status> is "Normal".
const STAR_PRINT_RESPONSE =
	'<?xml version="1.0" encoding="utf-8"?>' +
	'<StarWebPrint xmlns="http://schema.starwebprnt.com">' +
	'<SendMessageResponse><Status>Normal</Status></SendMessageResponse></StarWebPrint>';

// A socket.io handshake banner — what an ePOS-Device box answers on the ePOS path. The app must
// reject it: it is a 200, but it is not an ePOS response (wcpos/monorepo epos-endpoint tests).
const SOCKET_IO_BANNER = 'Welcome to socket.io.';

/** A printer's own web UI, so a non-receipt printer still looks like a web server on `/`. */
const ROOT_PAGE = '<html><head><title>Printer</title></head><body>Printer status</body></html>';

/** identify probes with an empty `<epos-print/>`; anything inside it is a real job. */
function isPrintJob(body) {
	return !!/<epos-print\b[^>]*>([\s\S]*?)<\/epos-print>/.exec(body ?? '')?.[1].trim();
}

/** Legacy `VP_VENDOR` string, or a scenario lane config. */
function laneConfig(config) {
	if (typeof config !== 'string') return config ?? {};
	return { epos: config === 'star' ? 'off' : 'ok', webprnt: config !== 'epson' };
}

/**
 * Decide the HTTP response for a request to the fake printer.
 * - GET to a printer endpoint → 405 (probeVendor reads this as "present"; 404 = "absent").
 * - POST → 200 with a vendor-correct print response so the real web adapter parses success.
 *
 * @param {string} method
 * @param {string} url
 * @param {string | import('./scenarios.mjs').LaneConfig} [config] vendor string or lane config
 * @param {string} [body] request body, so a busy printer can answer probes but refuse jobs
 * @returns {{ status: number, body: string, contentType?: string }}
 */
export function routeHttpRequest(method, url, config = 'both', body = '') {
	const { epos = 'off', webprnt = false, root = false } = laneConfig(config);
	const path = (url ?? '').split('?')[0];

	if (path === EPSON_EPOS_PATH && epos !== 'off') {
		if (epos === 'socketio') return { status: 200, body: SOCKET_IO_BANNER };
		if (method === 'OPTIONS') return { status: 204, body: '' };
		if (method !== 'POST') return { status: 405, body: 'Method Not Allowed' };
		// Holding printer: the endpoint is up, the job is refused.
		if (epos === 'busy' && isPrintJob(body)) return { status: 503, body: 'Service Unavailable' };
		return { status: 200, body: EPSON_PRINT_RESPONSE, contentType: 'text/xml' };
	}
	if (path === STAR_WEBPRNT_PATH && webprnt) {
		if (method === 'OPTIONS') return { status: 204, body: '' };
		if (method !== 'POST') return { status: 405, body: 'Method Not Allowed' };
		return { status: 200, body: STAR_PRINT_RESPONSE, contentType: 'text/xml' };
	}
	if (path === '/' && root) return { status: 200, body: ROOT_PAGE, contentType: 'text/html' };
	return { status: 404, body: 'Not found' };
}
