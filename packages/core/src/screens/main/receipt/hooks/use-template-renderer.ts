import * as React from 'react';

import Mustache from 'mustache';
import { useObservableEagerState } from 'observable-hooks';
import { of } from 'rxjs';

import { useOnlineStatus } from '@wcpos/hooks/use-online-status';

import { useActiveTemplates } from './use-active-templates';
import { useReceiptData } from './use-receipt-data';
import { buildReceiptData } from '../utils/build-receipt-data';
import { useAppState } from '../../../../contexts/app-state';

import type { ReceiptMode } from './use-receipt-data';
import type { TemplateDocument } from '@wcpos/database';
import type { ReceiptData } from '../utils/build-receipt-data';

interface UseTemplateRendererOptions {
	orderId: number | undefined;
	baseReceiptURL: string | undefined;
	mode: ReceiptMode;
}

interface TemplateRendererResult {
	templates: TemplateDocument[];
	selectedTemplateId: string | number | null;
	setSelectedTemplateId: (id: string | number) => void;
	renderedHtml: string | null;
	receiptUrl: string | null;
	receiptData: ReceiptData | Record<string, unknown> | null;
	isOffline: boolean;
}

export function useTemplateRenderer({
	orderId,
	baseReceiptURL,
	mode,
}: UseTemplateRendererOptions): TemplateRendererResult {
	const templates = useActiveTemplates();
	const { status } = useOnlineStatus();
	const { store } = useAppState();
	const isOffline = status !== 'online-website-available';

	// Get store data for offline receipt_data construction
	const storeName = useObservableEagerState(store.name$ ?? of(''));
	const storeAddress = useObservableEagerState(store.store_address$ ?? of(''));
	const storeCity = useObservableEagerState(store.store_city$ ?? of(''));
	const storeState = useObservableEagerState(store.store_state$ ?? of(''));
	const storePostcode = useObservableEagerState(store.store_postcode$ ?? of(''));
	const storeCountry = useObservableEagerState(store.store_country$ ?? of(''));
	const storePhone = useObservableEagerState(store.phone$ ?? of(''));
	const storeEmail = useObservableEagerState(store.email$ ?? of(''));

	const storeData = React.useMemo(
		() => ({
			name: storeName,
			store_address: storeAddress,
			store_city: storeCity,
			store_state: storeState,
			store_postcode: storePostcode,
			store_country: storeCountry,
			phone: storePhone,
			email: storeEmail,
		}),
		[storeName, storeAddress, storeCity, storeState, storePostcode, storeCountry, storePhone, storeEmail]
	);

	// Fetch receipt data from API (when online)
	const { data: apiReceiptData } = useReceiptData({ orderId, mode });

	// Default to the first template (or the one marked is_active)
	const defaultId = React.useMemo(() => {
		const active = templates.find((t) => t.is_active);
		return active?.id ?? templates[0]?.id ?? null;
	}, [templates]);

	const [selectedTemplateId, setSelectedTemplateId] = React.useState<string | number | null>(null);

	// Reset selection when templates load or order changes
	React.useEffect(() => {
		setSelectedTemplateId(defaultId);
	}, [defaultId, orderId]);

	const selectedTemplate = templates.find((t) => t.id === selectedTemplateId) ?? null;

	// Pre-render all Mustache templates into a cache
	const preRenderedCache = React.useMemo(() => {
		const cache = new Map<string | number, string>();
		const receiptData = apiReceiptData ?? null;
		if (!receiptData) return cache;

		for (const tmpl of templates) {
			if (tmpl.offline_capable && tmpl.content) {
				try {
					cache.set(tmpl.id, Mustache.render(tmpl.content, receiptData));
				} catch {
					// Skip templates with render errors
				}
			}
		}
		return cache;
	}, [templates, apiReceiptData]);

	// Determine output
	let renderedHtml: string | null = null;
	let receiptUrl: string | null = null;

	if (selectedTemplate?.offline_capable && selectedTemplate.content) {
		const cached = preRenderedCache.get(selectedTemplate.id);
		if (cached) {
			renderedHtml = cached;
		} else {
			const data = apiReceiptData;
			if (data && selectedTemplate.content) {
				try {
					renderedHtml = Mustache.render(selectedTemplate.content, data);
				} catch {
					renderedHtml = '<p>Template render error</p>';
				}
			}
		}
	} else if (selectedTemplate && baseReceiptURL) {
		try {
			const parsed = new URL(baseReceiptURL);
			parsed.searchParams.set('mode', mode);
			parsed.searchParams.set('template', String(selectedTemplate.id));
			receiptUrl = parsed.toString();
		} catch {
			const [beforeHash, hash = ''] = baseReceiptURL.split('#');
			const [pathname, query = ''] = beforeHash.split('?');
			const params = new URLSearchParams(query);
			params.set('mode', mode);
			params.set('template', String(selectedTemplate.id));
			const next = `${pathname}?${params.toString()}`;
			receiptUrl = hash ? `${next}#${hash}` : next;
		}
	}

	return {
		templates,
		selectedTemplateId: selectedTemplateId ?? defaultId,
		setSelectedTemplateId,
		renderedHtml,
		receiptUrl,
		receiptData: apiReceiptData,
		isOffline,
	};
}
