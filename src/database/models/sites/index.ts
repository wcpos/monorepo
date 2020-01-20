import site, { siteSchema } from './site';
import store, { storeSchema } from './store';
import user, { userSchema } from './user';
import meta, { metaSchema } from './meta';

export const schemas = [siteSchema, storeSchema, userSchema, metaSchema];

export const modelClasses = [site, store, user, meta];
