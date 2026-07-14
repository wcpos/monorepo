import * as React from 'react';

import cloneDeep from 'lodash/cloneDeep';
import get from 'lodash/get';
import set from 'lodash/set';

import type {
	CouponDocument,
	CustomerDocument,
	OrderDocument,
	ProductDocument,
	ProductVariationDocument,
} from '@wcpos/database';
import { useQueryManager } from '@wcpos/query';
import type { LegacyCollectionName } from '@wcpos/query/engine-adapter/collection-map';
import { wrapEngineDocument } from '@wcpos/query/engine-adapter/document-proxy';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

import { useT } from '../../../../contexts/translations';
import { convertLocalDateToUTCString } from '../../../../hooks/use-local-date';

import type { RxDocument } from 'rxdb';

const mutationLogger = getLogger(['wcpos', 'mutations', 'local']);

type Document =
	| OrderDocument
	| ProductDocument
	| CustomerDocument
	| ProductVariationDocument
	| CouponDocument;

type WriteableCollection = 'orders' | 'products' | 'variations' | 'customers' | 'coupons';

const WRITEABLE_COLLECTIONS = new Set<WriteableCollection>([
	'orders',
	'products',
	'variations',
	'customers',
	'coupons',
]);

const ADAPTER_DERIVED_FIELDS = new Set([
	'uuid',
	'sortable_price',
	'sortable_total',
	'active',
	'cashier',
	'select',
]);

type QueryManager = ReturnType<typeof useQueryManager>;
type EngineScope = NonNullable<ReturnType<QueryManager['engine']['active']>>;
type EngineResident = RxDocument<Record<string, unknown>>;

interface LocalPatchProps<T extends Document> {
	document: T;
	data: Partial<T>;
}

function writeableCollection(name: string | undefined): WriteableCollection | null {
	return name && WRITEABLE_COLLECTIONS.has(name as WriteableCollection)
		? (name as WriteableCollection)
		: null;
}

export function documentRecordId(document: unknown): string | null {
	if (!document || typeof document !== 'object') return null;
	const value = document as Record<string, unknown>;
	const identity = value.uuid ?? value.id;
	return typeof identity === 'string' && identity.length > 0 ? identity : null;
}

function finiteOrNull(value: unknown): number | null {
	if (value === null || value === undefined || value === '') return null;
	const numeric = Number(value);
	return Number.isFinite(numeric) ? numeric : null;
}

function taxonomyIds(value: unknown): number[] {
	if (!Array.isArray(value)) return [];
	return value
		.map((entry) => Number((entry as { id?: unknown } | null)?.id ?? entry))
		.filter((id) => Number.isFinite(id) && id > 0);
}

function variationAttributes(value: unknown): { id: number; name: string; option: string }[] {
	if (!Array.isArray(value)) return [];
	return value
		.map((entry) => ({
			id: Number((entry as { id?: unknown } | null)?.id) || 0,
			name: String((entry as { name?: unknown } | null)?.name ?? ''),
			option: String((entry as { option?: unknown } | null)?.option ?? ''),
		}))
		.filter(({ name, option }) => name !== '' && option !== '');
}

function withPromotedFields(
	collection: WriteableCollection,
	resident: Record<string, unknown>
): Record<string, unknown> {
	const payload = (resident.payload ?? {}) as Record<string, unknown>;
	switch (collection) {
		case 'orders':
			return {
				...resident,
				number: String(payload.number ?? ''),
				dateCreatedGmt: String(payload.date_created_gmt ?? ''),
				status: String(payload.status ?? ''),
				total: String(payload.total ?? ''),
				customerId: Number(payload.customer_id ?? 0),
			};
		case 'products':
			return {
				...resident,
				price: Math.max(0, Math.round((Number(payload.price) || 0) * 100) / 100),
				stockStatus: String(payload.stock_status ?? ''),
				type: String(payload.type ?? ''),
				categoryIds: taxonomyIds(payload.categories),
				brandIds: taxonomyIds(payload.brands),
				onSale: Boolean(payload.on_sale),
				featured: Boolean(payload.featured),
				stockQuantity: finiteOrNull(payload.stock_quantity),
			};
		case 'variations':
			return {
				...resident,
				parentId: finiteOrNull(payload.parent_id),
				price: Number(payload.price) || 0,
				stockStatus: String(payload.stock_status ?? ''),
				attributes: variationAttributes(payload.attributes),
				stockQuantity: finiteOrNull(payload.stock_quantity),
			};
		default:
			return resident;
	}
}

