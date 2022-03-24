import React, { useState } from 'react';
import { Radio, RadioProps } from './radio';

export default {
	title: 'Components/Radio',
	component: Radio,
};

export const Basic = (props: RadioProps) => {
	const [checked, setChecked] = useState(props.checked);

	return <Radio {...props} checked={checked} onChange={setChecked} />;
};
Basic.args = {
	checked: false,
	label: 'A smoothie',
	helpText: 'Contains orange juice, mangos and love ❤️',
};
Basic.argTypes = {
	label: { control: 'text' },
	helpText: { control: 'text' },
};

export const WithoutHelpText: React.FC = (props: RadioProps) => {
	const [checked, setChecked] = useState(false);

	return <Radio label="Pizza" checked={checked} onChange={setChecked} />;
};

export const Disabled: React.FC = (props: RadioProps) => {
	const [checked, setChecked] = useState(false);

	return <Radio label="Pizza" checked={checked} onChange={setChecked} disabled />;
};

export const Uncontrolled: React.FC = (props: RadioProps) => <Radio label="Pizza" />;
