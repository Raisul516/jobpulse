"use client";

// Top navigation shown on every page. "use client" because it reads the current URL
// (usePathname) to highlight the page you're on.
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Jobs" },
  { href: "/saved", label: "My applications" },
  { href: "/profile", label: "My profile" },
  { href: "/preferences", label: "Preferences" },
  { href: "/sources", label: "Sources" },
  { href: "/import", label: "+ Add from link" },
];

export default function NavBar() {
  const pathname = usePathname();

  return (
    <nav className="border-b">
      <div className="max-w-3xl mx-auto px-6 py-3 flex flex-wrap items-center gap-x-5 gap-y-2">
        <Link href="/" className="font-bold text-lg mr-auto">
          JobPulse
        </Link>
        {LINKS.map((link) => {
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={active ? "font-semibold underline underline-offset-4" : "hover:underline"}
            >
              {link.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
