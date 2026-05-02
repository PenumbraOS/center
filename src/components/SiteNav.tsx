import { NavLink } from "react-router-dom";

interface SiteNavProps {
  /** When true, render inert greyed-out spans instead of routed NavLinks. */
  readonly disabled?: boolean;
}

const ITEMS = [
  { label: "Gallery", to: "/gallery" },
  { label: "Settings", to: "/settings" },
] as const;

export default function SiteNav({ disabled = false }: SiteNavProps) {
  return (
    <nav className="site-nav app-site-nav" aria-label="Primary">
      {ITEMS.map((item) =>
        disabled ? (
          <span
            key={item.to}
            className="nav-link nav-link--disabled"
            aria-disabled="true"
          >
            {item.label}
          </span>
        ) : (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
          >
            {item.label}
          </NavLink>
        ),
      )}
    </nav>
  );
}
