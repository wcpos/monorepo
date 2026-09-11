import * as React from 'react';

import { getErrorMessage } from '@wcpos/utils/logger';

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

export function useRegisterHealth() {
	const http = useRestHttpClient();
	const [data, setData] = React.useState<RegisterHealth | null>(null);
	const [loading, setLoading] = React.useState(true);
	const [error, setError] = React.useState<string | null>(null);
	const refresh = React.useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const response = await http.get('registers/health');
			setData(response.data as RegisterHealth);
		} catch (error) {
			setError(getErrorMessage(error));
		} finally {
			setLoading(false);
		}
	}, [http]);
	const initialRefresh = React.useRef(refresh);
	// Fetch the external server on mount; subsequent fetches are explicit refreshes.
	React.useEffect(() => {
		void initialRefresh.current();
	}, []);
	return { data, loading, error, refresh };
}
