import { clearAllDB } from '@wcpos/database/clear-all-db';
import { scheduleClearLocalDataOnNextLoad } from '@wcpos/database/clear-local-data-flag';

import { clearLocalDataNow, scheduleLocalDataReset } from '../src/local-data-reset';

jest.mock('@wcpos/database/clear-all-db', () => ({ clearAllDB: jest.fn() }));
jest.mock('@wcpos/database/clear-local-data-flag', () => ({
	scheduleClearLocalDataOnNextLoad: jest.fn(),
}));

afterEach(() => jest.clearAllMocks());

it.each([true, false])('preserves the scheduling result %s without clearing now', (scheduled) => {
	jest.mocked(scheduleClearLocalDataOnNextLoad).mockReturnValue(scheduled);
	expect(scheduleLocalDataReset()).toBe(scheduled);
	expect(scheduleClearLocalDataOnNextLoad).toHaveBeenCalledTimes(1);
	expect(clearAllDB).not.toHaveBeenCalled();
});
it('returns the database clear result unchanged', async () => {
	const result = { success: true, message: 'cleared', databasesDeleted: 2 };
	jest.mocked(clearAllDB).mockResolvedValue(result);
	await expect(clearLocalDataNow()).resolves.toBe(result);
	expect(clearAllDB).toHaveBeenCalledTimes(1);
	expect(scheduleClearLocalDataOnNextLoad).not.toHaveBeenCalled();
});
it('preserves clear failures for the existing caller to handle', async () => {
	const error = new Error('clear failed');
	jest.mocked(clearAllDB).mockRejectedValue(error);
	await expect(clearLocalDataNow()).rejects.toBe(error);
});
