/** @jest-environment jsdom */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

const mockUseSiteConnect = jest.fn();

jest.mock('expo-haptics', () => ({
	impactAsync: jest.fn(),
	ImpactFeedbackStyle: { Light: 'light' },
}));
jest.mock('@wcpos/components/button', () => ({
	Button: ({ children, disabled }: { children: React.ReactNode; disabled?: boolean }) => (
		<button disabled={disabled}>{children}</button>
	),
	ButtonText: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/input', () => ({
	Input: ({ value, type }: { value: string; type?: React.HTMLInputTypeAttribute }) => (
		<input readOnly value={value} type={type} />
	),
}));
jest.mock('@wcpos/components/label', () => ({
	Label: ({ children }: { children: React.ReactNode }) => <label>{children}</label>,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children, testID }: { children: React.ReactNode; testID?: string }) => (
		<span data-testid={testID}>{children}</span>
	),
}));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/docs-link', () => ({
	DocsLink: ({
		children,
		href,
		testID,
	}: {
		children: React.ReactNode;
		href: string;
		testID: string;
	}) => (
		<a data-testid={testID} href={href}>
			{children}
		</a>
	),
}));
jest.mock('../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));
jest.mock('../hooks/use-site-connect', () => ({
	useSiteConnect: () => mockUseSiteConnect(),
}));

// eslint-disable-next-line import/first -- Jest mocks must be registered before importing the component.
import { UrlInput } from './url-input';

describe('UrlInput', () => {
	it('renders the coded connect error documentation link directly below the error', () => {
		mockUseSiteConnect.mockReturnValue({
			onConnect: jest.fn(),
			loading: false,
			error: "The store's REST API did not answer on any address form this app can use.",
			errorCode: 'AUTH431',
			reset: jest.fn(),
		});

		render(<UrlInput />);

		// NOTE: DocsLink is mocked here as an anchor, so href is readable. The
		// real component renders a role="link" div (RNW Pressable) with NO href
		// — which is why the code rides the testID and why E2E asserts on that,
		// never on href.
		const link = screen.getByTestId('connect-error-docs-link-AUTH431');
		expect(link.getAttribute('href')).toBe('https://docs.wcpos.com/error-codes/AUTH431');
		expect(link.textContent).toBe('common.learn_more');
		expect(screen.getByTestId('connect-error-message')).toBeTruthy();
	});
});
