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
jest.mock('../../../contexts/theme', () => ({ useTheme: () => ({ screenSize: 'lg' }) }));
jest.mock('./context', () => ({ useReportsScope: () => ({ detail: undefined }) }));
jest.mock('./panels/panel', () => ({ DetailPanel: () => null }));
jest.mock('./sync-progress', () => ({ ReportsSyncProgress: () => null }));
jest.mock('./cards', () => ({ PeriodSection: () => null }));
jest.mock('./hero', () => ({
	Hero: () => {
		throw new Error('hero failed');
	},
}));

// The till strip is the only way into Closures, so it sits outside the report's boundary
// (Codex on #2720): a failed hero or card shows its fallback and the strip stays.
it('keeps the till strip on the page when the report body fails', () => {
	const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
	try {
		render(<Reports title={null} header={<div data-testid="reports-till" />} />);
		expect(screen.getByTestId('reports-till')).toBeTruthy();
		expect(screen.getByTestId('report-fallback')).toBeTruthy();
	} finally {
		consoleError.mockRestore();
	}
});
