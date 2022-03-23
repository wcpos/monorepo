import * as React from 'react';
import { action } from '@storybook/addon-actions';
import { Form, FormProps } from './form';

export default {
	title: 'Components/Form',
};

export const BasicUsage = (props: FormProps) => {
	const [data, setData] = React.useState({
		firstName: 'Chuck',
		lastName: 'Norris',
		age: 75,
		bio: 'Roundhouse kicking asses since 1940',
		password: 'noneed',
	});

	const handleChange = React.useCallback((change) => {
		action('onChange')(change);
		setData((prev) => ({ ...prev, ...change }));
	}, []);

	return <Form {...props} formData={data} onChange={handleChange} />;
};
BasicUsage.args = {
	schema: {
		title: 'A registration form',
		description: 'A simple form example.',
		type: 'object',
		required: ['firstName', 'lastName'],
		properties: {
			firstName: {
				type: 'string',
				title: 'First name',
				default: 'Chuck',
			},
			lastName: {
				type: 'string',
				title: 'Last name',
			},
			telephone: {
				type: 'string',
				title: 'Telephone',
				minLength: 10,
			},
		},
	},
	uiSchema: {
		firstName: {
			'ui:autofocus': true,
			'ui:emptyValue': '',
			'ui:autocomplete': 'family-name',
		},
		lastName: {
			'ui:emptyValue': '',
			'ui:autocomplete': 'given-name',
		},
		telephone: {
			'ui:options': {
				inputType: 'tel',
			},
		},
	},
};

export const Numbers = (props: FormProps) => {
	const [data, setData] = React.useState({
		number: 3.14,
		integer: 42,
		numberEnum: 2,
		integerRange: 42,
		integerRangeSteps: 80,
	});

	const handleChange = React.useCallback((change) => {
		action('onChange')(change);
		setData((prev) => ({ ...prev, ...change }));
	}, []);

	return <Form {...props} formData={data} onChange={handleChange} />;
};
Numbers.args = {
	schema: {
		type: 'object',
		title: 'Number fields & widgets',
		properties: {
			number: {
				title: 'Number',
				type: 'number',
			},
			integer: {
				title: 'Integer',
				type: 'integer',
			},
			numberEnum: {
				type: 'number',
				title: 'Number enum',
				enum: [1, 2, 3],
			},
			numberEnumRadio: {
				type: 'number',
				title: 'Number enum',
				enum: [1, 2, 3],
			},
			integerRange: {
				title: 'Integer range',
				type: 'integer',
				minimum: 42,
				maximum: 100,
			},
			integerRangeSteps: {
				title: 'Integer range (by 10)',
				type: 'integer',
				minimum: 50,
				maximum: 100,
				multipleOf: 10,
			},
		},
	},
	uiSchema: {
		integer: {
			'ui:widget': 'updown',
		},
		numberEnumRadio: {
			'ui:widget': 'radio',
			'ui:options': {
				inline: true,
			},
		},
		integerRange: {
			'ui:widget': 'range',
		},
		integerRangeSteps: {
			'ui:widget': 'range',
		},
	},
};
