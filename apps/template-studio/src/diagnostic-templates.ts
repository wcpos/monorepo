import type { StudioTemplate } from './studio-core';

const THERMAL_CENTERING_DIAGNOSTIC = `<receipt paper-width="48">
  <text>COL RULER 48:</text>
  <text>|123456789012345678901234567890123456789012345678|</text>
  <line />

  <align mode="center">
    <text>[CENTER NORMAL 21]</text>
    <bold><size width="2"><text>BIG CENTER 14</text></size></bold>
    <text>[STATUS LINE 21 CH]</text>
  </align>

  <line style="dashed" />

  <text>COL RULER 42:</text>
  <text>|123456789012345678901234567890123456789012|</text>

  <line style="dashed" />

  <text>LEFT EDGE</text>
  <row>
    <col width="*">Pedido:</col>
    <col width="10" align="right">#1330</col>
  </row>

  <feed lines="3" />
  <cut />
</receipt>`;

export const DIAGNOSTIC_TEMPLATES: readonly StudioTemplate[] = [
	{
		id: 'diagnostic-thermal-centering',
		name: 'Diagnostic: Thermal centering',
		description:
			'Prints column rulers and centered normal/scaled lines to diagnose thermal printer CPL and alignment state.',
		engine: 'thermal',
		source: 'bundled-gallery',
		content: THERMAL_CENTERING_DIAGNOSTIC,
		paperWidth: '80mm',
	},
];

export function appendDiagnosticTemplates(templates: readonly StudioTemplate[]): StudioTemplate[] {
	const diagnosticIds = new Set(DIAGNOSTIC_TEMPLATES.map((template) => template.id));
	return [
		...templates.filter((template) => !diagnosticIds.has(template.id)),
		...DIAGNOSTIC_TEMPLATES,
	];
}
