import * as React from 'react';
import { View } from 'react-native';

import { cva, type VariantProps } from 'class-variance-authority';

import { Image, type ImageProps } from '../image';
import { cn } from '../lib/utils';
import { Text } from '../text';

/**
 * Avatar — renders an image with a graceful initials fallback.
 *
 * If `source` is missing or the image fails to load, a filled shape with
 * `fallback` initials is shown instead. This is the same component used for
 * both user profile pictures and site icons; shape and variant control look.
 *
 * @example
 * // User avatar with initials fallback when avatar URL fails
 * <Avatar source={{ uri: avatarUrl }} fallback="PK" size="md" variant="success" />
 *
 * // Site icon (rounded square) with site-name initials fallback
 * <Avatar source={faviconUrl} fallback={getInitials(site.name)} size="lg" shape="rounded" />
 *
 * // Initials-only (no image attempted)
 * <Avatar fallback="JD" variant="warning" />
 */

const avatarVariants = cva('items-center justify-center overflow-hidden', {
	variants: {
		size: {
			xs: 'h-5 w-5',
			sm: 'h-7 w-7',
			md: 'h-9 w-9',
			lg: 'h-10 w-10',
		},
		shape: {
			circle: 'rounded-full',
			rounded: 'rounded-lg',
		},
		variant: {
			default: 'bg-primary/15',
			success: 'bg-success/15',
			warning: 'bg-warning/15',
			error: 'bg-destructive/15',
			muted: 'bg-muted',
		},
	},
	defaultVariants: {
		size: 'xs',
		shape: 'circle',
		variant: 'default',
	},
});

const fallbackTextVariants: Record<
	NonNullable<VariantProps<typeof avatarVariants>['variant']>,
	string
> = {
	default: 'text-primary',
	success: 'text-success',
	warning: 'text-warning',
	error: 'text-destructive',
	muted: 'text-muted-foreground',
};

const fallbackTextSizeVariants: Record<
	NonNullable<VariantProps<typeof avatarVariants>['size']>,
	string
> = {
	xs: 'text-[9px]',
	sm: 'text-[10px]',
	md: 'text-xs',
	lg: 'text-sm',
};

export interface AvatarProps
	extends Omit<ImageProps, 'source'>, VariantProps<typeof avatarVariants> {
	/** Image source — URL string or { uri } object. When missing or errored, the fallback is shown. */
	source?: ImageProps['source'];
	/** Initials (1-2 chars) shown when the image is missing or fails to load. */
	fallback?: string;
}

export function Avatar({
	source,
	fallback,
	size,
	shape,
	variant,
	className,
	...imageProps
}: AvatarProps) {
	const [errored, setErrored] = React.useState(false);
	// Reset error state if the source changes (e.g. site URL edited)
	React.useEffect(() => {
		setErrored(false);
	}, [source]);

	const hasSource = Boolean(source);
	const showImage = hasSource && !errored;
	const resolvedSize = size ?? 'xs';
	const resolvedVariant = variant ?? 'default';

	const containerClass = cn(
		avatarVariants({ size: resolvedSize, shape, variant: resolvedVariant }),
		className
	);

	if (showImage) {
		return (
			<View className={containerClass}>
				<Image
					source={source}
					onError={() => setErrored(true)}
					contentFit="cover"
					className={cn(
						'h-full w-full',
						(shape ?? 'circle') === 'circle' ? 'rounded-full' : 'rounded-lg'
					)}
					{...imageProps}
				/>
			</View>
		);
	}

	const initials = (fallback ?? '').slice(0, 2).toUpperCase();

	return (
		<View className={containerClass}>
			{initials ? (
				<Text
					className={cn(
						'font-semibold',
						fallbackTextSizeVariants[resolvedSize],
						fallbackTextVariants[resolvedVariant]
					)}
				>
					{initials}
				</Text>
			) : null}
		</View>
	);
}

Avatar.displayName = 'Avatar';

/**
 * Derive 1-2 letter initials from a display name.
 * "Paul Kilmurray" → "PK"; "Admin" → "AD"; "" → "?".
 */
export function getInitials(name: string | null | undefined): string {
	const trimmed = (name ?? '').trim();
	if (!trimmed) return '?';
	const parts = trimmed.split(/\s+/);
	if (parts.length >= 2) {
		return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
	}
	return trimmed.slice(0, 2).toUpperCase();
}
