import styled from 'styled-components/native';
import Animated from 'react-native-reanimated';

export const Container = styled.View`
	height: 100%;
	flex-direction: row;
	padding: ${({ theme }) => `${theme.PAGE_MAIN_PADDING_Y} ${theme.PAGE_MAIN_PADDING_X}`};
`;

export const ProductsColumn = styled.View`
	height: 100%;
	flex-grow: 0;
	flex-shrink: 0;
	flex-basis: 60%;
`;

export const CartColumn = styled.View`
	height: 100%;
	flex: 1;
`;

export const CheckoutColumn = styled.View`
	height: 100%;
	flex: 1;
`;

export const ResizableColumn = styled(Animated.View)`
	height: 100%;
	flex-grow: 0;
	flex-shrink: 0;
`;

export const Column = styled.View`
	height: 100%;
	flex: 1;
`;

export const Gutter = styled(Animated.View)`
	position: absolute;
`;
