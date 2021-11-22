import styled from 'styled-components/native';
import Animated from 'react-native-reanimated';

export const RippleEffect = styled(Animated.View)({
	top: -25,
	left: -5,
	width: 50,
	height: 50,
	borderRadius: 25,
	opacity: 0.2,
	backgroundColor: 'black',
});
