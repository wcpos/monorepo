import { clearAllDB } from '@wcpos/database/clear-all-db';
import { scheduleClearLocalDataOnNextLoad } from '@wcpos/database/clear-local-data-flag';

export function scheduleLocalDataReset(): boolean {
	return scheduleClearLocalDataOnNextLoad();
}

export function clearLocalDataNow(): Promise<{ message: string }> {
	return clearAllDB();
}
