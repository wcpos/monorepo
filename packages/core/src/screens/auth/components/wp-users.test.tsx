/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { WPUsers } from './wp-users';

// The group's keyboard pattern only; WpUser is a stand-in radio with the real row's contract
// (role, aria-checked, roving tabIndex, click selects; its own test covers the real row).
jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));
jest.mock('observable-hooks', () => ({
	useObservableSuspense: (resource: { value: unknown }) => resource.value,
}));
jest.mock('../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('../../../contexts/app-state', () => ({ useAppState: () => ({ login: jest.fn() }) }));
jest.mock('./add-user-button', () => ({ AddUserButton: () => null }));
// The credentials list reads a named read through a Suspense resource since ADR 0033 (e4); the
// fixture still describes the site's rows through `populateResource`, so the resource maps onto it.
jest.mock('../../../hooks/user-db-list-resources', () => ({
	credentialsListResource: (site: { populateResource: (key: string) => unknown }) =>
		site.populateResource('wp_credentials'),
}));
jest.mock('./store-select', () => ({ StoreSelect: () => null }));
jest.mock('./wp-user', () => ({
	WpUser: ({
		wpUser,
		isSelected,
		onSelect,
	}: {
		wpUser: { uuid: string };
		isSelected: boolean;
		onSelect: () => void;
	}) => (
		<div
			role="radio"
			aria-checked={isSelected}
			tabIndex={isSelected ? 0 : -1}
			data-testid={`user-${wpUser.uuid}`}
			onClick={onSelect}
		/>
	),
}));
jest.mock('@wcpos/components/error-boundary', () => ({
	ErrorBoundary: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('@wcpos/components/suspense', () => ({ Suspense: React.Suspense }));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({
		children,
		role,
		onKeyDown,
	}: React.PropsWithChildren<{
		role?: string;
		onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>;
	}>) => (
		<div role={role} onKeyDown={onKeyDown}>
			{children}
		</div>
	),
}));
jest.mock('@wcpos/utils/logger', () => ({ getLogger: () => ({ error: jest.fn() }) }));

const site = {
	uuid: 'a',
	name: 'A',
	populateResource: () => ({ value: [{ uuid: 'u1' }, { uuid: 'u2' }, { uuid: 'u3' }] }),
} as unknown as import('@wcpos/database').SiteDocument;

it('moves selection and focus with the arrow keys, wrapping, and keeps one tab stop', () => {
	render(<WPUsers site={site} />);
	const [u1, u2, u3] = ['u1', 'u2', 'u3'].map((id) => screen.getByTestId(`user-${id}`));
	expect([u1, u2, u3].map((row) => row.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);

	fireEvent.keyDown(u1, { key: 'ArrowDown' });
	expect(u2.getAttribute('aria-checked')).toBe('true');
	expect(document.activeElement).toBe(u2);
	expect([u1, u2, u3].map((row) => row.getAttribute('tabindex'))).toEqual(['-1', '0', '-1']);

	fireEvent.keyDown(u2, { key: 'ArrowUp' });
	fireEvent.keyDown(u1, { key: 'ArrowUp' });
	expect(u3.getAttribute('aria-checked')).toBe('true');
	expect(document.activeElement).toBe(u3);
});
