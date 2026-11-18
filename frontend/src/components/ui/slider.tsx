import * as React from "react";
import { Slider as SliderPrimitive } from "radix-ui";

import { cn } from "cn";

/**
 * The thumb, sitting on the value it marks.
 *
 * Radix holds a thumb inside its track by shifting it in by half of itself at the
 * low end and back out by half at the high end, off the thumb's own measured box
 * — which slides the point the thumb marks across it as it travels, so the knob
 * drifts under a dragging pointer and the fill only meets it at the middle. The
 * box Radix measures is empty and the knob is drawn out of its centre, which
 * leaves nothing to shift. The knob then overhangs each end of the track by half
 * of itself, which is where a thumb standing on its own value has to sit.
 *
 * `className` styles the knob, the part that is seen. The group is named so that
 * a focusable ancestor carrying a plain `group` can't light the ring.
 */
function SliderThumb({
	className,
	...props
}: React.ComponentProps<typeof SliderPrimitive.Thumb>) {
	return (
		<SliderPrimitive.Thumb
			data-slot="slider-thumb"
			{...props}
			className="group/thumb relative block size-0 focus-visible:outline-hidden"
		>
			<span
				className={cn(
					"absolute top-0 left-0 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary bg-white shadow-sm ring-ring/50 transition-[color,box-shadow] group-hover/thumb:ring-4 group-focus-visible/thumb:ring-4",
					className,
				)}
			/>
		</SliderPrimitive.Thumb>
	);
}

function Slider({
	className,
	defaultValue,
	value,
	min = 0,
	max = 100,
	// What names and describes the control is pulled off the root and put on
	// the thumb (not upstream shadcn): the thumb is what carries
	// `role="slider"`, and Radix only names it itself when there is more
	// than one. Left on the root these reach a plain span, and the control
	// has no accessible name at all.
	"aria-label": ariaLabel,
	"aria-labelledby": ariaLabelledBy,
	"aria-describedby": ariaDescribedBy,
	valueText,
	...props
}: React.ComponentProps<typeof SliderPrimitive.Root> & {
	/** How the value should be read out, when the number alone doesn't say it. */
	valueText?: string;
}) {
	const _values = React.useMemo(
		() =>
			Array.isArray(value)
				? value
				: Array.isArray(defaultValue)
					? defaultValue
					: [min, max],
		[value, defaultValue, min, max],
	);

	return (
		<SliderPrimitive.Root
			data-slot="slider"
			defaultValue={defaultValue}
			value={value}
			min={min}
			max={max}
			className={cn(
				// The height is the thumb's, which no longer sets it: it is the band
				// the pointer can grab, and the track alone would leave 6px of it.
				"relative flex w-full touch-none items-center select-none data-[disabled]:opacity-50 data-[orientation=horizontal]:h-4 data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-44 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col",
				className,
			)}
			{...props}
		>
			<SliderPrimitive.Track
				data-slot="slider-track"
				className="relative grow overflow-hidden rounded-full bg-muted data-[orientation=horizontal]:h-1.5 data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1.5"
			>
				<SliderPrimitive.Range
					data-slot="slider-range"
					className="absolute bg-primary data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full"
				/>
			</SliderPrimitive.Track>
			{Array.from({ length: _values.length }, (_, index) => (
				<SliderThumb
					key={index}
					aria-label={ariaLabel}
					aria-labelledby={ariaLabelledBy}
					aria-describedby={ariaDescribedBy}
					aria-valuetext={valueText}
				/>
			))}
		</SliderPrimitive.Root>
	);
}

export { Slider, SliderThumb };
