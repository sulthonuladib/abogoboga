import { Button } from "@lister/ui/components/button"
import { MoonIcon, SunIcon } from "@phosphor-icons/react"
import { useCallback, useEffect, useState } from "react"

const storageKey = "lister-theme"

type Theme = "light" | "dark"

const initialTheme = (): Theme => {
  const stored = globalThis.localStorage.getItem(storageKey)

  if (stored === "light" || stored === "dark") return stored

  return globalThis.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

/**
 * Light/dark switch for the console.
 *
 * The preset ships both token sets; the choice persists per browser and
 * defaults to the operating system preference.
 */
export const ThemeToggle = () => {
  const [theme, setTheme] = useState<Theme>(initialTheme)

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark")
    globalThis.localStorage.setItem(storageKey, theme)
  }, [theme])

  const toggle = useCallback(() => {
    setTheme((current) => (current === "dark" ? "light" : "dark"))
  }, [])

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
    >
      {theme === "dark" ? <SunIcon /> : <MoonIcon />}
    </Button>
  )
}
