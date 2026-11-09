import logoUrl from "@/assets/vex-logo.svg";

export function Logo({ className }: { className?: string }) {
	return <img src={logoUrl} alt="VexWave" className={className} draggable={false} />;
}
