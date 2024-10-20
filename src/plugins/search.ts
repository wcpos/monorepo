import { RxPlugin } from 'rxdb';
import { addFulltextSearch } from 'rxdb-premium/plugins/flexsearch';

/**
 * A search plugin for RxDB that supports dynamic locale changes.
 */
export const searchPlugin: RxPlugin = {
	name: 'search',
	rxdb: true,
	prototypes: {
		RxCollection(proto) {
			/**
			 * Initializes or retrieves a FlexSearch instance for a given locale.
			 * @param {string} locale - The locale for which to initialize or retrieve the search instance.
			 * @returns {Promise<any>} - The FlexSearch instance for the specified locale.
			 */
			proto.initSearch = async function (locale = 'en') {
				// take first 2 chars of locale
				locale = locale.slice(0, 2);

				// Initialize the _searchInstances map if it doesn't exist
				if (!this._searchInstances) {
					this._searchInstances = new Map();
				}

				// If a search instance for the locale already exists, return it
				if (this._searchInstances.has(locale)) {
					return this._searchInstances.get(locale);
				}

				// Initialize a new FlexSearch instance for the locale
				const searchInstance = await addFulltextSearch({
					identifier: `${this.name}-search-${locale}`,
					collection: this,
					docToString: (doc) => {
						return this.options.searchFields.map((field) => doc[field] || '').join(' ');
					},
					indexOptions: {
						tokenize: 'full',
						language: locale,
					},
				});

				// Store the search instance in the map
				this._searchInstances.set(locale, searchInstance);

				// Optionally, set the active locale
				this._activeLocale = locale;

				return searchInstance;
			};

			/**
			 * Sets the active locale for searching.
			 * Initializes the search instance for the new locale if not already done.
			 * @param {string} locale - The new locale to set.
			 * @returns {Promise<any>} - The FlexSearch instance for the new locale.
			 */
			proto.setLocale = async function (locale) {
				const searchInstance = await this.initSearch(locale);
				this._activeLocale = locale;
				return searchInstance;
			};

			/**
			 * Performs a search using the active locale's FlexSearch instance.
			 * @param {string} query - The search query.
			 * @returns {Promise<Array>} - The search results.
			 */
			proto.search = async function (query) {
				if (!this._activeLocale) {
					throw new Error('Search locale not initialized. Call setLocale(locale) first.');
				}

				const searchInstance = this._searchInstances.get(this._activeLocale);
				if (!searchInstance) {
					throw new Error(`Search instance for locale '${this._activeLocale}' is not initialized.`);
				}

				// Perform the search using the FlexSearch instance
				return await searchInstance.search(query);
			};
		},
	},
	overwritable: {},
	hooks: {
		createRxCollection: {
			after: async ({ collection }) => {
				if (!Array.isArray(collection.options.searchFields)) {
					return;
				}

				// Initialize the _searchInstances map
				collection._searchInstances = new Map();

				// Optionally, set a default locale or leave it to be set later
				// Example: Initialize with default locale 'en'
				// await collection.setLocale('en');
			},
		},
	},
};
