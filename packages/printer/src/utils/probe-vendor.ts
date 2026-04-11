/**
 * Probe a network host to auto-detect the printer vendor.
 *
 * Sends lightweight HTTP requests to the known Epson ePOS and Star
 * WebPRNT endpoints. Any response (even an error status) confirms the
 * vendor — only a network-level failure (timeout / refused) is treated
 * as "not this vendor".
 */
export async function probeVendor(host: string): Promise<'epson' | 'star' | null> {
	const timeout = 3_000;

	const probeEpson = async (): Promise<boolean> => {
		const controller = new AbortController();
		const id = setTimeout(() => controller.abort(), timeout);
		try {
			await fetch(`http://${host}:8008/cgi-bin/epos/service.cgi`, {
				method: 'GET',
				signal: controller.signal,
			});
			return true;
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
			await fetch(`https://${host}/StarWebPRNT/SendMessage`, {
				method: 'GET',
				signal: controller.signal,
			});
			return true;
		} catch {
			// Star printers on HTTPS with self-signed certs will fail in
			// browsers due to certificate rejection. Try HTTP as fallback.
			clearTimeout(id);

			const controller2 = new AbortController();
			const id2 = setTimeout(() => controller2.abort(), timeout);
			try {
				await fetch(`http://${host}/StarWebPRNT/SendMessage`, {
					method: 'GET',
					signal: controller2.signal,
				});
				return true;
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
