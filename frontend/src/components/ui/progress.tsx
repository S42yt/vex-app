import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";

import { cn } from "@/lib/utils";

const Progress = React.forwardRef<
	React.ElementRef<typeof ProgressPrimitive.Root>,
	React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root>
>(({ className, value, ...props }, ref) => (
	<ProgressPrimitive.Root
		ref={ref}
		className={cn(
			"relative h-2 w-full overflow-hidden rounded-full bg-primary/20",
			className,
		)}
		value={value}
		{...props}
	>
		{/* Deviation from stock shadcn: a null value (Radix "indeterminate")
		    renders a pulsing full-width bar instead of an empty track. */}
		<ProgressPrimitive.Indicator
			className="h-full w-full flex-1 bg-primary transition-all data-[state=indeterminate]:animate-pulse data-[state=indeterminate]:bg-primary/50"
			style={{
				transform:
					value == null ? undefined : `translateX(-${100 - value}%)`,
			}}
		/>
	</ProgressPrimitive.Root>
));
Progress.displayName = ProgressPrimitive.Root.displayName;

export { Progress };
