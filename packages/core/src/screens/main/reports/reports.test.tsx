/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { Reports } from './reports';

import type { DetailId } from './context';

let mockDetail: DetailId | undefined;
let mockPhone = false;

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
// The real boundary (the shared one pulls in a tooltip jest cannot parse), with a visible fallback.
jest.mock('@wcpos/components/error-boundary', () => {
	const { ErrorBoundary } = jest.requireActual('react-error-boundary');
	return {
		ErrorBoundary: (props: React.ComponentProps<typeof ErrorBoundary>) => (
			<ErrorBoundary FallbackComponent={() => <div data-testid="report-fallback" />} {...props} />
		),
	};
});
jest.mock('@wcpos/components/lib/device', () => ({
	...jest.requireActual('@wcpos/components/lib/device'),
	useIsPhone: () => mockPhone,
}));
jest.mock('./context', () => ({
	useReportsScope: () => ({ detail: mockDetail }),
	ReportsCurrencyGuard: ({ children, note }: React.PropsWithChildren<{ note?: boolean }>) => (
		<div data-testid="currency-guard" data-note={note ? 'yes' : 'no'}>
			{children}
		</div>
	),
}));
jest.mock('./panels/panel', () => ({ DetailPanel: () => <div data-testid="detail-panel" /> }));
jest.mock('./sync-progress', () => ({ ReportsSyncProgress: () => null }));
jest.mock('./cards', () => ({ PeriodSection: () => <div data-testid="period-section" /> }));
let mockHeroFails = true;
jest.mock('./hero', () => ({
	SalesScope: () => <div data-testid="reports-scope-strip" />,
	Hero: () => {
		if (mockHeroFails) throw new Error('hero failed');
		return <div data-testid="reports-hero" />;
	},
}));

afterEach(() => {
	mockDetail = undefined;
	mockPhone = false;
});

// The till strip is the only way into Closures, so it sits outside the report's boundary
// (Codex on #2720): a failed hero or card shows its fallback and the strip stays.
it('keeps the till strip on the page when the report body fails', () => {
	const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
	try {
		render(<Reports date={null} header={<div data-testid="reports-till" />} />);
		expect(screen.getByTestId('reports-till')).toBeTruthy();
		expect(screen.getByTestId('report-fallback')).toBeTruthy();
		expect(screen.getByTestId('reports-scope-strip')).toBeTruthy();
	} finally {
		consoleError.mockRestore();
	}
});

it('renders the scope strip between the till and hero', () => {
	mockHeroFails = false;
	try {
		render(<Reports date={null} header={<div data-testid="reports-till" />} />);
		const strip = screen.getByTestId('reports-scope-strip');
		expect(strip.previousElementSibling).toBe(screen.getByTestId('reports-till'));
		expect(strip.nextElementSibling).toBe(screen.getByTestId('reports-hero'));
	} finally {
		mockHeroFails = true;
	}
});

it('the cards sit under the currency guard with its note', () => {
	mockHeroFails = false;
	try {
		render(<Reports date={null} />);
		const guard = screen.getByTestId('period-section').closest('[data-testid="currency-guard"]');
		expect(guard).not.toBeNull();
		expect(guard?.getAttribute('data-note')).toBe('yes');
	} finally {
		mockHeroFails = true;
	}
});

it.each([false, true])('the detail panel sits under a currency guard (phone: %s)', (phone) => {
	mockDetail = 'payments';
	mockPhone = phone;
	mockHeroFails = false;
	try {
		render(<Reports date={null} />);
		expect(
			screen.getByTestId('detail-panel').closest('[data-testid="currency-guard"]')
		).not.toBeNull();
	} finally {
		mockHeroFails = true;
	}
});
