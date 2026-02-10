import React from 'react';

import { Platform } from '@wcpos/utils/platform';

/**
 * Hook that enables arrow key navigation by moving focus between focusable elements
 * Only works on web platform
 */
export function useArrowKeyNavigation() {
	React.useEffect(() => {
		if (Platform.OS !== 'web') return;

		const handleKeyDown = (event: KeyboardEvent) => {
			switch (event.key) {
				case 'ArrowDown':
					event.preventDefault();
					// Move focus to next focusable element
					const currentElement = document.activeElement as HTMLElement;
					if (currentElement) {
						const focusableElements = Array.from(
							document.querySelectorAll(
								'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
							)
						) as HTMLElement[];
						const currentIndex = focusableElements.indexOf(currentElement);
						const nextIndex = (currentIndex + 1) % focusableElements.length;
						focusableElements[nextIndex]?.focus();
					}
					break;
				case 'ArrowUp':
					event.preventDefault();
					// Move focus to previous focusable element
					const currentEl = document.activeElement as HTMLElement;
					if (currentEl) {
						const focusableElements = Array.from(
							document.querySelectorAll(
								'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
							)
						) as HTMLElement[];
						const currentIndex = focusableElements.indexOf(currentEl);
						const prevIndex = currentIndex === 0 ? focusableElements.length - 1 : currentIndex - 1;
						focusableElements[prevIndex]?.focus();
					}
					break;
			}
		};

		document.addEventListener('keydown', handleKeyDown);
		return () => {
			document.removeEventListener('keydown', handleKeyDown);
		};
	}, []);
}
