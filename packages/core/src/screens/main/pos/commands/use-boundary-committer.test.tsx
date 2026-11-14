/** @jest-environment jsdom */
import { renderHook } from '@testing-library/react';

import { useRegisterBinding } from '../../../../services/register/use-register-binding';
import { completeSale } from '../checkout/sale-completion';
import { commitAtBoundary } from './boundary-commit';
import { useBoundaryCommitter } from './use-boundary-committer';

const saleContext = { storeDB: {} };
const read = jest.fn();
const owns = jest.fn();
const closeSale = { close: jest.fn(), online: () => true };
const foreground = jest.fn();
jest.mock('./boundary-commit', () => ({
	commitAtBoundary: jest.fn(async () => ({ kind: 'closed' })),
}));
jest.mock('../checkout/hooks/use-sale-context', () => ({ useSaleContext: () => saleContext }));
jest.mock('../hooks/use-cart-config', () => ({ useCartConfigReader: () => read }));
jest.mock('../contexts/order-money-divergence', () => ({ useServerOwnsMoneyReader: () => owns }));
jest.mock('./close-sale', () => ({ useCloseSale: () => closeSale }));
jest.mock('../checkout/hooks/use-complete-order-flow', () => ({
	useCompleteOrderFlowForOrder: () => foreground,
}));
jest.mock('../checkout/sale-completion', () => ({
	completeSale: jest.fn(async () => 'completed'),
}));
jest.mock('../../../../services/register/use-register-binding', () => ({
	useRegisterBinding: jest.fn(() => ({ registerId: 'register', status: 'unknown' })),
}));

const input = { order: { uuid: 'a' }, queue: {}, write: jest.fn() } as never;
const contexts = () => jest.mocked(commitAtBoundary).mock.calls.map(([ctx]) => ctx);
beforeEach(() => jest.clearAllMocks());

it.each(['user', 'system'] as const)(
	'commits for %s with the sale context, the readers and the input unchanged',
	async (source) => {
		const { result } = renderHook(() => useBoundaryCommitter(source));
		await expect(result.current(input)).resolves.toEqual({ kind: 'closed' });
		expect(commitAtBoundary).toHaveBeenCalledWith(
			expect.objectContaining({
				...saleContext,
				source,
				configForOrder: read,
				serverOwnsMoney: owns,
				closeSale,
			}),
			input
		);
	}
);

it('maps an unknown binding to none, and reads the binding when the commit runs', async () => {
	const binding = useRegisterBinding();
	const user = renderHook(() => useBoundaryCommitter('user'));
	const system = renderHook(() => useBoundaryCommitter('system'));
	const committers = [user.result.current, system.result.current];
	try {
		for (const commit of committers) await commit(input);
		for (const ctx of contexts()) {
			expect(ctx.bindingStatus).toBe('none');
			expect(ctx.readBindingStatus?.()).toBe('none');
			expect(ctx.readRegisterId?.()).toBe('register');
		}
		jest
			.mocked(useRegisterBinding)
			.mockReturnValue({ ...binding, status: 'choose', registerId: 'b' });
		user.rerender();
		system.rerender();
		// A rebind keeps the committers; the in-flight readers see it.
		expect([user.result.current, system.result.current]).toEqual(committers);
		for (const ctx of contexts()) {
			expect(ctx.readBindingStatus?.()).toBe('choose');
			expect(ctx.readRegisterId?.()).toBe('b');
		}
	} finally {
		jest.mocked(useRegisterBinding).mockReturnValue(binding);
	}
});

it('hands each source its completion with the outcome unchanged', async () => {
	for (const source of ['user', 'system'] as const)
		await renderHook(() => useBoundaryCommitter(source)).result.current(input);
	const order = { uuid: 'a' } as never;
	const queue = {} as never;
	for (const ctx of contexts()) {
		const outcome = { source: 'zero-balance', order: { status: 'completed' } } as never;
		await ctx.complete(order, outcome, queue);
		if (ctx.source === 'system') {
			expect(completeSale).toHaveBeenLastCalledWith(
				saleContext,
				order,
				outcome,
				{ host: 'background' },
				queue
			);
			expect(jest.mocked(completeSale).mock.lastCall?.[2]).toBe(outcome);
		} else {
			expect(ctx.complete).toBe(foreground);
			expect(foreground).toHaveBeenLastCalledWith(order, outcome, queue);
		}
	}
	expect(completeSale).toHaveBeenCalledTimes(1);
	expect(foreground).toHaveBeenCalledTimes(1);
});
