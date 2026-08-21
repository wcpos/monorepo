import { bareAuthParamSupported, formatAuthorizationParam } from './auth-param';

describe('authorization query parameter formatting', () => {
	it.each(['1.10.0', '1.11.2', '2.0.0', '1.10.0-beta.1'])(
		'uses a bare token for supported WCPOS version %s',
		(wcposVersion) => {
			expect(formatAuthorizationParam('token', bareAuthParamSupported(wcposVersion))).toBe('token');
		}
	);

	it.each(['1.9.17', '', null, undefined, 'garbage'])(
		'keeps the Bearer prefix for unsupported WCPOS version %s',
		(wcposVersion) => {
			expect(formatAuthorizationParam('token', bareAuthParamSupported(wcposVersion))).toBe(
				'Bearer token'
			);
		}
	);
});
