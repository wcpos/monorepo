import * as React from 'react';
import { Arrow, ArrowProps } from './arrow';

export default {
	title: 'Components/Arrow',
	component: Arrow,
};

export const BasicUsage = (props: ArrowProps) => <Arrow {...props} />;
