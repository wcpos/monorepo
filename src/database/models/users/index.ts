import site, { siteSchema } from './site';
import store, { storeSchema } from './store';
import user, { userSchema } from './user';
import meta, { metaSchema } from './meta';
import wpUser, { wpUserSchema } from './wp-user';

export const schemas = [siteSchema, storeSchema, userSchema, metaSchema, wpUserSchema];

export const modelClasses = [site, store, user, meta, wpUser];
