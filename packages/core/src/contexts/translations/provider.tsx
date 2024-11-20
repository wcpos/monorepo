import * as React from 'react';

import { TxNative, createNativeInstance } from '@transifex/native';
import {
	useObservableSuspense,
	ObservableResource,
	useObservableEagerState,
} from 'observable-hooks';
import { of } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import CustomCache from './cache';
import { useLocale } from '../../hooks/use-locale';
// import { userDB$ } from '../../hydrate-data/global-user';
import { useAppState } from '../app-state';

export const TranslationContext = React.createContext<TxNative['translate']>(null);

/**
 *
 */
// const localTranslations$ = userDB$.pipe(switchMap((userDB) => userDB.getLocal$('translations')));
const localTranslationsResource = new ObservableResource(of(null));

/**
 * This is a stripped down version of the TransifexProvider
 *
 * Languages don't change that often so using context and state seems like overkill.
 * Instead, we'll render the whole app and keep the translation as a pure function.
 *
 * - load the translations from local storage (if any)
 */
export const TranslationProvider = ({ children }) => {
	const { translationsState } = useAppState();
	const { locale } = useLocale();
	const translations = useObservableEagerState(translationsState.get$(locale));

	/**
	 *
	 */
	const txInstance = React.useMemo(() => {
		return createNativeInstance({
			token: '1/09853773ef9cda3be96c8c451857172f26927c0f',
			cache: new CustomCache(translationsState),
			filterTags: 'core',
		});
	}, [translationsState]);

	/**
	 * If we have translations, manually update the cache
	 */
	if (translations) {
		txInstance.cache.update(
			locale,
			translations,
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
			key={locale}
			value={txInstance.translate.bind(txInstance)}
		>
			{children}
		</TranslationContext.Provider>
	);
};
