import * as devtools from './devtools';

export const QueryDevtools: (typeof devtools)['Devtools'] =
	process.env.NODE_ENV !== 'development'
		? function () {
				return null;
			}
		: devtools.Devtools;
