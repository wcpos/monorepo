import React from 'react';
import useLastUser from '../use-last-user';
import useStore from '../use-store';

export const DatabaseContext = React.createContext({});

type Props = {
	children: React.ReactNode;
};

/**
 *
 */
const DatabaseProvider = ({ children }: Props) => {
	const [lastUser, setLastUser] = useLastUser();
	const storeDB = useStore();

	return (
		<DatabaseContext.Provider value={{ user: lastUser, setUser: setLastUser, storeDB }}>
			{children}
		</DatabaseContext.Provider>
	);
};

export default DatabaseProvider;
