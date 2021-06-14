import * as React from 'react';
import Row from './row';

const Body: React.FC = ({ children }) => {
	return <>{children}</>;
};

Body.displayName = 'Table.Body';

export default Object.assign(Body, { Row });
