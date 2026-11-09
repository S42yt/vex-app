import type { CSSProperties } from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { Group, Toggle } from "@/components/SettingsControls";
import { Button } from "@/components/ui/button";
import { SliderThumb } from "@/components/ui/slider";
import { useEqualizer } from "@/hooks/useEqualizer";
import { cn } from "@/lib/utils";
import {
	EQ_BANDS,
	EQ_GAIN_LIMIT_DB,
	EQ_GAIN_STEP_DB,
} from "@/player/Equalizer";

export function EqualizerPanel() {
	const { state, equalizer } = useEqualizer();
	const off = !state.enabled;
	const flat = state.gains.every((gain) => gain === 0);

	return (
		<Group
			title="Equalizer"
			description="Ten bands from deep bass up to the top of the treble."
			action={(labelling) => (
				<div className="flex items-center gap-2">
					<Button
						variant="ghost"
						size="sm"
						disabled={off || flat}
						onClick={() => equalizer.reset()}
						className="text-muted-foreground hover:text-foreground"
					>
						Reset
					</Button>
					<Toggle
						checked={state.enabled}
						onChange={(next) => equalizer.setEnabled(next)}
						{...labelling}
					/>
				</div>
			)}
		>
			<Bank
				gains={state.gains}
				disabled={off}
				onChange={(index, db) => equalizer.setBandGain(index, db)}
			/>
		</Group>
	);
}

const COLUMNS: CSSProperties = {
	gridTemplateColumns: `repeat(${EQ_BANDS.length}, minmax(0, 1fr))`,
};

function Bank({
	gains,
	disabled,
	onChange,
}: {
	gains: readonly number[];
	disabled: boolean;
	onChange: (index: number, db: number) => void;
}) {
	return (
		<div
			className={cn(
				"flex flex-col gap-2.5 px-4 py-4 transition-opacity",
				disabled && "opacity-40",
			)}
		>
			<div className="grid" style={COLUMNS}>
				{EQ_BANDS.map((hz, index) => (
					<span
						key={hz}
						className={cn(
							"text-center text-[11px] leading-none tabular-nums",
							gains[index] === 0
								? "text-muted-foreground/40"
								: "text-foreground",
						)}
					>
						{formatDb(gains[index])}
					</span>
				))}
			</div>

			<div className="relative h-36">
				<Curve gains={gains} />
				<div className="relative grid h-full" style={COLUMNS}>
					{EQ_BANDS.map((hz, index) => (
						<Fader
							key={hz}
							value={gains[index]}
							label={`${hz} Hz band`}
							disabled={disabled}
							onChange={(db) => onChange(index, db)}
						/>
					))}
				</div>
			</div>

			<div className="grid" style={COLUMNS}>
				{EQ_BANDS.map((hz) => (
					<span
						key={hz}
						className="text-center text-[11px] leading-none text-muted-foreground"
					>
						{formatHz(hz)}
					</span>
				))}
			</div>
		</div>
	);
}

function Fader({
	value,
	label,
	disabled,
	onChange,
}: {
	value: number;
	label: string;
	disabled: boolean;
	onChange: (db: number) => void;
}) {
	const fraction = (value + EQ_GAIN_LIMIT_DB) / (EQ_GAIN_LIMIT_DB * 2);
	const percent = (travelled: number) => `${(travelled * 100).toFixed(4)}%`;
	const fill =
		value >= 0
			? { top: percent(1 - fraction), bottom: "50%" }
			: { top: "50%", bottom: percent(fraction) };

	return (
		<SliderPrimitive.Root
			orientation="vertical"
			value={[value]}
			min={-EQ_GAIN_LIMIT_DB}
			max={EQ_GAIN_LIMIT_DB}
			step={EQ_GAIN_STEP_DB}
			disabled={disabled}
			onValueChange={([next]) => onChange(next)}
			className="relative flex h-full touch-none select-none flex-col items-center"
		>
			<SliderPrimitive.Track className="relative h-full w-1 overflow-hidden rounded-full bg-primary/15">
				<span
					aria-hidden="true"
					className="absolute inset-x-0 bg-primary"
					style={fill}
				/>
			</SliderPrimitive.Track>
			<SliderThumb
				aria-label={label}
				aria-valuetext={`${formatDb(value)} decibels`}
			/>
		</SliderPrimitive.Root>
	);
}

function Curve({ gains }: { gains: readonly number[] }) {
	const points = [
		{ x: 0, y: heightOf(gains[0]) },
		...gains.map((gain, index) => ({
			x: ((index + 0.5) / gains.length) * 100,
			y: heightOf(gain),
		})),
		{ x: 100, y: heightOf(gains[gains.length - 1]) },
	];

	return (
		<div className="absolute inset-0">
			<div className="absolute inset-x-0 top-1/2 border-t border-border" />
			<svg
				aria-hidden="true"
				className="absolute inset-0 h-full w-full"
				viewBox="0 0 100 100"
				preserveAspectRatio="none"
			>
				<path
					d={smoothPath(points)}
					fill="none"
					strokeWidth={1.5}
					strokeLinecap="round"
					vectorEffect="non-scaling-stroke"
					className="stroke-primary/50"
				/>
			</svg>
		</div>
	);
}

function heightOf(db: number): number {
	return 50 - (db / EQ_GAIN_LIMIT_DB) * 50;
}

function smoothPath(points: { x: number; y: number }[]): string {
	const at = (value: number) => value.toFixed(2);
	const inside = (y: number) => at(Math.min(100, Math.max(0, y)));

	let path = `M ${at(points[0].x)} ${at(points[0].y)}`;
	for (let index = 0; index < points.length - 1; index++) {
		const previous = points[index - 1] ?? points[index];
		const from = points[index];
		const to = points[index + 1];
		const next = points[index + 2] ?? to;
		const firstX = at(from.x + (to.x - previous.x) / 6);
		const firstY = inside(from.y + (to.y - previous.y) / 6);
		const secondX = at(to.x - (next.x - from.x) / 6);
		const secondY = inside(to.y - (next.y - from.y) / 6);
		path += ` C ${firstX} ${firstY}, ${secondX} ${secondY}, ${at(to.x)} ${at(to.y)}`;
	}
	return path;
}

function formatDb(db: number): string {
	const value = Number.isInteger(db) ? String(db) : db.toFixed(1);
	return db > 0 ? `+${value}` : value;
}

function formatHz(hz: number): string {
	return hz >= 1000 ? `${hz / 1000}k` : String(hz);
}
