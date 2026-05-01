import type { TemplateEngine } from '../../studio-core';

interface WooCommerceSectionProps {
	engine: TemplateEngine | null;
}

export function WooCommerceSection({ engine }: WooCommerceSectionProps) {
	const isLogicless = engine === 'logicless';
	return (
		<div className="woo-section">
			<p className="section-placeholder">
				Currency, decimals, locale, tax display, and printer model controls land in the next phase.
			</p>
			<div className={isLogicless ? 'muted' : undefined}>
				<small>Printer-specific options apply to thermal templates only.</small>
			</div>
		</div>
	);
}
