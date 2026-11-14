import type { CurrentSessionIDs, HydratedStoreSession, UserDatabase } from '@wcpos/query/user-db';

import { registerEngineScopeSwitcher } from './engine-scope-port';
import {
	clearStoreSession,
	commitStoreSession,
	IncompleteStoreSessionError,
	SIGNED_OUT_SESSION,
} from './store-session';

const ids = { siteID: 'site-1', wpCredentialsID: 'credentials-1', storeID: 'store-2' };
const STAMP = '2026-11-01T09:00:00.000Z';
const incrementalPatch = jest.fn(async (_patch: { last_access: string }) => undefined);
// The stored credential `stampTillAccess` reads by uuid; its stamp is readable, so only the
// session fact (a new shift) decides whether it is written.
const credentials = { uuid: ids.wpCredentialsID, last_access: STAMP, incrementalPatch };
const session = {
	site: { uuid: ids.siteID },
	wpCredentials: credentials,
	store: { localID: ids.storeID },
	storeDB: {},
	extraData: {},
} as unknown as HydratedStoreSession;

function pointerState(initial: CurrentSessionIDs | null = { ...ids, storeID: 'store-1' }) {
	let current: CurrentSessionIDs | null = initial;
	const set = jest.fn(async (_key: string, update: () => CurrentSessionIDs | null) => {
		current = update();
	});
	// RxState.get is synchronous.
	const get = jest.fn(() => current);
	return {
		userDB: {
			states: { v2: { get, set } },
			wp_credentials: { findOne: () => ({ exec: async () => credentials }) },
		} as unknown as UserDatabase,
		set,
		current: () => current,
	};
}

beforeEach(() => incrementalPatch.mockClear());

afterEach(() => registerEngineScopeSwitcher(null));

describe('commitStoreSession', () => {
	it('incomplete session rejects before engine invocation and persistence', async () => {
		const state = pointerState();
		const switchEngineScope = jest.fn();
		registerEngineScopeSwitcher(switchEngineScope);
		await expect(
			commitStoreSession(state.userDB, { ids, session: { ...session, store: undefined } })
		).rejects.toBeInstanceOf(IncompleteStoreSessionError);
		expect(switchEngineScope).not.toHaveBeenCalled();
		expect(state.set).not.toHaveBeenCalled();
	});

	it('complete session commits only after the registered engine transition resolves', async () => {
		const state = pointerState();
		let resolveEngine!: () => void;
		const switchEngineScope = jest.fn(
			() =>
				new Promise<void>((resolve) => {
					resolveEngine = resolve;
				})
		);
		registerEngineScopeSwitcher(switchEngineScope);
		const committing = commitStoreSession(state.userDB, { ids, session });
		// The previous pointer is read before the engine moves; let that read settle.
		for (let turn = 0; turn < 5; turn += 1) await Promise.resolve();
		expect(switchEngineScope).toHaveBeenCalledWith(session);
		expect(state.set).not.toHaveBeenCalled();
		resolveEngine();
		await expect(committing).resolves.toBe(session);
		expect(state.current()).toEqual(ids);
	});

	it('engine rejection leaves the pointer unchanged', async () => {
		const state = pointerState();
		const previous = state.current();
		const error = new Error('engine rejected');
		registerEngineScopeSwitcher(async () => {
			throw error;
		});
		const cashierSwitch = { ids: { ...ids, wpCredentialsID: 'credentials-2' }, session };
		await expect(commitStoreSession(state.userDB, cashierSwitch)).rejects.toBe(error);
		expect(state.set).not.toHaveBeenCalled();
		expect(state.current()).toBe(previous);
		expect(incrementalPatch).not.toHaveBeenCalled();
	});

	it.each([
		['no previous pointer stamps', null, 1],
		['a different cashier stamps', { ...ids, wpCredentialsID: 'credentials-0' }, 1],
		['the same cashier keeps the stamp', { ...ids, storeID: 'store-1' }, 0],
	])('the till stamp follows the pointer: %s', async (_case, previous, stamps) => {
		const state = pointerState(previous);
		await expect(commitStoreSession(state.userDB, { ids, session })).resolves.toBe(session);
		expect(state.current()).toEqual(ids);
		expect(incrementalPatch).toHaveBeenCalledTimes(stamps);
	});

	it('a failed stamp never fails the commit: the pointer is written and the session returned', async () => {
		const state = pointerState(null);
		incrementalPatch.mockRejectedValueOnce(new Error('stamp rejected'));
		await expect(commitStoreSession(state.userDB, { ids, session })).resolves.toBe(session);
		expect(incrementalPatch).toHaveBeenCalledTimes(1);
		expect(state.current()).toEqual(ids);
	});

	it('a commit for a different cashier stamps last_access; the same cashier keeps it', async () => {
		const state = pointerState({ ...ids, wpCredentialsID: 'credentials-0' });
		await commitStoreSession(state.userDB, { ids, session });
		expect(incrementalPatch).toHaveBeenCalledTimes(1);
		const { last_access } = incrementalPatch.mock.calls[0][0];
		expect(new Date(last_access).toISOString()).toBe(last_access);
		expect(last_access).not.toBe(STAMP);

		incrementalPatch.mockClear();
		await commitStoreSession(state.userDB, { ids: { ...ids, storeID: 'store-3' }, session });
		expect(incrementalPatch).not.toHaveBeenCalled();
	});

	it('persistence rejection does not return a publishable session', async () => {
		const state = pointerState();
		const error = new Error('persistence rejected');
		state.set.mockRejectedValue(error);
		const publish = jest.fn();
		await expect(commitStoreSession(state.userDB, { ids, session }).then(publish)).rejects.toBe(
			error
		);
		expect(publish).not.toHaveBeenCalled();
	});

	it('bootstrap commit succeeds without an engine port', async () => {
		const state = pointerState();
		await expect(commitStoreSession(state.userDB, { ids, session })).resolves.toBe(session);
		expect(state.current()).toEqual(ids);
	});

	it('clearStoreSession clears the pointer without invoking the engine', async () => {
		const state = pointerState();
		const switchEngineScope = jest.fn();
		registerEngineScopeSwitcher(switchEngineScope);
		await expect(clearStoreSession(state.userDB)).resolves.toBe(SIGNED_OUT_SESSION);
		expect(SIGNED_OUT_SESSION).toStrictEqual({
			site: undefined,
			wpCredentials: undefined,
			store: undefined,
			storeDB: undefined,
			extraData: undefined,
		});
		expect(Object.isFrozen(SIGNED_OUT_SESSION)).toBe(true);
		expect(state.current()).toBeNull();
		expect(switchEngineScope).not.toHaveBeenCalled();
	});
});
