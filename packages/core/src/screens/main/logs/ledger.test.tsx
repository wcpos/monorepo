/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { Ledger } from './ledger';

const row = {
	logId: 'log-1',
	timestamp: 1_000,
	level: 'error',
	message: 'Database error',
	code: 'DB01003',
};
const quietRow = {
	logId: 'log-2',
	timestamp: 2_000,
	level: 'info',
	message: 'Background sync finished a batch',
	category: 'wcpos.sync.engine',
};

jest.mock('react-native', () => ({
	Pressable: ({
		children,
		className,
		testID,
		onPress,
	}: React.PropsWithChildren<{ className?: string; testID?: string; onPress?: () => void }>) => (
		<button className={className} data-testid={testID} onClick={onPress}>
			{children}
		</button>
	),
	View: ({ children, className }: React.PropsWithChildren<{ className?: string }>) => (
		<div className={className}>{children}</div>
	),
}));
jest.mock('observable-hooks', () => ({
	useObservableState: () => 2,
	useObservableSuspense: () => ({
		hits: [{ document: { toJSON: () => row } }, { document: { toJSON: () => quietRow } }],
	}),
}));
jest.mock('@wcpos/components/button', () => ({
	Button: ({ children }: React.PropsWithChildren) => <>{children}</>,
	ButtonText: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({
		children,
		testID,
		className,
	}: React.PropsWithChildren<{ testID?: string; className?: string }>) => (
		<div data-testid={testID} className={className}>
			{children}
		</div>
	),
}));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children, testID }: React.PropsWithChildren<{ testID?: string }>) => (
		<div data-testid={testID}>{children}</div>
	),
}));
jest.mock('../health/components', () => ({
	CodeChip: ({ code, onPress, testID }: { code: string; onPress: () => void; testID: string }) => (
		<button data-testid={testID} onClick={onPress}>
			{code}
		</button>
	),
	HairlineHeaderCell: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	HairlineHeaderRow: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	LevelIndicator: () => <span />,
	RepeatChip: () => <span />,
}));
jest.mock('../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));
jest.mock('../../../hooks/use-local-date', () => ({
	useLocalDate: () => ({ formatDate: () => '10:00' }),
}));
jest.mock('./event-title', () => ({ useEventTitle: () => () => 'Database error' }));
jest.mock('./row-detail', () => ({
	RowDetail: () => <div data-testid="logs-row-detail" />,
}));

describe('Ledger (layout B2)', () => {
	const renderLedger = (props: Partial<React.ComponentProps<typeof Ledger>> = {}) =>
		render(
			<Ledger
				resource={null as never}
				total$={null as never}
				activeKind={undefined}
				onKindPress={jest.fn()}
				{...props}
			/>
		);

	it('never nests a button inside a button', () => {
		const { container } = renderLedger();
		expect(container.querySelector('button button')).toBeNull();
	});

	it('toggles the detail from the whole md+ row overlay', () => {
		renderLedger();
		fireEvent.click(screen.getByTestId('logs-row-log-1'));
		expect(screen.getByTestId('logs-row-detail')).not.toBeNull();
		fireEvent.click(screen.getByTestId('logs-row-log-1'));
		expect(screen.queryByTestId('logs-row-detail')).toBeNull();
	});

	it('reports the tapped level pill kind', () => {
		const onKindPress = jest.fn();
		renderLedger({ onKindPress });
		fireEvent.click(screen.getByTestId('logs-pill-log-1'));
		expect(onKindPress).toHaveBeenCalledWith('error');
		fireEvent.click(screen.getByTestId('logs-pill-log-2'));
		expect(onKindPress).toHaveBeenCalledWith('sync');
	});

	it('renders a dash status for neutral rows and no show-more button', () => {
		renderLedger();
		expect(screen.queryByTestId('logs-ok-log-2')).toBeNull();
		expect(screen.queryByTestId('logs-show-more')).toBeNull();
	});

	it('keeps the row and code badge as separate buttons that each toggle expansion once', () => {
		renderLedger();
		fireEvent.click(screen.getByTestId('logs-row-sm-log-1'));
		expect(screen.getByTestId('logs-row-detail')).not.toBeNull();
		const codeBadges = screen.getAllByTestId('logs-code-log-1');
		fireEvent.click(codeBadges[codeBadges.length - 1]);
		expect(screen.queryByTestId('logs-row-detail')).toBeNull();
	});

	it('keeps the vertical padding inside the sm row press target', () => {
		renderLedger();
		expect(screen.getByTestId('logs-row-sm-log-1').className.split(/\s+/)).toContain('py-2');
	});

	it('keeps the sm status badge out of the title layout flow', () => {
		renderLedger();
		const codeBadges = screen.getAllByTestId('logs-code-log-1');
		expect(codeBadges[codeBadges.length - 1].closest('.absolute')).not.toBeNull();
	});
});
