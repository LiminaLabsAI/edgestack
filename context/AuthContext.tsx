"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";

interface User {
  name: string;
  email: string;
  picture: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (userData: User) => void;
  logout: () => void;
  isTauri: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isTauri, setIsTauri] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Detect Tauri environment
    const tauriDetected =
      typeof window !== "undefined" && (window as any).__TAURI_IPC__ !== undefined;
    setIsTauri(tauriDetected);

    if (tauriDetected) {
      // In Tauri, auto-authenticate with mock developer user
      setUser({
        name: "Developer Mode",
        email: "dev@preceptaai.com",
        picture: "/favicon.svg",
      });
      setLoading(false);
    } else {
      // Browser environment: load user from localStorage
      const savedUser = localStorage.getItem("preceptaai_user");
      if (savedUser) {
        try {
          setUser(JSON.parse(savedUser));
        } catch (e) {
          console.error("Failed to parse user from localStorage", e);
          localStorage.removeItem("preceptaai_user");
        }
      }
      setLoading(false);
    }
  }, []);

  // Watch for auth state changes to redirect appropriately
  useEffect(() => {
    if (loading) return;

    // Do not redirect if running in Tauri (always authenticated)
    if (isTauri) return;

    if (!user && pathname !== "/login") {
      router.push("/login");
    } else if (user && pathname === "/login") {
      router.push("/");
    }
  }, [user, loading, pathname, isTauri, router]);

  const login = (userData: User) => {
    setUser(userData);
    localStorage.setItem("preceptaai_user", JSON.stringify(userData));
    router.push("/");
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem("preceptaai_user");
    router.push("/login");
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isTauri }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
