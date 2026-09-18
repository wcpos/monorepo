/* eslint-disable import/first */
import * as fs from 'fs';
import * as path from 'path';

import * as React from 'react';

// The cap lives on the field's own props, and react-native-web does not forward
// maxFontSizeMultiplier to the DOM — record the props the field is handed.
const fieldProps: Record<string, unknown>[] = [];

jest.mock('react-native', () => {
	const actual = jest.requireActual('react-native');
	const react = jest.requireActual('react');

	return {
		...actual,
		TextInput: (props: Record<string, unknown>) => {
			fieldProps.push(props);

			return react.createElement(actual.TextInput, props);
		},
	};
});

import { fireEvent, render, screen } from '@testing-library/react';

import { Input } from './index';
import { MAX_FONT_SCALE } from '../lib/scale';

jest.mock(
	'@wcpos/hooks/use-merged-ref',
	() => ({
		useMergedRef: (...refs: unknown[]) => refs.find((ref) => ref !== null),
	}),
	{ virtual: true }
);

jest.mock('../icon-button', () => ({
	IconButton: ({
		testID,
		onPress,
		accessibilityLabel,
	}: {
		testID?: string;
		onPress?: () => void;
		accessibilityLabel?: string;
	}) => <button data-testid={testID} aria-label={accessibilityLabel} onClick={onPress} />,
}));

describe('Input clear control', () => {
	it('exposes the configured clear testID and clears its value', () => {
		const onChangeText = jest.fn();

		render(
			<Input
				clearable
				clearTestID="store-url-clear"
				testID="store-url-input"
				value="https://not-a-real-store.invalid"
				onChangeText={onChangeText}
			/>
		);

		fireEvent.click(screen.getByTestId('store-url-clear'));

		expect(onChangeText).toHaveBeenCalledWith('');
	});
});

/**
 * A class assertion has to read the source: `react-native` is mapped to
 * `react-native-web` here, whose `View` drops `className` before it reaches the
 * DOM, so the rendered tree cannot be asked what the field box's classes are.
 */
describe('Input control height', () => {
	const source = fs.readFileSync(path.join(__dirname, 'index.tsx'), 'utf8');

	// The field is one control tall from the floored scale token, not a literal
	// 40 px (roadmap#357).
	it('sizes the field box on the control token, not h-10', () => {
		expect(source).toContain('h-ctl');
		expect(source).not.toContain('h-10');
		expect(source).toContain('rounded-lg');
	});
});

describe('Input text cap', () => {
	beforeEach(() => {
		fieldProps.length = 0;
	});

	it('caps the OS text multiplier at 1.3 by default', () => {
		render(<Input value="x" />);

		expect(fieldProps.at(-1)?.maxFontSizeMultiplier).toBe(MAX_FONT_SCALE);
	});

	it("lets a caller's prop win", () => {
		render(<Input value="x" maxFontSizeMultiplier={2} />);

		expect(fieldProps.at(-1)?.maxFontSizeMultiplier).toBe(2);
	});
});
