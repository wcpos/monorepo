// Grow the SAHPool for one more database, never past maxCapacity (#2242).
export async function ensurePoolCapacity(
	pool,
	{ filesPerDatabase, growthStep, maxCapacity, reserved = 0 }
) {
	const capacity = pool.getCapacity();
	const needed = pool.getFileCount() + reserved + filesPerDatabase;
	if (needed <= capacity) return;
	const grow = Math.min(growthStep, maxCapacity - capacity);
	if (grow <= 0 || capacity + grow < needed) {
		const error = new Error(
			`SQLite pool is full: capacity ${capacity}, cap ${maxCapacity}, ${pool.getFileCount()} files in use`
		);
		error.name = 'SqlitePoolFullError';
		throw error;
	}
	await pool.addCapacity(grow);
}

// Opens hold their files until the pool counts them; checks and growth take turns (#2347).
export function createPoolReservations(pool, limits) {
	let reserved = 0;
	let chain = Promise.resolve();
	return {
		reserve() {
			const turn = chain.then(async () => {
				await ensurePoolCapacity(pool, { ...limits, reserved });
				let held = limits.filesPerDatabase;
				reserved += held;
				const give = (files) => {
					held -= files;
					reserved -= files;
				};
				// Files the pool already counts leave the reservation, or they would count twice.
				return { claimed: (files) => give(Math.min(files, held)), release: () => give(held) };
			});
			chain = turn.catch(() => {});
			return turn;
		},
	};
}
