import { buildEposXml, parseEposResponse } from './epson-epos-protocol';
import { printerLogger } from '../logger';

type EposPostFn = (
	port: number,
	path: string,
	xml: string,
	timeoutMs: number
) => Promise<{ status: number; body: string }>;

const EPOS_PATH = '/cgi-bin/epos/service.cgi?devid=local_printer&timeout=4000';
const PROBE_TIMEOUT_MS = 4_000;
export const EPOS_HTTP_PORTS: readonly number[] = [443, 8043, 80, 8008];

export async function probeEposEndpoint(host: string, postFn: EposPostFn): Promise<number | null> {
	for (const port of EPOS_HTTP_PORTS) {
		const startedAt = Date.now();
		try {
			const response = await postFn(port, EPOS_PATH, buildEposXml(''), PROBE_TIMEOUT_MS);
			if (response.status < 200 || response.status >= 300) {
				printerLogger.debug('ePOS port probe', {
					context: { host, port, outcome: response.status, elapsedMs: Date.now() - startedAt },
				});
				continue;
			}
			parseEposResponse(response.body);
			printerLogger.debug('ePOS port probe', {
				context: { host, port, outcome: 'ok', elapsedMs: Date.now() - startedAt },
			});
			printerLogger.info('ePOS port selected', { context: { host, port } });
			return port;
		} catch (error) {
			printerLogger.debug('ePOS port probe', {
				context: {
					host,
					port,
					outcome: error instanceof Error ? error.name : 'UnknownError',
					// First line of the message only: enough to tell refused / timeout / certificate apart.
					cause:
						error instanceof Error ? error.message.split('\n')[0]?.slice(0, 160) : String(error),
					elapsedMs: Date.now() - startedAt,
				},
			});
			// A transport error or non-ePOS response only disqualifies this port.
		}
	}
	printerLogger.info('No ePOS port', { context: { host } });
	return null;
}
