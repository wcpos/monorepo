import cloneDeep from 'lodash/cloneDeep';
import debounce from 'lodash/debounce';
import find from 'lodash/find';
import forEach from 'lodash/forEach';
import get from 'lodash/get';
import isEmpty from 'lodash/isEmpty';
import isEqual from 'lodash/isEqual';
import { orderBy } from 'natural-orderby';
import { ObservableResource } from 'observable-hooks';
import {
	BehaviorSubject,
	Observable,
	Subscription,
	Subject,
	ReplaySubject,
	combineLatest,
	catchError,
} from 'rxjs';
import { map, switchMap, distinctUntilChanged, debounceTime, tap, startWith } from 'rxjs/operators';

import { Search } from './search-state';
import { SubscribableBase } from './subscribable-base';
import { normalizeWhereClauses } from './utils';

import type { RxCollection, RxDocument } from 'rxdb';

// This type utility extracts the document type from a collection
type DocumentType<C> = C extends RxCollection<infer D> ? RxDocument<D, object> : never;

type SortDirection = import('@wcpos/components/src/table').SortDirection;

export interface QueryParams {
	search?: string | Record<string, any>;
	sortBy?: string;
	sortDirection?: SortDirection;
	selector?: import('rxdb').MangoQuery['selector'];
	// limit?: number; // we're doing our own pagination
	// skip?: number;
}

export interface QueryHooks {
	preQueryParams?: (params: QueryParams) => QueryParams;
	postQueryResult?: (
		docs: RxDocument[],
		modifiedParams: QueryParams,
		originalParams: QueryParams
	) => RxDocument[];
}

export interface QueryConfig<T> {
	id: string;
	collection: T;
	initialParams?: QueryParams;
	hooks?: QueryHooks;
	endpoint?: string;
	errorSubject: Subject<Error>;
	greedy?: boolean;
	locale?: string;
}

type WhereClause = { field: string; value: any };

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
 * A wrapper class for RxDB queries
 */
export class Query<T extends RxCollection> extends SubscribableBase {
	public readonly id: string;
	public readonly collection: T;
	public readonly whereClauses: WhereClause[] = [];
	public readonly hooks: QueryConfig<T>['hooks'];
	public readonly searchService: Search;
	public readonly endpoint: string;
	public readonly errorSubject: Subject<Error>;
	public readonly primaryKey: string;
	public readonly greedy: boolean;

	/**
	 *
	 */
	public readonly subs: Subscription[] = [];
	public readonly subjects = {
		params: new BehaviorSubject<QueryParams | undefined>(undefined),
		result: new ReplaySubject<QueryResult<T>>(1),
	};

	/**
	 *
	 */
	public readonly params$ = this.subjects.params.asObservable();
	public readonly result$ = this.subjects.result.asObservable();

	public readonly resource = new ObservableResource(this.result$);

	/**
	 *
	 */
	constructor({
		id,
		collection,
		initialParams = {},
		hooks,
		endpoint,
		errorSubject,
		greedy = false,
		locale,
	}: QueryConfig<T>) {
		super();
		this.id = id;
		this.collection = collection;
		this.hooks = hooks || {};
		this.endpoint = endpoint; // @TODO - do we need this?
		this.errorSubject = errorSubject;
		this.primaryKey = collection.schema.primaryPath;
		this.greedy = greedy;

		/**
		 * Search service
		 *
		 * @TODO - we only need a full text search service for some collections and fields
		 * @TODO - we have full text search, but we need partial string search as well
		 */
		this.searchService = new Search({ collection, locale });

		/**
		 * Set initial params
		 */
		if (initialParams.selector?.$and) {
			forEach(initialParams.selector.$and, (condition) => {
				forEach(condition, (value, key) => {
					this.whereClauses.push({ field: key, value });
				});
			});
		} else {
			forEach(initialParams.selector, (value, key) => {
				this.whereClauses.push({ field: key, value });
			});
		}
		this.subjects.params.next(initialParams);

		/**
		 * Keep track of what we are subscribed to
		 */
		this.subs.push(
			/**
			 * Subscribe to query changes and emit the results
			 */
			this.find$
				.pipe(
					distinctUntilChanged((prev, next) => {
						// Check if search is active and searchTerm has changed
						if (prev.searchActive !== next.searchActive || prev.searchTerm !== next.searchTerm) {
							return false;
						}

						// Check if the number of hits or their order has changed
						const idsAreEqual = isEqual(
							prev.hits.map((hit) => hit.id),
							next.hits.map((hit) => hit.id)
						);

						// if search is active, check if the childrenSearchCount has changed
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
					})
					// catchError((error) => {
					// 	this.errorSubject.next(error);
					// })
				)
				.subscribe((result) => {
					// console.log('Query result', result);
					this.subjects.result.next(result);
				})
		);
	}

	/**
	 * A wrapper for the RxDB collection.find().$ observable
	 */
	get find$() {
		return this.params$.pipe(
			switchMap((params) => {
				const startTime = performance.now(); // Start time measurement
				let modifiedParams = cloneDeep(params || {}); // clone params, note nested objects need to be cloned too!

				// Apply the preQueryParams hook if provided
				if (this.hooks?.preQueryParams) {
					modifiedParams = this.hooks.preQueryParams(modifiedParams);
				}

				const searchActive =
					typeof modifiedParams.search === 'string' && !isEmpty(modifiedParams.search);

				let rxdbQuery$: Observable<QueryResult<T>>;
				if (searchActive) {
					rxdbQuery$ = this.handleSearchActive(modifiedParams);
				} else {
					rxdbQuery$ = this.handleSearchInactive(modifiedParams, params);
				}

				return rxdbQuery$.pipe(
					map((result) => {
						const endTime = performance.now(); // End time measurement
						const elapsed = endTime - startTime;
						return { elapsed, ...result };
					})
				);
			})
		);
	}

