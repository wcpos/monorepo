import * as React from 'react';

import Mustache from 'mustache';

import { useOnlineStatus } from '@wcpos/hooks/use-online-status';
import {
	markAwaitingStore,
	markAwaitingStoreXml,
} from '@wcpos/printer/encoder/mark-awaiting-store';
import { type PreviewTemplateEngine, renderPreview } from '@wcpos/printer/encoder/render-preview';
import { loadBarcodeLibrary } from '@wcpos/receipt-renderer/barcode-library';
import type { ActiveTemplate } from '@wcpos/query';
import { useDocField } from '@wcpos/query';

import { useLocale } from '../../../../hooks/use-locale';
import { useStoreDay } from '../../../../hooks/use-store-day';
import { formatClosureDate } from '../../../../services/register-session/closure-document';
import { useRegister } from '../../../../services/register/use-register';
import { useActiveTemplatesState } from './use-active-templates';
import { useBarcodeLibrary } from './use-barcode-library';
import { useReceiptData } from './use-receipt-data';
import { buildReceiptData } from '../utils/build-receipt-data';
import { useAppState } from '../../../../contexts/app-state';
import { useTaxSettingsOptional } from '../../contexts/tax-rates/provider';
import { resolvePriceNumDecimals } from '../../contexts/tax-rates/resolve-price-num-decimals';
import { useOrderStatusLabel } from '../../hooks/use-order-status-label';

import type { ReceiptData } from '../utils/build-receipt-data';
import type { ClosurePrintMarker, ReceiptMode } from './use-receipt-data';

// Bounds how long auto-print and the syncing state may wait for the receipts API —
// a hung fetch must never leave the cashier unable to print.
const RECEIPT_SETTLE_DEADLINE_MS = 8000;

// Mirrors the plugin report-default.html: figures remain readable before templates arrive.
// Paper, not UI: named colours keep it out of the app's hex ratchet; black rules print as rules.
const FALLBACK_REPORT_TEMPLATE = `<article style="font-family: sans-serif; padding: 24px; print-color-adjust: exact; -webkit-print-color-adjust: exact;">
{{#fiscal.is_report_document}}
  <h1>{{report.title}}</h1>
  {{#report.subtitle}}<h2>{{report.subtitle}}</h2>{{/report.subtitle}}
  <p>{{store.name}} · {{report.scope.label}}</p>
  {{#report.is_partial}}<p role="alert"><strong>{{report.partial_reason}}</strong></p>{{/report.is_partial}}
  <table style="width: 100%; border-collapse: collapse;">
    <thead><tr>{{#report.columns}}<th style="text-align: {{align}}; border-bottom: 1px solid black; padding: 8px;">{{label}}</th>{{/report.columns}}</tr></thead>
    <tbody>
      {{#report.has_groups}}{{#report.groups}}
      <tr><th colspan="{{report.column_count}}" style="text-align: left; padding: 8px;">{{label}}</th></tr>
      {{#rows}}<tr>{{#cells}}<td style="padding: 8px; text-align: {{align}};">{{formatted}}</td>{{/cells}}</tr>{{/rows}}
      <tr>{{#subtotal.cells}}<td style="padding: 8px; border-top: 1px solid gainsboro; text-align: {{align}};"><strong>{{formatted}}</strong></td>{{/subtotal.cells}}</tr>
      {{/report.groups}}{{/report.has_groups}}
      {{^report.has_groups}}{{#report.rows}}<tr>{{#cells}}<td style="padding: 8px; text-align: {{align}};">{{formatted}}</td>{{/cells}}</tr>{{/report.rows}}{{/report.has_groups}}
    </tbody>
    <tfoot><tr>{{#report.totals.cells}}<td style="padding: 8px; border-top: 2px solid black; text-align: {{align}};"><strong>{{formatted}}</strong></td>{{/report.totals.cells}}</tr></tfoot>
  </table>
  <p>{{report.generated_at.datetime}}</p>
  <footer>{{software.name}} {{software.plugin_version}}</footer>
{{/fiscal.is_report_document}}
</article>`;

