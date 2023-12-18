import { orderBy } from '@shelf/fast-natural-order-by';
import isEqual from 'lodash/isEqual';
import { BehaviorSubject, Observable, Subscription, Subject } from 'rxjs';
import { map, switchMap, distinctUntilChanged } from 'rxjs/operators';

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
	collection: T;
	initialParams?: QueryParams;
	hooks?: QueryHooks;
}

type WhereClause = { field: string; value: any };

/**
 * A wrapper class for RxDB queries
 */
export class Query<T extends RxCollection> {
	public collection: T;
	private isCanceled = false;
	private whereClauses: WhereClause[] = [];
	private hooks: QueryConfig<T>['hooks'];

	/**
	 *
	 */
	public readonly subs: Subscription[] = [];
	public readonly subjects = {
		params: new BehaviorSubject<QueryParams | undefined>(undefined),
		result: new BehaviorSubject<DocumentType<T>[]>([]),
		error: new Subject<Error>(),
	};

	/**
	 *
	 */
	readonly params$: Observable<QueryParams | undefined> = this.subjects.params.asObservable();
	readonly result$: Observable<DocumentType<T>[]> = this.subjects.result.asObservable();
	readonly error$: Observable<Error> = this.subjects.error.asObservable();

	/**
	 *
	 */
	constructor({ collection, initialParams = {}, hooks }: QueryConfig<T>) {
		this.collection = collection;
		this.subjects.params.next(initialParams);
		this.hooks = hooks || {};

		/**
		 * Keep track of what we are subscribed to
		 */
		this.subs.push(
			/**
			 * Subscribe to query changes and emit the results
			 */
			this.find$.subscribe((result) => {
				this.subjects.result.next(result);
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

	/**
	 * Cancel
	 *
	 * Make sure we clean up subscriptions:
	 * - things we subscribe to in this class, also
	 * - complete the observables accessible from this class
	 */
	cancel() {
		this.isCanceled = true;
		this.subs.forEach((sub) => sub.unsubscribe());

		// Complete subjects
		this.subjects.params.complete();
		this.subjects.result.complete();
		this.subjects.error.complete();
	}
}

export default Query;
