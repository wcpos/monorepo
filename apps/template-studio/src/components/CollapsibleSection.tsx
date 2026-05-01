import type { ReactNode } from 'react';

interface CollapsibleSectionProps {
	title: string;
	open: boolean;
	onToggle: () => void;
	children: ReactNode;
}

export function CollapsibleSection({ title, open, onToggle, children }: CollapsibleSectionProps) {
	const sectionId = `studio-section-${title.toLowerCase().replace(/\s+/g, '-')}`;
	return (
		<section className={`section ${title.toLowerCase()}-section`}>
			<button
				type="button"
				className={open ? 'section-header open' : 'section-header'}
				aria-expanded={open}
				aria-controls={sectionId}
				onClick={onToggle}
			>
				<span className="chevron" aria-hidden="true" />
				<span>{title}</span>
				<span className="header-spacer" />
			</button>
			{open ? (
				<div id={sectionId} className="section-body">
					{children}
				</div>
			) : null}
		</section>
	);
}
