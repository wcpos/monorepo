/**
 * @jest-environment jsdom
 */
import { renderHook } from '@testing-library/react';

import { useActionContext } from './use-action-context';
import { RegisterSessionRequiredError } from '../../../../services/register-session/session-store';

const mockReadBoundRegister = jest.fn();
const mockFindOpenSession = jest.fn();
const mockIncrementalPatch = jest.fn();

jest.mock('@wcpos/query', () => {
	const runtime = { engine: { active: () => undefined } };
	return {
		useQueryRuntime: () => runtime,
		useDocField: (_doc: unknown, pick: (value: Record<string, unknown>) => unknown) =>
			pick({ register_sessions: true, prevent_overselling: false }),
	};
});
jest.mock('@wcpos/utils/logger', () => ({
	getLogger: () => ({ warn: jest.fn(), info: jest.fn() }),
}));
jest.mock('../../../../contexts/app-state', () => {
	// One fixture object: the hook's memo keys on these references, as the real providers' do.
	const session = {
		store: { id: 3 },
		wpCredentials: { id: 7 },
		userDB: {},
		site: { uuid: 'site' },
	};
	return { useStoreSession: () => session };
});
jest.mock('../../../../contexts/translations', () => {
	const t = (key: string) => key;
	return { useT: () => t };
});
jest.mock('../../../../services/register/use-register', () => {
	const register = { id: 'till' };
	return { useRegister: () => register };
});
jest.mock('../../../../services/register/register-document', () => ({
	readBoundRegister: (...args: unknown[]) => mockReadBoundRegister(...args),
}));
jest.mock('../../../../services/register-session/session-store', () => ({
	...jest.requireActual('../../../../services/register-session/session-store'),
	findOpenSession: (...args: unknown[]) => mockFindOpenSession(...args),
	// The writing helper, stubbed to write visibly: if the resolver ever used it, the
	// "never writes" assertion below is what fails, not a fixture type error.
	requireOpenSession: async (...args: unknown[]) => {
		const session = await mockFindOpenSession(...args);
		await session?.incrementalPatch({ server_expected: null, server_sales_count: null });
		return session?.id ?? null;
	},
}));
jest.mock('../../../../services/register-session/use-register-session-collections', () => ({
	useRegisterSessionCollection: () => 'sessions',
}));
jest.mock('./read-stock-document', () => ({ readStockDocument: jest.fn() }));

beforeEach(() => {
	jest.clearAllMocks();
	mockReadBoundRegister.mockResolvedValue({ id: 'register-1' });
	mockFindOpenSession.mockResolvedValue({
		id: 'session-1',
		incrementalPatch: mockIncrementalPatch,
	});
});

it('resolves the bound register and its open session without writing', async () => {
	const { result } = renderHook(() => useActionContext());
	await expect(result.current.ctx.register.resolveSession()).resolves.toEqual({
		registerId: 'register-1',
		sessionId: 'session-1',
	});
	expect(mockReadBoundRegister).toHaveBeenCalledWith({}, 'site', 3);
	expect(mockFindOpenSession).toHaveBeenCalledWith('sessions', 'register-1', true);
	// The read noun never touches the session document; the writer does that.
	expect(mockIncrementalPatch).not.toHaveBeenCalled();
});

it('passes a missing session through as RegisterSessionRequiredError', async () => {
	mockFindOpenSession.mockRejectedValueOnce(new RegisterSessionRequiredError());
	const { result } = renderHook(() => useActionContext());
	await expect(result.current.ctx.register.resolveSession()).rejects.toBeInstanceOf(
		RegisterSessionRequiredError
	);
});

it('keeps the same context object across renders', () => {
	const { result, rerender } = renderHook(() => useActionContext());
	const first = result.current.ctx;
	rerender();
	expect(result.current.ctx).toBe(first);
	expect(result.current.actor).toEqual({ userId: 7, registerId: 'till', sessionId: null });
});
