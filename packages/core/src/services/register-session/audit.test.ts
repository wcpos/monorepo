import { getLogger } from '@wcpos/utils/logger';

import { recordRegisterFact, type RegisterFact } from './audit';

jest.mock('@wcpos/utils/logger', () => {
	const categories = new Map();
	return {
		getLogger: jest.fn((category: string[]) => {
			const key = category.join('.');
			if (!categories.has(key))
				categories.set(key, {
					info: jest.fn(),
					warn: jest.fn(),
					debug: jest.fn(),
					error: jest.fn(),
				});
			return categories.get(key);
		}),
	};
});
jest.mock('../../contexts/app-state', () => ({ useStoreSession: jest.fn() }));
const logger = jest.mocked(getLogger(['wcpos', 'registerSession']));
const bindingLogger = jest.mocked(getLogger(['wcpos', 'register']));
const actor = { id: '7', name: 'Pat' };
const input = { actor, sessionId: 's', registerId: 'r' };
// Attempt-shaped rows carry a fresh operationId so the logger's repeat collapse keeps each attempt.
const attempt = { operationId: expect.stringMatching(/^[0-9a-f]{32}$/) };
beforeEach(() => jest.clearAllMocks());

it('logs approval granted with the requesting cashier and approver id', () => {
	recordRegisterFact({ kind: 'approval-granted', ...input, approvedBy: 8 });
	expect(logger.info).toHaveBeenCalledWith('Register session approval granted', {
		actor,
		terminal: attempt,
		context: { type: 'register.approval-granted', sessionId: 's', registerId: 'r', approvedBy: 8 },
	});
});

it('logs approval refused with the requesting cashier', () => {
	recordRegisterFact({ kind: 'approval-refused', ...input });
	expect(logger.warn).toHaveBeenCalledWith('Register session approval refused', {
		actor,
		terminal: attempt,
		context: { type: 'register.approval-refused', sessionId: 's', registerId: 'r' },
	});
});

it('logs the variance and threshold with the cashier', () => {
	recordRegisterFact({
		kind: 'variance-over-threshold',
		...input,
		variance: '10.00',
		threshold: '5',
	});
	expect(logger.warn).toHaveBeenCalledWith('Register count exceeds variance threshold', {
		actor,
		terminal: attempt,
		context: {
			type: 'register.variance-over-threshold',
			sessionId: 's',
			registerId: 'r',
			variance: '10.00',
			threshold: '5',
		},
	});
});

it('logs X-report dispatch with the cashier', () => {
	recordRegisterFact({ kind: 'x-report-dispatched', ...input });
	expect(logger.info).toHaveBeenCalledWith('Register X-report print dispatched', {
		actor,
		terminal: attempt,
		context: { type: 'register.x-report-printed', sessionId: 's', registerId: 'r' },
	});
});

it('logs drawer dispatch with the cashier', () => {
	recordRegisterFact({ kind: 'drawer-dispatched', ...input });
	expect(logger.info).toHaveBeenCalledWith('Register drawer kick dispatched', {
		actor,
		terminal: attempt,
		context: { type: 'register.drawer-opened', sessionId: 's', registerId: 'r' },
	});
});

it('gives every attempt its own operationId so repeat collapsing cannot fold two attempts', () => {
	const actor = { id: '7', name: 'Pat' };
	recordRegisterFact({
		kind: 'variance-over-threshold',
		actor,
		sessionId: 's',
		registerId: 'r',
		variance: '-17.50',
		threshold: '5',
	});
	recordRegisterFact({
		kind: 'variance-over-threshold',
		actor,
		sessionId: 's',
		registerId: 'r',
		variance: '-2.00',
		threshold: '5',
	});
	const ids = logger.warn.mock.calls.map((call) => call[1]?.terminal?.operationId);
	expect(ids).toHaveLength(2);
	for (const id of ids) expect(id).toMatch(/^[0-9a-f]{32}$/);
	expect(ids[0]).not.toBe(ids[1]);
});

// Captured against the unedited SPEC-7 checkout; only random attempt IDs are normalized.
it('preserves the legacy merchant-facing helper rows', () => {
	recordRegisterFact({ kind: 'approval-granted', ...input, approvedBy: 8 });
	recordRegisterFact({ kind: 'approval-refused', ...input });
	recordRegisterFact({
		kind: 'variance-over-threshold',
		...input,
		variance: '-10.00',
		threshold: '5',
	});
	recordRegisterFact({ kind: 'x-report-dispatched', ...input });
	recordRegisterFact({ kind: 'drawer-dispatched', ...input });
	const rows = ['info', 'warn'].flatMap((level) =>
		logger[level as 'info' | 'warn'].mock.calls.map(([message, options]) => ({
			level,
			message,
			...options,
			terminal: { operationId: '<attempt>' },
		}))
	);
	expect(rows).toMatchSnapshot();
});

