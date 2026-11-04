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
// Jest does not compile Uniwind classes, so the resting button exposes them on the DOM.
jest.mock('react-native', () => {
	const actual = jest.requireActual('react-native');
	return {
		...actual,
		Pressable: ({ className, ...props }: import('react-native').PressableProps) =>
			React.createElement(actual.Pressable, { ...props, dataSet: { classes: className } }),
	};
});

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

// The resting ghost is the editor's box: one control tall, the text in the middle, the textarea's
// vertical padding, so pressing it changes nothing but the border (Paul, 2026-11-04).
it('a ghost field at rest is one control tall with its text in the middle', () => {
	render(<EditableField variant="ghost" value="Hat" onChangeText={() => {}} testID="name" />);
	const classes = screen.getByTestId('name').dataset.classes?.split(' ') ?? [];
	expect(classes).toEqual(expect.arrayContaining(['min-h-ctl', 'items-center', 'py-3']));
	expect(classes).not.toContain('items-start');
});
