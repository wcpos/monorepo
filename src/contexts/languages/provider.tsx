import * as React from 'react';

import find from 'lodash/find';

import allLanguages from './locales.json';

export const LanguagesContext = React.createContext<any>(null);

interface LanguagesProviderProps {
	children: React.ReactNode;
	code?: string;
}

const LanguagesProvider = ({ children, code }: LanguagesProviderProps) => {
	const value = code ? find(allLanguages, { locale: code }) : allLanguages;

	return <LanguagesContext.Provider value={value}>{children}</LanguagesContext.Provider>;
};

export default LanguagesProvider;
