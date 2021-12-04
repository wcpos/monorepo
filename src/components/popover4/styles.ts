import styled from 'styled-components/native';
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withTiming,
	SlideInDown,
} from 'react-native-reanimated';

export const AnimatedTriggerDuplicate = styled.View`
	position: absolute;
	z-index: ${({ theme }) => theme.POPOVER_Z_INDEX};
`;

export const Container = styled.View`
	position: absolute;
	min-width: 100px;
`;

export const Popover = styled.View`
	background-color: ${({ theme }) => theme.POPOVER_BACKGROUND_COLOR};
	padding: 5px;
	border-radius: 3px;
	
	shadow-offset: { width: 0, height: 1 };
	shadow-opacity: 0.22;
	shadow-radius: 7.5px;
	shadow-color: #000;
	elevation: 5;
`;
