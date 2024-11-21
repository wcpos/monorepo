import { Subject } from 'rxjs';

import { SubscribableBase } from './subscribable-base';

/**
 * Registry is like a normal Map, but subscribable
 */
export class Registry<K, V> extends SubscribableBase {
	protected map: Map<K, V>;

	public subjects = {
		add: new Subject<K>(),
		delete: new Subject<K>(),
	};
	public readonly add$ = this.subjects.add.asObservable();
	public readonly delete$ = this.subjects.delete.asObservable();

	constructor() {
		super();
		this.map = new Map<K, V>();
	}

	set(key: K, value: V): void {
		this.map.set(key, value);
		this.subjects.add.next(key);
	}

	has(key: K): boolean {
		return this.map.has(key);
	}

	forEach(callback: (value: V, key: K, map: Map<K, V>) => void): void {
		this.map.forEach(callback);
	}

	get(key: K): V | undefined {
		return this.map.get(key);
	}

	getAll() {
		return new Map(this.map);
	}

	delete(key: K): boolean {
		const result = this.map.delete(key);
		if (result) {
			this.subjects.delete.next(key);
		}
		return result;
	}
}
