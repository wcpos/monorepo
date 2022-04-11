import * as React from 'react';
import { Slider, SliderProps } from './Slider';

export default {
	title: 'Components/Slider',
	component: Slider,
};

/**
 *
 */
export const BasicUsage = (props: SliderProps) => <Slider {...props} />;

BasicUsage.args = {
	min: 0,
	max: 3000,
	step: 15,
};
