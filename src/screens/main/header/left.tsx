import * as React from 'react';
import { useNavigation, DrawerActions } from '@react-navigation/native';
import { useWindowDimensions } from 'react-native';
import { useTheme } from 'styled-components/native';
import Button from '@wcpos/components/src/button';
import Icon from '@wcpos/components/src/icon';
import Box from '@wcpos/components/src/box';
import { t } from '@wcpos/core/src/lib/translations';

const HeaderLeft = () => {
	const { width } = useWindowDimensions();
	const navigation = useNavigation();
	const theme = useTheme();

	const openDrawer = React.useCallback(() => {
		navigation.dispatch(DrawerActions.openDrawer());
	}, [navigation]);

	const renderMenuButton = () => {
		if (width < theme.screens.small) {
			return <Icon name="bars" onPress={openDrawer} type="inverse" />;
		}
		if (width < theme.screens.medium) {
			return (
				<Button
					onPress={openDrawer}
					title={t('Menu')}
					accessoryLeft={<Icon name="bars" type="inverse" />}
					type="headerBackground"
					style={{ padding: 0 }}
				/>
			);
		}
		return null;
	};

	return <Box padding="small">{renderMenuButton()}</Box>;
};

export default HeaderLeft;
