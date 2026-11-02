import * as React from 'react';
import { View } from 'react-native';

import { cva, type VariantProps } from 'class-variance-authority';

import { withoutDefaultGravatar } from './gravatar';
import { Icon, type IconName } from '../icon';
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
 * A person (cashier or customer) shows their picture, or their initials on the theme's
 * primary — the `default` variant (owner rule, 2026-10-18). Never Gravatar's grey "mystery
 * person": a Gravatar URL is asked for `d=404` so a missing picture fails and the initials
 * show (`withoutDefaultGravatar`). A non-person (a site icon) passes `variant="muted"`; a
 * non-person standing in a person's slot (the Guest customer) passes `icon` with `muted`.
 *
 * @example
 * // User avatar with initials fallback when avatar URL fails
 * <Avatar source={{ uri: avatarUrl }} fallback="PK" size="md" />
 *
 * // Site icon (rounded square) with site-name initials fallback
 * <Avatar source={faviconUrl} fallback={getInitials(site.name)} size="lg" shape="rounded" />
 *
 * // Initials-only (no image attempted)
 * <Avatar fallback="JD" />
 *
 * // The Guest customer: a generic person glyph, neutral
 * <Avatar icon="customer" variant="muted" />
 */

const avatarVariants = cva('items-center justify-center overflow-hidden', {
	variants: {
		size: {
			xs: 'size-5',
			sm: 'size-7',
			md: 'size-9',
			lg: 'size-10',
		},
		shape: {
			circle: 'rounded-full',
			rounded: 'rounded-lg',
		},
		variant: {
			// A person's initials sit on the theme's accent (owner rule, 2026-10-18).
			default: 'bg-primary',
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
	default: 'text-primary-foreground',
	muted: 'text-muted-foreground',
};

const fallbackTextSizeVariants: Record<
	NonNullable<VariantProps<typeof avatarVariants>['size']>,
	string
> = {
	xs: 'text-2xs',
	sm: 'text-2xs',
	md: 'text-xs',
	lg: 'text-sm',
};

const iconSizeVariants: Record<
	NonNullable<VariantProps<typeof avatarVariants>['size']>,
	React.ComponentProps<typeof Icon>['size']
> = {
	xs: 'xs',
	sm: 'sm',
	md: 'default',
	lg: 'lg',
};

/** The source with any Gravatar default suppressed; an empty uri counts as no source. */
function resolveSource(source: ImageProps['source']): ImageProps['source'] | undefined {
	if (source == null || source === '') return undefined;
	if (typeof source === 'string') return withoutDefaultGravatar(source);
	if (typeof source === 'object' && !Array.isArray(source) && 'uri' in source) {
		const { uri } = source as { uri?: string | null };
		if (!uri) return undefined;
		return { ...source, uri: withoutDefaultGravatar(uri) };
	}
	return source;
}

function getSourceKey(source: ImageProps['source']): string {
	if (source == null) return '';
	if (typeof source === 'string' || typeof source === 'number') return String(source);
	if (Array.isArray(source)) return source.map(getSourceKey).join('|');
	if (typeof source === 'object') {
		const sourceRecord = source as { uri?: string; assetId?: string | number };
		return String(sourceRecord.uri ?? sourceRecord.assetId ?? JSON.stringify(source));
	}
	return String(source);
}

export interface AvatarProps
	extends Omit<ImageProps, 'source'>, VariantProps<typeof avatarVariants> {
	/** Image source — URL string or { uri } object. When missing or errored, the fallback is shown. */
	source?: ImageProps['source'];
	/** Initials (1-2 chars) shown when the image is missing or fails to load. */
	fallback?: string;
	/** A glyph shown instead of initials, for a non-person in a person's slot (the Guest). */
	icon?: IconName;
}

export function Avatar({
	source,
	fallback,
	icon,
	size,
	shape,
	variant,
	className,
	onError,
	...imageProps
}: AvatarProps) {
	const resolvedSource = resolveSource(source);
	const [errored, setErrored] = React.useState(false);
	// Reset error state if the source changes (e.g. site URL edited) by adjusting
	// state during render instead of in an effect — React's recommended pattern for
	// resetting state when a prop changes (https://react.dev/learn/you-might-not-need-an-effect).
	const sourceKey = getSourceKey(resolvedSource);
	const [prevSourceKey, setPrevSourceKey] = React.useState(sourceKey);
	if (sourceKey !== prevSourceKey) {
		setPrevSourceKey(sourceKey);
		setErrored(false);
	}

	const hasSource = Boolean(resolvedSource);
	const showImage = hasSource && !errored;
	const resolvedSize = size ?? 'xs';
	const resolvedVariant = variant ?? 'default';

	const containerClass = cn(
		avatarVariants({ size: resolvedSize, shape, variant: resolvedVariant }),
		className
	);

	const initials = (fallback ?? '').slice(0, 2).toUpperCase();
	const fallbackContent = icon ? (
		<Icon
			name={icon}
			size={iconSizeVariants[resolvedSize]}
			className={fallbackTextVariants[resolvedVariant]}
		/>
	) : initials ? (
		<Text
			className={cn(
				'font-semibold',
				fallbackTextSizeVariants[resolvedSize],
				fallbackTextVariants[resolvedVariant]
			)}
		>
			{initials}
		</Text>
	) : null;

	// The picture's accessible name: the caller's, else the initials; an icon (the Guest) is a
	// glyph, not a name, and a picture the caller marked decorative is left unnamed.
	const decorative = imageProps.accessible === false || Boolean(imageProps['aria-hidden']);
	const imageLabel =
		imageProps.accessibilityLabel ??
		imageProps.alt ??
		(icon || decorative ? undefined : initials || undefined);

	return (
		<View className={containerClass}>
			{/* The initials stay mounted under the picture for its whole life: a person with no
			    Gravatar waits for its 404, and on web expo-image reports the load before its 250 ms
			    fade, so dropping them on load drew an empty accent disc. The opaque picture covers
			    them; the container clips. */}
			{/* Hidden from assistive tech while a picture shows, so the name is announced once. */}
			{fallbackContent && <View aria-hidden={showImage}>{fallbackContent}</View>}
			{showImage && (
				<Image
					{...imageProps}
					accessibilityLabel={imageLabel}
					source={resolvedSource}
					onError={(event) => {
						setErrored(true);
						onError?.(event);
					}}
					contentFit="cover"
					className={cn(
						'absolute inset-0 h-full w-full',
						(shape ?? 'circle') === 'circle' ? 'rounded-full' : 'rounded-lg'
					)}
				/>
			)}
		</View>
	);
}

Avatar.displayName = 'Avatar';

export { isGravatarUrl, withoutDefaultGravatar } from './gravatar';

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
