import { tx, t } from '@transifex/native';
import { T } from '@transifex/react';
import { from } from 'rxjs';
import { ObservableResource } from 'observable-hooks';

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
			console.log('es translations loaded');
		})
		.then(() => {
			console.log(t('Menu'));
		})
		.catch((err) => console.error(err))
);
const translationsResource = new ObservableResource(translations$);

export { tx, t, T, translationsResource };
