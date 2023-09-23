import * as React from 'react';

import { TxNative, createNativeInstance } from '@transifex/native';
import { useObservableSuspense, ObservableResource } from 'observable-hooks';
import { switchMap } from 'rxjs/operators';

import CustomCache from './cache';
import { useLocale } from '../../hooks/use-locale';
import { userDB$ } from '../../hydrate-data/global-user';
import { useAppState } from '../app-state';

export const TranslationContext = React.createContext<TxNative['translate']>(null);

/**
 *
 */
const localTranslations$ = userDB$.pipe(switchMap((userDB) => userDB.getLocal$('translations')));
const localTranslationsResource = new ObservableResource(localTranslations$);

/**
 * This is a stripped down version of the TransifexProvider
 *
 * Languages don't change that often so using context and state seems like overkill.
 * Instead, we'll render the whole app and keep the translation as a pure function.
 *
 * - load the translations from local storage (if any)
 */
export const TranslationProvider = ({ children }) => {
	const { userDB } = useAppState();
	const cachedTranslationsDoc = useObservableSuspense(localTranslationsResource);
	const version = cachedTranslationsDoc?.getLatest().revision;
	const { locale } = useLocale();

	/**
	 *
	 */
	const txInstance = React.useMemo(() => {
		return createNativeInstance({
			token: '1/09853773ef9cda3be96c8c451857172f26927c0f',
			cache: new CustomCache(userDB), // pass in the userDB so we can save the translations
			filterTags: 'core',
		});
	}, [userDB]);

	/**
	 * If we have translations, manually update the cache
	 */
	const cachedTranslations = cachedTranslationsDoc?.get(locale);
	if (cachedTranslations) {
		txInstance.cache.update(
			locale,
			cachedTranslations,
			// special case to manually update the CustomCache
			true
		);
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
			value={txInstance.translate.bind(txInstance)}
		>
			{children}
		</TranslationContext.Provider>
	);
};
