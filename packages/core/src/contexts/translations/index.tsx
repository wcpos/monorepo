import * as React from 'react';

import { createNativeInstance, TxNative } from '@transifex/native';
import { useObservableEagerState } from 'observable-hooks';

import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

import CustomCache from './cache';
import { useLocale } from '../../hooks/use-locale';
import { useAppState } from '../app-state';

const appLogger = getLogger(['wcpos', 'app', 'translations']);

export const TranslationContext = React.createContext<TxNative['translate']>(null);

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
		const fetchTranslations = async () => {
			try {
				await txInstance.fetchTranslations(locale);
			} catch (error) {
				appLogger.error('Error fetching translations', {
					context: {
						errorCode: ERROR_CODES.CONNECTION_REFUSED,
						locale,
						error: error instanceof Error ? error.message : String(error),
					},
				});
			}
		};

		fetchTranslations();
	}, [locale, txInstance]);

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

export const useT = () => {
	const context = React.useContext(TranslationContext);
	if (!context) {
		throw new Error(`useT must be called within TranslationContext`);
	}

	return context;
};
