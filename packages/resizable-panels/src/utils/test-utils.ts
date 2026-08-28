import util from 'node:util';

import { assert } from './assert';

export function expectToBeCloseToArray(actualNumbers: number[], expectedNumbers: number[]) {
	expect(actualNumbers.length).toBe(expectedNumbers.length);

	try {
		actualNumbers.forEach((actualNumber, index) => {
			const expectedNumber = expectedNumbers[index];
			assert(expectedNumber != null, `Expected number not found`);

			expect(actualNumber).toBeCloseTo(expectedNumber, 1);
		});
	} catch (error) {
		expect(actualNumbers).toEqual(expectedNumbers);
	}
}

export function verifyExpectedWarnings(callback: Function, ...expectedMessages: string[]) {
	const consoleSpy = (format: any, ...args: any[]) => {
		const message = util.format(format, ...args);

		for (let index = 0; index < expectedMessages.length; index++) {
			const expectedMessage = expectedMessages[index]!;
			if (message.includes(expectedMessage)) {
				expectedMessages.splice(index, 1);
				return;
			}
		}

		if (expectedMessages.length === 0) {
			throw new Error(`Unexpected message recorded:\n\n${message}`);
		}
	};

	const originalError = console.error;
	const originalWarn = console.warn;

	console.error = consoleSpy;
	console.warn = consoleSpy;

	try {
		callback();
	} finally {
		console.error = originalError;
		console.warn = originalWarn;
	}

	// Any remaining messages indicate failed expectations.
	if (expectedMessages.length > 0) {
		throw Error(`Expected message(s) not recorded:\n\n${expectedMessages.join('\n')}`);
	}

	return { pass: true };
}
