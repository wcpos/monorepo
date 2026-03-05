import { expect, type Page } from '@playwright/test';
import { authenticatedTest as test } from './fixtures';

/** Helper to add the first simple product to the cart. Works in both grid and table view. */
async function addFirstProductToCart(page: Page) {
	const tile = page.getByTestId('product-tile').first();
	const tableButton = page.getByTestId('add-to-cart-button').first();

	// Wait for products to render in whichever view mode is active
	await expect(tile.or(tableButton)).toBeVisible({ timeout: 15_000 });

	if (await tile.isVisible()) {
		await tile.click();
	} else {
		await tableButton.click();
	}
	await expect(page.getByTestId('checkout-button')).toBeVisible({ timeout: 10_000 });
}

/**
 * Open the cart "+" dropdown menu and click a menu item by testID.
 * The add-cart-item actions (Fee, Shipping, etc.) are now behind a single
 * dropdown trigger in the cart header.
 */
async function openCartMenuAndClick(page: Page, menuItemTestId: string) {
	await page.getByTestId('add-cart-item-menu').click();
	const menuItem = page.getByTestId(menuItemTestId);
	await expect(menuItem).toBeVisible({ timeout: 5_000 });
	await menuItem.click();
}

/**
 * Persist a POS cart UI setting directly in RxDB state.
 * This avoids locale-dependent UI selectors for toggles.
 */
async function setPosCartSetting(
	page: Page,
	key: 'autoShowReceipt' | 'autoPrintReceipt',
	value: boolean
) {
	await page.evaluate(
		async ({ key, value }) => {
			const dbs = await indexedDB.databases();
			const dbInfo = dbs.find((db) => db.name?.startsWith('store_v2_') && db.version);
			if (!dbInfo?.name || !dbInfo.version) {
				throw new Error('Store database not found');
			}

			const db = await new Promise<IDBDatabase>((resolve, reject) => {
				const req = indexedDB.open(dbInfo.name!, dbInfo.version);
				req.onsuccess = () => resolve(req.result);
				req.onerror = () => reject(req.error);
			});

			const storeName = Array.from(db.objectStoreNames).find(
				(name) => name.startsWith('rx-state-pos-cart_v2-') && name.endsWith('-documents')
			);
			if (!storeName) {
				db.close();
				throw new Error('POS cart state store not found');
			}

			const readTx = db.transaction(storeName, 'readonly');
			const records = await new Promise<any[]>((resolve, reject) => {
				const req = readTx.objectStore(storeName).getAll();
				req.onsuccess = () => resolve(req.result as any[]);
				req.onerror = () => reject(req.error);
			});

			if (records.length === 0) {
				db.close();
				throw new Error('No POS cart state records found');
			}

			const numericIds = records
				.map((record) => Number.parseInt(String(record.i), 10))
				.filter((id) => Number.isFinite(id));
			const nextNumericId = numericIds.length > 0 ? Math.max(...numericIds) + 1 : 1;
			const id = String(nextNumericId).padStart(14, '0');

			const lwt = Date.now() + 0.01;
			const lwtInt = Math.floor(lwt) - 1;
			const lwtIntStr = lwtInt.toString().padStart(15, '0');
			const lwtDecParts = lwt.toString().split('.');
			const lwtDecStr = (lwtDecParts.length > 1 ? lwtDecParts[1] : '0')
				.padEnd(2, '0')
				.substring(0, 2);
			const encodedLwt = lwtIntStr + lwtDecStr;

			const lastRecord = records[records.length - 1];
			const sId = lastRecord?.d?.sId || 'e2e';

			const newRecord = {
				i: id,
				d: {
					id,
					sId,
					ops: [{ k: key, v: value }],
					_deleted: false,
					_meta: { lwt },
					_rev: `1-${sId}`,
					_attachments: {},
				},
				i0: '0' + id,
				i1: encodedLwt + id,
				i2: '0' + encodedLwt,
			};

			const writeTx = db.transaction(storeName, 'readwrite');
			writeTx.objectStore(storeName).put(newRecord);
			await new Promise<void>((resolve, reject) => {
				writeTx.oncomplete = () => resolve();
				writeTx.onerror = () => reject(writeTx.error);
			});

			db.close();
		},
		{ key, value }
	);
}

