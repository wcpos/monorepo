/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { Sites } from './sites';
import { createTestT as mockCreateTestT } from '../../../../jest/translate';

// Real Sites → Site / AccordionSite → WPUsers; only the leaves are stubbed. The accordion stub
// unmounts collapsed content like the real primitive does, so a fold really drops WPUsers.
jest.mock('observable-hooks', () => ({
	useObservableSuspense: (resource: { value: unknown }) => resource.value,
}));
jest.mock('@wcpos/query', () => ({
	useDocField: (doc: unknown, select: (doc: unknown) => unknown) => select(doc),
}));
jest.mock('../../../contexts/translations', () => ({ useT: () => mockCreateTestT() }));
jest.mock('../../../contexts/app-state', () => ({ useAppState: () => ({ login: jest.fn() }) }));
jest.mock('../../../hooks/use-version-check', () => ({
	useVersionCheck: () => ({ wcposVersionPass: true }),
}));
jest.mock('../../../hooks/use-site-info', () => ({ useSiteInfo: () => {} }));
jest.mock('../../../hooks/use-wcpos-auth/redirect-result', () => ({
	peekRedirectLoginUrl: () => null,
}));
jest.mock('./add-user-button', () => ({ AddUserButton: () => null }));
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
		<button
			data-testid={`user-${wpUser.uuid}`}
			data-selected={String(isSelected)}
			onClick={onSelect}
		/>
	),
}));
jest.mock('./store-select', () => ({
	StoreSelect: ({
		selectedStoreId,
		onStoreSelect,
	}: {
		selectedStoreId: string | null;
		onStoreSelect: (id: string) => void;
	}) => (
		<button
			data-testid="store-select"
			data-store={String(selectedStoreId)}
			onClick={() => onStoreSelect('store-2')}
		/>
	),
}));
jest.mock('@wcpos/components/accordion', () => {
	const R = jest.requireActual<typeof import('react')>('react');
	const Root = R.createContext<{ value?: string; onValueChange?: (v: string) => void }>({});
	const Item = R.createContext('');
	return {
		Accordion: ({
			children,
			value,
			onValueChange,
		}: React.PropsWithChildren<{ value?: string; onValueChange?: (v: string) => void }>) => (
			<Root.Provider value={{ value, onValueChange }}>{children}</Root.Provider>
		),
		AccordionItem: ({ children, value }: React.PropsWithChildren<{ value: string }>) => (
			<Item.Provider value={value}>{children}</Item.Provider>
		),
		AccordionTrigger: ({ children, testID }: React.PropsWithChildren<{ testID?: string }>) => {
			const root = R.useContext(Root);
			const item = R.useContext(Item);
			return (
				<button data-testid={testID} onClick={() => root.onValueChange?.(item)}>
					{children}
				</button>
			);
		},
		AccordionContent: ({ children }: React.PropsWithChildren) => {
			const root = R.useContext(Root);
			const item = R.useContext(Item);
			return root.value === item ? <>{children}</> : null;
		},
	};
});
jest.mock('@wcpos/components/dropdown-menu', () => ({
	DropdownMenu: () => null,
	DropdownMenuContent: () => null,
	DropdownMenuTrigger: () => null,
	DropdownMenuItem: () => null,
}));
jest.mock('@wcpos/components/alert-dialog', () => ({ AlertDialog: () => null }));
jest.mock('@wcpos/components/avatar', () => ({ Avatar: () => null, getInitials: () => 'S' }));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@wcpos/components/icon-button', () => ({ IconButton: () => null }));
jest.mock('@wcpos/components/status-badge', () => ({ StatusBadge: () => null }));
jest.mock('@wcpos/components/notice', () => ({ Notice: () => null }));
jest.mock('@wcpos/components/error-boundary', () => ({
	ErrorBoundary: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('@wcpos/components/suspense', () => ({ Suspense: React.Suspense }));
jest.mock('@wcpos/components/card', () => ({
	Card: ({ children }: React.PropsWithChildren) => <section>{children}</section>,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));

const site = {
	uuid: 'a',
	name: 'A',
	url: 'https://a.test',
	wp_credentials: ['u1', 'u2'],
	populateResource: () => ({ value: [{ uuid: 'u1' }, { uuid: 'u2' }] }),
};
const user = {
	populateResource: () => ({ value: [site] }),
} as unknown as import('@wcpos/database').UserDocument;

it('keeps the picked user and store across a fold and expand', () => {
	// Connect's role: the form opens (fold), and expanding the site closes it.
	function Page() {
		const [collapsed, setCollapsed] = React.useState(false);
		return (
			<>
				<button data-testid="fold" onClick={() => setCollapsed(true)} />
				<Sites user={user} collapsed={collapsed} onExpand={() => setCollapsed(false)} />
			</>
		);
	}
	render(<Page />);
	fireEvent.click(screen.getByTestId('user-u2'));
	fireEvent.click(screen.getByTestId('store-select'));

	fireEvent.click(screen.getByTestId('fold'));
	expect(screen.queryByTestId('store-select')).toBeNull();

	fireEvent.click(screen.getByTestId('auth-site-trigger-a'));
	expect(screen.getByTestId('user-u2').getAttribute('data-selected')).toBe('true');
	expect(screen.getByTestId('user-u1').getAttribute('data-selected')).toBe('false');
	expect(screen.getByTestId('store-select').getAttribute('data-store')).toBe('store-2');
});
