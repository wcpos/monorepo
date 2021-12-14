import * as React from 'react';
import { Pressable } from 'react-native';
import * as Styled from './styles';
import Icon from '../icon';

export interface GutterProps {
	children?: React.ReactNode;
	style?: any;
}

export const Gutter = ({ children, style }: GutterProps) => {
	return (
		<Pressable style={[{ flexDirection: 'row', height: '100%' }, style]}>
			{({
				// @ts-ignore
				hovered,
			}) => (
				<Styled.View hovered={hovered}>
					{children || (
						<Icon name="gripLinesVertical" size="small" type={hovered ? 'primary' : 'secondary'} />
					)}
				</Styled.View>
			)}
		</Pressable>
	);
};
