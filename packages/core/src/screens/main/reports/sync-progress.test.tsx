/** @jest-environment jsdom */
import '@testing-library/jest-dom';
import * as React from 'react';

import { render, screen } from '@testing-library/react';
import { of } from 'rxjs';

import { ReportsSyncProgress } from './sync-progress';

import type { QueryLaneProgress } from '../../../query';

let laneProgress: QueryLaneProgress | null = null;

jest.mock('react-native', () => ({
	View: ({
		children,
		testID,
		style,
	}: {
		children?: React.ReactNode;
		testID?: string;
		style?: Record<string, unknown>;
	}) => (
		<div data-testid={testID} style={style as React.CSSProperties}>
			{children}
		</div>
	),
}));

jest.mock('@wcpos/components/text', () => ({
	Text: ({ children, testID }: { children?: React.ReactNode; testID?: string }) => (
		<span data-testid={testID}>{children}</span>
	),
}));

jest.mock('./context', () => ({
	useReports: () => ({ binding: { laneProgress$: of(laneProgress) } }),
}));

jest.mock('../../../contexts/translations', () => ({
	useT: () => (key: string, values?: Record<string, unknown>) =>
		`${key}:${JSON.stringify(values ?? {})}`,
}));

describe('ReportsSyncProgress', () => {
	// Self-dismissing: the binding stops reporting progress the moment the lane's
	// continuation cursor is cleared, which is exactly when the range is complete.
	it('renders nothing once the ranged lane has no continuation cursor left', () => {
		laneProgress = null;
		render(<ReportsSyncProgress />);

		expect(screen.queryByTestId('reports-sync-progress')).not.toBeInTheDocument();
	});

	it('renders downloaded-of-total from the lane progress projection', () => {
		laneProgress = { downloaded: 12_400, total: 30_000 };
		render(<ReportsSyncProgress />);

		expect(screen.getByTestId('reports-sync-progress-label')).toHaveTextContent(
			'reports.downloading_orders:{"downloaded":12400,"total":30000}'
		);
		// 12,400 / 30,000 → 41%
		expect(screen.getByTestId('reports-sync-progress-bar')).toHaveStyle({ width: '41%' });
	});

	// A server that sent no X-WP-Total leaves the denominator unknown; the count is still
	// worth showing, but an unfillable bar is not.
	it('falls back to a total-less line when the range size is unknown', () => {
		laneProgress = { downloaded: 250, total: null };
		render(<ReportsSyncProgress />);

		expect(screen.getByTestId('reports-sync-progress-label')).toHaveTextContent(
			'reports.downloading_orders_unknown_total:{"downloaded":250}'
		);
		expect(screen.queryByTestId('reports-sync-progress-bar')).not.toBeInTheDocument();
	});
});
