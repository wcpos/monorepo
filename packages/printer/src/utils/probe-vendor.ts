/**
 * Probe a network host to auto-detect the printer vendor.
 *
 * Sends lightweight HTTP requests to the known Epson ePOS and Star
 * WebPRNT endpoints. Endpoint-level HTTP responses confirm the vendor,
 * including method rejections from printer endpoints that only accept POST.
 * Missing paths such as generic web-server 404s are not treated as matches.
 */
export async function probeVendor(host: string): Promise<'epson' | 'star' | null> {
	const timeout = 3_000;

	const probeEpson = async (): Promise<boolean> => {
		const controller = new AbortController();
		const id = setTimeout(() => controller.abort(), timeout);
		try {
			const response = await fetch(`http://${host}:8008/cgi-bin/epos/service.cgi`, {
				method: 'GET',
				signal: controller.signal,
			});
			return isEndpointPresent(response);
		} catch {
			return false;
		} finally {
			clearTimeout(id);
		}
	};

	const probeStar = async (): Promise<boolean> => {
		const controller = new AbortController();
		const id = setTimeout(() => controller.abort(), timeout);
		try {
			const response = await fetch(`https://${host}/StarWebPRNT/SendMessage`, {
				method: 'GET',
				signal: controller.signal,
			});
			return isEndpointPresent(response);
		} catch {
			// Star printers on HTTPS with self-signed certs will fail in
			// browsers due to certificate rejection. Try HTTP as fallback.
			clearTimeout(id);

			const controller2 = new AbortController();
			const id2 = setTimeout(() => controller2.abort(), timeout);
			try {
				const response = await fetch(`http://${host}/StarWebPRNT/SendMessage`, {
					method: 'GET',
					signal: controller2.signal,
				});
				return isEndpointPresent(response);
			} catch {
				return false;
			} finally {
				clearTimeout(id2);
			}
		} finally {
			clearTimeout(id);
		}
	};

	const [epson, star] = await Promise.all([probeEpson(), probeStar()]);

	if (epson) return 'epson';
	if (star) return 'star';
	return null;
}

function isEndpointPresent(response: Response): boolean {
	return response.status !== 404 && response.status < 500;
}
