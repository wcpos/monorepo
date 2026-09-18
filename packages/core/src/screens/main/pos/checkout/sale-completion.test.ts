import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { row } from './payments/device/fixtures.test-utils';
import {
	completeSale,
	completionMetaFor,
	isSaleComplete,
	persistSaleProvenance,
	prepareSale,
} from './sale-completion';

import type { SaleContext, SaleOutcome } from './sale-completion';

const mockBound = jest.fn(),
	mockSession = jest.fn(),
	mockStamp = jest.fn(),
	mockGap = jest.fn(),
	mockReconcile = jest.fn(),
	mockReceipt = jest.fn(),
	mockInfo = jest.fn();
jest.mock('../../../../services/register/register-document', () => ({
	readBoundRegister: (...args: unknown[]) => mockBound(...args),
}));
jest.mock('../../../../services/register-session/session-store', () => ({
	requireOpenSession: (...args: unknown[]) => mockSession(...args),
}));
jest.mock('./provenance/stamp-completion', () => ({
	completionMeta: (...args: unknown[]) => mockStamp(...args),
}));
jest.mock('./provenance/provenance-gap', () => ({
	reportProvenanceGap: (...args: unknown[]) => mockGap(...args),
}));
jest.mock('./hooks/reconcile-completed-order', () => ({
	reconcileCompletedOrder: (...args: unknown[]) => mockReconcile(...args),
}));
jest.mock('./checkout-mode', () => ({
	enterReceipt: (...args: unknown[]) => mockReceipt(...args),
}));
jest.mock('@wcpos/utils/logger', () => ({
	getLogger: () => ({ info: (...args: unknown[]) => mockInfo(...args) }),
}));
const payload = { id: 42, status: 'completed', meta_data: [], line_items: [] };
const order = { uuid: 'order', getLatest: () => ({ payload }) } as never;
const ctx = {
	userDB: {},
	siteUuid: 'site',
	storeId: 1,
	sessionsOn: true,
	sessions: {},
	runtime: {},
	dp: 2,
	localPatch: jest.fn(),
	pushDocument: jest.fn(),
	stockAdjustment: jest.fn(),
} as unknown as SaleContext;
const manual = {
	source: 'manual',
	via: 'online',
	row,
	order: null,
	mirrorFailed: false,
	preLegBalanceMinor: 100,
	amountMinor: 100,
} as const;
beforeEach(() => {
	jest.clearAllMocks();
	mockBound.mockResolvedValue({ id: 'register' });
	mockSession.mockResolvedValue('session');
	mockStamp.mockResolvedValue([{ key: 'stamp', value: 1 }]);
	jest.mocked(ctx.localPatch).mockResolvedValue(order);
});
it.each([
	['manual online prediction', manual, true],
	['manual offline prediction', { ...manual, via: 'offline', amountMinor: 50 }, false],
	['manual mirror recovery', { ...manual, mirrorFailed: true, order: { balance: '1.00' } }, false],
	['terminal summary', { source: 'terminal', row, order: { balance: '0.00' } }, true],
	['terminal fallback', { source: 'terminal', row, order: null, balance: '0.00' }, true],
	['contract exact status', { source: 'gateway-contract', status: 'on-hold' }, false],
	[
		'snapshot on-hold',
		{ source: 'gateway-snapshot', snapshot: { ...payload, status: 'on-hold' } },
		true,
	],
	['zero balance', { source: 'zero-balance' }, true],
] as [string, SaleOutcome, boolean][])('%s', (_, outcome, expected) =>
	expect(isSaleComplete(outcome, 2)).toBe(expected)
);
it.each(['pos-open', 'pos-partial', 'pending', 'failed', 'cancelled'])(
	'snapshot excludes %s',
	(status) =>
		expect(
			isSaleComplete({ source: 'gateway-snapshot', snapshot: { ...payload, status } as never }, 2)
		).toBe(false)
);
it.each(['choose', 'bound', 'none'] as const)('prepares %s truth table', async (bindingStatus) => {
	for (const completing of [false, true])
		for (const sessionRule of ['require', 'none'] as const) {
			mockSession.mockClear();
			mockBound.mockClear();
			const result = await prepareSale(ctx, { order, completing, bindingStatus, sessionRule });
			const blocked = bindingStatus === 'choose' && completing;
			expect(result.ok).toBe(!blocked);
			expect(mockSession).toHaveBeenCalledTimes(!blocked && sessionRule === 'require' ? 1 : 0);
			if (blocked) expect(mockBound).not.toHaveBeenCalled();
		}
});
it('propagates session refusal before writes', async () => {
	mockSession.mockRejectedValueOnce(new Error('register_session_not_open'));
	await expect(
		prepareSale(ctx, { order, completing: false, bindingStatus: 'none', sessionRule: 'require' })
	).rejects.toThrow('register_session_not_open');
	expect(ctx.localPatch).not.toHaveBeenCalled();
});
it('online provenance stamps, patches, then awaits push', async () => {
	let release!: () => void;
	jest.mocked(ctx.pushDocument).mockImplementationOnce(
		() =>
			new Promise((resolve) => {
				release = () => resolve(undefined as never);
			})
	);
	let finished = false;
	const pending = persistSaleProvenance(ctx, { order, sessionId: 'session', online: true }).then(
		() => {
			finished = true;
		}
	);
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(mockStamp.mock.invocationCallOrder[0]).toBeLessThan(
		jest.mocked(ctx.localPatch).mock.invocationCallOrder[0]
	);
	expect(jest.mocked(ctx.localPatch).mock.invocationCallOrder[0]).toBeLessThan(
		jest.mocked(ctx.pushDocument).mock.invocationCallOrder[0]
	);
	expect(finished).toBe(false);
	release();
	await pending;
});
it('offline provenance writes split only', async () => {
	const extraMeta = [{ key: '_wcpos_split', value: 'plan' }];
	await persistSaleProvenance(ctx, { order, sessionId: null, online: false, extraMeta });
	expect(ctx.localPatch).toHaveBeenCalledWith({ document: order, data: { meta_data: extraMeta } });
	expect(mockStamp).not.toHaveBeenCalled();
	expect(ctx.pushDocument).not.toHaveBeenCalled();
});
it('returns metadata for the caller atomic write', async () => {
	expect(
		await completionMetaFor(ctx, [], {
			sessionId: 'session',
			extraMeta: [{ key: 'stamp', value: 2 }],
		})
	).toEqual([{ key: 'stamp', value: 2 }]);
	expect(ctx.localPatch).not.toHaveBeenCalled();
	expect(ctx.pushDocument).not.toHaveBeenCalled();
});
it.each([
	[manual, true],
	[{ ...manual, via: 'offline' }, false],
	[{ source: 'terminal', row, order: { balance: '0' } }, !row.recorded_offline],
	[{ source: 'terminal', row: { ...row, recorded_offline: true }, order: { balance: '0' } }, false],
	[{ source: 'gateway-contract', status: 'completed' }, true],
	[{ source: 'gateway-snapshot', snapshot: payload }, false],
	[{ source: 'zero-balance' }, false],
] as [SaleOutcome, boolean][])('refresh and gap rule %j', async (outcome, refresh) => {
	expect(await completeSale(ctx, order, outcome, { host: 'modal' })).toBe('completed');
	expect(mockGap).toHaveBeenCalledTimes(1);
	if (outcome.source !== 'gateway-snapshot')
		expect(mockReconcile).toHaveBeenCalledWith(ctx.runtime, order, refresh, ctx.stockAdjustment);
	else {
		expect(mockReconcile).not.toHaveBeenCalled();
		expect(ctx.stockAdjustment).toHaveBeenCalledWith([]);
	}
	expect(mockInfo).toHaveBeenCalledTimes(1);
	if (refresh)
		expect(mockGap.mock.invocationCallOrder[0]).toBeLessThan(
			mockReconcile.mock.invocationCallOrder[0]
		);
});
it.each([
	[{ host: 'stage', autoShowReceipt: true }, ['order']],
	[{ host: 'stage', autoShowReceipt: false }, null],
	[{ host: 'modal' }, null],
	[{ host: 'background' }, ['order', { select: false }]],
] as const)('presentation %j precedes refresh', async (presentation, args) => {
	await completeSale(ctx, order, manual, presentation);
	if (args) {
		expect(mockReceipt).toHaveBeenCalledWith(...args);
		expect(mockReceipt.mock.invocationCallOrder[0]).toBeLessThan(
			mockGap.mock.invocationCallOrder[0]
		);
	} else expect(mockReceipt).not.toHaveBeenCalled();
});
it('does not finish partial or unpaid sales', async () => {
	expect(
		await completeSale(ctx, order, { ...manual, amountMinor: 50 }, { host: 'background' })
	).toBe('partial');
	expect(
		await completeSale(
			ctx,
			order,
			{ source: 'gateway-contract', status: 'failed' },
			{ host: 'modal' }
		)
	).toBe('not-completed');
	expect(mockGap).not.toHaveBeenCalled();
	expect(mockReceipt).not.toHaveBeenCalled();
	expect(mockInfo).not.toHaveBeenCalled();
});
it('keeps completion helpers private to the owner and one another', () => {
	const violations: string[] = [];
	const scan = (directory: string) => {
		for (const entry of readdirSync(directory, { withFileTypes: true })) {
			const path = join(directory, entry.name);
			if (entry.isDirectory()) scan(path);
			else if (
				/\.tsx?$/.test(path) &&
				!/\.test\./.test(path) &&
				path !== join(__dirname, 'sale-completion.ts')
			) {
				if (
					/from ['"][^'"]*(?:provenance\/(?:stamp-completion|persist-provenance|provenance-gap)|hooks\/reconcile-completed-order)['"]/.test(
						readFileSync(path, 'utf8')
					)
				)
					violations.push(path);
			}
		}
	};
	scan(__dirname);
	expect(violations).toEqual([]);
});

it.each(['stamp', 'patch', 'push'] as const)(
	'online provenance rejects a failed %s before returning',
	async (failure) => {
		const error = new Error('write failed');
		if (failure === 'stamp') mockStamp.mockRejectedValueOnce(error);
		if (failure === 'patch') jest.mocked(ctx.localPatch).mockResolvedValueOnce(undefined);
		if (failure === 'push') jest.mocked(ctx.pushDocument).mockRejectedValueOnce(error);
		await expect(persistSaleProvenance(ctx, { order, online: true })).rejects.toThrow(
			failure === 'patch' ? 'provenance_save_failed' : 'write failed'
		);
		if (failure !== 'push') expect(ctx.pushDocument).not.toHaveBeenCalled();
		if (failure === 'stamp') expect(ctx.localPatch).not.toHaveBeenCalled();
	}
);
it('offline provenance without a split does not write or allocate metadata', async () => {
	await persistSaleProvenance(ctx, { order, online: false });
	expect(mockStamp).not.toHaveBeenCalled();
	expect(ctx.localPatch).not.toHaveBeenCalled();
	expect(ctx.pushDocument).not.toHaveBeenCalled();
});
