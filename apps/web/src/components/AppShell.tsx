"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { APP_NAME } from "@/lib/app-config";

const NAV_ITEMS = [
  { href: "/", label: "首页" },
  { href: "/templates", label: "模板库" },
  { href: "/projects", label: "我的项目" },
  { href: "/ai", label: "AI 图案" },
  { href: "/scene", label: "场景贴图" },
  { href: "/studio-3d", label: "3D 设计" },
  { href: "/pricing", label: "订阅" },
  { href: "/account", label: "账号" }
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <>
      <header className="app-header">
        <div className="container app-header-inner">
          <Link href="/" className="brand">
            <span className="brand-mark" aria-hidden />
            {APP_NAME}
          </Link>
          <nav className="nav-links" aria-label="主导航">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="nav-link"
                data-active={pathname === item.href}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main>{children}</main>
    </>
  );
}
