import * as React from 'react';

type Props = {
	children: React.ReactNode;
};

export const Body: React.FC<Props> = ({ children }) => {
	return <>{children}</>;
};

Body.displayName = 'Table.Body';