function resolvePreviewEngine(engine: string | null | undefined): PreviewTemplateEngine {
	if (engine == null || engine === 'logicless') {
		return 'logicless';
	}
	if (engine === 'thermal') {
		return 'thermal';
	}
	throw new Error(`Unsupported template engine: ${engine}`);
}

export function renderOfflineTemplatePreview({
	engine,
	content,
	receiptData,
}: {
	engine: string | null | undefined;
	content: string;
	receiptData: Record<string, unknown>;
}): string {
	const result = renderPreview({
		template: content,
		engine: resolvePreviewEngine(engine),
		data: receiptData,
	});
	return result.html;
}

interface UseTemplateRendererOptions {
	nextLocalClosureCount?: () => Promise<number>;
	isReprint?: boolean;
	templateType?: 'receipt' | 'report' | 'closure';
	storeId?: number;
	previewEnabled?: boolean;
	orderId: number | undefined;
	orderUuid?: string;
	baseReceiptURL: string | undefined;
	mode: ReceiptMode;
	document?: string;
	documentReady?: boolean;
	localReport?: Record<string, unknown>;
	formatReport?: (data: Record<string, unknown>) => Record<string, unknown>;
	/** The RxDB order document — used to build local receipt data when offline */
	order: Record<string, any> | undefined;
	/** Never the store's page or receipts API: offline, or a sale the store has not heard. */
	localOnly?: boolean;
	/** The store has not heard this sale yet: the till's line to show first, else null. */
	awaitingStoreLine?: string | null;
}

interface TemplateRendererResult {
	documentError: Error | null;
	refetch: () => void;
	serverReceiptData: Record<string, unknown> | null;
	templates: ActiveTemplate[];
	templatesReady: boolean;
	/** The template sync has settled: an empty list now means the store has no template. */
	templatesSynced: boolean;
	selectedTemplateId: string | number | null;
	setSelectedTemplateId: (id: string | number) => void;
	renderedHtml: string | null;
	receiptUrl: string | null;
	receiptData: ReceiptData | Record<string, unknown> | null;
	selectedTemplateEngine: string | null;
	selectedTemplateContent: string | null;
	isOffline: boolean;
	isSyncing: boolean;
	hasFinalData: boolean;
	preparePrintContent: (nextLocalPrintCount: () => Promise<number>) => Promise<{
		receiptData: ReceiptData | Record<string, unknown>;
		html?: string;
		commit?: () => Promise<ClosurePrintMarker | undefined>;
	}>;
	/** `receiptData` is the server's receipt, not the local fallback built from the order. */
	receiptDataIsServer: boolean;
}

