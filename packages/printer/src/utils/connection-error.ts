/**
 * Structured connection-failure diagnostics for web network printing.
 *
 * The actionable next step differs by endpoint protocol:
 * - Plain HTTP from a secure page works only via Chromium's Local Network
 *   Access permission (Chrome/Edge 142+), so the likely fixes are accepting
 *   the permission prompt or switching browsers.
 * - HTTPS requires a certificate on the printer; many printers ship with the
 *   HTTPS port open but no certificate generated.
 * - On localhost the target is usually the dev virtual printer, which speaks
 *   plain HTTP — certificate advice for a "printer web configuration" would
 *   be misleading there.
 */
export interface ConnectionDiagnostics {
	/** e.g. "Epson" / "Star" */
	vendorLabel: string;
	/** e.g. "Epson ePOS over HTTPS" — what was attempted, in words. */
	attemptLabel: string;
	/** The full URL the request was sent to. */
	url: string;
	host: string;
	port: number;
	scheme: 'http' | 'https';
	likelyReason: string;
	/** Ordered, user-actionable next steps. */
	suggestions: string[];
	/** Raw underlying error (e.g. "TypeError: Failed to fetch") for support. */
	errorDetail?: string;
}

const PRINTER_CONNECTION_ERROR_NAME = 'PrinterConnectionError';

export class PrinterConnectionError extends Error {
	readonly diagnostics: ConnectionDiagnostics;

	constructor(message: string, diagnostics: ConnectionDiagnostics) {
		super(message);
		this.name = PRINTER_CONNECTION_ERROR_NAME;
		this.diagnostics = diagnostics;
	}
}

/** Shape-based guard — survives bundlers that duplicate the class. */
export function isPrinterConnectionError(error: unknown): error is PrinterConnectionError {
	return (
		error instanceof Error &&
		error.name === PRINTER_CONNECTION_ERROR_NAME &&
		typeof (error as PrinterConnectionError).diagnostics === 'object'
	);
}

function isLocalhost(host: string): boolean {
	return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
}

export interface BuildConnectionErrorOptions {
	vendorLabel: string;
	/** e.g. "ePOS" / "WebPRNT" — the vendor web-print protocol name. */
	protocolName: string;
	url: string;
	/** e.g. "ensure ePOS is enabled in the printer's network settings". */
	enableHint: string;
	/** The vendor's plain-HTTP port to suggest as a fallback (8008 / 80). */
	plainHttpPort: number;
	/** 'unreachable' (fetch failed) or 'timeout' (request aborted). */
	reason?: 'unreachable' | 'timeout';
	/** The underlying error, included in support details. */
	cause?: unknown;
}

export function buildConnectionError(opts: BuildConnectionErrorOptions): PrinterConnectionError {
	const {
		vendorLabel,
		protocolName,
		url,
		enableHint,
		plainHttpPort,
		reason = 'unreachable',
	} = opts;

	let host = '';
	let port = 0;
	let scheme: 'http' | 'https' = 'http';
	try {
		const parsed = new URL(url);
		host = parsed.hostname;
		scheme = parsed.protocol === 'https:' ? 'https' : 'http';
		port = parsed.port ? Number(parsed.port) : scheme === 'https' ? 443 : 80;
	} catch {
		// keep defaults; the URL still appears verbatim in the message
	}

	const secure = scheme === 'https';
	const local = isLocalhost(host);
	const attemptLabel = `${vendorLabel} ${protocolName} over ${scheme.toUpperCase()}`;

	let likelyReason: string;
	const suggestions: string[] = [];

	if (reason === 'timeout') {
		likelyReason = `The printer did not answer at ${url} before the request timed out.`;
		suggestions.push(`Check that the printer is powered on and reachable at ${host}.`);
		suggestions.push(`Confirm the IP address and port, and ${enableHint}.`);
	} else if (secure) {
		likelyReason = `The printer did not respond on ${vendorLabel}'s HTTPS ${protocolName} port.`;
		if (local) {
			suggestions.push(
				`If this is a local virtual printer, it speaks plain HTTP — set the port to ${plainHttpPort}.`
			);
			suggestions.push(`If this is a real ${vendorLabel} printer, ${enableHint}.`);
			suggestions.push(
				`If you really are using HTTPS on ${host}, open ${scheme}://${host}:${port} in this browser and accept the certificate warning.`
			);
		} else {
			suggestions.push(`Check the IP address and ${enableHint}.`);
			suggestions.push(
				`HTTPS requires an SSL certificate on the printer — generate a self-signed certificate in the printer's web configuration, then visit https://${host}:${port} in this browser and accept the certificate warning.`
			);
			suggestions.push(
				`If the printer only supports HTTP, set the port to ${plainHttpPort} and use Chrome or Edge with local network access permission.`
			);
		}
	} else {
		likelyReason = `The printer did not respond on ${vendorLabel}'s HTTP ${protocolName} port, or the browser blocked the request.`;
		suggestions.push(`Check the IP address and ${enableHint}.`);
		suggestions.push(
			'If your browser asked for permission to access devices on your local network, choose Allow and try again.'
		);
		if (!local) {
			suggestions.push(
				'Plain-HTTP printing from a secure (HTTPS) page requires Chrome or Edge 142 or newer — other browsers block it. Otherwise, enable HTTPS on the printer instead.'
			);
		}
	}

	const message =
		`Could not connect to ${vendorLabel} printer at ${url}. ${likelyReason} ` +
		suggestions.map((s, i) => `${i + 1}. ${s}`).join(' ');

	return new PrinterConnectionError(message, {
		vendorLabel,
		attemptLabel,
		url,
		host,
		port,
		scheme,
		likelyReason,
		suggestions,
		errorDetail:
			opts.cause == null
				? undefined
				: opts.cause instanceof Error
					? `${opts.cause.name}: ${opts.cause.message}`
					: String(opts.cause),
	});
}
