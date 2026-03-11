import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Tabs } from 'expo-router';
import React from 'react';

function TabBarIcon(props: {
  name: React.ComponentProps<typeof FontAwesome>['name'];
  color: string;
}) {
  return <FontAwesome size={28} style={{ marginBottom: -3 }} {...props} />;
}

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        // Hides the top header to make the app "full screen"
        headerShown: false, 
        // Optional: keeps the background dark to match your index.tsx
        tabBarStyle: { backgroundColor: '#0F172A', borderTopWidth: 0 }, 
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