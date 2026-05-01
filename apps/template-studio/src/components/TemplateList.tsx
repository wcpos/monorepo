import type { StudioTemplate, TemplateEngine } from '../studio-core';

interface TemplateListProps {
	templates: readonly StudioTemplate[];
	selectedTemplateId: string;
	onSelect: (id: string) => void;
}

const ENGINE_LABELS: Record<TemplateEngine, string> = {
	logicless: 'Logicless',
	thermal: 'Thermal',
};
const ENGINE_ORDER: TemplateEngine[] = ['logicless', 'thermal'];

export function TemplateList({ templates, selectedTemplateId, onSelect }: TemplateListProps) {
	const groups = new Map<TemplateEngine, StudioTemplate[]>();
	for (const engine of ENGINE_ORDER) groups.set(engine, []);
	for (const template of templates) {
		const bucket = groups.get(template.engine);
		if (bucket) bucket.push(template);
	}

	return (
		<aside className="template-list" aria-label="Templates">
			{ENGINE_ORDER.map((engine) => {
				const items = groups.get(engine) ?? [];
				if (items.length === 0) return null;
				return (
					<div key={engine} className="template-group">
						<h3>{ENGINE_LABELS[engine]}</h3>
						{items.map((template) => (
							<button
								key={template.id}
								type="button"
								className={
									template.id === selectedTemplateId ? 'template-item selected' : 'template-item'
								}
								aria-pressed={template.id === selectedTemplateId}
								onClick={() => onSelect(template.id)}
							>
								{template.name}
								{template.source !== 'bundled-gallery' ? (
									<span className="source-tag">{template.source}</span>
								) : null}
							</button>
						))}
					</div>
				);
			})}
			{templates.length === 0 ? <p className="template-list-empty">No templates loaded.</p> : null}
		</aside>
	);
}
