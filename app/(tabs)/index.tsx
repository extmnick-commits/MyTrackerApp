import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import * as Print from 'expo-print';
import { useNavigation } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { deleteDoc, deleteField, doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { CheckCircle2, CheckSquare, Clock, LogOut, MapPin, Printer, Settings, Square, Trash2, TrendingUp, X } from 'lucide-react-native';
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

const USER_ID = "estevan209";

export default function WorkTracker() {
  const navigation = useNavigation();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [rememberMe, setRememberMe] = useState(false);

  // Limits
  const [monthlyLimit, setMonthlyLimit] = useState(75);
  const [monthlyMilesLimit, setMonthlyMilesLimit] = useState(500); // New Miles Goal

  // Current Stats
  const [hoursWorked, setHoursWorked] = useState(0);
  const [monthlyMiles, setMonthlyMiles] = useState(0); // New Miles Total
  const [weeklyTotal, setWeeklyTotal] = useState(0);
  const [weeklyTotalsList, setWeeklyTotalsList] = useState<{ week: string; hrs: number }[]>([]);
  const [workLogs, setWorkLogs] = useState<Record<string, any>>({});
  const [mileageHistory, setMileageHistory] = useState<any[]>([]); // Synced from Tab 2
  
  // Modals
  const [isModalVisible, setModalVisible] = useState(false);
  const [limitModalType, setLimitModalType] = useState<'hours' | 'miles' | null>(null);
  const [isSettingsVisible, setSettingsVisible] = useState(false);
  const [newLimitInput, setNewLimitInput] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [dayMiles, setDayMiles] = useState(0); // Miles for the selected day
  
  // Shift Times
  const [inHour, setInHour] = useState('09');
  const [inMin, setInMin] = useState('00');
  const [inAmPm, setInAmPm] = useState('AM');
  const [outHour, setOutHour] = useState('05');
  const [outMin, setOutMin] = useState('00');
  const [outAmPm, setOutAmPm] = useState('PM');
  const [calculatedShift, setCalculatedShift] = useState(0);

  const now = new Date();
  const currentMonthYear = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
  const [viewedMonthYear, setViewedMonthYear] = useState(currentMonthYear);

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const [yearStr, monthStr] = viewedMonthYear.split('-');
  const displayMonth = `${monthNames[parseInt(monthStr, 10) - 1]} ${yearStr}`;

  useEffect(() => {
    const loadSettings = async () => {
      const savedLogin = await AsyncStorage.getItem('isLoggedIn');
      if (savedLogin === 'true') setIsLoggedIn(true);
      const savedLimit = await AsyncStorage.getItem('monthlyLimit');
      if (savedLimit) setMonthlyLimit(Number(savedLimit));
      const savedMilesLimit = await AsyncStorage.getItem('monthlyMilesLimit');
      if (savedMilesLimit) setMonthlyMilesLimit(Number(savedMilesLimit));
    };
    loadSettings();
  }, []);

  // Listen for mileage history updates from Tab Two whenever this screen comes into focus
  useEffect(() => {
    const loadMileage = async () => {
      try {
        const stored = await AsyncStorage.getItem('@mileage_history');
        if (stored) setMileageHistory(JSON.parse(stored));
      } catch (error) { console.error('Failed to load mileage', error); }
    };
    
    loadMileage(); // Load initially
    const unsubscribe = navigation.addListener('focus', () => {
      loadMileage(); // Reload every time tab is opened
    });
    return unsubscribe;
  }, [navigation]);

  // Calculate monthly miles dynamically based on the viewed calendar month
  useEffect(() => {
    const tripsThisMonth = mileageHistory.filter(t => t.date.startsWith(viewedMonthYear));
    const totalM = tripsThisMonth.reduce((sum, t) => sum + t.miles, 0);
    setMonthlyMiles(totalM);
  }, [mileageHistory, viewedMonthYear]);

  // Fetch Firebase Data
  useEffect(() => {
    if (!isLoggedIn) return;

    const docRef = doc(db, 'users', USER_ID, 'workLogs', viewedMonthYear);
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      const data = docSnap.exists() ? docSnap.data() : {};
      setWorkLogs(data);
      
      let total = 0;
      const weekGroups: Record<string, number> = {};

      Object.entries(data).forEach(([dateStr, log]: [string, any]) => {
        const val = typeof log === 'object' ? (log.totalHours || 0) : Number(log);
        total += val;

        const dayOfMonth = parseInt(dateStr.split('-')[2]);
        const weekNum = Math.ceil(dayOfMonth / 7);
        const weekLabel = `Week ${weekNum}`;
        weekGroups[weekLabel] = (weekGroups[weekLabel] || 0) + val;
      });

      setHoursWorked(total);

      const weeklyArray = Object.keys(weekGroups).map(key => ({
        week: key,
        hrs: weekGroups[key]
      })).sort((a, b) => a.week.localeCompare(b.week));
      
      setWeeklyTotalsList(weeklyArray);

      if (viewedMonthYear === currentMonthYear) {
        const currentWeekNum = Math.ceil(new Date().getDate() / 7);
        const currentWeekLabel = `Week ${currentWeekNum}`;
        setWeeklyTotal(weekGroups[currentWeekLabel] || 0);
      } else {
        setWeeklyTotal(0); 
      }
    });
    return () => unsubscribe();
  }, [viewedMonthYear, isLoggedIn]);

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
      if (rememberMe) await AsyncStorage.setItem('isLoggedIn', 'true');
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Access Denied', 'Incorrect username or password.');
    }
  };

  const handleLogout = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsLoggedIn(false);
    await AsyncStorage.removeItem('isLoggedIn');
  };

  const saveCustomLimit = async () => {
    const parsed = parseInt(newLimitInput);
    if (!isNaN(parsed) && parsed > 0) {
      if (limitModalType === 'hours') {
        setMonthlyLimit(parsed);
        await AsyncStorage.setItem('monthlyLimit', parsed.toString());
      } else {
        setMonthlyMilesLimit(parsed);
        await AsyncStorage.setItem('monthlyMilesLimit', parsed.toString());
      }
      setLimitModalType(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const generatePDF = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    // Map miles by date for the PDF report
    const milesPerDay: Record<string, number> = {};
    mileageHistory.forEach(trip => {
      milesPerDay[trip.date] = (milesPerDay[trip.date] || 0) + trip.miles;
    });

    const sortedLogs = Object.entries(workLogs).sort((a, b) => a[0].localeCompare(b[0]));
    const htmlRows = sortedLogs.map(([date, log]: any) => `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #ddd;">${date}</td>
        <td style="padding: 10px; border-bottom: 1px solid #ddd;">${log.in || 'N/A'}</td>
        <td style="padding: 10px; border-bottom: 1px solid #ddd;">${log.out || 'N/A'}</td>
        <td style="padding: 10px; border-bottom: 1px solid #ddd; font-weight: bold;">${log.totalHours} hrs</td>
        <td style="padding: 10px; border-bottom: 1px solid #ddd; color: #3B82F6; font-weight: bold;">${(milesPerDay[date] || log.miles || 0).toFixed(1)} mi</td>
      </tr>
    `).join('');

    const htmlContent = `
      <html>
        <body style="font-family: sans-serif; padding: 40px;">
          <h1 style="text-align: center;">Work Tracker Report</h1>
          <h2 style="color: #3B82F6; text-align: center;">Month: ${displayMonth}</h2>
          <div style="background: #F8FAFC; padding: 20px; border-radius: 12px; margin-bottom: 30px; border: 1px solid #E2E8F0;">
            <p><strong>Total Hours Worked:</strong> ${hoursWorked.toFixed(1)} / ${monthlyLimit} hrs</p>
            <p><strong>Total Miles Driven:</strong> ${monthlyMiles.toFixed(1)} / ${monthlyMilesLimit} mi</p>
          </div>
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="background: #0F172A; color: white;">
                <th style="padding: 12px; text-align: left;">Date</th>
                <th style="padding: 12px; text-align: left;">In</th>
                <th style="padding: 12px; text-align: left;">Out</th>
                <th style="padding: 12px; text-align: left;">Total Hrs</th>
                <th style="padding: 12px; text-align: left;">Miles</th>
              </tr>
            </thead>
            <tbody>${htmlRows}</tbody>
          </table>
        </body>
      </html>
    `;

    try {
      const file = await Print.printToFileAsync({ html: htmlContent });
      await Sharing.shareAsync(file.uri);
    } catch (error) {
      Alert.alert("PDF Error", "Failed to generate PDF.");
    }
  };

  const handleDayPress = (day: { dateString: string }) => {
    setSelectedDate(day.dateString);
    
    // Sync miles for the exact day selected
    const tripsThisDay = mileageHistory.filter(t => t.date === day.dateString);
    const dayM = tripsThisDay.reduce((sum, t) => sum + t.miles, 0);
    setDayMiles(dayM);

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
      const shiftMonthYear = selectedDate.slice(0, 7);
      const docRef = doc(db, 'users', USER_ID, 'workLogs', shiftMonthYear);
      
      const inTime = `${inHour.padStart(2, '0')}:${inMin.padStart(2, '0')} ${inAmPm}`;
      const outTime = `${outHour.padStart(2, '0')}:${outMin.padStart(2, '0')} ${outAmPm}`;
      
      // Push miles to Firebase together with the hours so data stays fully linked!
      await setDoc(docRef, {
        [selectedDate]: { totalHours: calculatedShift, in: inTime, out: outTime, miles: dayMiles }
      }, { merge: true });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error: any) {
      Alert.alert("Firestore Error", error.message);
    }
  };

  const deleteShift = async () => {
    setModalVisible(false);
    try {
      const shiftMonthYear = selectedDate.slice(0, 7);
      const docRef = doc(db, 'users', USER_ID, 'workLogs', shiftMonthYear);
      await updateDoc(docRef, { [selectedDate]: deleteField() });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } catch (error: any) {
      Alert.alert("Delete Error", error.message);
    }
  };

  const promptWipeMonth = () => {
    setSettingsVisible(false); 
    Alert.alert(
      "Wipe Calendar",
      `Are you sure you want to delete ALL shifts for ${displayMonth}? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Yes, Wipe It", 
          style: "destructive", 
          onPress: async () => {
            try {
              const docRef = doc(db, 'users', USER_ID, 'workLogs', viewedMonthYear);
              await deleteDoc(docRef);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch (error: any) {
              Alert.alert("Wipe Error", error.message);
            }
          }
        }
      ]
    );
  };

  const progressHours = Math.min((hoursWorked / monthlyLimit) * 100, 100);
  const colorHours = hoursWorked > monthlyLimit ? "#EF4444" : "#3B82F6";
  
  const progressMiles = Math.min((monthlyMiles / monthlyMilesLimit) * 100, 100);
  const colorMiles = monthlyMiles > monthlyMilesLimit ? "#EF4444" : "#0a7ea4";

  const markedDates: any = {};
  Object.keys(workLogs).forEach(date => markedDates[date] = { marked: true, dotColor: '#3B82F6' });
  if (selectedDate) markedDates[selectedDate] = { ...markedDates[selectedDate], selected: true, selectedColor: '#3B82F6' };

  if (!isLoggedIn) {
    return (
      <KeyboardAvoidingView style={styles.loginContainer} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.loginBox}>
          <Text style={styles.loginTitle}>Estevan Login</Text>
          <TextInput style={styles.loginInput} placeholder="Username" placeholderTextColor="#94A3B8" value={loginUser} onChangeText={setLoginUser} autoCapitalize="none" />
          <TextInput style={styles.loginInput} placeholder="Password" placeholderTextColor="#94A3B8" secureTextEntry value={loginPass} onChangeText={setLoginPass} />
          <TouchableOpacity style={styles.rememberRow} onPress={() => setRememberMe(!rememberMe)} activeOpacity={0.7}>
            {rememberMe ? <CheckSquare color="#3B82F6" size={24} /> : <Square color="#94A3B8" size={24} />}
            <Text style={styles.rememberText}>Remember Me</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.loginButton} onPress={handleLogin}><Text style={styles.loginButtonText}>Access Tracker</Text></TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView>
        <View style={styles.header}>
          <Text style={styles.title}>Work Tracker</Text>
          <View style={styles.headerIcons}>
            <TouchableOpacity onPress={generatePDF} style={{ marginRight: 20 }}><Printer color="#F8FAFC" size={28} /></TouchableOpacity>
            <TouchableOpacity onPress={() => setSettingsVisible(true)} style={{ marginRight: 20 }}><Settings color="#94A3B8" size={28} /></TouchableOpacity>
            <TouchableOpacity onPress={handleLogout}><LogOut color="#EF4444" size={28} /></TouchableOpacity>
          </View>
        </View>
        
        {/* Dual Dashboards Side-by-Side */}
        <View style={styles.dashboardRow}>
          {/* Hours Dashboard */}
          <TouchableOpacity style={styles.dashboardCardHalf} onPress={() => { setNewLimitInput(monthlyLimit.toString()); setLimitModalType('hours'); }}>
            <Svg height="140" width="140" viewBox="0 0 100 100">
              <Circle cx="50" cy="50" r="45" stroke="#1E293B" strokeWidth="8" fill="none" />
              <Circle cx="50" cy="50" r="45" stroke={colorHours} strokeWidth="8" fill="none"
                strokeDasharray={`${progressHours * 2.82} 282`} strokeLinecap="round" transform="rotate(-90 50 50)" />
            </Svg>
            <View style={styles.centerTextSmall}>
              <Text style={styles.hoursTextSmall}>{hoursWorked.toFixed(1)}</Text>
              <Text style={styles.limitTextSmall}>/ {monthlyLimit} h</Text>
            </View>
            <Text style={styles.chartLabel}>Hours</Text>
          </TouchableOpacity>

          {/* Miles Dashboard */}
          <TouchableOpacity style={styles.dashboardCardHalf} onPress={() => { setNewLimitInput(monthlyMilesLimit.toString()); setLimitModalType('miles'); }}>
            <Svg height="140" width="140" viewBox="0 0 100 100">
              <Circle cx="50" cy="50" r="45" stroke="#1E293B" strokeWidth="8" fill="none" />
              <Circle cx="50" cy="50" r="45" stroke={colorMiles} strokeWidth="8" fill="none"
                strokeDasharray={`${progressMiles * 2.82} 282`} strokeLinecap="round" transform="rotate(-90 50 50)" />
            </Svg>
            <View style={styles.centerTextSmall}>
              <Text style={styles.hoursTextSmall}>{monthlyMiles.toFixed(1)}</Text>
              <Text style={styles.limitTextSmall}>/ {monthlyMilesLimit} mi</Text>
            </View>
            <Text style={[styles.chartLabel, { color: '#0a7ea4' }]}>Miles</Text>
          </TouchableOpacity>
        </View>
        
        <View style={styles.statsRow}>
          <View style={styles.statBox}><Clock size={20} color="#94A3B8" /><Text style={styles.statValue}>{(monthlyLimit - hoursWorked).toFixed(1)}</Text><Text style={styles.statLabel}>Remaining Hrs</Text></View>
          <View style={styles.statBox}><TrendingUp size={20} color="#94A3B8" /><Text style={styles.statValue}>{weeklyTotal.toFixed(1)}</Text><Text style={styles.statLabel}>Week Hrs</Text></View>
        </View>
        
        <View style={styles.calendarContainer}>
          <Calendar 
            theme={{ calendarBackground: '#1E293B', dayTextColor: '#F8FAFC', monthTextColor: '#F8FAFC', todayTextColor: '#3B82F6', arrowColor: '#3B82F6' }}
            onDayPress={handleDayPress} 
            markedDates={markedDates}
            onMonthChange={(month) => setViewedMonthYear(month.dateString.slice(0, 7))}
          />
        </View>

        {weeklyTotalsList.length > 0 && (
          <View style={styles.weeklyBreakdownContainer}>
            <Text style={styles.weeklyBreakdownTitle}>{displayMonth} Breakdown</Text>
            {weeklyTotalsList.map((item, index) => (
              <View key={index} style={styles.weekRow}><Text style={styles.weekLabel}>{item.week}</Text><Text style={styles.weekHours}>{item.hrs.toFixed(1)} hrs</Text></View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Settings Modal */}
      <Modal visible={isSettingsVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { borderRadius: 20, margin: 20, paddingBottom: 30 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>App Settings</Text>
              <TouchableOpacity onPress={() => setSettingsVisible(false)}><X color="#94A3B8" size={24} /></TouchableOpacity>
            </View>
            <TouchableOpacity style={[styles.saveButton, { backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#EF4444' }]} onPress={promptWipeMonth}>
              <Text style={[styles.saveButtonText, { color: '#EF4444' }]}>Wipe {displayMonth} Data</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Shift & Miles Logic Modal */}
      <Modal visible={isModalVisible} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Shift: {selectedDate}</Text>
                <View style={{ flexDirection: 'row' }}>
                  {workLogs[selectedDate] && <TouchableOpacity onPress={deleteShift} style={{ marginRight: 20 }}><Trash2 color="#EF4444" size={24} /></TouchableOpacity>}
                  <TouchableOpacity onPress={() => setModalVisible(false)}><X color="#94A3B8" size={24} /></TouchableOpacity>
                </View>
              </View>
              {[ {l: 'Clock In', h: inHour, setH: setInHour, m: inMin, setM: setInMin, ap: inAmPm, t: 'in' as const},
                 {l: 'Clock Out', h: outHour, setH: setOutHour, m: outMin, setM: setOutMin, ap: outAmPm, t: 'out' as const}
              ].map((row, i) => (
                <View key={i} style={styles.timeRow}><Text style={styles.timeLabel}>{row.l}</Text>
                  <View style={styles.timeInputGroup}>
                    <TextInput style={styles.timeInput} keyboardType="number-pad" value={row.h} onChangeText={row.setH} selectTextOnFocus maxLength={2} />
                    <Text style={styles.colon}>:</Text>
                    <TextInput style={styles.timeInput} keyboardType="number-pad" value={row.m} onChangeText={row.setM} selectTextOnFocus maxLength={2} />
                    <TouchableOpacity style={styles.amPmToggle} onPress={() => { if(row.t==='in') setInAmPm(p=>p==='AM'?'PM':'AM'); else setOutAmPm(p=>p==='AM'?'PM':'AM'); }}><Text style={styles.amPmText}>{row.ap}</Text></TouchableOpacity>
                  </View>
                </View>
              ))}
              
              {/* Linked Sync Visual */}
              <View style={styles.durationContainer}>
                <CheckCircle2 color="#3B82F6" size={20} />
                <Text style={styles.durationText}>{calculatedShift} hrs</Text>
                
                <View style={{ width: 25 }} /> 
                
                <MapPin color="#0a7ea4" size={20} />
                <Text style={[styles.durationText, { color: '#0a7ea4' }]}>{dayMiles.toFixed(1)} mi</Text>
              </View>

              <TouchableOpacity style={styles.saveButton} onPress={saveHours}><Text style={styles.saveButtonText}>Save Shift</Text></TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Goal Setter Modal */}
      <Modal visible={limitModalType !== null} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { borderRadius: 20, margin: 20, paddingBottom: 30 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Set Monthly {limitModalType === 'hours' ? 'Hours' : 'Miles'} Goal</Text>
              <TouchableOpacity onPress={() => setLimitModalType(null)}><X color="#94A3B8" size={24} /></TouchableOpacity>
            </View>
            <TextInput style={[styles.loginInput, { textAlign: 'center', fontSize: 24 }]} keyboardType="number-pad" value={newLimitInput} onChangeText={setNewLimitInput} placeholder="Enter number..." />
            <TouchableOpacity style={styles.saveButton} onPress={saveCustomLimit}><Text style={styles.saveButtonText}>Update Goal</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  header: { padding: 24, paddingTop: 60, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerIcons: { flexDirection: 'row', alignItems: 'center' },
  title: { fontSize: 32, fontWeight: 'bold', color: '#F8FAFC' },
  dashboardRow: { flexDirection: 'row', justifyContent: 'space-evenly', marginVertical: 10 },
  dashboardCardHalf: { alignItems: 'center', position: 'relative', width: '45%' },
  centerTextSmall: { position: 'absolute', top: 40, alignItems: 'center' },
  hoursTextSmall: { fontSize: 24, fontWeight: 'bold', color: '#F8FAFC' },
  limitTextSmall: { fontSize: 12, color: '#94A3B8' },
  chartLabel: { color: '#F8FAFC', fontWeight: 'bold', marginTop: 10, fontSize: 16 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 24 },
  statBox: { backgroundColor: '#1E293B', padding: 16, borderRadius: 16, width: '48%', alignItems: 'center' },
  statValue: { fontSize: 24, fontWeight: 'bold', color: '#F8FAFC', marginTop: 8 },
  statLabel: { fontSize: 12, color: '#94A3B8' },
  calendarContainer: { paddingHorizontal: 24, paddingBottom: 20 },
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
  durationContainer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginVertical: 15 },
  durationText: { fontWeight: 'bold', marginLeft: 8, fontSize: 16 },
  saveButton: { backgroundColor: '#3B82F6', padding: 18, borderRadius: 16, alignItems: 'center' },
  saveButtonText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
  loginContainer: { flex: 1, backgroundColor: '#0F172A', justifyContent: 'center', padding: 24 },
  loginBox: { backgroundColor: '#1E293B', padding: 30, borderRadius: 20 },
  loginTitle: { fontSize: 28, fontWeight: 'bold', color: '#F8FAFC', marginBottom: 30, textAlign: 'center' },
  loginInput: { backgroundColor: '#0F172A', color: '#F8FAFC', padding: 16, borderRadius: 12, marginBottom: 16, fontSize: 16 },
  rememberRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, paddingLeft: 5 },
  rememberText: { color: '#94A3B8', fontSize: 16, marginLeft: 10 },
  loginButton: { backgroundColor: '#3B82F6', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 10 },
  loginButtonText: { color: '#FFF', fontWeight: 'bold', fontSize: 18 }
});