import * as React from 'react';

import { requestStateManager } from '@wcpos/hooks/use-http-client';
import { isExpectedPreflightBlock } from '@wcpos/hooks/use-http-client/is-expected-preflight-block';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';

import { PaymentGatewayContract } from './payment-gateway-contract';
import { useRestHttpClient } from './use-rest-http-client';
import { storeRequestFailureCode } from '../../../utils/store-request-failure-code';

const gatewaysLogger = getLogger(['wcpos', 'pos', 'checkout', 'gateways']);

/**
 * A cancelled load with no auth hold latched (a refresh already in flight) is retried
 * once after this delay, so the catalog cannot wait forever for a signal that never
 * comes. One retry: a second cancel waits for the auth signal like any other.
 */
const UNLATCHED_CANCEL_RETRY_MS = 1_000;

export function usePaymentGateways(selectedGatewayId?: string | null) {
	const http = useRestHttpClient();
	const [gateways, setGateways] = React.useState<PaymentGatewayContract[]>([]);
	const [loading, setLoading] = React.useState(true);
	const [error, setError] = React.useState<string | null>(null);
	const gatewaysRef = React.useRef<PaymentGatewayContract[]>([]);
	// True while a load was cancelled by an auth flow: the catalog is NOT resolved yet,
	// so `loading` stays true (checkout must not fall back to the legacy webview, nor the
	// refund form to cash) until auth completes and the load runs again.
	const awaitingAuthRef = React.useRef(false);
	const unlatchedRetriedRef = React.useRef(false);
	const fetchGatewaysRef = React.useRef<(() => Promise<PaymentGatewayContract[]>) | null>(null);

	React.useEffect(() => {
		gatewaysRef.current = gateways;
	}, [gateways]);

	const fetchGateways = React.useCallback(async (): Promise<PaymentGatewayContract[]> => {
		setLoading(true);
		setError(null);
		awaitingAuthRef.current = false;
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
			if (cancelled) {
				// Not a failure — no row — and not a result: stay pending and load again
				// once the session is restored.
				awaitingAuthRef.current = true;
				if (!requestStateManager.isAuthFailed() && !unlatchedRetriedRef.current) {
					unlatchedRetriedRef.current = true;
					setTimeout(() => {
						if (awaitingAuthRef.current) void fetchGatewaysRef.current?.();
					}, UNLATCHED_CANCEL_RETRY_MS);
				}
				return gatewaysRef.current;
			}
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
			if (!awaitingAuthRef.current) setLoading(false);
		}
	}, [http]);
	// Effect: keeps the delayed retry pointed at the current loader (not read during render).
	React.useEffect(() => {
		fetchGatewaysRef.current = fetchGateways;
	}, [fetchGateways]);

	// External store subscription: the auth hold clearing is the "auth completed" event
	// for a load that an auth flow cancelled.
	React.useEffect(
		() =>
			requestStateManager.onAuthFailed((failed) => {
				if (!failed && awaitingAuthRef.current) void fetchGateways();
			}),
		[fetchGateways]
	);

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
