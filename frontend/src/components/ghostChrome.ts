import { cn } from "@/lib/utils";

// The ghost button sets its hover under dark:, so the tint is restated there to win.
export const GHOST_TINT = "hover:bg-foreground/10 dark:hover:bg-foreground/10";

export const BAR_GHOST = cn(
	GHOST_TINT,
	"hover:text-foreground active:bg-foreground/15 dark:active:bg-foreground/15",
);

export const BAR_SLIDER = "**:data-[slot=slider-track]:bg-foreground/20";

export const modeToggle = (engaged: boolean): string =>
	cn(BAR_GHOST, engaged ? "text-primary" : "text-muted-foreground");
