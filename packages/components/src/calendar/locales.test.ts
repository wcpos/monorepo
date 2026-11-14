import { LocaleConfig } from 'react-native-calendars';

import { updateLocaleConfig } from './locales';

jest.mock('@wcpos/utils/date-fns-locale', () => ({
	loadDateFnsLocale: jest.fn(async () => require('date-fns/locale/en-US').enUS),
}));
jest.mock('react-native-calendars', () => ({ LocaleConfig: { locales: {}, defaultLocale: '' } }));

it('leaves the global locale unchanged when the load is stale', async () => {
	const previousLocale = LocaleConfig.defaultLocale;
	expect(await updateLocaleConfig('fr', () => false)).toBe(false);
	expect(LocaleConfig.defaultLocale).toBe(previousLocale);
});

it('updates the global locale when the load is current', async () => {
	expect(await updateLocaleConfig('fr')).toBe(true);
	expect(LocaleConfig.defaultLocale).toBe('fr');
});
