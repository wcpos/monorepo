import * as React from 'react';
import { DrawerHeaderProps } from '@react-navigation/drawer';
import { useWindowDimensions } from 'react-native';
import Text from '@wcpos/common/src/components/text';
import Left from './left';
import Right from './right';
import * as Styled from './styles';

const Header = ({ route }: DrawerHeaderProps) => {
	return (
		<Styled.Header>
			<Left />
			<Styled.TitleContainer>
				<Text weight="bold" type="inverse">
					{route.name}
				</Text>
			</Styled.TitleContainer>
			<Right />
		</Styled.Header>
	);
};

export default Header;
