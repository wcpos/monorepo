import * as React from 'react';
import { action } from '@storybook/addon-actions';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import set from 'lodash/set';
import forEach from 'lodash/forEach';
import { StoryWrapper } from '@storybook/addons';
import { AppProviderSizeProvider } from '@wcpos/common/src/hooks/use-position-in-app';
import Portal from '../portal';
import { Form } from './form';
import { FormProps } from './types';

/**
 * Select require (uses Popover)
 * - SafeAreaProvider
 * - Portals
 * - AppProviderSizeProvider
 */
const AppProvider: StoryWrapper = (Story, context) => {
	return (
		<SafeAreaProvider>
			<AppProviderSizeProvider>
				<Portal.Provider>
					<View style={{ height: '600px' }}>
						<Story {...context} />
					</View>
					<Portal.Manager />
				</Portal.Provider>
			</AppProviderSizeProvider>
		</SafeAreaProvider>
	);
};

export default {
	title: 'Components/Form',
	component: Form,
	decorators: [AppProvider],
};

/**
 *
 */
export const BasicUsage = (props: FormProps) => {
	const [data, setData] = React.useState({
		firstName: 'Chuck',
		lastName: 'Norris',
		age: 75,
		bio: 'Roundhouse kicking asses since 1940',
		password: 'noneed',
	});

	const handleChange = React.useCallback((change, name) => {
		action('onChange')(change);
		setData(change);
	}, []);

	return <Form<typeof data> {...props} formData={data} onChange={handleChange} />;
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

/**
 *
 */
export const Nested = (props: FormProps) => {
	const [data, setData] = React.useState({
		title: 'My current tasks',
		tasks: [
			{
				title: 'My first task',
				details:
					'Lorem ipsum dolor sit amet, consectetur adipisicing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
				done: true,
			},
			{
				title: 'My second task',
				details:
					'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur',
				done: false,
			},
		],
	});

	const handleChange = React.useCallback((change) => {
		action('onChange')(change);
		setData(change);
	}, []);

	return <Form<typeof data> {...props} formData={data} onChange={handleChange} />;
};
Nested.args = {
	schema: {
		title: 'A list of tasks',
		type: 'object',
		required: ['title'],
		properties: {
			title: {
				type: 'string',
				title: 'Task list title',
			},
			tasks: {
				type: 'array',
				title: 'Tasks',
				items: {
					type: 'object',
					required: ['title'],
					properties: {
						title: {
							type: 'string',
							title: 'Title',
							description: 'A sample title',
						},
						details: {
							type: 'string',
							title: 'Task details',
							description: 'Enter the task details',
						},
						done: {
							type: 'boolean',
							title: 'Done?',
							default: false,
						},
					},
				},
			},
		},
	},
	uiSchema: {
		tasks: {
			items: {
				details: {
					'ui:widget': 'textarea',
				},
			},
		},
	},
};

/**
 *
 */
export const Arrays = (props: FormProps) => {
	const [data, setData] = React.useState({
		listOfStrings: ['foo', 'bar'],
		multipleChoicesList: ['foo', 'bar'],
		fixedItemsList: ['Some text', true, 123],
		minItemsList: [
			{
				name: 'Default name',
			},
			{
				name: 'Default name',
			},
			{
				name: 'Default name',
			},
		],
		defaultsAndMinItems: ['carp', 'trout', 'bream', 'unidentified', 'unidentified'],
		nestedList: [['lorem', 'ipsum'], ['dolor']],
		unorderable: ['one', 'two'],
		unremovable: ['one', 'two'],
		noToolbar: ['one', 'two'],
		fixedNoToolbar: [42, true, 'additional item one', 'additional item two'],
	});

	const handleChange = React.useCallback((change) => {
		action('onChange')(change);
		setData(change);
	}, []);

	return <Form<typeof data> {...props} formData={data} onChange={handleChange} />;
};
Arrays.args = {
	schema: {
		definitions: {
			Thing: {
				type: 'object',
				properties: {
					name: {
						type: 'string',
						default: 'Default name',
					},
				},
			},
		},
		type: 'object',
		properties: {
			listOfStrings: {
				type: 'array',
				title: 'A list of strings',
				items: {
					type: 'string',
					default: 'bazinga',
				},
			},
			multipleChoicesList: {
				type: 'array',
				title: 'A multiple choices list',
				items: {
					type: 'string',
					enum: ['foo', 'bar', 'fuzz', 'qux'],
				},
				uniqueItems: true,
			},
			fixedItemsList: {
				type: 'array',
				title: 'A list of fixed items',
				items: [
					{
						title: 'A string value',
						type: 'string',
						default: 'lorem ipsum',
					},
					{
						title: 'a boolean value',
						type: 'boolean',
					},
				],
				additionalItems: {
					title: 'Additional item',
					type: 'number',
				},
			},
			minItemsList: {
				type: 'array',
				title: 'A list with a minimal number of items',
				minItems: 3,
				items: {
					$ref: '#/definitions/Thing',
				},
			},
			defaultsAndMinItems: {
				type: 'array',
				title: 'List and item level defaults',
				minItems: 5,
				default: ['carp', 'trout', 'bream'],
				items: {
					type: 'string',
					default: 'unidentified',
				},
			},
			nestedList: {
				type: 'array',
				title: 'Nested list',
				items: {
					type: 'array',
					title: 'Inner list',
					items: {
						type: 'string',
						default: 'lorem ipsum',
					},
				},
			},
			unorderable: {
				title: 'Unorderable items',
				type: 'array',
				items: {
					type: 'string',
					default: 'lorem ipsum',
				},
			},
			unremovable: {
				title: 'Unremovable items',
				type: 'array',
				items: {
					type: 'string',
					default: 'lorem ipsum',
				},
			},
			noToolbar: {
				title: 'No add, remove and order buttons',
				type: 'array',
				items: {
					type: 'string',
					default: 'lorem ipsum',
				},
			},
			fixedNoToolbar: {
				title: 'Fixed array without buttons',
				type: 'array',
				items: [
					{
						title: 'A number',
						type: 'number',
						default: 42,
					},
					{
						title: 'A boolean',
						type: 'boolean',
						default: false,
					},
				],
				additionalItems: {
					title: 'A string',
					type: 'string',
					default: 'lorem ipsum',
				},
			},
		},
	},
	uiSchema: {
		listOfStrings: {
			items: {
				'ui:emptyValue': '',
			},
		},
		// multipleChoicesList: {
		// 	'ui:widget': 'checkboxes',
		// },
		fixedItemsList: {
			items: [
				{
					'ui:widget': 'textarea',
				},
				{
					'ui:widget': 'select',
				},
			],
			// additionalItems: {
			// 	'ui:widget': 'updown',
			// },
		},
		unorderable: {
			'ui:options': {
				orderable: false,
			},
		},
		unremovable: {
			'ui:options': {
				removable: false,
			},
		},
		noToolbar: {
			'ui:options': {
				addable: false,
				orderable: false,
				removable: false,
			},
		},
		fixedNoToolbar: {
			'ui:options': {
				addable: false,
				orderable: false,
				removable: false,
			},
		},
	},
};

/**
 *
 */
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
		setData(change);
	}, []);

	return <Form<typeof data> {...props} formData={data} onChange={handleChange} />;
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
		// integer: {
		// 	'ui:widget': 'updown',
		// },
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