function syncableChanges(changes: Record<string, unknown>): Record<string, unknown> {
	return Object.fromEntries(
		Object.entries(changes).filter(([field]) => !ADAPTER_DERIVED_FIELDS.has(field))
	);
}

function ensureRecordMetadata(
	payload: Record<string, unknown>,
	recordId: string
): Record<string, unknown> {
	const metadata = Array.isArray(payload.meta_data)
		? [...(payload.meta_data as Record<string, unknown>[])]
		: [];
	const index = metadata.findIndex((entry) => entry.key === '_woocommerce_pos_uuid');
	const identity = { key: '_woocommerce_pos_uuid', value: recordId };
	if (index === -1) metadata.push(identity);
	else metadata[index] = { ...metadata[index], ...identity };
	return { ...payload, meta_data: metadata };
}

async function activeCollection(
	manager: QueryManager,
	collection: WriteableCollection,
	scope?: EngineScope
) {
	const active = scope ?? manager.engine.active() ?? (await manager.engine.ready);
	const residentCollection = active.database.collections[collection];
	if (!residentCollection) {
		throw new Error(`Engine collection "${collection}" is unavailable`);
	}
	return residentCollection;
}

export async function findEngineResident(
	manager: QueryManager,
	collection: WriteableCollection,
	recordId: string,
	scope?: EngineScope
): Promise<EngineResident | null> {
	const residentCollection = await activeCollection(manager, collection, scope);
	return (await residentCollection.findOne(recordId).exec()) as EngineResident | null;
}

export async function patchEngineResident(input: {
	manager: QueryManager;
	collection: WriteableCollection;
	recordId: string;
	changes: Record<string, unknown>;
	scope?: EngineScope;
}): Promise<EngineResident> {
	const resident = await findEngineResident(
		input.manager,
		input.collection,
		input.recordId,
		input.scope
	);
	if (!resident) {
		throw new Error(`Engine resident "${input.recordId}" is missing from "${input.collection}"`);
	}
	return (await resident.incrementalModify((old) => {
		const payload = cloneDeep((old.payload ?? {}) as Record<string, unknown>);
		for (const [field, value] of Object.entries(syncableChanges(input.changes))) {
			set(payload, field, value);
		}
		return withPromotedFields(input.collection, { ...old, payload });
	})) as EngineResident;
}

export async function insertEngineResident(input: {
	manager: QueryManager;
	collection: WriteableCollection;
	recordId: string;
	payload: Record<string, unknown>;
	scope?: EngineScope;
}): Promise<EngineResident> {
	const residentCollection = await activeCollection(input.manager, input.collection, input.scope);
	const payload = ensureRecordMetadata(syncableChanges(input.payload), input.recordId);
	const common: Record<string, unknown> = {
		id: input.recordId,
		payload,
		sync: {
			revision: '',
			partial: false,
			source: input.collection === 'orders' ? 'skeleton' : 'local',
		},
		local: { dirty: false, pendingMutationIds: [] },
	};
	const remoteId = Number(payload.id);
	const resident = withPromotedFields(input.collection, {
		...common,
		...(input.collection === 'orders'
			? { wooOrderId: remoteId > 0 ? remoteId : null }
			: input.collection === 'products'
				? { wooProductId: remoteId > 0 ? remoteId : null }
				: input.collection === 'customers'
					? { wooCustomerId: remoteId > 0 ? remoteId : null }
					: { wooId: remoteId > 0 ? remoteId : null }),
	});
	return (await residentCollection.insert(resident)) as EngineResident;
}

async function patchLocalResident<T extends Document>(
	document: T,
	changes: Record<string, unknown>
): Promise<T> {
	return (await document.incrementalModify(((old: Record<string, unknown>) => ({
		...old,
		...changes,
	})) as never)) as T;
}

/**
 * Local mutation has an intentional per-field split:
 * - fields on engine-writeable documents are applied optimistically to the resident payload and
 *   sent through durable write-intents, except adapter-derived identity/computed fields;
 * - genuinely local documents (for example store settings) are written through
 *   `patchLocalResident` and never enter the sync queue.
 */
