import { tx, t } from '@transifex/native';
import { T } from '@transifex/react';

import CustomCache from './cache';

tx.init({
	token: '1/09853773ef9cda3be96c8c451857172f26927c0f',
	cache: new CustomCache(),
});

export { tx, t, T };
