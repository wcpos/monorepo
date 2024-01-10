import { count, search } from '@orama/orama';
import defaults from 'lodash/defaults';
import { Subscription, Subject, Observable, BehaviorSubject, from } from 'rxjs';
import { map, distinctUntilChanged, switchMap, tap } from 'rxjs/operators';

import { maybeCreateSearchDB } from './search-dbs';

import type { Orama, Results } from '@orama/orama';

/**
 * Orama Search Service for WooCommerce POS
 *
 * This provides tokenised search functionality for the POS.
 * - Searching via local storage is limited, ie: no fuzzy search, no tokenisation
 * - We need the locale to provide a better search experience
 * - This could be a rxdb plugin, but bringing it into the app give us more control
 */
export class Search {
	private searchDBPromise: Promise<Orama<any>>;
	private searchFields: string[];

	/**
	 *
	 */
	public readonly subs: Subscription[] = [];
	public readonly subjects = {
		result: new BehaviorSubject<string[]>([]),
		error: new Subject<Error>(),
	};

	constructor({ collection, locale }) {
		this.searchFields = collection.options.searchFields || [];

		// if this.searchFields is empty, there is no point in continuing
		if (this.searchFields.length === 0) {
			return;
		}

		// init search db
		this.searchDBPromise = maybeCreateSearchDB(collection, locale);
	}

	async search(term: string, options: object = {}, searchDB) {
		const limit = await count(searchDB);
		const config = defaults(
			{
				properties: '*', // Search all fields by default
				limit, // Orama defaults to 10
				threshold: 0,
			},
			options
		);

		/**
		 * @TODO - search takes a language param, should I use that rather than create new searchDBs?
		 */
		return search(searchDB, { term, ...config });
	}

	/**
	 * For each search, we construct a new observable
	 * - we don't know for sure if the searchDB has been created
	 * - we also need to emit new results if the searchDB changes
	 */
	search$(term: string, options = {}): Observable<Results<any>> {
		return from(this.searchDBPromise).pipe(
			switchMap((searchDB) =>
				searchDB.changed$.pipe(switchMap(() => from(this.search(term, options, searchDB))))
			),
			distinctUntilChanged()
		);
	}

	/**
	 *
	 */
	cancel() {
		this.subs.forEach((sub) => sub.unsubscribe());

		this.subjects.result.complete();
		this.subjects.error.complete();
	}
}
