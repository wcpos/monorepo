/**
 * Build a user-facing connection-failure message for web network printing.
 *
 * The actionable next step differs by endpoint protocol:
 * - Plain HTTP from a secure page works only via Chromium's Local Network
 *   Access permission (Chrome/Edge 142+), so the likely fixes are accepting
 *   the permission prompt or switching browsers.
 * - HTTPS requires a certificate on the printer; many printers ship with the
 *   HTTPS port open but no certificate generated.
 */
export function buildConnectionErrorMessage(opts: {
	vendorLabel: string;
	url: string;
	enableHint: string;
	plainHttpPort: number;
}): string {
	const { vendorLabel, url, enableHint, plainHttpPort } = opts;
	const base = `Could not connect to ${vendorLabel} printer at ${url}. Check the IP address and ${enableHint}.`;

	let hostname = '';
	try {
		hostname = new URL(url).hostname;
	} catch {
		return base;
	}

	if (url.startsWith('http:')) {
		return (
			`${base} If your browser asked for permission to access devices on your local network, ` +
			'choose Allow and try again. Plain-HTTP printing from a secure (HTTPS) page requires ' +
			'Chrome or Edge 142 or newer — other browsers block it. Otherwise, enable HTTPS on the ' +
			'printer instead.'
		);
	}

	return (
		`${base} HTTPS requires an SSL certificate on the printer — generate a self-signed certificate ` +
		`in the printer's web configuration, then visit https://${hostname} in your browser and accept ` +
		`the certificate warning. If the printer only supports HTTP, set the port to ${plainHttpPort} instead.`
	);
}
