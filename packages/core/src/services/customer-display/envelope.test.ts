/** @jest-environment node */

import { makeEnvelope } from './envelope';

test('creates the exact v1 envelope and accepts a correlation id', () => {
	expect(makeEnvelope('display.config', { contract: '1.0' }, 'hello-id')).toEqual({
		wcpos: 1,
		id: 'hello-id',
		action: 'display.config',
		payload: { contract: '1.0' },
	});
	expect(makeEnvelope('display.idle', {})).toMatchObject({
		wcpos: 1,
		action: 'display.idle',
		payload: {},
	});
});