	handleSearchActive(modifiedParams: QueryParams) {
		return this.searchService.search$(modifiedParams.search as string).pipe(
			switchMap((searchResults) => {
				return this.collection.find({ selector: modifiedParams?.selector || {} }).$.pipe(
					map((docs) => {
						const filteredAndSortedDocs = searchResults.hits
							.map((hit) => ({
								...hit,
								document: docs.find((doc) => doc[this.primaryKey] === hit.id),
							}))
							.filter((hit) => hit.document !== undefined);

						return {
							searchActive: true,
							searchTerm: modifiedParams.search,
							count: filteredAndSortedDocs.length,
							hits: filteredAndSortedDocs,
						};
					})
				);
			})
		);
	}

	handleSearchInactive(modifiedParams: QueryParams, originalParams: QueryParams) {
		return this.collection.find({ selector: modifiedParams?.selector || {} }).$.pipe(
			map((docs: DocumentType<T>[]) => {
				/**
				 * Sorting wasn't working for string numbers, so I'm handling sorting here
				 */
				const { sortBy, sortDirection } = modifiedParams;
				let filteredAndSortedDocs = docs;

				if (sortBy && sortDirection) {
					// @TODO - ordering by multiple fields?
					filteredAndSortedDocs = orderBy(
						filteredAndSortedDocs,
						[(v) => v[sortBy]],
						[sortDirection]
					);
				}

				if (this.hooks?.postQueryResult) {
					filteredAndSortedDocs = this.hooks.postQueryResult(
						filteredAndSortedDocs,
						modifiedParams,
						originalParams
					);
				}

				return {
					searchActive: false,
					count: filteredAndSortedDocs.length,
					hits: filteredAndSortedDocs.map((doc) => ({
						id: doc[this.primaryKey],
						document: doc,
					})),
				};
			})
		);
	}

	/**
	 * Selector helpers
	 */
	where(field: string, value: any): this {
		this.whereClauses.push({ field, value });
		this.whereClauses = normalizeWhereClauses(this.whereClauses);
		this.updateParams();
		return this;
	}

	sort(sortBy: string, sortDirection: SortDirection): this;
	sort(sortObj: Record<string, SortDirection>): this;
	sort(sortByOrObj: any, sortDirection?: SortDirection): this {
		if (typeof sortByOrObj === 'string') {
			// Single field-direction pair
			this.updateParams({
				sortBy: sortByOrObj,
				sortDirection: sortDirection!,
			});
		} else {
			// Object with multiple field-direction pairs
			// Assuming we want to keep the last one if there are multiple fields
			const [lastField, lastDirection] = Object.entries(sortByOrObj).pop() as [
				string,
				SortDirection,
			];
			this.updateParams({
				sortBy: lastField,
				sortDirection: lastDirection,
			});
		}

		return this;
	}

	search(query: string | Record<string, any> = '') {
		this.updateParams({ search: query });
	}

	debouncedSearch = debounce(this.search, 250);

	/**
	 *
	 */
	private updateParams(additionalParams: Partial<QueryParams> = {}): void {
		let selector;

		// Construct the $and selector from where clauses
		const andClauses = this.whereClauses.map((clause) => ({
			[clause.field]: clause.value,
		}));

		if (andClauses.length > 0) {
			selector = { $and: andClauses };
		} else {
			selector = {};
		}

		// Get current params and merge them with additionalParams
		const currentParams = this.getParams() || {};
		const newParams: QueryParams = {
			...currentParams,
			...additionalParams,
			selector,
		};

		// Update the BehaviorSubject
		this.subjects.params.next(newParams);
	}

	/**
	 * Public getters
	 */
	getParams(): QueryParams | undefined {
		return this.subjects.params.getValue();
	}

	get count$() {
		return this.result$.pipe(
			map((result) => result.count),
			distinctUntilChanged()
		);
	}

	/**
	 * Helper methods to see if $elemMatch is active
	 */
	findSelector(field: string): any {
		const clause = find(this.whereClauses, { field });
		return clause ? clause.value : undefined;
	}

	hasSelector(field: string, value: any): boolean {
		const clause = find(this.whereClauses, { field, value });
		return !!clause;
	}

	findElementSelectorID(field: string): any {}

	findMetaDataSelector(key: string): any {
		for (const clause of this.whereClauses) {
			if (clause.field === 'meta_data' && clause.value?.$elemMatch) {
				const match = find(clause.value.$elemMatch.$and || [clause.value.$elemMatch], { key });
				if (match) return match.value;
			}
		}
		return undefined;
	}

	hasMetaDataSelector(key: string, value: any): boolean {
		for (const clause of this.whereClauses) {
			if (clause.field === 'meta_data' && clause.value?.$elemMatch) {
				const match = find(clause.value.$elemMatch.$and || [clause.value.$elemMatch], {
					key,
					value,
				});
				if (match) return true;
			}
		}
		return false;
	}

	findAttributesSelector(name: string): any {
		for (const clause of this.whereClauses) {
			if (clause.field === 'attributes' && clause.value?.$elemMatch) {
				const match = find(clause.value.$elemMatch.$and || [clause.value.$elemMatch], { name });
				if (match) return match.option;
			}
		}
		return undefined;
	}

	hasAttributesSelector(name: string, option: any): boolean {
		for (const clause of this.whereClauses) {
			if (clause.field === 'attributes' && clause.value?.$elemMatch) {
				const match = find(clause.value.$elemMatch.$and || [clause.value.$elemMatch], {
					name,
					option,
				});
				if (match) return true;
			}
		}
		return false;
	}
}
