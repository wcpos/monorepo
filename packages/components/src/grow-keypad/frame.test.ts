import { growFrame, ROW } from './frame';

const PANEL = 7 * ROW; // the price keypad with its quick keys, 336
/** The panel's top and bottom edges in the window for a frame against a trigger. */
function edges(box: { top: number; height: number }, frame: ReturnType<typeof growFrame>) {
	if (frame.grow === 'down') {
		const top = box.top + box.height + frame.offset;
		return { top, bottom: top + PANEL };
	}
	const bottom = box.top - frame.offset;
	return { top: bottom - PANEL, bottom };
}

it('fits down: the first row lands on the trigger', () => {
	const box = { top: 100, height: 44 };
	const frame = growFrame(box, PANEL, 768);
	expect(frame.grow).toBe('down');
	expect(edges(box, frame).top).toBe(98); // the 48 px row centred on the 44 px trigger
});

it('fits only up: the first row lands on the trigger from above', () => {
	const box = { top: 600, height: 44 };
	const frame = growFrame(box, PANEL, 768);
	expect(frame.grow).toBe('up');
	expect(edges(box, frame).bottom).toBe(646);
});

it('when neither direction fits, every key stays inside the window', () => {
	// 1024 × 480, the trigger at y=150: 332 below its first row, 196 above.
	const box = { top: 150, height: 44 };
	const frame = growFrame(box, PANEL, 480);
	expect(frame.grow).toBe('down');
	expect(edges(box, frame)).toEqual({ top: 144, bottom: 480 });
	// Nearer the bottom, more room above: up, slid to the window's top.
	const low = { top: 270, height: 44 }; // 212 below, 314 above
	const up = growFrame(low, PANEL, 480);
	expect(up.grow).toBe('up');
	expect(edges(low, up)).toEqual({ top: 0, bottom: 336 });
});
