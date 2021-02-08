import * as React from 'react';

type Props = {
	children: React.ReactNode;
};

const Header: React.FC<Props> = ({ children }) => {
	return <>{children}</>;
};

export default Header;
