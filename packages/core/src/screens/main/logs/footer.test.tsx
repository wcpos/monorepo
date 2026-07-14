/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { render, screen } from '@testing-library/react';
import { of } from 'rxjs';

import { LogsFooter } from './footer';

jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
jest.mock('../../../contexts/translations', () => ({
	useT: () => (key: string, values?: Record<string, unknown>) =>
		values ? `${key}:${values.shown}/${values.total}` : key,
}));

describe('LogsFooter', () => {
	it('renders the full local total supplied by the logs binding', () => {
		const BindingFooter = LogsFooter as unknown as React.ComponentType<Record<string, unknown>>;
		render(
			<BindingFooter
				count={10}
				total$={of(27)}
				active$={of(false)}
				sync={jest.fn(async () => undefined)}
			/>
		);

		expect(screen.getByText('common.showing_of:10/27')).toBeTruthy();
	});
});
