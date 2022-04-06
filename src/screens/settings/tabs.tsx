import * as React from 'react';
import Tabs from '@wcpos/common/src/components/tabs';
import { GeneralSettings } from './general';
import { TaxSettings } from './tax';

export const SettingsTabs = () => {
	const [index, setIndex] = React.useState(0);

	const renderScene = React.useCallback(({ route }) => {
		switch (route.key) {
			case 'general':
				return <GeneralSettings />;
			case 'tax':
				return <TaxSettings />;
			default:
				return null;
		}
	}, []);

	const routes = React.useMemo(
		() => [
			{ key: 'general', title: 'General Settings' },
			{ key: 'tax', title: 'Tax Settings' },
		],
		[]
	);

	return (
		<Tabs<typeof routes[number]>
			navigationState={{ index, routes }}
			renderScene={renderScene}
			onIndexChange={setIndex}
		/>
	);
};
