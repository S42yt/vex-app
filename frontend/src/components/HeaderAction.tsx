import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface HeaderActionProps extends ComponentPropsWithoutRef<"button"> {
	icon: ReactNode;
	label: string;
}

export function HeaderAction({
	icon,
	label,
	className,
	...props
}: HeaderActionProps) {
	return (
		<Button
			variant="ghost"
			className={cn(
				"group h-9 shrink-0 gap-0 rounded-lg px-2.5 text-muted-foreground hover:bg-foreground/10 hover:text-foreground",
				className,
			)}
			{...props}
		>
			{icon}
			<span className="grid grid-cols-[0fr] transition-[grid-template-columns] duration-200 ease-out group-hover:grid-cols-[1fr] group-focus-visible:grid-cols-[1fr] motion-reduce:transition-none">
				<span className="overflow-hidden">
					<span className="block whitespace-nowrap pl-2 pr-0.5">{label}</span>
				</span>
			</span>
		</Button>
	);
}
