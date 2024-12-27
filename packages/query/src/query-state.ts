import cloneDeep from 'lodash/cloneDeep';
import debounce from 'lodash/debounce';
import get from 'lodash/get';
import isEmpty from 'lodash/isEmpty';
import isEqual from 'lodash/isEqual';
import pick from 'lodash/pick';
import set from 'lodash/set';
import { ObservableResource } from 'observable-hooks';
import { Subject, BehaviorSubject, ReplaySubject, from } from 'rxjs';
import { map, switchMap, distinctUntilChanged, startWith } from 'rxjs/operators';

import { SubscribableBase } from './subscribable-base';

import type {
	RxCollection,
	RxDocument,
	MangoQuery,
	RxQuery,
	MangoQuerySortPart,
	MangoQuerySelector,
} from 'rxdb';

type DocumentType<C> = C extends RxCollection<infer D> ? RxDocument<D, object> : never;

export type QueryParams = MangoQuery & { search?: string };

export interface QueryConfig<T> {
	id: string;
	collection: T;
	initialParams?: QueryParams;
	// hooks?: QueryHooks;
	endpoint?: string;
	errorSubject: Subject<Error>;
	greedy?: boolean;
	locale?: string;
	autoExec?: boolean;
	infiniteScroll?: boolean;
	pageSize?: number;
}

export interface QueryResult<T> {
	elapsed: number;
	searchActive: boolean;
	count?: number;
	hits: {
		id: string;
		score: number;
		document: DocumentType<T>;
		positions?: Record<string, object>;
		childrenSearchCount?: number;
		parentSearchTerm?: string;
	}[];
}

/**
 * Interface for query methods
 */
interface QueryMethods<DocType, Q = Query<any>> {
	where(fieldOrSelector: string | MangoQuerySelector<DocType>, value?: any): Q;
	equals(value: any): Q;
	eq(value: any): Q;
	gt(value: any): Q;
	gte(value: any): Q;
	lt(value: any): Q;
	lte(value: any): Q;
	ne(value: any): Q;
	in(values: any[]): Q;
	nin(values: any[]): Q;
	all(value: any): Q;
	regex(value: string | { $regex: string; $options?: string }): Q;
	size(value: number): Q;
	mod(value: any): Q;
	exists(value: boolean): Q;
	elemMatch(value: any): Q;
	or(array: any[]): Q;
	nor(array: any[]): Q;
	and(array: any[]): Q;
	sort(sortBy: MangoQuerySortPart<DocType>): Q;
	skip(skipValue: number): Q;
	limit(limitValue: number): Q;
	search(searchTerm: string): void;
	debouncedSearch(searchTerm: string): void;
	removeWhere(field: string): Q;
	removeElemMatch(field: string, matchCriteria: Partial<any>): Q;
	multipleElemMatch(criteria: any): Q;
	exec(): void;
	loadMore(): void;
}

/**
 * A wrapper class for RxQuery
 *
 * - RxQuery is immutable, which means it has to be re-subscribed to if query changes
 * - This wrapper class provides a single instance and handles re-subscription
 * - It provides the query results as an ObservableResource, which fits better with React Suspense
 * - It also has some helper methods for complicated queries, such variation selectors
 * - Supports auto-execution of initial query via `autoExec` option (default: true)
 */
