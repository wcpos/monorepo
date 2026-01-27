import { getLogger } from '@wcpos/utils/logger';

const debugLogger = getLogger(['wcpos', 'debug', 'perf']);

// helper function that starts performace - time measurement
export const timeStart = () => {
	return performance.now();
};

// helper function  to end and print  - time measurement
export const timeEnd = (timeStart: number, funName: string) => {
	const t1 = performance.now();
	debugLogger.info(`fun: ${funName} took ${(t1 - timeStart).toFixed(2)}ms`);
	return +(t1 - timeStart).toFixed(2);
};