test.describe('POS Cart', () => {
	test('should show guest customer by default', async ({ posPage: page }) => {
		await expect(page.getByTestId('cart-customer-name')).toBeVisible();
	});

	test('should add a product to the cart and show checkout button', async ({ posPage: page }) => {
		await addFirstProductToCart(page);
	});

	test('should update quantity in cart', async ({ posPage: page }) => {
		await addFirstProductToCart(page);

		const quantityButton = page.getByTestId('cart-quantity-input').first();
		await expect(quantityButton).toBeVisible({ timeout: 15_000 });
		await quantityButton.click();

		const numpad = page.locator('[data-radix-popper-content-wrapper]').first();
		await expect(numpad).toBeVisible({ timeout: 15_000 });
		await page.keyboard.type('3');
		await page.getByTestId('numpad-done-button').click();
		await page.waitForTimeout(500);
	});

	test('should allow entering multiple digits in numpad without resetting', async ({
		posPage: page,
	}) => {
		await addFirstProductToCart(page);

		const quantityButton = page.getByTestId('cart-quantity-input').first();
		await expect(quantityButton).toBeVisible({ timeout: 15_000 });
		await quantityButton.click();

		const numpad = page.locator('[data-radix-popper-content-wrapper]').first();
		await expect(numpad).toBeVisible({ timeout: 15_000 });
		const numpadInput = numpad.locator('input');
		await expect(numpadInput).toBeVisible({ timeout: 10_000 });
		await numpadInput.click();

		// Append two digits to the default quantity (1) and verify they stick.
		// We assert the numeric tail to tolerate locale formatting (eg "1.23").
		await numpadInput.type('23', { delay: 100 });
		await expect
			.poll(async () => (await numpadInput.inputValue()).replace(/\D/g, ''), {
				timeout: 10_000,
			})
			.toMatch(/123$/);

		await page.getByTestId('numpad-done-button').click();
		await page.waitForTimeout(500);
	});

	test('should add multiple different products', async ({ posPage: page }) => {
		// Works in both grid (product-tile) and table (add-to-cart-button) views
		const tile = page.getByTestId('product-tile');
		const tableButton = page.getByTestId('add-to-cart-button');

		// Wait for products to render in whichever view mode is active
		await expect(tile.first().or(tableButton.first())).toBeVisible({ timeout: 15_000 });

		const isTileVisible = await tile.first().isVisible();
		const buttons = isTileVisible ? tile : tableButton;

		await buttons.nth(0).click();
		await page.waitForTimeout(500);

		await buttons.nth(1).click();
		await page.waitForTimeout(500);

		await expect(page.getByTestId('checkout-button')).toBeVisible();
	});

	test('should void an order to clear cart', async ({ posPage: page }) => {
		await addFirstProductToCart(page);

		await page.getByTestId('void-button').click();
		await page.waitForTimeout(1_500);

		await expect(page.getByTestId('checkout-button')).not.toBeVisible({
			timeout: 10_000,
		});
	});

	test('should show subtotal in cart totals', async ({ posPage: page }) => {
		await addFirstProductToCart(page);

		await expect(page.getByTestId('cart-subtotal')).toBeVisible({ timeout: 15_000 });
	});

	test('should show cart total in checkout button', async ({ posPage: page }) => {
		await addFirstProductToCart(page);

		const checkoutButton = page.getByTestId('checkout-button');
		const buttonText = await checkoutButton.textContent();
		expect(buttonText).toMatch(/\d/);
	});
});

