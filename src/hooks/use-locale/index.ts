import * as React from 'react';

import { getLocales } from 'expo-localization';
import { useObservableEagerState } from 'observable-hooks';
import { of } from 'rxjs';

import locales from './locales.json';
import { useAppState } from '../../contexts/app-state';

interface Language {
	/**
	 * Transifex locale code, eg: 'en_US', same as WordPress locale code
	 */
	locale: string;
	/**
	 * IETF language tag eg: 'en' or 'en-US'
	 */
	code: string;
	/**
	 * English name of the language
	 */
	name: string;
	/**
	 * Native name of the language
	 */
	nativeName: string;
}

/**
 * Convert system locales to our Transifex locales
 */
const systemLocales = getLocales();
const {
	languageCode, // language code without the region, eg: 'en'
	languageTag, // language code with the region, eg: 'en-US'
} = systemLocales[0];
const systemLanguage: Language =
	locales[languageTag.toLowerCase()] || locales[languageCode] || locales['en'];

/**
 *
 */
export const useLocale = () => {
	const { store } = useAppState();

	/**
	 * Store may or may not be available
	 * - get the locale object from the store setting, or the system locale, or fallback to 'en'
	 */
	const storeLocale = useObservableEagerState(store ? store.locale$ : of(null));

	const language = React.useMemo(() => {
		let lang: Language = null;
		if (storeLocale) {
			lang = Object.values(locales).find((l) => l.locale === storeLocale);
		}
		if (!lang) {
			lang = systemLanguage;
		}
		return lang;
	}, [storeLocale]);

	return {
		...language,
		shortCode: language.code.split('-')[0], // eg: 'en' from 'en-US', region removed
		locales, // pass through locales for use in dropdown menus etc
	};
};
