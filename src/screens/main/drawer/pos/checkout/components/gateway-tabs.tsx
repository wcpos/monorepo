import * as React from 'react';

import Tabs from '@wcpos/components/src/tabs';

import PaymentWebview from './payment-webview';
import useGateways from '../../../../../../contexts/gateways';

const GatewayTabs = () => {
	const [index, setIndex] = React.useState(0);
	const [loading, setLoading] = React.useState(true);
	const { data: gateways } = useGateways();

	/**
	 *
	 */
	const routes = React.useMemo(() => {
		return gateways.map((gateway) => {
			return {
				key: gateway.id,
				title: gateway.title,
			};
		});
	}, [gateways]);

	/**
	 *
	 */
	return (
		<Tabs
			onIndexChange={(idx) => {
				setLoading(true);
				setIndex(idx);
			}}
			navigationState={{ index, routes }}
			renderScene={({ route }) => <PaymentWebview gatewayID={route.key} />}
			tabBarPosition="left"
			style={{ minHeight: 400 }}
		/>
	);
};

export default GatewayTabs;
