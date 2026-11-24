/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { de, enGB } from 'date-fns/locale';
import { BehaviorSubject } from 'rxjs';

import {
	type EngineRecord,
	type OrderPayload,
	WriteDeferredError,
	WriteOutcomeTimeoutError,
} from '@wcpos/query';
import { wooMetaCarrier } from '@wcpos/sync-core';
import { mergeProtectedOrderMeta } from '@wcpos/sync-engine';
import { getLogger } from '@wcpos/utils/logger';

import { EditOrderForm } from './form';

const mockPush = jest.fn();
const mockFlush = jest.fn();
const mockLocalPatch = jest.fn();
const mockResidentPatch = jest.fn();
const mockRuntime = {};
jest.mock('@wcpos/query/mutations', () => ({
	...jest.requireActual('@wcpos/query/mutations'),
	patchEngineResident: (...args: unknown[]) => mockResidentPatch(...args),
}));
let mockCanReassign = true;
let mockFeature = true;
let mockPhone = false;
let mockWindowHeight = 768;
let mockPlatform = 'web';
jest.mock('react-native', () => ({
	...jest.requireActual('react-native'),
	Platform: {
		...jest.requireActual('react-native').Platform,
		get OS() {
			return mockPlatform;
		},
	},
	useWindowDimensions: () => ({ width: 1024, height: mockWindowHeight, scale: 1, fontScale: 1 }),
}));
let mockPopover: {
	side: string;
	sideOffset: number;
	alignOffset: number;
	align: string;
	avoidCollisions: boolean;
	insets: Record<string, number>;
	onLayout: (event: { nativeEvent: { layout: { height: number; width: number } } }) => void;
};
let mockLocale = enGB;
const mockStore = { id: 4, timezone: 'Europe/Madrid' };
const mockStores = new BehaviorSubject([{ id: 3, timezone: 'America/New_York' }, mockStore]);
const mockResource = { valueRef$$: new BehaviorSubject({ current: null }) };
const logger = getLogger(['test']);

