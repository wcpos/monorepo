import * as React from 'react';

import { onEvent, TxNative, createNativeInstance } from '@transifex/native';
import { getLocales } from 'expo-localization';
import { useObservableState, useObservableSuspense, ObservableResource } from 'observable-hooks';
import { of, lastValueFrom } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import locales from './locales.json';
import { userDB$ } from '../../hydrate-data/global-user';
import { useAppState } from '../app-state';

const txInstance = createNativeInstance({
	token: '1/09853773ef9cda3be96c8c451857172f26927c0f',
	// cache: new CustomCache(),
	filterTags: 'core',
});

export const TranslationContext = React.createContext<TxNative>(null);

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
const localTranslations$ = userDB$.pipe(switchMap((userDB) => userDB.getLocal$('translations')));
const localTranslationsResource = new ObservableResource(localTranslations$);

/**
 * Listen to TRANSLATIONS_FETCHED event and save to local storage
 * @TODO - move this back into the custom cache, so we can use different instances
 */
onEvent('TRANSLATIONS_FETCHED', async ({ localeCode, filterTags }, _tx) => {
	const newTranslation = _tx.cache.getTranslations(localeCode);
	const userDB = await lastValueFrom(userDB$);
	const localTranslations = await userDB.getLocal('translations');
	const currentTranslation = localTranslations?.get(localeCode);

	if (JSON.stringify(newTranslation) !== JSON.stringify(currentTranslation)) {
		await userDB.upsertLocal('translations', {
			...(localTranslations?.toJSON().data ?? {}),
			[localeCode]: newTranslation,
		});
	}
});

/**
 * This is a stripped down version of the TransifexProvider
 *
 * Languages don't change that often so using context and state seems like overkill.
 * Instead, we'll render the whole app and keep the translation as a pure function.
 *
 * - load the translations from local storage (if any)
 */
export const TranslationProvider = ({ children }) => {
	const { store } = useAppState();
	const cachedTranslationsDoc = useObservableSuspense(localTranslationsResource);
	const version = cachedTranslationsDoc?.getLatest().revision;

	/**
	 *
	 */
	// const locale$ = useObservable(
	// 	(inputs$) => inputs$.pipe(map(([s]) => s?.locale ?? systemLocale)),
	// 	[store]
	// );
	const locale = useObservableState(
		store ? store.locale$ : of(systemLocale),
		store?.locale ?? systemLocale
	);

	/**
	 * If we have translations, manually update the cache
	 */
	const cachedTranslations = cachedTranslationsDoc?.get(locale);
	if (cachedTranslations) {
		txInstance.cache.update(locale, cachedTranslations);
	}

	/**
	 * txInstance.setCurrentLocale will trigger a fetch, then update the locale
	 * we don't want to wait for the fetch to complete before rendering the app
	 * so we'll manually update the locale, then trigger the fetch
	 */
	txInstance.currentLocale = locale;

	React.useEffect(() => {
		txInstance.fetchTranslations(locale);
	}, [locale]);

	/**
	 *
	 */
	return (
		<TranslationContext.Provider
			/**
			 * Bit of a hack to force re-render when locale changes
			 * or the translations are updated
			 */
			key={`${locale}-${version}`}
			value={txInstance}
		>
			{children}
		</TranslationContext.Provider>
	);
};
