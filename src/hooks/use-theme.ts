import { useEffect, useState } from "react";

export type Theme = "dark" | "light" | "sepia";

export function useTheme() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const saved = (localStorage.getItem("umbra-theme") as Theme | null) || "dark";
    setTheme(saved);
  }, []);

  const apply = (t: Theme) => {
    setTheme(t);
    localStorage.setItem("umbra-theme", t);
    document.documentElement.classList.remove("dark", "light", "sepia");
    document.documentElement.classList.add(t);
  };

  return { theme, setTheme: apply };
}
