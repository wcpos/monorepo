import * as React from 'react';

import { requestStateManager } from '@wcpos/hooks/use-http-client';
import { isExpectedPreflightBlock } from '@wcpos/hooks/use-http-client/is-expected-preflight-block';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';

import { PaymentGatewayContract } from './payment-gateway-contract';
import { useRestHttpClient } from './use-rest-http-client';
import { storeRequestFailureCode } from '../../../utils/store-request-failure-code';

const gatewaysLogger = getLogger(['wcpos', 'pos', 'checkout', 'gateways']);

/**
 * An auth flow cancels in-flight requests on purpose (CanceledError) — a token refresh
 * as often as a full re-login, and a refresh latches no auth hold, so no "auth
 * restored" signal is guaranteed to follow. Every cancel therefore schedules a retry
 * after this delay: long enough for a refresh to land, short enough that checkout's
 * pending state is barely noticed.
 */
const RETRY_AFTER_CANCEL_MS = 1_000;
function isCancellation(error: unknown): boolean {
	return (
		(error as { code?: unknown } | null)?.code === 'ERR_CANCELED' ||
		(error as { name?: unknown } | null)?.name === 'CanceledError'
	);
}

export function usePaymentGateways(selectedGatewayId?: string | null) {
	const http = useRestHttpClient();
	const [gateways, setGateways] = React.useState<PaymentGatewayContract[]>([]);
	// True until a load SETTLES (success, or a failure that is not a cancellation): a
	// cancelled load is not a result, so checkout must not fall back to the legacy
	// webview, nor the refund form default to cash, while it is retried.
	const [loading, setLoading] = React.useState(true);
	const [error, setError] = React.useState<string | null>(null);
	const gatewaysRef = React.useRef<PaymentGatewayContract[]>([]);
	const awaitingRetryRef = React.useRef(false);
	const retryTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
	const mountedRef = React.useRef(true);
	const fetchGatewaysRef = React.useRef<(() => Promise<PaymentGatewayContract[]>) | null>(null);

	React.useEffect(() => {
		gatewaysRef.current = gateways;
	}, [gateways]);

	const fetchGateways = React.useCallback(async (): Promise<PaymentGatewayContract[]> => {
		if (retryTimerRef.current) {
			clearTimeout(retryTimerRef.current);
			retryTimerRef.current = null;
		}
		awaitingRetryRef.current = false;
		setLoading(true);
		setError(null);
		try {
			const response = await http.get('payment-gateways');
			const next = Array.isArray(response?.data) ? response.data : [];
			gatewaysRef.current = next;
			setGateways(next);
			setLoading(false);
			return next;
		} catch (err) {
			if (!mountedRef.current) return gatewaysRef.current;
			if (isCancellation(err)) {
				// Not a failure (no row) and not a result: stay pending and try again, for as
				// long as it takes — a sign-in can take minutes, and settling to an empty
				// catalogue would send checkout to the legacy webview and refunds to cash.
				awaitingRetryRef.current = true;
				retryTimerRef.current = setTimeout(() => {
					retryTimerRef.current = null;
					if (mountedRef.current && awaitingRetryRef.current) void fetchGatewaysRef.current?.();
				}, RETRY_AFTER_CANCEL_MS);
				return gatewaysRef.current;
			}
			// The one row for this failure (the HTTP transport row is forensic). The
			// checkout screen's inline error is the instruction, so no toast; offline is
			// forensic too, since nothing was attempted.
			const code = storeRequestFailureCode(err);
			gatewaysLogger[isExpectedPreflightBlock(err) ? 'debug' : 'warn'](
				'Payment gateways could not be loaded',
				{ code, context: { error: getErrorMessage(err) } }
			);
			setError(err instanceof Error ? err.message : 'payment_gateways_fetch_failed');
			setLoading(false);
			return gatewaysRef.current;
		}
	}, [http]);
	// Effect: keeps the delayed retry pointed at the current loader (not read during render).
	React.useEffect(() => {
		fetchGatewaysRef.current = fetchGateways;
	}, [fetchGateways]);

	// External store subscription: the auth hold clearing is the "auth completed" event;
	// a load waiting on a retry runs now instead of at the next tick.
	React.useEffect(
		() =>
			requestStateManager.onAuthFailed((failed) => {
				if (!failed && awaitingRetryRef.current) void fetchGateways();
			}),
		[fetchGateways]
	);

	// Mount-only lifecycle: retries must never fire into an unmounted hook.
	React.useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
			if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
		};
	}, []);

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
