import * as React from 'react';

import log from '@wcpos/utils/src/logger';

import { t, tx } from '../../lib/translations';

interface Props {
	userLanguageResource: any;
	storeLanguageResource: any;
}

export const useLanguage = ({ userLanguageResource, storeLanguageResource }: Props) => {
	const [locale, setLocale] = React.useState('es');

	tx.setCurrentLocale(locale)
		.then(() => {
			log.silly('es translations loaded');
		})
		.then(() => {
			log.silly(t('Menu', { _tags: 'core' }));
		})
		.catch((err) => {
			log.error(err);
		});
};

// tx.cache.update('es', { Menu: 'Menú' });
