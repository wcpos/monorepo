import * as React from 'react';
import { useNavigation, StackActions } from '@react-navigation/native';
import Tabs from '@wcpos/components/src/tabs';
import Modal from '@wcpos/components/src/modal';
import { GeneralSettings } from './general';
import { TaxSettings } from './tax';

const tabsMap = {
	general: GeneralSettings,
	tax: TaxSettings,
};

export const SettingsTabs = () => {
	const [index, setIndex] = React.useState(0);
	const navigation = useNavigation();

	const renderScene = React.useCallback(({ route }) => {
		const Component = tabsMap[route.key];
		return <Component />;
	}, []);

	const routes = React.useMemo(
		() => [
			{ key: 'general', title: 'General Settings' },
			{ key: 'tax', title: 'Tax Settings' },
		],
		[]
	);

	return (
		<Modal
			size="large"
			alwaysOpen
			title="Settings"
			onClose={() => navigation.dispatch(StackActions.pop(1))}
		>
			<Tabs<typeof routes[number]>
				navigationState={{ index, routes }}
				renderScene={renderScene}
				onIndexChange={setIndex}
			/>
		</Modal>
	);
};