export function useTemplateRenderer({
	nextLocalClosureCount,
	orderId,
	orderUuid,
	baseReceiptURL,
	mode: requestedMode,
	document,
	documentReady = true,
	isReprint = false,
	localReport,
	formatReport,
	order,
	templateType,
	storeId,
	previewEnabled = true,
	localOnly,
	awaitingStoreLine = null,
}: UseTemplateRendererOptions): TemplateRendererResult {
	const barcodesReady = useBarcodeLibrary();
	const { templates: activeTemplates, synced } = useActiveTemplatesState(
		templateType ?? (localReport ? 'report' : 'receipt'),
		storeId
	);
	const localDocument = !!localReport && !orderId && !document;
	const templates = React.useMemo(
		() =>
			localDocument
				? // Only a template the local render path will accept (l.249, 271): capable and with content.
					activeTemplates.filter((template) => !!template.offline_capable && !!template.content)
				: activeTemplates,
		[activeTemplates, localDocument]
	);
	const mode = document ? 'fiscal' : requestedMode;
	const { store, site } = useAppState();
	const { timezone } = useStoreDay(storeId);
	const { code: locale } = useLocale();
	const register = useRegister();
	const pluginVersion = useDocField(site, (value) => value.wcpos_version);
	const taxRates = useTaxSettingsOptional();
	const storeDp = useDocField(store, (value) => value.wc_price_decimals) as number | undefined;
	const dp = resolvePriceNumDecimals({
		contextDp: taxRates?.priceNumDecimals,
		storeDp,
	});
	// Subscribed (not read off the stable `store` identity inside the memo) so a
	// sync that delivers the dictionary mid-screen re-renders the fallback.
	const receiptI18n = useDocField(store, (value) => value.receipt_i18n) as
		Record<string, string> | undefined;
	const { status } = useOnlineStatus();
	// ADR 0040 Decided 1 rule 1: the receipt document decides (its one local-only rule).
	const isOffline = localOnly ?? status !== 'online-website-available';
	if (templateType === 'closure' && !isOffline && site?.url) {
		const url = new URL(site.url);
		url.searchParams.set('wcpos-receipt', '0');
		baseReceiptURL = url.toString();
	}
	const { getLabel: getStatusLabel } = useOrderStatusLabel();

	// Fetch receipt data from API (when online)
	const {
		data: apiReceiptData,
		error: documentError,
		hasResponded,
		refetch,
		isLoading,
		fetchForPrint,
		commitPrint,
	} = useReceiptData({
		nextLocalCount: nextLocalClosureCount,
		previewEnabled,
		orderId: isOffline ? undefined : orderId,
		mode,
		isReprint,
		document: isOffline || !documentReady ? undefined : document,
	});
	// The deadline record is kept together with the order it was armed for; a
	// stale record from a previous order derives to "not passed" without any
	// synchronous reset in the effect (same pattern as the template pick below).
	const [deadline, setDeadline] = React.useState<{
		orderId: number | undefined;
		passed: boolean;
	}>({ orderId, passed: false });
	React.useEffect(() => {
		const timer = setTimeout(
			() => setDeadline({ orderId, passed: true }),
			RECEIPT_SETTLE_DEADLINE_MS
		);
		return () => clearTimeout(timer);
	}, [orderId]);
	const deadlinePassed = deadline.orderId === orderId && deadline.passed;
	const hasFinalData = isOffline || orderId == null || hasResponded || deadlinePassed;

	// Fall back to locally-built receipt data when the API response is unavailable
	const receiptData = React.useMemo(() => {
		if (!isOffline && apiReceiptData)
			return formatReport ? formatReport(apiReceiptData) : apiReceiptData;
		if (document || localDocument) return localReport ?? null;
		if (order && store) {
			return buildReceiptData(order, store, dp, {
				getStatusLabel,
				receiptI18n,
				register,
				pluginVersion,
			});
		}
		return null;
	}, [
		apiReceiptData,
		localReport,
		localDocument,
		formatReport,
		document,
		isOffline,
		order,
		store,
		dp,
		getStatusLabel,
		receiptI18n,
		register,
		pluginVersion,
	]);

	// Syncing: API fetch is in flight and we're still showing local data
	const isSyncing = isLoading && !apiReceiptData && !deadlinePassed;

	// Default to the first template (or the one marked is_active)
	const defaultId = React.useMemo(() => {
		const active = templates.find((t) => t.is_active);
		return active?.id ?? templates[0]?.id ?? null;
	}, [templates]);

	// Track the user's explicit pick together with the order it was made for.
	// When the order changes the pick no longer applies, so the effective
	// selection falls back to the default - derived during render, no effect.
	const orderKey = orderUuid ?? orderId;
	const [pick, setPick] = React.useState<{
		orderKey: string | number | undefined;
		id: string | number | null;
	}>({ orderKey, id: null });

	const setSelectedTemplateId = React.useCallback(
		(id: string | number) => {
			setPick({ orderKey, id });
		},
		[orderKey]
	);

	// The pick is only honoured for the current order and an existing template.
	const pickedId =
		pick.orderKey === orderKey && templates.some((t) => t.id === pick.id) ? pick.id : null;
	const selectedTemplateId = pickedId ?? defaultId;

	const selectedTemplate = templates.find((t) => t.id === selectedTemplateId) ?? null;

	// The awaiting-store line goes first in the preview and the dialog print (ADR 0040 Decided 1
	// rule 1): inside a thermal template's XML, before the rendered HTML otherwise. A thermal
	// printer gets it from `usePrint`, on every path.
	const renderTemplate = React.useCallback(
		(template: { engine?: string | null; content: string }, data: Record<string, unknown>) => {
			const thermal = template.engine === 'thermal';
			const html = renderOfflineTemplatePreview({
				engine: template.engine,
				content:
					awaitingStoreLine !== null && thermal
						? markAwaitingStoreXml(template.content, awaitingStoreLine)
						: template.content,
				receiptData: data,
			});
			return awaitingStoreLine !== null && !thermal
				? markAwaitingStore(html, awaitingStoreLine)
				: html;
		},
		[awaitingStoreLine]
	);

	// Pre-render all offline-capable templates into a cache
	const preRenderedCache = React.useMemo(() => {
		const cache = new Map<string | number, string>();
		if (!receiptData) return cache;

		for (const tmpl of templates) {
			if (tmpl.offline_capable && tmpl.content) {
				try {
					cache.set(
						tmpl.id,
						renderTemplate(
							{ engine: tmpl.engine, content: tmpl.content },
							receiptData as Record<string, unknown>
						)
					);
				} catch {
					// Skip templates with render errors
				}
			}
		}
		return cache;
	}, [templates, receiptData, barcodesReady, renderTemplate]);

	const reportContent =
		templateType === 'report'
			? FALLBACK_REPORT_TEMPLATE
			: localReport && templateType !== 'closure'
				? '<h1>{{title}}</h1><p>{{order_number}}</p>{{#line_items}}<p>{{name}}: {{amount}}</p>{{/line_items}}<p>{{footer}}</p>'
				: undefined;
	const useReportFallback =
		templateType === 'report' && (!selectedTemplate || !preRenderedCache.get(selectedTemplate.id));

	// Determine output
	let renderedHtml: string | null = null;
	let receiptUrl: string | null = null;

	if (useReportFallback && receiptData) {
		renderedHtml = Mustache.render(FALLBACK_REPORT_TEMPLATE, receiptData);
	} else if (selectedTemplate?.offline_capable && selectedTemplate.content) {
		const cached = preRenderedCache.get(selectedTemplate.id);
		if (cached) {
			renderedHtml = cached;
		} else {
			const data = receiptData;
			if (data && selectedTemplate.content) {
				try {
					renderedHtml = renderTemplate(
						{ engine: selectedTemplate.engine, content: selectedTemplate.content },
						data as Record<string, unknown>
					);
				} catch {
					renderedHtml = '<p>Template render error</p>';
				}
			}
		}
	} else if (baseReceiptURL && (selectedTemplate || document) && (!document || receiptData)) {
		try {
			const parsed = new URL(baseReceiptURL);
			parsed.searchParams.set('mode', mode);
			if (document) parsed.searchParams.set('document', document);
			if (selectedTemplate) parsed.searchParams.set('template', String(selectedTemplate.id));
			receiptUrl = parsed.toString();
		} catch {
			const [beforeHash, hash = ''] = baseReceiptURL.split('#');
			const [pathname, query = ''] = beforeHash.split('?');
			const params = new URLSearchParams(query);
			params.set('mode', mode);
			if (document) params.set('document', document);
			if (selectedTemplate) params.set('template', String(selectedTemplate.id));
			const next = `${pathname}?${params.toString()}`;
			receiptUrl = hash ? `${next}#${hash}` : next;
		}
	}

	if (!renderedHtml && reportContent && receiptData)
		renderedHtml = Mustache.render(reportContent, receiptData);
	const preparePrintContent = async (nextLocalPrintCount: () => Promise<number>) => {
		const buildLocal = async () =>
			order && store
				? buildReceiptData(order, store, dp, {
						getStatusLabel,
						receiptI18n,
						register,
						pluginVersion,
						printCount: await nextLocalPrintCount(),
					})
				: null;
		// Online: the server counts and marks (even if the preview fetch failed or timed
		// out). Only when the print fetch itself fails does the local counter take over.
		let data: ReceiptData | Record<string, unknown> | null = null;
		if (!isOffline && documentReady && (orderId || document)) {
			try {
				const remote = await fetchForPrint();
				data = remote && formatReport ? formatReport(remote) : remote;
			} catch (error) {
				if (document?.startsWith('closure:')) throw error;
				data = null;
			}
		}
		if (!data && localReport && document?.startsWith('xreport:')) {
			data = {
				...localReport,
				order: {
					...(localReport.order as object),
					printed: formatClosureDate(new Date().toISOString(), { timezone, locale }),
				},
			};
		}
		if (document && !data && ((documentReady && !isOffline) || !localReport))
			throw new Error('receipt_document_requires_store');
		if (!data && localReport && document?.startsWith('closure:')) {
			const count = await nextLocalPrintCount();
			const printedAt = new Date().toISOString();
			data = {
				...localReport,
				order: {
					...(localReport.order as object),
					printed: formatClosureDate(printedAt, { timezone, locale }),
				},
				closure: {
					...(localReport.closure as object),
					print_count: count,
					last_printed_at_gmt: printedAt,
				},
				fiscal: {
					...(localReport.fiscal as object),
					is_reprint: isReprint || count > 1,
					reprint_count: Math.max(0, count - 1),
				},
			};
		}
		data ??= localReport ?? null;
		data ??= await buildLocal();
		if (!data) throw new Error('No receipt data available for printing');
		await loadBarcodeLibrary().catch(() => undefined);
		return {
			receiptData: data,
			...(!isOffline && documentReady && document?.startsWith('closure:')
				? { commit: commitPrint }
				: {}),
			html:
				!useReportFallback && selectedTemplate?.offline_capable && selectedTemplate.content
					? renderTemplate(
							{ engine: selectedTemplate.engine, content: selectedTemplate.content },
							data as Record<string, unknown>
						)
					: reportContent
						? Mustache.render(reportContent, data)
						: undefined,
		};
	};

	return {
		documentError,
		refetch,
		preparePrintContent,
		serverReceiptData: isOffline ? null : apiReceiptData,
		templates,
		templatesReady: !localDocument || isOffline || synced,
		templatesSynced: synced,
		selectedTemplateId,
		setSelectedTemplateId,
		renderedHtml,
		receiptUrl,
		receiptData,
		selectedTemplateEngine: useReportFallback
			? 'logicless'
			: selectedTemplate?.offline_capable
				? (selectedTemplate.engine ?? null)
				: reportContent
					? 'thermal'
					: (selectedTemplate?.engine ?? null),
		selectedTemplateContent: useReportFallback
			? FALLBACK_REPORT_TEMPLATE
			: selectedTemplate?.offline_capable
				? (selectedTemplate.content ?? null)
				: reportContent
					? '<receipt><text>{{store.name}}</text><text>{{order.number}}</text>{{#lines}}<text>{{name}}</text>{{/lines}}<text>{{order.customer_note}}</text><feed lines="3"/><cut/></receipt>'
					: (selectedTemplate?.content ?? null),
		isOffline,
		isSyncing,
		hasFinalData,
		receiptDataIsServer: !isOffline && apiReceiptData != null,
	};
}
