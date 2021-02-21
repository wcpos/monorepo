import * as React from 'react';

type Props = {
	children: React.ReactNode;
};

export const Header: React.FC<Props> = ({ children }) => {
	return <>{children}</>;
};

Header.displayName = 'Table.Header';
