/**
 * Named printer scenarios — each one is a real printer we have had to reason about.
 *
 * A scenario says what each lane does, not what the app should conclude; the app's own
 * identify/print code decides that, which is the point of the bench.
 *
 * @typedef {'print' | 'hold' | 'closed'} RawMode
 *   `print` accepts and records a job, `hold` records it as `held` (nothing prints),
 *   `closed` resets the connection like a printer with raw printing switched off.
 * @typedef {{ epos?: 'ok' | 'off' | 'busy' | 'socketio', webprnt?: boolean, root?: boolean }} LaneConfig
 * @typedef {{ raw: RawMode, http?: LaneConfig | null, https?: LaneConfig | null,
 *   ipp?: boolean, delayMs?: number, mdns?: { name?: string, txt?: boolean, ipp?: boolean } }} Scenario
 */

/** How long the `slow` scenario sits on every response — just under the app's probe timeouts. */
export const SLOW_DELAY_MS = 2500;

const EPOS_AND_WEBPRNT = { epos: 'ok', webprnt: true };

/** @type {Record<string, Scenario>} */
export const SCENARIOS = {
	// A generic LAN receipt printer with both web endpoints — the package's original behaviour.
	default: { raw: 'print', http: EPOS_AND_WEBPRNT, mdns: { name: 'Virtual WCPOS Printer' } },

	// Epson TM-m30III with Secure Printing ON: ePOS is TLS-only and raw 9100 silently quarantines.
	'secure-printing': {
		raw: 'hold',
		http: { epos: 'off' },
		https: { epos: 'ok' },
		mdns: { name: 'EPSON TM-m30III' },
	},

	// An Epson holding jobs (cover open, out of paper, busy): the endpoint answers, the job gets 503.
	'held-503': { raw: 'hold', http: { epos: 'busy' }, mdns: { name: 'EPSON TM-T88VII' } },

	// A printer with ePOS-Print switched off in its network settings; raw 9100 still prints.
	'epos-off': { raw: 'print', http: { epos: 'off' }, mdns: { name: 'Receipt Printer' } },

	// A Star TSP with WebPRNT enabled on plain HTTP and no ePOS at all.
	'star-only': {
		raw: 'print',
		http: { epos: 'off', webprnt: true },
		mdns: { name: 'Star TSP143' },
	},

	// A LAN Star without WebPRNT — StarPRNT over raw 9100 is the only lane.
	'starprnt-raw-only': { raw: 'print', http: null, mdns: { name: 'Star TSP100' } },

	// An Epson ePOS-Device / socket.io box: answers on the ePOS path but is not a printer.
	'epos-device': { raw: 'print', https: { epos: 'socketio' }, mdns: { name: 'TM-DT Box' } },

	// A printer advertising an instance name only, with no model in its mDNS TXT record.
	'no-name': { raw: 'print', http: EPOS_AND_WEBPRNT, mdns: { name: '', txt: false } },

	// A tired printer on a busy AP: every answer arrives just before the probe gives up.
	slow: {
		raw: 'print',
		http: EPOS_AND_WEBPRNT,
		delayMs: SLOW_DELAY_MS,
		mdns: { name: 'Slow Printer' },
	},

	// An HP OfficeJet: IPP on 631 and a web UI, no receipt endpoints, raw 9100 refused.
	'office-printer': {
		raw: 'closed',
		ipp: true,
		http: { epos: 'off', root: true },
		mdns: { name: 'HP OfficeJet Pro 9015', ipp: true },
	},
};

/** Resolve a scenario name (or an inline scenario object) to a scenario. */
export function getScenario(scenario = 'default') {
	if (scenario && typeof scenario === 'object') return scenario;
	const found = SCENARIOS[scenario];
	if (!found) {
		throw new Error(`Unknown scenario "${scenario}". Known: ${Object.keys(SCENARIOS).join(', ')}`);
	}
	return found;
}

/** The legacy `VP_VENDOR` modes expressed as a scenario, so the CLI keeps working unchanged. */
export function vendorScenario(vendor = 'both') {
	return {
		raw: 'print',
		http: { epos: vendor === 'star' ? 'off' : 'ok', webprnt: vendor !== 'epson' },
	};
}
