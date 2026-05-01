import { useEffect, useMemo, useRef, useState } from 'react';

import { sanitizeHtml, sanitizeThermalPreviewHtml } from '@wcpos/receipt-renderer';

import { CollapsibleSection } from './components/CollapsibleSection';
import { DataSection } from './components/sections/DataSection';
import { PrintSection } from './components/sections/PrintSection';
import { WooCommerceSection } from './components/sections/WooCommerceSection';
import { Stage } from './components/Stage';
import { TemplateList } from './components/TemplateList';
import { Toolbar } from './components/Toolbar';
import { createRandomReceipt, formatSeed } from './randomizer';
import { fetchBundledTemplates, paperWidths } from './studio-api';
import { renderStudioTemplate, selectVisibleTemplate } from './studio-core';

import type { PaperWidth, StudioTemplate } from './studio-core';

const SECTION_STORAGE_KEY = 'wcpos-template-studio:sections';
const SELECTION_STORAGE_KEY = 'wcpos-template-studio:selection';
const PAPER_STORAGE_KEY = 'wcpos-template-studio:paper-width';

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

function loadPaperWidth(): PaperWidth {
	if (typeof window === 'undefined') return '80mm';
	try {
		const value = window.localStorage.getItem(PAPER_STORAGE_KEY) as PaperWidth | null;
		return paperWidths.includes(value as PaperWidth) ? (value as PaperWidth) : '80mm';
	} catch {
		return '80mm';
	}
}

export function App() {
	const [templates, setTemplates] = useState<StudioTemplate[]>([]);
	const [selectedTemplateId, setSelectedTemplateId] = useState(() => loadSelection());
	const [paperWidth, setPaperWidth] = useState<PaperWidth>(() => loadPaperWidth());
	const [zoom, setZoom] = useState(100);
	const [seed, setSeed] = useState<number | string>('default');
	const [sections, setSections] = useState<SectionState>(() => loadSectionState());
	const [error, setError] = useState<string | null>(null);
	const previewFrameRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
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

	useEffect(() => {
		if (typeof window === 'undefined') return;
		try {
			window.localStorage.setItem(SECTION_STORAGE_KEY, JSON.stringify(sections));
		} catch {
			/* storage may be disabled */
		}
	}, [sections]);

	useEffect(() => {
		if (typeof window === 'undefined' || !selectedTemplateId) return;
		try {
			window.localStorage.setItem(SELECTION_STORAGE_KEY, selectedTemplateId);
		} catch {
			/* storage may be disabled */
		}
	}, [selectedTemplateId]);

	useEffect(() => {
		if (typeof window === 'undefined') return;
		try {
			window.localStorage.setItem(PAPER_STORAGE_KEY, paperWidth);
		} catch {
			/* storage may be disabled */
		}
	}, [paperWidth]);

	const selectedTemplate = selectVisibleTemplate(templates, selectedTemplateId);
	const randomReceipt = useMemo(() => createRandomReceipt({ seed }), [seed]);
	const fixture = useMemo(
		() => ({ ...randomReceipt.data, id: `random-${randomReceipt.seedHex}` }),
		[randomReceipt]
	);
	const rendered = selectedTemplate
		? renderStudioTemplate({ template: selectedTemplate, fixture, paperWidth })
		: null;
	const previewHtml =
		rendered?.kind === 'thermal'
			? sanitizeThermalPreviewHtml(rendered.html)
			: sanitizeHtml(rendered?.html ?? '');
	const diagnosticHtml = sanitizeHtml(
		rendered?.kind === 'logicless' ? (rendered.diagnosticHtml ?? '') : ''
	);

	const shuffleSeed = () => setSeed((Math.random() * 0xffffffff) >>> 0);

	const toggleSection = (key: SectionKey) =>
		setSections((current) => ({ ...current, [key]: !current[key] }));

	function openPrintDialog() {
		if (!rendered) return;
		const printWindow = window.open(
			'',
			'wcpos-template-studio-print',
			'popup,width=420,height=720'
		);
		if (!printWindow) {
			setError('Print window was blocked. Allow popups for Template Studio.');
			return;
		}

		let printed = false;
		let fallbackTimer: number | undefined;
		const printReceipt = () => {
			if (printed) return;
			printed = true;
			printWindow.removeEventListener('load', printReceipt);
			if (fallbackTimer !== undefined) printWindow.clearTimeout(fallbackTimer);
			waitForImages(printWindow.document)
				.finally(() => {
					printWindow.focus();
					printWindow.print();
				})
				.catch(() => undefined);
		};

		printWindow.addEventListener('load', printReceipt, { once: true });
		preparePrintDocument(printWindow.document, paperWidth);

		const receiptNode = previewFrameRef.current?.firstElementChild?.cloneNode(true);
		if (receiptNode) {
			printWindow.document.body.append(receiptNode);
		}
		fallbackTimer = printWindow.setTimeout(printReceipt, 1500);
	}

	return (
		<div className="studio-app">
			<Toolbar
				paperWidth={paperWidth}
				onPaperWidthChange={setPaperWidth}
				zoom={zoom}
				onZoomChange={setZoom}
			/>
			{error ? <div className="error-banner">{error}</div> : null}
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
					paperWidth={paperWidth}
					zoom={zoom}
					templateName={selectedTemplate?.name}
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
							scenarios={randomReceipt.scenarios}
						/>
					</CollapsibleSection>
					<CollapsibleSection
						title="WooCommerce"
						open={sections.woocommerce}
						onToggle={() => toggleSection('woocommerce')}
					>
						<WooCommerceSection engine={selectedTemplate?.engine ?? null} />
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
