import randomToken from 'random-token';

/**
 * generate a new _id as db-primary-key
 */
// eslint-disable-next-line import/prefer-default-export
export function generateId(): string {
	return randomToken(10);
}
