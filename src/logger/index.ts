import { logger, consoleTransport } from 'react-native-logs';

const defaultConfig = {
	levels: {
		silly: -1,
		debug: 0,
		info: 1,
		warn: 2,
		error: 3,
	},
	severity: 'debug',
	transport: consoleTransport,
	transportOptions: {
		colors: {
			info: 'blueBright',
			warn: 'yellow',
			error: 'redBright',
			silly: 'white',
		},
	},
	async: true,
	dateFormat: 'time',
	printLevel: true,
	printDate: true,
	enabled: true,
};

const log = logger.createLogger<'silly' | 'debug' | 'info' | 'warn' | 'error'>(defaultConfig);

// TODO: Add version info
log.info({ message: 'TODO: Add version info :)' });
log.silly('Silly mode enabled! You get everything');

export default log;
