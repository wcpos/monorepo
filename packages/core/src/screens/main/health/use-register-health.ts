import * as React from 'react';

import { getErrorMessage } from '@wcpos/utils/logger';

import { useStoreSession } from '../../../contexts/app-state';
import { useRestHttpClient } from '../hooks/use-rest-http-client';

/**
 * `GET wcpos/v2/registers/health` (`Provenance_Health` + `Closure_Store::health()`).
 * `till` is the device id; the server falls back to the register id for a sale without one.
 * Order ids per finding are capped server-side, so their length is a sample, not a total.
 */
export type RegisterHealth = {
	window_days: number;
	skew_seconds: number;
	truncated: boolean;
	registers: {
		id: string;
		name: string;
		orders: number;
		first_counter: number | null;
		last_counter: number | null;
		gaps: { till: string; after: number; before: number; missing: number }[];
		duplicates: {
			till: string;
			counter: number;
			/** The true count of sales on this counter; absent on an older plugin. */
			orders?: number;
			order_ids: number[];
			/** `''` for a deleted order. */
			order_numbers: string[];
		}[];
		/** Sample, capped per direction; `skew_counts` carries the totals when present. */
		skew: {
			order_id: number;
			order_number: string;
			sale_time: string;
			received_gmt: string;
			skew_seconds: number;
			direction: 'ahead' | 'behind';
		}[];
		/** Absent on an older plugin, which caps `skew` as a whole. */
		skew_counts?: { ahead: number; behind: number };
		/** Merged in from the closure store; absent on a plugin that predates it. */
		closure_gaps?: { after: number; before: number; missing: number }[];
		closure_conflicts?: { id: string; number: number; printed_number: number }[];
		closure_total_mismatches?: { id: string; number: number; findings: unknown }[];
	}[];
	unregistered: {
		register_id: string;
		orders: number;
		order_ids: number[];
		order_numbers: string[];
	}[];
	unknown_sessions: { session_id: string; orders: number; order_ids: number[] }[];
};

type State = { data: RegisterHealth | null; loading: boolean; error: string | null };

export function useRegisterHealth() {
	const http = useRestHttpClient();
	const [state, setState] = React.useState<State>({ data: null, loading: true, error: null });
	// The latest request wins: a response from a previous store's client is dropped.
	const token = React.useRef(0);
	const load = React.useCallback(
		async (reset: boolean) => {
			const mine = ++token.current;
			setState((prev) => ({ data: reset ? null : prev.data, loading: true, error: null }));
			try {
				const response = await http.get('registers/health');
				if (mine === token.current) {
					setState({ data: response.data as RegisterHealth, loading: false, error: null });
				}
			} catch (error) {
				if (mine === token.current) {
					setState((prev) => ({ data: prev.data, loading: false, error: getErrorMessage(error) }));
				}
			}
		},
		[http]
	);
	// The client object also changes with connectivity; only a real store switch clears
	// the findings. A same-store client change re-fetches but keeps what is loaded.
	const { site, store } = useStoreSession();
	const sessionKey = `${site.uuid}:${store.id}`;
	const previousKey = React.useRef(sessionKey);
	React.useEffect(() => {
		const switched = previousKey.current !== sessionKey;
		previousKey.current = sessionKey;
		void load(switched);
		return () => {
			token.current += 1;
		};
	}, [load, sessionKey]);
	const refresh = React.useCallback(() => load(false), [load]);
	return { ...state, refresh };
}
