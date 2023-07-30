import { orderBy } from '@shelf/fast-natural-order-by';
import debounce from 'lodash/debounce';
import isEmpty from 'lodash/isEmpty';
import isEqual from 'lodash/isEqual';
import { ObservableResource } from 'observable-hooks';
import { RxCollection, RxDocument } from 'rxdb';
import { BehaviorSubject, Observable, of, Subject } from 'rxjs';
import { switchMap, map, distinctUntilChanged, shareReplay, tap, skip } from 'rxjs/operators';

import log from '@wcpos/utils/src/logger';

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
	private _whereClauses: WhereClause[] = [];
	private _collection: RxCollection<any, object, object> | undefined;
	private _queryState$ = new BehaviorSubject<QueryState | undefined>(undefined);
	private _hooks: Hooks = {};
	private _observableResource: ObservableResource<any[]>;

	constructor(collection, initialQuery: QueryState) {
		this._collection = collection;
		if (initialQuery.selector) {
			for (const field in initialQuery.selector) {
				this._whereClauses.push({ field, value: initialQuery.selector[field] });
			}
		}
		this.updateState(initialQuery);
		this._observableResource = new ObservableResource(this.$);
	}

	collection<T>(collection: RxCollection<T, object, object>): this {
		// TODO - this would have to create a new ObservableResource, do we really need this?
		this._collection = collection;
		return this;
	}

	addHook(type: keyof HookTypes, fn: any) {
		this._hooks[type] = fn;
	}

	updateState(newState: QueryState) {
		this._queryState$.next(removeNulls(newState));
	}

	where(field: string, value: any): this {
		this._whereClauses.push({ field, value });

		// add the new selector to the current state and emit it
		const newState = {
			...this._queryState$.value,
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
				...this._queryState$.value,
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
				...this._queryState$.value,
				sortBy: lastField,
				sortDirection: lastDirection,
			});
		}

		return this;
	}

	async search(query: string | Record<string, any>) {
		if (typeof query === 'string') {
			if (query.trim() === '') {
				this._whereClauses = this._whereClauses.filter((clause) => clause.field !== 'uuid');
			} else {
				// @ts-ignore
				const { hits } = await this._collection.search(query);
				const uuids = hits.map((hit: any) => hit.id);
				this._whereClauses.push({ field: 'uuid', value: { $in: uuids } });
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
		this._whereClauses.forEach((clause) => {
			selector[clause.field] = clause.value;
		});
		return selector;
	}

	async exec(): Promise<any[]> {
		if (!this._collection) throw new Error('Collection is not set');
		const selector = this._queryState$.value?.selector || {};
		return this._collection.find({ selector }).exec();
	}

	get currentState(): QueryState | undefined {
		return this._queryState$.value;
	}

	get state$(): Observable<QueryState | undefined> {
		return this._queryState$.pipe(
			skip(1),
			distinctUntilChanged((x, y) => stringifyWithSortedKeys(x) === stringifyWithSortedKeys(y))
		);
	}

	get $() {
		return this._queryState$.pipe(
			switchMap((queryState) => {
				if (!this._collection || !queryState) {
					throw new Error('Collection or queryState is not set');
				}

				let selector = queryState.selector || {};
				if (this._hooks.preQuerySelector) {
					selector = this._hooks.preQuerySelector(selector, queryState);
				}

				return this._collection.find({ selector }).$.pipe(
					// tap((res) => console.log(res)),
					map((result) => ({ result, queryState }))
				);
			}),
			/**
			 * NoSQL sorting wasn't working for string numbers, so I'm handling sorting here
			 */
			map(({ result, queryState }) => {
				// Call the hook function if it's registered
				if (this._hooks.postQueryResult) {
					result = this._hooks.postQueryResult(result, queryState);
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

	get resource(): ObservableResource<any[]> {
		return this._observableResource;
	}

	getApiQueryParams() {
		const params: Record<string, any> = {};
		this._whereClauses.forEach((clause) => {
			params[clause.field] = clause.value;
		});
		params.orderby = this._queryState$.value?.sortBy;
		params.order = this._queryState$.value?.sortDirection;
		if (typeof this._queryState$.value?.search === 'string') {
			params.search = this._queryState$.value?.search;
		}
		return params;
	}
}

export { Query };
