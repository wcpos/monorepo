import * as React from 'react';
import { StyleProp, ViewStyle, View } from 'react-native';
import isFunction from 'lodash/isFunction';
import Text from '../text';
import * as Styled from './styles';

export interface TabItemProps {
	title: string | ((props: { focused: boolean }) => React.ReactNode);
	onPress: () => void;
	focused: boolean;
}

const TabItem = ({ onPress, focused, ...props }: TabItemProps) => {
	const title = isFunction(props.title) ? props.title({ focused }) : props.title;

	return (
		<Styled.PressableTabItem onPress={onPress} focused={focused}>
			{typeof title === 'string' ? (
				<Text type={focused ? 'inverse' : 'primary'}>{title}</Text>
			) : (
				title
			)}
		</Styled.PressableTabItem>
	);
};

export default TabItem;
