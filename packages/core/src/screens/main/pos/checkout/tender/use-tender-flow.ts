import * as React from 'react';

import { v4 as uuidv4 } from 'uuid';

import { Toast } from '@wcpos/components/toast';
import { useOnlineStatus } from '@wcpos/hooks/use-online-status';
import {
	activeAwaitingCustomer,
	type AwaitingCustomerStamp,
	calculateCartLine,
	countsTowardPaid,
	type DeclaredValues,
	derive,
	fromMinor,
	isLivePaymentStatus,
	mintDevicePayment,
	mintServerPayment,
	type OrderPaymentSummary,
	type PaymentMethodDescriptor,
	type PaymentRow,
	type PaymentTransport,
	readAwaitingCustomer,
	readLedger,
	roundedDue,
	settlesAtRoundedDue,
	SPLIT_META_KEY,
	splitPlanMeta,
	toMinor,
} from '@wcpos/order-math';
import {
	type EngineRecord,
	MoneyCommandError,
	resendOpenCommands,
	useDocField,
	useRecordField,
} from '@wcpos/query';
import { observeOrderCommands, resolveCompletionAttempt } from '@wcpos/query/store-local';
import { RegisterSessionRequiredError } from '@wcpos/query/register-session';
import { POS_META_KEYS, wooMetaCarrier } from '@wcpos/sync-core';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { isActionRefusal } from '../../../../../extensions/actions';
import '../cash-rounding-hook';
import { useActionContext } from '../../hooks/use-action-context';
import { useCartConfig } from '../../hooks/use-cart-config';
import { commitSale, type StampedSale } from '../commit-sale';
import {
	getTerminalPaymentsService,
	type TerminalLegState,
} from '../../../../../services/terminal-payments';
import { presentSessionRequired } from '../session-required';
import { presentTenderRefusal } from '../present-tender-refusal';
import {
	persistSaleProvenance,
	recordSaleAttempt,
	reopenedSince,
	residentUnpaid,
} from '../sale-completion';
import { useSaleContext } from '../hooks/use-sale-context';
import { useConfirmOfflineTender } from './use-confirm-offline-tender';
import { useTerminalLeg } from '../payments/server/use-terminal-leg';
import { useResumeTerminalLegs } from '../payments/server/use-resume-terminal-legs';
import { useStoreSession } from '../../../../../contexts/app-state';
import { useRestHttpClient } from '../../../hooks/use-rest-http-client';
import { pushFailureCode } from '../../../contexts/push-failure-code';
import { useUISettings } from '../../../contexts/ui-settings';
import { useCurrentOrderActions } from '../../contexts/current-order/context';
import {
	enterCheckout,
	getCheckoutModeSnapshot,
	leaveCheckout,
	type OrderSaveState,
	releaseUnconfirmedReceipt,
	selectReceipt,
	setLinesPaidBy,
	setTenderMethod,
	setTenderPlan,
	useTenderMethod,
} from '../checkout-mode';
import { useOrderSaveState } from '../use-order-save-state';
import { resolveMerchantToastText } from '../../../../../contexts/merchant-toast';
import { useT } from '../../../../../contexts/translations';
import { usePaymentMethods } from '../../../hooks/use-payment-methods';
import { usePaymentGateways } from '../../../hooks/use-payment-gateways';
import { useOrderLedgerWrite } from '../../commands/use-order-ledger-write';
import { useStorageMoneyPathGuard } from '../../../hooks/use-storage-health';
import { useCompleteOrderFlow } from '../hooks/use-complete-order-flow';
import { type CheckoutHost, useLeaveCheckoutHost } from '../receipt-stage/use-finish-sale';
import { getUuidFromLineItem } from '../../hooks/utils';
import {
	RecordManualPaymentMirrorError,
	useRecordManualPayment,
	useVoidPayments,
} from '../payments';
import {
	GatewayCancelMirrorError,
	GatewayMirrorError,
	submitStillDone,
} from '../payments/submit-gateway-payment';
import { partitionLiveRows } from '../payments/void-payments';
import { sweepDeadRounding } from '../payments/rounding-sweep';
import { useGatewayPayment } from '../payments/use-gateway-payment';
import {
	declaredValues,
	destinationOf,
	firstMissingRequired,
	isValueComponent,
	prefillValues,
} from './declared-fields';
import { useRegisterBinding } from '../../../../../services/register/use-register-binding';
import { getDriver } from '../../../../../services/payment-drivers/registry';
import { driverReady, useDriverChanges, useDriverStatus } from './use-driver-status';
import { type RememberedReader, useRememberedReader } from './remembered-readers';
import { disabledReasonKey, failureReasonLabel, providerErrorMessage } from './labels';
import {
	activePlan,
	appliedMinor,
	changeMinor,
	initTenderState,
	planLegs,
	quickTenderedAmounts,
	type TenderAction,
	type TenderLineId,
	tenderReducer,
	type TenderState,
} from './tender-state';
import {
	buildTenderTiles,
	deviceTransports,
	initialReaderId,
	legacyPaymentMethods,
	selectableReaders,
	type TenderTile,
} from './tiles';
import { writeZeroBalanceCompletion } from '../../commands/zero-balance-completion';
import { closeConfirmed, type CloseOutcome, useCloseSale } from '../../commands/close-sale';

import type { OrderMutationContext } from '../../hooks/order-mutation-queue';

const logger = getLogger(['wcpos', 'pos', 'checkout', 'tender']);

/** The notes a cashier is handed: the balance itself, then the next whole 5, 10 and 50. */
const QUICK_TENDER_STEPS = [5, 10, 50] as const;

export interface TenderFlow {
	/** The offline tender confirmation (ADR 0040 Decided 1 rule 1); the host renders it. */
	offlineDialog: React.ReactNode;
	/** A money command was sent and its answer never arrived: only Try again (ADR 0040). */
	unansweredCommand: boolean;
	retryCommand: () => Promise<void>;
	rememberedReaderId: string | null;
	rememberReader: (reader: RememberedReader) => Promise<void>;
	bootstrapReader: (transport: PaymentTransport) => Promise<Record<string, unknown> | null>;
	deviceTransport?: PaymentTransport | null;
	pickTransport?: (transport: PaymentTransport) => void;
	deviceReady?: boolean;
	terminalLeg: TerminalLegState | null;
	hasLiveTerminalLeg: boolean;
	readers: ReturnType<typeof selectableReaders>['readers'];
	lockToDefault: boolean;
	pickReader: (id: string) => void;
	cancelTerminalLeg: () => void;
	releaseTerminalLeg: () => void;
	retryTerminalCapture: () => void;
	dismissTerminalLeg: () => void;
	retryTerminalLeg: () => void;
	/** The reducer's state, with an untouched balance prefill shown as the rounded cash due. */
	state: TenderState;
	dispatch: React.Dispatch<TenderAction>;

	/** Store decimal places; every `*Minor` number below is in these units. */
	dp: number;
	totalMinor: number;
	paidMinor: number;
	balanceMinor: number;
	thisPaymentMinor: number;
	afterThisPaymentMinor: number;
	plan: TenderState['plan'];
	planLegs: ReturnType<typeof planLegs>['legs'];
	planLabel: string | null;
	planMore: boolean;
	lines: { id: TenderLineId; name: string; quantity: number; totalMinor: number }[];
	linesPaidBy: TenderState['linesPaidBy'];

	/** The order's ledger rows, in ledger order. */
	rows: PaymentRow[];
	/** Rows with status pending | authorized | captured — money that is currently held. */
	liveRows: PaymentRow[];
	/** The live rows a cancel keeps for a refund instead of voiding (`partitionLiveRows`). */
	retainedRows: PaymentRow[];
	hasLiveLeg: boolean;
	online: boolean;

	tiles: TenderTile[];
	legacyMethods: PaymentMethodDescriptor[];
	methodsLoaded: boolean;
	unsupportedSchema: boolean;

	/** The descriptor for `state.methodId`, or null in the select view. */
	method: PaymentMethodDescriptor | null;
	/** What the current entry would apply to the order: min(entry, balance). */
	entryAppliedMinor: number;
	/** What the current entry would hand back, zero for a method that gives no change. */
	entryChangeMinor: number;
	/** The balance rounded for the selected manual method (#66, #84); the balance when it has none. */
	roundedDueMinor: number;
	/** `roundedDueMinor - balanceMinor` when the current entry settles at the rounded due, else 0. */
	roundingMinor: number;
	/** Quick tendered chips for the current method; empty when it gives no change. */
	quickAmountsMinor: number[];

	/** A record or a void is in flight; every action must be inert while true. */
	busy: boolean;
	saveState: OrderSaveState | null;
	pickMethod: (methodId: string) => void;
	takeTender: () => Promise<void>;
	cancelPayment: () => Promise<void>;

	/** Contract 1.2: the values typed into the method's declared components, prefilled per §1.2. */
	fieldValues: DeclaredValues;
	setFieldValues: (next: DeclaredValues, changedId: string) => void;
	/** `wcpos_fields_invalid` lines keyed by component id, `_form` for the gateway's own. */
	fieldErrors: Record<string, string>;
	/** The awaiting-customer stamp when the order was sent and no money has been taken since. */
	invoiceSent: AwaitingCustomerStamp | null;
	cancelInvoice: () => Promise<void>;
}

