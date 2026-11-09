import { Events, Call } from "@wailsio/runtime";
import * as Probe from "../bindings/example.com/probe/probeservice";
import * as TypedEvents from "../bindings/events";

// Everything a CDP probe needs, reachable from page.evaluate.
(window as any).probe = { Probe, Events, Call, TypedEvents };
document.getElementById("root")!.textContent = "probe ready";
