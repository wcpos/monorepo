import debounce from 'lodash/debounce';
import isEqual from 'lodash/isEqual';
import { ObservableResource } from 'observable-hooks';
import { Subject, Subscription, BehaviorSubject, ReplaySubject } from 'rxjs';
import { tap, map, switchMap, distinctUntilChanged } from 'rxjs/operators';

import { SubscribableBase } from './subscribable-base';

import type {
	RxCollection,
	RxDocument,
	MangoQuery,
	RxQuery,
	MangoQuerySortDirection,
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
interface QueryMethods<DocType> {
	where(fieldOrSelector: string | MangoQuerySelector<DocType>, value?: any): this;
	equals(value: any): this;
	eq(value: any): this;
	gt(value: any): this;
	gte(value: any): this;
	lt(value: any): this;
	lte(value: any): this;
	ne(value: any): this;
	in(values: any[]): this;
	nin(values: any[]): this;
	all(value: any): this;
	regex(value: string | { $regex: string; $options?: string }): this;
	size(value: number): this;
	mod(value: any): this;
	exists(value: boolean): this;
	elemMatch(value: any): this;
	or(array: any[]): this;
	nor(array: any[]): this;
	and(array: any[]): this;
	sort(sortBy: keyof DocType | MangoQuerySortPart<DocType>): this;
	skip(skipValue: number): this;
	limit(limitValue: number): this;
	search(searchTerm: string, fields: (keyof DocType)[]): this;
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
	implements QueryMethods<DocumentType<T>>
{
	public readonly id: string;
	public readonly collection: T;
	public readonly primaryKey: string;
	public readonly errorSubject: Subject<Error>;
	public readonly searchInstancePromise: Promise<void>;
	public readonly locale: string;

	/**
	 *
	 */
	public readonly subs: Subscription[] = [];
	public readonly subjects = {
		rxQuery: new BehaviorSubject<RxQuery | undefined>(undefined),
		params: new BehaviorSubject<QueryParams | undefined>(undefined),
		result: new ReplaySubject<QueryResult<T>>(1),
	};

	/**
	 *
	 */
	public readonly rxQuery$ = this.subjects.rxQuery.asObservable();
	public readonly params$ = this.rxQuery$.pipe(map((rxQuery) => rxQuery?.mangoQuery));
	public readonly result$ = this.subjects.result.asObservable();

	public currentRxQuery: RxQuery;
	public findSubscriptionStarted = false;
	public readonly resource = new ObservableResource(this.result$);

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
	}: QueryConfig<T>) {
		super();
		this.id = id;
		this.collection = collection;
		this.primaryKey = collection.schema.primaryPath;
		this.errorSubject = errorSubject;
		this.searchInstancePromise = collection.initSearch(locale);
		this.locale = locale;

		this.currentRxQuery = collection.find(initialParams);
		if (autoExec) {
			this.exec();
		}
	}

	/**
	 *
	 */
	exec() {
		this.subjects.rxQuery.next(this.currentRxQuery);
		this.startFindSubscription();
	}

	/**
	 * Starts the subscription to the query result stream
	 */
	private startFindSubscription(): void {
		if (this.findSubscriptionStarted) return;
		this.findSubscriptionStarted = true;

		this.subs.push(
			this._find$
				.pipe(
					distinctUntilChanged((prev, next) => {
						const idsAreEqual = isEqual(
							prev.hits.map((hit) => hit.id),
							next.hits.map((hit) => hit.id)
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
					})
				)
				.subscribe((result) => {
					this.subjects.result.next(result);
				})
		);
	}

	/**
	 * Re-subscribe to the new RxQuery
	 */
	get _find$() {
		return this.rxQuery$.pipe(
			tap((rxQuery) => {
				// When to emit the updated params?
				this.subjects.params.next(rxQuery?.mangoQuery);
			}),
			switchMap((rxQuery) => {
				const startTime = performance.now();

				return rxQuery!.$.pipe(
					map((result) => {
						const endTime = performance.now();
						const elapsed = endTime - startTime;
						return {
							elapsed,
							searchActive: false,
							count: result.length,
							hits: result.map((doc) => ({
								id: doc[this.primaryKey],
								document: doc,
							})),
						};
					})
				);
			})
		);
	}

	/**
	 * Public getters
	 */
	getParams(): QueryParams | undefined {
		return this.subjects.params.getValue();
	}

	/**
	 * Query Helpers
	 */
	public where(fieldOrSelector: string | MangoQuerySelector<DocumentType<T>>, value?: any): this {
		if (typeof fieldOrSelector === 'string') {
			this.currentRxQuery = this.currentRxQuery.where(fieldOrSelector, value);
		} else {
			this.currentRxQuery = this.currentRxQuery.where(fieldOrSelector);
		}
		return this;
	}

	public equals(value: any): this {
		this.currentRxQuery = this.currentRxQuery.equals(value);
		return this;
	}

	public eq(value: any): this {
		return this.equals(value);
	}

	public gt(value: any): this {
		this.currentRxQuery = this.currentRxQuery.gt(value);
		return this;
	}

	public gte(value: any): this {
		this.currentRxQuery = this.currentRxQuery.gte(value);
		return this;
	}

	public lt(value: any): this {
		this.currentRxQuery = this.currentRxQuery.lt(value);
		return this;
	}

	public lte(value: any): this {
		this.currentRxQuery = this.currentRxQuery.lte(value);
		return this;
	}

	public ne(value: any): this {
		this.currentRxQuery = this.currentRxQuery.ne(value);
		return this;
	}

	public in(values: any[]): this {
		this.currentRxQuery = this.currentRxQuery.in(values);
		return this;
	}

	public nin(values: any[]): this {
		this.currentRxQuery = this.currentRxQuery.nin(values);
		return this;
	}

	public all(value: any): this {
		this.currentRxQuery = this.currentRxQuery.all(value);
		return this;
	}

	public regex(value: string | { $regex: string; $options?: string }): this {
		this.currentRxQuery = this.currentRxQuery.regex(value);
		return this;
	}

	public size(value: number): this {
		this.currentRxQuery = this.currentRxQuery.size(value);
		return this;
	}

	public mod(value: any): this {
		this.currentRxQuery = this.currentRxQuery.mod(value);
		return this;
	}

	public exists(value: boolean): this {
		this.currentRxQuery = this.currentRxQuery.exists(value);
		return this;
	}

	public elemMatch(value: any): this {
		this.currentRxQuery = this.currentRxQuery.elemMatch(value);
		return this;
	}

	public or(array: any[]): this {
		this.currentRxQuery = this.currentRxQuery.or(array);
		return this;
	}

	public nor(array: any[]): this {
		this.currentRxQuery = this.currentRxQuery.nor(array);
		return this;
	}

	public and(array: any[]): this {
		this.currentRxQuery = this.currentRxQuery.and(array);
		return this;
	}

	public sort(sortBy: keyof DocumentType<T> | MangoQuerySortPart<DocumentType<T>>): this {
		this.currentRxQuery = this.currentRxQuery.sort(sortBy);
		return this;
	}

	public skip(skipValue: number): this {
		this.currentRxQuery = this.currentRxQuery.skip(skipValue);
		return this;
	}

	public limit(limitValue: number): this {
		this.currentRxQuery = this.currentRxQuery.limit(limitValue);
		return this;
	}

	/**
	 * Subscribes to the search instance and updates the query params
	 */
	public search(searchTerm: string) {
		// from(this.searchInstancePromise).pipe(
		// 	switchMap((searchInstance) =>
		// 		searchInstance.collection.$.pipe(
		// 			startWith(null),
		// 			switchMap(() => searchInstance.find(modifiedParams.search))
		// 		)
		// 	),
		// this.currentRxQuery = this.currentRxQuery.where(selector);
	}
	debouncedSearch = debounce(this.search, 250);

	/**
	 * Additional Query Helpers to manipulate the query params
	 */
	public removeWhere(field: string): this {
		const currentMangoQuery = this.currentRxQuery.mangoQuery;
		const newSelector = { ...currentMangoQuery.selector };
		delete newSelector[field];
		const newMangoQuery = { ...currentMangoQuery, selector: newSelector };

		this.currentRxQuery = this.collection.find(newMangoQuery);
		return this;
	}

	public removeElemMatch(field: string, matchCriteria: Partial<any>): this {
		const currentMangoQuery = this.currentRxQuery.mangoQuery;
		let newSelector = { ...currentMangoQuery.selector };

		// Function to check if a condition matches the elemMatch to remove
		const matchesCondition = (condition: any): boolean =>
			condition[field]?.$elemMatch &&
			Object.keys(matchCriteria).every(
				(key) => condition[field].$elemMatch[key] === matchCriteria[key]
			);

		if (Array.isArray(newSelector.$and)) {
			newSelector.$and = newSelector.$and.filter((cond) => !matchesCondition(cond));
			if (newSelector.$and.length === 1) {
				const [singleCondition] = newSelector.$and;
				newSelector = { ...newSelector, ...singleCondition };
				delete newSelector.$and;
			} else if (newSelector.$and.length === 0) {
				delete newSelector.$and;
			}
		} else if (matchesCondition(newSelector)) {
			delete newSelector[field];
		}

		const newMangoQuery = { ...currentMangoQuery, selector: newSelector };
		this.currentRxQuery = this.collection.find(newMangoQuery);
		return this;
	}

	public multipleElemMatch(criteria: any): this {
		const path = this.currentRxQuery.other.queryBuilderPath;

		const currentMangoQuery = this.currentRxQuery.mangoQuery;
		const currentSelector = currentMangoQuery.selector || {};
		const newSelector = { ...currentSelector };

		// Ensure `$and` array exists within the selector
		if (!newSelector.$and) {
			newSelector.$and = [];
		}

		// Create an `$elemMatch` entry for the path
		const elemMatchCondition = { [path]: { $elemMatch: criteria } };

		// Check if `$elemMatch` condition already exists in `$and`
		const existingCondition = newSelector.$and.find((cond) =>
			isEqual(cond[path]?.['$elemMatch'], criteria)
		);

		if (!existingCondition) {
			// Add new `$elemMatch` condition to `$and` array
			newSelector.$and.push(elemMatchCondition);
		}

		const newMangoQuery = { ...currentMangoQuery, selector: newSelector };
		this.currentRxQuery = this.collection.find(newMangoQuery);

		return this;
	}
}
