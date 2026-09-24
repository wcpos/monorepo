/** @jest-environment jsdom */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { Sites } from './sites';
import { createTestT as mockCreateTestT } from '../../../../jest/translate';

let mockSites: unknown[] = [];
let mockCompatible = true;
jest.mock('observable-hooks', () => ({ useObservableSuspense: () => mockSites }));
jest.mock('@wcpos/query', () => ({
	useDocField: (doc: unknown, select: (doc: unknown) => unknown) => select(doc),
}));
jest.mock('../../../contexts/translations', () => ({
	useT: () => mockCreateTestT(),
}));
jest.mock('../../../hooks/use-version-check', () => ({
	useVersionCheck: () => ({ wcposVersionPass: mockCompatible }),
}));
jest.mock('../../../hooks/use-site-info', () => ({ useSiteInfo: () => {} }));
jest.mock('../../../hooks/use-wcpos-auth/redirect-result', () => ({
	peekRedirectLoginUrl: () => null,
}));
jest.mock('./wp-users', () => ({ WPUsers: () => <button data-testid="wp-user-button" /> }));
jest.mock('@wcpos/components/alert-dialog', () => ({ AlertDialog: () => null }));
jest.mock('@wcpos/components/avatar', () => ({ Avatar: () => null, getInitials: () => 'S' }));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@wcpos/components/icon-button', () => ({ IconButton: () => null }));
jest.mock('@wcpos/components/error-boundary', () => ({
	ErrorBoundary: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('@wcpos/components/suspense', () => ({ Suspense: React.Suspense }));
jest.mock('@wcpos/components/accordion', () => ({
	Accordion: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	AccordionItem: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	AccordionTrigger: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	AccordionContent: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/card', () => ({
	Card: ({ children, testID }: React.PropsWithChildren<{ testID?: string }>) => (
		<section data-testid={testID}>{children}</section>
	),
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children, testID }: React.PropsWithChildren<{ testID?: string }>) => (
		<div data-testid={testID}>{children}</div>
	),
}));
jest.mock('@wcpos/components/status-badge', () => ({
	StatusBadge: ({ label, variant }: { label: string; variant: string }) => (
		<span data-variant={variant}>{label}</span>
	),
}));
jest.mock('@wcpos/components/notice', () => ({
	Notice: ({
		title,
		tone,
		docs,
	}: {
		title: string;
		tone: string;
		docs: { href: string; label: string };
	}) => (
		<aside data-tone={tone}>
			{title}
			<a href={docs.href}>{docs.label}</a>
		</aside>
	),
}));
const a = { uuid: 'a', name: 'A', url: 'https://a.test', wp_credentials: ['u'] };
const b = { uuid: 'b', name: 'B', url: 'https://b.test', wp_credentials: [] };
const user = { populateResource: () => ({}) } as unknown as import('@wcpos/database').UserDocument;
it('puts the many-sites heading above cards and renders the user counts', () => {
	mockCompatible = true;
	mockSites = [a, b];
	const { container } = render(<Sites user={user} />);
	const heading = screen.getByText('Your sites');
	expect(heading.closest('section')).toBeNull();
	expect(container.querySelectorAll('section')).toHaveLength(2);
	expect(screen.getByText('1 user').getAttribute('data-variant')).toBe('info');
	expect(screen.queryByText('0 users')).toBeNull(); // no badge at zero, as before
});
it.each([[a], [a, b]])(
	'replaces incompatible site accounts with a warning Notice: %j',
	(...sites) => {
		mockCompatible = false;
		mockSites = sites;
		const { container } = render(<Sites user={user} />);
		expect(screen.queryByTestId('wp-user-button')).toBeNull();
		expect(
			screen.getAllByText('Update the WooCommerce POS plugin on this site to continue')
		).toHaveLength(sites.length);
		expect(container.querySelector('aside')?.getAttribute('data-tone')).toBe('warn');
		expect(screen.getAllByRole('link')[0].getAttribute('href')).toBe(
			'https://docs.wcpos.com/error-codes/AUTH331'
		);
	}
);
