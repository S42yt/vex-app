export interface GraphStage {
	attach(context: AudioContext, input: AudioNode): AudioNode;
	release(): void;
}

const RAMP_TAU = 0.01;

export function easeParam(
	param: AudioParam,
	value: number,
	at: number,
	tau = RAMP_TAU,
): void {
	param.setTargetAtTime(value, at, tau);
}

export type ParamWriter = (param: AudioParam, value: number) => void;

export const writeValue: ParamWriter = (param, value) => {
	param.value = value;
};

export const writeRamp =
	(at: number): ParamWriter =>
	(param, value) =>
		easeParam(param, value, at);
