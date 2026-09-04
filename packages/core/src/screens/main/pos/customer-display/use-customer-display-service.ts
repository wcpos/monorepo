import * as React from 'react';

import { useDocField } from '@wcpos/query';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';

import { useAppState } from '../../../../contexts/app-state';
import {
	type DisplayConfigInput,
	getCustomerDisplayService,
	getDeviceId,
	type HttpFunction,
	type HttpRequest,
	isSupportedDisplayAdvertisement,
	startCustomerDisplayService,
	stopCustomerDisplayService,
} from '../../../../services/customer-display';
import { useRestHttpClient } from '../../hooks/use-rest-http-client';
import { notifyCustomerDisplayServiceStart } from './customer-display-service-start';

const logger = getLogger(['wcpos', 'customer-display', 'hook']);
const WCPOS_V2_PREFIX = '/wcpos/v2/';

export function useCustomerDisplayService(): void {
	const { store, site } = useAppState();
	const restHttp = useRestHttpClient();
	const latestRestHttpRef = React.useRef(restHttp);
	const serviceHttpRef = React.useRef<{
		store: typeof store;
		site: typeof site;
		client: typeof restHttp;
	} | null>(null);
	// Refresh only the client bound to the current store/site before passive service effects run.
	React.useLayoutEffect(() => {
		latestRestHttpRef.current = restHttp;
		const binding = serviceHttpRef.current;
		if (binding && binding.store === store && binding.site === site) binding.client = restHttp;
	}, [restHttp, site, store]);
	const fields = useDocField(store, (value) => ({
		display: value.display,
		id: value.id,
		name: value.name,
		currency: value.currency,
		locale: value.locale,
		timezone: value.timezone,
		taxDisplayCart: value.tax_display_cart,
		pricesIncludeTax: value.prices_include_tax,
		receiptI18n: value.receipt_i18n,
	}));
	const hasDisplay = Boolean(fields?.display);
	const displayContract = fields?.display?.contract;
	const displaySignaling = fields?.display?.signaling;

	const locale = fields?.locale || 'en_US';
	const config: DisplayConfigInput = React.useMemo(
		() => ({
			store: {
				id: fields?.id ?? 0,
				name: fields?.name ?? '',
				currency: fields?.currency ?? '',
				locale,
				...(fields?.timezone ? { timezone: fields.timezone } : {}),
			},
			presentation_hints: {
				display_tax: fields?.taxDisplayCart === 'incl' ? 'incl' : 'excl',
				prices_entered_with_tax:
					fields?.pricesIncludeTax === 'yes' || fields?.pricesIncludeTax === true,
				rounding_mode: 'round',
				locale,
			},
			i18n: fields?.receiptI18n ?? {},
		}),
		[fields, locale]
	);
	const configRef = React.useRef(config);
	React.useLayoutEffect(() => {
		configRef.current = config;
	}, [config]);

	React.useEffect(() => {
		if (!hasDisplay) return;
		const display = { contract: displayContract, signaling: displaySignaling };
		if (!isSupportedDisplayAdvertisement(display)) {
			logger.warn('Unsupported customer display advertisement', {
				context: { contract: display?.contract },
			});
			return;
		}
		const { signaling } = display;
		const httpBinding = { store, site, client: latestRestHttpRef.current };
		serviceHttpRef.current = httpBinding;
		const http: HttpFunction = async <T>(request: HttpRequest): Promise<{ data: T }> => {
			const client = httpBinding.client;
			if (request.method === 'GET') {
				return (await client.get(request.url, { params: request.params })) as { data: T };
			}
			if (request.method === 'POST') {
				return (await client.post(request.url, request.data)) as { data: T };
			}
			return (await client.delete(request.url)) as { data: T };
		};

		let cancelled = false;
		let startedService: ReturnType<typeof startCustomerDisplayService> | null = null;
		void getDeviceId()
			.then((deviceId) => {
				if (cancelled) return;
				startedService = startCustomerDisplayService({
					http,
					deviceId,
					storeId: fields.id ?? 0,
					siteRestRoot: signaling.slice(WCPOS_V2_PREFIX.length),
				});
				startedService.configure(configRef.current);
				notifyCustomerDisplayServiceStart();
			})
			.catch((error) => {
				logger.warn('Customer display service failed to start', {
					context: { error: getErrorMessage(error) },
				});
			});

		return () => {
			cancelled = true;
			if (serviceHttpRef.current === httpBinding) serviceHttpRef.current = null;
			if (startedService && getCustomerDisplayService() === startedService) {
				stopCustomerDisplayService();
			}
		};
	}, [displayContract, displaySignaling, fields?.id, hasDisplay, site, store]);

	React.useEffect(() => {
		if (fields?.display) getCustomerDisplayService()?.configure(config);
	}, [config, fields?.display]);
}
