import * as React from 'react';

type Props = {
	children: React.ReactNode;
};

const Body: React.FC<Props> = ({ children }) => {
	return <>{children}</>;
};

export default Body;
