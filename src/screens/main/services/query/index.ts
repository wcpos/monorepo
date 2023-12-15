import { orderBy } from '@shelf/fast-natural-order-by';
import debounce from 'lodash/debounce';
import get from 'lodash/get';
import isEqual from 'lodash/isEqual';
import { RxCollection, RxDocument } from 'rxdb';
import { BehaviorSubject, Observable, Subscription } from 'rxjs';
import { switchMap, map, distinctUntilChanged, skip } from 'rxjs/operators';

import log from '@wcpos/utils/src/logger';

import { removeNulls } from './query.helpers';
import { PaginatorService } from '../paginator';
import { SearchService } from '../search';
type SortDirection = import('@wcpos/components/src/table').SortDirection;

export interface QueryState {
	search?: string | Record<string, any>;
	sortBy?: string;
	sortDirection?: SortDirection;
	selector?: import('rxdb').MangoQuery['selector'];
	limit?: number;
	skip?: number;
}

export type HookTypes = {
	preQuerySelector: (selector: any, queryState: QueryState) => any;
	postQueryResult: (result: any, queryState: QueryState) => any;
	// anotherHookType: (arg1: Type1, arg2: Type2) => ReturnType;
	// Add other hook types as needed...
};
export type Hooks = {
	[K in keyof HookTypes]?: HookTypes[K];
};

type WhereClause = { field: string; value: any };

/**
 * The Query class holds the state of the query and exposes an observable that emits the query results
 * It also exposes some helper methods to update the query state
 */
class Query<T> {
	private whereClauses: WhereClause[] = [];
	private hooks: Hooks = {};

	public readonly paginator: PaginatorService<T>;
	public readonly searchService: SearchService;
	public readonly subs: Subscription[] = [];

	public readonly subjects = {
		queryState: new BehaviorSubject<QueryState | undefined>(undefined),
		result: new BehaviorSubject<RxDocument<T>[]>([]),
	};

	readonly queryState$: Observable<QueryState | undefined> =
		this.subjects.queryState.asObservable();
	readonly result$: Observable<RxDocument<T>[]> = this.subjects.result.asObservable();

	private isCanceled = false;

	/**
	 *
	 */
	constructor(
		public collection: RxCollection<any, object, object>,
		initialQuery: QueryState = {},
		hooks: Hooks = {},
		locale: string = 'en'
	) {
		if (initialQuery.selector) {
			for (const field in initialQuery.selector) {
				this.whereClauses.push({ field, value: initialQuery.selector[field] });
			}
		}
		this.paginator = new PaginatorService<T>(this.$, 10);
		this.searchService = new SearchService(collection, locale);

		/**
		 * Keep track of what we are subscribed to
		 */
		this.subs.push(
			/**
			 * Subscribe to state changes and reset the pagination
			 * Note: Subscription will trigger the first emission
			 */
			this.state$.subscribe((state) => {
				this.paginator.reset();
			}),

			/**
			 * Subscribe to query changes and emit the results
			 */
			this.query$.subscribe((result) => {
				this.subjects.result.next(result);
			})
		);

		/**
		 * Register hooks
		 */
		const allowedHookNames = ['preQuerySelector', 'postQueryResult'];
		Object.entries(hooks).forEach(([hookName, hookFunction]) => {
			if (allowedHookNames.includes(hookName)) {
				this.addHook(hookName, hookFunction);
			}
		});

		/**
		 * This will trigger the first emission
		 */
		this.updateState(initialQuery);
	}

	setCollection<T>(collection: RxCollection<T, object, object>): this {
		// TODO - this would have to create a new ObservableResource, do we really need this?
		this.collection = collection;
		return this;
	}

	addHook(type: keyof HookTypes, fn: any) {
		this.hooks[type] = fn;
	}

	updateState(newState: QueryState) {
		this.subjects.queryState.next(removeNulls(newState));
	}

	where(field: string, value: any): this {
		// remove any existing where clause for this field
		this.whereClauses = this.whereClauses.filter((clause) => clause.field !== field);

		// if value is not null/undefined, add the new where clause
		if (value !== null && value !== undefined) {
			this.whereClauses.push({ field, value });
		}

		// add the new selector to the current state and emit it
		const newState = {
			...this.currentState,
			selector: this.getSelectorFromClauses(),
		};
		this.updateState(newState);

		return this;
	}

