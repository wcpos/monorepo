/** @jest-environment jsdom */
import * as React from 'react';

import { render, screen } from '@testing-library/react';
import { useIsFocused } from 'expo-router/react-navigation';

import { FocusedSkiaWeb } from './focused-skia-web';

jest.mock('expo-router/react-navigation', () => ({
	useIsFocused: jest.fn(),
}));

jest.mock('@shopify/react-native-skia/lib/module/web', () => ({
	WithSkiaWeb: () => <div data-testid="canvas" />,
}));

const getComponent = async () => ({ default: () => null });

describe('FocusedSkiaWeb', () => {
	it('renders the fallback instead of the canvas when unfocused', () => {
		jest.mocked(useIsFocused).mockReturnValue(false);
		render(<FocusedSkiaWeb getComponent={getComponent} fallback={<div data-testid="frame" />} />);

		expect(screen.getByTestId('frame')).toBeTruthy();
		expect(screen.queryByTestId('canvas')).toBeNull();
	});

	it('renders the canvas when focused', () => {
		jest.mocked(useIsFocused).mockReturnValue(true);
		render(<FocusedSkiaWeb getComponent={getComponent} fallback={<div data-testid="frame" />} />);

		expect(screen.getByTestId('canvas')).toBeTruthy();
	});
});
