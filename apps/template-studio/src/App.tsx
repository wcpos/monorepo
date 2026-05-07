import React from 'react';

import { sanitizeHtml } from '@wcpos/receipt-renderer';
import type { ThermalBarcodeImages, ThermalImageAssets } from '@wcpos/receipt-renderer';

import { CollapsibleSection } from './components/CollapsibleSection';
import { DataSection } from './components/sections/DataSection';
import { PrintSection } from './components/sections/PrintSection';
import { WooCommerceSection } from './components/sections/WooCommerceSection';
import { Stage } from './components/Stage';
import { TemplateList } from './components/TemplateList';
import { Toolbar } from './components/Toolbar';
import { ARRAY_DEFAULTS } from './lib/field-meta';
import { getAtPath, removeAtPath, setAtPath } from './lib/path-utils';
import {
	loadThermalLogoAsset,
	maxDotsForPaperWidth,
	renderThermalBarcodeAsset,
} from './lib/thermal-image-assets';
import { createRandomReceipt, createRandomSeed, formatSeed } from './randomizer';
import {
	applyScenarioState,
	createScenarioState,
	mergeScenarioOverrides,
	toggleScenarioOverride,
} from './scenario-controls';
import { fetchBundledTemplates } from './studio-api';
import { renderStudioTemplate, selectVisibleTemplate } from './studio-core';

import type { PathSegment } from './lib/path-utils';
import type { ScenarioKey } from './scenario-controls';
import type { PaperWidth, StudioTemplate, TemplateEngine } from './studio-core';

const SECTION_STORAGE_KEY = 'wcpos-template-studio:sections';
const SELECTION_STORAGE_KEY = 'wcpos-template-studio:selection';

type SectionKey = 'data' | 'woocommerce' | 'print';

type SectionState = Record<SectionKey, boolean>;

const DEFAULT_SECTION_STATE: SectionState = { data: true, woocommerce: true, print: true };

function loadSectionState(): SectionState {
	if (typeof window === 'undefined') return DEFAULT_SECTION_STATE;
	try {
		const raw = window.localStorage.getItem(SECTION_STORAGE_KEY);
		if (!raw) return DEFAULT_SECTION_STATE;
		return { ...DEFAULT_SECTION_STATE, ...(JSON.parse(raw) as Partial<SectionState>) };
	} catch {
		return DEFAULT_SECTION_STATE;
	}
}

function loadSelection(): string {
	if (typeof window === 'undefined') return '';
	try {
		return window.localStorage.getItem(SELECTION_STORAGE_KEY) ?? '';
	} catch {
		return '';
	}
}

function defaultPaperWidth(engine: TemplateEngine | undefined): PaperWidth {
	return engine === 'thermal' ? '80mm' : 'a4';
}

