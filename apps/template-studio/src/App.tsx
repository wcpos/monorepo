import { useEffect, useMemo, useState } from 'react';

import { fetchBundledTemplates, fetchFixtures, fetchWpPreview, paperWidths } from './studio-api';
import { renderStudioTemplate, selectVisibleTemplate } from './studio-core';

import type { PaperWidth, ReceiptFixture, StudioTemplate, TemplateEngine } from './studio-core';

export function App() {
	const [templates, setTemplates] = useState<StudioTemplate[]>([]);
	const [fixtures, setFixtures] = useState<ReceiptFixture[]>([]);
	const [selectedTemplateId, setSelectedTemplateId] = useState('');
	const [selectedFixtureId, setSelectedFixtureId] = useState('gallery-default-receipt');
	const [paperWidth, setPaperWidth] = useState<PaperWidth>('80mm');
	const [engineFilter, setEngineFilter] = useState<TemplateEngine | 'all'>('all');
	const [wpTemplateId, setWpTemplateId] = useState('');
	const [status, setStatus] = useState('Loading bundled gallery templates…');

	useEffect(() => {
		Promise.all([fetchBundledTemplates(), fetchFixtures()])
			.then(([loadedTemplates, loadedFixtures]) => {
				setTemplates(loadedTemplates);
				setFixtures(loadedFixtures);
				setSelectedTemplateId(loadedTemplates[0]?.id ?? '');
				setStatus(
					'Edit gallery templates in woocommerce-pos/templates/gallery and Vite will hot-reload.'
				);
			})
			.catch((error: unknown) => setStatus(error instanceof Error ? error.message : String(error)));
	}, []);

	const filteredTemplates = useMemo(
		() =>
			templates.filter((template) => engineFilter === 'all' || template.engine === engineFilter),
		[engineFilter, templates]
	);
	const selectedTemplate = selectVisibleTemplate(filteredTemplates, selectedTemplateId);
	const selectedFixture =
		fixtures.find((fixture) => fixture.id === selectedFixtureId) ?? fixtures[0];
	const rendered =
		selectedTemplate && selectedFixture
			? renderStudioTemplate({ template: selectedTemplate, fixture: selectedFixture, paperWidth })
			: null;

	async function loadWpTemplate() {
		if (!wpTemplateId.trim()) return;
		setStatus(`Fetching wp-env template ${wpTemplateId} through the Vite proxy…`);
		try {
			const wpTemplate = await fetchWpPreview(wpTemplateId.trim());
			setTemplates((current) => [
				wpTemplate,
				...current.filter((template) => template.id !== wpTemplate.id),
			]);
			setFixtures((current) => [
				wpTemplate.receiptData,
				...current.filter((fixture) => fixture.id !== wpTemplate.receiptData.id),
			]);
			setEngineFilter(wpTemplate.engine);
			setSelectedTemplateId(wpTemplate.id);
			setSelectedFixtureId(wpTemplate.receiptData.id);
			setStatus('Loaded wp-env preview using cookie auth and X-WCPOS: 1.');
		} catch (error) {
			setStatus(error instanceof Error ? error.message : String(error));
		}
	}

	return (
		<div className="studio-shell">
			<aside className="sidebar">
				<h1>WCPOS Template Studio</h1>
				<p>{status}</p>
				<label>
					Engine
					<select
						value={engineFilter}
						onChange={(event) => setEngineFilter(event.target.value as TemplateEngine | 'all')}
					>
						<option value="all">All non-legacy</option>
						<option value="logicless">Logicless</option>
						<option value="thermal">Thermal</option>
					</select>
				</label>
				<label>
					Template
					<select
						value={selectedTemplate?.id ?? ''}
						onChange={(event) => setSelectedTemplateId(event.target.value)}
					>
						{filteredTemplates.map((template) => (
							<option key={template.id} value={template.id}>
								{template.name} ({template.source})
							</option>
						))}
					</select>
				</label>
				<label>
					Fixture
					<select
						value={selectedFixture?.id ?? ''}
						onChange={(event) => setSelectedFixtureId(event.target.value)}
					>
						{fixtures.map((fixture) => (
							<option key={fixture.id} value={fixture.id}>
								{fixture.id}
							</option>
						))}
					</select>
				</label>
				<label>
					Paper width
					<select
						value={paperWidth}
						onChange={(event) => setPaperWidth(event.target.value as PaperWidth)}
					>
						{paperWidths.map((width) => (
							<option key={width} value={width}>
								{width}
							</option>
						))}
					</select>
				</label>
				<div className="wp-loader">
					<label>
						wp-env template ID
						<input
							value={wpTemplateId}
							onChange={(event) => setWpTemplateId(event.target.value)}
							placeholder="standard-receipt or 123"
						/>
					</label>
					<button type="button" onClick={loadWpTemplate}>
						Fetch preview
					</button>
				</div>
			</aside>
			<main className="preview-column">
				<h2>{selectedTemplate?.name ?? 'No template selected'}</h2>
				<div className="paper-frame" dangerouslySetInnerHTML={{ __html: rendered?.html ?? '' }} />
			</main>
			<aside className="diagnostics">
				<h2>Diagnostics</h2>
				{rendered?.kind === 'logicless' ? (
					<>
						<h3>PHP diagnostic output</h3>
						<div
							className="diagnostic-frame"
							dangerouslySetInnerHTML={{
								__html: rendered.diagnosticHtml ?? '<p>No preview_html diagnostic returned.</p>',
							}}
						/>
					</>
				) : null}
				{rendered?.kind === 'thermal' ? (
					<>
						<h3>ESC/POS hex</h3>
						<pre>{rendered.escposHex}</pre>
						<h3>ASCII debug</h3>
						<pre>{rendered.escposAscii}</pre>
					</>
				) : null}
			</aside>
		</div>
	);
}
