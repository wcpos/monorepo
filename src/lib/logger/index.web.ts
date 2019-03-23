import winston from 'winston';
import Sentry from './sentry';

const logger = winston.createLogger({
	format: winston.format.combine(winston.format.splat(), winston.format.json()),
	level: 'info',
	transports: [
		//
		// - Write to all logs with level `info` and below to `combined.log`
		// - Write all logs error (and below) to `error.log`.
		//
		// new winston.transports.File({ filename: 'error.log', level: 'error' }),
		// TODO: file logging has a bug in winston 3.1.0
		// new winston.transports.File({ filename: 'combined.log' }),
	],
});

if (process.env.NODE_ENV === 'production') {
	logger.add(
		new Sentry({
			key: '39233e9d1e5046cbb67dae52f807de5f',
			level: 'error',
			project: '1220733',
		})
	);
}

if (process.env.NODE_ENV !== 'production') {
	logger.add(
		new winston.transports.Console({
			format: winston.format.combine(
				// winston.format.splat(),
				winston.format.colorize(),
				// winston.format.metadata({ key: 'meta' }),
				winston.format.printf((info: any) => {
					console.log(info.meta);
					return `${info.level} ${info.message}`;
				})
			),
		})
	);
}

export default logger;
