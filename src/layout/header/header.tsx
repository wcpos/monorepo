import React from 'react';
import { View, Text } from 'react-native';
import { LeftView, RightView, CenterView, TitleText } from './styles';

interface Props {
	left?: React.ReactNode;
	right?: React.ReactNode;
	title?: string | React.ReactNode;
}

const Header: React.FC<Props> = ({ left, right, title = '' }) => {
	return (
		<>
			<LeftView>
				<Text>Left</Text>
			</LeftView>
			<CenterView>
				<TitleText>{title}</TitleText>
			</CenterView>
			<RightView>
				<Text>Right</Text>
			</RightView>
		</>
	);
};

export default Header;
