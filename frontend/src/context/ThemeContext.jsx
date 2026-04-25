import { createContext, useContext, useEffect, useState } from 'react'

const ThemeContext = createContext(null)

export const THEMES = {
  wandr: {
    key: 'wandr',
    label: 'Wandr Classic',
    preview: ['#20878E', '#F6E3D6', '#D66F29'],
  },
  midnight: {
    key: 'midnight',
    label: 'Midnight Coast',
    preview: ['#0E7EC0', '#272A35', '#A1B1CC'],
  },
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(
    () => localStorage.getItem('wandr-theme') ?? 'wandr'
  )

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('wandr-theme', theme)
  }, [theme])

  function setTheme(key) {
    if (THEMES[key]) setThemeState(key)
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, themes: THEMES }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
