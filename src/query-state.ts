import { orderBy } from '@shelf/fast-natural-order-by';
import cloneDeep from 'lodash/cloneDeep';
import debounce from 'lodash/debounce';
import forEach from 'lodash/forEach';
import get from 'lodash/get';
import isEmpty from 'lodash/isEmpty';
import isEqual from 'lodash/isEqual';
import { ObservableResource } from 'observable-hooks';
import { doc } from 'prettier';
import { BehaviorSubject, Observable, Subscription, Subject, combineLatest } from 'rxjs';
import { map, switchMap, distinctUntilChanged } from 'rxjs/operators';

import { SubscribableBase } from './subscribable-base';

import type { Search } from './search-state';
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
	searchService: Search;
	endpoint?: string;
	errorSubject: Subject<Error>;
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
	}[];
}

/**
 * A wrapper class for RxDB queries
 */
export class Query<T extends RxCollection> extends SubscribableBase {
	public readonly id: string;
	public collection: T;
	private whereClauses: WhereClause[] = [];
	private hooks: QueryConfig<T>['hooks'];
	private paginationEndReached = false;
	private pageSize: number;
	private searchService: Search;
	public readonly endpoint: string;
	private errorSubject: Subject<Error>;
	private primaryKey: string;

	/**
	 *
	 */
	public readonly subs: Subscription[] = [];
	public readonly subjects = {
		params: new BehaviorSubject<QueryParams | undefined>(undefined),
		result: new Subject<QueryResult<T>>(),
		currentPage: new BehaviorSubject<number>(1),
		paginatedResult: new Subject<QueryResult<T>>(),
		paginationEndReachedNextPage: new Subject<void>(),
		additionalSearchResults: new BehaviorSubject<QueryResult<T>>(undefined),
	};

	/**
	 *
	 */
	readonly params$ = this.subjects.params.asObservable();
	readonly result$ = this.subjects.result.asObservable();
	readonly currentPage$ = this.subjects.currentPage.asObservable();
	readonly paginatedResult$ = this.subjects.paginatedResult.asObservable();
	readonly paginationEndReachedNextPage$ =
		this.subjects.paginationEndReachedNextPage.asObservable();
	readonly additionalSearchResults$ = this.subjects.additionalSearchResults.asObservable();

	readonly resource = new ObservableResource(this.result$);
	readonly paginatedResource = new ObservableResource(this.paginatedResult$);

	/**
	 *
	 */
	constructor({
		id,
		collection,
		initialParams = {},
		hooks,
		searchService,
		endpoint,
		errorSubject,
	}: QueryConfig<T>) {
		super();
		this.id = id;
		this.collection = collection;
		this.hooks = hooks || {};
		this.pageSize = 10;
		this.searchService = searchService;
		this.endpoint = endpoint;
		this.errorSubject = errorSubject;
		this.primaryKey = collection.schema.primaryPath;

		/**
		 * Set initial params
		 */
		forEach(initialParams.selector, (value, key) => {
			this.whereClauses.push({ field: key, value });
		});
		this.subjects.params.next(initialParams);

		/**
		 * Keep track of what we are subscribed to
		 */
		this.subs.push(
			/**
			 * Subscribe to query changes and emit the results
			 */
			this.find$.subscribe((result) => {
				this.subjects.result.next(result);
			}),

			/**
			 * Subscribe to result$ and emit paginated results
			 */
			this.result$
				.pipe(
					switchMap((items) => {
						if (this.paginationEndReached) {
							const page = this.subjects.currentPage.value + 1;
							this.subjects.currentPage.next(page);
						}
						return this.currentPage$.pipe(
							map((currentPage) => {
								const end = currentPage * this.pageSize;
								const pageItems = items.hits.slice(0, end);
								this.paginationEndReached = pageItems.length === items.hits.length;
								return {
									...items,
									hits: pageItems,
								};
							})
						);
					})
				)
				.subscribe((result) => {
					this.subjects.paginatedResult.next(result);
				})
		);
	}

