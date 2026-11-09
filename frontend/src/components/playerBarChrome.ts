import { cn } from "@/lib/utils";

export const BAR_GHOST =
	"hover:bg-foreground/10 hover:text-foreground active:bg-foreground/15";

export const modeToggle = (engaged: boolean): string =>
	cn(BAR_GHOST, engaged ? "text-primary" : "text-muted-foreground");
