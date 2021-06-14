import * as React from 'react';
import HeaderRow from './header-row';

const Header: React.FC = ({ children }) => {
	return <>{children}</>;
};

Header.displayName = 'Table.Header';

export default Object.assign(Header, { Row: HeaderRow });
