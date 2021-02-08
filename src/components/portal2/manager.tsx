import * as React from 'react';
import values from 'lodash/values';
import { PortalContext } from './provider';

const Manager = () => {
	const { components } = React.useContext(PortalContext);
	return <>{values(components)}</>;
};

export default Manager;
