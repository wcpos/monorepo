import { test as setup } from '@playwright/test';
import { authenticateWithStore } from './fixtures';

const authFile = 'e2e/.auth/user.json';

setup('authenticate', async ({ page }) => {
	await authenticateWithStore(page);
	await page.context().storageState({ path: authFile });
});
