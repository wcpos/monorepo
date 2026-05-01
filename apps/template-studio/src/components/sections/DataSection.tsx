import type { ResolvedScenarios, ScenarioWeights } from '../../randomizer';

interface DataSectionProps {
	seedLabel: string;
	onShuffle: () => void;
	scenarios: ResolvedScenarios;
}

const SCENARIO_LABELS: Record<keyof ScenarioWeights, string> = {
	emptyCart: 'empty cart',
	refund: 'refund',
	rtl: 'RTL',
	multicurrency: 'multi-currency',
	multiPayment: 'multi-payment',
	fiscal: 'fiscal',
	longNames: 'long names',
	hasDiscounts: 'discounts',
	hasFees: 'fees',
	hasShipping: 'shipping',
};

export function DataSection({ seedLabel, onShuffle, scenarios }: DataSectionProps) {
	const activeScenarios = (Object.keys(SCENARIO_LABELS) as (keyof ScenarioWeights)[]).filter(
		(key) => scenarios[key]
	);

	return (
		<>
			<div className="data-toolbar">
				<button type="button" className="primary" onClick={onShuffle}>
					Shuffle data
				</button>
				<span className="seed-tag" title="Current data seed">
					seed: {seedLabel}
				</span>
			</div>
			{activeScenarios.length > 0 ? (
				<div className="scenario-tags" aria-label="Active scenarios">
					{activeScenarios.map((key) => (
						<span key={key} className="scenario-tag">
							{SCENARIO_LABELS[key]}
						</span>
					))}
				</div>
			) : null}
			<p className="section-placeholder">
				Schema-driven editor with field-by-field controls is coming next. Shuffle to explore data
				variations.
			</p>
		</>
	);
}
