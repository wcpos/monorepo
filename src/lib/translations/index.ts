import { tx, t } from '@transifex/native';
import { T } from '@transifex/react';

import CustomCache from './cache';

tx.init({
	token: '1/53ff5ea9a168aa4e7b8a72157b83537886a51938',
	cache: new CustomCache(),
});

export { tx, t, T };
