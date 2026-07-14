/**
 * The requirement bridge (ADR 0027, the catalog demand plane) — increment 1b.
 *
 * Translates a fluent {@link Query}'s legacy Mango params into the ONLY remote
 * demand shapes the engine's public `require()` facade actually speaks:
 *
 *  - **finite-ID selectors** (`id: {$in: [...]}` or single-id equality) over the
 *    targeted collections (products, variations, customers, orders) →
 *    `engine.require({kind: 'targeted-records', wooIds})`. Covers parent
 *    variations, grouped products and the default-customer lookup.
 *  - **search demand** (products/customers with a non-empty search term) →
 *    `engine.require({collection, kind: 'search', term})`.
 *  - **order query descriptors** (unbounded orders browse) →
 *    `engine.require({collection: 'orders', kind: 'query', queryKey})` with the
 *    `orders:browser:status=…:search=…:limit=…` descriptor the engine parses.
 *
 * UNBOUNDED filtered browse over every other collection creates NO remote demand
 * (local residents only) — that is the accepted ADR 0027 design, not a gap. The
 * `greedy`/`endpoint` keys no longer create remote work; they are accepted and
 * ignored (deleted at convergence).
 *
 */

import { getLogger } from '@wcpos/utils/logger';
import type { EngineRequirement, RequirementHandle, RxdbSyncEngine } from '@wcpos/sync-engine';

import {
	type EngineCollectionName,
	engineCollectionNameFor,
	isMappedCollection,
} from './engine-adapter/collection-map';

/** Engine collections with a `targeted` shape — the only ones `targeted-records` serves. */
const TARGETED_ENGINE_COLLECTIONS = new Set<EngineCollectionName>([
	'products',
	'variations',
	'customers',
	'orders',
]);

const SEARCH_ENGINE_COLLECTIONS = new Set<EngineCollectionName>(['products', 'customers']);

const requirementLogger = getLogger(['wcpos', 'query', 'requirement-bridge']);

/** The web scheduler's browse-lane cap; the engine rejects larger order descriptors. */
const ORDER_BROWSE_MAX_LIMIT = 200;

function finiteWooIds(selector: Record<string, unknown> | undefined): number[] | null {
	const idSelector = selector?.id as unknown;
	if (idSelector === undefined || idSelector === null) {
		return null;
	}
	const coerce = (value: unknown): number | null => {
		const numeric = Number(value);
		return Number.isFinite(numeric) ? numeric : null;
	};
	if (typeof idSelector === 'number' || typeof idSelector === 'string') {
		const single = coerce(idSelector);
		return single === null ? null : [single];
	}
	if (typeof idSelector === 'object') {
		const record = idSelector as Record<string, unknown>;
		if (Array.isArray(record.$in)) {
			const ids = record.$in.map(coerce).filter((id): id is number => id !== null);
			return ids.length > 0 ? ids : null;
		}
		if ('$eq' in record) {
			const single = coerce(record.$eq);
			return single === null ? null : [single];
		}
	}
	return null;
}

function orderBrowseDescriptor(
	selector: Record<string, unknown> | undefined,
	limit: number | undefined
): string {
	const statusValue = (() => {
		const status = selector?.status as unknown;
		if (typeof status === 'string' && status.length > 0) return status;
		if (status && typeof status === 'object' && typeof (status as any).$eq === 'string') {
			return (status as any).$eq as string;
		}
		return 'all';
	})();
	const searchValue = typeof selector?.search === 'string' ? (selector.search as string) : '';
	const boundedLimit = Math.min(
		Math.max(1, typeof limit === 'number' && Number.isFinite(limit) ? limit : 10),
		ORDER_BROWSE_MAX_LIMIT
	);
	return `orders:browser:status=${statusValue}:search=${searchValue}:limit=${boundedLimit}`;
}

export interface RequirementInput {
	id: string;
	collectionName: string;
	selector: Record<string, unknown> | undefined;
	limit: number | undefined;
	priority?: number;
	forceRefresh?: boolean;
}

/**
 * Build the engine requirements a query implies. Returns `[]` (no remote demand)
 * for the accepted local-residents-only cases.
 */
export function requirementsForQuery(input: RequirementInput): EngineRequirement[] {
	const { collectionName, selector, limit } = input;
	if (!isMappedCollection(collectionName)) {
		return [];
	}
	const engineCollection = engineCollectionNameFor(collectionName);
	const requirements: EngineRequirement[] = [];

	const wooIds = finiteWooIds(selector);
	if (wooIds && TARGETED_ENGINE_COLLECTIONS.has(engineCollection)) {
		requirements.push({
			id: `${input.id}:targeted`,
			collection: engineCollection,
			kind: 'targeted-records',
			wooIds,
			...(input.priority !== undefined ? { priority: input.priority } : {}),
			...(input.forceRefresh ? { forceRefresh: true } : {}),
		});
	}

	const rawSearchTerm = typeof selector?.search === 'string' ? selector.search : '';
	if (rawSearchTerm.trim() && SEARCH_ENGINE_COLLECTIONS.has(engineCollection)) {
		requirements.push({
			id: `${input.id}:search`,
			collection: engineCollection,
			kind: 'search',
			term: rawSearchTerm,
			...(input.priority !== undefined ? { priority: input.priority } : {}),
			...(input.forceRefresh ? { forceRefresh: true } : {}),
		});
	}

	if (requirements.length > 0) {
		return requirements;
	}

	if (engineCollection === 'orders') {
		return [
			{
				id: `${input.id}:orders-query`,
				collection: 'orders',
				kind: 'query',
				queryKey: orderBrowseDescriptor(selector, limit),
				...(input.priority !== undefined ? { priority: input.priority } : {}),
				...(input.forceRefresh ? { forceRefresh: true } : {}),
			},
		];
	}

	// Every other collection: unbounded browse → local residents only (ADR 0027).
	return [];
}

/**
 * Declare a query's requirements against the engine, returning the live handles.
 * Rejections are swallowed here: demand is best-effort and self-heals on the next
 * declaration (UI requirements are re-declared every render).
 */
export function declareRequirements(
	engine: RxdbSyncEngine,
	requirements: EngineRequirement[]
): RequirementHandle[] {
	return requirements.map((requirement) => {
		const handle = engine.require(requirement);
		handle.ready.catch((error) => {
			if (requirement.kind === 'search') {
				requirementLogger.warn('Search requirement failed; continuing with local results', {
					context: { collection: requirement.collection, term: requirement.term, error },
				});
			}
		});
		return handle;
	});
}
