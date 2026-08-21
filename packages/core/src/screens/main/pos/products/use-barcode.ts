import * as React from 'react';

import { useSubscription } from 'observable-hooks';

import { isStorageWorkerFailure } from '@wcpos/database/plugins/wrapped-error-handler-storage';
import { type EngineRecord, useDocField, useQueryRuntime } from '@wcpos/query';
import { sanitizeVariationAttributesRead } from '@wcpos/query/collection-map';
import { type ScanEvent } from '@wcpos/scanner';
import { type BarcodeResolveFetcher, remoteIdOrNull, resolveScan, wooIdOf } from '@wcpos/sync-core';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES, type ErrorCode } from '@wcpos/utils/logger/generated/error-codes.generated';

import { useT } from '../../../../contexts/translations';
import { useUISettings } from '../../contexts/ui-settings';
import { useBarcodeDetection } from '../../hooks/barcodes';
import { useBarcodeSearch } from '../../hooks/barcodes/use-barcode-search';
import { useAddProduct } from '../hooks/use-add-product';
import { useAddVariation } from '../hooks/use-add-variation';
import { resolveStock } from '../../components/product/resolve-stock';
import { useScanFeedback } from './use-scan-feedback';

import type { ScanFeedbackHandle } from './use-scan-feedback';

const barcodeLogger = getLogger(['wcpos', 'barcode', 'pos']);
const BARCODE_LOOKUP_TIMEOUT_MS = 10_000;
const AMBIGUOUS_HYDRATION_LIMIT = 10;

function withBarcodeLookupDeadline(fetcher: BarcodeResolveFetcher): BarcodeResolveFetcher {
	return async (url, init) => {
		const controller = new AbortController();
		const callerSignal = init?.signal;
		let rejectCancellation: (error: Error) => void = () => undefined;
		const cancellation = new Promise<never>((_resolve, reject) => {
			rejectCancellation = reject;
		});
		const abortFromCaller = () => {
			controller.abort();
			rejectCancellation(new Error('barcode online lookup aborted'));
		};
		const timeout = setTimeout(() => {
			controller.abort();
			rejectCancellation(
				new Error(`barcode online lookup timed out after ${BARCODE_LOOKUP_TIMEOUT_MS}ms`)
			);
		}, BARCODE_LOOKUP_TIMEOUT_MS);

		if (callerSignal?.aborted) {
			abortFromCaller();
		} else {
			callerSignal?.addEventListener('abort', abortFromCaller, { once: true });
		}

		try {
			return await Promise.race([
				fetcher(url, { ...init, signal: controller.signal }),
				cancellation,
			]);
		} finally {
			clearTimeout(timeout);
			callerSignal?.removeEventListener('abort', abortFromCaller);
		}
	};
}

function isVariationDocument(
	document: EngineRecord<'products'> | EngineRecord<'variations'>
): document is EngineRecord<'variations'> {
	return document.collection.name === 'variations';
}

