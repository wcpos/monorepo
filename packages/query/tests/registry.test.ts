import { Registry } from '../src/registry';

describe('Registry', () => {
	let registry: Registry<string, number>;

	beforeEach(() => {
		registry = new Registry();
	});

	afterEach(async () => {
		await registry.cancel();
	});

	it('should set and get values', () => {
		registry.set('a', 1);
		expect(registry.get('a')).toBe(1);
	});

	it('should check existence with has', () => {
		expect(registry.has('a')).toBe(false);
		registry.set('a', 1);
		expect(registry.has('a')).toBe(true);
	});

	it('should delete values', () => {
		registry.set('a', 1);
		expect(registry.delete('a')).toBe(true);
		expect(registry.has('a')).toBe(false);
	});

	it('should return false when deleting non-existent key', () => {
		expect(registry.delete('nonexistent')).toBe(false);
	});

	it('should iterate with forEach', () => {
		registry.set('a', 1);
		registry.set('b', 2);
		const entries: [string, number][] = [];
		registry.forEach((value, key) => entries.push([key, value]));
		expect(entries).toEqual([
			['a', 1],
			['b', 2],
		]);
	});

	it('should return all entries via getAll', () => {
		registry.set('a', 1);
		registry.set('b', 2);
		const all = registry.getAll();
		expect(all.size).toBe(2);
		expect(all.get('a')).toBe(1);
	});

	it('should emit add$ on set', (done) => {
		registry.add$.subscribe((key) => {
			expect(key).toBe('x');
			done();
		});
		registry.set('x', 42);
	});

	it('should emit delete$ on delete', (done) => {
		registry.set('x', 42);
		registry.delete$.subscribe((key) => {
			expect(key).toBe('x');
			done();
		});
		registry.delete('x');
	});

	it('should not emit delete$ when key does not exist', () => {
		const spy = jest.fn();
		registry.delete$.subscribe(spy);
		registry.delete('nonexistent');
		expect(spy).not.toHaveBeenCalled();
	});
});
