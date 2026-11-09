import { navigationService } from "@/api/NavigationService";
import { SECTIONS, SECTION_ORDER } from "@/components/Sections";
import { useNavigation } from "@/hooks/useNavigation";
import { cn } from "@/lib/utils";
import type { SectionName } from "@/api/NavigationService";

export function ViewSwitch() {
	const { section } = useNavigation();

	return (
		<div
			role="group"
			aria-label="Where to browse"
			className="relative grid"
			style={{
				gridTemplateColumns: `repeat(${SECTION_ORDER.length}, minmax(0, 1fr))`,
			}}
		>
			<Marker index={SECTION_ORDER.indexOf(section)} />
			{SECTION_ORDER.map((name) => (
				<Segment key={name} name={name} active={name === section} />
			))}
		</div>
	);
}

// Width and offset are inline styles because they follow the section count,
// which Tailwind can only generate classes for if it can read it in the source.
function Marker({ index }: { index: number }) {
	const share = `${100 / SECTION_ORDER.length}%`;
	return (
		<span
			aria-hidden="true"
			className="pointer-events-none absolute inset-y-0 left-0 rounded-t-lg rounded-b-[2px] bg-[radial-gradient(125%_95%_at_50%_122%,hsl(var(--nav)/0.55)_0%,hsl(var(--nav)/0.16)_48%,transparent_72%)] shadow-[inset_0_-1px_0_hsl(var(--nav-edge)/0.9)] transition-transform duration-300 ease-swift motion-reduce:transition-none"
			style={{ width: share, transform: `translateX(${index * 100}%)` }}
		/>
	);
}

function Segment({ name, active }: { name: SectionName; active: boolean }) {
	const { label, Icon } = SECTIONS[name];
	return (
		<button
			type="button"
			aria-pressed={active}
			onClick={() => navigationService.showSection(name)}
			className={cn(
				"relative flex h-9 items-center justify-center gap-2 rounded-t-lg rounded-b-[2px] px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
				active
					? "text-foreground"
					: "text-muted-foreground/70 hover:text-foreground/80",
			)}
		>
			<Icon
				className={cn("h-4 w-4 shrink-0 transition-colors", active && "text-nav-bright")}
			/>
			{label}
		</button>
	);
}
