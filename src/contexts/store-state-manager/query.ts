import { orderBy } from '@shelf/fast-natural-order-by';
import debounce from 'lodash/debounce';
import isEmpty from 'lodash/isEmpty';
import isEqual from 'lodash/isEqual';
import { RxCollection, RxDocument } from 'rxdb';
import { BehaviorSubject, Observable } from 'rxjs';
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
 *
 */
class Query<T> {
	private whereClauses: WhereClause[] = [];
	private queryState$ = new BehaviorSubject<QueryState | undefined>(undefined);
	private hooks: Hooks = {};
	private paginator: Paginator<T>;

	constructor(
		public collection: RxCollection<any, object, object>,
		initialQuery: QueryState
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
		this.state$.subscribe((state) => {
			log.debug('Query state changed', state);
			this.paginator.reset();
		});
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
		if (typeof query === 'string') {
			if (query.trim() === '') {
				this.whereClauses = this.whereClauses.filter((clause) => clause.field !== 'uuid');
			} else {
				// @ts-ignore
				const { hits } = await this.collection.search(query);
				const uuids = hits.map((hit: any) => hit.id);
				this.whereClauses.push({ field: 'uuid', value: { $in: uuids } });
			}
		}
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

				let selector = queryState.selector || {};
				if (this.hooks.preQuerySelector) {
					selector = this.hooks.preQuerySelector(selector, queryState);
				}

				return this.collection.find({ selector }).$.pipe(
					// tap((res) => console.log(res)),
					map((result) => ({ result, queryState }))
				);
			}),
			/**
			 * NoSQL sorting wasn't working for string numbers, so I'm handling sorting here
			 */
			map(({ result, queryState }) => {
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

	nextPage(): void {
		return this.paginator.nextPage();
	}

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
}

export { Query };
