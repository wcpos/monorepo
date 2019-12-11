import site, { siteSchema } from './site';
import store, { storeSchema } from './store';
import user, { userSchema } from './user';

export const schemas = [siteSchema, storeSchema, userSchema];

export const modelClasses = [site, store, user];