type OrderPayload = EngineRecord<'orders'>['payload'];
type FeeLines = NonNullable<OrderPayload['fee_lines']>;
// A fee edit moves the stored total by the fee money alone (the rounding fee has no tax) and
// recomputes nothing: the store may own the order's money (ADR 0032).
const feeMinor = (fees: FeeLines, dp: number) =>
	fees.reduce(
		(sum, fee) =>
			fee.name == null ? sum : sum + toMinor(fee.total, dp) + toMinor(fee.total_tax, dp),
		0
	);
function withFees(latest: OrderPayload, dp: number, edit: (fees: FeeLines) => FeeLines) {
	const fees = latest.fee_lines ?? [];
	const fee_lines = edit(fees);
	const totalMinor = toMinor(latest.total, dp) + feeMinor(fee_lines, dp) - feeMinor(fees, dp);
	return { fee_lines, total: fromMinor(totalMinor, dp) };
}
/** A zero balance the store did not close: say why, and what is due when it said. */
function closeMessage(
	closed: Exclude<CloseOutcome, { kind: 'completed' }>,
	t: ReturnType<typeof useT>
): string {
	if (closed.kind === 'refused') return closed.message;
	if (closed.kind === 'order_changed') return t('pos_checkout.order_changed_retry');
	if (closed.kind === 'reopened') return t('pos_checkout.sale_reopened_elsewhere');
	if (closed.kind === 'unconfirmed') return t('pos_checkout.payment_confirming');
	if (closed.kind === 'outstanding')
		return t('pos_checkout.close_balance_outstanding', { balance: closed.order?.balance ?? '' });
	return t('pos_checkout.close_needs_connection');
}

