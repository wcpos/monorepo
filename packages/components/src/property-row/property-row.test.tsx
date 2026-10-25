import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import {
	PROPERTY_PLACEHOLDER_CLASS,
	PropertyAdd,
	PropertyAddRow,
	PropertyList,
	PropertyPlaceholder,
	PropertyRow,
	PropertyVerb,
} from './index';

// Keep RNW rendering; Jest does not compile Uniwind classes, so expose them on the DOM.
jest.mock('react-native', () => {
	const actual = jest.requireActual('react-native');
	return {
		...actual,
		Pressable: ({ className, ...props }: import('react-native').PressableProps) =>
			React.createElement(actual.Pressable, { ...props, dataSet: { classes: className } }),
		View: ({ className, ...props }: import('react-native').ViewProps) =>
			React.createElement(actual.View, { ...props, dataSet: { classes: className } }),
		Text: ({ className, ...props }: import('react-native').TextProps) =>
			React.createElement(actual.Text, { ...props, dataSet: { classes: className } }),
	};
});
jest.mock('expo-haptics', () => ({
	impactAsync: jest.fn(),
	ImpactFeedbackStyle: { Light: 'light' },
}));
jest.mock('../icon', () => ({
	Icon: ({ name }: { name: string }) => {
		const { Text } = jest.requireActual('react-native');
		return <Text testID={`icon-${name}`} />;
	},
}));
jest.mock('../loader', () => ({ Loader: () => null }));

const classes = (element: HTMLElement) => element.dataset.classes?.split(' ') ?? [];

it('renders the key, the value and the trailing slot, with no divider', () => {
	render(
		<PropertyList testID="list">
			<PropertyRow
				testID="row"
				label="Email"
				trailing={<PropertyVerb onPress={() => {}}>Remove</PropertyVerb>}
			>
				<PropertyPlaceholder>Add email</PropertyPlaceholder>
			</PropertyRow>
		</PropertyList>
	);
	const row = screen.getByTestId('row');
	expect(row.textContent).toBe('EmailAdd emailRemove');
	for (const token of ['min-h-ctl', 'md:flex-row', 'md:items-center', 'md:gap-3']) {
		expect(classes(row)).toContain(token);
	}
	expect(classes(screen.getByTestId('list'))).toContain('gap-0');
	for (const element of screen.getByTestId('list').querySelectorAll('[data-classes]')) {
		expect(classes(element as HTMLElement)).not.toContain('border-b');
	}
	const key = screen.getByText('Email');
	expect(classes(key)).toEqual(expect.arrayContaining(['text-muted-foreground', 'text-sm']));
	expect(classes(key.parentElement as HTMLElement)).toContain('md:w-32');
	expect(classes(screen.getByText('Add email'))).toEqual(
		expect.arrayContaining(PROPERTY_PLACEHOLDER_CLASS.split(' '))
	);
});

it('pads the key of a part of an open compound, and tops a multi-line value', () => {
	render(
		<PropertyRow testID="row" label="City" indent align="top">
			Leeds
		</PropertyRow>
	);
	expect(classes(screen.getByText('City').parentElement as HTMLElement)).toContain('pl-4');
	expect(classes(screen.getByTestId('row'))).toContain('md:items-start');
	// A bare string under a View throws on native, so a plain value renders as a Text.
	expect(classes(screen.getByText('Leeds'))).toEqual(
		expect.arrayContaining(['text-foreground', 'text-base'])
	);
});

it('an add is a 36-tall outline Button with the plus icon, and presses', () => {
	const onPress = jest.fn();
	render(
		<PropertyAddRow>
			<PropertyAdd testID="add" label="Company" onPress={onPress} />
		</PropertyAddRow>
	);
	const add = screen.getByTestId('add');
	expect(classes(add)).toEqual(expect.arrayContaining(['h-9', 'border', 'border-border']));
	expect(screen.getByTestId('icon-plus')).toBeTruthy();
	expect(classes(add.parentElement as HTMLElement)).toEqual(
		expect.arrayContaining(['flex-row', 'flex-wrap', 'gap-2', 'pt-2'])
	);
	fireEvent.click(add);
	expect(onPress).toHaveBeenCalledTimes(1);
});

it('a verb is a small link Button in primary ink', () => {
	render(
		<PropertyVerb testID="verb" onPress={() => {}}>
			Edit
		</PropertyVerb>
	);
	expect(classes(screen.getByTestId('verb'))).toEqual(
		expect.arrayContaining(['bg-transparent', 'h-9'])
	);
	expect(classes(screen.getByText('Edit'))).toEqual(
		expect.arrayContaining(['text-primary', 'text-sm', 'font-medium'])
	);
});
