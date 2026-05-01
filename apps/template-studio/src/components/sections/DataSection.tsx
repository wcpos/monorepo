import { useState } from 'react';

import { FieldsTree } from './FieldsTree';

import type { PathSegment } from '../../lib/path-utils';
import type { ResolvedScenarios, ScenarioWeights } from '../../randomizer';

interface DataSectionProps {
	seedLabel: string;
	onShuffle: () => void;
	scenarios: ResolvedScenarios;
	data: Record<string, unknown>;
	pristine: Record<string, unknown>;
	onChangePath: (path: PathSegment[], value: unknown) => void;
	onAddItem: (path: PathSegment[]) => void;
	onRemoveItem: (path: PathSegment[]) => void;
	onRevertSection: (path: PathSegment[]) => void;
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

export function DataSection({
	seedLabel,
	onShuffle,
	scenarios,
	data,
	pristine,
	onChangePath,
	onAddItem,
	onRemoveItem,
	onRevertSection,
}: DataSectionProps) {
	const [search, setSearch] = useState('');
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
			<input
				type="search"
				className="data-search"
				placeholder="Search fields…"
				value={search}
				onChange={(event) => setSearch(event.target.value)}
				aria-label="Search fields"
			/>
			<FieldsTree
				data={data}
				pristine={pristine}
				search={search}
				onChangePath={onChangePath}
				onAddItem={onAddItem}
				onRemoveItem={onRemoveItem}
				onRevertSection={onRevertSection}
			/>
		</>
	);
}
