"use client";

import { MoonIcon, SunIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

const prefersDark = () => window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;

export function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    setMounted(true);
    const stored = window.localStorage.getItem("theme");
    if (stored === "dark" || (!stored && prefersDark())) {
      setTheme("dark");
    }
  }, []);

  useEffect(() => {
    if (!mounted) {
      return;
    }
    const isDark = theme === "dark";
    document.documentElement.classList.toggle("dark", isDark);
    window.localStorage.setItem("theme", theme);
  }, [theme, mounted]);

  const toggle = () => setTheme((prev) => (prev === "dark" ? "light" : "dark"));

  return (
    <Button
      variant="outline"
      size="icon"
      aria-label="Przełącz motyw"
      onClick={toggle}
      className="shrink-0"
    >
      {theme === "dark" ? <SunIcon className="h-4 w-4" /> : <MoonIcon className="h-4 w-4" />}
    </Button>
  );
}
