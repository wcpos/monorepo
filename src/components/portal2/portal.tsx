import * as React from 'react';
import uniqueId from 'lodash/uniqueId';
import { PortalContext } from './provider';

interface Props {
	children: React.ReactNode;
	keyPrefix: string;
}

const Portal = ({ children, keyPrefix = '' }: Props) => {
	const key = React.useMemo(() => uniqueId(keyPrefix), [keyPrefix]);
	const { setComponent } = React.useContext(PortalContext);

	// When content of Component is updated, update it in the Context too
	React.useEffect(() => setComponent(key, children), [children, setComponent, key]);

	// Removes the Component from the DOM once it is unmounted
	React.useEffect(
		() => () => {
			setComponent(key, null);
		},
		[setComponent, key]
	);

	return null;
};

export default Portal;
