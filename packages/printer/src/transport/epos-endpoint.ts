import { buildEposXml, parseEposResponse } from './epson-epos-protocol';

type EposPostFn = (
	port: number,
	path: string,
	xml: string,
	timeoutMs: number
) => Promise<{ status: number; body: string }>;

const EPOS_PATH = '/cgi-bin/epos/service.cgi?devid=local_printer&timeout=4000';
const PROBE_TIMEOUT_MS = 4_000;

export async function probeEposEndpoint(host: string, postFn: EposPostFn): Promise<number | null> {
	for (const port of [443, 8043, 80, 8008]) {
		try {
			const response = await postFn(port, EPOS_PATH, buildEposXml(''), PROBE_TIMEOUT_MS);
			if (response.status < 200 || response.status >= 300) continue;
			parseEposResponse(response.body);
			return port;
		} catch {
			// A transport error or non-ePOS response only disqualifies this port.
		}
	}
	return null;
}