	/**
	 * A wrapper for the RxDB collection.find().$ observable
	 */
	private get find$() {
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

				if (searchActive) {
					return combineLatest([
						this.searchService.search$(modifiedParams.search),
						this.additionalSearchResults$,
					]).pipe(
						switchMap(([searchResults, additionalSearchResults]) => {
							return this.collection.find({ selector: modifiedParams?.selector || {} }).$.pipe(
								map((docs) => {
									if (additionalSearchResults) {
										const combinedHits = [...searchResults.hits, ...additionalSearchResults.hits];
										const uniqueHits = Array.from(
											new Map(combinedHits.map((hit) => [hit.id, hit])).values()
										);
										uniqueHits.sort((a, b) => b.score - a.score);
										searchResults.count = uniqueHits.length;
										searchResults.hits = uniqueHits;
										console.log('searchResults', searchResults);
									}
									const filteredAndSortedDocs = searchResults.hits
										.map((hit) => ({
											...hit,
											document: docs.find((doc) => doc[this.primaryKey] === hit.id),
										}))
										.filter((hit) => hit.document !== undefined);

									const endTime = performance.now(); // End time measurement
									const elapsed = endTime - startTime;

									return {
										elapsed,
										searchActive: true,
										count: filteredAndSortedDocs.length,
										hits: filteredAndSortedDocs,
									};
								})
							);
						})
					);
				} else {
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
									params
								);
							}

							const endTime = performance.now(); // End time measurement
							const elapsed = endTime - startTime;

							return {
								elapsed,
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
			})
			/**
			 * We're only interested in insert/delete documents and order changes
			 */
			// distinctUntilChanged((prev, next) => {
			// 	return isEqual(
			// 		prev.map((doc) => doc.uuid || doc.id),
			// 		next.map((doc) => doc.uuid || doc.id)
			// 	);
			// })
		);
	}

	/**
	 * Selector helpers
	 */
	where(field: string, value: any): this {
		if (value === null) {
			// Remove the clause if value is null
			this.whereClauses = this.whereClauses.filter((clause) => clause.field !== field);
		} else {
			const existingClause = this.whereClauses.find((clause) => clause.field === field);
			if (existingClause) {
				existingClause.value = value;
			} else {
				this.whereClauses.push({ field, value });
			}
		}
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
	 * Handle attribute selection
	 * Attributes queries have the form:
	 * {
	 * 	selector: {
	 * 		attributes: {
	 * 			$allMatch: [
	 * 				{
	 * 					name: 'Color',
	 * 					option: 'Blue',
	 * 				},
	 * 			],
	 * 		},
	 * 	}
	 *
	 * Note: $allMatch is an array so we need to check if it exists and add/remove to it
	 */
	updateVariationAttributeSelector(attribute: { id: number; name: string; option: string }) {
		// this is only a helper for variations
		if (this.collection.name !== 'variations') {
			throw new Error('updateVariationAttributeSearch is only for variations');
		}

		// add attribute to query
		const $allMatch = get(this.getParams(), ['selector', 'attributes', '$allMatch'], []);
		const index = $allMatch.findIndex((a) => a.name === attribute.name);
		if (index > -1) {
			$allMatch[index] = attribute;
		} else {
			$allMatch.push(attribute);
		}

		this.whereClauses.push({ field: 'attributes', value: { $allMatch: [...$allMatch] } });
		this.updateParams();
	}

	resetVariationAttributeSelector() {
		if (get(this.getParams(), ['selector', 'attributes'])) {
			this.whereClauses = this.whereClauses.filter((clause) => clause.field !== 'attributes');
			this.updateParams();
		}
	}

	/**
	 *
	 */
	private updateParams(additionalParams: Partial<QueryParams> = {}): void {
		// Construct the selector from where clauses
		const selector = this.whereClauses.reduce((acc, clause) => {
			acc[clause.field] = clause.value;
			return acc;
		}, {});

		// Get current params and merge them with additionalParams
		const currentParams = this.getParams() || {};
		const newParams: QueryParams = { ...currentParams, ...additionalParams, selector };

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
	 * Pagination
	 */
	nextPage() {
		if (!this.paginationEndReached) {
			const page = this.subjects.currentPage.value + 1;
			this.subjects.currentPage.next(page);
		} else {
			// the Query Replication will listen for this event and trigger a server query
			this.subjects.paginationEndReachedNextPage.next();
		}
	}

	paginationReset() {
		this.paginationEndReached = false;
		this.subjects.currentPage.next(1);
	}
}

export default Query;
