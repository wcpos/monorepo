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

jest.mock('react-native', () => ({
	Pressable: ({
		children,
		testID,
		onPress,
	}: React.PropsWithChildren<{ testID?: string; onPress?: () => void }>) => (
		<button data-testid={testID} onClick={onPress}>
			{children}
		</button>
	),
	View: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
jest.mock('observable-hooks', () => ({
	useObservableState: () => 1,
	useObservableSuspense: () => ({ hits: [{ document: { toJSON: () => row } }] }),
}));
jest.mock('@wcpos/components/button', () => ({
	Button: ({ children }: React.PropsWithChildren) => <>{children}</>,
	ButtonText: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children, testID }: React.PropsWithChildren<{ testID?: string }>) => (
		<div data-testid={testID}>{children}</div>
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

describe('Ledger mobile row', () => {
	it('keeps the row and code badge as separate buttons that each toggle expansion once', () => {
		const { container } = render(
			<Ledger resource={null as never} total$={null as never} onShowMore={jest.fn()} />
		);

		expect(container.querySelector('button button')).toBeNull();

		fireEvent.click(screen.getByTestId('logs-row-sm-log-1'));
		expect(screen.getByTestId('logs-row-detail')).not.toBeNull();

		const codeBadges = screen.getAllByTestId('logs-code-log-1');
		fireEvent.click(codeBadges[codeBadges.length - 1]);
		expect(screen.queryByTestId('logs-row-detail')).toBeNull();
	});
});
