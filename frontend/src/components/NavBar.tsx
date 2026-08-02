import { NavLink } from "react-router-dom";

const links: Array<{ to: string; label: string; end?: boolean }> = [
  { to: "/", label: "Libraries", end: true },
  { to: "/search", label: "Search" },
];

export function NavBar() {
  return (
    <header className="sticky top-0 z-40 border-b border-neutral-800 bg-neutral-950/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-8 px-4 py-3 sm:px-6">
        <NavLink to="/" className="text-lg font-bold tracking-tight text-[var(--color-jelly-accent)]">
          JellyDrop
        </NavLink>
        <nav className="flex gap-6">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                `text-sm font-medium transition-colors ${isActive ? "text-white" : "text-neutral-400 hover:text-neutral-200"}`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  );
}
