import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Tabs } from 'expo-router';
import React from 'react';
import { useSeasonalTheme } from '../../context/SeasonalThemeContext';

function TabBarIcon(props: {
  name: React.ComponentProps<typeof FontAwesome>['name'];
  color: string;
}) {
  return <FontAwesome size={28} style={{ marginBottom: -3 }} {...props} />;
}

export default function TabLayout() {
  const { theme } = useSeasonalTheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.gold,
        tabBarInactiveTintColor: theme.faint,
        headerShown: false,
        tabBarStyle: { backgroundColor: theme.bg, borderTopWidth: 0 },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Tracker',
          tabBarIcon: ({ color }) => <TabBarIcon name="calendar" color={color} />,
        }}
      />
      <Tabs.Screen
        name="two"
        options={{
          title: 'Miles',
          tabBarIcon: ({ color }) => <TabBarIcon name="car" color={color} />,
        }}
      />
    </Tabs>
  );
}