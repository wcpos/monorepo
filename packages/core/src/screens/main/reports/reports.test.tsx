/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { Reports } from './reports';

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
jest.mock('@wcpos/components/portal', () => ({ PortalHost: () => null }));
jest.mock('@wcpos/components/lib/portal-container', () => ({ registerPortalContainer: jest.fn() }));
jest.mock('@wcpos/components/lib/device', () => ({
	...jest.requireActual('@wcpos/components/lib/device'),
	useIsPhone: () => false,
}));
jest.mock('./context', () => ({ useReportsScope: () => ({ detail: undefined }) }));
jest.mock('./panels/panel', () => ({ DetailPanel: () => null }));
jest.mock('./sync-progress', () => ({ ReportsSyncProgress: () => null }));
jest.mock('./cards', () => ({ PeriodSection: () => null }));
let mockHeroFails = true;
jest.mock('./hero', () => ({
	SalesScope: () => <div data-testid="reports-scope-strip" />,
	Hero: () => {
		if (mockHeroFails) throw new Error('hero failed');
		return <div data-testid="reports-hero" />;
	},
}));

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
