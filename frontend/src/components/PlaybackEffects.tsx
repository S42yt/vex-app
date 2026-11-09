import { memo, useId, type ReactNode } from "react";
import { Gauge, RotateCcw } from "lucide-react";
import { modeToggle } from "@/components/playerBarChrome";
import { Toggle, type Labelling } from "@/components/SettingsControls";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { useEffects } from "@/hooks/useEffects";
import { RATE_MAX, RATE_MIN, RATE_STEP } from "@/player/Effects";

function EffectRow({
	label,
	readout,
	action,
	children,
}: {
	label: string;
	readout?: string;
	action?: (labelling: Labelling) => ReactNode;
	children?: (labelling: Labelling) => ReactNode;
}) {
	const labelId = useId();
	const labelling: Labelling = { "aria-labelledby": labelId };
	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between gap-2">
				<span id={labelId} className="text-sm font-medium">
					{label}
				</span>
				<div className="flex items-center gap-1">
					{readout !== undefined && (
						<span className="text-xs tabular-nums text-muted-foreground">
							{readout}
						</span>
					)}
					{action?.(labelling)}
				</div>
			</div>
			{children?.(labelling)}
		</div>
	);
}

export const PlaybackEffects = memo(function PlaybackEffects() {
	const { state, effects } = useEffects();
	const drivePercent = Math.round(state.drive * 100);
	const reverbPercent = Math.round(state.reverbMix * 100);
	const engaged = state.rate !== 1 || state.drive > 0 || state.reverbMix > 0;

	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					aria-label="Playback effects"
					className={modeToggle(engaged)}
				>
					<Gauge className="h-5 w-5" />
				</Button>
			</PopoverTrigger>
			<PopoverContent side="top" align="end" className="space-y-4">
				<div className="flex items-center justify-between gap-2">
					<span className="text-sm font-semibold">Effects</span>
					<Button
						variant="ghost"
						size="icon"
						aria-label="Reset effects"
						disabled={!engaged}
						onClick={() => effects.reset()}
						className="-my-1 h-6 w-6 text-muted-foreground hover:text-foreground"
					>
						<RotateCcw className="h-3.5 w-3.5" />
					</Button>
				</div>

				<EffectRow label="Speed" readout={`${state.rate.toFixed(2)}×`}>
					{(labelling) => (
						<Slider
							value={[state.rate]}
							min={RATE_MIN}
							max={RATE_MAX}
							step={RATE_STEP}
							onValueChange={([value]) => effects.setRate(value)}
							valueText={`${state.rate.toFixed(2)} times`}
							{...labelling}
						/>
					)}
				</EffectRow>

				<EffectRow
					label="Keep pitch"
					action={(labelling) => (
						<Toggle
							checked={state.preservePitch}
							onChange={(next) => effects.setPreservePitch(next)}
							{...labelling}
						/>
					)}
				/>

				<Separator />

				<EffectRow label="Drive" readout={`${drivePercent}%`}>
					{(labelling) => (
						<Slider
							value={[state.drive]}
							max={1}
							step={0.01}
							onValueChange={([value]) => effects.setDrive(value)}
							valueText={`${drivePercent} percent`}
							{...labelling}
						/>
					)}
				</EffectRow>

				<EffectRow label="Reverb" readout={`${reverbPercent}%`}>
					{(labelling) => (
						<Slider
							value={[state.reverbMix]}
							max={1}
							step={0.01}
							onValueChange={([value]) => effects.setReverbMix(value)}
							valueText={`${reverbPercent} percent`}
							{...labelling}
						/>
					)}
				</EffectRow>
			</PopoverContent>
		</Popover>
	);
});
