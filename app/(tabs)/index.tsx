import { Clock, TrendingUp } from 'lucide-react-native'; // [cite: 3, 5]
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Calendar } from 'react-native-calendars';
import Svg, { Circle } from 'react-native-svg';

const MONTHLY_LIMIT = 75; // [cite: 4, 6]

export default function WorkTracker() {
  const [hoursWorked, setHoursWorked] = useState(45); // Mock data for now
  const remainingHours = MONTHLY_LIMIT - hoursWorked; // [cite: 7]
  const progress = (hoursWorked / MONTHLY_LIMIT) * 100;
  
  // Logic: Change progress bar color to red if limit exceeded [cite: 9]
  const progressColor = hoursWorked > MONTHLY_LIMIT ? "#EF4444" : "#3B82F6";

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Work Tracker</Text>
      </View>

      {/* Circular Progress Bar Dashboard [cite: 6] */}
      <View style={styles.dashboardCard}>
        <Svg height="180" width="180" viewBox="0 0 100 100">
          <Circle cx="50" cy="50" r="45" stroke="#334155" strokeWidth="8" fill="none" />
          <Circle
            cx="50" cy="50" r="45"
            stroke={progressColor}
            strokeWidth="8"
            fill="none"
            strokeDasharray={`${progress * 2.82} 282`}
            strokeLinecap="round"
            transform="rotate(-90 50 50)"
          />
        </Svg>
        <View style={styles.centerText}>
          <Text style={styles.hoursText}>{hoursWorked}</Text>
          <Text style={styles.limitText}>/ {MONTHLY_LIMIT} hrs</Text>
        </View>
      </View>

      {/* Stats Summary [cite: 7] */}
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Clock size={20} color="#94A3B8" />
          <Text style={styles.statValue}>{remainingHours > 0 ? remainingHours : 0}</Text>
          <Text style={styles.statLabel}>Hours Remaining</Text>
        </View>
        <View style={styles.statBox}>
          <TrendingUp size={20} color="#94A3B8" />
          <Text style={styles.statValue}>12.5</Text>
          <Text style={styles.statLabel}>Weekly Total</Text>
        </View>
      </View>

      {/* Calendar Integration [cite: 8] */}
      <View style={styles.calendarContainer}>
        <Text style={styles.sectionTitle}>Log Hours</Text>
        <Calendar
          theme={{
            backgroundColor: '#0F172A',
            calendarBackground: '#1E293B',
            textSectionTitleColor: '#94A3B8',
            selectedDayBackgroundColor: '#3B82F6',
            todayTextColor: '#3B82F6',
            dayTextColor: '#F8FAFC',
            monthTextColor: '#F8FAFC',
            arrowColor: '#3B82F6',
          }}
          onDayPress={day => {
            console.log('Selected day for logging:', day.dateString);
          }}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' }, // Deep Blue 
  header: { padding: 24, paddingTop: 60 },
  title: { fontSize: 32, fontWeight: 'bold', color: '#F8FAFC' },
  dashboardCard: { alignItems: 'center', marginVertical: 10, position: 'relative' },
  centerText: { position: 'absolute', top: 65, alignItems: 'center' },
  hoursText: { fontSize: 32, fontWeight: 'bold', color: '#F8FAFC' },
  limitText: { fontSize: 14, color: '#94A3B8' }, // Slate Grey 
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 24 },
  statBox: { backgroundColor: '#1E293B', padding: 16, borderRadius: 16, width: '48%', alignItems: 'center' },
  statValue: { fontSize: 24, fontWeight: 'bold', color: '#F8FAFC', marginTop: 8 },
  statLabel: { fontSize: 12, color: '#94A3B8', marginTop: 4 },
  calendarContainer: { padding: 24, paddingBottom: 40 },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: '#F8FAFC', marginBottom: 16 }
});