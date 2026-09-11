import * as React from 'react';

import { getErrorMessage } from '@wcpos/utils/logger';

import { useStoreSession } from '../../../contexts/app-state';
import { useRestHttpClient } from '../hooks/use-rest-http-client';

export type RegisterHealth = {
	window_days: number;
	skew_seconds: number;
	registers: {
		id: string;
		name: string;
		orders: number;
		first_counter: number | null;
		last_counter: number | null;
		gaps: { after: number; before: number; missing: number }[];
		duplicates: { counter: number; order_ids: number[]; order_numbers: string[] }[];
		skew: {
			order_id: number;
			order_number: string;
			sale_time: string;
			received_gmt: string;
			skew_seconds: number;
			direction: 'ahead' | 'behind';
		}[];
	}[];
	unregistered: {
		register_id: string;
		orders: number;
		order_ids: number[];
		order_numbers: string[];
	}[];
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
