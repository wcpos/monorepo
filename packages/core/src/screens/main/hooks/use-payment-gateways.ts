import * as React from 'react';

import { PaymentGatewayContract } from './payment-gateway-contract';
import { useRestHttpClient } from './use-rest-http-client';

export function usePaymentGateways(selectedGatewayId?: string | null) {
	const http = useRestHttpClient();
	const [gateways, setGateways] = React.useState<PaymentGatewayContract[]>([]);
	const [loading, setLoading] = React.useState(true);
	const [error, setError] = React.useState<string | null>(null);

	const fetchGateways = React.useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const response = await http.get('payment-gateways');
			const next = Array.isArray(response?.data) ? response.data : [];
			setGateways(next);
			return next;
		} catch (err) {
			setGateways([]);
			setError(err instanceof Error ? err.message : 'payment_gateways_fetch_failed');
			return [];
		} finally {
			setLoading(false);
		}
	}, [http]);

	React.useEffect(() => {
		void fetchGateways();
	}, [fetchGateways]);

	const gateway = React.useMemo(
		() => gateways.find((item) => item.id === selectedGatewayId) ?? null,
		[gateways, selectedGatewayId]
	);

	return { gateways, gateway, loading, error, refetch: fetchGateways };
}
