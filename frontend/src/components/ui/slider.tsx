import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";

import { cn } from "@/lib/utils";

interface SliderProps
	extends React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> {
	/** How the value should be read out, when the number alone doesn't say it. */
	valueText?: string;
}

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
const SliderThumb = React.forwardRef<
	React.ElementRef<typeof SliderPrimitive.Thumb>,
	React.ComponentPropsWithoutRef<typeof SliderPrimitive.Thumb>
>(({ className, ...props }, ref) => (
	<SliderPrimitive.Thumb
		ref={ref}
		{...props}
		className="group/thumb relative block size-0 focus-visible:outline-none"
	>
		<span
			className={cn(
				"absolute left-0 top-0 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/50 bg-background shadow transition-colors group-focus-visible/thumb:ring-1 group-focus-visible/thumb:ring-ring",
				className,
			)}
		/>
	</SliderPrimitive.Thumb>
));
SliderThumb.displayName = SliderPrimitive.Thumb.displayName;

const Slider = React.forwardRef<
	React.ElementRef<typeof SliderPrimitive.Root>,
	SliderProps
>(
	(
		{
			className,
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
		},
		ref,
	) => (
		<SliderPrimitive.Root
			ref={ref}
			className={cn(
				// The height is the thumb's, which no longer sets it: it is the band
				// the pointer can grab, and the track alone would leave 6px of it.
				"relative flex h-4 w-full touch-none select-none items-center data-[disabled]:opacity-50",
				className,
			)}
			{...props}
		>
			<SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-primary/20">
				<SliderPrimitive.Range className="absolute h-full bg-primary" />
			</SliderPrimitive.Track>
			<SliderThumb
				aria-label={ariaLabel}
				aria-labelledby={ariaLabelledBy}
				aria-describedby={ariaDescribedBy}
				aria-valuetext={valueText}
			/>
		</SliderPrimitive.Root>
	),
);
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider, SliderThumb };
