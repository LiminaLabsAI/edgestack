"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "../../context/AuthContext";
import {
  LayoutDashboard,
  GitBranch,
  Database,
  Users,
  Coins,
  Settings,
  FileText,
  MessageSquare,
  GitCompare,
  Cpu,
  Server,
  ShieldCheck,
  Globe
} from "lucide-react";

interface SidebarProps {
  notificationCount?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({ notificationCount = 0 }) => {
  const pathname = usePathname();
  const { user, logout, isTauri } = useAuth();

  const navItems = [
    {
      name: "Control Tower",
      href: "/",
      icon: LayoutDashboard
    },
    { name: "Workflows", href: "/workflows", icon: GitBranch },
    {
      name: "Browser Sandbox",
      href: "/browser-runtime",
      icon: Globe,
      hideOnTauri: true
    },
    { name: "Agent Playground", href: "/playground", icon: MessageSquare },
    { name: "Model Registry", href: "/playground?tab=models", icon: Cpu },
    {
      name: "Model Arena",
      href: "/compare",
      icon: GitCompare,
      tooltip: "Compare outputs of models"
    },
    { name: "Agent Metrics", href: "/agents", icon: Users },
    { name: "Governance", href: "/governance", icon: ShieldCheck },
    { name: "Cost Analytics", href: "/costs", icon: Coins },
    { name: "Activity Logs", href: "/logs", icon: FileText },
    { name: "Settings", href: "/settings", icon: Settings }
  ];

  return (
    <aside className="sidebar">
      <div className="flex items-center px-6 py-4 border-b border-gray-200 dark:border-gray-800">
        <img src="/logo.png" alt="PreceptaAI" className="h-8 object-contain dark:brightness-0 dark:invert" />
      </div>
      <nav className="flex-1 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          if (item.hideOnTauri && isTauri) return null;

          const Icon = item.icon;
          const isParentActive =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href));

          return (
            <React.Fragment key={item.name}>
              <Link
                href={item.href}
                className={`nav-item ${isParentActive ? "active" : ""}`}
                title={item.tooltip}
              >
                <Icon className="h-4 w-4" />
                <span>{item.name}</span>
                {item.name === "Activity Logs" && notificationCount > 0 && (
                  <span className="ml-auto flex h-2 w-2 rounded-full bg-red-500" />
                )}
              </Link>
              {item.subItems && (
                <div className="flex flex-row items-center gap-1.5 mt-1 ml-4 pl-3">
                  {item.subItems.map((sub) => {
                    const SubIcon = sub.icon;
                    const isSubActive =
                      pathname === sub.href || pathname.startsWith(sub.href);
                    return (
                      <Link
                        key={sub.name}
                        href={sub.href}
                        className={`nav-item text-[11px] py-1 px-2.5 m-0 ${
                          isSubActive
                            ? "active font-semibold shadow-sm"
                            : "text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 bg-gray-50 dark:bg-gray-900/40 border border-gray-150 dark:border-gray-850"
                        }`}
                        title={sub.tooltip}
                      >
                        <SubIcon className="h-3.5 w-3.5" />
                        <span>{sub.name}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </React.Fragment>
          );
        })}
      </nav>
      {user && (
        <div className="px-4 py-3.5 border-t border-gray-200 dark:border-gray-800 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <img
              src={user.picture || "/logo.png"}
              alt={user.name}
              className="h-8 w-8 rounded-full border border-gray-200 dark:border-gray-800 bg-gray-100 dark:bg-gray-900"
            />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-xs text-gray-900 dark:text-white truncate">
                {user.name}
              </div>
              <div className="text-[10px] text-gray-500 dark:text-gray-500 truncate">
                {user.email}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[10px] text-gray-500 dark:text-gray-400 font-medium">
              <div
                className={`h-1.5 w-1.5 rounded-full ${
                  isTauri ? "bg-amber-500" : "bg-green-500"
                }`}
              />
              <span>{isTauri ? "Tauri Dev Mode" : "Local Core Live"}</span>
            </div>
            {!isTauri && (
              <button
                onClick={logout}
                className="text-[10px] font-semibold text-red-500 hover:text-red-600 transition"
              >
                Log out
              </button>
            )}
          </div>
        </div>
      )}
    </aside>
  );
};
