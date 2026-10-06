import { Leaf, Snowflake, Sparkles } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { SeasonalTheme } from '../constants/Theme';

const snowflakes = [
  { top: 18, left: '7%', size: 14, opacity: 0.28 },
  { top: 42, left: '22%', size: 10, opacity: 0.2 },
  { top: 16, left: '48%', size: 16, opacity: 0.32 },
  { top: 38, left: '68%', size: 12, opacity: 0.22 },
  { top: 22, left: '88%', size: 15, opacity: 0.3 },
];

export function SeasonalDecor({ theme }: { theme: SeasonalTheme }) {
  if (theme.id === 'default') return null;

  const Icon = theme.id === 'christmas' ? Snowflake : theme.id === 'fall' ? Leaf : Sparkles;

  return (
    <View style={styles.row}>
      <Icon size={15} color={theme.gold} />
      <Text style={[styles.label, { color: theme.gold }]}>{theme.label}</Text>
      <Icon size={15} color={theme.accent} />
    </View>
  );
}

export function SeasonalSnow({ theme }: { theme: SeasonalTheme }) {
  if (theme.id !== 'christmas') return null;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {snowflakes.map((flake, index) => (
        <View key={index} style={[styles.flake, { top: flake.top, left: flake.left as `${number}%`, opacity: flake.opacity }]}>
          <Snowflake size={flake.size} color={theme.gold} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  flake: {
    position: 'absolute',
  },
});
