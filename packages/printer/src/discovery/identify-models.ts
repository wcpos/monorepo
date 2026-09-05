export const PRINTER_MODEL_TABLE = [
	{ pattern: /\bTM-m30III\b/i, columns: 48 }, // 80 mm paper, 12 × 24 Font A.
	{ pattern: /\bTM-m30II\b/i, columns: 48 }, // 80 mm paper, 12 × 24 Font A.
	{ pattern: /\bTM-m30\b/i, columns: 48 }, // 80 mm paper, 12 × 24 Font A.
	{ pattern: /\bTM-m50\b/i, columns: 48 }, // 80 mm paper, 12 × 24 Font A.
	{ pattern: /\bTM-T88[A-Z0-9-]*\b/i, columns: 48 }, // 80 mm paper, 12 × 24 Font A.
	{ pattern: /\bTM-T20\b/i, columns: 48 }, // 80 mm paper, 12 × 24 Font A.
	{ pattern: /\bTSP100\b/i, columns: 48 }, // 80 mm paper, standard Star Font A.
	{ pattern: /\bTSP143\b/i, columns: 48 }, // 80 mm paper, standard Star Font A.
	{ pattern: /\bTSP650\b/i, columns: 48 }, // 80 mm paper, standard Star Font A.
	{ pattern: /\bTSP654\b/i, columns: 48 }, // 80 mm paper, standard Star Font A.
	{ pattern: /\bmC-Print3\b/i, columns: 48 }, // 80 mm paper, standard Star Font A.
	{ pattern: /\bmC-Print2\b/i, columns: 32 }, // 58 mm paper, standard Star Font A.
	{ pattern: /\bTM-P20\b/i, columns: 32 }, // 58 mm paper, 12 × 24 Font A.
	{ pattern: /\b58mm\b/i, columns: 32 }, // Generic 58 mm paper at common Font A pitch.
] as const;
export function identifyModel(name?: string): { model?: string; columns?: number } {
	if (!name) return {};
	const haystack = name.replace(/_/g, ' ');
	for (const { pattern, columns } of PRINTER_MODEL_TABLE) {
		const match = haystack.match(pattern);
		if (match) return { model: match[0], columns };
	}
	return {};
}
