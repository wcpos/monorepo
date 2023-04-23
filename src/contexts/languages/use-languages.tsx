import * as React from 'react';

import { LanguagesContext } from './provider';

export const useLanguages = () => {
	const context = React.useContext(LanguagesContext);
	if (!context) {
		throw new Error(`useLanguages must be called within LanguagesProvider`);
	}

	return context;
};
