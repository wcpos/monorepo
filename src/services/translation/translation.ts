import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';

/**
 * @TODO store i18n json in database
 * @TODO fetch i18n from wcpos plugin
 */
class i18nService {
	constructor() {
		i18n.use(initReactI18next).init({
			lng: 'en',
			fallbackLng: 'en',
			debug: true,

			// have a common namespace used around the full app
			ns: ['common'],
			defaultNS: 'common',

			interpolation: {
				escapeValue: false, // not needed for react as it escapes by default
			},

			// bootstrap translations
			resources: {
				en,
			},
		});
	}
}

export default i18nService;
