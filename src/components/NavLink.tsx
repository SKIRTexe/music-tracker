"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * A nav link that knows whether it is the page you are on.
 *
 * The app's tab bar has always marked the current tab in brand purple; the
 * website's nav marked nothing, so every destination looked equally far away.
 * This is the one piece of the tab bar that transfers to a top nav.
 *
 * `/` matches exactly — as a prefix it would light up on every page.
 */
export function NavLink({
  href,
  children,
  className = "",
  ...rest
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
} & React.ComponentProps<typeof Link>) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`transition-colors ${
        active ? "text-brand-500" : "text-zinc-500 hover:text-zinc-200"
      } ${className}`}
      {...rest}
    >
      {children}
    </Link>
  );
}
