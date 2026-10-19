
import { createContext, useContext } from "react";

export type ThemeColors = {
  background: string;
  sidebar: string;
  card: string;
  text: string;
  muted: string;
  border: string;
  active: string;
  success: string;
  danger: string;
};

type ThemeContextValue = {
  darkMode: boolean;
  setDarkMode: (value: boolean) => void;
  colors: ThemeColors;
};

export const ThemeContext =
  createContext<ThemeContextValue | null>(null);

export function useAppTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error(
      "useAppTheme must be used inside ThemeContext.Provider"
    );
  }

  return context;
}