export function App() {
	const [templates, setTemplates] = React.useState<StudioTemplate[]>([]);
	const [selectedTemplateId, setSelectedTemplateId] = React.useState(() => loadSelection());
	const [zoom, setZoom] = React.useState(100);
	const [seed, setSeed] = React.useState<number | string>('default');
	const [scenarioOverrides, setScenarioOverrides] = React.useState<
		Partial<Record<ScenarioKey, boolean>>
	>({});
	const [sections, setSections] = React.useState<SectionState>(() => loadSectionState());
	const [printerModel, setPrinterModel] = React.useState('');
	const [language, setLanguage] = React.useState<'esc-pos' | 'star-prnt' | 'star-line'>('esc-pos');
	const [error, setError] = React.useState<string | null>(null);
	const previewFrameRef = React.useRef<HTMLDivElement>(null);

	React.useEffect(() => {
		fetchBundledTemplates()
			.then((loaded) => {
				setTemplates(loaded);
				setSelectedTemplateId((current) => {
					if (current && loaded.some((template) => template.id === current)) return current;
					return loaded[0]?.id ?? '';
				});
			})
			.catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
	}, []);

	React.useEffect(() => {
		if (typeof window === 'undefined') return;
		try {
			window.localStorage.setItem(SECTION_STORAGE_KEY, JSON.stringify(sections));
		} catch {
			/* storage may be disabled */
		}
	}, [sections]);

	React.useEffect(() => {
		if (typeof window === 'undefined' || !selectedTemplateId) return;
		try {
			window.localStorage.setItem(SELECTION_STORAGE_KEY, selectedTemplateId);
		} catch {
			/* storage may be disabled */
		}
	}, [selectedTemplateId]);

	const selectedTemplate = selectVisibleTemplate(templates, selectedTemplateId);
	const randomReceipt = React.useMemo(() => createRandomReceipt({ seed }), [seed]);
	const baseScenarioState = React.useMemo(
		() => createScenarioState(randomReceipt.scenarios, randomReceipt.data),
		[randomReceipt]
	);
	const scenarioState = React.useMemo(
		() => mergeScenarioOverrides(baseScenarioState, scenarioOverrides),
		[baseScenarioState, scenarioOverrides]
	);
	const pristineReceiptData = React.useMemo(
		() => applyScenarioState(randomReceipt.data, scenarioState),
		[randomReceipt.data, scenarioState]
	);
	const pristineData = React.useMemo(
		() => pristineReceiptData as unknown as Record<string, unknown>,
		[pristineReceiptData]
	);
	const [workingData, setWorkingData] = React.useState<Record<string, unknown>>(pristineData);

	React.useEffect(() => {
		// Reset working data whenever Shuffle or a scenario chip changes the fixture baseline.
		setWorkingData(pristineData);
	}, [pristineData]);

	const fixture = React.useMemo(
		() => ({ ...workingData, id: `random-${randomReceipt.seedHex}` }),
		[workingData, randomReceipt]
	);
	const effectivePaperWidth: PaperWidth =
		selectedTemplate?.paperWidth ?? defaultPaperWidth(selectedTemplate?.engine);
	const { rendered, renderError } = React.useMemo(() => {
		if (!selectedTemplate) return { rendered: null, renderError: null };
		try {
			return {
				rendered: renderStudioTemplate({
					template: selectedTemplate,
					fixture: fixture as unknown as Parameters<typeof renderStudioTemplate>[0]['fixture'],
					paperWidth: effectivePaperWidth,
					printerModel: printerModel || undefined,
					language,
				}),
				renderError: null,
			};
		} catch (err) {
			console.error('Template render failed', err);
			return { rendered: null, renderError: err instanceof Error ? err.message : String(err) };
		}
	}, [selectedTemplate, fixture, effectivePaperWidth, printerModel, language]);
	// `rendered.html` is already sanitized by `renderForStudio` with the SVG-
	// allowing profile both engines need (so `<barcode>` SVGs survive). Re-
	// sanitizing here with the default profile strips `<svg>` and breaks
	// barcodes for logicless templates, so just pass it through.
	const previewHtml = rendered?.html ?? '';
	const diagnosticHtml = sanitizeHtml(
		rendered?.kind === 'logicless' ? (rendered.diagnosticHtml ?? '') : ''
	);

	const shuffleSeed = React.useCallback(() => setSeed(createRandomSeed()), []);

	const handleToggleScenario = React.useCallback((key: ScenarioKey, nextValue: boolean) => {
		setScenarioOverrides((current) => toggleScenarioOverride(current, key, nextValue));
	}, []);

	const toggleSection = (key: SectionKey) =>
		setSections((current) => ({ ...current, [key]: !current[key] }));

	const handleChangePath = (path: PathSegment[], value: unknown) => {
		setWorkingData((current) => setAtPath(current, path, value));
	};

	const handleAddItem = (path: PathSegment[]) => {
		const arrayKey = String(path[path.length - 1]);
		const template = ARRAY_DEFAULTS[arrayKey];
		if (template === undefined) return;
		setWorkingData((current) => {
			const existing = (getAtPath(current, path) as unknown[]) ?? [];
			const next = [...existing, structuredClone(template)];
			return setAtPath(current, path, next);
		});
	};

	const handleRemoveItem = (path: PathSegment[]) => {
		setWorkingData((current) => removeAtPath(current, path));
	};

	const handleRevertSection = (path: PathSegment[]) => {
		const pristineSection = getAtPath(pristineData, path);
		setWorkingData((current) => setAtPath(current, path, structuredClone(pristineSection)));
	};

	const openPrintDialog = React.useCallback(() => {
		if (!rendered) return;
		const receiptNode = previewFrameRef.current?.firstElementChild;
		if (!receiptNode) {
			setError('Print preview is not ready yet.');
			return;
		}

		setError(null);
		void printReceiptInHiddenFrame({
			hostDocument: document,
			receiptNode,
			paperWidth: effectivePaperWidth,
		}).catch((error: unknown) => {
			setError(error instanceof Error ? error.message : String(error));
		});
	}, [effectivePaperWidth, rendered]);

	const renderRawThermalForPrint = React.useCallback(async () => {
		if (rendered?.kind !== 'thermal') {
			throw new Error('Thermal print output is not ready.');
		}
		if (!selectedTemplate || selectedTemplate.engine !== 'thermal') {
			return rendered;
		}

		const maxWidth = maxDotsForPaperWidth(effectivePaperWidth);
		const renderedTemplate = renderTemplatePlaceholders(selectedTemplate.content, rendered.data);
		const assets = discoverThermalAssetRequests(renderedTemplate);
		const imageAssets: ThermalImageAssets = {};
		const barcodeImages: ThermalBarcodeImages = {};

		await Promise.all(
			assets.images.map(async (image) => {
				const asset = await loadThermalLogoAsset({
					src: image.src,
					requestedWidth: image.width ?? maxWidth,
					maxWidth,
				});
				if (asset) imageAssets[image.src] = asset;
			})
		);

		await Promise.all(
			assets.barcodes.map(async (barcode) => {
				const result = await renderThermalBarcodeAsset({ ...barcode, maxWidth });
				if (result) barcodeImages[result.key] = result.asset;
			})
		);

		const prepared = renderStudioTemplate({
			template: selectedTemplate,
			fixture: fixture as unknown as Parameters<typeof renderStudioTemplate>[0]['fixture'],
			paperWidth: effectivePaperWidth,
			printerModel: printerModel || undefined,
			language,
			encodeOptions: {
				imageMode: 'raster',
				imageAssets,
				barcodeMode: 'image',
				barcodeImages,
			},
		});

		if (prepared.kind !== 'thermal') return rendered;
		return prepared;
	}, [effectivePaperWidth, fixture, language, printerModel, rendered, selectedTemplate]);

	React.useEffect(() => {
		if (typeof window === 'undefined') return;
		const handler = (event: KeyboardEvent) => {
			const target = event.target as HTMLElement | null;
			const isTyping =
				target?.tagName === 'INPUT' ||
				target?.tagName === 'TEXTAREA' ||
				target?.isContentEditable === true;
			const meta = event.metaKey || event.ctrlKey;
			if (meta && (event.key === 'p' || event.key === 'P')) {
				event.preventDefault();
				openPrintDialog();
				return;
			}
			if (meta && (event.key === 'r' || event.key === 'R') && !event.shiftKey) {
				event.preventDefault();
				shuffleSeed();
				return;
			}
			if (event.key === '/' && !meta && !isTyping) {
				const search = document.querySelector<HTMLInputElement>('.data-search');
				if (search) {
					event.preventDefault();
					search.focus();
					search.select();
				}
			}
		};
		window.addEventListener('keydown', handler);
		return () => window.removeEventListener('keydown', handler);
	}, [openPrintDialog, shuffleSeed]);

	return (
		<div className="studio-app">
			<Toolbar zoom={zoom} onZoomChange={setZoom} />
			{error || renderError ? <div className="error-banner">{error ?? renderError}</div> : null}
			<div className="studio-body">
				<TemplateList
					templates={templates}
					selectedTemplateId={selectedTemplate?.id ?? ''}
					onSelect={setSelectedTemplateId}
				/>
				<Stage
					previewFrameRef={previewFrameRef}
					rendered={rendered}
					previewHtml={previewHtml}
					paperWidth={effectivePaperWidth}
					zoom={zoom}
					templateName={selectedTemplate?.name}
					templateContent={selectedTemplate?.content}
					templateEngine={selectedTemplate?.engine}
				/>
				<aside className="right-panel" aria-label="Studio controls">
					<CollapsibleSection
						title="Data"
						open={sections.data}
						onToggle={() => toggleSection('data')}
					>
						<DataSection
							seedLabel={formatSeed(randomReceipt.seed)}
							onShuffle={shuffleSeed}
							scenarioState={scenarioState}
							onToggleScenario={handleToggleScenario}
							data={workingData}
							pristine={pristineData}
							onChangePath={handleChangePath}
							onAddItem={handleAddItem}
							onRemoveItem={handleRemoveItem}
							onRevertSection={handleRevertSection}
						/>
					</CollapsibleSection>
					<CollapsibleSection
						title="WooCommerce"
						open={sections.woocommerce}
						onToggle={() => toggleSection('woocommerce')}
					>
						<WooCommerceSection
							engine={selectedTemplate?.engine ?? null}
							currency={
								((workingData.order as Record<string, unknown> | undefined)?.currency as string) ??
								'USD'
							}
							locale={
								((workingData.presentation_hints as Record<string, unknown> | undefined)
									?.locale as string) ?? 'en_US'
							}
							displayTax={
								((workingData.presentation_hints as Record<string, unknown> | undefined)
									?.display_tax as string) ?? 'incl'
							}
							pricesEnteredWithTax={Boolean(
								(workingData.presentation_hints as Record<string, unknown> | undefined)
									?.prices_entered_with_tax
							)}
							roundingMode={
								((workingData.presentation_hints as Record<string, unknown> | undefined)
									?.rounding_mode as string) ?? 'per-line'
							}
							printerModel={printerModel}
							language={language}
							onChangePath={handleChangePath}
							onPrinterModelChange={setPrinterModel}
							onLanguageChange={(value) =>
								setLanguage(value as 'esc-pos' | 'star-prnt' | 'star-line')
							}
						/>
					</CollapsibleSection>
					<CollapsibleSection
						title="Print"
						open={sections.print}
						onToggle={() => toggleSection('print')}
					>
						<PrintSection
							rendered={rendered}
							onOpenPrintDialog={openPrintDialog}
							onError={setError}
							onPrepareRawPrint={renderRawThermalForPrint}
						/>
					</CollapsibleSection>
				</aside>
			</div>
			{/* Legacy diagnostic-frame retained for sanitization tests; hidden via CSS. */}
			<div
				className="diagnostic-frame"
				aria-hidden="true"
				dangerouslySetInnerHTML={{ __html: diagnosticHtml }}
			/>
		</div>
	);
}

