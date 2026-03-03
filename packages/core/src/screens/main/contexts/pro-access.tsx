import { createContext, useContext } from 'react';

interface ProAccessContextValue {
	readOnly: boolean;
}

const ProAccessContext = createContext<ProAccessContextValue | null>(null);

export const ProAccessProvider = ProAccessContext.Provider;

export function useProAccess(): ProAccessContextValue {
	const context = useContext(ProAccessContext);
	if (context === null) {
		throw new Error('useProAccess must be used within a ProAccessProvider');
	}
	return context;
}
