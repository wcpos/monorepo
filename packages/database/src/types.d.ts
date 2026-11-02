/// <reference path="./rxdb-premium.d.ts" />

import type { Observable } from 'rxjs';
import type { RxCollection, RxDocument } from 'rxdb';

/**
 * Extensions added by plugins to RxCollection.
 * Augmented on RxCollectionBase so that the generic type alias
 * `type RxCollection<...>` from rxdb is not shadowed.
 */
declare module 'rxdb' {
	interface RxDocumentBase<RxDocType, OrmMethods = {}, Reactivity = unknown> {
		populate$(key: string): Observable<RxDocument[]>;

		toPopulatedJSON(): Promise<Record<string, unknown>>;

		populateResource(key: string): import('observable-hooks').ObservableResource<RxDocument[]>;
	}

	interface RxCollectionBase {
		/**
		 * Parse a WC REST API response, pruning and coercing data to match the schema.
		 * Added by the parse-rest-response plugin.
		 */
		parseRestResponse(json: Record<string, unknown>): Record<string, unknown>;

		/**
		 * Like findOne but works with any query object type (string, object, null).
		 * Added by the find-one-fix plugin.
		 */

		findOneFix(queryObj?: any): any;
	}

	interface RxDatabaseBase {
		/**
		 * Observable that emits when a collection is reset (removed and re-added).
		 * Added by the reset-collection plugin.
		 */
		reset$?: Observable<RxCollection>;
	}
}
