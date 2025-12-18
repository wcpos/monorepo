// Mock for expo-localization
module.exports = {
	getLocales: () => [
		{
			languageTag: 'en-US',
			languageCode: 'en',
			textDirection: 'ltr',
			digitGroupingSeparator: ',',
			decimalSeparator: '.',
			measurementSystem: 'us',
			currencyCode: 'USD',
			currencySymbol: '$',
			regionCode: 'US',
		},
	],
	getCalendars: () => [
		{
			calendar: 'gregory',
			timeZone: 'America/New_York',
			uses24hourClock: false,
			firstWeekday: 1,
		},
	],
};
