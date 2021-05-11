import * as React from 'react';
import { Pressable } from 'react-native';
import * as Styled from './styles';
import Icon from '../icon';

export interface GutterProps {
	children?: React.ReactNode;
}

export const Gutter = ({ children }: GutterProps) => {
	return (
		<Pressable style={{ flexDirection: 'row', height: '100%' }}>
			{({
				// @ts-ignore
				hovered,
			}) => <Styled.View hovered={hovered}>{children || <Icon name="more-vert" />}</Styled.View>}
		</Pressable>
	);
};
