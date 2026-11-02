/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { AreaPage } from './area-page';

jest.mock('react-native-safe-area-context', () => ({
	useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('@wcpos/components/error-boundary', () => ({
	ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('@wcpos/components/card', () => ({
	Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
		<div data-testid="area-card" data-class={className}>
			{children}
		</div>
	),
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children, role }: { children: React.ReactNode; role?: string }) => (
		<span role={role}>{children}</span>
	),
}));

describe('AreaPage', () => {
	it('puts the heading and its description inside the card, ahead of the body', () => {
		render(
			<AreaPage title="General" description="Store basics" testID="screen-settings-general">
				<span data-testid="body">rows</span>
			</AreaPage>
		);

		const card = screen.getByTestId('area-card');
		const heading = screen.getByRole('heading');
		expect(heading.textContent).toBe('General');
		expect(card.contains(heading)).toBe(true);
		expect(card.contains(screen.getByTestId('body'))).toBe(true);
		expect(card.textContent).toBe('GeneralStore basicsrows');
		expect(screen.getByTestId('screen-settings-general').contains(card)).toBe(true);
	});

	it('renders no description line when none is given', () => {
		render(
			<AreaPage title="Tax" testID="screen-settings-tax">
				<span>rows</span>
			</AreaPage>
		);

		expect(screen.getByTestId('area-card').textContent).toBe('Taxrows');
	});

	it('grows the card with the page by default, and fills the column in fill mode', () => {
		const { unmount } = render(
			<AreaPage title="Database" testID="screen-health-database">
				<span>rows</span>
			</AreaPage>
		);
		expect(screen.getByTestId('area-card').dataset.class).not.toContain('flex-1');
		unmount();

		render(
			<AreaPage title="Logs" testID="screen-logs" mode="fill">
				<span>rows</span>
			</AreaPage>
		);
		const fillClass = screen.getByTestId('area-card').dataset.class ?? '';
		expect(fillClass).toContain('flex-1');
		expect(fillClass).toContain('min-h-0');
	});
});
