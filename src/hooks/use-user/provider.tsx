import React from 'react';

export interface User {
	first_name: string;
	last_name: string;
	email: string;
}

export const UserContext = React.createContext();

interface Props {
	children: React.ReactNode;
}

/**
 *
 */
const UserProvider: React.FC<Props> = ({ children }) => {
	const [user, setUser] = React.useState<User | undefined>();
	// React.useEffect(() => {}, []);

	const logout = () => {
		setUser({
			authenticated: false,
		});
	};

	return <UserContext.Provider value={{ user, setUser, logout }}>{children}</UserContext.Provider>;
};

export default UserProvider;
