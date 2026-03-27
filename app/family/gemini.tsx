import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function GeminiUsage() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Gemini: Show Usage and Quota</Text>
      <Text style={styles.text}>Usage: 0 / 1000</Text>
      <Text style={styles.text}>Quota: 1000 requests per day</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1E293B',
  },
  title: {
    fontSize: 24,
    color: '#F8FAFC',
    marginBottom: 20,
  },
  text: {
    fontSize: 18,
    color: '#94A3B8',
    marginBottom: 10,
  },
});