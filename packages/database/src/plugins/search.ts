import get from 'lodash/get';
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
				if (!Array.isArray(this.options.searchFields)) {
					return null; // Return null if searchFields is not defined
				}

				// Take the first 2 chars of the locale
				locale = locale.slice(0, 2);

				// Initialize the _searchInstances map if it doesn't exist
				if (!this._searchInstances) {
					this._searchInstances = new Map();
				}

				// Initialize the _searchPromises map if it doesn't exist (to cache pending promises)
				if (!this._searchPromises) {
					this._searchPromises = new Map();
				}

				// If a search instance for the locale already exists, return it
				if (this._searchInstances.has(locale)) {
					return this._searchInstances.get(locale);
				}

				// If a search instance promise is pending for the locale, await it and return the result
				if (this._searchPromises.has(locale)) {
					return this._searchPromises.get(locale);
				}

				// Create the promise and store it in _searchPromises
				const searchPromise = (async () => {
					try {
						const searchInstance = await addFulltextSearch({
							identifier: `${this.name}-search-${locale}`,
							collection: this,
							docToString: (doc) => {
								/**
								 * @NOTE - fields can be nested, so we use lodash get to access them
								 */
								return this.options.searchFields.map((field) => get(doc, field) || '').join(' ');
							},
							initialization: 'lazy',
							indexOptions: {
								preset: 'performance',
								tokenize: 'forward',
								language: locale,
							},
						});

						// Store the search instance in the map once created
						this._searchInstances.set(locale, searchInstance);

						// Remove the promise from the _searchPromises map
						this._searchPromises.delete(locale);

						return searchInstance;
					} catch (error) {
						console.error('Error initializing FlexSearch instance:', error);
						this._searchPromises.delete(locale);
						throw error;
					}
				})();

				// Register the cleanup function with onDestroy
				if (!this._cleanupRegistered) {
					this._cleanupRegistered = true;

					this.onClose.push(async () => {
						if (this._searchInstances) {
							for (const [locale, searchInstance] of this._searchInstances.entries()) {
								// Destroy the search instance's collection if it exists
								if (
									searchInstance.collection &&
									typeof searchInstance.collection.destroy === 'function'
								) {
									await searchInstance.collection.destroy();
								}
								// Remove the search instance from the map
								this._searchInstances.delete(locale);
							}
						}

						// Clear any pending search promises
						if (this._searchPromises) {
							this._searchPromises.clear();
						}
					});
				}

				// Store the promise in the _searchPromises map
				this._searchPromises.set(locale, searchPromise);

				return searchPromise;
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
};
