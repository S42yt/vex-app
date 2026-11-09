import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Group({
	title,
	description,
	action,
	children,
}: {
	title: string;
	description: string;
	action?: (labelling: Labelling) => ReactNode;
	children?: ReactNode;
}) {
	const id = useId();
	const titleId = `${id}-title`;
	const descriptionId = `${id}-description`;

	return (
		<section className="overflow-hidden rounded-lg border bg-background/40">
			<div className="flex items-center gap-6 px-4 py-3">
				<div className="min-w-0 flex-1">
					<h3 id={titleId} className="text-sm font-semibold">
						{title}
					</h3>
					<p id={descriptionId} className="mt-0.5 text-xs text-muted-foreground">
						{description}
					</p>
				</div>
				{action && (
					<div className="shrink-0">
						{action({
							"aria-labelledby": titleId,
							"aria-describedby": descriptionId,
						})}
					</div>
				)}
			</div>
			{children && <div className="divide-y border-t">{children}</div>}
		</section>
	);
}

export interface Labelling {
	"aria-labelledby": string;
	"aria-describedby"?: string;
}

export function SettingRow({
	label,
	hint,
	control,
}: {
	label: string;
	hint?: string;
	control?: (labelling: Labelling) => ReactNode;
}) {
	const id = useId();
	const labelId = `${id}-label`;
	const hintId = `${id}-hint`;

	return (
		<div className="flex items-center gap-6 px-4 py-3">
			<div className="min-w-0 flex-1">
				<p id={labelId} className="text-sm">
					{label}
				</p>
				{hint && (
					<p
						id={hintId}
						className="mt-0.5 text-xs leading-relaxed text-muted-foreground"
					>
						{hint}
					</p>
				)}
			</div>
			{control && (
				<div className="shrink-0">
					{control({
						"aria-labelledby": labelId,
						"aria-describedby": hint ? hintId : undefined,
					})}
				</div>
			)}
		</div>
	);
}

export function Toggle({
	checked,
	onChange,
	...labelling
}: {
	checked: boolean;
	onChange: (next: boolean) => void;
} & Labelling) {
	return (
		<button
			type="button"
			role="switch"
			aria-checked={checked}
			onClick={() => onChange(!checked)}
			className={cn(
				"relative h-6 w-11 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
				checked
					? "bg-primary"
					: "bg-black/30 shadow-[inset_0_1px_2px_rgb(0_0_0/0.55)] ring-1 ring-inset ring-foreground/[0.06]",
			)}
			{...labelling}
		>
			<span
				aria-hidden="true"
				className={cn(
					"absolute left-0 top-1/2 block h-5 w-5 -translate-y-1/2 rounded-full shadow-lg shadow-black/50 ring-1 ring-inset transition-transform duration-200 ease-out motion-reduce:transition-none",
					checked
						? "translate-x-[22px] bg-background ring-black/10"
						: "translate-x-0.5 bg-gradient-to-b from-muted to-muted/60 ring-foreground/15",
				)}
			/>
		</button>
	);
}
