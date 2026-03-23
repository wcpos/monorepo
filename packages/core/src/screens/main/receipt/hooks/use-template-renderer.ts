import * as React from 'react';

import Mustache from 'mustache';

import { useOnlineStatus } from '@wcpos/hooks/use-online-status';
import { formatReceiptData, mapReceiptData, renderThermalPreview } from '@wcpos/printer';
import type { TemplateDocument } from '@wcpos/database';

import { useActiveTemplates } from './use-active-templates';
import { useReceiptData } from './use-receipt-data';
import { buildReceiptData } from '../utils/build-receipt-data';
import { useAppState } from '../../../../contexts/app-state';

import type { ReceiptData } from '../utils/build-receipt-data';
import type { ReceiptMode } from './use-receipt-data';

interface UseTemplateRendererOptions {
	orderId: number | undefined;
	baseReceiptURL: string | undefined;
	mode: ReceiptMode;
	/** The RxDB order document — used to build local receipt data when offline */
	order: Record<string, any> | undefined;
}

interface TemplateRendererResult {
	templates: TemplateDocument[];
	selectedTemplateId: string | number | null;
	setSelectedTemplateId: (id: string | number) => void;
	renderedHtml: string | null;
	receiptUrl: string | null;
	receiptData: ReceiptData | Record<string, unknown> | null;
	selectedTemplateEngine: string | null;
	selectedTemplateContent: string | null;
	isOffline: boolean;
	isSyncing: boolean;
}

export function useTemplateRenderer({
	orderId,
	baseReceiptURL,
	mode,
	order,
}: UseTemplateRendererOptions): TemplateRendererResult {
	const templates = useActiveTemplates();
	const { store } = useAppState();
	const { status } = useOnlineStatus();
	const isOffline = status !== 'online-website-available';

	// Fetch receipt data from API (when online)
	const { data: apiReceiptData, isLoading } = useReceiptData({ orderId, mode });

	// Fall back to locally-built receipt data when the API response is unavailable
	const receiptData = React.useMemo(() => {
		if (apiReceiptData) return apiReceiptData;
		if (order && store) {
			return buildReceiptData(order, store);
		}
		return null;
	}, [apiReceiptData, order, store]);

	// Syncing: API fetch is in flight and we're still showing local data
	const isSyncing = isLoading && !apiReceiptData;

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

	// Pre-render all offline-capable templates into a cache
	// Normalise receipt data so thermal preview uses the same shape as thermal printing
	const normalisedReceiptData = React.useMemo(
		() => (receiptData ? mapReceiptData(receiptData as Record<string, any>) : null),
		[receiptData]
	);

	// Format currency fields so the preview matches the printed ESC/POS output
	const formattedReceiptData = React.useMemo(
		() => (normalisedReceiptData ? formatReceiptData(normalisedReceiptData as any) : null),
		[normalisedReceiptData]
	);

	const preRenderedCache = React.useMemo(() => {
		const cache = new Map<string | number, string>();
		if (!receiptData) return cache;

		for (const tmpl of templates) {
			if (tmpl.offline_capable && tmpl.content) {
				try {
					if (tmpl.engine === 'thermal') {
						const thermalData = formattedReceiptData ?? normalisedReceiptData ?? receiptData;
						cache.set(
							tmpl.id,
							renderThermalPreview(tmpl.content, thermalData as Record<string, any>)
						);
					} else {
						cache.set(tmpl.id, Mustache.render(tmpl.content, receiptData));
					}
				} catch {
					// Skip templates with render errors
				}
			}
		}
		return cache;
	}, [templates, receiptData, normalisedReceiptData, formattedReceiptData]);

	// Determine output
	let renderedHtml: string | null = null;
	let receiptUrl: string | null = null;

	if (selectedTemplate?.offline_capable && selectedTemplate.content) {
		const cached = preRenderedCache.get(selectedTemplate.id);
		if (cached) {
			renderedHtml = cached;
		} else {
			const data = receiptData;
			if (data && selectedTemplate.content) {
				try {
					if (selectedTemplate.engine === 'thermal') {
						const thermalData = formattedReceiptData ?? normalisedReceiptData ?? data;
						renderedHtml = renderThermalPreview(
							selectedTemplate.content,
							thermalData as Record<string, any>
						);
					} else {
						renderedHtml = Mustache.render(selectedTemplate.content, data);
					}
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
		receiptData,
		selectedTemplateEngine: selectedTemplate?.engine ?? null,
		selectedTemplateContent: selectedTemplate?.content ?? null,
		isOffline,
		isSyncing,
	};
}