export const useLocalMutation = () => {
	const t = useT();
	const manager = useQueryManager();

	const localPatch = React.useCallback(
		async <T extends Document>({ document, data }: LocalPatchProps<T>) => {
			try {
				const patchData = { ...(data as Record<string, unknown>) };
				const collectionName = document.collection?.name;
				const engineCollection = writeableCollection(collectionName);
				const isTemporaryOrder =
					engineCollection === 'orders' &&
					(document as unknown as { isNew?: boolean }).isNew === true;
				const hasDate = engineCollection
					? true
					: get(document, 'collection.schema.jsonSchema.properties.date_modified_gmt');
				if (hasDate) {
					patchData.date_modified_gmt = convertLocalDateToUTCString(new Date());
				}

				const latest = document.getLatest();
				const patchEntries = Object.entries(patchData).filter(([, value]) => value !== undefined);
				if (patchEntries.length === 0) {
					return { changes: {}, document: latest };
				}

				const snapshot = latest.toMutableJSON?.() ?? (latest as unknown as Record<string, unknown>);
				const changes: Record<string, unknown> = {};
				for (const [key, value] of patchEntries) {
					const [root, ...path] = key.split('.');
					if (path.length === 0) {
						changes[root] = value;
						continue;
					}
					const rootValue = cloneDeep((snapshot as Record<string, unknown>)[root]);
					changes[root] = set(
						(rootValue ?? (Number.isInteger(Number(path[0])) ? [] : {})) as object,
						path,
						value
					);
				}

				if (engineCollection && !isTemporaryOrder) {
					const recordId = documentRecordId(document);
					if (!recordId) throw new Error(`Missing uuid for ${engineCollection} mutation`);
					const syncChanges = syncableChanges(changes);
					const prepared: {
						resident?: EngineResident;
						previousResident?: Record<string, unknown>;
					} = {};
					if (Object.keys(syncChanges).length > 0) {
						await manager.engine.write(
							{
								collection: engineCollection,
								// Creation funnels insert the resident and enqueue the create first.
								// Later local edits are updates; the write plane folds create + update
								// into the pending create, or queues behind an in-flight create.
								operation: 'update',
								recordId,
								payload: syncChanges,
							},
							{
								prepare: async (scope) => {
									prepared.resident =
										(await findEngineResident(manager, engineCollection, recordId, scope)) ??
										undefined;
									if (!prepared.resident) {
										throw new Error(
											`Engine resident "${recordId}" is missing from "${engineCollection}"`
										);
									}
									prepared.previousResident = cloneDeep(prepared.resident.toJSON());
									prepared.resident = await patchEngineResident({
										manager,
										collection: engineCollection,
										recordId,
										changes: syncChanges,
										scope,
									});
								},
								rollback: async () => {
									if (prepared.resident && prepared.previousResident) {
										await prepared.resident.incrementalModify(() => prepared.previousResident!);
									}
								},
							}
						);
					} else {
						prepared.resident =
							(await findEngineResident(manager, engineCollection, recordId)) ?? undefined;
					}
					if (!prepared.resident) {
						throw new Error(`Engine resident "${recordId}" is missing from "${engineCollection}"`);
					}
					return {
						changes,
						document: wrapEngineDocument(
							engineCollection as LegacyCollectionName,
							prepared.resident
						) as T,
					};
				}

				const doc = await patchLocalResident(latest, changes);
				return { changes, document: doc };
			} catch (error) {
				const err = error as Record<string, unknown>;
				let message = error instanceof Error ? error.message : String(error);
				let errorCode: string = ERROR_CODES.TRANSACTION_FAILED;
				if (err.rxdb) {
					message = 'rxdb ' + String(err.code);
					errorCode = ERROR_CODES.CONSTRAINT_VIOLATION;
				}
				mutationLogger.error(t('common.there_was_an_error', { message }), {
					showToast: true,
					saveToDb: true,
					context: {
						errorCode,
						documentId: document.id,
						collectionName: document.collection?.name,
						error: message,
					},
				});
			}
		},
		[manager, t]
	);

	return { localPatch };
};