export const useBarcode = (setSearch: (search: string) => void, clearSearch: () => void) => {
	const { scanEvents$, onKeyPress } = useBarcodeDetection();
	const { barcodeSearch, findProductById } = useBarcodeSearch();
	const { addProduct } = useAddProduct();
	const { addVariation } = useAddVariation();
	const runtime = useQueryRuntime();
	const t = useT();
	const { uiSettings } = useUISettings('pos-products');
	const showOutOfStock = useDocField(uiSettings, (value) => value.showOutOfStock);
	const { begin } = useScanFeedback();
	// Rapid scans run concurrent async handlers; only the newest one may touch
	// the shared search-box state, so a slow older scan can't clobber it.
	const scanTicketRef = React.useRef(0);

	/**
	 * #163: every local barcode lookup runs through the RxDB storage worker, so a
	 * lost worker rejects the scan from inside `barcodeSearch`/`findProductById`
	 * with nothing user-facing attached. Catching the whole scan here means the
	 * cashier gets terminal feedback for the one failure class that silently
	 * killed scanning for an hour in a live store, while every other failure keeps
	 * falling through to the subscription's last-resort logger.
	 */
	const handleScan = async (event: ScanEvent) => {
		const barcodeStr = event.code;
		const scan = begin();
		try {
			await runScan(event, scan);
		} catch (error) {
			if (!isStorageWorkerFailure(error)) {
				throw error;
			}
			scan.storageUnavailable(barcodeStr);
			barcodeLogger.error('Barcode scan failed because local storage is unavailable', {
				code: ERROR_CODES.LOCAL_DB_UNAVAILABLE,
				context: {
					barcode: barcodeStr,
					error: getErrorMessage(error),
				},
			});
		}
	};

	/**
	 *
	 */
	const runScan = async (event: ScanEvent, scan: ScanFeedbackHandle) => {
		const barcodeStr = event.code;
		const text1 = t('common.barcode_scanned', { barcode: barcodeStr });
		scanTicketRef.current += 1;
		const scanTicket = scanTicketRef.current;
		const guardedSetSearch = (value: string) => {
			if (scanTicketRef.current === scanTicket) setSearch(value);
		};
		const guardedClearSearch = () => {
			if (scanTicketRef.current === scanTicket) clearSearch();
		};
		let results = await barcodeSearch(barcodeStr);
		let onlineParentRequired = false;
		// The online lookup shows a persistent "Searching store…" toast; track it so a
		// later failure can replace it with terminal feedback instead of leaving it up.
		let searchingOnlineShown = false;

		// A scan that resolves to zero or many products is a cashier-workflow miss,
		// not a system failure — warn keeps the ledger's error lane for real faults
		// (and matches the registry severity of both codes).
		const showAmbiguousResults = (count: number) => {
			scan.ambiguous(count, barcodeStr);
			barcodeLogger.warn('Barcode scan matched multiple products', {
				code: ERROR_CODES.BARCODE_AMBIGUOUS,
				context: {
					barcode: barcodeStr,
					resultsCount: count,
				},
			});
			guardedSetSearch(barcodeStr);
		};

		const showNotFound = () => {
			scan.notFound(barcodeStr);
			barcodeLogger.warn('Barcode scan did not match a product', {
				code: ERROR_CODES.SEARCH_NO_RESULTS_REASON,
				context: {
					barcode: barcodeStr,
				},
			});
			guardedSetSearch(barcodeStr);
		};

		const showLookupError = (errorCode: ErrorCode, error?: string) => {
			scan.error(barcodeStr);
			barcodeLogger.error('Barcode lookup failed', {
				code: errorCode,
				context: {
					barcode: barcodeStr,
					...(error ? { error } : {}),
				},
			});
			guardedSetSearch(barcodeStr);
		};

		/**
		 * Hydration failures are reported as connection errors, but a lost storage
		 * worker is not a connection problem and needs the reload-the-app message —
		 * rethrow so the outer handler owns it. Note the `finally` blocks at these
		 * call sites still release their engine handles.
		 */
		const reportHydrationFailure = (error: unknown): never | void => {
			if (isStorageWorkerFailure(error)) {
				throw error;
			}
			showLookupError(ERROR_CODES.PRODUCT_UNEXPECTED, getErrorMessage(error));
		};

		if (results.length > 1) {
			showAmbiguousResults(results.length);
			return;
		}

		if (results.length === 0) {
			// The online fallback needs a healthy sync engine; during an outage tell
			// the cashier why scanning can't look the code up instead of timing out.
			const engineStatus = runtime.engine.status();
			if (engineStatus.connectivity === 'offline') {
				scan.unavailable(barcodeStr);
				barcodeLogger.warn('Barcode online lookup skipped because the sync engine is offline', {
					context: {
						barcode: barcodeStr,
						connectivity: engineStatus.connectivity,
						gatedBy: engineStatus.gatedBy,
					},
				});
				guardedSetSearch(barcodeStr);
				return;
			}

			const { fetcher, syncBaseUrl } = runtime.engine.hostTransport();
			const resolution = await resolveScan({
				code: barcodeStr,
				index: new Map(),
				syncBaseUrl,
				fetcher: withBarcodeLookupDeadline(fetcher),
				now: Date.now,
				onEvent: (event) => {
					if (event.type === 'searching-online') {
						searchingOnlineShown = true;
						scan.searchingOnline(barcodeStr);
						barcodeLogger.info(text1, {
							context: { barcode: barcodeStr },
						});
					}
				},
			});

			if (resolution.outcome === 'not-found') {
				showNotFound();
				return;
			}

			if (resolution.outcome === 'error') {
				showLookupError(ERROR_CODES.PRODUCT_UNEXPECTED, resolution.message);
				return;
			}

			if (resolution.outcome === 'online') {
				if (resolution.ambiguous.length > 0) {
					const candidates = [resolution.match, ...resolution.ambiguous];
					const hydrationCandidates = candidates.slice(0, AMBIGUOUS_HYDRATION_LIMIT);
					if (candidates.length > AMBIGUOUS_HYDRATION_LIMIT) {
						barcodeLogger.debug(
							`Barcode ambiguity hydration capped at ${AMBIGUOUS_HYDRATION_LIMIT} candidates`,
							{
								context: {
									barcode: barcodeStr,
									candidatesCount: candidates.length,
									hydratedCandidatesCount: hydrationCandidates.length,
								},
							}
						);
					}

					const productIds = [
						...new Set(
							hydrationCandidates
								.filter((candidate) => candidate.type === 'product')
								.map((candidate) => candidate.id)
						),
					];
					const variationIds = [
						...new Set(
							hydrationCandidates
								.filter((candidate) => candidate.type === 'variation')
								.map((candidate) => candidate.id)
						),
					];
					const handles = [];
					try {
						if (productIds.length > 0) {
							handles.push(
								runtime.engine.require({
									id: `barcode:${barcodeStr}:ambiguous:products`,
									collection: 'products',
									kind: 'targeted-records',
									remoteIds: productIds.map(remoteIdOrNull).filter((remoteId) => remoteId !== null),
									forceRefresh: true,
								})
							);
						}
						if (variationIds.length > 0) {
							handles.push(
								runtime.engine.require({
									id: `barcode:${barcodeStr}:ambiguous:variations`,
									collection: 'variations',
									kind: 'targeted-records',
									remoteIds: variationIds
										.map(remoteIdOrNull)
										.filter((remoteId) => remoteId !== null),
									forceRefresh: true,
								})
							);
						}
						await Promise.all(handles.map((handle) => handle.ready));
					} catch (error) {
						reportHydrationFailure(error);
						return;
					} finally {
						for (const handle of handles) {
							handle.release();
						}
					}

					results = await barcodeSearch(barcodeStr);
					if (results.length === 0) {
						showNotFound();
						return;
					}
					if (results.length > 1) {
						showAmbiguousResults(results.length);
						return;
					}
				}

				const [visibleMatch] = results;
				const match =
					resolution.ambiguous.length > 0
						? {
								id: visibleMatch.remoteId === null ? 0 : wooIdOf(visibleMatch.remoteId),
								type: isVariationDocument(visibleMatch) ? 'variation' : 'product',
								parent_id: isVariationDocument(visibleMatch)
									? visibleMatch.payload.parent_id
									: undefined,
							}
						: resolution.match;
				if (match.type === 'variation' && !match.parent_id) {
					showLookupError(
						ERROR_CODES.PRODUCT_UNEXPECTED,
						'resolve/barcode returned a variation without parent_id'
					);
					return;
				}

				const handles = [];
				try {
					handles.push(
						runtime.engine.require({
							id: `barcode:${barcodeStr}:${match.type}:${match.id}`,
							collection: match.type === 'variation' ? 'variations' : 'products',
							kind: 'targeted-records',
							remoteIds: [match.id].map(remoteIdOrNull).filter((remoteId) => remoteId !== null),
							forceRefresh: true,
						})
					);
					if (match.type === 'variation') {
						handles.push(
							runtime.engine.require({
								id: `barcode:${barcodeStr}:product:${match.parent_id}`,
								collection: 'products',
								kind: 'targeted-records',
								remoteIds: [match.parent_id]
									.map(remoteIdOrNull)
									.filter((remoteId) => remoteId !== null),
								forceRefresh: true,
							})
						);
						onlineParentRequired = true;
					}
					await Promise.all(handles.map((handle) => handle.ready));
				} catch (error) {
					reportHydrationFailure(error);
					return;
				} finally {
					for (const handle of handles) {
						handle.release();
					}
				}

				results = await barcodeSearch(barcodeStr);
				if (results.length === 0) {
					showNotFound();
					return;
				}
				if (results.length > 1) {
					showAmbiguousResults(results.length);
					return;
				}
			}
		}

		const [product] = results;

		// Products and variations gate on the same shared sellability the badge
		// now displays — a raw stock_status check here would refuse a scan for a
		// product whose optimistic quantity edit already shows "in stock"
		// (and, unlike the resolver, treated backorderable items as unsellable).
		const outOfStock = !resolveStock(product.payload).sellable;
		if (!showOutOfStock && outOfStock) {
			scan.outOfStock(product.payload.name ?? '', barcodeStr);
			barcodeLogger.warn('Barcode scan matched an out-of-stock product', {
				context: {
					barcode: barcodeStr,
					productId: product.remoteId === null ? undefined : wooIdOf(product.remoteId),
					productName: product.payload.name,
					stockStatus: product.payload.stock_status,
				},
			});
			return;
		}

		let added: boolean;
		if (isVariationDocument(product)) {
			/**
			 * Hack: we need to get the parent product
			 * - parent_id was added recently to the variation schema, so older variations don't have it
			 */
			const parent_id = product.payload.parent_id;
			if (!parent_id) {
				guardedSetSearch(barcodeStr);
				return;
			}

			let parent = await findProductById(parent_id);
			if (!parent && !onlineParentRequired) {
				try {
					const handle = runtime.engine.require({
						id: `barcode:${barcodeStr}:product:${parent_id}`,
						collection: 'products',
						kind: 'targeted-records',
						remoteIds: [parent_id].map(remoteIdOrNull).filter((remoteId) => remoteId !== null),
						forceRefresh: true,
					});
					try {
						await handle.ready;
						parent = await findProductById(parent_id);
					} finally {
						handle.release();
					}
				} catch (error) {
					reportHydrationFailure(error);
					return;
				}
			}
			if (!parent) {
				guardedSetSearch(barcodeStr);
				return;
			}
			if (parent.payload.status !== 'publish') {
				showNotFound();
				return;
			}

			// Malformed payload attributes must not throw inside the scan subscription (#1294):
			// route the read through the same guard every other UI consumer uses.
			const sanitizedAttributes = (sanitizeVariationAttributesRead(product.payload.attributes) ??
				[]) as { id?: number; name?: string; option?: string }[];
			const metaData = sanitizedAttributes.map((attribute) => {
				return {
					attr_id: attribute.id ?? 0,
					display_key: attribute.name ?? '',
					display_value: attribute.option ?? '',
				};
			});

			// The scan toast owns success feedback; silence the add-hook's own toast so
			// a scan produces exactly one notification (fixes the double popup per scan).
			added = await addVariation(product, parent, metaData, { silent: true });
		} else {
			added = await addProduct(product, { silent: true });
		}
		if (!added) {
			// An online-resolved product/variation that fails to add would otherwise leave
			// the "Searching store…" toast up after the scan finished. Replace it
			// with terminal failure feedback (the add hook surfaces its own mutation error).
			if (searchingOnlineShown) {
				scan.addFailed(product.payload.name ?? '');
			}
			return;
		}

		/**
		 * Show success message
		 */
		scan.added(product.payload.name ?? '');
		barcodeLogger.success(text1, {
			context: {
				barcode: barcodeStr,
				productId: product.remoteId === null ? undefined : wooIdOf(product.remoteId),
				productName: product.payload.name,
			},
		});

		// Successful scans clear both committed search and any pending input draft.
		guardedClearSearch();
	};

	useSubscription(
		scanEvents$,
		(event) =>
			void handleScan(event).catch((error) =>
				barcodeLogger.error(String(error), {
					code: ERROR_CODES.PRODUCT_UNEXPECTED,
				})
			)
	);

	return { onKeyPress };
};
