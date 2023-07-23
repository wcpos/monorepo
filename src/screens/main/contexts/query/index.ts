import { orderBy } from '@shelf/fast-natural-order-by';
import debounce from 'lodash/debounce';
import isEmpty from 'lodash/isEmpty';
import isEqual from 'lodash/isEqual';
import { RxCollection, RxDocument } from 'rxdb';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { switchMap, map, distinctUntilChanged, shareReplay } from 'rxjs/operators';

import log from '@wcpos/utils/src/logger';

import { removeNulls } from './query.helpers';

type SortDirection = import('@wcpos/components/src/table').SortDirection;

export interface QueryState {
	search?: string | Record<string, any>;
	sortBy?: string;
	sortDirection?: SortDirection;
	selector?: import('rxdb').MangoQuery['selector'];
	limit?: number;
	skip?: number;
}

type WhereClause = { field: string; value: any };

/**
 *
 */
class Query<T> {
	private _whereClauses: WhereClause[] = [];
	private _collection: RxCollection<any, object, object> | undefined;
	private _queryState$ = new BehaviorSubject<QueryState | undefined>(undefined);

	constructor(private queryState: QueryState) {
		this.updateState(queryState);
	}

	private updateState(newState: QueryState) {
		this._queryState$.next(removeNulls(newState));
	}

	collection<T>(collection: RxCollection<T, object, object>): this {
		this._collection = collection;
		return this;
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
				const { hits } = await this._collection.search(query);
				const uuids = hits.map((hit) => hit.id);
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
		log.debug('selector', selector);
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
		return this._queryState$.asObservable();
	}

	get $() {
		return this._queryState$.pipe(
			switchMap((queryState) => {
				if (!this._collection || !queryState) return [];
				const selector = queryState.selector || {};

				return this._collection
					.find({ selector })
					.$.pipe(map((result) => ({ result, queryState })));
			}),
			/**
			 * NoSQL sorting wasn't working for string numbers, so I'm handling sorting here
			 */
			map(({ result, queryState }) => {
				const { sortBy, sortDirection } = queryState;
				return orderBy(result, [sortBy], [sortDirection]);
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

	getApiQueryParams() {
		const params: Record<string, any> = {};
		this._whereClauses.forEach((clause) => {
			params[clause.field] = clause.value;
		});
		return params;
	}
}

export { Query };
