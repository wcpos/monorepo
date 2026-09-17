import * as React from 'react';

import { isExpectedPreflightBlock } from '@wcpos/hooks/use-http-client/is-expected-preflight-block';
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

export interface ClosurePrintMarker {
	print_count: number;
	last_printed_at_gmt: string;
}

interface UseReceiptDataResult {
	commitPrint: () => Promise<ClosurePrintMarker | undefined>;
	data: Record<string, unknown> | null;
	mode: ReceiptMode;
	hasSnapshot: boolean;
	submissionStatus: SubmissionStatus | null;
	isLoading: boolean;
	hasResponded: boolean;
	error: Error | null;
	refetch: () => void;
	fetchForPrint: () => Promise<Record<string, unknown> | null>;
}

interface UseReceiptDataOptions {
	previewEnabled?: boolean;
	nextLocalCount?: () => Promise<number>;
	orderId: number | undefined;
	mode?: ReceiptMode;
	intent?: 'print';
	document?: string;
	isReprint?: boolean;
}

type ReceiptDataState = Omit<UseReceiptDataResult, 'refetch' | 'fetchForPrint' | 'commitPrint'> & {
	orderId: number | undefined;
	document?: string;
};

/**
 * Fetches receipt data from the receipts REST endpoint.
 *
 * Supports fiscal/live mode selection — fiscal returns the immutable snapshot,
 * live returns current order data. If fiscal is requested but no snapshot exists,
 * the API returns a 404.
 */
export function useReceiptData({
	nextLocalCount,
	previewEnabled = true,
	orderId,
	mode: requestedMode = 'live',
	intent,
	isReprint = false,
	document,
}: UseReceiptDataOptions): UseReceiptDataResult {
	const http = useRestHttpClient();
	const mode = document ? 'fiscal' : requestedMode;
	const fetchData = React.useCallback(
		async (requestIntent = intent) => {
			const response = await http.get(`/receipts/${orderId ?? 0}`, {
				params: {
					mode,
					...(document ? { document } : {}),
					...(requestIntent && !document?.startsWith('closure:') ? { intent: requestIntent } : {}),
				},
			});
			return response?.data as ReceiptApiResponse;
		},
		[http, orderId, mode, intent, document]
	);
	const fetchForPrint = React.useCallback(async () => {
		if (!orderId && !document) return null;
		if (document?.startsWith('closure:')) {
			const data = (await fetchData()).data;
			const marker = {
				print_count: Math.max(
					Number((data.closure as { print_count?: number })?.print_count ?? 0) + 1,
					(await nextLocalCount?.()) ?? 0
				),
				last_printed_at_gmt: new Date().toISOString(),
			};
			return {
				...data,
				closure: {
					...(data.closure as object),
					print_count: marker.print_count,
					last_printed_at_gmt: marker.last_printed_at_gmt,
				},
				fiscal: {
					...(data.fiscal as object),
					is_reprint: isReprint || marker.print_count > 1,
					reprint_count: Math.max(0, marker.print_count - 1),
				},
			};
		}
		return (await fetchData(document?.startsWith('xreport:') ? undefined : 'print')).data ?? null;
	}, [orderId, document, fetchData, isReprint, nextLocalCount]);
	const commitPrint = React.useCallback(async () => {
		if (!document?.startsWith('closure:')) return;
		const response = await http.post(`closures/${document.slice(8)}/print`, {});
		return response.data as ClosurePrintMarker;
	}, [document, http]);
	const [fetchKey, setFetchKey] = React.useState(0);
	const [state, setState] = React.useState<ReceiptDataState>({
		orderId,
		document,
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
		if (!previewEnabled || (!orderId && !document)) {
			// Hidden cards fetch only through fetchForPrint; previews need an order or document.
			return;
		}

		let cancelled = false;

		async function fetchReceipt() {
			setState({
				orderId,
				document,
				data: null,
				mode,
				hasSnapshot: false,
				submissionStatus: null,
				isLoading: true,
				hasResponded: false,
				error: null,
			});

			try {
				const res = await fetchData();

				if (cancelled) return;

				setState({
					orderId,
					document,
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
				const logLevel = isExpectedPreflightBlock(err) ? 'warn' : 'error';
				logger[logLevel]('Failed to fetch receipt data', {
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
	}, [fetchData, orderId, mode, fetchKey, document, previewEnabled]);

	// When there's no order the result is the empty state regardless of any
	// previously-fetched data (derived rather than reset via setState).
	if ((!orderId && !document) || state.orderId !== orderId || state.document !== document) {
		return {
			data: null,
			mode,
			hasSnapshot: false,
			submissionStatus: null,
			isLoading: false,
			hasResponded: false,
			error: null,
			refetch,
			fetchForPrint,
			commitPrint,
		};
	}

	const { orderId: _requestOrderId, document: _requestDocument, ...currentState } = state;
	return { ...currentState, refetch, fetchForPrint, commitPrint };
}
