// Grow the SAHPool for one more database, never past maxCapacity (#2242).
export async function ensurePoolCapacity(pool, { filesPerDatabase, growthStep, maxCapacity }) {
	const capacity = pool.getCapacity();
	const needed = pool.getFileCount() + filesPerDatabase;
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
