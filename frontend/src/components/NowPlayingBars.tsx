const BAR_DELAYS = ["0s", "-0.3s", "-0.6s", "-0.9s"];

export function NowPlayingBars() {
	return (
		<span
			className="flex h-4 w-4 shrink-0 items-end justify-center gap-[2px]"
			aria-hidden="true"
		>
			{BAR_DELAYS.map((delay) => (
				<span
					key={delay}
					className="h-full w-[2px] origin-bottom rounded-full bg-primary animate-equalize motion-reduce:animate-none"
					style={{ animationDelay: delay }}
				/>
			))}
		</span>
	);
}
