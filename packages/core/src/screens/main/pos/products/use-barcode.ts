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

export const useBarcode = (setSearch: (search: string) => void) => {
	const { barcode$, onKeyPress } = useBarcodeDetection();
	const { barcodeSearch, findProductById } = useBarcodeSearch();
	const { addProduct } = useAddProduct();
	const { addVariation } = useAddVariation();
	const manager = useQueryManager();
	const t = useT();
	const { uiSettings } = useUISettings('pos-products');
	const showOutOfStock = useObservableEagerState(uiSettings.showOutOfStock$);

	/**
	 *
	 */
	useSubscription(barcode$, async (barcode: unknown) => {
		const barcodeStr = String(barcode);
		const text1 = t('common.barcode_scanned', { barcode: barcodeStr });
		let results = await barcodeSearch(barcodeStr);
		let onlineParentRequired = false;

		const showAmbiguousResults = (count: number) => {
			barcodeLogger.error(text1, {
				showToast: true,
				saveToDb: true,
				toast: {
					text2: t('common.product_found_locally', { count }),
				},
				context: {
					errorCode: ERROR_CODES.RECORD_NOT_FOUND,
					barcode: barcodeStr,
					resultsCount: count,
				},
			});
			setSearch(barcodeStr);
		};

		const showOnlineFailure = (text2: string, errorCode: string, error?: string) => {
			barcodeLogger.error(text1, {
				showToast: true,
				saveToDb: true,
				toast: { text2 },
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
			const { fetcher, syncBaseUrl } = manager.engine.hostTransport();
			const resolution = await resolveScan({
				code: barcodeStr,
				index: new Map(),
				syncBaseUrl,
				fetcher: withBarcodeLookupDeadline(fetcher),
				now: Date.now,
				onEvent: (event) => {
					if (event.type === 'searching-online') {
						barcodeLogger.info(text1, {
							showToast: true,
							toast: { text2: t('common.barcode_searching_online') },
							context: { barcode: barcodeStr },
						});
					}
				},
			});

			if (resolution.outcome === 'not-found') {
				showOnlineFailure(t('common.product_not_found_online'), ERROR_CODES.RECORD_NOT_FOUND);
				return;
			}

			if (resolution.outcome === 'error') {
				showOnlineFailure(
					t('common.barcode_online_lookup_failed'),
					ERROR_CODES.CONNECTION_REFUSED,
					resolution.message
				);
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
						showOnlineFailure(
							t('common.barcode_online_lookup_failed'),
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
					showOnlineFailure(
						t('common.barcode_online_lookup_failed'),
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
					showOnlineFailure(
						t('common.barcode_online_lookup_failed'),
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
					showOnlineFailure(t('common.product_not_found_online'), ERROR_CODES.RECORD_NOT_FOUND);
					return;
				}
				if (results.length > 1) {
					showAmbiguousResults(results.length);
					return;
				}
			}
		}

		const [product] = results;

		/**
		 * TODO: what if product is out of stock?
		 */
		if (!showOutOfStock && product.stock_status !== 'instock') {
			barcodeLogger.warn(text1, {
				showToast: true,
				toast: {
					text2: t('pos_products.out_of_stock', { name: product.name }),
				},
				context: {
					barcode: barcodeStr,
					productId: product.id,
					productName: product.name,
					stockStatus: product.stock_status,
				},
			});
			return;
		}

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
					showOnlineFailure(
						t('common.barcode_online_lookup_failed'),
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

			addVariation(product, parent, metaData);
		} else {
			addProduct(product);
		}

		/**
		 * Show success message
		 */
		barcodeLogger.success(text1, {
			showToast: true,
			saveToDb: true,
			toast: {
				text2: t('common.added_to_cart', { name: product.name }),
			},
			context: {
				barcode: barcodeStr,
				productId: product.id,
				productName: product.name,
			},
		});

		// Preserve the legacy successful-scan behavior: clear any visible search.
		setSearch('');
	});

	return { onKeyPress };
};
