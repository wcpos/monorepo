import * as React from 'react';

import { useDocField } from '@wcpos/query';
import { getLogger } from '@wcpos/utils/logger';

import { useAppState } from '../../../../contexts/app-state';
import {
	type DisplayConfigInput,
	getCustomerDisplayService,
	getDeviceId,
	type HttpFunction,
	type HttpRequest,
	startCustomerDisplayService,
} from '../../../../services/customer-display';
import { useRestHttpClient } from '../../hooks/use-rest-http-client';
import { notifyCustomerDisplayServiceStart } from './customer-display-service-start';

const logger = getLogger(['wcpos', 'customer-display', 'hook']);
const WCPOS_V2_PREFIX = '/wcpos/v2/';

export function useCustomerDisplayService(): void {
	const { store, site } = useAppState();
	const restHttp = useRestHttpClient();
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

	const http = React.useCallback<HttpFunction>(
		async <T>(request: HttpRequest): Promise<{ data: T }> => {
			if (request.method === 'GET') {
				return (await restHttp.get(request.url, { params: request.params })) as { data: T };
			}
			if (request.method === 'POST') {
				return (await restHttp.post(request.url, request.data)) as { data: T };
			}
			return (await restHttp.delete(request.url)) as { data: T };
		},
		[restHttp]
	);

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
		const signaling = fields?.display?.signaling;
		if (!signaling) return;
		if (!signaling.startsWith(WCPOS_V2_PREFIX)) {
			logger.warn('Customer display signaling path is outside the WCPOS v2 API root', {
				context: { signaling },
			});
			return;
		}

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
				logger.warn('Customer display service failed to start', { context: { error } });
			});

		return () => {
			cancelled = true;
			startedService?.stop();
		};
	}, [fields?.display?.signaling, fields?.id, http, site, store]);

	React.useEffect(() => {
		if (fields?.display) getCustomerDisplayService()?.configure(config);
	}, [config, fields?.display]);
}
