import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { deleteField, doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { CheckCircle2, CheckSquare, Clock, Edit3, LogOut, Printer, Square, Trash2, TrendingUp, X } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import {
  Alert,
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

// Updated to the new specific profile
const USER_ID = "estevan209";

export default function WorkTracker() {
  // Login States
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [rememberMe, setRememberMe] = useState(false);

  // Tracker States
  const [monthlyLimit, setMonthlyLimit] = useState(75);
  const [hoursWorked, setHoursWorked] = useState(0);
  const [weeklyTotal, setWeeklyTotal] = useState(0);
  const [weeklyTotalsList, setWeeklyTotalsList] = useState<{ week: string; hrs: number }[]>([]);
  const [workLogs, setWorkLogs] = useState<Record<string, any>>({});
  
  // Modals
  const [isModalVisible, setModalVisible] = useState(false);
  const [isLimitModalVisible, setLimitModalVisible] = useState(false);
  const [newLimitInput, setNewLimitInput] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  
  // Input states
  const [inHour, setInHour] = useState('09');
  const [inMin, setInMin] = useState('00');
  const [inAmPm, setInAmPm] = useState('AM');
  const [outHour, setOutHour] = useState('05');
  const [outMin, setOutMin] = useState('00');
  const [outAmPm, setOutAmPm] = useState('PM');
  const [calculatedShift, setCalculatedShift] = useState(0);

  const currentMonthYear = new Date().toISOString().slice(0, 7); 

  // Check for saved login and limit on mount
  useEffect(() => {
    const loadSettings = async () => {
      const savedLogin = await AsyncStorage.getItem('isLoggedIn');
      if (savedLogin === 'true') setIsLoggedIn(true);

      const savedLimit = await AsyncStorage.getItem('monthlyLimit');
      if (savedLimit) setMonthlyLimit(Number(savedLimit));
    };
    loadSettings();
  }, []);

  // Real-time listener
  useEffect(() => {
    if (!isLoggedIn) return;

    const docRef = doc(db, 'users', USER_ID, 'workLogs', currentMonthYear);
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      const data = docSnap.exists() ? docSnap.data() : {};
      setWorkLogs(data);
      
      let total = 0;
      const weekGroups: Record<string, number> = {};

      Object.entries(data).forEach(([dateStr, log]: [string, any]) => {
        const val = typeof log === 'object' ? (log.totalHours || 0) : Number(log);
        total += val;

        // Calculate Weekly Breakdowns based on day of the month
        const dateObj = new Date(dateStr);
        const weekNum = Math.ceil(dateObj.getDate() / 7);
        const weekLabel = `Week ${weekNum}`;
        weekGroups[weekLabel] = (weekGroups[weekLabel] || 0) + val;
      });

      setHoursWorked(total);

      // Convert week groups to sorted array for display
      const weeklyArray = Object.keys(weekGroups).map(key => ({
        week: key,
        hrs: weekGroups[key]
      })).sort((a, b) => a.week.localeCompare(b.week));
      
      setWeeklyTotalsList(weeklyArray);

      // Example calculation for current week (using Date.now roughly)
      const currentWeekNum = Math.ceil(new Date().getDate() / 7);
      const currentWeekLabel = `Week ${currentWeekNum}`;
      setWeeklyTotal(weekGroups[currentWeekLabel] || 0);

    }, (error) => {
      console.error("Firestore Listener Error:", error);
    });

    return () => unsubscribe();
  }, [currentMonthYear, isLoggedIn]);

  // Time calculation logic
  useEffect(() => {
    let inH = parseInt(inHour) || 0;
    let outH = parseInt(outHour) || 0;
    let inM = parseInt(inMin) || 0;
    let outM = parseInt(outMin) || 0;

    if (inAmPm === 'PM' && inH !== 12) inH += 12;
    if (inAmPm === 'AM' && inH === 12) inH = 0;
    if (outAmPm === 'PM' && outH !== 12) outH += 12;
    if (outAmPm === 'AM' && outH === 12) outH = 0;

    let inTotal = inH + (inM / 60);
    let outTotal = outH + (outM / 60);
    let diff = outTotal - inTotal;
    if (diff < 0) diff += 24; 
    setCalculatedShift(Number(diff.toFixed(2)));
  }, [inHour, inMin, inAmPm, outHour, outMin, outAmPm]);

  const handleLogin = async () => {
    if (loginUser.trim().toLowerCase() === 'estevan209' && loginPass === '1990') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setIsLoggedIn(true);
      if (rememberMe) {
        await AsyncStorage.setItem('isLoggedIn', 'true');
      }
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Access Denied', 'Incorrect username or password.');
    }
  };

  const handleLogout = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsLoggedIn(false);
    setLoginUser('');
    setLoginPass('');
    await AsyncStorage.removeItem('isLoggedIn');
  };

  const saveCustomLimit = async () => {
    const parsed = parseInt(newLimitInput);
    if (!isNaN(parsed) && parsed > 0) {
      setMonthlyLimit(parsed);
      await AsyncStorage.setItem('monthlyLimit', parsed.toString());
      setLimitModalVisible(false);
      setNewLimitInput('');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      Alert.alert("Invalid Input", "Please enter a valid number.");
    }
  };

  const generatePDF = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    // Sort logs by date
    const sortedLogs = Object.entries(workLogs).sort((a, b) => a[0].localeCompare(b[0]));
    
    const htmlRows = sortedLogs.map(([date, log]: any) => `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #ddd;">${date}</td>
        <td style="padding: 10px; border-bottom: 1px solid #ddd;">${log.in || 'N/A'}</td>
        <td style="padding: 10px; border-bottom: 1px solid #ddd;">${log.out || 'N/A'}</td>
        <td style="padding: 10px; border-bottom: 1px solid #ddd; font-weight: bold;">${log.totalHours} hrs</td>
      </tr>
    `).join('');

    const htmlContent = `
      <html>
        <head>
          <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 40px; color: #333; }
            h1 { color: #0F172A; text-align: center; font-size: 32px; }
            h2 { color: #3B82F6; text-align: center; margin-bottom: 40px; }
            .summary-box { background: #F8FAFC; padding: 20px; border-radius: 12px; margin-bottom: 30px; border: 1px solid #E2E8F0; }
            .summary-text { font-size: 18px; margin: 5px 0; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th { background-color: #0F172A; color: white; padding: 12px 10px; text-align: left; }
          </style>
        </head>
        <body>
          <h1>Work Tracker Report</h1>
          <h2>Month: ${currentMonthYear}</h2>
          
          <div class="summary-box">
            <p class="summary-text"><strong>Total Hours Worked:</strong> ${hoursWorked.toFixed(1)} hrs</p>
            <p class="summary-text"><strong>Monthly Goal:</strong> ${monthlyLimit} hrs</p>
            <p class="summary-text"><strong>Remaining Hours:</strong> ${Math.max(monthlyLimit - hoursWorked, 0).toFixed(1)} hrs</p>
          </div>

          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Clock In</th>
                <th>Clock Out</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              ${htmlRows}
            </tbody>
          </table>
        </body>
      </html>
    `;

    try {
      const file = await Print.printToFileAsync({ html: htmlContent, base64: false });
      await Sharing.shareAsync(file.uri, { dialogTitle: 'Share Work Tracker PDF' });
    } catch (error) {
      Alert.alert("PDF Error", "Failed to generate or share PDF.");
    }
  };

  const toggleAmPm = (type: 'in' | 'out') => {
    if (type === 'in') setInAmPm(p => p === 'AM' ? 'PM' : 'AM');
    else setOutAmPm(p => p === 'AM' ? 'PM' : 'AM');
  };

  const handleDayPress = (day: { dateString: string }) => {
    setSelectedDate(day.dateString);
    const log = workLogs[day.dateString];
    if (log && typeof log === 'object' && log.in && log.out) {
      setInHour(log.in.split(':')[0]);
      setInMin(log.in.split(':')[1].split(' ')[0]);
      setInAmPm(log.in.includes('PM') ? 'PM' : 'AM');
      setOutHour(log.out.split(':')[0]);
      setOutMin(log.out.split(':')[1].split(' ')[0]);
      setOutAmPm(log.out.includes('PM') ? 'PM' : 'AM');
    } else {
      setInHour('09'); setInMin('00'); setInAmPm('AM');
      setOutHour('05'); setOutMin('00'); setOutAmPm('PM');
    }
    setModalVisible(true);
  };

  const saveHours = async () => {
    setModalVisible(false); 
    try {
      const docRef = doc(db, 'users', USER_ID, 'workLogs', currentMonthYear);
      const inTime = `${inHour.padStart(2, '0')}:${inMin.padStart(2, '0')} ${inAmPm}`;
      const outTime = `${outHour.padStart(2, '0')}:${outMin.padStart(2, '0')} ${outAmPm}`;

      await setDoc(docRef, {
        [selectedDate]: { 
          totalHours: calculatedShift, 
          in: inTime, 
          out: outTime 
        }
      }, { merge: true });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error: any) {
      Alert.alert("Firestore Error", error.message);
    }
  };

  const deleteShift = async () => {
    setModalVisible(false);
    try {
      const docRef = doc(db, 'users', USER_ID, 'workLogs', currentMonthYear);
      await updateDoc(docRef, {
        [selectedDate]: deleteField()
      });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } catch (error: any) {
      Alert.alert("Delete Error", error.message);
    }
  };

  const progress = Math.min((hoursWorked / monthlyLimit) * 100, 100);
  const progressColor = hoursWorked > monthlyLimit ? "#EF4444" : "#3B82F6";
  const markedDates: any = {};
  Object.keys(workLogs).forEach(date => markedDates[date] = { marked: true, dotColor: '#3B82F6' });
  if (selectedDate) markedDates[selectedDate] = { ...markedDates[selectedDate], selected: true, selectedColor: '#3B82F6' };

  // --- LOGIN SCREEN RENDER ---
  if (!isLoggedIn) {
    return (
      <KeyboardAvoidingView style={styles.loginContainer} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.loginBox}>
          <Text style={styles.loginTitle}>Estevan Login</Text>
          
          <TextInput 
            style={styles.loginInput} 
            placeholder="Username" 
            placeholderTextColor="#94A3B8" 
            value={loginUser} 
            onChangeText={setLoginUser} 
            autoCapitalize="none" 
          />
          
          <TextInput 
            style={styles.loginInput} 
            placeholder="Password" 
            placeholderTextColor="#94A3B8" 
            secureTextEntry 
            value={loginPass} 
            onChangeText={setLoginPass} 
          />

          <TouchableOpacity 
            style={styles.rememberRow} 
            onPress={() => setRememberMe(!rememberMe)}
            activeOpacity={0.7}
          >
            {rememberMe ? <CheckSquare color="#3B82F6" size={24} /> : <Square color="#94A3B8" size={24} />}
            <Text style={styles.rememberText}>Remember Me</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.loginButton} onPress={handleLogin}>
            <Text style={styles.loginButtonText}>Access Tracker</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  // --- MAIN TRACKER RENDER ---
  return (
    <View style={styles.container}>
      <ScrollView>
        <View style={styles.header}>
          <Text style={styles.title}>Work Tracker</Text>
          <View style={styles.headerIcons}>
            <TouchableOpacity onPress={generatePDF} style={{ marginRight: 20 }}>
              <Printer color="#F8FAFC" size={28} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleLogout}>
              <LogOut color="#EF4444" size={28} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.dashboardCard}>
          <Svg height="180" width="180" viewBox="0 0 100 100">
            <Circle cx="50" cy="50" r="45" stroke="#1E293B" strokeWidth="8" fill="none" />
            <Circle cx="50" cy="50" r="45" stroke={progressColor} strokeWidth="8" fill="none"
              strokeDasharray={`${progress * 2.82} 282`} strokeLinecap="round" transform="rotate(-90 50 50)" />
          </Svg>
          <TouchableOpacity 
            style={styles.centerText} 
            onPress={() => {
              setNewLimitInput(monthlyLimit.toString());
              setLimitModalVisible(true);
            }}
          >
            <Text style={styles.hoursText}>{hoursWorked.toFixed(1)}</Text>
            <View style={styles.limitRow}>
              <Text style={styles.limitText}>/ {monthlyLimit} hrs</Text>
              <Edit3 color="#94A3B8" size={12} style={{ marginLeft: 4 }} />
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Clock size={20} color="#94A3B8" /><Text style={styles.statValue}>{(monthlyLimit - hoursWorked).toFixed(1)}</Text>
            <Text style={styles.statLabel}>Remaining</Text>
          </View>
          <View style={styles.statBox}>
            <TrendingUp size={20} color="#94A3B8" /><Text style={styles.statValue}>{weeklyTotal.toFixed(1)}</Text>
            <Text style={styles.statLabel}>Current Week</Text>
          </View>
        </View>

        <View style={styles.calendarContainer}>
          <Calendar 
            theme={{ calendarBackground: '#1E293B', dayTextColor: '#F8FAFC', monthTextColor: '#F8FAFC', todayTextColor: '#3B82F6', arrowColor: '#3B82F6' }}
            onDayPress={handleDayPress} 
            markedDates={markedDates} 
          />
        </View>

        {/* Weekly Breakdown Section */}
        {weeklyTotalsList.length > 0 && (
          <View style={styles.weeklyBreakdownContainer}>
            <Text style={styles.weeklyBreakdownTitle}>Monthly Weekly Breakdown</Text>
            {weeklyTotalsList.map((item, index) => (
              <View key={index} style={styles.weekRow}>
                <Text style={styles.weekLabel}>{item.week}</Text>
                <Text style={styles.weekHours}>{item.hrs.toFixed(1)} hrs</Text>
              </View>
            ))}
          </View>
        )}

      </ScrollView>

      {/* SHIFT LOGIC MODAL */}
      <Modal visible={isModalVisible} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Shift: {selectedDate}</Text>
                <View style={{ flexDirection: 'row' }}>
                  {workLogs[selectedDate] && (
                    <TouchableOpacity onPress={deleteShift} style={{ marginRight: 20 }}>
                      <Trash2 color="#EF4444" size={24} />
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity onPress={() => setModalVisible(false)}><X color="#94A3B8" size={24} /></TouchableOpacity>
                </View>
              </View>
              {[ {l: 'Clock In', h: inHour, setH: setInHour, m: inMin, setM: setInMin, ap: inAmPm, t: 'in' as const},
                 {l: 'Clock Out', h: outHour, setH: setOutHour, m: outMin, setM: setOutMin, ap: outAmPm, t: 'out' as const}
              ].map((row, i) => (
                <View key={i} style={styles.timeRow}>
                  <Text style={styles.timeLabel}>{row.l}</Text>
                  <View style={styles.timeInputGroup}>
                    <TextInput style={styles.timeInput} keyboardType="number-pad" value={row.h} onChangeText={row.setH} selectTextOnFocus maxLength={2} />
                    <Text style={styles.colon}>:</Text>
                    <TextInput style={styles.timeInput} keyboardType="number-pad" value={row.m} onChangeText={row.setM} selectTextOnFocus maxLength={2} />
                    <TouchableOpacity style={styles.amPmToggle} onPress={() => toggleAmPm(row.t)}><Text style={styles.amPmText}>{row.ap}</Text></TouchableOpacity>
                  </View>
                </View>
              ))}
              <View style={styles.durationContainer}><CheckCircle2 color="#3B82F6" size={20} /><Text style={styles.durationText}>{calculatedShift} hrs</Text></View>
              <TouchableOpacity style={styles.saveButton} onPress={saveHours}><Text style={styles.saveButtonText}>Save Shift</Text></TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
      </Modal>

      {/* MONTHLY LIMIT MODAL */}
      <Modal visible={isLimitModalVisible} transparent animationType="fade">
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.modalContent, { borderTopLeftRadius: 20, borderTopRightRadius: 20, borderRadius: 20, margin: 20, paddingBottom: 30 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Set Monthly Goal</Text>
              <TouchableOpacity onPress={() => setLimitModalVisible(false)}><X color="#94A3B8" size={24} /></TouchableOpacity>
            </View>
            <TextInput 
              style={[styles.loginInput, { textAlign: 'center', fontSize: 24, fontWeight: 'bold' }]} 
              keyboardType="number-pad" 
              value={newLimitInput} 
              onChangeText={setNewLimitInput} 
              placeholder="e.g. 75"
              placeholderTextColor="#94A3B8"
            />
            <TouchableOpacity style={styles.saveButton} onPress={saveCustomLimit}>
              <Text style={styles.saveButtonText}>Update Goal</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  header: { padding: 24, paddingTop: 60, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerIcons: { flexDirection: 'row', alignItems: 'center' },
  title: { fontSize: 32, fontWeight: 'bold', color: '#F8FAFC' },
  dashboardCard: { alignItems: 'center', marginVertical: 10, position: 'relative' },
  centerText: { position: 'absolute', top: 60, alignItems: 'center' },
  hoursText: { fontSize: 36, fontWeight: 'bold', color: '#F8FAFC' },
  limitRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  limitText: { fontSize: 14, color: '#94A3B8' },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 24 },
  statBox: { backgroundColor: '#1E293B', padding: 16, borderRadius: 16, width: '48%', alignItems: 'center' },
  statValue: { fontSize: 24, fontWeight: 'bold', color: '#F8FAFC', marginTop: 8 },
  statLabel: { fontSize: 12, color: '#94A3B8' },
  calendarContainer: { paddingHorizontal: 24, paddingBottom: 20 },
  
  // Weekly Breakdown Styles
  weeklyBreakdownContainer: { paddingHorizontal: 24, paddingBottom: 60 },
  weeklyBreakdownTitle: { color: '#F8FAFC', fontSize: 18, fontWeight: 'bold', marginBottom: 10 },
  weekRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#1E293B', padding: 16, borderRadius: 12, marginBottom: 8 },
  weekLabel: { color: '#94A3B8', fontSize: 16, fontWeight: '600' },
  weekHours: { color: '#3B82F6', fontSize: 16, fontWeight: 'bold' },

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
  saveButtonText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
  
  // Login Styles
  loginContainer: { flex: 1, backgroundColor: '#0F172A', justifyContent: 'center', padding: 24 },
  loginBox: { backgroundColor: '#1E293B', padding: 30, borderRadius: 20, shadowColor: '#000', elevation: 10 },
  loginTitle: { fontSize: 28, fontWeight: 'bold', color: '#F8FAFC', marginBottom: 30, textAlign: 'center' },
  loginInput: { backgroundColor: '#0F172A', color: '#F8FAFC', padding: 16, borderRadius: 12, marginBottom: 16, fontSize: 16 },
  rememberRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, paddingLeft: 5 },
  rememberText: { color: '#94A3B8', fontSize: 16, marginLeft: 10 },
  loginButton: { backgroundColor: '#3B82F6', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 10 },
  loginButtonText: { color: '#FFF', fontWeight: 'bold', fontSize: 18 }
});