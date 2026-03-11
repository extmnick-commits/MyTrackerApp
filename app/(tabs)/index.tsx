import * as Haptics from 'expo-haptics';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { CheckCircle2, Clock, TrendingUp, X } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View
} from 'react-native';
import { Calendar } from 'react-native-calendars';
import Svg, { Circle } from 'react-native-svg';
import { db } from '../../firebaseConfig';

// Constants
const MONTHLY_LIMIT = 75;
const USER_ID = "estevan123";

// Type definitions for TypeScript
interface WorkLog {
  totalHours: number;
  in: string;
  out: string;
}

export default function WorkTracker() {
  const [hoursWorked, setHoursWorked] = useState(0);
  const [weeklyTotal, setWeeklyTotal] = useState(0);
  const [workLogs, setWorkLogs] = useState<Record<string, any>>({});
  
  // Modal & Time States
  const [isModalVisible, setModalVisible] = useState(false);
  const [selectedDate, setSelectedDate] = useState('');
  const [inHour, setInHour] = useState('09');
  const [inMin, setInMin] = useState('00');
  const [inAmPm, setInAmPm] = useState('AM');
  const [outHour, setOutHour] = useState('05');
  const [outMin, setOutMin] = useState('00');
  const [outAmPm, setOutAmPm] = useState('PM');
  const [calculatedShift, setCalculatedShift] = useState(0);

  const currentMonthYear = new Date().toISOString().slice(0, 7); 

  useEffect(() => {
    const docRef = doc(db, 'users', USER_ID, 'workLogs', currentMonthYear);
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setWorkLogs(data);
        
        const total = Object.values(data).reduce((sum: number, log: any) => {
          const logHours = typeof log === 'object' ? (log.totalHours || 0) : Number(log);
          return sum + logHours;
        }, 0);
        setHoursWorked(total);

        // Weekly Logic
        const today = new Date();
        let weeklySum = 0;
        for(let i = 0; i < 7; i++) {
          const d = new Date(today);
          d.setDate(today.getDate() - i);
          const dateStr = d.toISOString().split('T')[0];
          if(data[dateStr]) {
            weeklySum += typeof data[dateStr] === 'object' ? data[dateStr].totalHours : Number(data[dateStr]);
          }
        }
        setWeeklyTotal(weeklySum);
      }
    });
    return () => unsubscribe();
  }, [currentMonthYear]);

  // Instant math for the shift duration
  useEffect(() => {
    let inH = parseInt(inHour) || 0;
    let outH = parseInt(outHour) || 0;
    if (inAmPm === 'PM' && inH !== 12) inH += 12;
    if (inAmPm === 'AM' && inH === 12) inH = 0;
    if (outAmPm === 'PM' && outH !== 12) outH += 12;
    if (outAmPm === 'AM' && outH === 12) outH = 0;

    let inTime = inH + (parseInt(inMin) || 0) / 60;
    let outTime = outH + (parseInt(outMin) || 0) / 60;
    let diff = outTime - inTime;
    if (diff < 0) diff += 24; 
    setCalculatedShift(Number(diff.toFixed(2)));
  }, [inHour, inMin, inAmPm, outHour, outMin, outAmPm]);

  const toggleAmPm = (type: 'in' | 'out') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (type === 'in') setInAmPm(prev => prev === 'AM' ? 'PM' : 'AM');
    else setOutAmPm(prev => prev === 'AM' ? 'PM' : 'AM');
  };

  const handleDayPress = (day: { dateString: string }) => {
    Haptics.selectionAsync();
    setSelectedDate(day.dateString);
    const existingLog = workLogs[day.dateString];
    if (existingLog && typeof existingLog === 'object') {
      setInHour(existingLog.in.split(':')[0]);
      setInMin(existingLog.in.split(':')[1].split(' ')[0]);
      setInAmPm(existingLog.in.includes('PM') ? 'PM' : 'AM');
      setOutHour(existingLog.out.split(':')[0]);
      setOutMin(existingLog.out.split(':')[1].split(' ')[0]);
      setOutAmPm(existingLog.out.includes('PM') ? 'PM' : 'AM');
    }
    setModalVisible(true);
  };

  const saveHours = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const docRef = doc(db, 'users', USER_ID, 'workLogs', currentMonthYear);
    const formattedIn = `${inHour.padStart(2, '0')}:${inMin.padStart(2, '0')} ${inAmPm}`;
    const formattedOut = `${outHour.padStart(2, '0')}:${outMin.padStart(2, '0')} ${outAmPm}`;

    await setDoc(docRef, {
      [selectedDate]: { totalHours: calculatedShift, in: formattedIn, out: formattedOut }
    }, { merge: true });
    setModalVisible(false);
  };

  const progress = Math.min((hoursWorked / MONTHLY_LIMIT) * 100, 100);
  const progressColor = hoursWorked > MONTHLY_LIMIT ? "#EF4444" : "#3B82F6";

  const markedDates: any = {};
  Object.keys(workLogs).forEach(date => {
    markedDates[date] = { marked: true, dotColor: '#3B82F6' };
  });
  if (selectedDate) markedDates[selectedDate] = { ...markedDates[selectedDate], selected: true, selectedColor: '#3B82F6' };

  return (
    <View style={styles.container}>
      <ScrollView>
        <View style={styles.header}><Text style={styles.title}>Work Tracker</Text></View>
        <View style={styles.dashboardCard}>
          <Svg height="180" width="180" viewBox="0 0 100 100">
            <Circle cx="50" cy="50" r="45" stroke="#1E293B" strokeWidth="8" fill="none" />
            <Circle cx="50" cy="50" r="45" stroke={progressColor} strokeWidth="8" fill="none"
              strokeDasharray={`${progress * 2.82} 282`} strokeLinecap="round" transform="rotate(-90 50 50)" />
          </Svg>
          <View style={styles.centerText}>
            <Text style={styles.hoursText}>{hoursWorked.toFixed(1)}</Text>
            <Text style={styles.limitText}>/ {MONTHLY_LIMIT} hrs</Text>
          </View>
        </View>
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Clock size={20} color="#94A3B8" /><Text style={styles.statValue}>{(MONTHLY_LIMIT - hoursWorked).toFixed(1)}</Text>
            <Text style={styles.statLabel}>Remaining</Text>
          </View>
          <View style={styles.statBox}>
            <TrendingUp size={20} color="#94A3B8" /><Text style={styles.statValue}>{weeklyTotal.toFixed(1)}</Text>
            <Text style={styles.statLabel}>Weekly</Text>
          </View>
        </View>
        <View style={styles.calendarContainer}>
          <Calendar theme={{ calendarBackground: '#1E293B', dayTextColor: '#F8FAFC', monthTextColor: '#F8FAFC' }}
            onDayPress={handleDayPress} markedDates={markedDates} />
        </View>
      </ScrollView>

      <Modal visible={isModalVisible} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Shift: {selectedDate}</Text>
                <TouchableOpacity onPress={() => setModalVisible(false)}><X color="#94A3B8" size={24} /></TouchableOpacity>
              </View>
              {[ {label: 'Clock In', h: inHour, setH: setInHour, m: inMin, setM: setInMin, ap: inAmPm, type: 'in' as const},
                 {label: 'Clock Out', h: outHour, setH: setOutHour, m: outMin, setM: setOutMin, ap: outAmPm, type: 'out' as const}
              ].map((row, i) => (
                <View key={i} style={styles.timeRow}>
                  <Text style={styles.timeLabel}>{row.label}</Text>
                  <View style={styles.timeInputGroup}>
                    <TextInput style={styles.timeInput} keyboardType="number-pad" value={row.h} onChangeText={row.setH} selectTextOnFocus maxLength={2} />
                    <Text style={styles.colon}>:</Text>
                    <TextInput style={styles.timeInput} keyboardType="number-pad" value={row.m} onChangeText={row.setM} selectTextOnFocus maxLength={2} />
                    <TouchableOpacity style={styles.amPmToggle} onPress={() => toggleAmPm(row.type)}><Text style={styles.amPmText}>{row.ap}</Text></TouchableOpacity>
                  </View>
                </View>
              ))}
              <View style={styles.durationContainer}><CheckCircle2 color="#3B82F6" size={20} /><Text style={styles.durationText}>{calculatedShift} hrs</Text></View>
              <TouchableOpacity style={styles.saveButton} onPress={saveHours}><Text style={styles.saveButtonText}>Save Shift</Text></TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  header: { padding: 24, paddingTop: 60 },
  title: { fontSize: 32, fontWeight: 'bold', color: '#F8FAFC' },
  dashboardCard: { alignItems: 'center', marginVertical: 10, position: 'relative' },
  centerText: { position: 'absolute', top: 65, alignItems: 'center' },
  hoursText: { fontSize: 36, fontWeight: 'bold', color: '#F8FAFC' },
  limitText: { fontSize: 14, color: '#94A3B8' },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 24 },
  statBox: { backgroundColor: '#1E293B', padding: 16, borderRadius: 16, width: '48%', alignItems: 'center' },
  statValue: { fontSize: 24, fontWeight: 'bold', color: '#F8FAFC', marginTop: 8 },
  statLabel: { fontSize: 12, color: '#94A3B8' },
  calendarContainer: { padding: 24, paddingBottom: 60 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#1E293B', padding: 30, borderTopLeftRadius: 30, borderTopRightRadius: 30 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 30 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#F8FAFC' },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, backgroundColor: '#0F172A', padding: 12, borderRadius: 12 },
  timeLabel: { color: '#94A3B8', fontWeight: '600' },
  timeInputGroup: { flexDirection: 'row', alignItems: 'center' },
  timeInput: { backgroundColor: '#1E293B', color: '#F8FAFC', fontSize: 18, fontWeight: 'bold', padding: 8, borderRadius: 8, textAlign: 'center', width: 45 },
  colon: { color: '#94A3B8', marginHorizontal: 5, fontWeight: 'bold' },
  amPmToggle: { backgroundColor: '#3B82F6', padding: 10, borderRadius: 8, marginLeft: 10 },
  amPmText: { color: '#FFF', fontWeight: 'bold' },
  durationContainer: { flexDirection: 'row', justifyContent: 'center', marginVertical: 15 },
  durationText: { color: '#3B82F6', fontWeight: 'bold', marginLeft: 8 },
  saveButton: { backgroundColor: '#3B82F6', padding: 18, borderRadius: 16, alignItems: 'center' },
  saveButtonText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 }
});