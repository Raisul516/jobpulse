"use client";

// Top navigation shown on every page. "use client" because it reads the current URL
// (usePathname) to highlight the page you're on, and opens/closes the phone menu.
import { Bell, Briefcase, Link2, LogOut, Menu, Rss, Settings2, User, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { api, UNAUTHORIZED_EVENT } from "../lib/api";

const LINKS = [
  { href: "/", label: "Jobs", icon: Briefcase },
  { href: "/saved", label: "Applications", icon: Bell },
  { href: "/profile", label: "My profile", icon: User },
  { href: "/preferences", label: "Preferences", icon: Settings2 },
  { href: "/sources", label: "Sources", icon: Rss },
];

export default function NavBar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const router = useRouter();

  async function logout() {
    setOpen(false);
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT)); // the login gate re-checks and shows the login form
    router.push("/");
  }

  const linkClass = (active: boolean) =>
    `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
      active ? "bg-brand-soft text-brand-ink" : "text-muted hover:bg-surface-2 hover:text-ink"
    }`;

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/80 backdrop-blur">
      <nav className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-2.5 sm:px-6">
        <Link href="/" className="mr-auto flex items-center gap-2 font-bold tracking-tight" onClick={() => setOpen(false)}>
          <Image src="/icon-192.png" alt="" width={28} height={28} className="rounded-lg" />
          <span className="text-lg">JobPulse</span>
        </Link>

        {/* desktop */}
        <div className="hidden items-center gap-1 lg:flex">
          {LINKS.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined} className={linkClass(pathname === href)}>
              <Icon size={16} aria-hidden />
              {label}
            </Link>
          ))}
        </div>
        <Link href="/import" className="btn btn-primary btn-sm hidden sm:inline-flex">
          <Link2 size={16} aria-hidden />
          Add from link
        </Link>
        <button type="button" onClick={logout} className="btn btn-ghost btn-sm hidden lg:inline-flex" title="Log out" aria-label="Log out">
          <LogOut size={16} aria-hidden />
        </button>

        {/* phone / tablet */}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={open ? "Close menu" : "Open menu"}
          className="btn btn-ghost btn-sm lg:hidden"
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </nav>

      {open ? (
        <div className="border-t border-line bg-surface px-4 py-3 lg:hidden">
          <div className="mx-auto grid max-w-5xl gap-1">
            {[...LINKS, { href: "/import", label: "Add from link", icon: Link2 }].map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                aria-current={pathname === href ? "page" : undefined}
                className={linkClass(pathname === href)}
              >
                <Icon size={18} aria-hidden />
                {label}
              </Link>
            ))}
            <button type="button" onClick={logout} className={`${linkClass(false)} w-full`}>
              <LogOut size={18} aria-hidden />
              Log out
            </button>
          </div>
        </div>
      ) : null}
    </header>
  );
}
