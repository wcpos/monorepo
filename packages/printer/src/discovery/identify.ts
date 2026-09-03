// Doctrine: packages/printer/README.md — identify classifies what a printer ANSWERS; a label must
// never come from the name alone, and "no response" is an outcome of its own. Lessons log lives there.
import { probeEposEndpoint } from '../transport/epos-endpoint';
import { parseEposResponse } from '../transport/epson-epos-protocol';
import { type DiscoveredPrinter } from '../types';
import { identifyModel } from './identify-models';
type Vendor = 'epson' | 'star' | 'generic' | null;
type TcpState = 'open' | 'closed' | 'filtered' | 'error';
type PortProtocol =
	'epos-print' | 'webprnt' | 'raw' | 'raw-tls' | 'ipp' | 'http' | 'unknown' | null;
export interface PrinterIdentity {
	vendor: Vendor;
	model?: string;
	lane: {
		port: number;
		protocol: 'epos-print' | 'webprnt' | 'raw' | 'raw-tls';
		encrypted: boolean;
	} | null;
	ports: { port: number; state: TcpState; protocol: PortProtocol; latencyMs?: number }[];
	securePrinting?: boolean;
	columns?: number;
	notReceiptPrinter?: boolean;
}
export type LaneProtocol = NonNullable<PrinterIdentity['lane']>['protocol'];

export interface IdentifyProbes {
	/**
	 * Lane protocols this platform's network print path can actually use. `identity.lane` always
	 * reports the best lane the printer offers; its port is copied onto the profile only when the
	 * platform can print on it (Electron sends Star raw, native sends everything raw). Omitted =
	 * every lane is printable.
	 */
	printableLanes?: ReadonlySet<LaneProtocol>;
	connectTcp?: (host: string, port: number, timeoutMs: number) => Promise<TcpState>;
	postEpos: (
		host: string,
		port: number,
		path: string,
		xml: string,
		timeoutMs: number
	) => Promise<{ status: number; body: string }>;
	fetchStar: (host: string) => Promise<{ port: number; protocol: 'http' | 'https' } | null>;
}
const EXPIRED = Symbol('expired');

export function canPrintLane(protocol: LaneProtocol, probes: IdentifyProbes): boolean {
	return probes.printableLanes?.has(protocol) ?? true;
}

function eposFailureState(error: unknown): TcpState {
	if (error === EXPIRED) return 'filtered';
	const message = error instanceof Error ? `${error.name} ${error.message}` : String(error);
	if (/abort|timed?\s*out/i.test(message)) return 'filtered';
	if (/refused|closed/i.test(message)) return 'closed';
	return 'error';
}

