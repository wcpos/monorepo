import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { Input } from './index';

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
