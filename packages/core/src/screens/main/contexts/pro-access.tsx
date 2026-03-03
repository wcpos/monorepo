import { createContext, useContext } from 'react';

interface ProAccessContextValue {
	readOnly: boolean;
}

const ProAccessContext = createContext<ProAccessContextValue>({ readOnly: false });

export const ProAccessProvider = ProAccessContext.Provider;

export function useProAccess(): ProAccessContextValue {
	return useContext(ProAccessContext);
}
