import React from 'react';
import { LayoutChangeEvent } from 'react-native';
import { TapGestureHandler, TapGestureHandlerStateChangeEvent } from 'react-native-gesture-handler';
import * as Styled from '../styles';

interface IProps {
	onLayout: (e: LayoutChangeEvent) => void;
	tapGestureHandler: (e: TapGestureHandlerStateChangeEvent) => void;
}

export const SliderLine: React.FC<IProps> = ({ onLayout, tapGestureHandler }) => {
	return (
		<>
			<Styled.SliderLineComponent onLayout={onLayout} />
			<TapGestureHandler onHandlerStateChange={tapGestureHandler}>
				<Styled.SliderGestureContainer />
			</TapGestureHandler>
		</>
	);
};
