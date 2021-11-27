import * as React from 'react';
import * as Styled from './styles';

export type PressableProps = import('react-native').PressableProps & {
	onHoverIn?: () => void;
	onHoverOut?: () => void;
};

/**
 *
 */
export const Pressable = (props: PressableProps) => {
	return <Styled.Pressable {...props} />;
};