export function useTenderFlow(
	order: EngineRecord<'orders'>,
	host: CheckoutHost,
	/** The host's overlay layer for the offline confirmation (see `useConfirmOfflineTender`). */
	{ portalHost }: { portalHost?: string } = {}
): TenderFlow {
	useDriverChanges();
	const ctx = useSaleContext();
	const { ctx: actionCtx, actor: actionActor } = useActionContext();
	const storedMethodId = useTenderMethod(order.uuid);
	const saveState = useOrderSaveState(order.uuid);
	const [busy, setBusy] = React.useState(false);
	// State drives rendering; the ref closes the same-tick gap that could otherwise record twice.
	const busyRef = React.useRef(false);
	const payload = useRecordField(order, (record) => record.payload);
	const { store, wpCredentials, storeDB } = useStoreSession();
	const http = useRestHttpClient();
	const [sentCommands, setSentCommands] = React.useState(0);
	// The command journal is an external store: a command sent and never answered gates the
	// tender to Try again across restarts, until a re-send settles it (ADR 0040 §1.3).
	React.useEffect(() => {
		const subscription = observeOrderCommands(storeDB, order.uuid).subscribe({
			// A deferred offline record (sent, no revision) is journaled, not unanswered: gating on it
			// would block an offline split's next leg (ADR 0040 Decided 1 rule 3).
			next: (entries) =>
				setSentCommands(entries.filter(({ sentRevision }) => sentRevision !== null).length),
			error: () => undefined,
		});
		return () => subscription.unsubscribe();
	}, [storeDB, order.uuid]);
	// While this till's own press is in flight its entry is sent too; that is not unanswered. A
	// Try again in flight keeps the gate: its keypad is never shown (CodeRabbit 4346454764).
	const [pressing, setPressing] = React.useState(false);
	const unansweredCommand = sentCommands > 0 && !pressing;
	const actor = React.useMemo(
		() => ({
			id: String(wpCredentials.id ?? ''),
			name: wpCredentials.display_name || wpCredentials.username || '',
		}),
		[wpCredentials.id, wpCredentials.display_name, wpCredentials.username]
	);
	useResumeTerminalLegs(order);
	const terminalLeg = useTerminalLeg(order.uuid);
	const service = getTerminalPaymentsService();
	const displayedRow = React.useRef<string | null>(null);
	const { uiSettings } = useUISettings('pos-cart');
	const { setCurrentOrderID } = useCurrentOrderActions();
	const intentRow = React.useRef<string | null>(null);
	// One attempt per press, kept across a lost answer: the retry replays the same id, so the
	// store answers what it did instead of sending a second invoice. Cleared on any definitive
	// answer, on a change of pill or of the values (a different attempt), and once the stamp
	// already names it (the lost answer has synced in; the next press is Send again).
	const attemptRef = React.useRef<string | null>(null);
	// Read the store's money settings from the LATEST document, not the session's snapshot:
	// an RxDB document instance is immutable, so after Settings → General changes the currency
	// (or Restore server settings does) the snapshot still says the old one and a payment is
	// minted in a currency the order no longer has ("Payment currency must match the order",
	// Pixel 10, 2026-10-13). The order's own currency wins: the store refuses a payment in any
	// other, and a saved cart keeps the currency it was opened in.
	const storeCurrency = useDocField(store, (value) => value.currency) ?? '';
	const currency = payload.currency || storeCurrency;
	const dp = useDocField(store, (value) => value.price_num_decimals) ?? 2;
	const { confirmOfflineTender, dialog: offlineDialog } = useConfirmOfflineTender({
		currencySymbol: payload.currency_symbol,
		dp,
		portalHost,
	});
	const taxDisplayCart = useDocField(store, (value) => value.tax_display_cart);
	const { methods, byId, loaded: methodsLoaded, unsupportedSchema } = usePaymentMethods();
	const online = useOnlineStatus().status === 'online-website-available';
	const { blockIfDegraded } = useStorageMoneyPathGuard();
	const { recordLedger, writeLedgerChanges } = useOrderLedgerWrite();
	const cartConfig = useCartConfig();
	// A save queued offline is an order the server does not have yet (or has stale): even
	// once connectivity is back and before the ack lands, tender must behave as offline —
	// online-only tiles stay disabled and a works-offline tile records its local leg.
	const queuedOffline = saveState?.kind === 'queued-offline';
	const recordManualPayment = useRecordManualPayment({ offline: queuedOffline });
	const gateway = useGatewayPayment();
	const { status: bindingStatus } = useRegisterBinding();
	const voidPayments = useVoidPayments();
	const completeOrderFlow = useCompleteOrderFlow(order, 'stage', host);
	const closeSale = useCloseSale();
	const leaveHost = useLeaveCheckoutHost(host);
	const t = useT();

	const rows = React.useMemo(() => readLedger(payload.meta_data), [payload.meta_data]);
	const derived = React.useMemo(
		() => derive(payload.total, rows, methods, { dp }),
		[payload.total, rows, methods, dp]
	);
	const totalMinor = toMinor(payload.total, dp);
	const paidMinor = toMinor(derived.paid, dp);
	const balanceMinor = toMinor(derived.balance, dp);
	// Initialised from the checkout store rather than always from scratch: the store carries
	// the method the URL seeded or the cashier picked before switching tabs, so the keypad
	// comes back the way it was left. The reducer stays the truth for the entry itself, and
	// every action that opens or closes the keypad publishes the method back to the store.
	const [initialState] = React.useState(() => {
		const initialTiles = buildTenderTiles(methods, {
			online: online && !queuedOffline,
			readersInUse: service?.readersInUse(),
			currentOrderUuid: order.uuid,
			hasLiveLeg: rows.some(({ status }) => isLivePaymentStatus(status)),
			hasServerId: !!payload.id,
		});
		const first = initialTiles.find((tile) => !tile.disabled)?.method;
		const stored = initialTiles.find((tile) => tile.method.id === storedMethodId)?.method;
		const methodId = stored?.id ?? first?.id ?? null;
		const initial = initTenderState({ methodId, balanceMinor });
		const storedPlan = getCheckoutModeSnapshot().tenderPlans.get(order.uuid) ?? null;
		// The legs taken are the money `derive()` counts (ADR 0040 D6): an authorization is a hold.
		const planRows = rows
			.slice(storedPlan?.from ?? rows.length)
			.filter(countsTowardPaid)
			.map((row) => ({
				minor: toMinor(row.amount, dp),
				title: byId.get(row.method_id)?.title ?? row.method_id,
			}));
		// The active view of the plan decides only what the keypad shows (legs, entry prefill).
		const plan = activePlan(storedPlan, planRows.length, balanceMinor);
		const { readers, lockToDefault } = selectableReaders(
			byId.get(methodId ?? '') ?? null,
			service?.readersInUse(),
			order.uuid
		);
		return {
			...initial,
			// The reducer starts from the STORED plan, not the active view of it: a split whose planned
			// legs are all taken but which still owes money (a short leg) is still that split, and its
			// last leg must journal every share.
			plan: balanceMinor > 0 ? storedPlan : null,
			entryMinor: plan
				? planLegs(plan, planRows, balanceMinor).thisPaymentMinor
				: initial.entryMinor,
			linesPaidBy: getCheckoutModeSnapshot().linesPaidBy.get(order.uuid) ?? {},
			readerId: initialReaderId(readers, lockToDefault, null),
		};
	});
	const [state, reducerDispatch] = React.useReducer(tenderReducer, initialState);
	const manuallyPickedReaderMethod = React.useRef<string | null>(null);
	const { readerId: remembered, getLoaded, remember } = useRememberedReader(state.methodId);
	const liveRows = React.useMemo(
		() => rows.filter(({ status }) => isLivePaymentStatus(status)),
		[rows]
	);
	const retainedRows = React.useMemo(
		() => partitionLiveRows(payload.meta_data ?? []).retained,
		[payload.meta_data]
	);
	// useTerminalLeg subscribes to the whole service snapshot, including other readers' holders.
	const readersInUse = service?.readersInUse();
	const tiles = buildTenderTiles(methods, {
		online: online && !queuedOffline,
		readersInUse,
		currentOrderUuid: order.uuid,
		transports:
			state.methodId && state.transport ? { [state.methodId]: state.transport } : undefined,
		hasLiveLeg: liveRows.length > 0,
		hasServerId: !!payload.id,
	});
	// The shared rule (order-math): a stamp beside held money is stale. A zero balance has nothing to send.
	const stamp = React.useMemo(() => activeAwaitingCustomer(payload.meta_data), [payload.meta_data]);
	const invoiceSent = stamp && balanceMinor > 0 ? stamp : null;
	const legacyMethods = React.useMemo(() => legacyPaymentMethods(methods), [methods]);
	// A method the store or a URL names but the till does not offer (not POS-enabled, webview
	// mode) must not open a keypad: `takeTender` can only refuse tiles it can see.
	const method =
		state.methodId && tiles.some(({ method: tile }) => tile.id === state.methodId)
			? (byId.get(state.methodId) ?? null)
			: null;
	const bootstrapReader = React.useCallback(
		async (transport: PaymentTransport) => {
			const currentService = getTerminalPaymentsService();
			if (!currentService || !method) throw new Error('Device payment service or method missing');
			return currentService.bootstrap(method.id, { transport });
		},
		[method]
	);
	const driver = method?.capture.mode === 'device' ? getDriver(method.capture.provider) : undefined;
	useDriverStatus(driver);
	// The gateway catalog's stored POS Order Status for the chosen gateway, journaled with the
	// attempt so a replay settles the order as the pay window would (spec §4.2). Fetched only
	// while the till offers a gateway-mode method; still loading at the press journals null,
	// which reduces the replay to the blocklist it always was.
	const { gateway: gatewayEntry } = usePaymentGateways(
		method?.id ?? null,
		methods.some((candidate) => candidate.capture.mode === 'gateway')
	);
	const settledOrderStatus =
		method?.capture.mode === 'gateway' ? (gatewayEntry?.settled_order_status ?? null) : null;
	// Typed values live per method so switching pills and back keeps what was entered; the
	// first look at a method is its prefill. Errors are the last refusal's and clear on edit.
	const [valuesByMethod, setValuesByMethod] = React.useState({} as Record<string, DeclaredValues>);
	// A refusal belongs to the pill it came from: errors are keyed by method and vanish on a switch.
	const [errorsFor, setErrorsFor] = React.useState({
		methodId: null as string | null,
		errors: {} as Record<string, string>,
	});
	const fields = method?.capture.mode === 'gateway' ? (method.fields ?? null) : null;
	const fieldValues = React.useMemo(() => {
		if (!fields || !method) return {};
		if (valuesByMethod[method.id]) return valuesByMethod[method.id];
		const values = prefillValues(fields, {
			billingEmail: payload.billing?.email,
			billingPhone: payload.billing?.phone,
		});
		// Send again (§4.3): where the last invoice went is the best guess for where this one goes.
		if (stamp?.method_id === method.id && stamp.destination && !destinationOf(fields, values)) {
			const target = fields.components.find(
				(component) =>
					isValueComponent(component) &&
					component.component === 'field' &&
					['email', 'tel'].includes(component.input)
			);
			if (target && isValueComponent(target)) values[target.id] = stamp.destination;
		}
		return values;
	}, [fields, method, valuesByMethod, payload.billing?.email, payload.billing?.phone, stamp]);
	const methodId = method?.id ?? null;
	const fieldErrors = React.useMemo(
		() => (errorsFor.methodId === methodId ? errorsFor.errors : {}),
		[errorsFor, methodId]
	);
	// The view hands back the whole value set it was showing, so the callback needs no
	// snapshot of the prefill; an edit clears that component's line and the gateway's own.
	// Memoized by the compiler: a manual useCallback here cannot name the setter's identity.
	const setFieldValues = (next: DeclaredValues, changedId: string) => {
		if (busyRef.current || methodId === null) return;
		attemptRef.current = null;
		setValuesByMethod((previous) => ({ ...previous, [methodId]: next }));
		setErrorsFor((previous) => {
			if (!(changedId in previous.errors) && !('_form' in previous.errors)) return previous;
			const errors = { ...previous.errors };
			delete errors[changedId];
			delete errors._form;
			return { ...previous, errors };
		});
	};
	// The reader connected on the Card readers settings page decides the transport; the cashier
	// no longer picks one in the pay sheet, so a transport remembered from an earlier reader
	// must not outrank the one that is connected now (WisePad swapped for Tap to Pay).
	const deviceTransport = method
		? (driver?.status$.get().reader?.transport ??
			state.transport ??
			deviceTransports(method)[0]?.transport ??
			null)
		: null;
	const deviceReady = driverReady(method, deviceTransport);
	const pickTransport = React.useCallback(
		(transport: PaymentTransport) => reducerDispatch({ type: 'pick-transport', transport }),
		[reducerDispatch]
	);
	const { readers, lockToDefault } = selectableReaders(method, readersInUse, order.uuid);
	// With a plan, a cash leg is the planned share: notes handed over above it are change,
	// not a bigger leg (the "50" chip for a 46,48 leg). A method that gives no change takes
	// what was typed, capped at the balance — typing a different amount IS changing the leg.
	// The last leg is whatever balance remains (rounding, or a short earlier leg), never the share.
	// The legs taken are the money `derive()` counts (ADR 0040 D6): an authorization is a hold.
	const rowsSinceFrom = rows
		.slice(state.plan?.from ?? rows.length)
		.filter(countsTowardPaid)
		.map((row) => ({
			minor: toMinor(row.amount, dp),
			title: byId.get(row.method_id)?.title ?? row.method_id,
		}));
	// A gateway that runs the whole order has no split: whatever plan is stored is ignored for it
	// (the Split chip is hidden on its keypad) and never written as the sale's provenance.
	const fixedAmount = method?.capture.mode === 'gateway' && !method.capabilities.amount.partial;
	const plan = fixedAmount ? null : activePlan(state.plan, rowsSinceFrom.length, balanceMinor);
	const figures = plan ? planLegs(plan, rowsSinceFrom, balanceMinor) : null;
	const lines = (payload.line_items ?? []).flatMap((line) => {
		const id = getUuidFromLineItem(line) ?? line.id;
		return id === undefined
			? []
			: [
					{
						id,
						name: line.name ?? '',
						quantity: line.quantity ?? 1,
						totalMinor:
							toMinor(line.total ?? '0', dp) +
							(taxDisplayCart === 'incl' ? toMinor(line.total_tax ?? '0', dp) : 0),
					},
				];
	});
	const itemTitle =
		plan?.kind === 'items'
			? lines
					.filter((line) => plan.lineIds.includes(line.id))
					.map((line) => line.name)
					.join(' + ')
			: null;
	const label = figures?.label;
	const planLabel = !label
		? null
		: label.rest
			? t('pos_checkout.rest_of_the_order')
			: itemTitle
				? label.ways > 1
					? t('pos_checkout.item_payment_n_of', { title: itemTitle, n: label.n, ways: label.ways })
					: itemTitle
				: label.title
					? t('pos_checkout.titled_payment_n_of', {
							title: label.title,
							n: label.n,
							ways: label.ways,
						})
					: t('pos_checkout.payment_n_of', { n: label.n, ways: label.ways });
	const planMore = Boolean(label?.rest && lines.some((line) => !state.linesPaidBy[line.id]));
	const plannedLegMinor = figures?.thisPaymentMinor ?? balanceMinor;
	const legCapMinor = method?.capabilities.change ? plannedLegMinor : balanceMinor;
	// Cash rounding (#66, #84) previews what the cash.rounding hook decides at commit, with the
	// same functions on the same facts the commit dispatches.
	const { dueMinor: roundedDueMinor } = roundedDue(
		balanceMinor,
		method?.capture.mode === 'manual' ? method.defaults.rounding : null,
		dp
	);
	// An untouched prefill of the balance is the due, so under rounding it is the rounded due.
	const entryMinor =
		!state.entryDirty && state.entryMinor === balanceMinor ? roundedDueMinor : state.entryMinor;
	// A gateway that takes no part payment runs the whole order (§4.1): the entry is the balance
	// whatever another pill or a plan left typed, so the leg completes and is journaled as such.
	const enteredLegMinor = fixedAmount ? balanceMinor : appliedMinor(entryMinor, legCapMinor);
	const roundingMinor = settlesAtRoundedDue({
		amountMinor: enteredLegMinor,
		tenderedMinor: entryMinor,
		balanceMinor,
		dueMinor: roundedDueMinor,
	})
		? roundedDueMinor - balanceMinor
		: 0;
	const entryAppliedMinor = roundingMinor !== 0 ? roundedDueMinor : enteredLegMinor;
	const entryChangeMinor = changeMinor(
		entryMinor,
		entryAppliedMinor,
		method?.capabilities.change ?? false
	);
	const thisPaymentMinor = plannedLegMinor;
	const afterThisPaymentMinor =
		balanceMinor + roundingMinor - (state.view === 'amount' ? entryAppliedMinor : thisPaymentMinor);

	const quickAmountsMinor = React.useMemo(
		() =>
			method?.capabilities.change
				? quickTenderedAmounts(
						state.view === 'amount' ? entryAppliedMinor : thisPaymentMinor,
						QUICK_TENDER_STEPS.map((step) => step * 10 ** dp)
					)
				: [],
		[thisPaymentMinor, dp, method, state.view, entryAppliedMinor]
	);

	const dispatch = React.useCallback<React.Dispatch<TenderAction>>(
		(action) => {
			if (busyRef.current) return;
			// The rounded prefill is what the cashier sees, so a backspace edits that figure.
			if (action.type === 'key' && action.key === 'backspace' && entryMinor !== state.entryMinor)
				reducerDispatch({ type: 'set-entry', minor: entryMinor });
			reducerDispatch(action);
			if (action.type === 'set-plan') setTenderPlan(order.uuid, action.plan);
			if (action.type === 'clear-plan' || action.type === 'arm-custom' || action.type === 'reset')
				setTenderPlan(order.uuid, null);
			// These are the actions that close the keypad; the store mirrors which method holds it.
			if (action.type === 'back' || action.type === 'reset') setTenderMethod(order.uuid, null);
		},
		[order.uuid, reducerDispatch, entryMinor, state.entryMinor]
	);

	// A local preference can arrive after the tile tap; leave a cashier's choice alone.
	React.useEffect(() => {
		if (
			method?.capture.mode !== 'server' ||
			manuallyPickedReaderMethod.current === method.id ||
			remembered === null
		)
			return;
		const readerId = initialReaderId(readers, lockToDefault, remembered);
		if (readerId !== null && readerId !== state.readerId)
			dispatch({ type: 'pick-reader', readerId });
	}, [method, state.readerId, readers, lockToDefault, remembered, dispatch]);

	const pickMethod = React.useCallback(
		(methodId: string) => {
			if (busyRef.current || (saveState && saveState.kind !== 'queued-offline')) return;
			const tile = tiles.find(({ method: candidate }) => candidate.id === methodId);
			if (!tile) return;
			if (tile.disabled) return;
			// The entry is shared across pills (ledger line 1), so a fixed gateway never writes the
			// balance into it: `entryAppliedMinor` applies the balance for it instead. A split plan
			// cannot survive a method that runs the whole order; one with no legs yet is dropped.
			const fixed =
				tile.method.capture.mode === 'gateway' && !tile.method.capabilities.amount.partial;
			const dropsPlan = fixed && state.plan !== null;
			if (dropsPlan) {
				reducerDispatch({ type: 'clear-plan', balanceMinor });
				setTenderPlan(order.uuid, null);
			}
			if (methodId !== state.methodId) attemptRef.current = null;
			// With the plan gone its share is gone too: the next pill starts from the balance.
			const prefillMinor = dropsPlan
				? balanceMinor
				: state.view === 'amount'
					? state.entryMinor
					: plannedLegMinor;
			const { readers, lockToDefault } = selectableReaders(
				tile.method,
				service?.readersInUse(),
				order.uuid
			);
			reducerDispatch({
				type: 'pick-method',
				methodId,
				prefillMinor,
				readerId: initialReaderId(readers, lockToDefault, getLoaded(methodId)),
			});
			setTenderMethod(order.uuid, methodId);
		},
		[
			plannedLegMinor,
			balanceMinor,
			order.uuid,
			saveState,
			state.view,
			state.entryMinor,
			state.methodId,
			state.plan,
			tiles,
			service,
			reducerDispatch,
			getLoaded,
		]
	);

	// Every row this flow writes names the order it is about. Without it the Logs
	// screen cannot answer "what happened on order 1041?", which is the only question
	// a merchant actually asks of a checkout row.
	const orderContext = React.useMemo(
		() => ({ orderId: payload.id ?? null, orderUUID: order.uuid }),
		[payload.id, order.uuid]
	);

	const tenderRecorded = React.useCallback(
		(row: PaymentRow, via?: 'online' | 'offline') => {
			if (via) {
				logger.info('Manual payment recorded', {
					actor,
					terminal: { operationId: row.id },
					context: {
						...orderContext,
						type: via === 'offline' ? 'payment.recorded-offline' : 'payment.recorded',
						paymentId: row.id,
						amount: row.amount,
						method: row.method_id,
					},
				});
			}
			const latest = readLedger(order.getLatest().payload.meta_data);
			const index = latest.findIndex((candidate) => candidate.id === row.id);
			if (index < 0) latest.push(row);
			else latest[index] = row;
			// The balance the summary shows (`derive()`): captured money only (ADR 0040 D6), and a
			// succeeded refund on a reopened sale due again (Codex 4342609028 on #2831).
			const { balance } = derive(order.getLatest().payload.total, latest, [], { dp });
			const action: TenderAction = {
				type: 'tender-recorded',
				balanceMinor: toMinor(balance, dp),
				// The legs the plan has taken: the money `derive()` counts, so an offline device
				// authorization (a hold) never advances it.
				rowsSinceFrom: latest
					.slice(state.plan?.from ?? latest.length)
					.filter(countsTowardPaid)
					.map((candidate) => ({
						amountMinor: toMinor(candidate.amount, dp),
						title: byId.get(candidate.method_id)?.title ?? candidate.method_id,
					})),
			};
			const next = tenderReducer(state, action);
			reducerDispatch(action);
			// Stored until the sale is paid, whatever the leg count: a remount before the last leg
			// of a short split must come back with the plan, or that leg wipes the split record.
			setTenderPlan(order.uuid, action.balanceMinor > 0 ? state.plan : null);
			if (state.plan?.kind === 'items') setLinesPaidBy(order.uuid, next.linesPaidBy);
		},
		[order, state, dp, byId, actor, orderContext]
	);

	/**
	 * Try again: re-send the unanswered command under its own id, with its frozen body; the store
	 * replays what it did. An answer finishes the sale exactly as a first answer would. A terminal
	 * leg's capture is left to the terminal service, which owns that leg's completion.
	 */
	const retryCommand = React.useCallback(async () => {
		if (busyRef.current) return;
		busyRef.current = true;
		setBusy(true);
		try {
			const answers = await resendOpenCommands(ctx.runtime, storeDB, order.uuid, {
				post: (url, body) => http.post(url, body),
			});
			for (const { kind, data } of answers) {
				const row = data.payment as PaymentRow | undefined;
				const summary = (data.order ?? null) as OrderPaymentSummary | null;
				if (kind === 'close' && summary) {
					// A replayed close answers its stored completion with the order as it now stands,
					// and the resident after the mirror decides, as for a first answer (closeConfirmed).
					const closed = await closeConfirmed(ctx.runtime, order, summary);
					if (closed === 'completed') await completeOrderFlow({ source: 'zero-balance' });
					else {
						// Let a later paid attempt auto-print again, as a first close attempt does.
						releaseUnconfirmedReceipt(order.uuid);
						// A reopen ends this attempt; an unconfirmed close keeps it for the bridge.
						if (closed === 'reopened') await resolveCompletionAttempt(storeDB, order.uuid);
						logger.info(closeMessage({ kind: closed, order: summary }, t), {
							showToast: true,
							context: { ...orderContext, close: closed },
						});
					}
				} else if (
					row &&
					(kind === 'record' || (kind === 'submit' && data.outcome === 'recorded'))
				) {
					const amountMinor = toMinor(row.amount, dp);
					// A replay answers the stored row with the order as it now stands: an open order at
					// a zero balance was reopened since (another till), so it is not finished here.
					// A partial leg (a balance still due) runs the flow as a first answer would.
					if (reopenedSince(summary, dp)) {
						tenderRecorded(row, 'online');
						logger.info(t('pos_checkout.sale_reopened_elsewhere'), {
							showToast: true,
							context: { ...orderContext, status: summary.status },
						});
						continue;
					}
					await completeOrderFlow({
						source: 'manual',
						via: 'online',
						row,
						order: summary,
						mirrorFailed: false,
						preparedCompleting: amountMinor === balanceMinor,
						preLegBalanceMinor: balanceMinor,
						amountMinor,
					}).finally(() => tenderRecorded(row, 'online'));
				} else if (kind === 'submit' && data.outcome === 'sent' && summary) {
					// A recovered send: a sent sale, from the stamp the refresh adopted with the
					// store's document (the replay settles only once that refresh adopted it).
					const stamp = readAwaitingCustomer(order.getLatest().payload.meta_data);
					// A recovered send whose adopted order carries no awaiting-customer stamp was already
					// settled or cancelled by the store (the stamp goes with the invoice); there is
					// nothing left to finish. A later paid attempt can auto-print again.
					if (stamp) await completeOrderFlow({ source: 'gateway', order: summary, stamp });
					else releaseUnconfirmedReceipt(order.uuid);
				} else if (kind === 'submit' && summary && submitStillDone(data.outcome, summary.status))
					await completeOrderFlow({ source: 'gateway-settled', order: summary });
			}
		} catch (error) {
			// The store stored nothing and the order moved: the cashier approves it again.
			if (error instanceof MoneyCommandError && error.reason === 'order_changed')
				logger.info(t('pos_checkout.order_changed_retry'), {
					showToast: true,
					context: { ...orderContext, retry: 'order_changed' },
				});
			else
				logger.error(t('pos_checkout.payment_unanswered'), {
					code: ERROR_CODES.PAYMENT_OUTCOME_UNKNOWN,
					showToast: true,
					context: {
						...orderContext,
						error: error instanceof Error ? error.message : String(error),
					},
				});
		} finally {
			// A refused record or a recovered void leaves a leg with no live row: its rounding comes
			// off (Codex 4346411073, 4346556717). A failed sweep is finished by the next settle's.
			await sweepDeadRounding(storeDB, order, dp, (changes) => recordLedger(order, changes)).catch(
				() => undefined
			);
			busyRef.current = false;
			setBusy(false);
		}
	}, [
		recordLedger,
		ctx.runtime,
		storeDB,
		order,
		http,
		t,
		completeOrderFlow,
		dp,
		balanceMinor,
		tenderRecorded,
		orderContext,
	]);

	const takeTender = React.useCallback(async () => {
		if (
			busyRef.current ||
			unansweredCommand ||
			(saveState && saveState.kind !== 'queued-offline') ||
			service?.get(order.uuid)
		)
			return;
		// Busy from here: a second press while the cashier is still answering the offline
		// confirmation must not open a second prompt. A decline or a throwing prompt frees it.
		busyRef.current = true;
		// Only a tile that settles later asks (rule 1); a disabled one is refused below, with its reason.
		if (tiles.find((tile) => tile.method.id === method?.id)?.settlesLater && method) {
			// The amount that will be RECORDED: cash rounding's, not the keyed entry.
			const confirmed = await confirmOfflineTender({
				method,
				amountMinor: entryAppliedMinor,
				queuedOffline,
			}).catch(() => false);
			if (!confirmed) {
				busyRef.current = false;
				return;
			}
		}
		setBusy(true);
		setPressing(true);
		// The cashier's approval, frozen at the press before any provenance save or push (ADR 0040).
		const approval = { total: String(order.getLatest().payload.total ?? ''), currency };
		let savingProvenance = false;
		// The split as the cashier saw it, written with whichever leg completes the sale —
		// cash included, which does not pass through saveProvenance below. With no plan, a
		// split an earlier abandoned attempt left on the order is cleared: it must not
		// describe a sale that was then completed in one go. Otherwise nothing is sent.
		const hasStaleSplit = (payload.meta_data ?? []).some(
			({ key, value }) => key === SPLIT_META_KEY && value !== null
		);
		// The STORED plan is journaled, not the active one: the last leg of a finished split still
		// records its shares (activePlan is null once the legs are done). A whole-order gateway
		// never has one.
		const journaledPlan = fixedAmount ? null : state.plan;
		// The amounts the chain settled on (a hook may rewrite them, cash rounding does): every
		// step after the dispatch, the mirror-error paths below included, reads these.
		let committed = null as StampedSale | null;
		const completionFacts = ({
			amountMinor,
			balanceMinor,
		}: {
			amountMinor: number;
			balanceMinor: number;
		}) => ({
			preparedCompleting: amountMinor === balanceMinor,
			preLegBalanceMinor: balanceMinor,
			amountMinor,
		});
		const commitTender = async (sale: StampedSale, queue: OrderMutationContext) => {
			committed = sale;
			// Shadows the render-time balance on purpose: nothing below reads the keypad's facts.
			const { registerId, sessionId, amountMinor, balanceMinor, roundingMinor } = sale;
			const splitMeta = journaledPlan
				? [
						splitPlanMeta({
							kind: journaledPlan.kind,
							ways: planLegs(journaledPlan, rowsSinceFrom, balanceMinor).label.ways,
							shares: [
								...rowsSinceFrom.map(({ minor }) => fromMinor(minor, dp)),
								fromMinor(amountMinor, dp),
							],
						}),
					]
				: hasStaleSplit
					? [{ key: SPLIT_META_KEY, value: null }]
					: undefined;
			// The rounding fee (#66, #84) lands before the leg, so the writer's total, the provenance
			// push and the store's ledger all see the rounded due; it names the row it rounds.
			const target = queue.order ?? order;
			const roundingFee = (latest: typeof payload, paymentRef: string | null) =>
				withFees(latest, dp, (fees) => {
					const posData = {
						amount: fromMinor(roundingMinor, dp),
						percent: false,
						prices_include_tax: false,
						rounding: { ...method?.defaults.rounding, payment_ref: paymentRef },
					};
					const line = wooMetaCarrier.ensureLineUuid(
						{
							name: t('pos_checkout.rounding'),
							tax_class: '',
							tax_status: 'none',
							meta_data: [{ key: POS_META_KEYS.posData, value: posData }],
						},
						uuidv4
					);
					const fee = calculateCartLine(
						{ kind: 'fee', line, cartLineItems: latest.line_items ?? [] },
						cartConfig
					);
					return [...fees, fee.line] as FeeLines;
				});
			const patchFees = async (data: ReturnType<typeof withFees>) => {
				if (!(await recordLedger(target, data))) throw new Error('rounding_fee_failed');
			};
			await recordSaleAttempt(ctx, {
				order,
				source:
					balanceMinor === 0
						? 'zero-balance'
						: method?.capture.mode === 'manual'
							? 'manual'
							: method?.capture.mode === 'gateway'
								? 'gateway'
								: 'terminal',
				completing: amountMinor === balanceMinor,
				settledOrderStatus,
				settledOrderGateway: method?.id,
			});
			const saveProvenance = async () => {
				if (amountMinor !== balanceMinor) return;

				savingProvenance = online && !queuedOffline && !!payload.id;
				await persistSaleProvenance(ctx, {
					order,
					sessionId,
					online: savingProvenance,
					extraMeta: splitMeta,
				});
				savingProvenance = false;
			};
			// A cash due rounded to nothing completes here too, its fee in the same write.
			if (balanceMinor === 0) {
				if (blockIfDegraded('process-payment', { orderId: order.uuid })) return;
				// The close approves the sale the press commits: its rounding fee moves the stored
				// total by the fee alone, so the approved total is the rounded one.
				const closeApproval = {
					...approval,
					total: fromMinor(toMinor(approval.total, dp) + roundingMinor, dp),
				};
				const closed = await writeZeroBalanceCompletion(ctx, {
					order,
					sessionId,
					queue,
					write: (changes) => writeLedgerChanges(order, changes),
					changes: (latest) => (roundingMinor !== 0 ? roundingFee(latest, null) : {}),
					complete: (_order, slot) => completeOrderFlow({ source: 'zero-balance' }, slot),
					online: () => online && !queuedOffline && !!payload.id,
					close: (target) => closeSale.close(target, { sessionId, approval: closeApproval }),
				});
				if (closed && typeof closed === 'object' && 'kind' in closed) {
					const context = {
						orderId: payload.id ?? null,
						orderUUID: order.uuid,
						close: closed.kind,
					};
					// The store's answer on this sale is a notice; no close at all is a failed checkout.
					if (closed.kind === 'offline' || closed.kind === 'refused')
						logger.error(closeMessage(closed, t), {
							code: ERROR_CODES.CHECKOUT_FAILED_CART_SAFE,
							showToast: true,
							context: {
								...context,
								...(closed.kind === 'refused' ? { reason: closed.code } : {}),
							},
						});
					else logger.info(closeMessage(closed, t), { showToast: true, context });
				}
				return;
			}
			if (!method) return;
			if (amountMinor <= 0) {
				logger.info(t('pos_checkout.enter_an_amount'), { showToast: true, context: orderContext });
				return;
			}
			if (blockIfDegraded('process-payment', { orderId: order.uuid })) return;
			// The tile can go disabled under a keypad that is already open — connectivity
			// drops on an online-only method. Refusing here is right, but a press that does
			// nothing is not: the contract §13 rule is disabled WITH THE REASON, never a
			// dead button, so the cashier gets the same line the tile is showing.
			const selectedTile = tiles.find(({ method: candidate }) => candidate.id === method.id);
			if (selectedTile?.disabled && selectedTile.reason) {
				logger.info(
					t(disabledReasonKey(selectedTile.reason), {
						title: method.title,
						...(typeof selectedTile.reason === 'object' ? selectedTile.reason : {}),
					}),
					{
						showToast: true,
						context: { ...orderContext, method: method.id },
					}
				);
				return;
			}

			if (method.capture.mode === 'device') {
				const liveDriver = getDriver(method.capture.provider);
				const status = liveDriver?.status$.get();
				if (
					!deviceTransport ||
					!liveDriver?.availability().available ||
					status?.connection !== 'connected' ||
					status.reader?.transport !== deviceTransport
				) {
					logger.info(
						t(
							status?.connection === 'connecting'
								? 'pos_checkout.reader_connecting'
								: 'pos_checkout.reader_disconnected'
						),
						{ showToast: true, context: { ...orderContext, method: method.id } }
					);
					return;
				}
				if (!service) throw new Error('terminal_service_unavailable');
				const offline = !online || queuedOffline || !payload.id;
				const minted = mintDevicePayment({
					readerId: status.reader.id,
					registerId,
					sessionId,
					method,
					transport: deviceTransport,
					recordedOffline: offline,
					orderId: payload.id ?? null,
					amount: fromMinor(amountMinor, dp),
					currency,
					cashierId: wpCredentials.id ?? 0,
					storeId: store.id || null,
					dp,
					now: () => new Date().toISOString(),
					uuid: uuidv4,
				});
				if (!minted.ok) throw new Error(minted.reason);
				await saveProvenance();
				intentRow.current = minted.row.id;
				service.begin({
					dp,
					orderUuid: order.uuid,
					orderId: payload.id ?? 0,
					orderNumber: payload.number ?? '',
					row: minted.row,
					reader: status.reader.id,
					method,
					transport: deviceTransport,
					offline,
					approval,
					tipEligibleMinor:
						method.capabilities.tips === 'on_reader' &&
						deviceTransports(method).find((item) => item.transport === deviceTransport)?.tips ===
							'on_reader'
							? amountMinor
							: null,
				});
				reducerDispatch({ type: 'tender-started' });
				return;
			}
			if (method.capture.mode === 'server') {
				if (!payload.id) {
					logger.info(t('pos_checkout.order_not_on_store_yet'), {
						showToast: true,
						context: orderContext,
					});
					return;
				}
				const reader = selectableReaders(method, service?.readersInUse(), order.uuid).readers.find(
					(reader) => reader.id === state.readerId
				);
				if (!reader || reader.inUseBy !== null) {
					logger.info(
						reader?.inUseBy
							? t('pos_checkout.reader_in_use', { number: reader.inUseBy })
							: t('pos_checkout.choose_a_terminal'),
						{ showToast: true, context: { ...orderContext, method: method.id } }
					);
					return;
				}
				if (!service) throw new Error('terminal_service_unavailable');
				const minted = mintServerPayment({
					registerId,
					sessionId,
					method,
					orderId: payload.id,
					amount: fromMinor(amountMinor, dp),
					currency,
					cashierId: wpCredentials.id ?? 0,
					storeId: store.id || null,
					dp,
					now: () => new Date().toISOString(),
					uuid: uuidv4,
				});
				if (!minted.ok) throw new Error(minted.reason);
				await saveProvenance();
				intentRow.current = minted.row.id;
				service.begin({
					dp,
					orderUuid: order.uuid,
					orderId: payload.id,
					orderNumber: payload.number ?? String(payload.id),
					row: minted.row,
					reader: reader.id,
					approval,
				});
				void remember(reader);
				reducerDispatch({ type: 'tender-started' });
				return;
			}

			if (method.capture.mode === 'gateway') {
				if (!payload.id) {
					logger.info(t('pos_checkout.order_not_on_store_yet'), {
						showToast: true,
						context: orderContext,
					});
					return;
				}
				const missing = fields ? firstMissingRequired(fields, fieldValues) : null;
				if (missing) {
					logger.info(t('pos_checkout.enter_field', { label: missing.label }), {
						showToast: true,
						context: { ...orderContext, method: method.id },
					});
					return;
				}
				await saveProvenance();
				// A leg can land while the provenance saves (a terminal elsewhere, a late mirror): a
				// gateway runs the whole order and cannot become one leg beside money already held.
				if (
					readLedger(order.getLatest().payload.meta_data).some(({ status }) =>
						isLivePaymentStatus(status)
					)
				) {
					logger.info(t(disabledReasonKey('not_with_split'), { title: method.title }), {
						showToast: true,
						context: { ...orderContext, method: method.id },
					});
					return;
				}
				if (attemptRef.current && invoiceSent?.attempt_id === attemptRef.current)
					attemptRef.current = null;
				attemptRef.current ??= uuidv4();
				const outcome = await gateway.submit(
					order,
					method.id,
					{
						attemptId: attemptRef.current,
						values: fields ? declaredValues(fields, fieldValues) : {},
						destination: fields ? destinationOf(fields, fieldValues) : null,
					},
					{ approval, sessionId }
				);
				attemptRef.current = null;
				if (outcome.kind === 'fields_invalid') {
					setErrorsFor({ methodId: method.id, errors: outcome.errors });
					return;
				}
				if (outcome.kind === 'refused') {
					// The gateway's own sentence is the cashier copy; a contract refusal gets its code's summary.
					logger.error(outcome.message, {
						code: ERROR_CODES.PAYMENT_GATEWAY_REFUSED,
						showToast: true,
						...(outcome.provider ? { toast: { title: outcome.message } } : {}),
						context: { ...orderContext, method: method.id, refusal: outcome.code },
					});
					return;
				}
				if (outcome.kind === 'recorded') {
					// Observed money wins (§3.1): a row from the gateway is a manual leg from here on.
					await completeOrderFlow(
						{
							source: 'manual',
							via: 'online',
							row: outcome.row,
							order: outcome.order,
							mirrorFailed: false,
							...completionFacts(sale),
						},
						queue
					).finally(() => tenderRecorded(outcome.row, 'online'));
					return;
				}
				if (outcome.kind === 'reopened') {
					// A replayed attempt whose sale another till reopened since: nothing to finish.
					logger.info(t('pos_checkout.sale_reopened_elsewhere'), {
						showToast: true,
						context: { ...orderContext, method: method.id, status: outcome.order.status },
					});
					return;
				}
				if (outcome.kind === 'settled') {
					// No money, no stamp: the gateway landed the order on the status the merchant
					// stored for it, which is the sale finishing (§3.1) — the paid completion, as is.
					await completeOrderFlow({ source: 'gateway-settled', order: outcome.order }, queue);
					// The completion decides from the resident after the mirror, not the answer: a
					// reopen adopted since is no finished sale, so no paid sentence (Codex 4340856695).
					if (
						!uiSettings.autoShowReceipt &&
						!residentUnpaid(order.getLatest().payload, outcome.order.status)
					) {
						logger.info(
							t('pos_checkout.payment_completed_for_order', {
								orderNumber: payload.number ?? String(payload.id),
							}),
							{
								showToast: true,
								context: {
									...orderContext,
									method: method.id,
									outcome: 'settled',
									status: outcome.order.status,
								},
							}
						);
					}
					return;
				}
				await completeOrderFlow(
					{ source: 'gateway', order: outcome.order, stamp: outcome.stamp },
					queue
				);
				if (outcome.order.status === 'pos-open') {
					// A replayed send whose later attempt was cancelled elsewhere: the order is open again.
					logger.info(t('pos_checkout.order_open_send_again'), {
						showToast: true,
						context: { ...orderContext, method: method.id },
					});
				} else if (!uiSettings.autoShowReceipt) {
					logger.info(
						outcome.stamp.destination
							? t('pos_checkout.invoice_sent_to', { destination: outcome.stamp.destination })
							: t('pos_checkout.invoice_sent'),
						{ showToast: true, context: { ...orderContext, method: method.id } }
					);
				}
				return;
			}

			// An order the store has not created has no route to journal a record against (its own
			// slice): refused before a rounding fee is written.
			if (!payload.id) {
				logger.info(t('pos_checkout.order_not_on_store_yet'), {
					showToast: true,
					context: orderContext,
				});
				return;
			}
			const tendered = method.capabilities.change ? fromMinor(sale.tenderedMinor, dp) : null;
			const paymentId = roundingMinor !== 0 ? uuidv4() : undefined;
			if (paymentId) await patchFees(roundingFee(target.getLatest().payload, paymentId));
			// A leg that did not land takes its rounding with it: the next tender may be a card.
			const unround = () => sweepDeadRounding(storeDB, target, dp, patchFees);
			const outcome = await recordManualPayment(order, method, {
				amount: fromMinor(amountMinor, dp),
				tendered,
				...(paymentId ? { paymentId } : {}),
				...(splitMeta ? { extraMeta: splitMeta } : {}),
				// The gate resolved and the handler wrote; the writer must not resolve again.
				session: { registerId, sessionId },
			}).catch(async (error: unknown) => {
				const landed =
					error instanceof RecordManualPaymentMirrorError && error.outcome.kind === 'recorded';
				// A thrown refusal of a replay takes back its row's fee, as a returned one does.
				if (!landed) await unround().catch(() => undefined);
				throw error;
			});
			// An unanswered record keeps its rounding: the journal re-sends it at the rounded amount.
			// A refused replay takes back the fee its own row carried (Codex 4343139031 on #2832).
			if (outcome.kind !== 'recorded' && outcome.kind !== 'unknown') await unround();
			if (outcome.kind === 'recorded') {
				await completeOrderFlow(
					{
						source: 'manual',
						...outcome,
						mirrorFailed: false,
						...completionFacts(sale),
					},
					queue
				).finally(() => tenderRecorded(outcome.row, outcome.via));
				return;
			}
			if (outcome.kind === 'refused') {
				reducerDispatch({ type: 'back' });
				setTenderMethod(order.uuid, null);
				return;
			}
			// An unanswered record was already reported (PAYMENT_OUTCOME_UNKNOWN); no second toast.
			if (outcome.kind === 'failed' || outcome.kind === 'unknown') {
				reducerDispatch({ type: 'back' });
				setTenderMethod(order.uuid, null);
				return;
			}
			logger.error(t('pos_checkout.payment_not_recorded'), {
				code: ERROR_CODES.PAYMENT_UNEXPECTED,
				showToast: true,
				context: { ...orderContext, method: method.id },
			});
		};
		try {
			const outcome = await commitSale(
				{ ...ctx, actionCtx, actionActor, dp },
				{
					order,
					methodId: method?.id ?? null,
					bindingStatus: bindingStatus === 'unknown' ? 'none' : bindingStatus,
					amounts: {
						kind: 'entry',
						expectedBalanceMinor: balanceMinor,
						amountMinor: enteredLegMinor,
						tenderedMinor: entryMinor,
						captureMode: method?.capture.mode ?? null,
					},
				},
				commitTender
			);
			if (isActionRefusal(outcome)) {
				presentTenderRefusal(actionCtx, outcome, logger, t, orderContext);
				return;
			}
		} catch (error) {
			if (error instanceof RegisterSessionRequiredError) {
				presentSessionRequired(logger, t, orderContext);
				return;
			}
			if (error instanceof GatewayMirrorError) {
				// The store answered: the money or the invoice is on the order there, and only this
				// till's copy failed to save. "Try again" would send or charge a second time.
				attemptRef.current = null;
				const { outcome } = error;
				// A reopened replay took no money: no "recorded, not synced" (CodeRabbit 4346454779).
				if (outcome.kind === 'reopened') {
					logger.info(t('pos_checkout.sale_reopened_elsewhere'), {
						showToast: true,
						context: { ...orderContext, status: outcome.order.status },
					});
					return;
				}
				// PAYMENT111's summary speaks of a recorded payment; a sent invoice needs its own sentence.
				const sentence =
					outcome.kind === 'sent'
						? t('pos_checkout.invoice_sent_not_synced')
						: t('pos_checkout.payment_recorded_not_synced');
				logger.warn(sentence, {
					code:
						outcome.kind === 'sent'
							? ERROR_CODES.PAYMENT_INVOICE_NOT_MIRRORED
							: ERROR_CODES.PAYMENT_RECORDED_NOT_MIRRORED,
					showToast: true,
					...(outcome.kind === 'sent' ? { toast: { title: sentence } } : {}),
					context: {
						type: 'payment.not-mirrored',
						...orderContext,
						method: method?.id ?? null,
						outcome: outcome.kind,
						error: error.cause instanceof Error ? error.cause.message : String(error.cause),
					},
				});
				if (outcome.kind === 'recorded') {
					await completeOrderFlow({
						source: 'manual',
						via: 'online',
						row: outcome.row,
						order: outcome.order,
						mirrorFailed: true,
						// A mirror error is thrown from inside the handler: the chain has settled the amounts.
						...completionFacts(committed as StampedSale),
					}).finally(() => tenderRecorded(outcome.row, 'online'));
				} else if (outcome.kind === 'settled') {
					await completeOrderFlow({ source: 'gateway-settled', order: outcome.order });
				} else {
					await completeOrderFlow({
						source: 'gateway',
						order: outcome.order,
						stamp: outcome.stamp,
					});
				}
				return;
			}
			if (error instanceof RecordManualPaymentMirrorError) {
				const { outcome } = error;
				// A refusal that could not be mirrored is NOT money the store holds: the
				// server stored a `failed` row and took nothing. `raiseAttention` has already
				// told the cashier what to do about it, and telling them the store has the
				// payment would both contradict that and stop them retrying a corrected one.
				if (outcome.kind === 'refused') {
					reducerDispatch({ type: 'back' });
					setTenderMethod(order.uuid, null);
					return;
				}
				// The store answered 2xx: the money is on the order there, and only this
				// till's copy failed to save. Reporting "payment not recorded" here reads as
				// "take it again", which is how one mirror failure becomes two payments.
				logger.warn(t('pos_checkout.payment_recorded_not_synced'), {
					code: ERROR_CODES.PAYMENT_RECORDED_NOT_MIRRORED,
					showToast: true,
					terminal: { operationId: outcome.row.id },
					context: {
						type: 'payment.not-mirrored',
						...orderContext,
						paymentId: outcome.row.id,
						amount: outcome.row.amount,
						method: outcome.row.method_id,
						status: outcome.row.status,
						error: error.cause instanceof Error ? error.cause.message : String(error.cause),
					},
				});
				// Fold the accepted row into the pane's own view of the ledger. Without this
				// the keypad goes back to the pre-payment balance and cheerfully offers the
				// whole amount again — the recovery refresh may not have landed, and the
				// resident order is exactly the copy that failed to save.
				// The store's summary is the only balance worth trusting now. Complete only
				// when it says the order is settled; otherwise stay on the pane, which is now
				// showing what is actually left to pay.
				await completeOrderFlow({
					source: 'manual',
					...outcome,
					mirrorFailed: true,
					...completionFacts(committed as StampedSale),
				}).finally(() => tenderRecorded(outcome.row, outcome.via));
				return;
			}
			if (savingProvenance) {
				logger.error('Checkout failed', {
					// The provenance push reports nothing itself; a refused session keeps AUTH101.
					code: pushFailureCode(error, ERROR_CODES.CHECKOUT_FAILED_CART_SAFE),
					showToast: true,
					toast: { title: t('pos_cart.checkout_failed') },
					context: {
						...orderContext,
						method: method?.id ?? null,
						error: error instanceof Error ? error.message : String(error),
					},
				});
				return;
			}
			logger.error(t('pos_checkout.payment_not_recorded'), {
				code: ERROR_CODES.PAYMENT_UNEXPECTED,
				showToast: true,
				context: {
					...orderContext,
					method: method?.id ?? null,
					error: error instanceof Error ? error.message : String(error),
				},
			});
		} finally {
			busyRef.current = false;
			setBusy(false);
			setPressing(false);
		}
	}, [
		unansweredCommand,
		confirmOfflineTender,
		entryAppliedMinor,
		tiles,
		actionCtx,
		actionActor,
		ctx,
		balanceMinor,
		deviceTransport,
		online,
		queuedOffline,
		blockIfDegraded,
		completeOrderFlow,
		closeSale,
		dp,
		enteredLegMinor,
		entryMinor,
		cartConfig,
		method,
		recordLedger,
		writeLedgerChanges,
		order,
		recordManualPayment,
		gateway,
		settledOrderStatus,
		fields,
		fieldValues,
		uiSettings.autoShowReceipt,
		tenderRecorded,
		remember,
		saveState,
		bindingStatus,
		state.plan,
		fixedAmount,
		rowsSinceFrom,
		state.readerId,
		payload.id,
		payload.number,
		service,
		store,
		currency,
		wpCredentials,
		t,
		tiles,
		reducerDispatch,
	]);

	// A mounted tender is a checkout member: a restart restores the tender from a live ledger
	// row without Pay, and the stage derivation and the provider's hold read membership, not
	// the mount. A confirmed receipt (the phone sheet still runs this hook) is left alone.
	// Layout, not passive: a capture can land between this commit and passive effects.
	React.useLayoutEffect(() => {
		if (!getCheckoutModeSnapshot().receiptOrders.has(order.uuid)) enterCheckout(order.uuid);
	}, [order.uuid]);

	// Subscribe before receipt routing can unmount checkout; also consume a final leg on remount.
	React.useEffect(() => {
		const consumeOutcome = () => {
			const leg = service?.get(order.uuid);
			if (!leg) return;
			// The take that is still in the cashier's hands, as opposed to an outcome that
			// lands while they are watching the terminal timeline.
			const ownTake = intentRow.current === leg.intentId;
			if (ownTake && (!['idle', 'creating', 'final'].includes(leg.phase) || leg.settlement)) {
				intentRow.current = null;
			}
			const settled = leg.settlement;
			// One settlement is shown once. A rejoined leg can settle under a row id that an
			// earlier, released leg already displayed, so the key is the settlement's identity —
			// the leg's own intent, the row it ended on and the outcome — not the row id alone.
			const settlementKey = `${leg.intentId}:${leg.row.id}:${settled?.outcome ?? ''}`;
			if (!settled || displayedRow.current === settlementKey) return;
			displayedRow.current = settlementKey;
			if (settled.outcome === 'failed' && ownTake) {
				// Cashier copy only: the provider's own sentence, a known reason's translation,
				// else the refusal code's translated summary — never a raw wcpos_* identifier.
				const reason = leg.row.failure_reason ?? null;
				const knownReason = failureReasonLabel(reason, t);
				const specific =
					providerErrorMessage(leg.error) ??
					(reason && knownReason !== reason ? knownReason : undefined);
				Toast.show({
					type: 'error',
					...resolveMerchantToastText(t, {
						explicitTitle: specific,
						errorCode: ERROR_CODES.PAYMENT_TERMINAL_REFUSED,
						logMessage: t('pos_checkout.payment_not_recorded'),
					}),
				});
			}
			if (settled.outcome !== 'captured') return;

			tenderRecorded(settled.payment);
			if (!settled.saleComplete && !settled.finishingError) service?.dismiss(order.uuid);
			if (settled.saleComplete) {
				if (uiSettings.autoShowReceipt) selectReceipt(order.uuid);
				else {
					leaveCheckout(order.uuid);
					setCurrentOrderID('');
					leaveHost();
				}
			}
		};
		const unsubscribe = service?.subscribe(consumeOutcome);
		consumeOutcome();
		return unsubscribe;
	}, [
		terminalLeg?.settlement,
		service,
		order.uuid,
		t,
		tenderRecorded,
		uiSettings.autoShowReceipt,
		setCurrentOrderID,
		leaveHost,
	]);

	const pickReader = React.useCallback(
		(id: string) => {
			if (
				selectableReaders(method, service?.readersInUse(), order.uuid).readers.some(
					(reader) => reader.id === id && reader.inUseBy === null
				)
			) {
				manuallyPickedReaderMethod.current = method?.id ?? null;
				dispatch({ type: 'pick-reader', readerId: id });
			}
		},
		[method, service, order.uuid, dispatch]
	);
	const cancelTerminalLeg = React.useCallback(() => {
		void service?.leg(order.uuid)?.cancel('cashier');
	}, [service, order.uuid]);
	const releaseTerminalLeg = React.useCallback(() => {
		void service?.leg(order.uuid)?.release();
	}, [service, order.uuid]);
	const retryTerminalCapture = React.useCallback(() => {
		void service?.leg(order.uuid)?.capture();
	}, [service, order.uuid]);
	const dismissTerminalLeg = React.useCallback(() => {
		service?.dismiss(order.uuid);
		dispatch({ type: 'set-tab', tab: 'payments' });
		dispatch({ type: 'back' });
	}, [service, order.uuid, dispatch]);
	const retryTerminalLeg = React.useCallback(() => {
		const leg = service?.get(order.uuid);
		if (!leg || leg.phase !== 'final') return;
		service?.dismiss(order.uuid);
		dispatch({ type: 'set-tab', tab: 'payments' });
		dispatch({
			type: 'pick-method',
			methodId: leg.row.method_id,
			prefillMinor: toMinor(leg.row.amount, dp),
			readerId: leg.row.provider_refs?.reader ?? leg.reader,
		});
		setTenderMethod(order.uuid, leg.row.method_id);
	}, [service, order.uuid, dp, dispatch]);

	/** §4.3: the stamp's attempt is named; a late retry of it is refused by the store. */
	const cancelInvoice = React.useCallback(async () => {
		if (busyRef.current || !invoiceSent) return;
		busyRef.current = true;
		setBusy(true);
		try {
			attemptRef.current = null;
			// An unchanged answer is that whether or not its mirror landed: the invoice stands, and the
			// till's copy still carries its stamp (Codex 4346411064).
			const outcome = await gateway
				.cancel(order, invoiceSent)
				.catch((error: unknown) =>
					error instanceof GatewayCancelMirrorError && error.outcome.kind === 'unchanged'
						? error.outcome
						: Promise.reject(error)
				);
			if (outcome.kind === 'refused') {
				logger.error(outcome.message, {
					code: ERROR_CODES.PAYMENT_GATEWAY_REFUSED,
					showToast: true,
					context: { ...orderContext, method: invoiceSent.method_id, refusal: outcome.code },
				});
				return;
			}
			// Answered, but the order is not open again: the invoice stands (it may have been paid).
			if (outcome.kind === 'unchanged') {
				logger.warn(t('pos_checkout.invoice_not_cancelled'), {
					showToast: true,
					context: { ...orderContext, method: invoiceSent.method_id, status: outcome.order.status },
				});
				return;
			}
			logger.info(t('pos_checkout.invoice_cancelled'), {
				actor,
				showToast: true,
				context: {
					...orderContext,
					type: 'checkout.cancelled',
					method: invoiceSent.method_id,
					attemptId: invoiceSent.attempt_id,
					voided: 0,
				},
			});
		} catch (error) {
			if (error instanceof GatewayCancelMirrorError) {
				// The store cancelled it; only this till's copy is behind. "Try again" would 409.
				logger.info(t('pos_checkout.invoice_cancelled'), {
					actor,
					context: {
						...orderContext,
						type: 'checkout.cancelled',
						method: invoiceSent.method_id,
						attemptId: invoiceSent.attempt_id,
						voided: 0,
					},
				});
				// The code's own summary would replace this sentence on the toast; name it explicitly.
				logger.warn(t('pos_checkout.invoice_cancelled_not_synced'), {
					code: ERROR_CODES.PAYMENT_INVOICE_NOT_MIRRORED,
					showToast: true,
					toast: { title: t('pos_checkout.invoice_cancelled_not_synced') },
					context: {
						...orderContext,
						error: error.cause instanceof Error ? error.cause.message : String(error.cause),
					},
				});
				return;
			}
			logger.error(t('pos_checkout.invoice_cancel_failed'), {
				code: ERROR_CODES.PAYMENT_UNEXPECTED,
				showToast: true,
				context: {
					...orderContext,
					error: error instanceof Error ? error.message : String(error),
				},
			});
		} finally {
			busyRef.current = false;
			setBusy(false);
		}
	}, [gateway, invoiceSent, order, orderContext, actor, t]);

	const cancelPayment = React.useCallback(async () => {
		if (busyRef.current || (service?.get(order.uuid) && service.get(order.uuid)?.phase !== 'final'))
			return;
		busyRef.current = true;
		setBusy(true);
		try {
			if (
				rows.some(
					(row) =>
						row.capture_mode === 'device' &&
						((row.recorded_offline && row.status === 'authorized') ||
							(!online && isLivePaymentStatus(row.status)))
				)
			) {
				logger.info(t('pos_checkout.device_void_needs_settlement'), {
					showToast: true,
					context: orderContext,
				});
				return;
			}
			const outcome = await voidPayments(order);
			// Nothing reached the store: no leg was voided and none was refused, so the cashier is
			// told the cancel needs a connection, never to refund by hand (the legs are still held).
			if (outcome.kind === 'offline') {
				logger.info(t('pos_checkout.void_needs_connection'), {
					showToast: true,
					context: { ...orderContext, paymentId: outcome.paymentIds.join(', ') },
				});
				return;
			}
			for (const row of outcome.rows) {
				logger.info('Payment voided', {
					actor,
					terminal: { operationId: row.id },
					context: {
						...orderContext,
						type: 'payment.voided',
						paymentId: row.id,
						amount: row.amount,
						method: row.method_id,
					},
				});
			}
			if (outcome.failed.length > 0) {
				// Each of these is money still held on the customer's card. The row has to
				// name them, or the merchant cannot tell which payment to refund by hand.
				//
				// Only a refusal the store actually answered earns the definitive "refund
				// these" instruction. A void whose answer was lost may already have been
				// applied, and refunding it by hand would return the money twice.
				const everyoneRefused = outcome.failed.every((failure) => failure.refused);
				logger.error(t('pos_checkout.void_failed'), {
					code: everyoneRefused
						? ERROR_CODES.PAYMENT_VOID_REFUSED
						: ERROR_CODES.PAYMENT_OUTCOME_UNKNOWN,
					showToast: true,
					context: {
						// The type is the row's title on every till; it must not promise a
						// refusal the store never gave.
						type: everyoneRefused ? 'payment.void-refused' : 'payment.void-unknown',
						...orderContext,
						paymentId: outcome.failed.map((failure) => failure.paymentId).join(', '),
						reason: outcome.failed
							.map((failure) => `${failure.paymentId}: ${failure.message}`)
							.join('; '),
						voided: outcome.rows.length,
					},
				});
				return;
			}
			logger.info(`Sale ${order.uuid} cancelled`, {
				actor,
				context: { ...orderContext, type: 'checkout.cancelled', voided: outcome.rows.length },
			});
			reducerDispatch({ type: 'reset' });
			setTenderMethod(order.uuid, null);
			leaveCheckout(order.uuid);
			leaveHost('cart');
		} catch (error) {
			logger.error(t('pos_checkout.void_failed'), {
				code: ERROR_CODES.PAYMENT_VOID_REFUSED,
				showToast: true,
				context: {
					...orderContext,
					error: error instanceof Error ? error.message : String(error),
				},
			});
		} finally {
			busyRef.current = false;
			setBusy(false);
		}
	}, [
		order,
		leaveHost,
		t,
		voidPayments,
		service,
		reducerDispatch,
		rows,
		online,
		actor,
		orderContext,
	]);

	return React.useMemo(
		() => ({
			rememberedReaderId: remembered,
			rememberReader: remember,
			terminalLeg,
			bootstrapReader,
			deviceTransport,
			pickTransport,
			deviceReady,
			readers,
			lockToDefault,
			pickReader,
			cancelTerminalLeg,
			releaseTerminalLeg,
			retryTerminalCapture,
			dismissTerminalLeg,
			retryTerminalLeg,
			state: entryMinor === state.entryMinor ? state : { ...state, entryMinor },
			dispatch,
			dp,
			totalMinor,
			paidMinor,
			balanceMinor,
			thisPaymentMinor,
			afterThisPaymentMinor,
			plan,
			planLegs: figures?.legs ?? [],
			planLabel,
			planMore,
			lines,
			linesPaidBy: state.linesPaidBy,
			rows,
			liveRows,
			retainedRows,
			hasLiveTerminalLeg: Boolean(terminalLeg && terminalLeg.phase !== 'final'),
			hasLiveLeg: liveRows.length > 0,
			online,
			// A sent, unanswered command offers no tile and no close: only Try again.
			tiles: unansweredCommand ? [] : tiles,
			legacyMethods,
			methodsLoaded,
			unsupportedSchema,
			method,
			entryAppliedMinor,
			entryChangeMinor,
			roundedDueMinor,
			roundingMinor,
			quickAmountsMinor,
			busy,
			saveState,
			pickMethod,
			takeTender,
			cancelPayment,
			fieldValues,
			setFieldValues,
			fieldErrors,
			invoiceSent,
			cancelInvoice,
			unansweredCommand,
			retryCommand,
			offlineDialog,
		}),
		[
			plan,
			figures,
			planLabel,
			planMore,
			lines,
			remembered,
			remember,
			terminalLeg,
			bootstrapReader,
			deviceTransport,
			pickTransport,
			deviceReady,
			readers,
			lockToDefault,
			pickReader,
			cancelTerminalLeg,
			releaseTerminalLeg,
			retryTerminalCapture,
			dismissTerminalLeg,
			retryTerminalLeg,
			state,
			entryMinor,
			dispatch,
			dp,
			totalMinor,
			paidMinor,
			balanceMinor,
			thisPaymentMinor,
			afterThisPaymentMinor,
			rows,
			liveRows,
			retainedRows,
			online,
			tiles,
			legacyMethods,
			methodsLoaded,
			unsupportedSchema,
			method,
			entryAppliedMinor,
			entryChangeMinor,
			roundedDueMinor,
			roundingMinor,
			quickAmountsMinor,
			busy,
			saveState,
			pickMethod,
			takeTender,
			cancelPayment,
			fieldValues,
			setFieldValues,
			fieldErrors,
			invoiceSent,
			cancelInvoice,
			unansweredCommand,
			retryCommand,
			offlineDialog,
		]
	);
}
