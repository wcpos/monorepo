import * as React from 'react';

import Mustache from 'mustache';

import { useOnlineStatus } from '@wcpos/hooks/use-online-status';
import type { OrderDocument, TemplateDocument } from '@wcpos/database';

import { useActiveTemplates } from './use-active-templates';
import { useReceiptData } from './use-receipt-data';
import { buildReceiptData } from '../utils/build-receipt-data';
import { useAppState } from '../../../../contexts/app-state';

import type { ReceiptData } from '../utils/build-receipt-data';
import type { ReceiptMode } from './use-receipt-data';

interface UseTemplateRendererOptions {
	orderDocument: OrderDocument;
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
	isSyncing: boolean;
}

export function useTemplateRenderer({
	orderDocument,
	orderId,
	baseReceiptURL,
	mode,
}: UseTemplateRendererOptions): TemplateRendererResult {
	const templates = useActiveTemplates();
	const { store } = useAppState();
	const { status } = useOnlineStatus();
	const isOffline = status !== 'online-website-available';

	// Build local receipt data immediately from RxDB documents
	const localReceiptData = React.useMemo(() => {
		if (!orderDocument || !store) return null;
		return buildReceiptData(orderDocument as Record<string, any>, store as Record<string, any>);
	}, [orderDocument, store]);

	// Fetch receipt data from API (when online)
	const { data: apiReceiptData, isLoading } = useReceiptData({ orderId, mode });

	// Use API data when available, fall back to local data
	const receiptData = apiReceiptData ?? localReceiptData;

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

	// Pre-render all Mustache templates into a cache
	const preRenderedCache = React.useMemo(() => {
		const cache = new Map<string | number, string>();
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
	}, [templates, receiptData]);

	// Determine output
	let renderedHtml: string | null = null;
	let receiptUrl: string | null = null;

	if (selectedTemplate?.offline_capable && selectedTemplate.content) {
		const cached = preRenderedCache.get(selectedTemplate.id);
		if (cached) {
			renderedHtml = cached;
		} else if (receiptData && selectedTemplate.content) {
			try {
				renderedHtml = Mustache.render(selectedTemplate.content, receiptData);
			} catch {
				renderedHtml = '<p>Template render error</p>';
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
		isOffline,
		isSyncing,
	};
}
