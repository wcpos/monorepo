import * as React from 'react';

import { isExpectedPreflightBlock } from '@wcpos/hooks/use-http-client/is-expected-preflight-block';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';

import { PaymentGatewayContract } from './payment-gateway-contract';
import { useRestHttpClient } from './use-rest-http-client';
import { storeRequestFailureCode } from '../../../utils/store-request-failure-code';

const gatewaysLogger = getLogger(['wcpos', 'pos', 'checkout', 'gateways']);

export function usePaymentGateways(selectedGatewayId?: string | null) {
	const http = useRestHttpClient();
	const [gateways, setGateways] = React.useState<PaymentGatewayContract[]>([]);
	const [loading, setLoading] = React.useState(true);
	const [error, setError] = React.useState<string | null>(null);
	const gatewaysRef = React.useRef<PaymentGatewayContract[]>([]);

	React.useEffect(() => {
		gatewaysRef.current = gateways;
	}, [gateways]);

	const fetchGateways = React.useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const response = await http.get('payment-gateways');
			const next = Array.isArray(response?.data) ? response.data : [];
			gatewaysRef.current = next;
			setGateways(next);
			return next;
		} catch (err) {
			// An auth flow in progress cancels the request on purpose (CanceledError): not a
			// failure, and certainly not "store unreachable".
			const cancelled =
				(err as { code?: unknown } | null)?.code === 'ERR_CANCELED' ||
				(err as { name?: unknown } | null)?.name === 'CanceledError';
			if (cancelled) return gatewaysRef.current;
			// The one row for this failure (the HTTP transport row is forensic). The
			// checkout screen's inline error is the instruction, so no toast; offline is
			// forensic too, since nothing was attempted.
			gatewaysLogger[isExpectedPreflightBlock(err) ? 'debug' : 'warn'](
				'Payment gateways could not be loaded',
				{ code: storeRequestFailureCode(err), context: { error: getErrorMessage(err) } }
			);
			setError(err instanceof Error ? err.message : 'payment_gateways_fetch_failed');
			return gatewaysRef.current;
		} finally {
			setLoading(false);
		}
	}, [http]);

	React.useEffect(() => {
		// eslint-disable-next-line react-hooks/set-state-in-effect -- fetchGateways is the mount/reload event for this external resource; state updates happen in the async fetch lifecycle.
		void fetchGateways();
	}, [fetchGateways]);

	const gateway = React.useMemo(
		() => gateways.find((item) => item.id === selectedGatewayId) ?? null,
		[gateways, selectedGatewayId]
	);

	return { gateways, gateway, loading, error, refetch: fetchGateways };
}
