import * as React from 'react';

import { getLocales } from 'expo-localization';
import { useObservableState } from 'observable-hooks';
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

	const locale = useObservableState(
		store ? store.locale$ : of(systemLocale),
		store?.locale ?? systemLocale
	);

	return { locale };
};
