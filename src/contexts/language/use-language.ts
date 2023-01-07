import * as React from 'react';

import { useObservableSuspense } from 'observable-hooks';

import { LanguageContext } from './provider';

export const useLanguage = () => {
	const context = React.useContext(LanguageContext);
	if (!context) {
		throw new Error(`useLanguage must be called within LanguageProvider`);
	}

	const locale = useObservableSuspense(context.languageResource);

	return { locale };
};
