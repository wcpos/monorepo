import React from 'react';
import useLastUser from '../use-last-user';

export const DatabaseContext = React.createContext({});

type Props = {
	children: React.ReactNode;
};

/**
 *
 */
const DatabaseProvider = ({ children }: Props) => {
	const [lastUser, setLastUser] = useLastUser();

	return (
		<DatabaseContext.Provider value={{ user: lastUser, setUser: setLastUser }}>
			{children}
		</DatabaseContext.Provider>
	);
};

export default DatabaseProvider;
