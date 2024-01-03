import { orderBy } from '@shelf/fast-natural-order-by';
import debounce from 'lodash/debounce';
import isEmpty from 'lodash/isEmpty';
import isEqual from 'lodash/isEqual';
import { ObservableResource } from 'observable-hooks';
import { BehaviorSubject, Observable, Subscription, Subject } from 'rxjs';
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
	postQueryResult?: (result: any, params: QueryParams) => any;
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
	private activeSearchSubscription: Subscription | null = null;
	public readonly endpoint: string;
	private errorSubject: Subject<Error>;

	/**
	 *
	 */
	public readonly subs: Subscription[] = [];
	public readonly subjects = {
		params: new BehaviorSubject<QueryParams | undefined>(undefined),
		result: new BehaviorSubject<DocumentType<T>[]>([]),
		currentPage: new BehaviorSubject<number>(1),
		paginatedResult: new BehaviorSubject<DocumentType<T>[]>([]),
		paginationEndReachedNextPage: new Subject<void>(),
	};

	/**
	 *
	 */
	readonly params$: Observable<QueryParams | undefined> = this.subjects.params.asObservable();
	readonly result$: Observable<DocumentType<T>[]> = this.subjects.result.asObservable();
	readonly currentPage$: Observable<number> = this.subjects.currentPage.asObservable();
	readonly paginatedResult$: Observable<DocumentType<T>[]> =
		this.subjects.paginatedResult.asObservable();
	readonly paginationEndReachedNextPage$: Observable<void> =
		this.subjects.paginationEndReachedNextPage.asObservable();

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
		this.subjects.params.next(initialParams);
		this.hooks = hooks || {};
		this.pageSize = 10;
		this.searchService = searchService;
		this.endpoint = endpoint;
		this.errorSubject = errorSubject;

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
								const pageItems = items.slice(0, end);
								this.paginationEndReached = pageItems.length === items.length;
								return pageItems;
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
				let modifiedParams = params || {};

				// Apply the preQueryParams hook if provided
				if (this.hooks?.preQueryParams) {
					modifiedParams = this.hooks.preQueryParams(modifiedParams);
				}

				return this.collection.find({ selector: modifiedParams?.selector || {} }).$.pipe(
					map((docs: DocumentType<T>[]) => {
						/**
						 * Sorting wasn't working for string numbers, so I'm handling sorting here
						 */
						const { sortBy, sortDirection } = modifiedParams;
						let sortedResult = docs;

						if (sortBy && sortDirection) {
							sortedResult = orderBy(docs, [(v) => v[sortBy]], [sortDirection]);
						}

						if (this.hooks?.postQueryResult) {
							sortedResult = this.hooks.postQueryResult(docs, modifiedParams);
						}

						return sortedResult;
					})
				);
			}),
			/**
			 * We're only interested in insert/delete documents and order changes
			 */
			distinctUntilChanged((prev, next) => {
				return isEqual(
					prev.map((doc) => doc.uuid || doc.id),
					next.map((doc) => doc.uuid || doc.id)
				);
			})
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
		if (typeof query === 'string' || query === null) {
			// if activeSearchSubscription exists, cancel it
			if (this.activeSearchSubscription) {
				this.activeSearchSubscription.unsubscribe();
			}

			/**
			 * If empty, we can just remove the uuid where clause
			 */
			if (isEmpty(query)) {
				this.whereClauses = this.whereClauses.filter((clause) => clause.field !== 'uuid');
				return this.updateParams({ search: query });
			}

			/**
			 * We need to use the Orama searchDB to find matching uuids
			 */
			this.activeSearchSubscription = this.searchService.search$(query).subscribe((uuids) => {
				// remove uuid from whereClauses
				this.whereClauses = this.whereClauses.filter((clause) => clause.field !== 'uuid');

				if (uuids) {
					this.whereClauses.push({ field: 'uuid', value: { $in: uuids } });
				}

				this.updateParams({ search: query });
			});

			// make sure we clean up the subscription on cancel
			this.subs.push(this.activeSearchSubscription);
		} else {
			this.updateParams({ search: query });
		}
	}

	debouncedSearch = debounce(this.search, 250);

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
			map((docs) => docs.length),
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
