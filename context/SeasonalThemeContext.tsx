import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { currentMonthYear, getSeasonalTheme, SeasonalTheme } from '../constants/Theme';

interface SeasonalThemeContextType {
  monthYear: string;
  setMonthYear: (monthYear: string) => void;
  theme: SeasonalTheme;
}

const SeasonalThemeContext = createContext<SeasonalThemeContextType>({
  monthYear: currentMonthYear(),
  setMonthYear: () => {},
  theme: getSeasonalTheme(currentMonthYear()),
});

export const useSeasonalTheme = () => useContext(SeasonalThemeContext);

export function useViewedSeason(monthYear: string) {
  const { setMonthYear } = useSeasonalTheme();
  const theme = useMemo(() => getSeasonalTheme(monthYear), [monthYear]);

  useEffect(() => {
    setMonthYear(monthYear);
  }, [monthYear, setMonthYear]);

  return theme;
}

export function SeasonalThemeProvider({ children }: { children: React.ReactNode }) {
  const [monthYear, setMonthYear] = useState(currentMonthYear());
  const theme = useMemo(() => getSeasonalTheme(monthYear), [monthYear]);

  const value = useMemo(
    () => ({ monthYear, setMonthYear, theme }),
    [monthYear, theme]
  );

  return <SeasonalThemeContext.Provider value={value}>{children}</SeasonalThemeContext.Provider>;
}