export class Query<T extends RxCollection>
	extends SubscribableBase
	implements QueryMethods<DocumentType<T>, Query<T>>
{
	public readonly id: string;
	public readonly collection: T;
	public readonly primaryKey: string;
	public readonly errorSubject: Subject<Error>;
	public readonly searchInstancePromise: Promise<void>;
	public readonly locale: string;
	public readonly endpoint; // @FIXME - this is used in the replication state but not in this class
	private _variationMatchesCache = new WeakMap<
		RxQuery,
		{ id: number; name: string; option: string }[]
	>();

	/**
	 *
	 */
	public readonly subjects = {
		rxQuery: new BehaviorSubject<RxQuery | undefined>(undefined),
		result: new ReplaySubject<QueryResult<T>>(1),
	};

	/**
	 *
	 */
	public readonly rxQuery$ = this.subjects.rxQuery.asObservable();
	public readonly result$ = this.subjects.result.asObservable();

	public currentRxQuery: RxQuery;
	public findSubscriptionStarted = false;
	public readonly resource = new ObservableResource(this.result$);

	/**
	 * Infinite Scroll
	 */
	public infiniteScroll: boolean;
	public pageSize: number;
	public currentPage: number;

	/**
	 *
	 */
	constructor({
		id,
		collection,
		initialParams = {},
		endpoint,
		errorSubject,
		greedy = false,
		locale = 'en',
		autoExec = true,
		infiniteScroll = false,
		pageSize = 10,
	}: QueryConfig<T>) {
		super();
		this.id = id;
		this.collection = collection;
		this.primaryKey = collection.schema.primaryPath;
		this.errorSubject = errorSubject;
		this.searchInstancePromise = collection.initSearch(locale);
		this.locale = locale;
		this.endpoint = endpoint; // @FIXME - this is used in the replication state but not in this class
		this.infiniteScroll = infiniteScroll;
		this.pageSize = pageSize;
		this.currentPage = 0;

		this.currentRxQuery = collection.find(initialParams);
		if (autoExec) {
			this.exec();
		}
	}

	cancel() {
		this.subjects.result.next({
			elapsed: 0,
			searchActive: false,
			count: 0,
			hits: [],
		});
		this.resource.destroy();
		super.cancel();
	}

	/**
	 * @NOTE - we don't want to execute the query if it's been canceled, eg: next page is triggered
	 * when doing a clear and refresh, which will then restart the find subscription
	 */
	exec() {
		if (this.isCanceled) return;
		if (this.infiniteScroll) {
			const limitValue = (this.currentPage + 1) * this.pageSize;
			this.currentRxQuery = this.currentRxQuery.limit(limitValue);
		}
		this.subjects.rxQuery.next(this.currentRxQuery);
		this.startFindSubscription();
	}

	/**
	 *
	 */
	loadMore() {
		if (!this.infiniteScroll) {
			this.errorSubject.next(new Error('loadMore() called but infiniteScroll is not enabled'));
			return;
		}
		this.currentPage++;
		this.exec();
	}

	private resetPagination(): void {
		this.currentPage = 0;
	}

	/**
	 * Starts the subscription to the query result stream
	 */
	private startFindSubscription(): void {
		if (this.findSubscriptionStarted) return;
		this.findSubscriptionStarted = true;

		this.addSub(
			'result',
			this._find$
				.pipe(
					distinctUntilChanged((prev, next) => {
						const idsAreEqual = isEqual(
							prev.hits.map((hit) => hit.id),
							next.hits.map((hit) => hit.id),
						);
						let childrenAreEqual = true;
						if (idsAreEqual && next.searchActive) {
							childrenAreEqual = prev.hits.every((hit, index) => {
								const nextHit = next.hits[index];
								return (
									hit.parentSearchTerm === nextHit.parentSearchTerm &&
									hit.childrenSearchCount === nextHit.childrenSearchCount &&
									hit.score === nextHit.score
								);
							});
						}
						return idsAreEqual && childrenAreEqual;
					}),
				)
				.subscribe((result) => {
					this.subjects.result.next(result);
				}),
		);
	}

	/**
	 * Re-subscribe to the new RxQuery
	 */
	get _find$() {
		return this.rxQuery$.pipe(
			switchMap((rxQuery) => {
				const startTime = performance.now();

				return rxQuery!.$.pipe(
					map((result) => {
						const endTime = performance.now();
						const elapsed = endTime - startTime;

						const search = get(rxQuery, ['other', 'search']);
						const relationalSearch = get(rxQuery, ['other', 'relationalSearch']);

						if (relationalSearch) {
							return {
								elapsed,
								searchActive: true,
								searchTerm: relationalSearch?.searchTerm,
								count: result.length,
								hits: result.map((doc: DocumentType<T>) => ({
									id: doc[this.primaryKey],
									document: doc,
									childrenSearchCount: relationalSearch?.countsByParent?.[doc?.id] || 0,
									parentSearchTerm: relationalSearch?.searchTerm,
								})),
							};
						}

						if (search) {
							return {
								elapsed,
								searchActive: true,
								searchTerm: search.searchTerm,
								count: result.length,
								hits: result.map((doc: DocumentType<T>) => ({
									id: doc[this.primaryKey],
									document: doc,
								})),
							};
						}

						return {
							elapsed,
							searchActive: false,
							count: result.length,
							hits: result.map((doc: DocumentType<T>) => ({
								id: doc[this.primaryKey],
								document: doc,
							})),
						};
					}),
				);
			}),
		);
	}

	/**
	 * Query Helpers
	 */
	private updateQuery(newRxQuery: RxQuery, resetPagination = true): void {
		this.currentRxQuery = newRxQuery;
		if (resetPagination) {
			this.resetPagination();
		}
	}

	/**
	 * @NOTE - don't reset the pagination if we're just setting the path
	 *
	 * @param path
	 * @param value
	 * @returns
	 */
	public where(path: string, value?: MangoQuerySelector<DocumentType<T>>): this {
		let newRxQuery;
		if (value) {
			newRxQuery = this.currentRxQuery.where(path, value);
			this.updateQuery(newRxQuery);
		} else {
			newRxQuery = this.currentRxQuery.where(path);
			this.updateQuery(newRxQuery, false);
		}
		return this;
	}

	public equals(value: any): this {
		const newRxQuery = this.currentRxQuery.equals(value);
		this.updateQuery(newRxQuery);
		return this;
	}

	public eq(value: any): this {
		return this.equals(value);
	}

	public gt(value: any): this {
		const newRxQuery = this.currentRxQuery.gt(value);
		this.updateQuery(newRxQuery);
		return this;
	}

	public gte(value: any): this {
		const newRxQuery = this.currentRxQuery.gte(value);
		this.updateQuery(newRxQuery);
		return this;
	}

	public lt(value: any): this {
		const newRxQuery = this.currentRxQuery.lt(value);
		this.updateQuery(newRxQuery);
		return this;
	}

	public lte(value: any): this {
		const newRxQuery = this.currentRxQuery.lte(value);
		this.updateQuery(newRxQuery);
		return this;
	}

	public ne(value: any): this {
		const newRxQuery = this.currentRxQuery.ne(value);
		this.updateQuery(newRxQuery);
		return this;
	}

	public in(values: any[], resetPagination = true): this {
		const newRxQuery = this.currentRxQuery.in(values);
		this.updateQuery(newRxQuery, resetPagination);
		return this;
	}

	public nin(values: any[]): this {
		const newRxQuery = this.currentRxQuery.nin(values);
		this.updateQuery(newRxQuery);
		return this;
	}

	public all(value: any): this {
		const newRxQuery = this.currentRxQuery.all(value);
		this.updateQuery(newRxQuery);
		return this;
	}

	public regex(value: string | { $regex: string; $options?: string }): this {
		const newRxQuery = this.currentRxQuery.regex(value);
		this.updateQuery(newRxQuery);
		return this;
	}

	public size(value: number): this {
		const newRxQuery = this.currentRxQuery.size(value);
		this.updateQuery(newRxQuery);
		return this;
	}

	public mod(value: any): this {
		const newRxQuery = this.currentRxQuery.mod(value);
		this.updateQuery(newRxQuery);
		return this;
	}

	public exists(value: boolean): this {
		const newRxQuery = this.currentRxQuery.exists(value);
		this.updateQuery(newRxQuery);
		return this;
	}

	public elemMatch(value: any): this {
		const newRxQuery = this.currentRxQuery.elemMatch(value);
		this.updateQuery(newRxQuery);
		return this;
	}

	public or(array: any[]): this {
		const newRxQuery = this.currentRxQuery.or(array);
		this.updateQuery(newRxQuery);
		return this;
	}

	public nor(array: any[]): this {
		const newRxQuery = this.currentRxQuery.nor(array);
		this.updateQuery(newRxQuery);
		return this;
	}

	public and(array: any[]): this {
		const newRxQuery = this.currentRxQuery.and(array);
		this.updateQuery(newRxQuery);
		return this;
	}

	public sort(sortBy: MangoQuerySortPart<DocumentType<T>>): this {
		const currentMangoQuery = this.currentRxQuery.mangoQuery;
		const newMangoQuery = { ...currentMangoQuery, sort: sortBy };
		const newRxQuery = this.collection.find(newMangoQuery);
		this.updateQuery(newRxQuery);
		return this;
	}

	public skip(skipValue: number): this {
		const newRxQuery = this.currentRxQuery.skip(skipValue);
		this.updateQuery(newRxQuery);
		return this;
	}

	public limit(limitValue: number): this {
		const newRxQuery = this.currentRxQuery.limit(limitValue);
		this.updateQuery(newRxQuery);
		return this;
	}

	/**
	 * Subscribes to the search instance and updates the query params
	 */
	public search(searchTerm: string) {
		// If the search term is empty, remove the uuid filter and unsubscribe from the search
		if (isEmpty(searchTerm)) {
			this.cancelSub('search');
			this.removeWhere(this.primaryKey);
			this.currentRxQuery.other.search = null;
			this.exec();
			return;
		}

		this.resetPagination();

		this.addSub(
			'search',
			from(this.searchInstancePromise)
				.pipe(
					switchMap((searchInstance) =>
						// Note, I want to update search results when the search collection changes
						// I don't know if this is the best way
						searchInstance.collection.$.pipe(
							startWith(null),
							switchMap(() => searchInstance.find(searchTerm)),
						),
					),
				)
				.subscribe((results: DocumentType<T>[]) => {
					const uuids = results.map((result) => result[this.primaryKey]);
					/**
					 * @NOTE - don't reset the pagination when we're getting search updates
					 */
					this.where(this.primaryKey).in(uuids, false);
					this.currentRxQuery.other.search = {
						searchTerm,
					};
					this.exec();
				}),
		);
	}
	debouncedSearch = debounce(this.search, 250);

	/**
	 * Additional Query Helpers to manipulate the query params
	 */
	public removeWhere(field: string): this {
		const currentMangoQuery = this.currentRxQuery.mangoQuery;
		const currentSelector = get(currentMangoQuery, ['selector']);

		if (!currentSelector) {
			return this;
		}

		const newSelector = cloneDeep(currentSelector);

		// Handle simple field deletion
		delete newSelector[field];

		// Handle $and array if it exists
		if (Array.isArray(newSelector.$and)) {
			newSelector.$and = newSelector.$and.filter((condition) => {
				if (condition[field]) return false;

				if (condition.$elemMatch && condition.$elemMatch[field]) return false;

				if (Array.isArray(condition.$or)) {
					const hasField = condition.$or.some(
						(orClause) =>
							orClause[field] ||
							get(orClause, [field, '$elemMatch']) ||
							get(orClause, [field, '$not', '$elemMatch']),
					);
					return !hasField;
				}

				return true;
			});

			// Remove empty $and array
			if (newSelector.$and.length === 0) {
				delete newSelector.$and;
			}
		}

		const newMangoQuery = { ...currentMangoQuery, selector: newSelector };
		const newRxQuery = this.collection.find(newMangoQuery);
		this.updateQuery(newRxQuery);
		return this;
	}

	public removeElemMatch(field: string, matchCriteria: Partial<any>): this {
		const currentMangoQuery = this.currentRxQuery.mangoQuery;
		const currentSelector = get(currentMangoQuery, ['selector']);

		if (!currentSelector) {
			return this;
		}

		let newSelector = cloneDeep(currentSelector);

		// Function to check if a condition matches the elemMatch to remove
		const matchesCondition = (condition: any): boolean => {
			const elemMatch = get(condition, [field, '$elemMatch']);
			return (
				elemMatch &&
				Object.keys(matchCriteria).every((key) => get(elemMatch, key) === matchCriteria[key])
			);
		};

		const andConditions = get(newSelector, '$and', []);
		if (andConditions.length > 0) {
			// Filter out matching conditions from $and array
			const filteredConditions = andConditions.filter((cond) => !matchesCondition(cond));

			if (filteredConditions.length === 0) {
				// If no conditions left, remove $and
				delete newSelector.$and;
			} else if (filteredConditions.length === 1) {
				// If only one condition left, flatten it
				const [singleCondition] = filteredConditions;
				newSelector = { ...newSelector, ...singleCondition };
				delete newSelector.$and;
			} else {
				// Multiple conditions remain
				newSelector.$and = filteredConditions;
			}
		} else if (matchesCondition(newSelector)) {
			// Check direct selector match
			delete newSelector[field];
		}

		const newMangoQuery = { ...currentMangoQuery, selector: newSelector };
		const newRxQuery = this.collection.find(newMangoQuery);
		this.updateQuery(newRxQuery);
		return this;
	}

	public multipleElemMatch(criteria: any): this {
		const path = get(this.currentRxQuery, ['other', 'queryBuilderPath']);
		const currentMangoQuery = this.currentRxQuery.mangoQuery;
		const currentSelector = get(currentMangoQuery, 'selector', {});
		const newSelector = cloneDeep(currentSelector);

		if (!path) {
			throw new Error('No path provided for multipleElemMatch');
		}

		// Ensure `$and` array exists within the selector
		if (!Array.isArray(get(newSelector, '$and'))) {
			set(newSelector, '$and', []);
		}

		// Create an `$elemMatch` entry for the path
		const elemMatchCondition = { [path]: { $elemMatch: criteria } };
		const andConditions = get(newSelector, '$and', []);

		// Check if `$elemMatch` condition already exists in `$and`
		const existingCondition = andConditions.find((cond) =>
			isEqual(get(cond, [path, '$elemMatch']), criteria),
		);

		if (!existingCondition) {
			(andConditions as any[]).push(elemMatchCondition);
			set(newSelector, '$and', andConditions);
		}

		const newMangoQuery = { ...currentMangoQuery, selector: newSelector };
		const newRxQuery = this.collection.find(newMangoQuery);
		this.updateQuery(newRxQuery);

		return this;
	}

	/**
	 * Special case for WooCommerce variations where we want to match products that either:
	 * 1. Have the specified attribute with the specified value, OR
	 * 2. Don't have the attribute at all (WooCommerce "any" attribute)
	 */
	public variationMatch(match: { id: number; name: string; option: string }): this {
		// Remove any existing variation match for this attribute
		this.removeVariationMatch({ id: match.id, name: match.name });

		const currentMangoQuery = this.currentRxQuery.mangoQuery;
		const currentSelector = get(currentMangoQuery, 'selector', {});
		const newSelector = cloneDeep(currentSelector);

		// Ensure `$and` array exists within the selector
		if (!Array.isArray(get(newSelector, '$and'))) {
			set(newSelector, '$and', []);
		}

		// Create the $or condition for this attribute
		const orCondition = {
			$or: [
				{
					attributes: {
						$not: {
							$elemMatch: {
								id: match.id,
								name: match.name,
							},
						},
					},
				},
				{
					attributes: {
						$elemMatch: match,
					},
				},
			],
		};

		newSelector.$and.push(orCondition);

		const newMangoQuery = { ...currentMangoQuery, selector: newSelector };
		const newRxQuery = this.collection.find(newMangoQuery);
		this.updateQuery(newRxQuery);

		return this;
	}

	public removeVariationMatch(match: { id: number; name: string }): this {
		const currentMangoQuery = this.currentRxQuery.mangoQuery;
		const currentSelector = get(currentMangoQuery, 'selector', {});
		const newSelector = cloneDeep(currentSelector);
		const andConditions = get(newSelector, '$and', []);

		// If there's no $and array, nothing to remove
		if (!Array.isArray(andConditions)) {
			return this;
		}

		// Filter out the matching $or condition
		set(
			newSelector,
			'$and',
			andConditions.filter((condition) => {
				if (!get(condition, '$or')) return true; // Use get for optional chaining

				const matchesAttribute = (condition.$or as any[]).some((orClause) => {
					const elemMatch =
						get(orClause, ['attributes', '$elemMatch']) ||
						get(orClause, ['attributes', '$not', '$elemMatch']);
					return elemMatch && isEqual(pick(elemMatch, ['id', 'name']), match);
				});
				return !matchesAttribute;
			}),
		);

		// If $and array is empty, create a new selector without it
		if (newSelector.$and.length === 0) {
			const { $and, ...remainingSelector } = newSelector;
			const newMangoQuery = { ...currentMangoQuery, selector: remainingSelector };
			const newRxQuery = this.collection.find(newMangoQuery);
			this.updateQuery(newRxQuery);
			return this;
		}

		const newMangoQuery = { ...currentMangoQuery, selector: newSelector };
		// this.collection._queryCache._map = new Map();
		const newRxQuery = this.collection.find(newMangoQuery);
		this.updateQuery(newRxQuery);

		return this;
	}

	/**
	 * Helper method to retrieve a specific selector from the current query.
	 * @param path - The field path, e.g., "stock_status"
	 * @returns The selector value, or `undefined` if not found.
	 */
	public getSelector(path: string): MangoQuerySelector<any> | undefined {
		return get(this.currentRxQuery, ['mangoQuery', 'selector', path]);
	}

	/**
	 * Helper method to retrieve the `id` from a specific `$elemMatch` condition.
	 * @param path - The field path, e.g., "categories"
	 * @returns The `id` value from the `$elemMatch` condition, or `undefined` if not found.
	 */
	public getElemMatchId(path: string): number | undefined {
		return get(this.currentRxQuery, ['mangoQuery', 'selector', path, '$elemMatch', 'id']);
	}

	/**
	 * Helper method to retrieve the `value` from an `$elemMatch` with a specific `key` in `meta_data`.
	 * @param key - The `key` to find within the `meta_data` field, e.g., "_pos_user"
	 * @returns The `value` associated with the `key` in `meta_data`, or `undefined` if not found.
	 */
	public getMetaDataElemMatchValue(key: string): string | undefined {
		// Check direct meta_data.$elemMatch
		const directMatch = get(this.currentRxQuery, [
			'mangoQuery',
			'selector',
			'meta_data',
			'$elemMatch',
		]);
		if (directMatch?.key === key) {
			return directMatch.value;
		}

		// Check in $and array
		const andConditions = get(this.currentRxQuery, ['mangoQuery', 'selector', '$and'], []);
		for (const condition of andConditions) {
			const elemMatch = get(condition, ['meta_data', '$elemMatch']);
			if (elemMatch?.key === key) {
				return elemMatch.value;
			}
		}

		return undefined;
	}

	/**
	 * Get all variation matches from the current selector
	 *
	 * NOTE: we need to cache the variation matches beacuse we need query.getVariationMatches()
	 * to return a stable reference to the matches, otherwise useObservableState() will endless loop
	 */
	getVariationMatches() {
		if (this._variationMatchesCache.has(this.currentRxQuery)) {
			return this._variationMatchesCache.get(this.currentRxQuery)!;
		}

		const andConditions = get(this.currentRxQuery, ['mangoQuery', 'selector', '$and']);
		if (!andConditions) {
			const matches = [];
			this._variationMatchesCache.set(this.currentRxQuery, matches);
			return matches;
		}

		const matches = andConditions.reduce(
			(matches: { id: number; name: string; option: string }[], condition) => {
				if (condition?.$or && condition.$or.length === 2) {
					const elemMatch = get(condition, ['$or', 1, 'attributes', '$elemMatch']);
					if (elemMatch) {
						matches.push(elemMatch);
					}
				}
				return matches;
			},
			[],
		);

		this._variationMatchesCache.set(this.currentRxQuery, matches);

		return matches;
	}

	/**
	 * Get the option value for a specific variation match
	 */
	getVariationMatchOption({ id, name }: { id: number; name: string }) {
		const andConditions = get(this.currentRxQuery, ['mangoQuery', 'selector', '$and']);
		if (!andConditions) {
			return null;
		}

		const matchingCondition = andConditions.find((condition) => {
			const elemMatch = get(condition, ['$or', 1, 'attributes', '$elemMatch']);
			return elemMatch && elemMatch.id === id && elemMatch.name === name;
		});

		return get(matchingCondition, ['$or', 1, 'attributes', '$elemMatch', 'option']);
	}
}
