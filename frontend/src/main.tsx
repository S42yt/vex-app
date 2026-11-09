import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { presenceService } from "@/api/PresenceService";
import { watchDevicePixelRatio } from "@/lib/devicePixelRatio";
import "./index.css";
import App from "./App";

watchDevicePixelRatio();

presenceService.start();

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
