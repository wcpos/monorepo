import styled, { css } from 'styled-components/native';
import { StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
// import AnimateableText from 'react-native-animateable-text';
import { CURSOR_HALF_WIDTH, CURSOR_WIDTH } from './constants';
import Text from '../text';

const Colors = {
	TRANSPARENT: '#0000',
	WHITE: '#FFF',
	WHITE_40: '#FFF4',
	GREEN: 'green',
	GREY: '#96959B',
	GREY2: '#F1F3F5',
	PRIMARY: '#A6D9AF',
	PRIMARY_LIGHT: '#25B53F',
	TOOLTIP_BLACK: '#1C1C1C',
};

export const Container = styled.View({
	height: 42,
	paddingTop: 8,
	width: '100%',
});

export const Row = styled.View({
	flexDirection: 'row',
	justifyContent: 'space-between',
	paddingTop: 12,
});

export const ActiveSliderLine = styled(Animated.View)({
	height: 4,
	borderRadius: 4,
	backgroundColor: Colors.PRIMARY,
});

export const AbsoluteView = styled(Animated.View)({
	...StyleSheet.absoluteFillObject,
});

// container region is bigger than cursor element to make pan gesture handling easier
export const CursorContainer = styled(Animated.View)({
	position: 'absolute',
	top: -18,
	width: 40,
	height: 40,
});

export const CursorElement = styled.View({
	top: CURSOR_HALF_WIDTH,
	left: CURSOR_HALF_WIDTH,
	width: CURSOR_WIDTH,
	height: CURSOR_WIDTH,
	borderRadius: CURSOR_HALF_WIDTH,
	backgroundColor: Colors.PRIMARY_LIGHT,
	elevation: 4,
});

export const RippleEffect = styled(Animated.View)({
	top: -25,
	left: -5,
	width: 50,
	height: 50,
	borderRadius: 25,
	opacity: 0.2,
	backgroundColor: Colors.PRIMARY_LIGHT,
});

export const SliderGestureContainer = styled.View({
	position: 'absolute',
	top: -14,
	width: '100%',
	height: 32,
});

export const SliderLineComponent = styled.View({
	height: 4,
	borderRadius: 4,
	backgroundColor: Colors.GREY2,
});

// export const StyledText = styled(AnimateableText)({
// 	// export const StyledText = styled(Text)({
// 	textAlign: 'center',
// 	color: Colors.WHITE,
// 	marginTop: 8,
// });

export const TooltipCloud = styled(Animated.View)({
	top: -54,
	width: 64,
	height: 36,
	borderRadius: 8,
	backgroundColor: Colors.TOOLTIP_BLACK,
});

export const TooltipTriangle = styled(Animated.View)({
	top: -54,
	borderTopWidth: 7,
	borderTopColor: Colors.TOOLTIP_BLACK,
	borderLeftWidth: 7,
	borderLeftColor: Colors.TRANSPARENT,
	borderRightWidth: 7,
	borderRightColor: Colors.TRANSPARENT,
	height: 0,
	width: 0,
});