/**
 *
 */
export const Widgets = (props: FormProps) => {
	const [data, setData] = React.useState({
		stringFormats: {
			email: 'chuck@norris.net',
			uri: 'http://chucknorris.com/',
		},
		boolean: {
			default: true,
			radio: true,
			select: true,
		},
		string: {
			color: '#151ce6',
			default: 'Hello...',
			textarea: '... World',
		},
		secret: "I'm a hidden string.",
		disabled: 'I am disabled.',
		readonly: 'I am read-only.',
		readonly2: 'I am also read-only.',
		widgetOptions: 'I am yellow',
	});

	const handleChange = React.useCallback((change) => {
		action('onChange')(change);
		setData(change);
	}, []);

	return <Form<typeof data> {...props} formData={data} onChange={handleChange} />;
};
Widgets.args = {
	schema: {
		title: 'Widgets',
		type: 'object',
		properties: {
			stringFormats: {
				type: 'object',
				title: 'String formats',
				properties: {
					email: {
						type: 'string',
						format: 'email',
					},
					uri: {
						type: 'string',
						format: 'uri',
					},
				},
			},
			boolean: {
				type: 'object',
				title: 'Boolean field',
				properties: {
					default: {
						type: 'boolean',
						title: 'checkbox (default)',
						description: 'This is the checkbox-description',
					},
					radio: {
						type: 'boolean',
						title: 'radio buttons',
						description: 'This is the radio-description',
					},
					select: {
						type: 'boolean',
						title: 'select box',
						description: 'This is the select-description',
					},
				},
			},
			string: {
				type: 'object',
				title: 'String field',
				properties: {
					default: {
						type: 'string',
						title: 'text input (default)',
					},
					textarea: {
						type: 'string',
						title: 'textarea',
					},
					placeholder: {
						type: 'string',
					},
					color: {
						type: 'string',
						title: 'color picker',
						default: '#151ce6',
					},
				},
			},
			secret: {
				type: 'string',
				default: "I'm a hidden string.",
			},
			disabled: {
				type: 'string',
				title: 'A disabled field',
				default: 'I am disabled.',
			},
			readonly: {
				type: 'string',
				title: 'A readonly field',
				default: 'I am read-only.',
			},
			readonly2: {
				type: 'string',
				title: 'Another readonly field',
				default: 'I am also read-only.',
				readOnly: true,
			},
			widgetOptions: {
				title: 'Custom widget with options',
				type: 'string',
				default: 'I am yellow',
			},
			selectWidgetOptions: {
				title: 'Custom select widget with options',
				type: 'string',
				enum: ['foo', 'bar'],
				enumNames: ['Foo', 'Bar'],
			},
		},
	},
	uiSchema: {
		boolean: {
			radio: {
				'ui:widget': 'radio',
			},
			select: {
				'ui:widget': 'select',
			},
		},
		string: {
			// textarea: {
			// 	'ui:widget': 'textarea',
			// 	'ui:options': {
			// 		rows: 5,
			// 	},
			// },
			placeholder: {
				'ui:placeholder': 'This is a placeholder',
			},
			// color: {
			// 	'ui:widget': 'color',
			// },
		},
		// secret: {
		// 	'ui:widget': 'hidden',
		// },
		disabled: {
			'ui:disabled': true,
		},
		readonly: {
			'ui:readonly': true,
		},
		widgetOptions: {
			'ui:options': {
				backgroundColor: 'yellow',
			},
		},
		selectWidgetOptions: {
			'ui:options': {
				backgroundColor: 'pink',
			},
		},
	},
};

