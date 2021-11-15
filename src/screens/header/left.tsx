import * as React from 'react';
import { useNavigation, DrawerActions } from '@react-navigation/native';
import { useWindowDimensions } from 'react-native';
import Button from '@wcpos/common/src/components/button';
import * as Styled from './styles';

const HeaderLeft = () => {
	const { width } = useWindowDimensions();
	const navigation = useNavigation();

	const openDrawer = React.useCallback(() => {
		navigation.dispatch(DrawerActions.openDrawer());
	}, []);

	return (
		<Styled.LeftContainer>
			<Button title="Menu" onPress={openDrawer} />
		</Styled.LeftContainer>
	);
};

export default HeaderLeft;
