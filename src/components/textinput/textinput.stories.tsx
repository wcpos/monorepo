import * as React from 'react';
import { action } from '@storybook/addon-actions';
import { TextInput } from './textinput';
import Portal from '../portal';

type StoryFn<T> = import('../storybook-types').StoryFn<T>;
type TextFieldProps = import('./textinput').TextInputProps;

export default {
	title: 'Components/TextInput',
	component: TextInput,
};

export const basicUsage: StoryFn<TextFieldProps> = (props) => {
	const [value, setValue] = React.useState(props.value);
	const onTextChanged = (newText: string): void => {
		setValue(newText);
		action('Text changed')(newText);
	};

	return <TextInput value={value} onChange={onTextChanged} {...props} />;
};
basicUsage.args = {
	label: 'Label',
	placeholder: 'Placeholder Text',
	returnKeyType: 'done',
	helpText: 'Help Text meant to help you',
	onFocus: action('Focused'),
	onBlur: action('Blurred'),
	onSubmit: action('Submitted'),
	onKeyPress: action('Key Pressed'),
};

export const withAction = ({ placeholder }: TextInputProps) => (
	<TextInput placeholder={placeholder} onAction={action('submit')} />
);

export const integerWithPrefix = () => {
	const [value, setValue] = React.useState('');

	return (
		<TextInput
			label="Amount"
			type="integer"
			prefix="$"
			placeholder="10"
			returnKeyType="done"
			value={value}
			onChange={setValue}
		/>
	);
};

export const clearable = ({ placeholder, prefix, clearable }: TextInputProps) => (
	<TextInput
		placeholder={placeholder}
		// action={action}
		onAction={action('submit')}
		prefix={prefix}
		clearable
	/>
);

export const autosize = ({ placeholder, autosize }: TextInputProps) => (
	<Portal.Host>
		<TextInput placeholder={placeholder} autosize />
	</Portal.Host>
);

export const uncontrolled = () => <TextInput label="Uncontrolled" />;