// Removing a mapping, attributing a system fact, or changing its fold policy breaks this table.
const pair = { sessionId: 'session-id', registerId: 'register-id' };
const human = { ...pair, actor };
const movement = {
	...pair,
	movementId: 'movement-id',
	movementType: 'paid_in' as const,
	amount: '20',
};
const cases: {
	fact: RegisterFact;
	type?: string;
	identity?: string;
	human?: boolean;
	binding?: boolean;
}[] = [
	{
		fact: { kind: 'session-opened', ...human, amount: '100', variance: null },
		type: 'register.session-opened',
		identity: 'sessionid',
		human: true,
	},
	{
		fact: { kind: 'counting-started', ...human },
		type: 'register.counting-started',
		identity: 'fresh',
		human: true,
	},
	{
		fact: { kind: 'counting-abandoned', ...human },
		type: 'register.counting-abandoned',
		identity: 'fresh',
		human: true,
	},
	{
		fact: {
			kind: 'session-closed',
			...human,
			closureId: 'closure-id',
			counted: { cash: '100' },
			variance: { cash: '0' },
		},
		type: 'register.session-closed',
		identity: 'closureid',
		human: true,
	},
	{
		fact: { kind: 'movement-recorded', ...movement, actor },
		type: 'register.movement-recorded',
		identity: 'movementid',
		human: true,
	},
	{
		fact: { kind: 'movement-recorded', ...movement, actor, movementType: 'no_sale' },
		type: 'register.no-sale-recorded',
		identity: 'movementid',
		human: true,
	},
	{
		fact: { kind: 'movement-voided', ...movement, actor, voids: 'original' },
		type: 'register.movement-voided',
		identity: 'movementid',
		human: true,
	},
	{
		fact: { kind: 'movement-retry-requested', ...human, movementId: 'movement-id' },
		type: 'register.movement-retrying',
		identity: 'fresh',
		human: true,
	},
	{
		fact: { kind: 'approval-granted', ...human, approvedBy: 8 },
		type: 'register.approval-granted',
		identity: 'fresh',
		human: true,
	},
	{
		fact: { kind: 'approval-refused', ...human },
		type: 'register.approval-refused',
		identity: 'fresh',
		human: true,
	},
	{
		fact: { kind: 'variance-over-threshold', ...human, variance: '-10', threshold: '5' },
		type: 'register.variance-over-threshold',
		identity: 'fresh',
		human: true,
	},
	{
		fact: { kind: 'x-report-dispatched', ...human },
		type: 'register.x-report-printed',
		identity: 'fresh',
		human: true,
	},
	{
		fact: { kind: 'drawer-dispatched', ...human },
		type: 'register.drawer-opened',
		identity: 'fresh',
		human: true,
	},
	{
		fact: {
			kind: 'outbox-approval-refused',
			...pair,
			endpoint: 'sessions/status',
			status: 403,
			errorCode: 'wcpos_override_refused',
		},
		type: 'register.approval-refused',
		identity: 'sessionid',
	},
	{
		fact: {
			kind: 'outbox-request-failed',
			document: { id: 'movement-id', session_id: pair.sessionId, type: 'paid_in', amount: '20' },
			registerId: pair.registerId,
			endpoint: 'movements',
			retry: true,
			persist: false,
			takeover: false,
			code: 'REGISTER201',
			attempts: 2,
		},
		type: 'register.movement-retrying',
		identity: 'movementid',
	},
	{
		fact: { kind: 'session-adopted', ...pair },
		type: 'register.session-adopted',
		identity: 'sessionid',
	},
	{
		fact: { kind: 'movement-accepted', ...movement },
		type: 'register.movement-accepted',
		identity: 'movementid',
	},
	{
		fact: {
			kind: 'binding-changed',
			registerId: pair.registerId,
			previousRegisterId: null,
			source: 'automatic',
		},
		type: 'register.bound',
		identity: 'registerid',
		binding: true,
	},
	{
		fact: {
			kind: 'binding-changed',
			registerId: pair.registerId,
			previousRegisterId: 'previous',
			source: 'manual',
			actor,
		},
		type: 'register.switched',
		identity: 'fresh',
		human: true,
		binding: true,
	},
	{
		fact: { kind: 'binding-removed', registerId: pair.registerId },
		type: 'register.unbound',
		binding: true,
	},
	{
		fact: { kind: 'directory-unavailable', registerId: pair.registerId },
		type: 'register.directory-unavailable',
		binding: true,
	},
	{
		fact: { kind: 'session-pruned', ...pair },
		type: 'register.session-pruned',
		identity: 'sessionid',
	},
	{
		fact: {
			kind: 'bridge-cycle-failed',
			registerId: pair.registerId,
			stage: 'refresh',
			message: 'Offline',
			consecutiveFailures: 1,
		},
		type: 'register.session-refresh-failed',
	},
];
it.each(cases)(
	'$fact.kind maps its type, actor, searchable pair and identity',
	({ fact, type, identity, human, binding }) => {
		recordRegisterFact(fact);
		recordRegisterFact(fact);
		const target = binding ? bindingLogger : logger;
		const other = binding ? logger : bindingLogger;
		expect(
			[other.info, other.warn, other.debug, other.error].flatMap((fn) => fn.mock.calls)
		).toEqual([]);
		const calls = [target.info, target.warn, target.debug, target.error].flatMap(
			(fn) => fn.mock.calls
		);
		expect(calls).toHaveLength(2);
		const [first, second] = calls.map(([, options]) => options!);
		expect(first.context).toMatchObject({ type, registerId: 'register-id' });
		expect(first.context?.sessionId).toBe(
			binding || fact.kind === 'bridge-cycle-failed' ? undefined : 'session-id'
		);
		if (human) expect(first.actor).toEqual(actor);
		else expect(first).not.toHaveProperty('actor');
		if (identity === 'fresh') {
			expect(first.terminal?.operationId).toMatch(/^[0-9a-f]{32}$/);
			expect(first.terminal?.operationId).not.toBe(second.terminal?.operationId);
		} else {
			expect(first.terminal?.operationId).toBe(identity);
			expect(second.terminal?.operationId).toBe(identity);
		}
	}
);

