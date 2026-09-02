import * as React from 'react';
import { Platform as RNPlatform, View } from 'react-native';

import { useCSSVariable, useUniwind } from 'uniwind';

import { Button } from '@wcpos/components/button';
import { Modal, ModalBody, ModalContent, ModalHeader, ModalTitle } from '@wcpos/components/modal';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import { WebView } from '@wcpos/components/webview';
import type { WebViewHandle } from '@wcpos/components/webview';

import { useBridge } from './bridge/use-bridge';
import { type AppInitPayload, BridgeError, type BridgeHandlers } from './bridge/types';
import { useHostCapabilities } from './capabilities/host';
import { usePrinterCapabilities } from './capabilities/printers';
import { meetsMinAppVersion, MINI_APP_ORIGIN, useMiniAppCatalog } from './catalog';
import { detectWebEngine } from './detect-web-engine';
import { useStoreSession } from '../../../contexts/app-state';
import { useT } from '../../../contexts/translations';
import { useAppInfo } from '../../../hooks/use-app-info';
import { useLocale } from '../../../hooks/use-locale';

// Covers a slow first fetch of the remote page plus the 10 s the contract allows for app.ready.
const READY_DEADLINE_MS = 30_000;

interface MiniAppHostProps {
	id: string;
	onClose: (result: string) => void;
}

export function MiniAppHost({ id, onClose }: MiniAppHostProps) {
	const t = useT();
	const locale = useLocale();
	const { store } = useStoreSession();
	const appInfo = useAppInfo();
	const { theme } = useUniwind();
	const accent = String(useCSSVariable('--color-primary') ?? '');
	const catalog = useMiniAppCatalog();
	const entry = catalog.find(
		(item) =>
			item.id === id &&
			item.url.startsWith(`${MINI_APP_ORIGIN}/`) &&
			item.platforms.includes(appInfo.platform)
	);
	const origin = entry ? new URL(entry.url).origin : MINI_APP_ORIGIN;
	const webViewRef = React.useRef<WebViewHandle>(null);
	const sendRef = React.useRef<(action: string, payload: object) => void>(() => undefined);
	const closingSentRef = React.useRef(false);
	const close = React.useCallback(
		(result: string) => {
			closingSentRef.current = true;
			sendRef.current('app.closing', { reason: 'user' });
			onClose(result);
		},
		[onClose]
	);
	const printerHandlers = usePrinterCapabilities();
	const hostHandlers = useHostCapabilities(close);
	const availableHandlers = { ...printerHandlers, ...hostHandlers };
	const granted = entry?.capabilities.filter((action) => action in availableHandlers) ?? [];
	const initPayload: AppInitPayload = {
		contract: '1.1',
		locale: locale.code,
		theme: { scheme: theme.toLowerCase().includes('dark') ? 'dark' : 'light', accent },
		platform: {
			os: appInfo.platform,
			osVersion: String(RNPlatform.Version ?? appInfo.platformVersion),
			appVersion: appInfo.appVersion,
			webview:
				appInfo.platform === 'ios'
					? 'wkwebview'
					: appInfo.platform === 'web'
						? detectWebEngine(navigator.userAgent)
						: 'chromium',
		},
		store: {
			id: store.id ?? store.localID ?? '',
			name: store.name ?? '',
			currency: store.currency ?? '',
			locale: store.locale ?? locale.locale,
			timezone: store.timezone ?? '',
		},
		capabilities: granted,
	};
	const handlers: BridgeHandlers = {
		...Object.fromEntries(granted.map((action) => [action, availableHandlers[action]])),
		'app.ready': async (payload) => {
			if (payload.miniApp !== id)
				throw new BridgeError('bad_request', 'Mini-app id does not match');
			return initPayload;
		},
	};
	const { onMessage, ready, reset, send } = useBridge(webViewRef, origin, handlers);
	const [attempt, setAttempt] = React.useState(0);
	const [failed, setFailed] = React.useState(false);
	const loadTimerRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

	// Keep the imperative sender current and notify the external page before host teardown.
	React.useEffect(() => {
		sendRef.current = send;
		return () => {
			clearTimeout(loadTimerRef.current);
			if (!closingSentRef.current) send('app.closing', { reason: 'navigation' });
		};
	}, [send]);
	// Arm from mount so a navigation that never loads still falls back; resetting readiness
	// after a later load re-arms this same deadline through the ready dependency.
	React.useEffect(() => {
		clearTimeout(loadTimerRef.current);
		if (ready) return;
		loadTimerRef.current = setTimeout(() => setFailed(true), READY_DEADLINE_MS);
		return () => clearTimeout(loadTimerRef.current);
	}, [attempt, ready]);

	const needsAppUpdate =
		!!entry &&
		(granted.length !== entry.capabilities.length ||
			!meetsMinAppVersion(entry, appInfo.appVersion));
	const content =
		!entry || needsAppUpdate || failed ? (
			<VStack className="flex-1 items-center justify-center gap-4 p-6">
				<Text className="text-center text-lg font-semibold">
					{needsAppUpdate
						? t('settings.printer_wizard_needs_update')
						: t('settings.printer_wizard_failed')}
				</Text>
				<Button
					variant="outline"
					onPress={() => {
						setFailed(false);
						setAttempt((value) => value + 1);
					}}
				>
					<Text>{t('common.retry')}</Text>
				</Button>
				<Button variant="secondary" onPress={() => close('cancelled')}>
					<Text>{t('settings.open_printer_settings')}</Text>
				</Button>
			</VStack>
		) : (
			<WebView
				key={attempt}
				ref={webViewRef}
				src={entry.url}
				targetOrigin={origin}
				originWhitelist={[origin]}
				className="flex-1"
				onMessage={onMessage}
				onLoad={() => {
					if (ready) reset();
				}}
				// Only the catalog origin may load inside a bridged view; anything else is refused.
				onShouldStartLoadWithRequest={(request: { url: string }) =>
					request.url.startsWith(`${origin}/`)
				}
				onError={() => setFailed(true)}
			/>
		);

	return (
		<Modal onClose={() => close('cancelled')}>
			<ModalContent testID="mini-app-host" size="xl" className="h-full">
				<ModalHeader>
					<ModalTitle>{entry?.title[locale.shortCode] ?? entry?.title.en ?? ''}</ModalTitle>
				</ModalHeader>
				<ModalBody contentContainerStyle={{ height: '100%' }}>
					<View className="flex-1">{content}</View>
				</ModalBody>
			</ModalContent>
		</Modal>
	);
}
