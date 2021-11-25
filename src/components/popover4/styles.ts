import styled from 'styled-components/native';
import Animated from 'react-native-reanimated';
import Pressable from '../pressable';

export const TriggerArea = styled(Animated.View)`
	position: absolute;
	z-index: ${({ theme }) => theme.POPOVER_Z_INDEX};
`;

export const Container = styled.View`
	position: absolute;
	min-width: 100;
`;

export const Popover = styled.View`
	background-color: ${({ theme }) => theme.POPOVER_BACKGROUND_COLOR};
	shadow-offset: { width: 0, height: 1 };
	shadow-opacity: 0.22;
	shadow-radius: 7.5px;
	shadow-color: #000;
	padding: 5px;
	border-radius: 3px;
`;

export const Caret = styled.View`
	width: 10;
	height: 10;
	background-color: white;
	border-radius: 2;
	z-index: 10;
`;
