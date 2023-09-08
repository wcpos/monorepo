import * as React from 'react';

import { TranslationContext } from './provider';

export const useT = () => {
	const context = React.useContext(TranslationContext);
	if (!context) {
		throw new Error(`useT must be called within TranslationContext`);
	}

	return context;
};