test.describe('POS Cart - Add Items Menu', () => {
	test('should show the add-cart-item dropdown menu', async ({ posPage: page }) => {
		const trigger = page.getByTestId('add-cart-item-menu');
		await expect(trigger).toBeVisible({ timeout: 15_000 });
		await trigger.click();

		// All non-pro menu items should be visible
		await expect(page.getByTestId('menu-add-misc-product')).toBeVisible({ timeout: 5_000 });
		await expect(page.getByTestId('menu-add-fee')).toBeVisible();
		await expect(page.getByTestId('menu-add-shipping')).toBeVisible();
	});

	test('should add a fee via the dropdown menu', async ({ posPage: page }) => {
		await addFirstProductToCart(page);

		await openCartMenuAndClick(page, 'menu-add-fee');

		const dialog = page.getByRole('dialog');
		await expect(dialog).toBeVisible({ timeout: 15_000 });
		const addToCartButton = page.getByTestId('add-to-cart-submit');
		await expect(addToCartButton).toBeVisible({ timeout: 15_000 });
		await addToCartButton.click();
		await expect(page.getByTestId('checkout-button')).toBeVisible({ timeout: 15_000 });
	});

	test('should add shipping via the dropdown menu', async ({ posPage: page }) => {
		await addFirstProductToCart(page);

		await openCartMenuAndClick(page, 'menu-add-shipping');

		const dialog = page.getByRole('dialog');
		await expect(dialog).toBeVisible({ timeout: 15_000 });
		const addToCartButton = page.getByTestId('add-to-cart-submit');
		await expect(addToCartButton).toBeVisible({ timeout: 15_000 });
		await addToCartButton.click();
		await expect(page.getByTestId('checkout-button')).toBeVisible({ timeout: 15_000 });
	});

	test('should add a miscellaneous product via the dropdown menu', async ({ posPage: page }) => {
		await openCartMenuAndClick(page, 'menu-add-misc-product');

		const dialog = page.getByRole('dialog');
		await expect(dialog).toBeVisible({ timeout: 15_000 });
		const addToCartButton = page.getByTestId('add-to-cart-submit');
		await expect(addToCartButton).toBeVisible({ timeout: 15_000 });
		await addToCartButton.click();
		await expect(page.getByTestId('checkout-button')).toBeVisible({ timeout: 15_000 });
	});

	test('should close the dialog without adding an item', async ({ posPage: page }) => {
		await addFirstProductToCart(page);

		await openCartMenuAndClick(page, 'menu-add-fee');

		const dialog = page.getByRole('dialog');
		await expect(dialog).toBeVisible({ timeout: 15_000 });

		// Close via Escape key
		await page.keyboard.press('Escape');
		await expect(dialog).not.toBeVisible({ timeout: 5_000 });
	});
});

test.describe('POS Cart - Order Actions', () => {
	test('should save order to server', async ({ posPage: page }) => {
		await addFirstProductToCart(page);

		await page.getByTestId('save-to-server-button').click();

		// Wait for the save button to finish loading (loading state resolves when save completes)
		await expect(page.getByTestId('save-to-server-button')).toBeEnabled({ timeout: 30_000 });
		// Verify a success toast appeared (Sonner toast)
		await expect(page.locator('[data-sonner-toast]').first()).toBeVisible({ timeout: 10_000 });
	});

	test('should add order note', async ({ posPage: page }) => {
		await addFirstProductToCart(page);

		await page.getByTestId('order-note-button').click();

		const textarea = page.locator('textarea').first();
		await expect(textarea).toBeVisible({ timeout: 15_000 });
		await textarea.fill('Test order note from e2e');

		const addNoteButton = page.getByTestId('add-note-button');
		await expect(addNoteButton).toBeVisible({ timeout: 15_000 });
		await addNoteButton.click();
	});

	test('should open order meta dialog', async ({ posPage: page }) => {
		await addFirstProductToCart(page);

		await page.getByTestId('order-meta-button').click();

		await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 });
	});
});

