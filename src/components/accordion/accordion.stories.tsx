import * as React from 'react';
import { Accordion, AccordionProps } from './accordion';

export default {
	title: 'Components/Accordion',
	component: Accordion,
};

export const BasicUsage = (props: AccordionProps) => <Accordion {...props} />;
BasicUsage.args = {
	items: [
		{
			label: 'Label 1',
			content: 'Content 1',
		},
		{
			label: 'Label 2',
			content: 'Content 2',
		},
		{
			label: 'Label 3',
			content: 'Content 3',
		},
	],
};
