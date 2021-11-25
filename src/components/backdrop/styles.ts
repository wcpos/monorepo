import styled from 'styled-components/native';
import { StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';

export const Backdrop = styled(Animated.View)`
	background - color: ${({ theme }) => theme.BACKDROP_COLOR};
	${{ ...StyleSheet.absoluteFillObject }}
	flex-direction: column;
	align-items: center;
	justify-content: center;
	z-index: ${({ theme }) => theme.BACKDROP_Z_INDEX};
`;