it.each<{
	endpoint: string;
	retry: boolean;
	persist: boolean;
	takeover: boolean;
	code: Extract<RegisterFact, { kind: 'outbox-request-failed' }>['code'];
	type?: string;
	level: 'error' | 'warn' | 'debug';
	toast?: boolean;
	outcome?: string;
}>([
	{
		endpoint: 'movements',
		retry: false,
		persist: false,
		takeover: false,
		code: 'REGISTER101',
		type: 'register.movement-rejected',
		level: 'error',
		toast: true,
		outcome: 'failed',
	},
	{
		endpoint: 'movements',
		retry: false,
		persist: false,
		takeover: false,
		code: 'REGISTER111',
		type: 'register.movement-rejected',
		level: 'warn',
		outcome: 'failed',
	},
	{
		endpoint: 'movements',
		retry: true,
		persist: true,
		takeover: false,
		code: 'REGISTER101',
		level: 'debug',
	},
	{
		endpoint: 'sessions',
		retry: true,
		persist: false,
		takeover: false,
		code: 'REGISTER201',
		level: 'debug',
	},
	{
		endpoint: 'sessions',
		retry: false,
		persist: false,
		takeover: true,
		code: 'REGISTER221',
		level: 'warn',
		outcome: 'recovered',
	},
	{
		endpoint: 'closures',
		retry: false,
		persist: false,
		takeover: false,
		code: 'REGISTER211',
		type: 'register.upload-refused',
		level: 'error',
		toast: false,
		outcome: 'failed',
	},
] as const)(
	'preserves outbox classification $endpoint / $code / $persist / $retry',
	({ endpoint, retry, persist, takeover, code, type, level, toast, outcome }) => {
		const document =
			endpoint === 'movements'
				? {
						id: 'document-id',
						session_id: 's',
						type: 'paid_in' as const,
						amount: '20',
						reason: 'PRIVATE',
					}
				: {
						id: 'document-id',
						register_id: 'r',
						...(endpoint === 'closures' ? { session_id: 's' } : {}),
					};
		recordRegisterFact({
			kind: 'outbox-request-failed',
			document,
			registerId: 'r',
			endpoint,
			retry,
			persist,
			takeover,
			code,
			attempts: 2,
			status: 403,
			errorCode: 'refused',
			field: 'amount',
			message: 'No',
		});
		const options = jest.mocked(logger[level]).mock.calls[0][1]!;
		expect(options.context?.type).toBe(type);
		expect(options.terminal).toEqual({
			operationId: 'documentid',
			operationType: 'register.outbox',
			attempt: 2,
			...(outcome ? { outcome } : {}),
		});
		expect(options.showToast).toBe(toast);
		expect(options.context).toMatchObject({
			documentId: 'document-id',
			registerId: 'r',
			status: 403,
			errorCode: 'refused',
			field: 'amount',
			message: 'No',
		});
		expect(JSON.stringify(options)).not.toContain('PRIVATE');
		expect(options).not.toHaveProperty('actor');
	}
);
it('retains capped outbox identity and untitled bridge diagnostics', () => {
	recordRegisterFact({
		kind: 'outbox-approval-refused',
		sessionId: 'abcd-'.repeat(10),
		registerId: 'r',
		endpoint: 'sessions/status',
	});
	expect(logger.warn.mock.calls[0][1]?.terminal?.operationId).toBe('abcd'.repeat(8));
	recordRegisterFact({
		kind: 'bridge-cycle-failed',
		registerId: 'r',
		stage: 'drain',
		message: 'disk',
		consecutiveFailures: 2,
	});
	expect(logger.warn).toHaveBeenLastCalledWith('Register session refresh/drain still failing', {
		context: {
			registerId: 'r',
			stage: 'drain',
			status: undefined,
			errorCode: undefined,
			message: 'disk',
			consecutiveFailures: 2,
		},
	});
});
