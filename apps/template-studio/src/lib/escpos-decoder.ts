/**
 * Tiny ESC/POS opcode decoder.
 *
 * Walks a Uint8Array and emits a list of decoded segments. Each segment is
 * either a recognized opcode (with parameter bytes consumed) or a printable
 * text run. Unknown control bytes are emitted verbatim with a `?` marker.
 *
 * Coverage targets the opcodes the receipt-renderer emits in practice — init,
 * justification, font weight, underline, line spacing, default mode, cut,
 * barcode primitives, character size. The goal is "readable enough to debug a
 * print" rather than full ESC/POS reference coverage.
 */

export interface DecodedByte {
	offset: number;
	hex: string;
	ascii: string;
	decoded: string;
}

interface OpcodeRule {
	/** Bytes consumed (including command bytes). Negative = variable length, see `consume`. */
	length: number;
	/** Human-readable description; receives the parameter bytes. */
	describe: (params: number[]) => string;
	/** Optional custom consumer used when length is variable. Returns total bytes consumed. */
	consume?: (bytes: Uint8Array, offset: number) => number;
}

/** ESC <byte> commands (0x1b). */
const ESC_RULES: Record<number, OpcodeRule> = {
	0x40: { length: 2, describe: () => 'init printer' },
	0x21: {
		length: 3,
		describe: ([mode]) => `select print mode 0x${mode.toString(16).padStart(2, '0')}`,
	},
	0x61: {
		length: 3,
		describe: ([align]) => {
			if (align === 0) return 'align left';
			if (align === 1) return 'align center';
			if (align === 2) return 'align right';
			return `align unknown(${align})`;
		},
	},
	0x45: {
		length: 3,
		describe: ([on]) => (on ? 'bold on' : 'bold off'),
	},
	0x2d: {
		length: 3,
		describe: ([n]) => (n ? `underline ${n}-dot` : 'underline off'),
	},
	0x33: { length: 3, describe: ([n]) => `line spacing ${n}/180"` },
	0x32: { length: 2, describe: () => 'default line spacing' },
	0x64: { length: 3, describe: ([n]) => `feed ${n} lines` },
	0x4a: { length: 3, describe: ([n]) => `feed ${n}/180"` },
	0x4d: { length: 3, describe: ([n]) => `select character font ${n}` },
	0x52: { length: 3, describe: ([n]) => `select international charset ${n}` },
	0x74: { length: 3, describe: ([n]) => `select code page ${n}` },
};

/** GS <byte> commands (0x1d). */
const GS_RULES: Record<number, OpcodeRule> = {
	0x21: {
		length: 3,
		describe: ([n]) => `character size ${((n >> 4) & 0x0f) + 1}x${(n & 0x0f) + 1}`,
	},
	0x42: {
		length: 3,
		describe: ([on]) => (on ? 'invert on' : 'invert off'),
	},
	0x56: {
		length: 4,
		describe: ([m]) => {
			if (m === 0 || m === 48) return 'full cut';
			if (m === 1 || m === 49) return 'partial cut';
			return `cut mode ${m}`;
		},
	},
	0x6b: {
		// barcode print: GS k m d1...dN NUL  (m < 65 = NUL terminated, m >= 65 = length-prefixed)
		length: 0,
		consume: (bytes, offset) => {
			const m = bytes[offset + 2];
			if (m === undefined) return 2;
			if (m >= 65) {
				const n = bytes[offset + 3] ?? 0;
				return 4 + n;
			}
			let i = offset + 3;
			while (i < bytes.length && bytes[i] !== 0x00) i += 1;
			return i - offset + 1;
		},
		describe: () => 'print barcode',
	},
	0x77: { length: 3, describe: ([n]) => `barcode width ${n}` },
	0x68: { length: 3, describe: ([n]) => `barcode height ${n}px` },
	0x66: { length: 3, describe: ([n]) => `barcode font ${n}` },
	0x48: { length: 3, describe: ([n]) => `barcode HRI position ${n}` },
};

function printable(byte: number): string {
	return byte >= 0x20 && byte <= 0x7e ? String.fromCharCode(byte) : '.';
}

function hex(byte: number): string {
	return byte.toString(16).padStart(2, '0').toUpperCase();
}

export function decodeEscposBytes(bytes: Uint8Array): DecodedByte[] {
	const result: DecodedByte[] = [];
	let i = 0;
	while (i < bytes.length) {
		const byte = bytes[i];

		if (byte === 0x1b) {
			const op = bytes[i + 1];
			const rule = op !== undefined ? ESC_RULES[op] : undefined;
			if (rule) {
				const length = rule.consume !== undefined ? rule.consume(bytes, i) : rule.length;
				const slice = Array.from(bytes.slice(i, i + length));
				result.push({
					offset: i,
					hex: slice.map(hex).join(' '),
					ascii: slice.map(printable).join(''),
					decoded: `ESC ${hex(op)} — ${rule.describe(slice.slice(2))}`,
				});
				i += length;
				continue;
			}
			result.push({
				offset: i,
				hex: hex(byte),
				ascii: '.',
				decoded: 'ESC ?',
			});
			i += 1;
			continue;
		}

		if (byte === 0x1d) {
			const op = bytes[i + 1];
			const rule = op !== undefined ? GS_RULES[op] : undefined;
			if (rule) {
				const length = rule.consume !== undefined ? rule.consume(bytes, i) : rule.length;
				const slice = Array.from(bytes.slice(i, i + length));
				result.push({
					offset: i,
					hex: slice.map(hex).join(' '),
					ascii: slice.map(printable).join(''),
					decoded: `GS ${hex(op)} — ${rule.describe(slice.slice(2))}`,
				});
				i += length;
				continue;
			}
			result.push({
				offset: i,
				hex: hex(byte),
				ascii: '.',
				decoded: 'GS ?',
			});
			i += 1;
			continue;
		}

		if (byte === 0x0a) {
			result.push({ offset: i, hex: hex(byte), ascii: '\\n', decoded: 'line feed' });
			i += 1;
			continue;
		}
		if (byte === 0x0d) {
			result.push({ offset: i, hex: hex(byte), ascii: '\\r', decoded: 'carriage return' });
			i += 1;
			continue;
		}
		if (byte === 0x09) {
			result.push({ offset: i, hex: hex(byte), ascii: '\\t', decoded: 'horizontal tab' });
			i += 1;
			continue;
		}

		// Coalesce printable runs into a single text segment for readability.
		if (byte >= 0x20 && byte <= 0x7e) {
			let end = i;
			while (end < bytes.length && bytes[end] >= 0x20 && bytes[end] <= 0x7e) end += 1;
			const slice = Array.from(bytes.slice(i, end));
			result.push({
				offset: i,
				hex: slice.map(hex).join(' '),
				ascii: slice.map(printable).join(''),
				decoded: `text: "${slice.map(printable).join('')}"`,
			});
			i = end;
			continue;
		}

		// Unknown control byte.
		result.push({
			offset: i,
			hex: hex(byte),
			ascii: printable(byte),
			decoded: `0x${hex(byte)}`,
		});
		i += 1;
	}
	return result;
}
