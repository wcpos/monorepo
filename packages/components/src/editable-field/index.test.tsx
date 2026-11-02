import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { EditableField } from './index';

jest.mock('../icon', () => ({ Icon: () => null }));
jest.mock('../loader', () => ({ Loader: () => null }));
// The textarea's grow animation (reanimated) is not this field's behaviour: a plain input stands in.
jest.mock('../textarea', () => ({
	Textarea: (props: import('react-native').TextInputProps) => {
		const { TextInput } = jest.requireActual<typeof import('react-native')>('react-native');
		return <TextInput {...props} />;
	},
}));
jest.mock('../property-row', () => ({ PROPERTY_PLACEHOLDER_CLASS: 'placeholder' }));

function edit(onChangeText: jest.Mock) {
	render(<EditableField value="Hat" onChangeText={onChangeText} testID="name" />);
	fireEvent.click(screen.getByTestId('name'));
	return screen.getByTestId('name');
}

it('a blur without an edit writes nothing', () => {
	const onChangeText = jest.fn();
	fireEvent.blur(edit(onChangeText));
	expect(onChangeText).not.toHaveBeenCalled();
});

it('a blur after an edit writes the edited value', () => {
	const onChangeText = jest.fn();
	const editor = edit(onChangeText);
	fireEvent.change(editor, { target: { value: 'Cap' } });
	fireEvent.blur(editor);
	expect(onChangeText).toHaveBeenCalledWith('Cap');
});
