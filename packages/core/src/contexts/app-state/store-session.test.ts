import { registerEngineScopeSwitcher } from './engine-scope-port';
import {
	clearStoreSession,
	commitStoreSession,
	IncompleteStoreSessionError,
	SIGNED_OUT_SESSION,
} from './store-session';

import type { CurrentSessionIDs, hydrateUserSession, SessionAppState } from './hydration-steps';

const ids = { siteID: 'site-1', wpCredentialsID: 'credentials-1', storeID: 'store-2' };
const session = {
	site: { uuid: ids.siteID },
	wpCredentials: { uuid: ids.wpCredentialsID },
	store: { localID: ids.storeID },
	storeDB: {},
	extraData: {},
} as Awaited<ReturnType<typeof hydrateUserSession>>;

function pointerState() {
	let current: CurrentSessionIDs | null = { ...ids, storeID: 'store-1' };
	const set = jest.fn(async (_key: string, update: () => CurrentSessionIDs | null) => {
		current = update();
	});
	return { appState: { set } as unknown as SessionAppState, set, current: () => current };
}

afterEach(() => registerEngineScopeSwitcher(null));

describe('commitStoreSession', () => {
	it('incomplete session rejects before engine invocation and persistence', async () => {
		const state = pointerState();
		const switchEngineScope = jest.fn();
		registerEngineScopeSwitcher(switchEngineScope);
		await expect(
			commitStoreSession(state.appState, { ids, session: { ...session, store: undefined } })
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
		const committing = commitStoreSession(state.appState, { ids, session });
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
		await expect(commitStoreSession(state.appState, { ids, session })).rejects.toBe(error);
		expect(state.set).not.toHaveBeenCalled();
		expect(state.current()).toBe(previous);
	});

	it('persistence rejection does not return a publishable session', async () => {
		const state = pointerState();
		const error = new Error('persistence rejected');
		state.set.mockRejectedValue(error);
		const publish = jest.fn();
		await expect(commitStoreSession(state.appState, { ids, session }).then(publish)).rejects.toBe(
			error
		);
		expect(publish).not.toHaveBeenCalled();
	});

	it('bootstrap commit succeeds without an engine port', async () => {
		const state = pointerState();
		await expect(commitStoreSession(state.appState, { ids, session })).resolves.toBe(session);
		expect(state.current()).toEqual(ids);
	});

	it('clearStoreSession clears the pointer without invoking the engine', async () => {
		const state = pointerState();
		const switchEngineScope = jest.fn();
		registerEngineScopeSwitcher(switchEngineScope);
		await expect(clearStoreSession(state.appState)).resolves.toBe(SIGNED_OUT_SESSION);
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
