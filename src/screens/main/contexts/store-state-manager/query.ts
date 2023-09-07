import { orderBy } from '@shelf/fast-natural-order-by';
import debounce from 'lodash/debounce';
import get from 'lodash/get';
import isEqual from 'lodash/isEqual';
import isString from 'lodash/isString';
import { RxCollection, RxDocument } from 'rxdb';
import { BehaviorSubject, Observable, Subscription, of } from 'rxjs';
import { switchMap, map, distinctUntilChanged, shareReplay, tap, skip } from 'rxjs/operators';

import log from '@wcpos/utils/src/logger';

import { Paginator } from './paginator';
import { removeNulls, stringifyWithSortedKeys } from './query.helpers';
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
	private queryState$ = new BehaviorSubject<QueryState | undefined>(undefined);
	private hooks: Hooks = {};

	public readonly paginator: Paginator<T>;
	public readonly subs: Subscription[] = [];

	constructor(
		public collection: RxCollection<any, object, object>,
		initialQuery: QueryState = {},
		hooks: Hooks = {}
	) {
		if (initialQuery.selector) {
			for (const field in initialQuery.selector) {
				this.whereClauses.push({ field, value: initialQuery.selector[field] });
			}
		}
		this.updateState(initialQuery);
		this.paginator = new Paginator<T>();

		/**
		 * Subscribe to state changes and reset the pagination
		 * Note: Subscription will trigger the first emission
		 */
		this.subs.push(
			this.state$.subscribe((state) => {
				log.debug('Query state changed', state);
				this.paginator.reset();
			})
		);

		/**
		 * Subscribe to the collection changes and update the search (if any)
		 * This doesn't work and would cause a loop of calling query
		 *
		 * I need to turn orama into an oberservable and subscribe to it in the $
		 */
		// this.collection.$.subscribe((changeEvent) => {
		// 	if (isString(this.queryState$.value?.search)) {
		// 		this.search(this.queryState$.value?.search);
		// 	}
		// });

		/**
		 * Register hooks
		 */
		const allowedHookNames = ['preQuerySelector', 'postQueryResult'];
		Object.entries(hooks).forEach(([hookName, hookFunction]) => {
			if (allowedHookNames.includes(hookName)) {
				this.addHook(hookName, hookFunction);
			}
		});
	}

	setCollection<T>(collection: RxCollection<T, object, object>): this {
		// TODO - this would have to create a new ObservableResource, do we really need this?
		this.collection = collection;
		return this;
	}
	z;

	addHook(type: keyof HookTypes, fn: any) {
		this.hooks[type] = fn;
	}

	updateState(newState: QueryState) {
		this.queryState$.next(removeNulls(newState));
	}

	where(field: string, value: any): this {
		this.whereClauses.push({ field, value });

		// add the new selector to the current state and emit it
		const newState = {
			...this.queryState$.value,
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
				...this.queryState$.value,
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
				...this.queryState$.value,
				sortBy: lastField,
				sortDirection: lastDirection,
			});
		}

		return this;
	}

	async search(query: string | Record<string, any>) {
		// if (typeof query === 'string') {
		// 	if (query.trim() === '') {
		// 		this.whereClauses = this.whereClauses.filter((clause) => clause.field !== 'uuid');
		// 	} else {
		// 		const { hits } = await this.collection.search(query);
		// 		const uuids = hits.map((hit: any) => hit.id);
		// 		this.whereClauses.push({ field: 'uuid', value: { $in: uuids } });
		// 	}
		// }
		this.updateState({
			...this.currentState,
			selector: this.getSelectorFromClauses(),
			search: query,
		});
	}

	debouncedSearch = debounce(this.search, 250);

	private getSelectorFromClauses(): Record<string, any> {
		const selector: Record<string, any> = {};
		this.whereClauses.forEach((clause) => {
			selector[clause.field] = clause.value;
		});
		return selector;
	}

	async exec(): Promise<any[]> {
		if (!this.collection) throw new Error('Collection is not set');
		const selector = this.queryState$.value?.selector || {};
		return this.collection.find({ selector }).exec();
	}

	get currentState(): QueryState | undefined {
		return this.queryState$.value;
	}

	get state$(): Observable<QueryState | undefined> {
		return this.queryState$.pipe(
			skip(1),
			distinctUntilChanged((x, y) => stringifyWithSortedKeys(x) === stringifyWithSortedKeys(y))
		);
	}

	get $() {
		return this.queryState$.pipe(
			switchMap((queryState) => {
				if (!this.collection || !queryState) {
					throw new Error('Collection or queryState is not set');
				}

				/**
				 *  If there's a search query, we need to subscribe to the search observable
				 */
				let selector$ = of(queryState.selector || {});
				if (isString(queryState.search)) {
					selector$ = this.collection.search$(queryState.search).pipe(
						map(({ hits }) => {
							const uuids = hits.map((hit: any) => hit.id);
							return {
								...(queryState.selector || {}),
								uuid: { $in: uuids },
							};
						})
					);
				}

				return selector$.pipe(
					switchMap((s) => {
						const selector = this.hooks?.preQuerySelector
							? this.hooks.preQuerySelector(s, queryState)
							: s;

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
									sortedResult = orderBy(result, [sortBy], [sortDirection]);
								}

								return sortedResult;
							})
						);
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
			}),
			/**
			 * Many components will subscribe to this observable, so we want to share the same
			 */
			shareReplay(1)
		);
	}

	get paginated$(): Observable<RxDocument<T>[]> {
		return this.paginator.paginate(this.$);
	}

	// nextPage(): void {
	// 	return this.paginator.nextPage();
	// }

	getApiQueryParams() {
		const params: Record<string, any> = {};
		this.whereClauses.forEach((clause) => {
			params[clause.field] = clause.value;
		});
		params.orderby = this.queryState$.value?.sortBy;
		params.order = this.queryState$.value?.sortDirection;
		if (typeof this.queryState$.value?.search === 'string') {
			params.search = this.queryState$.value?.search;
		}
		return params;
	}

	get count$() {
		return this.$.pipe(
			map((docs) => docs.length),
			distinctUntilChanged()
		);
	}

	get total$() {
		return this.$.pipe(
			map((docs) => docs.length),
			distinctUntilChanged()
		);
	}

	// clean up subscriptions
	cancel() {
		this.subs.forEach((sub) => sub.unsubscribe());

		// do I need to complete all the observables?
		this.queryState$.complete();
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
}

export { Query };
