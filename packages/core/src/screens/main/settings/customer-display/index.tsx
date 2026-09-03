import * as React from 'react';

import { DocsLink } from '@wcpos/components/docs-link';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import { useDocField } from '@wcpos/query';

import { OpenSecondScreen } from './open-second-screen';
import { PairedDisplays } from './paired-displays';
import { PairingCode } from './pairing-code';
import { useStoreSession } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import {
	type CustomerDisplayService,
	type CustomerDisplayState,
	getCustomerDisplayService,
} from '../../../../services/customer-display';
import {
	getCustomerDisplayServiceStartVersion,
	subscribeCustomerDisplayServiceStart,
} from '../../pos/customer-display/customer-display-service-start';

const DOCS_URL = 'https://docs.wcpos.com/customer-display';
const EMPTY_STATE: CustomerDisplayState = { displays: [], pairingCode: null };

function createServiceStore(service: CustomerDisplayService | null) {
	let snapshot = { state: service?.getState() ?? EMPTY_STATE, observedAt: 0 };
	const update = () => {
		snapshot = { state: service?.getState() ?? EMPTY_STATE, observedAt: Date.now() };
	};
	return {
		subscribe(listener: () => void) {
			const unsubscribe = service?.subscribe(() => {
				update();
				listener();
			});
			update();
			return unsubscribe ?? (() => undefined);
		},
		getSnapshot: () => snapshot,
	};
}

function hostPageUrl(siteUrl: string, useRestRouteParam: boolean): string {
	const root = siteUrl.endsWith('/') ? siteUrl : `${siteUrl}/`;
	return useRestRouteParam ? `${root}?wcpos-display=1` : `${root}wcpos-display/`;
}

function AdvertisedSettings({ url }: { url: string }) {
	React.useSyncExternalStore(
		subscribeCustomerDisplayServiceStart,
		getCustomerDisplayServiceStartVersion,
		getCustomerDisplayServiceStartVersion
	);
	const service = getCustomerDisplayService();
	// Opening settings is an explicit request for the latest registry state; polling remains service-owned.
	React.useEffect(() => {
		void service?.refreshDisplays().catch(() => undefined);
	}, [service]);
	const store = React.useMemo(() => createServiceStore(service), [service]);
	const { state, observedAt } = React.useSyncExternalStore(
		store.subscribe,
		store.getSnapshot,
		store.getSnapshot
	);

	return (
		<VStack className="gap-5">
			<PairingCode
				disabled={!service}
				observedAt={observedAt}
				pairingCode={state.pairingCode}
				url={url}
				onMint={() => service?.mintPairingCode() ?? Promise.resolve(null)}
			/>
			<PairedDisplays
				displays={state.displays}
				observedAt={observedAt}
				onForget={(id) => service?.forget(id) ?? Promise.resolve()}
			/>
			<OpenSecondScreen url={url} />
		</VStack>
	);
}

export function CustomerDisplaySettings() {
	const t = useT();
	const { store, site } = useStoreSession();
	const advertised = useDocField(store, (value) => !!value.display);
	const siteFields = useDocField(site, (value) => ({
		url: value.url,
		useRestRouteParam: value.use_rest_route_param === true,
	}));

	if (!advertised) {
		return (
			<VStack testID="customer-display-not-advertised" className="items-start gap-2">
				<Text>{t('settings.customer_display.requires_pro')}</Text>
				<DocsLink testID="customer-display-docs-link" href={DOCS_URL}>
					{t('settings.customer_display.learn_more')}
				</DocsLink>
			</VStack>
		);
	}

	return (
		<AdvertisedSettings
			url={hostPageUrl(siteFields?.url ?? '', siteFields?.useRestRouteParam ?? false)}
		/>
	);
}
