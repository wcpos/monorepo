import '@testing-library/jest-dom/vitest';

import { beforeAll } from 'vitest';

import { loadBarcodeLibrary } from '@wcpos/receipt-renderer';

// The renderer loads bwip-js lazily; the studio's synchronous renders need it loaded first.
beforeAll(async () => {
	await loadBarcodeLibrary();
});
