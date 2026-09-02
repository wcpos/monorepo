import * as React from 'react';

import { v4 as uuidv4 } from 'uuid';

import type { WebViewHandle } from '@wcpos/components/webview';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';

import { type BridgeEnvelope, BridgeError, type BridgeHandlers } from './types';

export const ACTION_TIMEOUT_MS: Record<string, number> = {
	'printers.scan': 60_000,
	'printers.probe': 15_000,
	'printers.testPrint': 15_000,
	'http.proxy': 30_000,
};
const DEFAULT_TIMEOUT_MS = 5_000;
const bridgeLogger = getLogger(['mini-apps', 'bridge']);

interface MessageEvent {
	nativeEvent: { data: unknown; url?: string };
}

function parseMessage(data: unknown): unknown {
	if (typeof data !== 'string') return data;
	try {
		return JSON.parse(data);
	} catch {
		return null;
	}
}

function isEnvelope(value: unknown): value is BridgeEnvelope<Record<string, unknown>> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	const keys = Object.keys(value);
	const item = value as Record<string, unknown>;
	return (
		keys.length === 4 &&
		keys.every((key) => ['wcpos', 'id', 'action', 'payload'].includes(key)) &&
		item.wcpos === 1 &&
		typeof item.id === 'string' &&
		typeof item.action === 'string' &&
		!!item.payload &&
		typeof item.payload === 'object' &&
		!Array.isArray(item.payload)
	);
}

export function useBridge(
	webViewRef: React.RefObject<WebViewHandle | null>,
	origin: string,
	handlers: BridgeHandlers
) {
	const [ready, setReady] = React.useState(false);
	const readyRef = React.useRef(false);

	const post = React.useCallback(
		(message: BridgeEnvelope) => webViewRef.current?.postMessage(message),
		[webViewRef]
	);
	const send = React.useCallback(
		(action: string, payload: object) => post({ wcpos: 1, id: uuidv4(), action, payload }),
		[post]
	);

	const onMessage = React.useCallback(
		async (event: MessageEvent) => {
			if (event.nativeEvent.url && messageOrigin(event.nativeEvent.url) !== origin) {
				bridgeLogger.warn('Dropped message from unexpected origin');
				return;
			}
			const parsed = parseMessage(event.nativeEvent.data);
			if (
				parsed &&
				typeof parsed === 'object' &&
				(parsed as { wcpos?: unknown }).wcpos !== 1 &&
				typeof (parsed as { id?: unknown }).id === 'string' &&
				typeof (parsed as { action?: unknown }).action === 'string'
			) {
				const item = parsed as { id: string; action: string };
				postError(
					{ wcpos: 1, id: item.id, action: item.action, payload: {} },
					new BridgeError('unsupported_version', 'Unsupported bridge protocol version'),
					post,
					Date.now()
				);
				return;
			}
			if (!isEnvelope(parsed)) {
				bridgeLogger.warn('Dropped invalid bridge envelope');
				return;
			}
			const started = Date.now();
			const handler = handlers[parsed.action];
			bridgeLogger.debug('Bridge request', { context: { action: parsed.action } });
			if (!handler) {
				const error = new BridgeError('capability_denied', 'Capability is not granted');
				postError(parsed, error, post, started);
				return;
			}
			if (parsed.action !== 'app.ready' && !readyRef.current) {
				postError(
					parsed,
					new BridgeError('capability_denied', 'Handshake has not completed'),
					post,
					started
				);
				return;
			}
			const timeoutMs = ACTION_TIMEOUT_MS[parsed.action] ?? DEFAULT_TIMEOUT_MS;
			let timer: ReturnType<typeof setTimeout> | undefined;
			try {
				const payload = await Promise.race([
					handler(parsed.payload),
					new Promise<never>((_, reject) => {
						timer = setTimeout(() => {
							reject(new BridgeError('timeout', `${parsed.action} timed out`));
						}, timeoutMs);
					}),
				]);
				const action = parsed.action === 'app.ready' ? 'app.init' : parsed.action;
				post({ wcpos: 1, id: parsed.id, action, payload });
				if (parsed.action === 'app.ready') {
					readyRef.current = true;
					setReady(true);
				}
				bridgeLogger.debug('Bridge response', {
					context: {
						action: parsed.action,
						code: 'ok',
						ms: Date.now() - started,
					},
				});
			} catch (cause) {
				const error =
					cause instanceof BridgeError ? cause : new BridgeError('failed', getErrorMessage(cause));
				postError(parsed, error, post, started);
			} finally {
				if (timer) clearTimeout(timer);
			}
		},
		[handlers, origin, post]
	);

	return { onMessage, ready, send };
}

function messageOrigin(url: string): string | null {
	try {
		return new URL(url).origin;
	} catch {
		return null;
	}
}

function postError(
	request: BridgeEnvelope,
	error: BridgeError,
	post: (message: BridgeEnvelope<object>) => void,
	started: number
) {
	const payload = {
		code: error.code,
		message: error.message,
		action: request.action,
		detail: error.detail,
	};
	post({ wcpos: 1, id: request.id, action: 'error', payload });
	bridgeLogger.debug('Bridge response', {
		context: {
			action: request.action,
			code: error.code,
			ms: Date.now() - started,
		},
	});
}