type Action = React.PropsWithChildren<{
	onPress?: () => void;
	testID?: string;
	disabled?: boolean;
	loading?: boolean;
	variant?: string;
	className?: string;
}>;
function mockButton({ children, testID, onPress, disabled, loading, variant, className }: Action) {
	return (
		<button
			data-testid={testID}
			onClick={onPress}
			disabled={disabled}
			data-loading={loading}
			data-variant={variant}
			data-classes={className}
		>
			{children}
		</button>
	);
}
jest.mock('@wcpos/components/button', () => ({
	Button: mockButton,
	ButtonText: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('@wcpos/components/form', () => {
	const { FormProvider, Controller } = jest.requireActual('react-hook-form');
	function Wrap({ children }: React.PropsWithChildren) {
		return <>{children}</>;
	}
	return {
		Form: FormProvider,
		FormField: Controller,
		FormItem: Wrap,
		FormCombobox: () => null,
		FormSelect: () => null,
		FormTextarea: () => null,
		SavedFieldProvider: Wrap,
		useMarkSaved: () => jest.fn(),
		useSavedName: () => '',
	};
});
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children, testID }: React.PropsWithChildren<{ testID?: string }>) => (
		<span data-testid={testID}>{children}</span>
	),
}));
jest.mock('@wcpos/components/textarea', () => ({
	Textarea: ({
		value,
		onChangeText,
		testID,
		editable,
		maxLength,
	}: {
		value: string;
		onChangeText: (value: string) => void;
		testID: string;
		editable?: boolean;
		maxLength?: number;
	}) => (
		<textarea
			data-testid={testID}
			value={value}
			maxLength={maxLength}
			onChange={(e) => onChangeText(e.target.value)}
			disabled={editable === false}
		/>
	),
}));
jest.mock('@wcpos/components/notice', () => ({
	Notice: ({
		children,
		title,
		testID,
	}: React.PropsWithChildren<{ title: string; testID: string }>) => (
		<section data-testid={testID}>
			{title}
			{children}
		</section>
	),
}));
jest.mock('@wcpos/components/badge', () => ({
	Badge: ({
		children,
		variant,
		tinted,
	}: React.PropsWithChildren<{ variant: string; tinted: boolean }>) => (
		<span data-tone={variant} data-tinted={tinted}>
			{children}
		</span>
	),
}));
jest.mock('@wcpos/components/icon', () => ({
	Icon: ({ name }: { name: string }) => <i data-icon={name} />,
}));
jest.mock('@wcpos/components/lib/device', () => ({ useIsPhone: () => mockPhone }));
jest.mock('@wcpos/components/popover', () => {
	const Open = React.createContext({ open: false, change: (_value: boolean) => {} });
	return {
		Popover: ({
			onOpenChange,
			children,
		}: React.PropsWithChildren<{ onOpenChange: (open: boolean) => void }>) => {
			const [open, setOpen] = React.useState(false);
			return (
				<Open.Provider
					value={{
						open,
						change: (value) => {
							setOpen(value);
							onOpenChange(value);
						},
					}}
				>
					{children}
				</Open.Provider>
			);
		},
		PopoverTrigger: React.forwardRef(function Trigger(props: Action, ref) {
			const { change } = React.useContext(Open);
			React.useImperativeHandle(ref, () => ({
				open: () => change(true),
				close: () => change(false),
				measureInWindow: (measure: (x: number, y: number, width: number, height: number) => void) =>
					measure(621, 415, 375, 44),
			}));
			return mockButton({ ...props, onPress: () => change(true) });
		}),
		PopoverContent: ({ children, ...props }: React.PropsWithChildren<typeof mockPopover>) => {
			mockPopover = props;
			return React.useContext(Open).open ? (
				<div data-testid="calendar-popover">{children}</div>
			) : null;
		},
	};
});
let mockCalendar: {
	maxDate?: string;
	currentDay?: string;
	currentDayLabel?: string;
	locale?: string;
	onValueChange: (day: string) => void;
};
jest.mock('@wcpos/components/calendar', () => ({
	DayCalendar: (props: typeof mockCalendar) => {
		mockCalendar = props;
		return <div data-testid="calendar-grid" />;
	},
}));
jest.mock('../../../../contexts/translations', () => ({
	useT: () => jest.requireActual('../../../../../jest/translate').createTestT(),
}));
jest.mock('../../../../contexts/countries', () => ({
	CountriesProvider: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('../../../../contexts/app-state', () => ({
	useAppState: () => ({ store: mockStore, site: {}, wpCredentials: {} }),
	useStoreSession: () => ({ store: mockStore, site: {}, wpCredentials: {} }),
}));
jest.mock('../../../../hooks/use-local-date', () => ({
	...jest.requireActual('../../../../hooks/use-local-date'),
	useLocalDate: () => ({ dateFnsLocale: mockLocale }),
}));
jest.mock('../../../../hooks/use-locale', () => ({
	useLocale: () => ({ shortCode: mockLocale.code.split('-')[0] }),
}));
jest.mock('@wcpos/query', () => ({
	...jest.requireActual('@wcpos/query'),
	useQueryRuntime: () => mockRuntime,
	useDocField: (value: unknown, select: (value: unknown) => unknown) =>
		value ? select(value) : undefined,
}));
jest.mock('@wcpos/query/user-db', () => ({
	...jest.requireActual('@wcpos/query/user-db'),
	observeCredentialStores: () => mockStores,
}));
jest.mock('@wcpos/query/record-readers', () => ({
	...jest.requireActual('@wcpos/query/record-readers'),
	useEngineRecordByWooId: () => mockResource,
}));
jest.mock('observable-hooks', () => ({
	...jest.requireActual('observable-hooks'),
	useObservableSuspense: () => [],
}));
jest.mock('../../hooks/store-list-resource', () => ({ storeListResource: () => ({}) }));
jest.mock('../../hooks/use-cashier-label', () => ({
	useCashierLabel: (id: unknown) => ({
		id,
		label: id === 9 ? 'Marta Ruiz' : id ? `Cashier #${id}` : '',
	}),
}));
jest.mock('../../hooks/use-user-capabilities', () => ({
	useUserCapabilities: () => ({ caps: { canReassignSales: mockCanReassign } }),
}));
jest.mock('../../hooks/use-server-feature', () => ({ useServerFeature: () => mockFeature }));
jest.mock('../../components/use-record-autosave', () => ({
	useRecordAutosave: () => ({ flush: mockFlush }),
}));
jest.mock('../../contexts/use-push-document', () => ({ usePushDocument: () => mockPush }));
jest.mock('../../hooks/mutations/use-local-mutation', () => ({
	useLocalMutation: () => ({ localPatch: mockLocalPatch }),
}));
jest.mock('../../hooks/use-storage-health', () => ({
	useStorageMoneyPathGuard: () => ({ storageDegraded: false, blockIfDegraded: () => false }),
}));
jest.mock('../../hooks/use-guest-customer', () => ({ useGuestCustomer: () => ({}) }));
jest.mock('../../hooks/use-customer-name-format', () => ({
	useCustomerNameFormat: () => ({ format: () => 'Guest' }),
}));
jest.mock('../../components/customer/address', () => ({
	billingAddressSchema: { shape: {} },
	shippingAddressSchema: { shape: {} },
}));
jest.mock('../../components/customer/address-rows', () => ({
	ADDRESS_FACTS: [],
	ADDRESS_PARTS: [],
	asShipping: (value: unknown) => value,
	useAddressFacts: () => ({
		linked: false,
		isEmpty: () => true,
		clear() {},
		layout: () => ({ offered: [], rows: null }),
	}),
}));
jest.mock('../../components/customer/tax-ids-form', () => ({
	useNewTaxIdRow: () => () => ({}),
	taxIdsFormSchema: {},
	TaxIdsForm: () => null,
}));
jest.mock('../../components/meta-data-form', () => ({
	metaDataSchema: {},
	MetaDataForm: () => null,
}));
jest.mock('../../components/form-errors', () => ({ FormErrors: () => null }));
jest.mock('../../components/currency-select', () => ({ CurrencySelect: () => null }));
jest.mock('../../components/customer-select', () => ({ CustomerSelect: () => null }));
jest.mock('../../components/cashier-select', () => ({ CashierSelect: () => null }));
jest.mock('../../components/order/order-status-select', () => ({ OrderStatusSelect: () => null }));
jest.mock('@wcpos/query/temporary-order', () => ({}));

const saleMeta = () => [
	{ id: 1, key: '_pos_user', value: '7' },
	{ id: 2, key: '_pos_store', value: '3' },
	{ id: 3, key: 'custom', value: 'kept' },
];
let payload: OrderPayload;
let order: EngineRecord<'orders'>;
let emit: () => void;
let writes: Partial<OrderPayload>[];
const correction = (at = '2026-11-23T15:12:17Z', by: number | null = 9) => ({
	at_gmt: at,
	reason: 'Card taken yesterday',
	by,
	changed_at_gmt: '2026-11-24T16:00:00Z',
});
function setCorrection(value: unknown) {
	payload.meta_data = [
		...(payload.meta_data ?? []).filter((row) => row.key !== '_wcpos_sale_day'),
		{ key: '_wcpos_sale_day', value },
	];
}
function setRequest(at = '2026-11-22T15:12:17Z', from = '') {
	payload.meta_data = [
		...(payload.meta_data ?? []).filter((row) => row.key !== '_wcpos_sale_day_request'),
		{
			key: '_wcpos_sale_day_request',
			value: JSON.stringify({ at_gmt: at, reason: 'New request', from }),
		},
	];
}
function applyRequest() {
	const request = JSON.parse(
		String(payload.meta_data?.find((row) => row.key === '_wcpos_sale_day_request')?.value)
	);
	if (request.from === (wooMetaCarrier.readSaleDay(payload.meta_data)?.atGmt ?? ''))
		setCorrection({
			at_gmt: request.at_gmt,
			reason: request.reason,
			by: 9,
			changed_at_gmt: '2026-11-24T16:00:00Z',
		});
	payload.meta_data = payload.meta_data?.filter((row) => row.key !== '_wcpos_sale_day_request');
	emit();
	return { ...order, payload: JSON.parse(JSON.stringify(payload)) };
}
beforeEach(() => {
	jest.clearAllMocks();
	mockCanReassign = true;
	mockFeature = true;
	mockPhone = false;
	mockWindowHeight = 768;
	mockPlatform = 'web';
	mockLocale = enGB;
	payload = {
		id: 50,
		status: 'completed',
		date_paid_gmt: '2026-11-24T15:12:17',
		date_created_gmt: '2026-11-24T15:00:00',
		currency: 'USD',
		billing: {},
		shipping: {},
		meta_data: saleMeta(),
	} as OrderPayload;
	const observable = new BehaviorSubject({
		toJSON: () => ({ payload: JSON.parse(JSON.stringify(payload)) }),
	});
	order = {
		uuid: 'order-50',
		payload,
		$: observable,
		getLatest: () => order,
		toMutableJSON: () => ({ payload }),
		collection: { name: 'orders' },
	} as unknown as EngineRecord<'orders'>;
	emit = () =>
		observable.next({ toJSON: () => ({ payload: JSON.parse(JSON.stringify(payload)) }) });
	writes = [];
	mockFlush.mockReset().mockResolvedValue(true);
	mockLocalPatch.mockReset().mockImplementation(async ({ changes, data }) => {
		const patch = changes ? changes(payload) : data;
		writes.push(patch);
		Object.assign(payload, {
			...patch,
			...(patch.meta_data
				? {
						meta_data: mergeProtectedOrderMeta(
							payload.meta_data ?? [],
							patch.meta_data,
							'mutation'
						),
					}
				: {}),
		});
		emit();
		return { document: order, changes: patch };
	});
	mockResidentPatch.mockReset().mockImplementation(async ({ changes }) => {
		Object.assign(payload, changes);
		emit();
		return order;
	});
	mockPush.mockReset().mockImplementation(async () => applyRequest());
});
const mount = () => render(<EditOrderForm order={order} />);
const paidRow = () => screen.getByTestId('order-row-paid_on');
const audit = () => screen.getByTestId('order-paid-on-audit');
function open() {
	fireEvent.click(screen.getByTestId('order-edit-change-day'));
}
function pick(day = '2026-11-23') {
	fireEvent.click(screen.getByTestId('order-paid-on-day'));
	act(() => mockCalendar.onValueChange(day));
}
function reason(value = 'Card taken yesterday') {
	fireEvent.change(screen.getByTestId('order-paid-on-reason'), { target: { value } });
}
async function move() {
	await act(async () => fireEvent.click(screen.getByTestId('order-paid-on-move')));
}

it('shows the paid POS day in the order store zone, directly after the identity rows', () => {
	payload.date_paid_gmt = '2026-11-25T02:12:17'; // still the 24th in New York, already the 25th at the bound Madrid store
	mount();
	expect(paidRow().textContent).toContain('Tue 24 Nov 2026');
	expect(within(paidRow()).getByText('Change day')).toBeTruthy();
	const rows = [
		...screen.getByTestId('order-form').querySelectorAll('[data-testid^="order-row-"]'),
	].map((row) => row.getAttribute('data-testid'));
	expect(rows.indexOf('order-row-paid_on')).toBeGreaterThan(rows.indexOf('order-row-cashier'));
	expect(rows.indexOf('order-row-paid_on')).toBeLessThan(rows.indexOf('order-row-customer_note'));
});
it.each(['unpaid', 'no cashier'])('omits Paid on for %s', (kind) => {
	if (kind === 'unpaid') payload.date_paid_gmt = undefined;
	else payload.meta_data = [];
	mount();
	expect(screen.queryByTestId('order-row-paid_on')).toBeNull();
});
it.each(['pending', 'pos-open', 'on-hold', 'cancelled'])(
	'omits Paid on for a sale reopened or awaiting payment (%s), even with a paid date',
	(status) => {
		payload.status = status;
		mount();
		expect(screen.queryByTestId('order-row-paid_on')).toBeNull();
	}
);
it('uses captured ledger money when date_paid_gmt is absent, not the creation date', () => {
	payload.date_paid_gmt = undefined;
	payload.meta_data?.push({
		key: '_wcpos_payments',
		value: JSON.stringify({
			schema: 1,
			payments: [
				{
					id: 'p1',
					status: 'captured',
					captured_at_gmt: '2026-11-23T15:12:17Z',
					amount: '10',
					currency: 'USD',
					type: 'cash',
				},
			],
		}),
	});
	mount();
	expect(paidRow().textContent).toContain('Mon 23 Nov 2026');
});
it.each(['cashier', 'old plugin'])('locks for %s without a verb', (kind) => {
	mockCanReassign = kind !== 'cashier';
	mockFeature = kind !== 'old plugin';
	mount();
	expect(paidRow().textContent).toContain(
		kind === 'cashier' ? 'Set at the sale' : 'Needs a newer WCPOS plugin'
	);
	expect(screen.queryByTestId('order-edit-change-day')).toBeNull();
});
it('owns a staged form, requires a different day and a nonblank reason, and cancels without writing', () => {
	mount();
	open();
	expect(screen.queryByTestId('order-row-paid_on')).toBeNull();
	expect(screen.getByTestId('order-paid-on-card').textContent).toContain(
		'Move this sale to another day'
	);
	expect(screen.getByTestId('order-paid-on-move').hasAttribute('disabled')).toBe(true);
	expect(screen.getByTestId('order-paid-on-move').textContent).toBe('Move sale');
	expect(screen.getByTestId('order-paid-on-reason').getAttribute('maxlength')).toBe('500');
	reason();
	pick('2026-11-24');
	expect(screen.getByTestId('order-paid-on-move').hasAttribute('disabled')).toBe(true);
	pick();
	reason('  ');
	expect(screen.getByText('Add a reason first')).toBeTruthy();
	expect(screen.getByTestId('order-paid-on-move').hasAttribute('disabled')).toBe(true);
	reason();
	expect(screen.getByTestId('order-paid-on-move').hasAttribute('disabled')).toBe(false);
	expect(screen.getByTestId('order-paid-on-move').textContent).toBe('Move sale to Mon 23 Nov');
	expect(writes).toEqual([]);
	fireEvent.click(screen.getByTestId('order-paid-on-cancel'));
	expect(paidRow()).toBeTruthy();
	expect(writes).toEqual([]);
});
it('passes the store today, counted day, app locale and caption to the calendar and closes on a pick', () => {
	jest.useFakeTimers().setSystemTime(new Date('2026-11-25T02:00:00Z'));
	try {
		mockLocale = de;
		mount();
		open();
		fireEvent.click(screen.getByTestId('order-paid-on-day'));
		expect(mockCalendar).toMatchObject({
			maxDate: '2026-11-24',
			currentDay: '2026-11-24',
			currentDayLabel: 'The sale is on this day now',
			locale: 'de',
			testID: 'order-paid-on',
		});
		expect(screen.getByText('The sale is on this day now')).toBeTruthy();
		act(() => mockCalendar.onValueChange('2026-11-23'));
		expect(screen.queryByTestId('calendar-popover')).toBeNull();
		expect(screen.getByTestId('order-paid-on-day').textContent).toContain('Nov.');
	} finally {
		jest.useRealTimers();
	}
});
it('flushes and writes exactly one JSON-string request row, preserving all other order fields and metadata', async () => {
	mount();
	open();
	pick();
	reason('  Card taken yesterday  ');
	await move();
	expect(writes).toEqual([
		{
			meta_data: [
				...saleMeta(),
				{
					key: '_wcpos_sale_day_request',
					value: '{"at_gmt":"2026-11-23T15:12:17Z","reason":"Card taken yesterday","from":""}',
				},
			],
		},
	]);
	expect(mockFlush.mock.invocationCallOrder[0]).toBeLessThan(
		mockLocalPatch.mock.invocationCallOrder[0]
	);
	expect(mockLocalPatch.mock.invocationCallOrder[0]).toBeLessThan(
		mockPush.mock.invocationCallOrder[0]
	);
	expect(mockPush).toHaveBeenCalledTimes(1);
	expect(logger.success).toHaveBeenCalledWith(
		'Sale moved to Mon 23 Nov',
		expect.objectContaining({ showToast: true })
	);
	expect(screen.queryByTestId('order-paid-on-card')).toBeNull();
	expect(paidRow().textContent).toContain('Mon 23 Nov 2026');
	expect(audit().textContent).toContain('Rung up Tue 24 Nov 2026, 10:12');
	expect(audit().textContent).toContain('Moved by Marta Ruiz: “Card taken yesterday”');
	expect(screen.getByText('Rung up later').getAttribute('data-tone')).toBe('info');
});
it.each([
	['2026-03-09T14:12:17', '2026-03-07', '2026-03-07T15:12:17Z'],
	['2026-11-02T15:12:17', '2026-10-31', '2026-10-31T14:12:17Z'],
	['2026-11-25T02:12:17', '2026-11-23', '2026-11-24T02:12:17Z'],
])(
	'keeps the New York wall clock from %s when moved to %s, independent of the device zone',
	async (at, day, expected) => {
		payload.date_paid_gmt = at;
		mount();
		open();
		pick(day);
		reason();
		await move();
		expect(
			JSON.parse(
				String(writes[0].meta_data?.find((row) => row.key === '_wcpos_sale_day_request')?.value)
			)
		).toEqual({ at_gmt: expected, reason: 'Card taken yesterday', from: '' });
	}
);
it('uses the rung-up clock after an earlier correction and sends that fact as from', async () => {
	setCorrection(correction('2026-11-23T18:35:41Z'));
	mount();
	open();
	pick('2026-11-22');
	reason();
	await move();
	expect(
		JSON.parse(
			String(writes[0].meta_data?.find((row) => row.key === '_wcpos_sale_day_request')?.value)
		)
	).toEqual({
		at_gmt: '2026-11-22T15:12:17Z',
		reason: 'Card taken yesterday',
		from: '2026-11-23T18:35:41Z',
	});
	expect(writes[0].meta_data?.find((row) => row.key === '_wcpos_sale_day')?.value).toEqual(
		correction('2026-11-23T18:35:41Z')
	);
});
it('never asks for a moment still ahead of now when the sale moves to today', async () => {
	// The rung-up clock, carried onto today, would land after the pinned 02:00Z clock.
	jest.useFakeTimers({ doNotFake: ['setTimeout', 'setInterval', 'queueMicrotask', 'nextTick'] });
	jest.setSystemTime(new Date('2026-11-25T02:00:00Z'));
	try {
		payload.date_paid_gmt = '2026-11-24T03:30:00';
		setCorrection(correction('2026-11-23T15:12:17Z'));
		mount();
		open();
		pick('2026-11-24');
		reason();
		await move();
		expect(
			JSON.parse(
				String(writes[0].meta_data?.find((row) => row.key === '_wcpos_sale_day_request')?.value)
			).at_gmt
		).toBe('2026-11-25T02:00:00Z');
	} finally {
		jest.useRealTimers();
	}
});
it.each(['2026-11-23T15:12:17Z', '2026-11-24T16:12:17Z', '2026-11-25T15:12:17Z'])(
	'shows the earlier-day badge only if correction %s precedes the rung-up store day',
	(at) => {
		setCorrection(correction(at));
		mount();
		expect(!!screen.queryByText('Rung up later')).toBe(at.startsWith('2026-11-23'));
	}
);
it.each([null, 999])('does not invent a name for correction author %s', (by) => {
	setCorrection(correction(undefined, by));
	mount();
	expect(audit().textContent).toContain('Moved: “Card taken yesterday”');
	expect(audit().textContent).not.toContain('Moved by');
});
it('shows loading while sending, then the confirmed previous day while deferred, and the ack without a refresh', async () => {
	setCorrection(correction());
	let reject!: (error: Error) => void;
	mockPush.mockImplementationOnce(
		() =>
			new Promise((_resolve, failure) => {
				reject = failure;
			})
	);
	mount();
	open();
	pick('2026-11-22');
	reason();
	await move();
	expect(screen.getByTestId('order-paid-on-move').getAttribute('data-loading')).toBe('true');
	await act(async () => reject(new WriteOutcomeTimeoutError('m1', {})));
	expect(screen.queryByTestId('order-paid-on-card')).toBeNull();
	expect(paidRow().textContent).toContain('Mon 23 Nov 2026');
	expect(screen.getByTestId('order-paid-on-waiting').textContent).toBe(
		'Moving to Sun 22 Nov · waiting for the store'
	);
	expect(screen.getByTestId('order-edit-change-day').hasAttribute('disabled')).toBe(false);
	expect(audit().textContent).toContain('Rung up Tue 24 Nov 2026, 10:12');
	expect(audit().textContent).toContain('Moved by Marta Ruiz');
	expect(screen.getByText('Rung up later')).toBeTruthy();
	expect(logger.success).not.toHaveBeenCalled();
	act(() => applyRequest());
	expect(screen.queryByTestId('order-paid-on-waiting')).toBeNull();
	expect(paidRow().textContent).toContain('Sun 22 Nov 2026');
	expect(mockPush).toHaveBeenCalledTimes(1);
});
it('falls back to the rung-up day when reopening a queued request', () => {
	setRequest('2026-11-23T15:12:17Z');
	mount();
	expect(paidRow().textContent).toContain('Tue 24 Nov 2026');
	expect(screen.getByTestId('order-paid-on-waiting').textContent).toContain('Mon 23 Nov');
});
it.each([false, true])(
	'reports a 200 refusal at the server value (previous correction: %s), without a toast or revert',
	async (previous) => {
		if (previous) setCorrection(correction());
		const before = payload.meta_data;
		mockPush.mockImplementationOnce(async () => {
			payload.meta_data = before;
			emit();
		});
		mount();
		open();
		pick('2026-11-22');
		reason();
		await move();
		expect(screen.getByTestId('order-paid-on-refused').textContent).toBe(
			'Not moved. The store did not accept this change.'
		);
		expect(paidRow().textContent).toContain(previous ? 'Mon 23 Nov 2026' : 'Tue 24 Nov 2026');
		expect(logger.success).not.toHaveBeenCalled();
		expect(writes).toHaveLength(1);
		open();
		expect(screen.queryByTestId('order-paid-on-refused')).toBeNull();
	}
);
it('locks the refused row when the capability has actually gone', async () => {
	mockPush.mockImplementationOnce(async () => {
		payload.meta_data = saleMeta();
		mockCanReassign = false;
		emit();
	});
	mount();
	open();
	pick();
	reason();
	await move();
	expect(paidRow().textContent).toContain('Set at the sale');
	expect(screen.getByTestId('order-paid-on-refused')).toBeTruthy();
	expect(screen.queryByTestId('order-edit-change-day')).toBeNull();
});

it('keeps an offline-deferred request queued with the old day, without reverting or toasting success', async () => {
	mockPush.mockRejectedValueOnce(new WriteDeferredError('m1'));
	mount();
	open();
	pick();
	reason();
	await move();
	expect(paidRow().textContent).toContain('Tue 24 Nov 2026');
	expect(screen.getByTestId('order-paid-on-waiting')).toBeTruthy();
	expect(writes).toHaveLength(1);
	expect(mockPush).toHaveBeenCalledTimes(1);
	expect(logger.success).not.toHaveBeenCalled();
});

it.each([false, true])(
	'keeps the reason hint outside the Cancel/action footer (phone: %s)',
	(phone) => {
		mockPhone = phone;
		mount();
		open();
		pick();
		const moveButton = screen.getByTestId('order-paid-on-move');
		const cancel = screen.getByTestId('order-paid-on-cancel');
		expect(cancel.getAttribute('data-variant')).toBe('ghost');
		expect(moveButton.parentElement).toBe(cancel.parentElement);
		expect(moveButton.parentElement?.contains(screen.getByText('Add a reason first'))).toBe(false);
		expect(screen.getByTestId('order-paid-on-reason')).toBeTruthy();
		expect(screen.getByText('Reports count the sale on this day.')).toBeTruthy();
	}
);
it('removes only this request locally on a thrown refusal, keeping the fact', async () => {
	const before = correction();
	setCorrection(before);
	mockPush.mockRejectedValueOnce(new Error('HTTP 403')).mockResolvedValueOnce(undefined);
	mount();
	open();
	pick('2026-11-22');
	reason();
	await move();
	expect(writes).toHaveLength(1);
	expect(payload.meta_data).toEqual([...saleMeta(), { key: '_wcpos_sale_day', value: before }]);
	expect(mockPush).toHaveBeenCalledTimes(1);
	expect(logger.success).not.toHaveBeenCalled();
});

it.each(['', '2026-11-23T15:12:17Z'])(
	'fresh mounts preserve the counted fact and request (%s)',
	(from) => {
		if (from) setCorrection(correction());
		setRequest('2026-11-22T15:12:17Z', from);
		const first = mount();
		const text = paidRow().textContent;
		first.unmount();
		mount();
		expect(paidRow().textContent).toBe(text);
		expect(paidRow().textContent).toContain(from ? 'Mon 23 Nov 2026' : 'Tue 24 Nov 2026');
		expect(screen.getByTestId('order-paid-on-waiting').textContent).toContain('Sun 22 Nov');
		if (from) {
			expect(screen.getByText('Rung up later')).toBeTruthy();
			expect(audit().textContent).toContain('Moved by Marta Ruiz');
		}
	}
);
it.each(['2026-11-21T15:12:17Z', '2026-11-23T15:12:17Z'])(
	'ignores stale or already-applied requests: %s',
	(at) => {
		setCorrection(correction());
		setRequest(at, '');
		mount();
		expect(screen.queryByTestId('order-paid-on-waiting')).toBeNull();
	}
);
it('can replace a pending request without replacing the fact', async () => {
	setCorrection(correction());
	setRequest('2026-11-22T15:12:17Z', '2026-11-23T15:12:17Z');
	mockPush.mockRejectedValueOnce(new WriteDeferredError('m1'));
	mount();
	open();
	pick('2026-11-21');
	reason();
	await move();
	expect(payload.meta_data?.filter((row) => row.key === '_wcpos_sale_day_request')).toEqual([
		{
			key: '_wcpos_sale_day_request',
			value:
				'{"at_gmt":"2026-11-21T15:12:17Z","reason":"Card taken yesterday","from":"2026-11-23T15:12:17Z"}',
		},
	]);
	expect(paidRow().textContent).toContain('Mon 23 Nov 2026');
	expect(screen.getByTestId('order-paid-on-waiting').textContent).toContain('Sat 21 Nov');
});
it.each([false, true])(
	'uses the returned answer, then cleans the resident without enqueueing (applied: %s)',
	async (applied) => {
		const fact = correction();
		setCorrection(fact);
		mockPush.mockImplementationOnce(async () => ({
			...order,
			payload: {
				...payload,
				meta_data: [
					...saleMeta(),
					{ key: '_wcpos_sale_day', value: applied ? correction('2026-11-22T15:12:17Z') : fact },
				],
			},
		}));
		mount();
		open();
		pick('2026-11-22');
		reason();
		await move();
		expect(payload.meta_data?.some((row) => row.key === '_wcpos_sale_day_request')).toBe(false);
		expect(writes).toHaveLength(1);
		expect(mockPush).toHaveBeenCalledTimes(1);
		expect(logger.success).toHaveBeenCalledTimes(applied ? 1 : 0);
		expect(!!screen.queryByTestId('order-paid-on-refused')).toBe(!applied);
	}
);
it('reads from the fact at write time, not when the form opened', async () => {
	mount();
	open();
	pick('2026-11-22');
	reason();
	const land = mockLocalPatch.getMockImplementation()!;
	mockLocalPatch.mockImplementationOnce(async (input) => {
		input.changes(payload); // Pre-flight sees no fact; the landed resolver must read again.
		setCorrection(correction());
		return land(input);
	});
	await move();
	expect(
		JSON.parse(
			String(writes[0].meta_data?.find((row) => row.key === '_wcpos_sale_day_request')?.value)
		).from
	).toBe('2026-11-23T15:12:17Z');
});

it.each([
	[1200, 'bottom', 8],
	[768, 'left', 148],
])(
	'places the calendar below with room, otherwise clear of the card (%s high)',
	(height, side, offset) => {
		mockWindowHeight = Number(height);
		mount();
		open();
		fireEvent.click(screen.getByTestId('order-paid-on-day'));
		act(() => mockPopover.onLayout({ nativeEvent: { layout: { height: 410, width: 320 } } }));
		expect(mockPopover).toMatchObject({
			side,
			sideOffset: offset,
			align: 'start',
			avoidCollisions: side === 'left',
			insets: { top: 16, bottom: 16, left: 16, right: 16 },
		});
	}
);
it('accepts a 500-character reason and sets the native input limit at 500', async () => {
	mount();
	open();
	pick();
	expect(screen.getByTestId('order-paid-on-reason').getAttribute('maxlength')).toBe('500');
	reason('x'.repeat(500));
	await move();
	expect(
		JSON.parse(
			String(writes[0].meta_data?.find((row) => row.key === '_wcpos_sale_day_request')?.value)
		).reason
	).toBe('x'.repeat(500));
});
it('ignores an already-applied request even if its from matches the fact', () => {
	setCorrection(correction());
	setRequest('2026-11-23T15:12:17Z', '2026-11-23T15:12:17Z');
	mount();
	expect(screen.queryByTestId('order-paid-on-waiting')).toBeNull();
});
it.each(['answer', 'error'])('does not discard a newer request on %s', async (outcome) => {
	mockPush.mockImplementationOnce(async () => {
		setRequest('2026-11-21T15:12:17Z');
		if (outcome === 'error') throw new Error('HTTP 403');
		return { ...order, payload: { ...payload, meta_data: saleMeta() } };
	});
	mount();
	open();
	pick();
	reason();
	await move();
	expect(wooMetaCarrier.readSaleDayRequest(payload.meta_data)?.atGmt).toBe('2026-11-21T15:12:17Z');
	expect(mockResidentPatch).not.toHaveBeenCalled();
});

it('uses the native vertical-side and horizontal-offset props to place a short-screen calendar beside the card', () => {
	mockPlatform = 'ios';
	mount();
	open();
	fireEvent.click(screen.getByTestId('order-paid-on-day'));
	act(() => mockPopover.onLayout({ nativeEvent: { layout: { height: 410, width: 320 } } }));
	expect(mockPopover).toMatchObject({ side: 'bottom', sideOffset: 8, alignOffset: -468 });
});
