import * as React from 'react';
// @ts-ignore
import { PressableProps } from 'react-native-web';
import * as Styled from './styles';

/**
 *
 */
export const Pressable = (props: PressableProps) => {
	return <Styled.Pressable {...props} />;
};
