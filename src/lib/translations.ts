import { tx, t } from '@transifex/native';
import { T } from '@transifex/react';
import { from } from 'rxjs';
import { ObservableResource } from 'observable-hooks';
import log from '@wcpos/utils/src/logger';

tx.init({
	token: '1/53ff5ea9a168aa4e7b8a72157b83537886a51938',
});

/**
 * @TODO - Move this to the App Context
 */
const translations$ = from(
	tx
		.setCurrentLocale('es')
		.then(() => {
			log.silly('es translations loaded');
		})
		.then(() => {
			log.silly(t('Menu'));
		})
		.catch((err) => {
			log.error(err);
		})
);
const translationsResource = new ObservableResource(translations$);

export { tx, t, T, translationsResource };
