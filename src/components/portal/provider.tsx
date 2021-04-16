import * as React from 'react';
// import PortalManager from './manager';

interface PortalContext {
	components: { [key: string]: React.ReactNode };
	setComponent: (key: string, component: null | React.ReactNode) => void;
}

export const PortalContext = React.createContext<PortalContext>({
	components: {},
	setComponent: () => {},
});

interface Props {
	children: React.ReactNode;
}

const Provider = ({ children }: Props) => {
	const [components, setComponents] = React.useState<{ [key: string]: React.ReactNode }>({});

	const setComponent = React.useCallback<PortalContext['setComponent']>(
		(key, component) => {
			setComponents((prev) => ({ ...prev, [key]: component || null }));
		},
		[setComponents]
	);

	return (
		<PortalContext.Provider value={{ components, setComponent }}>
			{children}
			{/* <PortalManager /> */}
		</PortalContext.Provider>
	);
};

export default Provider;