async function beforeDeadline<T>(deadline: number, task: () => Promise<T>) {
	const remaining = deadline - Date.now();
	if (remaining <= 0) return EXPIRED;
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			task(),
			new Promise<typeof EXPIRED>((resolve) => {
				timer = setTimeout(() => resolve(EXPIRED), remaining);
			}),
		]);
	} finally {
		if (timer !== undefined) clearTimeout(timer);
	}
}
export async function identifyPrinter(
	host: string,
	hints: { name?: string },
	probes: IdentifyProbes,
	opts: { timeoutMs?: number } = {}
): Promise<PrinterIdentity> {
	const deadline = Date.now() + (opts.timeoutMs ?? 4_000);
	const ports: PrinterIdentity['ports'] = [];
	const hintedVendor = vendorFromName(hints.name);
	let eposPort: number | null = null;
	let rawOpen = false;
	const tcp = async (port: number) => {
		if (!probes.connectTcp) return;
		try {
			const state = await beforeDeadline(deadline, () =>
				probes.connectTcp!(host, port, Math.max(0, deadline - Date.now()))
			);
			if (state === EXPIRED) return;
			ports.push({
				port,
				state,
				protocol: port === 631 ? 'ipp' : port === 9143 ? 'raw-tls' : 'raw',
			});
			if (port === 9100) rawOpen = state === 'open';
		} catch {
			ports.push({ port, state: 'error', protocol: null });
		}
	};
	const epsonTask = (async () => {
		let request: { path: string; xml: string } | undefined;
		eposPort = await probeEposEndpoint(host, async (port, path, xml, timeoutMs) => {
			request = { path, xml };
			try {
				const response = await beforeDeadline(deadline, () =>
					probes.postEpos(host, port, path, xml, Math.min(timeoutMs, deadline - Date.now()))
				);
				if (response === EXPIRED) throw EXPIRED;
				return response;
			} catch (error) {
				ports.push({ port, state: eposFailureState(error), protocol: 'epos-print' });
				throw error;
			}
		});
		if (eposPort === null) return;
		ports.push({ port: eposPort, state: 'open', protocol: 'epos-print' });
		if (eposPort === 443 && request) {
			try {
				const response = await beforeDeadline(deadline, () =>
					probes.postEpos(host, 80, request!.path, request!.xml, deadline - Date.now())
				);
				if (response === EXPIRED) throw EXPIRED;
				if (response.status >= 200 && response.status < 300) {
					parseEposResponse(response.body);
					ports.push({ port: 80, state: 'open', protocol: 'epos-print' });
				}
			} catch (error) {
				ports.push({ port: 80, state: eposFailureState(error), protocol: 'epos-print' });
			}
		}
	})();
	const starTask = (async () => {
		try {
			const result = await beforeDeadline(deadline, () => probes.fetchStar(host));
			if (result === EXPIRED || !result) return null;
			ports.push({ port: result.port, state: 'open', protocol: 'webprnt' });
			return result;
		} catch {
			return null;
		}
	})();
	// HTTP lanes first, raw ports only when nothing answered. Any bytes on raw 9100 — even a
	// 3-byte DLE EOT status request — are a "job" to a RED-era Epson with Secure Printing on,
	// which then quarantines every lane (ePOS included) for ~4 minutes (wcpos/monorepo#1597).
	// So a printer that answers ePOS or WebPRNT is never touched on 9100, and neither is one
	// that already looks like an Epson from its name: an Epson whose ePOS-Print is off or busy
	// (443 answering 503 was seen live, wcpos/roadmap#136) still quarantines on a raw touch.
	// 9143 (TLS raw) is not probed at all until there is a TLS raw lane to use it.
	const [, star] = await Promise.all([epsonTask, starTask]);
	if (!eposPort && !star && hintedVendor !== 'epson') {
		await Promise.all([tcp(9100), tcp(631)]);
	}
	const lane: PrinterIdentity['lane'] = eposPort
		? {
				port: eposPort,
				protocol: 'epos-print',
				encrypted: eposPort === 443 || eposPort === 8043,
			}
		: star
			? { port: star.port, protocol: 'webprnt', encrypted: star.protocol === 'https' }
			: rawOpen
				? { port: 9100, protocol: 'raw', encrypted: false }
				: null;
	const vendor: Vendor = eposPort
		? 'epson'
		: star
			? 'star'
			: rawOpen
				? (hintedVendor ?? 'generic')
				: hintedVendor;
	const ippOpen = ports.some((entry) => entry.port === 631 && entry.state === 'open');
	// Only raw/IPP results say whether a *named* host is a receipt printer at all; refused ePOS
	// candidates on an Epson whose ePOS-Print is off prove nothing (its raw ports were skipped).
	const nonEposPorts = ports.filter((entry) => entry.protocol !== 'epos-print');
	const namedClosed =
		!!hints.name &&
		nonEposPorts.length > 0 &&
		nonEposPorts.every(({ state }) => state === 'closed' || state === 'error');
	return {
		vendor,
		...identifyModel(hints.name),
		lane,
		ports,
		...(eposPort
			? {
					securePrinting:
						eposPort === 443 &&
						!ports.some(
							(entry) =>
								entry.port === 80 && entry.protocol === 'epos-print' && entry.state === 'open'
						),
				}
			: {}),
		...(lane ? {} : { notReceiptPrinter: ippOpen || namedClosed }),
	};
}
function vendorFromName(name?: string): Vendor {
	if (/epson/i.test(name ?? '')) return 'epson';
	if (/star/i.test(name ?? '')) return 'star';
	return null;
}
export async function identifyDiscoveredPrinters(
	printers: DiscoveredPrinter[],
	probes: IdentifyProbes
): Promise<DiscoveredPrinter[]> {
	const identified = [...printers];
	const pending = printers
		.map((printer, index) => ({ printer, index }))
		.filter(({ printer }) => printer.connectionType === 'network' && !printer.identity);
	for (let offset = 0; offset < pending.length; offset += 4) {
		await Promise.all(
			pending.slice(offset, offset + 4).map(async ({ printer, index }) => {
				const identity = await identifyPrinter(printer.address, { name: printer.name }, probes);
				identified[index] = {
					...printer,
					identity,
					...(identity.lane && canPrintLane(identity.lane.protocol, probes)
						? { port: identity.lane.port, vendor: identity.vendor ?? printer.vendor }
						: identity.vendor
							? { vendor: identity.vendor }
							: {}),
				};
			})
		);
	}
	return identified;
}
