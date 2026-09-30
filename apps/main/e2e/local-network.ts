import type { Browser, BrowserContext } from '@playwright/test';

/**
 * Chrome's Local Network Access check, lifted only for runs that ask for it.
 *
 * The mini-store job (`e2e-web-mini` in deploy.yml) serves the app from a public
 * `*.expo.app` origin and points it at a tailnet store, whose name resolves to a
 * Tailscale 100.64/10 address. Chrome treats that as the `local` address space and
 * blocks every store request unless the page holds the local-network permission
 * (run 36744150343: "Permission was denied for this request to access the `local`
 * address space"). Granting the permission is narrower than a
 * `--disable-features` flag. Runs against a public store (dev-next, dev-pro) never
 * set the env, so they keep Chrome's default behaviour.
 */
export const LOCAL_NETWORK_PERMISSIONS: string[] =
	process.env.E2E_ALLOW_LOCAL_NETWORK === '1' ? ['local-network-access'] : [];

/** The context every global-setup browser opens (the projects get the permission via `use`). */
export function newSetupContext(browser: Browser, baseURL: string): Promise<BrowserContext> {
	return browser.newContext({
		baseURL,
		viewport: { width: 1280, height: 720 },
		permissions: LOCAL_NETWORK_PERMISSIONS,
	});
}
