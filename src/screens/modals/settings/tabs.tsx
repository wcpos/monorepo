import * as React from 'react';

import { useNavigation, StackActions } from '@react-navigation/native';

import Backdrop from '@wcpos/components/src/backdrop';
import Modal from '@wcpos/components/src/modal';
import Tabs from '@wcpos/components/src/tabs';

import { GeneralSettings } from './general';
import { TaxSettings } from './tax';
import { t } from '../../../lib/translations';

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
		<>
			<Backdrop />
			<Modal.Container>
				<Modal.Header onClose={() => navigation.dispatch(StackActions.pop(1))}>
					{t('Settings', { _tags: 'core' })}
				</Modal.Header>
				<Modal.Content>
					<Tabs<(typeof routes)[number]>
						navigationState={{ index, routes }}
						renderScene={renderScene}
						onIndexChange={setIndex}
					/>
				</Modal.Content>
			</Modal.Container>
		</>
	);
};