export function preparePrintDocument(document: Document, paperWidth: PaperWidth): void {
	const pageSize = paperWidth === 'a4' ? 'A4' : `${paperWidth} auto`;
	const meta = document.createElement('meta');
	meta.setAttribute('charset', 'utf-8');

	const title = document.createElement('title');
	title.textContent = 'WCPOS Template Studio Print';

	const style = document.createElement('style');
	style.textContent = `
@page { size: ${pageSize}; margin: 0; }
html, body { margin: 0; padding: 0; background: #fff; }
body { display: flex; justify-content: center; }
`;

	document.head.replaceChildren(meta, title, style);
	document.body.replaceChildren();
}

interface PrintReceiptInHiddenFrameOptions {
	hostDocument: Document;
	receiptNode: Element;
	paperWidth: PaperWidth;
	cleanupDelayMs?: number;
}

export async function printReceiptInHiddenFrame({
	hostDocument,
	receiptNode,
	paperWidth,
	cleanupDelayMs = 3000,
}: PrintReceiptInHiddenFrameOptions): Promise<void> {
	const frame = hostDocument.createElement('iframe');
	frame.className = 'system-print-frame';
	frame.setAttribute('aria-hidden', 'true');
	frame.tabIndex = -1;
	frame.style.position = 'fixed';
	frame.style.right = '100vw';
	frame.style.bottom = '100vh';
	frame.style.width = paperWidth === 'a4' ? '210mm' : paperWidth;
	frame.style.height = '1px';
	frame.style.border = '0';
	frame.style.opacity = '0';
	frame.style.pointerEvents = 'none';

	const frameLoaded = new Promise<void>((resolve) => {
		frame.addEventListener('load', () => resolve(), { once: true });
	});

	hostDocument.body.append(frame);
	await frameLoaded;

	const printWindow = frame.contentWindow;
	const printDocument = frame.contentDocument ?? printWindow?.document;
	if (!printWindow || !printDocument) {
		frame.remove();
		throw new Error('Print frame could not be created.');
	}

	preparePrintDocument(printDocument, paperWidth);
	printDocument.body.append(receiptNode.cloneNode(true));
	await waitForImages(printDocument);

	const cleanup = () => frame.remove();
	printWindow.addEventListener('afterprint', cleanup, { once: true });
	hostDocument.defaultView?.setTimeout(cleanup, cleanupDelayMs);

	try {
		printWindow.focus();
		printWindow.print();
	} catch (error) {
		cleanup();
		throw error;
	}
}

