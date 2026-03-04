import * as React from 'react';

import { getLogger } from '@wcpos/utils/logger';

import { useRestHttpClient } from '../../hooks/use-rest-http-client';

const logger = getLogger(['wcpos', 'receipt']);

export type ReceiptMode = 'fiscal' | 'live';
export type SubmissionStatus = 'pending' | 'sent' | 'failed';

/**
 * Matches the response from GET /wcpos/v1/receipts/{order_id}
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
	error: Error | null;
	refetch: () => void;
}

interface UseReceiptDataOptions {
	orderId: number | undefined;
	mode?: ReceiptMode;
}

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
	const [state, setState] = React.useState<Omit<UseReceiptDataResult, 'refetch'>>({
		data: null,
		mode,
		hasSnapshot: false,
		submissionStatus: null,
		isLoading: false,
		error: null,
	});

	const refetch = React.useCallback(() => {
		setFetchKey((k) => k + 1);
	}, []);

	React.useEffect(() => {
		if (!orderId) {
			setState({
				data: null,
				mode,
				hasSnapshot: false,
				submissionStatus: null,
				isLoading: false,
				error: null,
			});
			return;
		}

		let cancelled = false;

		async function fetchReceipt() {
			setState((prev) => ({ ...prev, isLoading: true, error: null }));

			try {
				const response = await http.get(`/receipts/${orderId}`, {
					params: { mode },
				});

				if (cancelled) return;

				const res = response?.data as ReceiptApiResponse;

				setState({
					data: res.data ?? null,
					mode: res.mode ?? mode,
					hasSnapshot: res.has_snapshot ?? false,
					submissionStatus: res.submission_status ?? null,
					isLoading: false,
					error: null,
				});
			} catch (err) {
				if (cancelled) return;

				const error = err instanceof Error ? err : new Error(String(err));
				logger.error('Failed to fetch receipt data', {
					saveToDb: true,
					context: { orderId, mode, error: error.message },
				});

				setState((prev) => ({
					...prev,
					isLoading: false,
					error,
				}));
			}
		}

		fetchReceipt();

		return () => {
			cancelled = true;
		};
	}, [http, orderId, mode, fetchKey]);

	return { ...state, refetch };
}