	sort(sortBy: string, sortDirection: SortDirection): this;
	sort(sortObj: Record<string, SortDirection>): this;
	sort(sortByOrObj: any, sortDirection?: SortDirection): this {
		if (typeof sortByOrObj === 'string') {
			// Single field-direction pair
			this.updateState({
				...this.currentState,
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
			this.updateState({
				...this.currentState,
				sortBy: lastField,
				sortDirection: lastDirection,
			});
		}

		return this;
	}

	search(query: string | Record<string, any> = '') {
		if (typeof query === 'string') {
			this.subs.push(
				this.searchService.search$(query).subscribe((uuids) => {
					// remove uuid from whereClauses
					this.whereClauses = this.whereClauses.filter((clause) => clause.field !== 'uuid');

					if (uuids) {
						this.whereClauses.push({ field: 'uuid', value: { $in: uuids } });
					}

					this.updateState({
						...this.currentState,
						selector: this.getSelectorFromClauses(),
						search: query,
					});
				})
			);
		} else {
			this.updateState({
				...this.currentState,
				selector: this.getSelectorFromClauses(),
				search: query,
			});
		}
	}

	debouncedSearch = debounce(this.search, 250);

	private getSelectorFromClauses(): Record<string, any> {
		const selector: Record<string, any> = {};
		this.whereClauses.forEach((clause) => {
			selector[clause.field] = clause.value;
		});
		return selector;
	}

	/**
	 * A promise version of runQuery, I don't think this is used anywhere
	 */
	async exec(): Promise<any[]> {
		if (!this.collection) throw new Error('Collection is not set');
		const selector = this.currentState?.selector || {};
		return this.collection.find({ selector }).exec();
	}

	get currentState(): QueryState | undefined {
		return this.subjects.queryState.getValue();
	}

	/**
	 *
	 */
	private get query$() {
		return this.state$.pipe(
			switchMap((queryState) => {
				if (!this.collection || !queryState) {
					throw new Error('Collection or queryState is not set');
				}

				/**
				 * Now we can prepare the selector for rxdb
				 * - be careful not to mutate the queryState
				 */
				let selector = { ...queryState.selector } || {};

				selector = this.hooks?.preQuerySelector
					? this.hooks.preQuerySelector(selector, queryState)
					: selector;

				return this.collection.find({ selector }).$.pipe(
					/**
					 * NoSQL sorting wasn't working for string numbers, so I'm handling sorting here
					 */
					map((result) => {
						// Call the hook function if it's registered
						if (this.hooks.postQueryResult) {
							result = this.hooks.postQueryResult(result, queryState);
						}
						const { sortBy, sortDirection } = queryState;
						let sortedResult = result;

						if (sortBy && sortDirection) {
							sortedResult = orderBy(result, [(v) => v[sortBy]], [sortDirection]);
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
					prev.map((doc) => doc.uuid),
					next.map((doc) => doc.uuid)
				);
			})
		);
	}

	// nextPage(): void {
	// 	return this.paginator.nextPage();
	// }

	getApiQueryParams() {
		const params: Record<string, any> = {};
		this.whereClauses.forEach((clause) => {
			params[clause.field] = clause.value;
		});
		params.orderby = this.currentState?.sortBy;
		params.order = this.currentState?.sortDirection;
		if (typeof this.currentState?.search === 'string') {
			params.search = this.currentState?.search;
		}
		return params;
	}

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
	updateVariationAttributeSearch(attribute: { id: number; name: string; value: string }) {
		// this is only a helper for variations
		if (this.collection.name !== 'variations') {
			throw new Error('updateVariationAttributeSearch is only for variations');
		}
		// if null, remove the attribute search
		if (attribute === null) {
			return { attributes: null };
		}
		// add attribute to query
		const $allMatch = get(this.currentState.search, 'attributes', []);
		const index = $allMatch.findIndex((a) => a.name === attribute.name);
		if (index > -1) {
			$allMatch[index] = attribute;
		} else {
			$allMatch.push(attribute);
		}
		this.search({ attributes: [...$allMatch] });
	}

	/**
	 * Observable getters
	 *
	 * We don't know where these are going to be used, so we need to:
	 * - keep the logic simple, it may be run many times in a component
	 * - clean-up on cancel, just incase it's not unsubscribed when component unmounts
	 */
	get $() {
		return this.result$;
	}

	// @TODO - state$ and queryState$ seem redundant, but I need this skip(1)
	// problem is, I want queryState.getValue(), but I don't want the initial emission
	get state$(): Observable<QueryState | undefined> {
		return this.queryState$.pipe(skip(1));
	}

	get count$() {
		return this.$.pipe(
			map((docs) => docs.length),
			distinctUntilChanged()
		);
	}

	// @TODO - I should count the total number of docs in the collection
	// get total$() {
	// 	return this.$.pipe(
	// 		map((docs) => docs.length),
	// 		distinctUntilChanged()
	// 	);
	// }

	/**
	 * Pagination
	 */
	get paginated$(): Observable<RxDocument<T>[]> {
		return this.paginator.$;
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

		this.subjects.queryState.complete();
		this.subjects.result.complete();

		this.paginator.cancel();
		this.searchService.cancel();
	}
}

export { Query };
