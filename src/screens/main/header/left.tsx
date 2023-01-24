import * as React from 'react';
import { useWindowDimensions } from 'react-native';

import { useNavigation, DrawerActions } from '@react-navigation/native';
import { useTheme } from 'styled-components/native';

import Box from '@wcpos/components/src/box';
import Button from '@wcpos/components/src/button';
import Icon from '@wcpos/components/src/icon';
// import Logo from '@wcpos/components/src/logo';

import { t } from '../../../lib/translations';

const HeaderLeft = () => {
	const { width } = useWindowDimensions();
	const theme = useTheme();
	const navigation = useNavigation();
	const [drawerOpen, setDrawerOpen] = React.useState(false);

	/**
	 * This is a bit of a hack
	 * @TODO - how to tell drawer status of child navigator?
	 */
	const handleToggleDrawer = React.useCallback(() => {
		navigation.dispatch(DrawerActions.toggleDrawer());
		// setDrawerOpen((s) => !s); // doesn't track clickoutside
	}, [navigation]);

	/**
	 *
	 */
	if (width < theme.screens.small) {
		return (
			<Box padding="small">
				<Icon name={drawerOpen ? 'xmark' : 'bars'} onPress={handleToggleDrawer} type="inverse" />
			</Box>
		);
	}

	/**
	 *
	 */
	if (width < theme.screens.medium) {
		return (
			<Box padding="small" paddingLeft="none">
				<Button
					onPress={handleToggleDrawer}
					title={t('Menu', { _tags: 'core' })}
					accessoryLeft={<Icon name={drawerOpen ? 'xmark' : 'bars'} type="inverse" />}
					type="headerBackground"
					style={{ padding: 0 }}
				/>
			</Box>
		);
	}

	return null;
};

export default HeaderLeft;
