// Flat folded-text blob search: one string of all searchable text with a row-offset table.
// Measures bytes held and ms per query for substring (LIKE '%term%') semantics with AND across terms.
// Pure JS, no RxDB — the question is the data structure, not the database.
import { performance } from 'node:perf_hooks';

const WORDS = (
	'shirt hoodie jacket kaffeemaschine regenschirm kuorintasaippua edelstahltrinkflasche ' +
	'lampe stuhl tisch mug bottle sock glove hat scarf belt ring necklace bracelet watch ' +
	'sneaker boot sandal slipper backpack wallet purse umbrella candle soap shampoo lotion ' +
	'brush comb mirror towel blanket pillow sheet curtain rug vase bowl plate cup spoon fork ' +
	'knife pan pot kettle toaster blender grinder cafetière théière assiette serviette ' +
	'cuchara tenedor cuchillo botella jarra taza plato mantel cortina alfombra almohada ' +
	'tuoli pöytä lamppu matto verho tyyny peitto pyyhe saippua harja kampa peili kello ' +
	'schwarz weiss rot blau grün gelb klein gross medium large petit grand rouge bleu vert ' +
	'discount seasonal welcome loyalty bundle clearance summer winter spring autumn gift ' +
	'organic cotton linen wool silk leather steel ceramic glass wood bamboo recycled vegan'
).split(/\s+/);

let seed = 42;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = () => WORDS[Math.floor(rnd() * WORDS.length)];
const fold = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const words = (n) => Array.from({ length: n }, pick).join(' ');
const sku = (i) => `sku-${String(i).padStart(6, '0')}-${pick().slice(0, 2)}`;
const barcode = (i) => String(4000000000000 + i * 7919);

function corpus(kind, n) {
	const rows = [];
	for (let i = 0; i < n; i++) {
		rows.push(
			kind === 'product'
				? fold(`${words(2 + Math.floor(rnd() * 4))} ${sku(i)} ${barcode(i)}`)
				: fold(`code-${pick()}-${i} ${words(45)}`) // ~340-char coupon description
		);
	}
	return rows;
}

// Blob: rows joined by \n; offsets: Uint32Array of row starts; row id = index in offsets.
function build(rows) {
	const offsets = new Uint32Array(rows.length + 1);
	let pos = 0;
	for (let i = 0; i < rows.length; i++) {
		offsets[i] = pos;
		pos += rows[i].length + 1;
	}
	offsets[rows.length] = pos;
	return { blob: rows.join('\n') + '\n', offsets };
}

function rowOf(offsets, pos) {
	let lo = 0,
		hi = offsets.length - 2;
	while (lo < hi) {
		const mid = (lo + hi + 1) >> 1;
		if (offsets[mid] <= pos) lo = mid;
		else hi = mid - 1;
	}
	return lo;
}

// One term → set of row ids, via indexOf hopping to the next row after each hit.
function termHits({ blob, offsets }, term) {
	const hits = new Set();
	let pos = blob.indexOf(term);
	while (pos !== -1) {
		const row = rowOf(offsets, pos);
		hits.add(row);
		pos = blob.indexOf(term, offsets[row + 1]);
	}
	return hits;
}

function search(index, query) {
	const terms = fold(query).split(/\s+/).filter((t) => t.length >= 3);
	if (!terms.length) return [];
	terms.sort((a, b) => b.length - a.length); // rarest-first heuristic: longer terms first
	let acc = termHits(index, terms[0]);
	for (let i = 1; i < terms.length && acc.size; i++) {
		const next = termHits(index, terms[i]);
		acc = new Set([...acc].filter((r) => next.has(r)));
	}
	return [...acc];
}

function bench(label, fn, runs = 7) {
	fn();
	const t = [];
	for (let i = 0; i < runs; i++) {
		const s = performance.now();
		fn();
		t.push(performance.now() - s);
	}
	t.sort((a, b) => a - b);
	return `${label}: median ${t[3].toFixed(2)} ms, max ${t[6].toFixed(2)} ms`;
}

const heap = () => Math.round(process.memoryUsage().heapUsed / 1024 / 1024);

for (const [kind, sizes] of [
	['product', [20000, 50000, 200000]],
	['coupon', [2500, 20000, 50000]],
]) {
	for (const n of sizes) {
		global.gc?.();
		const before = heap();
		const rows = corpus(kind, n);
		const t0 = performance.now();
		const index = build(rows);
		const buildMs = (performance.now() - t0).toFixed(1);
		rows.length = 0;
		global.gc?.();
		const after = heap();
		const chars = index.blob.length;
		console.log(
			`\n## ${kind} × ${n.toLocaleString()} — ${(chars / 1024 / 1024).toFixed(2)} MiB of folded text ` +
				`(${(chars / n).toFixed(0)} chars/row), blob build ${buildMs} ms, heap +${after - before} MB ` +
				`(offsets ${((n + 1) * 4 / 1024).toFixed(0)} KiB)`
		);
		const queries =
			kind === 'product'
				? ['shirt', 'saippua', 'sku-01234', 'shirt blau', 'trinkfl', 'zzzz']
				: ['count', 'saippua', 'code-welcome-12', 'seasonal discount', 'trink', 'zzzz'];
		for (const q of queries) {
			const hits = search(index, q).length;
			console.log(`  ${bench(`"${q}" (${hits} hits)`, () => search(index, q))}`);
		}
		// Incremental: replace one row = rebuild the blob from the row array (cheapest correct thing).
	}
}
