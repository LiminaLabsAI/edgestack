"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import Script from "next/script";
import { Sparkles, Shield, Cpu } from "lucide-react";

// Helper to decode JWT from Google Sign-In
function decodeJwt(token: string) {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error("Failed to decode JWT:", error);
    return null;
  }
}

export default function LoginPage() {
  const { login } = useAuth();
  const [errorMsg, setErrorMsg] = useState("");
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Default fallback client ID for local demonstration
  const defaultClientId = "492495778264-k6nr9redice5lt6l823g15i3e2tfotsf.apps.googleusercontent.com";

  // Watch document theme mode
  useEffect(() => {
    const checkTheme = () => {
      const isDark = document.documentElement.classList.contains("dark");
      setIsDarkMode(isDark);
    };

    checkTheme();

    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    return () => observer.disconnect();
  }, []);

  const initializeGoogleSignIn = () => {
    if (typeof window !== "undefined" && (window as any).google) {
      try {
        (window as any).google.accounts.id.initialize({
          client_id: defaultClientId,
          callback: (response: any) => {
            const credential = response.credential;
            const decoded = decodeJwt(credential);
            if (decoded && decoded.email) {
              login({
                name: decoded.name || decoded.email.split("@")[0],
                email: decoded.email,
                picture: decoded.picture || "/logo.png",
              });
            } else {
              setErrorMsg("Invalid token received from Google authentication.");
            }
          },
        });

        const btnTheme = isDarkMode ? "filled_dark" : "outline";

        (window as any).google.accounts.id.renderButton(
          document.getElementById("google-signin-button"),
          {
            theme: btnTheme,
            size: "large",
            text: "signin_with",
            shape: "pill",
            width: "320",
          }
        );
      } catch (e) {
        console.error("Error initializing Google Sign-In SDK:", e);
      }
    }
  };

  useEffect(() => {
    // Initialize whenever theme mode changes
    initializeGoogleSignIn();
  }, [isDarkMode]);

  const handleSimulateLogin = () => {
    login({
      name: "Guest Explorer",
      email: "guest@preceptaai.com",
      picture: "/logo.png",
    });
  };

  return (
    <>
      <Script
        src="https://accounts.google.com/gsi/client"
        onLoad={initializeGoogleSignIn}
        strategy="lazyOnload"
      />

      <div className="min-h-screen bg-gray-50 dark:bg-[#0F1117] text-gray-900 dark:text-white flex flex-col items-center justify-center relative overflow-hidden font-sans transition-colors duration-200">
        {/* Glow Effects */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-indigo-600/[0.05] dark:bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-1/4 left-1/4 w-[300px] h-[300px] bg-emerald-600/[0.02] dark:bg-emerald-600/5 rounded-full blur-[100px] pointer-events-none" />

        <div className="z-10 w-full max-w-md px-6">
          {/* Logo & Header */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center p-2 mb-2">
              <img src="/logo.png" alt="PreceptaAI Logo" className="h-18 object-contain dark:brightness-0 dark:invert" />
            </div>
            <p className="text-[10px] text-gray-500 dark:text-gray-400 font-bold tracking-widest uppercase">
              YOUR PRIVATE AI BUSINESS HUB
            </p>
          </div>

          {/* Main Card */}
          <div className="bg-white dark:bg-[#161B22] border border-gray-200 dark:border-[#30363D] rounded-3xl p-8 shadow-xl dark:shadow-black/50 relative">
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">Welcome to the Console</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Please log in to manage your local-first agent workflows, nodes, and storage vaults.
                </p>
              </div>

              {errorMsg && (
                <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-500/30 text-red-750 dark:text-red-400 px-4 py-2.5 rounded-xl text-xs flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500 flex-shrink-0" />
                  {errorMsg}
                </div>
              )}

              {/* Google Sign-in Button */}
              <div className="flex flex-col items-center justify-center py-2">
                <div id="google-signin-button" className="min-h-[44px]" />
                <span className="text-[10px] text-gray-400 dark:text-gray-500 mt-3 flex items-center gap-1">
                  <Shield className="h-3 w-3" /> Secure SSL OAuth 2.0 Endpoint
                </span>
              </div>

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="h-[1px] bg-gray-200 dark:bg-gray-800 flex-1" />
                <span className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-widest font-bold">Or</span>
                <div className="h-[1px] bg-gray-200 dark:bg-gray-800 flex-1" />
              </div>

              {/* Simulation Option */}
              <div className="space-y-3">
                <button
                  onClick={handleSimulateLogin}
                  className="w-full py-2.5 rounded-xl text-xs font-semibold bg-gray-50 hover:bg-gray-100 dark:bg-[#1C2128] dark:hover:bg-gray-800 border border-gray-200 dark:border-[#30363D] text-gray-700 dark:text-gray-300 transition flex items-center justify-center gap-2"
                >
                  <Cpu className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  Explore Console (Demo Mode)
                </button>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 text-center leading-relaxed">
                  Bypass Google Sign-In for evaluating client features and local dashboard widgets.
                </p>
              </div>
            </div>

            {/* Footer Version Info */}
            <div className="mt-8 border-t border-gray-150 dark:border-gray-800 pt-4 flex justify-between items-center text-[10px] text-gray-400 dark:text-gray-500">
              <span className="font-bold flex items-center gap-1">
                <Shield className="h-3.5 w-3.5" />
                PreceptaAI Console
              </span>
              <span>v1.0.0</span>
            </div>
          </div>

          {/* Footer Features */}
          <div className="grid grid-cols-3 gap-4 mt-8 text-center text-gray-400 dark:text-gray-500 text-[10px]">
            <div className="flex flex-col items-center">
              <div className="h-7 w-7 rounded-lg bg-white dark:bg-[#161B22] border border-gray-200 dark:border-gray-800 flex items-center justify-center mb-1.5">
                <Shield className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <span>Self-Hosted</span>
            </div>
            <div className="flex flex-col items-center">
              <div className="h-7 w-7 rounded-lg bg-white dark:bg-[#161B22] border border-gray-200 dark:border-gray-800 flex items-center justify-center mb-1.5">
                <Cpu className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <span>Local Inference</span>
            </div>
            <div className="flex flex-col items-center">
              <div className="h-7 w-7 rounded-lg bg-white dark:bg-[#161B22] border border-gray-200 dark:border-gray-800 flex items-center justify-center mb-1.5">
                <Sparkles className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <span>Private Vaults</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
