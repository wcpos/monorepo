import * as React from 'react';

import { getLocales } from 'expo-localization';
import { useObservableEagerState, useObservableState } from 'observable-hooks';
import { of } from 'rxjs';

import locales from './locales.json';
import { useAppState } from '../../contexts/app-state';

/**
 * Convert system locales to our Transifex locales
 */
const systemLocales = getLocales();
const { languageCode, languageTag } = systemLocales[0];
const { locale: systemLocale } =
	locales[languageTag.toLowerCase()] || locales[languageCode] || locales['en'];

/**
 *
 */
export const useLocale = () => {
	const { store } = useAppState();

	/**
	 * Store may or may not be available
	 */
	const locale = useObservableEagerState(store ? store.locale$ : of(systemLocale));

	return {
		locale,
		locales, // pass through locales for use in dropdown menus etc
	};
};
