import * as React from 'react';
import { ViewStyle } from 'react-native';
import { useTheme } from 'styled-components/native';
import * as Styled from './styles';

export interface ItemProps {
	/**
	 *
	 */
	children?: string;
	/**
	 *
	 */
	label?: string;
	/**
	 *
	 */
	onPress?: (value: any) => void;
	/**
	 *
	 */
	action?: () => void;
	/**
	 *
	 */
	style?: ViewStyle;
}

export const Item = ({ children, label = '', onPress, action, style }: ItemProps) => {
	const theme = useTheme();

	const handlePress = () => {
		if (typeof action === 'function') {
			action();
		}
		if (typeof onPress === 'function') {
			onPress(label);
		}
	};

	return (
		<Styled.Item
			onPress={handlePress}
			style={({ hovered }: { hovered: boolean }) => [
				{ backgroundColor: hovered ? theme.MENU_ITEM_HOVER_BACKGROUND_COLOR : 'transparent' },
				style,
			]}
		>
			<Styled.Label>{children || label}</Styled.Label>
		</Styled.Item>
	);
};
