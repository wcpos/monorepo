import * as React from 'react';
import { action } from '@storybook/addon-actions';
import { TextArea, TextAreaProps } from './textarea';

export default {
	title: 'Components/TextArea',
	component: TextArea,
};

export const BasicUsage = (props: TextAreaProps) => {
	return <TextArea {...props} />;
};
