import * as React from 'react';
import DatabaseService from '@wcpos/common/src/database';

type SiteDocument = import('@wcpos/common/src/database').SiteDocument;

interface SiteContextProps {
	site?: SiteDocument;
	setSite: React.Dispatch<React.SetStateAction<SiteDocument | undefined>>;
}

export const SiteContext = React.createContext<SiteContextProps | null>(null);

interface UserProviderProps {
	children: React.ReactNode;
}

const SiteProvider = ({ children }: UserProviderProps) => {
	const [site, setSite] = React.useState<SiteDocument | undefined>();

	// React.useEffect(() => {
	// 	async function getLastUser() {
	// 		const userDB = await DatabaseService.getUserDB();
	// 	}

	// 	getLastUser();
	// }, []);

	return <SiteContext.Provider value={{ site, setSite }}>{children}</SiteContext.Provider>;
};

export default SiteProvider;