function waitForImages(document: Document): Promise<void> {
	const pendingImages = Array.from(document.images).filter((image) => !image.complete);
	if (pendingImages.length === 0) return Promise.resolve();

	return Promise.all(
		pendingImages.map(
			(image) =>
				new Promise<void>((resolve) => {
					image.addEventListener('load', () => resolve(), { once: true });
					image.addEventListener('error', () => resolve(), { once: true });
				})
		)
	).then(() => undefined);
}

interface ThermalAssetRequests {
	images: { src: string; width?: number }[];
	barcodes: {
		kind: 'barcode' | 'qrcode';
		value: string;
		barcodeType?: string;
		height?: number;
		size?: number;
	}[];
}

function renderTemplatePlaceholders(template: string, data: Record<string, unknown>): string {
	return template.replace(/{{\s*([^#/^!>{][^}]*)\s*}}/g, (match, path: string) => {
		const value = getAtPath(data, path.trim().split('.'));
		if (value === undefined || value === null) return '';
		if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
			return String(value);
		}
		return match;
	});
}

function discoverThermalAssetRequests(template: string): ThermalAssetRequests {
	if (typeof DOMParser !== 'undefined') {
		const doc = new DOMParser().parseFromString(template, 'application/xml');
		if (doc.querySelector('parsererror') === null) {
			return {
				images: uniqueImages(
					Array.from(doc.querySelectorAll('image')).map((element) => ({
						src: element.getAttribute('src') ?? '',
						width: numberAttribute(element, 'width'),
					}))
				),
				barcodes: [
					...Array.from(doc.querySelectorAll('barcode')).map((element) => ({
						kind: 'barcode' as const,
						value: element.textContent?.trim() ?? '',
						barcodeType: element.getAttribute('type') ?? undefined,
						height: numberAttribute(element, 'height'),
					})),
					...Array.from(doc.querySelectorAll('qrcode')).map((element) => ({
						kind: 'qrcode' as const,
						value: element.textContent?.trim() ?? '',
						size: numberAttribute(element, 'size'),
					})),
				].filter((barcode) => barcode.value),
			};
		}
	}

	return {
		images: uniqueImages(
			Array.from(template.matchAll(/<image\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)).map((match) => ({
				src: match[1] ?? '',
				width: numberFromAttributeText(match[0] ?? '', 'width'),
			}))
		),
		barcodes: [
			...Array.from(template.matchAll(/<barcode\b([^>]*)>([\s\S]*?)<\/barcode>/gi)).map(
				(match) => ({
					kind: 'barcode' as const,
					value: stripTags(match[2] ?? '').trim(),
					barcodeType: stringFromAttributeText(match[1] ?? '', 'type'),
					height: numberFromAttributeText(match[1] ?? '', 'height'),
				})
			),
			...Array.from(template.matchAll(/<qrcode\b([^>]*)>([\s\S]*?)<\/qrcode>/gi)).map((match) => ({
				kind: 'qrcode' as const,
				value: stripTags(match[2] ?? '').trim(),
				size: numberFromAttributeText(match[1] ?? '', 'size'),
			})),
		].filter((barcode) => barcode.value),
	};
}

function uniqueImages(
	images: { src: string; width?: number }[]
): { src: string; width?: number }[] {
	const seen = new Set<string>();
	return images.filter((image) => {
		if (!image.src || seen.has(image.src)) return false;
		seen.add(image.src);
		return true;
	});
}

function numberAttribute(element: Element, name: string): number | undefined {
	const value = element.getAttribute(name);
	if (!value) return undefined;
	const parsed = Number(value);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function numberFromAttributeText(text: string, name: string): number | undefined {
	const value = stringFromAttributeText(text, name);
	if (!value) return undefined;
	const parsed = Number(value);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function stringFromAttributeText(text: string, name: string): string | undefined {
	const match = new RegExp(`\\b${name}=["']([^"']+)["']`, 'i').exec(text);
	return match?.[1];
}

function stripTags(value: string): string {
	return value.replace(/<[^>]*>/g, '');
}
