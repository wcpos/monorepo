import * as React from 'react';
import { BaseInput, BaseInputProps } from './base-input';

export default {
	title: 'Components/BaseInput',
	component: BaseInput,
};

export const BasicUsage = (props: BaseInputProps) => {
	return <BaseInput {...props} />;
};
