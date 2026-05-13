import { createContext, useContext, useEffect, useState } from 'react'

const ThemeContext = createContext(null)

export const THEMES = {
  wandr: {
    key: 'wandr',
    label: 'Wandr Classic',
    emoji: '🌊',
    preview: ['#20878E', '#F6E3D6', '#92C4C6'],
  },
  midnight: {
    key: 'midnight',
    label: 'Velvet Dusk',
    emoji: '🕯️',
    preview: ['#C0623A', '#1C1008', '#D4956E'],
  },
  'dunes-light': {
    key: 'dunes-light',
    label: 'Golden Dunes',
    emoji: '🏜️',
    preview: ['#C97A2C', '#FAF2E4', '#F0C88A'],
  },
  'dunes-dark': {
    key: 'dunes-dark',
    label: 'Dunes Night',
    emoji: '🌙',
    preview: ['#D4883A', '#1A1208', '#F0C88A'],
  },
  'jungle-light': {
    key: 'jungle-light',
    label: 'Jungle Canopy',
    emoji: '🌿',
    preview: ['#2A6B3C', '#EFF7F0', '#8DC99A'],
  },
  'jungle-dark': {
    key: 'jungle-dark',
    label: 'Jungle Night',
    emoji: '🦜',
    preview: ['#3A8050', '#0A1A10', '#8DC99A'],
  },
  'amalfi-light': {
    key: 'amalfi-light',
    label: 'Amalfi Sunset',
    emoji: '🍋',
    preview: ['#C94F2A', '#FFF5F0', '#F5A68A'],
  },
  'amalfi-dark': {
    key: 'amalfi-dark',
    label: 'Amalfi Night',
    emoji: '🌅',
    preview: ['#D46040', '#1A0C08', '#F5A68A'],
  },
  'arctic-light': {
    key: 'arctic-light',
    label: 'Arctic Fjord',
    emoji: '❄️',
    preview: ['#2E6DA4', '#F0F7FC', '#89C4E8'],
  },
  'arctic-dark': {
    key: 'arctic-dark',
    label: 'Arctic Night',
    emoji: '🌌',
    preview: ['#3A82C0', '#070E18', '#89C4E8'],
  },
  'sakura-light': {
    key: 'sakura-light',
    label: 'Cherry Blossom',
    emoji: '🌸',
    preview: ['#B5496A', '#FEF5F7', '#F0A0B8'],
  },
  'sakura-dark': {
    key: 'sakura-dark',
    label: 'Sakura Night',
    emoji: '🏮',
    preview: ['#C45A78', '#180810', '#F0A0B8'],
  },
  'bazaar-light': {
    key: 'bazaar-light',
    label: 'Indigo Bazaar',
    emoji: '🔮',
    preview: ['#4A3A9A', '#F3F2FC', '#9C94D8'],
  },
  'bazaar-dark': {
    key: 'bazaar-dark',
    label: 'Bazaar Night',
    emoji: '✨',
    preview: ['#5A4AB0', '#0C0A1E', '#9C94D8'],
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
