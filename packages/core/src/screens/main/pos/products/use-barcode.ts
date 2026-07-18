import { useObservableEagerState, useSubscription } from 'observable-hooks';

import { useQueryManager } from '@wcpos/query';
import { type BarcodeResolveFetcher, resolveScan } from '@wcpos/sync-core';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

import { useT } from '../../../../contexts/translations';
import { useUISettings } from '../../contexts/ui-settings';
import { useBarcodeDetection } from '../../hooks/barcodes';
import { useBarcodeSearch } from '../../hooks/barcodes/use-barcode-search';
import { useAddProduct } from '../hooks/use-add-product';
import { useAddVariation } from '../hooks/use-add-variation';
import { resolveVariationStock } from './cells/variations-popover/variation-stock';
import { useScanFeedback } from './use-scan-feedback';

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

type ProductDocument = import('@wcpos/database').ProductDocument;
type ProductVariationDocument = import('@wcpos/database').ProductVariationDocument;

function isVariationDocument(
	document: ProductDocument | ProductVariationDocument
): document is ProductVariationDocument {
	return document.collection.name === 'variations';
}

export const useBarcode = (setSearch: (search: string) => void, clearSearch: () => void) => {
	const { barcode$, onKeyPress } = useBarcodeDetection();
	const { barcodeSearch, findProductById } = useBarcodeSearch();
	const { addProduct } = useAddProduct();
	const { addVariation } = useAddVariation();
	const manager = useQueryManager();
	const t = useT();
	const { uiSettings } = useUISettings('pos-products');
	const showOutOfStock = useObservableEagerState(uiSettings.showOutOfStock$);
	const { begin } = useScanFeedback();

	/**
	 *
	 */
	useSubscription(barcode$, async (barcode: unknown) => {
		const barcodeStr = String(barcode);
		const text1 = t('common.barcode_scanned', { barcode: barcodeStr });
		const scan = begin();
		let results = await barcodeSearch(barcodeStr);
		let onlineParentRequired = false;
		// The online lookup shows a persistent "Searching store…" toast; track it so a
		// later failure can replace it with terminal feedback instead of leaving it up.
		let searchingOnlineShown = false;

		const showAmbiguousResults = (count: number) => {
			scan.ambiguous(count, barcodeStr);
			barcodeLogger.error(text1, {
				saveToDb: true,
				context: {
					errorCode: ERROR_CODES.RECORD_NOT_FOUND,
					barcode: barcodeStr,
					resultsCount: count,
				},
			});
			setSearch(barcodeStr);
		};

		const showNotFound = () => {
			scan.notFound(barcodeStr);
			barcodeLogger.error(text1, {
				saveToDb: true,
				context: {
					errorCode: ERROR_CODES.RECORD_NOT_FOUND,
					barcode: barcodeStr,
				},
			});
			setSearch(barcodeStr);
		};

		const showLookupError = (errorCode: string, error?: string) => {
			scan.error(barcodeStr);
			barcodeLogger.error(text1, {
				saveToDb: true,
				context: {
					errorCode,
					barcode: barcodeStr,
					...(error ? { error } : {}),
				},
			});
			setSearch(barcodeStr);
		};

		if (results.length > 1) {
			showAmbiguousResults(results.length);
			return;
		}

		if (results.length === 0) {
			// The online fallback needs a healthy sync engine; during an outage tell
			// the cashier why scanning can't look the code up instead of timing out.
			const engineStatus = manager.engine.status();
			if (engineStatus.connectivity === 'offline') {
				scan.unavailable(barcodeStr);
				barcodeLogger.warn(text1, {
					saveToDb: true,
					context: {
						barcode: barcodeStr,
						connectivity: engineStatus.connectivity,
						gatedBy: engineStatus.gatedBy,
					},
				});
				setSearch(barcodeStr);
				return;
			}

			const { fetcher, syncBaseUrl } = manager.engine.hostTransport();
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
				showLookupError(ERROR_CODES.CONNECTION_REFUSED, resolution.message);
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
								manager.engine.require({
									id: `barcode:${barcodeStr}:ambiguous:products`,
									collection: 'products',
									kind: 'targeted-records',
									wooIds: productIds,
									forceRefresh: true,
								})
							);
						}
						if (variationIds.length > 0) {
							handles.push(
								manager.engine.require({
									id: `barcode:${barcodeStr}:ambiguous:variations`,
									collection: 'variations',
									kind: 'targeted-records',
									wooIds: variationIds,
									forceRefresh: true,
								})
							);
						}
						await Promise.all(handles.map((handle) => handle.ready));
					} catch (error) {
						showLookupError(
							ERROR_CODES.CONNECTION_REFUSED,
							error instanceof Error ? error.message : String(error)
						);
						return;
					} finally {
						for (const handle of handles) {
							handle.release();
						}
					}

					showAmbiguousResults(candidates.length);
					return;
				}

				const match = resolution.match;
				if (match.type === 'variation' && !match.parent_id) {
					showLookupError(
						ERROR_CODES.MISSING_RESPONSE_DATA,
						'resolve/barcode returned a variation without parent_id'
					);
					return;
				}

				const handles = [];
				try {
					handles.push(
						manager.engine.require({
							id: `barcode:${barcodeStr}:${match.type}:${match.id}`,
							collection: match.type === 'variation' ? 'variations' : 'products',
							kind: 'targeted-records',
							wooIds: [match.id],
							forceRefresh: true,
						})
					);
					if (match.type === 'variation') {
						handles.push(
							manager.engine.require({
								id: `barcode:${barcodeStr}:product:${match.parent_id}`,
								collection: 'products',
								kind: 'targeted-records',
								wooIds: [match.parent_id!],
								forceRefresh: true,
							})
						);
						onlineParentRequired = true;
					}
					await Promise.all(handles.map((handle) => handle.ready));
				} catch (error) {
					showLookupError(
						ERROR_CODES.CONNECTION_REFUSED,
						error instanceof Error ? error.message : String(error)
					);
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

		const outOfStock = isVariationDocument(product)
			? !resolveVariationStock(product).sellable
			: product.stock_status !== 'instock';
		if (!showOutOfStock && outOfStock) {
			scan.outOfStock(product.name ?? '', barcodeStr);
			barcodeLogger.warn(text1, {
				context: {
					barcode: barcodeStr,
					productId: product.id,
					productName: product.name,
					stockStatus: product.stock_status,
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
			const parent_id = product.parent_id;
			if (!parent_id) {
				setSearch(barcodeStr);
				return;
			}

			let parent = await findProductById(parent_id);
			if (!parent && !onlineParentRequired) {
				try {
					const handle = manager.engine.require({
						id: `barcode:${barcodeStr}:product:${parent_id}`,
						collection: 'products',
						kind: 'targeted-records',
						wooIds: [parent_id],
						forceRefresh: true,
					});
					try {
						await handle.ready;
						parent = await findProductById(parent_id);
					} finally {
						handle.release();
					}
				} catch (error) {
					showLookupError(
						ERROR_CODES.CONNECTION_REFUSED,
						error instanceof Error ? error.message : String(error)
					);
					return;
				}
			}
			if (!parent) {
				setSearch(barcodeStr);
				return;
			}

			const metaData = (product.attributes ?? []).map(
				(attribute: { id?: number; name?: string; option?: string }) => {
					return {
						attr_id: attribute.id ?? 0,
						display_key: attribute.name ?? '',
						display_value: attribute.option ?? '',
					};
				}
			);

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
				scan.addFailed(product.name ?? '');
			}
			return;
		}

		/**
		 * Show success message
		 */
		scan.added(product.name ?? '');
		barcodeLogger.success(text1, {
			saveToDb: true,
			context: {
				barcode: barcodeStr,
				productId: product.id,
				productName: product.name,
			},
		});

		// Successful scans clear both committed search and any pending input draft.
		clearSearch();
	});

	return { onKeyPress };
};
