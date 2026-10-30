/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { DialogFooter } from '@wcpos/components/dialog';

import { RecordDialog } from '.';

type Props = React.PropsWithChildren<Record<string, unknown>>;
jest.mock('@wcpos/components/dialog', () => ({
	...jest.requireActual('../../../../../jest/footer.test-utils'),
	DialogContent: ({ children, side, size, portalHost, testID }: Props) => (
		<div
			role="dialog"
			data-testid={testID as string}
			data-side={side as string}
			data-size={size as string}
			data-host={portalHost as string}
		>
			{children}
		</div>
	),
	DialogHeader: ({ children }: Props) => <div>{children}</div>,
	DialogTitle: ({ children }: Props) => <h1>{children}</h1>,
	DialogBody: ({ children }: Props) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/tabs', () => {
	const Tab = React.createContext<{ value: string; set: (v: string) => void }>({
		value: '',
		set: () => {},
	});
	return {
		Tabs: ({ value, onValueChange, children }: Props) => (
			<Tab.Provider value={{ value: value as string, set: onValueChange as (v: string) => void }}>
				{children}
			</Tab.Provider>
		),
		TabsList: ({ children }: Props) => <div>{children}</div>,
		TabsTrigger: function Trigger({ value, children }: Props) {
			const { set } = React.useContext(Tab);
			return <button onClick={() => set(value as string)}>{children}</button>;
		},
		TabsContent: function Content({ value, children }: Props) {
			return React.useContext(Tab).value === value ? <div>{children}</div> : null;
		},
	};
});
jest.mock('@wcpos/components/text', () => ({ Text: ({ children }: Props) => <>{children}</> }));
jest.mock('@wcpos/components/tree', () => ({
	Tree: ({ value }: { value: unknown }) => <pre>{JSON.stringify(value)}</pre>,
}));
jest.mock('@wcpos/components/empty-state', () => ({
	EmptyState: ({ title, testID }: { title: string; testID: string }) => (
		<p data-testid={testID}>{title}</p>
	),
}));
jest.mock('../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));

const record = { uuid: 'r1' };

it('shows the title, the record on the Form tab, and its payload on the JSON tab', () => {
	render(
		<RecordDialog
			title="Edit Bob"
			record={record}
			form={(r) => <p>form for {r.uuid}</p>}
			payload={{ id: 7 }}
		/>
	);
	expect(screen.getByRole('heading').textContent).toBe('Edit Bob');
	expect(screen.getByText('form for r1')).toBeTruthy();
	expect(screen.queryByText('{"id":7}')).toBeNull();
	fireEvent.click(screen.getByText('common.json'));
	expect(screen.getByText('{"id":7}')).toBeTruthy();
	expect(screen.queryByText('form for r1')).toBeNull();
	expect(screen.getByText('common.form')).toBeTruthy();
});

it('renders a missing record as an empty state under the title, with no tabs and no footer', () => {
	render(
		<RecordDialog
			title="Customer"
			record={null}
			notFound="No customer found"
			form={() => <p>form</p>}
			payload={undefined}
			footer={<p>footer</p>}
		/>
	);
	expect(screen.getByRole('heading').textContent).toBe('Customer');
	expect(screen.getByTestId('record-dialog-not-found').textContent).toBe('No customer found');
	expect(screen.queryByText('common.json')).toBeNull();
	expect(screen.queryByText('form')).toBeNull();
	expect(screen.queryByText('footer')).toBeNull();
});

it('renders the footer under the tabs', () => {
	render(
		<RecordDialog title="t" record={record} form={() => null} payload={{}} footer={<p>footer</p>} />
	);
	expect(screen.getByText('footer')).toBeTruthy();
});

it.each([
	['edit', 'edit tab'],
	['json', '{}'],
	['missing', 'view tab'],
	[undefined, 'view tab'],
])('opens a tab list on the requested tab, or the first one (%s)', (initialTab, shown) => {
	render(
		<RecordDialog
			title="t"
			record={record}
			form={[
				{ value: 'view', label: 'View', render: () => <p>view tab</p> },
				{ value: 'edit', label: 'Edit', render: () => <p>edit tab</p> },
			]}
			initialTab={initialTab}
			payload={{}}
		/>
	);
	expect(screen.getByText(shown)).toBeTruthy();
});

it.each([
	[undefined, 'right', undefined],
	['left', 'left', 'pos'],
] as const)('opens on the %s side at the one size', (side, shown, host) => {
	render(
		<RecordDialog
			side={side}
			portalHost={host}
			title="t"
			record={record}
			form={() => null}
			payload={{}}
		/>
	);
	const panel = screen.getByRole('dialog');
	expect(panel.dataset.side).toBe(shown);
	expect(panel.dataset.host).toBe(host);
	expect(panel.dataset.size).toBe('xl');
});

it.each(['footer', 'tab'])(
	'labels the dismiss Close beside an intent through the record shell %s',
	(path) => {
		const footer = <DialogFooter intent={{ label: 'Sync order' }} close />;
		render(
			<RecordDialog
				title="Order"
				record={record}
				form={[{ value: 'edit', label: 'Edit', render: () => (path === 'tab' ? footer : null) }]}
				payload={{}}
				footer={path === 'footer' ? footer : undefined}
			/>
		);
		expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
	}
);
