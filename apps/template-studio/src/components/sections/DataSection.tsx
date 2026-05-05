import React from 'react';

import { FieldsTree } from './FieldsTree';
import { SCENARIO_CHIPS } from '../../scenario-controls';

import type { PathSegment } from '../../lib/path-utils';
import type { ScenarioKey, ScenarioState } from '../../scenario-controls';

interface DataSectionProps {
	seedLabel: string;
	onShuffle: () => void;
	scenarioState: ScenarioState;
	onToggleScenario: (key: ScenarioKey, nextValue: boolean) => void;
	data: Record<string, unknown>;
	pristine: Record<string, unknown>;
	onChangePath: (path: PathSegment[], value: unknown) => void;
	onAddItem: (path: PathSegment[]) => void;
	onRemoveItem: (path: PathSegment[]) => void;
	onRevertSection: (path: PathSegment[]) => void;
}

export function DataSection({
	seedLabel,
	onShuffle,
	scenarioState,
	onToggleScenario,
	data,
	pristine,
	onChangePath,
	onAddItem,
	onRemoveItem,
	onRevertSection,
}: DataSectionProps) {
	const [search, setSearch] = React.useState('');

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
			<div className="scenario-tags" aria-label="Receipt data scenarios">
				{SCENARIO_CHIPS.map((chip) => {
					const active = scenarioState[chip.key];
					return (
						<button
							key={chip.key}
							type="button"
							className={active ? 'scenario-tag active' : 'scenario-tag inactive'}
							aria-pressed={active}
							data-testid={`scenario-chip-${chip.key}`}
							onClick={() => onToggleScenario(chip.key, !active)}
						>
							{chip.label}
						</button>
					);
				})}
			</div>
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
