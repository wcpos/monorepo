import appUser, { appUserSchema } from './app-user';
import site, { siteSchema } from './site';
import store, { storeSchema } from './store';
import meta, { metaSchema } from './meta';
import wpUser, { wpUserSchema } from './wp-user';

// ui settings
import ui, { uiSchema } from './ui/ui';
import uiColumn, { uiColumnSchema } from './ui/column';
import uiDisplay, { uiDisplaySchema } from './ui/display';

export const schemas = [
	appUserSchema,
	siteSchema,
	storeSchema,
	metaSchema,
	wpUserSchema,

	// ui settings
	uiSchema,
	uiColumnSchema,
	uiDisplaySchema,
];

export const modelClasses = [
	appUser,
	site,
	store,
	meta,
	wpUser,

	// ui settings
	ui,
	uiColumn,
	uiDisplay,
];
