import { BehaviorSubject, Observable } from 'rxjs';

/**
 *
 */
export class CacheBase<K, V> {
	private map: Map<K, V>;
	private registrySubject: BehaviorSubject<Map<K, V>>;

	constructor() {
		this.map = new Map<K, V>();
		this.registrySubject = new BehaviorSubject<Map<K, V>>(this.map);
	}

	get $(): Observable<Map<K, V>> {
		return this.registrySubject.asObservable();
	}

	set(key: K, value: V): void {
		this.map.set(key, value);
		this.notifyChange();
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
			this.notifyChange();
		}
		return result;
	}

	private notifyChange(): void {
		this.registrySubject.next(new Map(this.map));
	}
}
