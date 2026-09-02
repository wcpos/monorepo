import { describe, expect, it } from 'vitest';

import { INVOKE_CHANNELS, ON_CHANNELS, SEND_CHANNELS } from '@wcpos/printer/ipc-channels';

/**
 * The Electron preload allowlists come verbatim from these arrays. A channel that a
 * feature invokes but that is missing here is rejected at runtime with
 * "Channel <name> is not allowed" — the type-level registry assertions cannot catch
 * a feature whose channel was never added to the registry at all (that is exactly
 * how the Novu bridge shipped broken: renderer + main both merged, allowlist never
 * gained the channel).
 */
describe('Electron IPC channel allowlists', () => {
	it('allows the Epson ePOS HTTP invoke channel used by Electron printing', () => {
		expect(INVOKE_CHANNELS).toContain('print-epos-http');
	});

	it('allows the novu invoke channel used by the renderer Novu proxy', () => {
		expect(INVOKE_CHANNELS).toContain('novu');
	});

	it('allows the novu:event push channel used for notification streams', () => {
		expect(ON_CHANNELS).toContain('novu:event');
	});

	it('allows the telemetry consent channel used by the renderer', () => {
		expect(SEND_CHANNELS).toContain('telemetry-consent');
	});
});
