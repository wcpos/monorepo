import { POS_META_KEYS } from '@wcpos/sync-core';

import { extractFeeLineData } from './internal/lines/pos-data';
import { retaxLine, type TaxStatus } from './retax-line';
import { sameLineMoney } from './settle';
import { isActiveFeeLine, isActiveLineItem } from './snapshot';

import type { CartConfig } from './config';
import type { EngineWarning, FeeLineInput, LineItemInput } from './types';

/** Tax-only rewrite; settlement owns percent fees and shipping. */
export function retaxCartLines(
	lines: { line_items?: LineItemInput[]; fee_lines?: FeeLineInput[] },
	config: CartConfig,
	options?: { taxStatusFor?: (line: LineItemInput) => TaxStatus | undefined }
) {
	const warnings: EngineWarning[] = [];
	const collect = <T>(before: T, result: { line: T; warnings: readonly EngineWarning[] }) => {
		warnings.push(...result.warnings);
		return sameLineMoney(before, result.line) ? before : result.line;
	};
	const line_items = lines.line_items?.map((line) => {
		if (!isActiveLineItem(line)) return line;
		const taxStatus = line.meta_data?.some(({ key }) => key === POS_META_KEYS.posData)
			? undefined
			: options?.taxStatusFor?.(line);
		return collect(line, retaxLine({ kind: 'line_item', line, taxStatus }, config));
	});
	const fee_lines = lines.fee_lines?.map((line) =>
		!isActiveFeeLine(line) ||
		extractFeeLineData(line as Parameters<typeof extractFeeLineData>[0], config.pricesIncludeTax)
			.percent
			? line
			: collect(line, retaxLine({ kind: 'fee', line }, config))
	);
	const itemsChanged = line_items?.some((line, index) => line !== lines.line_items![index]);
	const feesChanged = fee_lines?.some((line, index) => line !== lines.fee_lines![index]);
	return {
		...(itemsChanged && { line_items }),
		...(feesChanged && { fee_lines }),
		changed: !!(itemsChanged || feesChanged),
		warnings,
	};
}
