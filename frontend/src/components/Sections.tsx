import { Compass, LibraryBig, Settings } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import type { ComponentType, ReactNode } from "react";
import type { SectionName } from "@/api/NavigationService";

export const SECTIONS: Record<
	SectionName,
	{
		label: string;
		Icon: (props: { className?: string }) => ReactNode;
		Aside?: ComponentType;
	}
> = {
	library: { label: "Library", Icon: LibraryBig, Aside: Sidebar },
	discover: { label: "Discover", Icon: Compass },
	settings: { label: "Settings", Icon: Settings },
};

export const SECTION_ORDER = Object.keys(SECTIONS) as SectionName[];
