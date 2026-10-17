/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { createTestT } from '../../../../jest/translate';
import { RowDetail } from './row-detail';

import type { LogRow } from './logs-logic';

const mockT = createTestT();
/** Swappable so one test can prove the reason resolves through `t()`, not the registry. */
let activeT: (key: string, values?: Record<string, unknown>) => string = mockT;
const mockWriteText = jest.fn().mockResolvedValue(undefined);

const mockOpenURL = jest.fn().mockResolvedValue(undefined);

jest.mock('react-native', () => ({
	Platform: { OS: 'web' },
	Share: { share: jest.fn() },
	View: ({ children, testID }: React.PropsWithChildren<{ testID?: string }>) => (
		<div data-testid={testID}>{children}</div>
	),
}));
jest.mock('@wcpos/utils/open-external-url', () => ({
	openExternalURL: (url: string) => mockOpenURL(url),
}));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@wcpos/components/button', () => ({
	Button: ({
		children,
		testID,
		onPress,
		size,
	}: React.PropsWithChildren<{ testID?: string; onPress?: () => void; size?: string }>) => (
		<button data-testid={testID} data-size={size} onClick={onPress}>
			{children}
		</button>
	),
	ButtonText: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
// Mirrors the real Text: `decodeHtml` runs the same html-entities decode, so a
// row that forgets the prop renders the raw entity here exactly as it would on a
// till. A mock that swallowed the prop would make the entity test unfailable.
jest.mock('@wcpos/components/text', () => {
	const { decode } = jest.requireActual('html-entities');
	return {
		Text: ({
			children,
			className,
			decodeHtml,
		}: React.PropsWithChildren<{ className?: string; decodeHtml?: boolean }>) => (
			<span className={className}>
				{decodeHtml && typeof children === 'string' ? decode(children) : children}
			</span>
		),
	};
});
jest.mock('@wcpos/components/toast', () => ({ Toast: { show: jest.fn() } }));
jest.mock('@wcpos/components/tree', () => ({
	Tree: ({ value }: { value: unknown }) => (
		<div data-testid="logs-context">{JSON.stringify(value)}</div>
	),
}));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children, testID }: React.PropsWithChildren<{ testID?: string }>) => (
		<div data-testid={testID}>{children}</div>
	),
}));
jest.mock('../health/components', () => ({
	KVGrid: ({ entries }: { entries: { label: string; value: string }[] }) => (
		<div>
			{entries.map(({ label, value }) => (
				<div key={label}>
					<span>{label}</span>
					<span>{value}</span>
				</div>
			))}
		</div>
	),
}));
jest.mock('../../../contexts/translations', () => ({ useT: () => activeT }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
type MockRecordLabel = {
	kind: string;
	handle: string | null;
	uuid?: string | null;
	status: string;
	text: string;
};
let mockRecordLabel: MockRecordLabel | null = null;
const mockUseRecordLabel = jest.fn(
	(collection?: string | null, recordId?: string | null): MockRecordLabel | null =>
		collection && recordId ? mockRecordLabel : null
);
jest.mock('../health/use-record-label', () => ({
	useRecordLabel: (collection?: string | null, recordId?: string | null) =>
		mockUseRecordLabel(collection, recordId),
}));
jest.mock('../../../hooks/use-local-date', () => ({
	useLocalDate: () => ({ formatDate: () => '10:00' }),
}));

const description = 'Updates made in your store were saved to this device.';
const row: LogRow = {
	logId: 'log-1',
	timestamp: 1_000,
	message: 'Applied one update',
	context: { type: 'apply.pull' },
};

beforeEach(() => {
	Object.defineProperty(navigator, 'clipboard', {
		configurable: true,
		value: { writeText: mockWriteText },
	});
	mockWriteText.mockClear();
	mockPush.mockClear();
	mockUseRecordLabel.mockClear();
	mockRecordLabel = null;
	activeT = mockT;
});

describe('RowDetail', () => {
	it('links a coded error row straight to its docs page', () => {
		const codedRow: LogRow = { ...row, code: 'SYNC101', level: 'error' };
		render(<RowDetail row={codedRow} kind="error" title="Local save failed" />);

		const helpButton = screen.getByTestId('logs-help-SYNC101');
		fireEvent.click(helpButton);

		expect(mockOpenURL).toHaveBeenCalledWith('https://docs.wcpos.com/error-codes/SYNC101');
	});

	it('renders the per-code action on a low-stakes code', () => {
		const codedRow: LogRow = { ...row, code: 'PRODUCT301', level: 'warn' };
		render(<RowDetail row={codedRow} kind="warn" title="Barcode scan did not match a product" />);

		expect(screen.getByText('No products matched the current search and filters.')).not.toBeNull();
		expect(screen.getByText('Clear the filters, or search by name.')).not.toBeNull();
		expect(screen.queryByText(/affected/i)).toBeNull();
		expect(screen.getByTestId('logs-help-PRODUCT301')).not.toBeNull();
	});

	/**
	 * The reason used to be read straight off the registry, which is English-only:
	 * a French till rendered a French title, an English reason and French
	 * guidance in one stack. It now resolves through the catalogue like every
	 * other string, so a till that has the translation shows it.
	 */
	it("renders the reason through the catalogue, not the registry's English field", () => {
		activeT = (key, values) =>
			key === 'health.logs.error_summary.PRODUCT301'
				? 'Aucun produit ne correspond.'
				: mockT(key, values);

		render(
			<RowDetail
				row={{ ...row, code: 'PRODUCT301', level: 'warn' }}
				kind="warn"
				title="Barcode scan did not match a product"
			/>
		);

		expect(screen.getByText('Aucun produit ne correspond.')).not.toBeNull();
		expect(screen.queryByText('No products matched the current search and filters.')).toBeNull();
	});

	// "The server said: …" quotes WordPress verbatim, and WordPress bakes entities
	// into its own REST error copy — quoting it raw shows the cashier markup.
	it("quotes the server's sentence as prose, not as HTML entities", () => {
		render(
			<RowDetail
				row={{
					...row,
					level: 'error',
					context: {
						type: 'push.error',
						direction: 'push',
						reason: 'D&eacute;sol&eacute;, vous n&rsquo;&ecirc;tes pas autoris&eacute;.',
					},
				}}
				kind="error"
				title="Change refused"
			/>
		);

		expect(screen.getByText('The server said: Désolé, vous n’êtes pas autorisé.')).not.toBeNull();
		// The prose line only — the Details tree below it is a raw diagnostic dump
		// and deliberately still shows the wire bytes the server actually sent.
		expect(screen.queryByText(/The server said: D&eacute;sol&eacute;/)).toBeNull();
	});

	// A WordPress fatal answers `internal_server_error` with the PHP error itself
	// in the body; the till quoted the machine code and sent the merchant to the
	// server logs for an answer the row already held (#2439).
	it("quotes the server's own sentence over its machine code when the body carried one", () => {
		const sentence =
			'Allowed memory size of 134217728 bytes exhausted (tried to allocate 16384 bytes) in /srv/www/wp-includes/class-wpdb.php:2324';
		render(
			<RowDetail
				row={{
					...row,
					level: 'error',
					code: 'SYNC131',
					context: {
						type: 'push.error',
						direction: 'push',
						status: 500,
						reason: 'internal_server_error',
						serverMessage: sentence,
					},
				}}
				kind="error"
				title="Could not send a change to your store"
			/>
		);

		expect(screen.getByText(`The server said: ${sentence}`)).not.toBeNull();
		expect(screen.queryByText('The server said: internal_server_error')).toBeNull();
		// The machine code is still on the row for support — in the Details tree.
		expect(screen.getByTestId('logs-context').textContent).toContain('internal_server_error');
	});

	it('still quotes the machine code when the body carried no sentence', () => {
		render(
			<RowDetail
				row={{
					...row,
					level: 'error',
					code: 'SYNC131',
					context: { type: 'push.error', direction: 'push', reason: 'internal_server_error' },
				}}
				kind="error"
				title="Could not send a change to your store"
			/>
		);

		expect(screen.getByText('The server said: internal_server_error')).not.toBeNull();
	});

	// `useEventTitle` now titles a code-carrying row with no event type from the
	// code's summary (#2439); the lead line must not say the same sentence twice.
	it('does not repeat the title when the title already is the code summary', () => {
		const summary = mockT('health.logs.error_summary.CHECKOUT101');
		render(
			<RowDetail
				row={{
					logId: 'log-9',
					timestamp: 1_000,
					level: 'error',
					code: 'CHECKOUT101',
					message: 'Checkout failed',
					context: { orderId: 'o1' },
				}}
				kind="error"
				title={summary}
			/>
		);

		expect(screen.queryByText(summary)).toBeNull();
		// Guidance and the help link still lead the detail.
		expect(screen.getByText(mockT('health.logs.error_action.CHECKOUT101'))).not.toBeNull();
		expect(screen.getByTestId('logs-help-CHECKOUT101')).not.toBeNull();
		// The developer message used to BE the title; now it is a muted subline, so
		// a dynamic message (`String(error)`, a plugin's own sentence) still shows.
		expect(screen.getByText('Checkout failed')).not.toBeNull();
	});

	it("keeps a code-only problem row's dynamic message visible under the guidance", () => {
		render(
			<RowDetail
				row={{
					logId: 'log-10',
					timestamp: 1_000,
					level: 'error',
					code: 'SYNC131',
					message: 'Allowed memory size of 134217728 bytes exhausted in class-wpdb.php:2324',
				}}
				kind="error"
				title={mockT('health.logs.error_summary.SYNC131')}
			/>
		);

		expect(
			screen.getByText('Allowed memory size of 134217728 bytes exhausted in class-wpdb.php:2324')
		).not.toBeNull();
	});

	it("does not add an engine row's formulaic message under its translated title", () => {
		render(
			<RowDetail
				row={{
					...row,
					level: 'error',
					code: 'SYNC131',
					message: 'orders 1 — push failed (HTTP 500: internal_server_error)',
					context: { type: 'push.error', direction: 'push', reason: 'internal_server_error' },
				}}
				kind="error"
				title="Could not send a change to your store"
			/>
		);

		expect(
			screen.queryByText('orders 1 — push failed (HTTP 500: internal_server_error)')
		).toBeNull();
	});

	it('leads a quiet row with its translated event description', () => {
		render(<RowDetail row={row} kind="sync" title="Saved updates from your store" />);

		expect(screen.getByText(description)).not.toBeNull();
	});

	it('does not show the event description as the lead line for an error row', () => {
		render(<RowDetail row={row} kind="error" title="Saved updates from your store" />);

		expect(screen.queryByText(description)).toBeNull();
	});

	it('renders context for a problem row', () => {
		render(
			<RowDetail
				row={{ ...row, level: 'error', context: { detail: 'problem context' } }}
				kind="error"
			/>
		);

		expect(screen.getByTestId('logs-context').textContent).toContain('problem context');
	});

	it('does not use an event-code message as problem prose', () => {
		const { container } = render(
			<RowDetail row={{ ...row, level: 'error', message: 'apply.pull' }} kind="error" />
		);

		expect(container.querySelector('.font-medium')).toBeNull();
		expect(screen.getAllByText('apply.pull')).toHaveLength(1);
	});

	it('does not repeat an event-code message as quiet narration', () => {
		render(<RowDetail row={{ ...row, message: 'apply.pull' }} kind="sync" title="Sync event" />);

		expect(screen.getAllByText('apply.pull')).toHaveLength(1);
	});

	it('shows the labelled event code, and copies the WHOLE entry rather than the code', async () => {
		render(
			<RowDetail
				row={{
					...row,
					level: 'error',
					code: 'CHECKOUT401',
					context: { ...row.context, detail: 'total: 65.390000 -> 65.400000' },
				}}
				kind="error"
				title="Saved updates from your store"
			/>
		);

		expect(screen.getByText('Event code')).not.toBeNull();
		expect(screen.getByText('apply.pull')).not.toBeNull();
		fireEvent.click(screen.getByTestId('logs-copy-event-log-1'));

		await waitFor(() => expect(mockWriteText).toHaveBeenCalled());
		const copied = mockWriteText.mock.calls[0][0] as string;
		// The regression: this used to be exactly 'apply.pull' and nothing else.
		expect(copied).toContain('Event: apply.pull');
		expect(copied).toContain('Error code: CHECKOUT401');
		expect(copied).toContain('total: 65.390000 -> 65.400000');
	});

	it('hides the copy button when the Clipboard API is unavailable', () => {
		Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });

		render(<RowDetail row={row} kind="sync" title="Saved updates from your store" />);

		expect(screen.queryByTestId('logs-copy-event-log-1')).toBeNull();
	});

	it('merges risk and next step into one guidance line on a data-at-risk code', () => {
		render(<RowDetail row={{ ...row, code: 'SYNC101' }} kind="error" />);

		expect(
			screen.getByText(
				"Don't clear this device's data — it may hold sales that haven't reached your store. Free up device storage, then check the change shows up. If it's missing, enter it again. Contact support if it repeats."
			)
		).not.toBeNull();
		// The registry docs body renders on the linked docs page, not in the app.
		expect(
			screen.queryByText(
				'Do not clear or reload local data. Export diagnostics and contact support before retrying or repairing anything.'
			)
		).toBeNull();
		expect(screen.queryByText(/Repair from Store health/)).toBeNull();
	});

	it('pairs the local-data warning with the per-code action on a local-only code', () => {
		render(<RowDetail row={{ ...row, code: 'AUTH131' }} kind="error" />);

		expect(
			screen.getByText(
				"Don't clear this device's data — it may hold changes your store doesn't have yet. Choose the store again to sign back in. If the site had to be added again, contact support before clearing local data."
			)
		).not.toBeNull();
	});

	it('sends damaged local data to support, never to a Repair button that does not exist', () => {
		render(<RowDetail row={{ ...row, code: 'SYNC111' }} kind="error" />);

		expect(
			screen.getByText(
				"Don't clear this device's data — it may hold sales that haven't reached your store. Tap Copy debug info at the top of Logs and send it to WCPOS support. Don't reinstall."
			)
		).not.toBeNull();
		expect(screen.queryByText(/Repair from Store health/)).toBeNull();
	});

	it.each(['PAYMENT201', 'PRINT201'] as const)(
		'pairs the outcome warning with the per-code action for %s',
		(code) => {
			render(<RowDetail row={{ ...row, code }} kind="error" />);

			const action =
				code === 'PAYMENT201'
					? 'Check the terminal and provider dashboard before re-charging.'
					: 'Check the printer before reprinting.';
			expect(
				screen.getByText(`The result couldn't be confirmed — check before trying again. ${action}`)
			).not.toBeNull();
			expect(screen.queryByText(/check your store/i)).toBeNull();
		}
	);

	it('never tells a merchant to clear an unopenable database on SYNC311', () => {
		render(<RowDetail row={{ ...row, code: 'SYNC311' }} kind="error" />);

		// Clearing deletes the only copy of sales that never reached the store
		// (2026-10-17 audit): the action is update-then-support, behind the
		// data-at-risk warning.
		expect(
			screen.getByText(
				"Don't clear this device's data — it may hold sales that haven't reached your store. Update WCPOS to the latest version and reopen. If it still won't open, tap Copy debug info and contact support."
			)
		).not.toBeNull();
		expect(screen.queryByText(/clear the local database/i)).toBeNull();
		expect(
			screen.queryByText(
				'Do not reset the affected local collection when this device may hold changes that never reached your store — resetting deletes the only local copy. Export diagnostics to help support investigate, then contact support for recovery guidance.'
			)
		).toBeNull();
		expect(screen.queryByText(/Repair from Store health/)).toBeNull();
	});

	describe('names the record and links to where it is fixed', () => {
		const heldRow: LogRow = {
			...row,
			level: 'warn',
			code: 'SYNC221',
			message: 'orders ae263330 — conflict transition failed',
			context: {
				type: 'queue.write.conflict-transition',
				collection: 'orders',
				recordId: 'ae263330-fbff-4834-8798-3f52ff650c79',
			},
		};

		it('shows the record by name, keeping the raw id in Details only', () => {
			mockRecordLabel = {
				kind: 'Order',
				handle: '#1234 · 45.00',
				uuid: 'ae263330-fbff-4834-8798-3f52ff650c79',
				status: 'found',
				text: 'Order: #1234 · 45.00',
			};
			render(<RowDetail row={heldRow} kind="warn" title="Change held" />);

			expect(mockUseRecordLabel).toHaveBeenCalledWith(
				'orders',
				'ae263330-fbff-4834-8798-3f52ff650c79'
			);
			expect(screen.getByText('Record')).not.toBeNull();
			expect(screen.getByText('Order: #1234 · 45.00')).not.toBeNull();
			expect(screen.getByTestId('logs-context').textContent).toContain(
				'ae263330-fbff-4834-8798-3f52ff650c79'
			);
		});

		it('opens the record on its edit screen', () => {
			mockRecordLabel = {
				kind: 'Order',
				handle: '#1234 · 45.00',
				uuid: 'ae263330-fbff-4834-8798-3f52ff650c79',
				status: 'found',
				text: 'Order: #1234 · 45.00',
			};
			render(<RowDetail row={heldRow} kind="warn" title="Change held" />);

			fireEvent.click(screen.getByTestId('logs-open-record-log-1'));
			expect(mockPush).toHaveBeenCalledWith('/orders/edit/ae263330-fbff-4834-8798-3f52ff650c79');
		});

		it('offers no Open record for a record this device does not hold', () => {
			mockRecordLabel = {
				kind: 'Order',
				handle: null,
				status: 'missing',
				text: 'Order (not on this device)',
			};
			render(<RowDetail row={heldRow} kind="warn" title="Change held" />);

			expect(screen.getByText('Order (not on this device)')).not.toBeNull();
			expect(screen.queryByTestId('logs-open-record-log-1')).toBeNull();
			// The held change is still resolved on the Database tab.
			expect(screen.getByTestId('logs-go-database-log-1')).not.toBeNull();
		});

		it('offers no Open record while the read is still in flight', () => {
			mockRecordLabel = { kind: 'Order', handle: null, status: 'unresolved', text: 'Order' };
			render(<RowDetail row={heldRow} kind="warn" title="Change held" />);

			expect(screen.queryByTestId('logs-open-record-log-1')).toBeNull();
		});

		// A pull repair row names the product by the store's id; the edit route
		// is keyed by the local uuid the read found.
		it('opens a record found by its store id on its local uuid', () => {
			mockRecordLabel = {
				kind: 'Product',
				handle: 'Blue Tee',
				uuid: 'p-uuid',
				status: 'found',
				text: 'Product: Blue Tee',
			};
			render(
				<RowDetail
					row={{
						...row,
						level: 'warn',
						code: 'SYNC331',
						context: { type: 'apply.escalation', collection: 'products', recordId: 80 },
					}}
					kind="warn"
					title="A record does not match"
				/>
			);

			fireEvent.click(screen.getByTestId('logs-open-record-log-1'));
			expect(mockPush).toHaveBeenCalledWith(
				'/(app)/(drawer)/products/(modals)/edit/product/p-uuid'
			);
		});

		it('offers no Database action on an auto-reverted (recovered) SYNC201 row', () => {
			render(
				<RowDetail
					row={{ ...row, level: 'error', code: 'SYNC201', outcome: 'recovered' }}
					kind="error"
					title="Reverted a change"
				/>
			);

			expect(screen.queryByTestId('logs-go-database-log-1')).toBeNull();
		});

		it.each(['SYNC201', 'SYNC211', 'SYNC221', 'SYNC321', 'SYNC331'])(
			'takes a %s row to Store health → Database',
			(code) => {
				render(<RowDetail row={{ ...row, level: 'warn', code }} kind="warn" title="Problem" />);

				fireEvent.click(screen.getByTestId('logs-go-database-log-1'));
				expect(mockPush).toHaveBeenCalledWith('/health/database');
			}
		);

		it('offers neither action on a row with no record and no Database code', () => {
			render(
				<RowDetail row={{ ...row, level: 'error', code: 'SYNC101' }} kind="error" title="Oops" />
			);

			expect(screen.queryByTestId('logs-open-record-log-1')).toBeNull();
			expect(screen.queryByTestId('logs-go-database-log-1')).toBeNull();
		});
	});

	it('shows the summary, guidance and Help on a coded info row', () => {
		render(
			<RowDetail
				row={{ ...row, level: 'info', code: 'PAYMENT101' }}
				kind="info"
				title="Payment status refresh failed"
			/>
		);

		expect(
			screen.getByText('Payment succeeded, but WCPOS could not refresh its status afterward.')
		).not.toBeNull();
		expect(screen.getByText(/No action needed — the payment succeeded/)).not.toBeNull();
		expect(screen.getByTestId('logs-help-PAYMENT101')).not.toBeNull();
	});

	it('promotes the field, SKU and overwritten fields the copy points at into the facts', () => {
		render(
			<RowDetail
				row={{
					...row,
					level: 'warn',
					context: {
						type: 'queue.write.conflict-overwrote-server',
						field: 'regular_price',
						sku: 'TEE-BLUE-M',
						overwrittenFields: ['stock_quantity', 'price'],
						operation: 'update',
					},
				}}
				kind="warn"
				title="Overwrote store fields"
			/>
		);

		expect(screen.getByText('Field')).not.toBeNull();
		expect(screen.getByText('regular_price')).not.toBeNull();
		expect(screen.getByText('SKU')).not.toBeNull();
		expect(screen.getByText('TEE-BLUE-M')).not.toBeNull();
		expect(screen.getByText('Overwritten fields')).not.toBeNull();
		expect(screen.getByText('stock_quantity, price')).not.toBeNull();
		expect(screen.getByText('Operation')).not.toBeNull();
		expect(screen.getByText('update')).not.toBeNull();
	});

	it("lists the store's reason as a fact when the lead does not already quote it", () => {
		render(
			<RowDetail
				row={{
					...row,
					context: { type: 'apply.pull', serverMessage: 'Sorry, you can&#8217;t do that.' },
				}}
				kind="sync"
				title="Saved updates from your store"
			/>
		);

		expect(screen.getByText("Store's reason")).not.toBeNull();
		expect(screen.getByText('Sorry, you can’t do that.')).not.toBeNull();
	});

	it("does not repeat the store's reason as a fact when the lead quotes it", () => {
		render(
			<RowDetail
				row={{
					...row,
					level: 'error',
					code: 'SYNC131',
					context: { type: 'push.error', direction: 'push', serverMessage: 'Store is down.' },
				}}
				kind="error"
				title="Could not send a change to your store"
			/>
		);

		expect(screen.getByText('The server said: Store is down.')).not.toBeNull();
		expect(screen.queryByText("Store's reason")).toBeNull();
	});
});
