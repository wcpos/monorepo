import { isRxDocument } from 'rxdb';

/**
 * Custom cache for translations
 */
export default class CustomCache {
	constructor(public readonly translationState) {
		this.translationsByLocale = {};
	}

	/**
	 * Store locale translations in cache
	 *
	 * @param {String} localeCode
	 * @param {Object} translations - Object with translation key:value pairs
	 * @param {String} translations[key] - Translation string
	 */
	async update(localeCode, translations, fromLocalStorage) {
		if (!fromLocalStorage) {
			/**
			 * if updated translations are different from local storage, update local storage
			 */
			const local = this.translationState[localeCode];
			if (JSON.stringify(local) !== JSON.stringify(translations)) {
				await this.translationState.set(localeCode, () => translations);
			}
		}

		const prevTranslations = this.translationsByLocale[localeCode] || {};
		this.translationsByLocale[localeCode] = {
			...prevTranslations,
			...translations,
		};
	}

	/**
	 * Get translations by locale from cache
	 *
	 * @param {String} localeCode
	 * @returns {Object} translations
	 * @returns {String} translations[key]
	 */
	getTranslations(localeCode) {
		return this.translationsByLocale[localeCode] || {};
	}

	/**
	 * Check if locale has translations in cache
	 *
	 * @param {String} localeCode
	 * @returns {Boolean}
	 */
	hasTranslations(localeCode) {
		return !!this.translationsByLocale[localeCode];
	}

	/**
	 * Check if translations are stale and need refreshing
	 *
	 * @param {String} localeCode
	 * @returns {Boolean}
	 */
	isStale(localeCode) {
		return !this.hasTranslations(localeCode);
	}

	/**
	 * Get translation by key. If key does not exist in cache,
	 * return empty string
	 *
	 * @param {String} key
	 * @param {String} localeCode
	 * @returns {String} - translation or empty string
	 */
	get(key, localeCode) {
		return this.getTranslations(localeCode)[key] || '';
	}
}
