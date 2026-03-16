export function mount(el) {
	el.addEventListener("click", () => {
		const isDark = document.documentElement.classList.toggle("dark");
		localStorage.setItem("theme", isDark ? "dark" : "light");
	});
}
