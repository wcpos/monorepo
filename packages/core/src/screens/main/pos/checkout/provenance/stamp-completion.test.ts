import type { UserDatabase } from '@wcpos/database';

import { completionMeta } from './stamp-completion';

jest.mock('../../../../../services/register/register-document', () => ({
	readRegister: async () => ({ sites: { site: { register_id: 'register' } } }),
	nextSaleCounter: async () => 1,
}));
jest.mock('@wcpos/utils/app-info', () => ({ AppInfo: { version: 'test', buildNumber: 'test' } }));
const deps = { userDB: {} as UserDatabase, siteUuid: 'site' };
it('stamps the active session alongside the register', async () => {
	const meta = await completionMeta({}, { ...deps, sessionId: 'session' });
	expect(meta).toEqual(
		expect.arrayContaining([
			{ key: '_wcpos_session', value: 'session' },
			{ key: '_wcpos_register', value: 'register' },
		])
	);
});
it('does not invent a session when sessions are off', async () => {
	expect((await completionMeta({}, deps)).some(({ key }) => key === '_wcpos_session')).toBe(false);
});
it('preserves the original completion tuple when revisiting a sale', async () => {
	const meta_data = await completionMeta({}, { ...deps, sessionId: 'first' });
	expect(await completionMeta({ meta_data }, { ...deps, sessionId: 'second' })).toEqual(meta_data);
});
