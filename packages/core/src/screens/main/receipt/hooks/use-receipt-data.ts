import * as React from 'react';

import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { useRestHttpClient } from '../../hooks/use-rest-http-client';

const logger = getLogger(['wcpos', 'receipt']);

export type ReceiptMode = 'fiscal' | 'live';
export type SubmissionStatus = 'pending' | 'sent' | 'failed';

/**
 * Matches the response from GET /wcpos/v2/receipts/{order_id}
 */
interface ReceiptApiResponse {
	order_id: number;
	mode: ReceiptMode;
	has_snapshot: boolean;
	submission_status: SubmissionStatus;
	data: Record<string, unknown>;
}

interface UseReceiptDataResult {
	data: Record<string, unknown> | null;
	mode: ReceiptMode;
	hasSnapshot: boolean;
	submissionStatus: SubmissionStatus | null;
	isLoading: boolean;
	hasResponded: boolean;
	error: Error | null;
	refetch: () => void;
}

interface UseReceiptDataOptions {
	orderId: number | undefined;
	mode?: ReceiptMode;
}

type ReceiptDataState = Omit<UseReceiptDataResult, 'refetch'> & {
	orderId: number | undefined;
};

/**
 * Fetches receipt data from the receipts REST endpoint.
 *
 * Supports fiscal/live mode selection — fiscal returns the immutable snapshot,
 * live returns current order data. If fiscal is requested but no snapshot exists,
 * the API returns a 404.
 */
export function useReceiptData({
	orderId,
	mode = 'live',
}: UseReceiptDataOptions): UseReceiptDataResult {
	const http = useRestHttpClient();
	const [fetchKey, setFetchKey] = React.useState(0);
	const [state, setState] = React.useState<ReceiptDataState>({
		orderId,
		data: null,
		mode,
		hasSnapshot: false,
		submissionStatus: null,
		isLoading: false,
		hasResponded: false,
		error: null,
	});

	const refetch = React.useCallback(() => {
		setFetchKey((k) => k + 1);
	}, []);

	React.useEffect(() => {
		if (!orderId) {
			// No order: nothing to fetch. The empty result is derived below, so no
			// setState is needed here.
			return;
		}

		let cancelled = false;

		async function fetchReceipt() {
			setState({
				orderId,
				data: null,
				mode,
				hasSnapshot: false,
				submissionStatus: null,
				isLoading: true,
				hasResponded: false,
				error: null,
			});

			try {
				const response = await http.get(`/receipts/${orderId}`, {
					params: { mode },
				});

				if (cancelled) return;

				const res = response?.data as ReceiptApiResponse;

				setState({
					orderId,
					data: res.data ?? null,
					mode: res.mode ?? mode,
					hasSnapshot: res.has_snapshot ?? false,
					submissionStatus: res.submission_status ?? null,
					isLoading: false,
					hasResponded: true,
					error: null,
				});
			} catch (err) {
				if (cancelled) return;

				const error = err instanceof Error ? err : new Error(String(err));
				logger.error('Failed to fetch receipt data', {
					code: ERROR_CODES.PRINT_UNEXPECTED,
					context: { orderId, mode, error: error.message },
				});

				setState((prev) => ({
					...prev,
					orderId,
					isLoading: false,
					hasResponded: true,
					error,
				}));
			}
		}

		void fetchReceipt();

		return () => {
			cancelled = true;
		};
	}, [http, orderId, mode, fetchKey]);

	// When there's no order the result is the empty state regardless of any
	// previously-fetched data (derived rather than reset via setState).
	if (!orderId || state.orderId !== orderId) {
		return {
			data: null,
			mode,
			hasSnapshot: false,
			submissionStatus: null,
			isLoading: false,
			hasResponded: false,
			error: null,
			refetch,
		};
	}

	const { orderId: _requestOrderId, ...currentState } = state;
	return { ...currentState, refetch };
}