/**
 *
 */
export const Ordering = (props: FormProps) => {
	const [data, setData] = React.useState({
		firstName: 'Chuck',
		lastName: 'Norris',
		age: 75,
		bio: 'Roundhouse kicking asses since 1940',
		password: 'noneed',
	});

	const handleChange = React.useCallback((change) => {
		action('onChange')(change);
		setData(change);
	}, []);

	return <Form<typeof data> {...props} formData={data} onChange={handleChange} />;
};
Ordering.args = {
	schema: {
		title: 'A registration form',
		type: 'object',
		required: ['firstName', 'lastName'],
		properties: {
			password: {
				type: 'string',
				title: 'Password',
			},
			lastName: {
				type: 'string',
				title: 'Last name',
			},
			bio: {
				type: 'string',
				title: 'Bio',
			},
			firstName: {
				type: 'string',
				title: 'First name',
			},
			age: {
				type: 'integer',
				title: 'Age',
			},
		},
	},
	uiSchema: {
		'ui:order': ['firstName', 'lastName', '*', 'password'],
		age: {
			// 'ui:widget': 'updown',
		},
		bio: {
			'ui:widget': 'textarea',
		},
		password: {
			// 'ui:widget': 'password',
		},
	},
};

/**
 *
 */
export const Errors = (props: FormProps) => {
	const [data, setData] = React.useState({
		firstName: 'Chuck',
		active: 'wrong',
		skills: ['karate', 'budo', 'aikido'],
		multipleChoicesList: ['foo', 'bar', 'fuzz'],
	});

	const handleChange = React.useCallback((change) => {
		action('onChange')(change);
		setData((prev) => ({ ...prev, ...change }));
	}, []);

	return <Form<typeof data> {...props} formData={data} onChange={handleChange} />;
};
Errors.args = {
	schema: {
		title: 'Contextualized errors',
		type: 'object',
		properties: {
			firstName: {
				type: 'string',
				title: 'First name',
				minLength: 8,
				pattern: '\\d+',
			},
			active: {
				type: 'boolean',
				title: 'Active',
			},
			skills: {
				type: 'array',
				items: {
					type: 'string',
					minLength: 5,
				},
			},
			multipleChoicesList: {
				type: 'array',
				title: 'Pick max two items',
				uniqueItems: true,
				maxItems: 2,
				items: {
					type: 'string',
					enum: ['foo', 'bar', 'fuzz'],
				},
			},
		},
	},
	uiSchema: {},
};

/**
 *
 */
export const ErrorSchema = (props: FormProps) => {
	const [data, setData] = React.useState({
		firstName: 'Chuck',
		lastName: 'Norris',
		age: 75,
		bio: 'Roundhouse kicking asses since 1940',
		password: 'noneed',
	});

	const handleChange = React.useCallback((change) => {
		action('onChange')(change);
		setData(change);
	}, []);

	return <Form<typeof data> {...props} formData={data} onChange={handleChange} />;
};
ErrorSchema.args = {
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
			age: {
				type: 'integer',
				title: 'Age',
			},
			bio: {
				type: 'string',
				title: 'Bio',
			},
			password: {
				type: 'string',
				title: 'Password',
				minLength: 3,
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
		},
		age: {
			// 'ui:widget': 'updown',
			'ui:title': 'Age of person',
			'ui:description': '(earthian year)',
		},
		bio: {
			'ui:widget': 'textarea',
		},
		password: {
			// 'ui:widget': 'password',
			'ui:help': 'Hint: Make it strong!',
		},
		date: {
			// 'ui:widget': 'alt-datetime',
		},
		telephone: {
			'ui:options': {
				inputType: 'tel',
			},
		},
	},
	extraErrors: {
		firstName: {
			__errors: ['some error that got added as a prop'],
		},
	},
};

/**
 *
 */
export const Single = (props: FormProps) => {
	const [data, setData] = React.useState('initial value');

	const handleChange = React.useCallback((change) => {
		action('onChange')(change);
		setData(change);
	}, []);

	return <Form<typeof data> {...props} formData={data} onChange={handleChange} />;
};
Single.args = {
	schema: {
		title: 'A single-field form',
		type: 'string',
	},
};
