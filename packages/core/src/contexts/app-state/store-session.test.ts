import {
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

describe('commitStoreSession', () => {
	it('incomplete session rejects before engine invocation and persistence', async () => {
		const state = pointerState();
		const switchEngineScope = jest.fn();
		await expect(
			commitStoreSession(
				state.appState,
				{ ids, session: { ...session, store: undefined } },
				switchEngineScope
			)
		).rejects.toBeInstanceOf(IncompleteStoreSessionError);
		expect(switchEngineScope).not.toHaveBeenCalled();
		expect(state.set).not.toHaveBeenCalled();
	});

	it('complete session commits only after the supplied engine transition resolves', async () => {
		const state = pointerState();
		let resolveEngine!: () => void;
		const switchEngineScope = jest.fn(
			() =>
				new Promise<void>((resolve) => {
					resolveEngine = resolve;
				})
		);
		const committing = commitStoreSession(state.appState, { ids, session }, switchEngineScope);
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
		await expect(
			commitStoreSession(state.appState, { ids, session }, async () => {
				throw error;
			})
		).rejects.toBe(error);
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

	it('null commit clears the pointer and returns every signed-out field without invoking the engine', async () => {
		const state = pointerState();
		const switchEngineScope = jest.fn();
		await expect(commitStoreSession(state.appState, null, switchEngineScope)).resolves.toBe(
			SIGNED_OUT_SESSION
		);
		expect(SIGNED_OUT_SESSION).toStrictEqual({
			site: undefined,
			wpCredentials: undefined,
			store: undefined,
			storeDB: undefined,
			extraData: undefined,
		});
		expect(state.current()).toBeNull();
		expect(switchEngineScope).not.toHaveBeenCalled();
	});
});
