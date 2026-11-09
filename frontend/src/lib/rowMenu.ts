// Radix's ContextMenuTrigger listens for contextmenu, so a left-click on the
// kebab synthesizes one anchored at the button.
export function openRowMenu(button: HTMLElement) {
	const rect = button.getBoundingClientRect();
	button.dispatchEvent(
		new MouseEvent("contextmenu", {
			bubbles: true,
			clientX: rect.left + rect.width / 2,
			clientY: rect.bottom,
		}),
	);
}
