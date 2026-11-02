import * as React from 'react';

import type { WebViewHandle } from '@wcpos/components/webview';

/**
 * Whether the store's pay document can receive `wcpos-process-payment`.
 * `stalled`: the first document never came, or the frame was withdrawn; no live
 * document holds the press, so a retry is safe. `failed`: a later navigation broke;
 * a retry would reload the pay page under a sale that may already be paid.
 */
export type PaymentFrameStatus = 'loading' | 'ready' | 'stalled' | 'failed';

/**
 * The Process Payment gate on the legacy pay frame, for both hosts: spread
 * `frameProps` onto `<PaymentWebview>` and call `press()` from the button.
 * The status is mirrored into a ref because the message is fire-and-forget (#1024)
 * and a press can beat the re-render, or carry a closure from a render that said `ready`.
 * Retry clears busy because a press into the withdrawn document will never be answered.
 * Busy does not clear on `loading`: the post-payment hop goes loading → ready, and
 * busy is what stops a second press into it.
 */
export function usePayFrameGate() {
	const ref = React.useRef<WebViewHandle>(null);
	const [status, setStatus] = React.useState<PaymentFrameStatus>('loading');
	const statusRef = React.useRef<PaymentFrameStatus>('loading');
	const setFrameStatus = React.useCallback((next: PaymentFrameStatus) => {
		statusRef.current = next;
		setStatus(next);
	}, []);
	const [busy, setBusy] = React.useState(false);
	const [retryToken, setRetryToken] = React.useState(0);
	const retry = React.useCallback(() => {
		setBusy(false);
		setRetryToken((n) => n + 1);
	}, []);
	const press = React.useCallback(() => {
		if (statusRef.current !== 'ready') return;
		setBusy(true);
		ref.current?.postMessage?.({ action: 'wcpos-process-payment' });
	}, []);

	return {
		status,
		busy,
		retry,
		press,
		frameProps: { ref, setLoading: setBusy, setFrameStatus, retryToken },
	};
}
