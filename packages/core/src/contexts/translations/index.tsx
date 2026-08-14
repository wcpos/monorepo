import * as React from 'react';

import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next, useTranslation } from 'react-i18next';

import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { RxDBBackend } from './rxdb-backend';
import en from './locales/en/core.json';
import { useLocale } from '../../hooks/use-locale';
import { useAppState } from '../app-state';

const translationLogger = getLogger(['wcpos', 'translations']);

export function TranslationProvider({ children }: { children: React.ReactNode }) {
	const { translationsState } = useAppState();
	const { locale } = useLocale();

	/**
	 * ONE instance for the lifetime of the provider (#40).
	 *
	 * Minting a new instance per locale made the language switch depend on React
	 * context propagation: every consumer had to be re-rendered by the context
	 * update to pick up the new instance, and anything still holding the previous
	 * one — a consumer that resolved i18next through react-i18next's module-level
	 * default, or any subtree the context update did not reach — kept rendering
	 * the abandoned instance, which never changes language and so stays in
	 * English forever. It also leaked an instance (plus its listeners and its
	 * backend) on every switch, and re-ran `init()` — with the whole app briefly
	 * suspended on an uninitialised instance — on every switch.
	 *
	 * `changeLanguage` on a stable instance is what react-i18next is built
	 * around: the update is delivered by i18next's own `languageChanged` event,
	 * which every mounted `useTranslation()` consumer is subscribed to, so no
	 * consumer can be left behind on a stale instance.
	 *
	 * The initial `lng` must be the hydrated store locale, not the system locale
	 * — see `first-load-locale.test.tsx`. `translationsState` is created once per
	 * user database (hydration step 1) before this provider mounts, so capturing
	 * it here is stable for the provider's lifetime.
	 */
	const [i18nInstance] = React.useState(() => {
		const instance = createInstance();
		instance
			.use(initReactI18next)
			.use(RxDBBackend)
			.init({
				lng: locale,
				fallbackLng: 'en',
				load: 'currentOnly',
				partialBundledLanguages: true,
				ns: ['core'],
				defaultNS: 'core',
				resources: {
					en: { core: en },
				},
				keySeparator: false,
				nsSeparator: false,
				interpolation: {
					escapeValue: false,
					prefix: '{',
					suffix: '}',
				},
				backend: {
					translationsState,
				},
			})
			.catch((error) =>
				translationLogger.error('Failed to initialize translations', {
					code: ERROR_CODES.UNEXPECTED_ERROR,
					context: { error },
				})
			);
		return instance;
	});
	const requestedLocale = React.useRef(locale);

	/**
	 * Handle locale changes, including reverting while another locale is loading.
	 */
	React.useEffect(() => {
		if (i18nInstance.language !== locale || requestedLocale.current !== locale) {
			requestedLocale.current = locale;
			void i18nInstance.changeLanguage(locale).catch((error) =>
				translationLogger.error('Failed to change language', {
					code: ERROR_CODES.UNEXPECTED_ERROR,
					context: { error },
				})
			);
		}
	}, [locale, i18nInstance]);

	return <I18nextProvider i18n={i18nInstance}>{children}</I18nextProvider>;
}

export const useT = () => {
	const { t } = useTranslation();
	return t;
};
