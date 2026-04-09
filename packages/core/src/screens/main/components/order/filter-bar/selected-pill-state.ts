interface SelectedPillStateOptions<T> {
	selectedID: string | number | null | undefined;
	entity: T | null | undefined;
	isLoading: boolean;
}

interface SelectedPillState<T> {
	isActive: boolean;
	entity: T | null;
	isLoading: boolean;
}

export function getSelectedPillState<T>({
	selectedID,
	entity,
	isLoading,
}: SelectedPillStateOptions<T>): SelectedPillState<T> {
	const isActive = selectedID !== null && selectedID !== undefined && selectedID !== '';

	if (!isActive) {
		return {
			isActive: false,
			entity: null,
			isLoading: false,
		};
	}

	return {
		isActive: true,
		entity: entity ?? null,
		isLoading,
	};
}
