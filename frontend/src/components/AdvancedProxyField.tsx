import { useId, useState } from "react";
import { ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { PROXY_PLACEHOLDER } from "@/lib/urls";

export function AdvancedProxyField({
	value,
	onChange,
	disabled,
	hint,
}: {
	value: string;
	onChange: (value: string) => void;
	disabled?: boolean;
	hint?: string;
}) {
	const id = useId();
	const [initiallyOpen] = useState(() => value !== "");

	return (
		<details open={initiallyOpen} className="group">
			<summary className="flex w-fit cursor-pointer list-none items-center gap-1 rounded-sm text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
				<ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90 motion-reduce:transition-none" />
				Advanced
			</summary>
			<div className="mt-3 flex flex-col gap-1.5">
				<label htmlFor={id} className="text-sm font-medium leading-none">
					Proxy
				</label>
				<Input
					id={id}
					type="text"
					placeholder={PROXY_PLACEHOLDER}
					value={value}
					onChange={(e) => onChange(e.target.value)}
					disabled={disabled}
				/>
				{hint && <p className="text-xs text-muted-foreground">{hint}</p>}
			</div>
		</details>
	);
}
