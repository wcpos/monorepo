import createLogsCollection from './logs';
import createAppUserCollection from './app-users';
import createSitesCollection from './sites';
import createWpUserCollection from './wp-users';
import createStoresCollection from './stores';
import createUiSettingsCollection from './ui-settings';

export default [
	createLogsCollection,
	createAppUserCollection,
	createSitesCollection,
	createWpUserCollection,
	createStoresCollection,
	createUiSettingsCollection,
];
