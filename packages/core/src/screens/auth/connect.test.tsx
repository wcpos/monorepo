/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

import { Connect } from './connect';

const mockSites = new BehaviorSubject<string[]>([]);
let mockSuspend = false;
const mockPending = new Promise(() => {});
jest.mock('../../contexts/app-state', () => ({
	useAppState: () => ({ user: { sites: mockSites.value } }),
}));
jest.mock('@wcpos/query', () => ({
	useDocField: (doc: unknown, select: (doc: unknown) => unknown) => select(doc),
}));
jest.mock('../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('@wcpos/components/keyboard-controller', () => ({
	KeyboardAvoidingView: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/error-boundary', () => ({
	ErrorBoundary: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('@wcpos/components/suspense', () => ({ Suspense: React.Suspense }));
jest.mock('@wcpos/components/logo', () => ({ Logo: () => <svg role="img" /> }));
jest.mock('@wcpos/components/card', () => ({
	Card: ({ children, className }: React.PropsWithChildren<{ className?: string }>) => (
		<section className={className}>{children}</section>
	),
}));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/skeleton', () => ({
	Skeleton: ({ shape }: { shape: string }) => <div data-shape={shape} />,
}));
jest.mock('@wcpos/components/button', () => ({
	Button: ({
		children,
		testID,
		onPress,
	}: React.PropsWithChildren<{ testID: string; onPress: () => void }>) => (
		<button data-testid={testID} onClick={onPress}>
			{children}
		</button>
	),
	ButtonText: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));
jest.mock('./components/url-input', () => ({
	UrlInput: () => <input data-testid="store-url-input" />,
}));
jest.mock('./components/demo-button', () => ({
	DemoButton: () => <button data-testid="enter-demo-store-button" />,
}));
jest.mock('./components/sites', () => ({
	Sites: () => {
		if (mockSuspend) throw mockPending;
		return mockSites.value.length ? <div data-testid="logged-in-users-label" /> : null;
	},
}));

beforeEach(() => {
	mockSites.next([]);
	mockSuspend = false;
});
it('shows the first-run address after the logo, without the reveal button', () => {
	render(<Connect />);
	expect(screen.queryByTestId('connect-another-store')).toBeNull();
	expect(
		screen.getByRole('img').compareDocumentPosition(screen.getByTestId('store-url-input')) &
			Node.DOCUMENT_POSITION_FOLLOWING
	).toBeTruthy();
});
it('keeps saved sites first, reveals the address on request and folds it after saving', () => {
	mockSites.next(['a']);
	const { rerender } = render(<Connect />);
	expect(screen.queryByTestId('store-url-input')).toBeNull();
	fireEvent.click(screen.getByTestId('connect-another-store'));
	const input = screen.getByTestId('store-url-input');
	expect(
		screen.getByTestId('logged-in-users-label').compareDocumentPosition(input) &
			Node.DOCUMENT_POSITION_FOLLOWING
	).toBeTruthy();
	act(() => mockSites.next(['a', 'b']));
	rerender(<Connect />);
	expect(screen.queryByTestId('store-url-input')).toBeNull();
});
it('renders a skeleton card while sites suspend', () => {
	mockSites.next(['a']);
	mockSuspend = true;
	const { container } = render(<Connect />);
	expect(container.querySelector('section [data-shape="line"]')).not.toBeNull();
	expect(container.querySelectorAll('section [data-shape="row"]')).toHaveLength(2);
});
