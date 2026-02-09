import type { Observable } from 'rxjs';
import type { RxCollection } from 'rxdb';

/**
 * FlexSearch instance returned by rxdb-premium/plugins/flexsearch
 */
export interface FlexSearchInstance {
	/** The internal RxDB collection storing the search index */
	collection: RxCollection;
	/** Perform a search and return matching document IDs */
	search(query: string): Promise<string[]>;
}

/**
 * Extensions added by the search plugin to RxCollection.
 * All methods are optional since they are added at runtime by the plugin.
 */
declare module 'rxdb' {
	interface RxCollection {
		/**
		 * Parse a WC REST API response, pruning and coercing data to match the schema.
		 * Added by the parse-rest-response plugin.
		 */
		parseRestResponse(json: Record<string, unknown>): Record<string, unknown>;

		/**
		 * Initialize or retrieve a FlexSearch instance for a locale.
		 * Returns null if collection has no searchFields configured.
		 * Added by the search plugin.
		 */
		initSearch?(locale?: string): Promise<FlexSearchInstance | null>;

		/**
		 * Set the active locale for searching.
		 * Initializes the search instance if not already done.
		 * Added by the search plugin.
		 */
		setLocale?(locale: string): Promise<FlexSearchInstance | null>;

		/**
		 * Perform a search using the active locale's FlexSearch instance.
		 * Throws if setLocale() hasn't been called.
		 * Added by the search plugin.
		 */
		search?(query: string): Promise<string[]>;

		/**
		 * Recreate the search index for a locale.
		 * Destroys the existing search collection and creates a fresh one.
		 * Useful for recovering from schema migration issues.
		 * Added by the search plugin.
		 */
		recreateSearch?(locale?: string): Promise<FlexSearchInstance | null>;

		/** Internal: Map of locale -> FlexSearchInstance */
		_searchInstances?: Map<string, FlexSearchInstance>;

		/** Internal: Map of locale -> pending initialization Promise */
		_searchPromises?: Map<string, Promise<FlexSearchInstance>>;

		/** Internal: Currently active locale for search */
		_activeLocale?: string;

		/** Internal: Whether cleanup handler has been registered */
		_cleanupRegistered?: boolean;

		/** Internal: Order of locales for LRU eviction */
		_localeLRU?: string[];
	}

	interface RxDatabase {
		/**
		 * Observable that emits when a collection is reset (removed and re-added).
		 * Added by the reset-collection plugin.
		 */
		reset$?: Observable<RxCollection>;
	}
}
