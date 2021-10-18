// eslint-disable-next-line @typescript-eslint/no-var-requires
const pkg = require('../../../package.json');

export const APP_VERSION = `${pkg.version || ''}`.replace(/-\d+$/g, '');

/**
 * @TODO unique instance id for the web app?
 */
export const getUniqueId = (): string => {
	return '';
};

/**
 *
 */
export const getReadableVersion = (): string => {
	return APP_VERSION;
};
