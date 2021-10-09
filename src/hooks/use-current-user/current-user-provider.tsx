import * as React from 'react';

export const CurrentUserContext = React.createContext<any>(null);

interface ICurrentUserProps {
	children: React.ReactNode;
}

const CurrentUserProvider = ({ children }: ICurrentUserProps) => {
	const value = {};

	return <CurrentUserContext.Provider value={value}>{children}</CurrentUserContext.Provider>;
};

export default CurrentUserProvider;
