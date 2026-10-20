import * as React from 'react';

import { act, render } from '@testing-library/react';

import { Calendar } from './index';
import { updateLocaleConfig } from './locales';

let mockMounts = 0;
jest.mock('react-native-calendars', () => ({
	Calendar: () => {
		const React = require('react') as typeof import('react');
		React.useEffect(() => {
			mockMounts++;
		}, []);
		return null;
	},
}));
jest.mock('uniwind', () => ({
	useCSSVariable: () => ['primary', 'primary-foreground', 'card', 'foreground', 'muted', 'border'],
}));
jest.mock('../icon', () => ({ Icon: () => null }));
jest.mock('./locales', () => ({ updateLocaleConfig: jest.fn() }));

beforeEach(() => {
	mockMounts = 0;
	jest.mocked(updateLocaleConfig).mockReset();
});

it('remounts the calendar after the locale loads', async () => {
	jest.mocked(updateLocaleConfig).mockResolvedValue(true);
	await act(async () => {
		render(<Calendar locale="de" />);
	});
	expect(mockMounts).toBe(2);
});

it('does not remount when the locale load was superseded', async () => {
	jest.mocked(updateLocaleConfig).mockResolvedValue(false);
	await act(async () => {
		render(<Calendar locale="de" />);
	});
	expect(mockMounts).toBe(1);
});

it('marks the older locale load stale when the locale changes', async () => {
	jest.mocked(updateLocaleConfig).mockResolvedValue(true);
	const { rerender } = await act(async () => render(<Calendar locale="de" />));
	await act(async () => {
		rerender(<Calendar locale="fr" />);
	});
	expect(jest.mocked(updateLocaleConfig).mock.calls[0][1]?.()).toBe(false);
	expect(jest.mocked(updateLocaleConfig).mock.calls[1][1]?.()).toBe(true);
});

it('keeps the first mount if the locale chunk fails', async () => {
	jest.mocked(updateLocaleConfig).mockRejectedValue(new Error('chunk'));
	await act(async () => {
		render(<Calendar locale="de" />);
	});
	expect(mockMounts).toBe(1);
});