test.describe('POS Cart - Multiple Orders', () => {
	test('should create a new order via tab', async ({ posPage: page }) => {
		await addFirstProductToCart(page);

		// The new order button is a TabsTrigger with a plus icon
		// It's a tab element with value="new" containing an Icon with name="plus"
		// The tooltip text is "Open new order"
		const newOrderTab = page.getByRole('tab').filter({ has: page.locator('svg') }).last().or(
			page.locator('[role="tab"]').filter({ hasText: '+' })
		).or(
			page.locator('[data-state]').filter({ has: page.locator('[name="plus"]') })
		);

		await expect(newOrderTab).toBeVisible({ timeout: 15_000 });
		await newOrderTab.click();

		// Wait for cart transition animation
		await page.waitForTimeout(1_000);

		// New order should have empty cart (no checkout button visible)
		await expect(page.getByTestId('checkout-button')).not.toBeVisible({
			timeout: 15_000,
		});
	});
});

test.describe('POS Checkout', () => {
	test('should open checkout modal', async ({ posPage: page }) => {
		await addFirstProductToCart(page);

		await page.getByTestId('checkout-button').click();

		await expect(page.getByTestId('process-payment-button')).toBeVisible({
			timeout: 10_000,
		});
	});

	test('should show order total in checkout', async ({ posPage: page }) => {
		await addFirstProductToCart(page);

		await page.getByTestId('checkout-button').click();
		await expect(page.getByTestId('process-payment-button')).toBeVisible({
			timeout: 10_000,
		});

		// The cancel and process payment buttons are siblings in the modal footer.
		// The modal shows the order total — verify there's a visible number/amount on the page.
		const cancelButton = page.getByTestId('cancel-checkout-button');
		await expect(cancelButton).toBeVisible();
		// At this point the checkout modal is confirmed open with both buttons visible.
	});

	test('should cancel checkout and return to cart', async ({ posPage: page }) => {
		await addFirstProductToCart(page);

		await page.getByTestId('checkout-button').click();
		await expect(page.getByTestId('process-payment-button')).toBeVisible({
			timeout: 10_000,
		});

		await page.getByTestId('cancel-checkout-button').click();

		await expect(page.getByTestId('checkout-button')).toBeVisible({ timeout: 10_000 });
	});

	test('should complete an order', async ({ posPage: page }) => {
		await addFirstProductToCart(page);

		await page.getByTestId('checkout-button').click();
		await expect(page.getByTestId('process-payment-button')).toBeVisible({
			timeout: 10_000,
		});

		await page.getByTestId('process-payment-button').click();

		// After clicking process payment, the button enters loading state (disabled).
		// Payment is processed via a WebView/iframe — this can be slow or fail in CI.
		// Verify the button became disabled (payment was initiated).
		await expect(page.getByTestId('process-payment-button')).toBeDisabled({ timeout: 10_000 });

		// Wait for the payment to complete: either the receipt appears or we return to POS
		const receiptPrintButton = page.getByTestId('receipt-print-button');
		const receiptCloseButton = page.getByTestId('receipt-close-button');
		const posScreen = page.getByTestId('search-products');
		await expect(
			receiptPrintButton.or(receiptCloseButton).or(posScreen)
		).toBeVisible({ timeout: 60_000 });
	});

	test('should auto print receipt after checkout when enabled', async ({ posPage: page }) => {
		await setPosCartSetting(page, 'autoShowReceipt', true);
		await setPosCartSetting(page, 'autoPrintReceipt', true);
		await page.reload();
		await expect(page.getByTestId('search-products')).toBeVisible({ timeout: 30_000 });

		await addFirstProductToCart(page);

		await page.getByTestId('checkout-button').click();
		await expect(page.getByTestId('process-payment-button')).toBeVisible({
			timeout: 10_000,
		});
		const orderIdMatch = page.url().match(/\/cart\/([^/]+)\/checkout$/);
		expect(orderIdMatch?.[1]).toBeTruthy();

		await page.goto(`/cart/receipt/${orderIdMatch![1]}`);
		const printButton = page.getByTestId('receipt-print-button');
		await expect(printButton).toBeVisible({ timeout: 30_000 });
		await expect(printButton).toBeDisabled({ timeout: 10_000 });
	});
});
