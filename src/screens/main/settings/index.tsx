import * as React from 'react';

import Tabs from '@wcpos/components/src/tabs';

import { GeneralSettings } from './general';
import { TaxSettings } from './tax';

/**
 *
 */
export const SettingsTabs = () => {
	const [index, setIndex] = React.useState(0);

	return (
		<Tabs
			navigationState={{
				index,
				routes: [
					{ key: 'general', title: 'General Settings', Component: GeneralSettings },
					{ key: 'tax', title: 'Tax Settings', Component: TaxSettings },
				],
			}}
			renderScene={({ route }) => <route.Component />}
			onIndexChange={setIndex}
		/>
	);
};

export default SettingsTabs;
