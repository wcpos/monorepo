let visible = true;
const listeners = new Set<(visible: boolean) => void>();

export function setHostVisible(nextVisible: boolean): void {
	if (visible === nextVisible) return;
	visible = nextVisible;
	for (const listener of [...listeners]) {
		try {
			listener(visible);
		} catch {
			// A throwing listener must not block visibility tracking or other listeners.
		}
	}
}

export function hostIsVisible(): boolean {
	return visible;
}

export function onHostVisibilityChange(listener: (visible: boolean) => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}
