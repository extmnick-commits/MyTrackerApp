import * as Haptics from 'expo-haptics';
import { signOut } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { ChevronRight, LogOut, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { Calendar } from 'react-native-calendars';
import Svg, { Circle } from 'react-native-svg';
import { useAuth } from '../../context/AuthContext';
import { auth, db } from '../../firebaseConfig';

export default function FamilyDashboard() {
  const { user } = useAuth();
  const [caregiverId, setCaregiverId] = useState<string | null>(null);
  
  // Limits
  const [monthlyLimit, setMonthlyLimit] = useState(75);
  const [defaultMonthlyLimit, setDefaultMonthlyLimit] = useState(75);
  const [highlightProjected, setHighlightProjected] = useState(false);

  // Current Stats
  const [hoursWorked, setHoursWorked] = useState(0);
  const [projectedHours, setProjectedHours] = useState(0);
  const [weeklyTotal, setWeeklyTotal] = useState(0);
  const [weeklyTotalsList, setWeeklyTotalsList] = useState<{ week: string; hrs: number }[]>([]);
  const [dailyTotalsList, setDailyTotalsList] = useState<{ date: string; hrs: number }[]>([]);
  const [workLogs, setWorkLogs] = useState<Record<string, any>>({});
  
  // Weekly Breakdown Details State
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
  const [weekLogs, setWeekLogs] = useState<{ date: string; in: string; out: string; hrs: number }[]>([]);

  const now = new Date();
  const currentMonthYear = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
  const [viewedMonthYear, setViewedMonthYear] = useState(currentMonthYear);

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const [yearStr, monthStr] = viewedMonthYear.split('-');
  const displayMonth = `${monthNames[parseInt(monthStr, 10) - 1]} ${yearStr}`;

  useEffect(() => {
    if (!user) return;
    
    const familyDocRef = doc(db, 'familyMembers', user.uid);
    const unsubscribe = onSnapshot(familyDocRef, (docSnap) => {
      if (docSnap.exists()) {
        setCaregiverId(docSnap.data().caregiverId);
      }
    });
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!caregiverId) return;
    const userDocRef = doc(db, 'users', caregiverId);
    const unsubscribe = onSnapshot(userDocRef, (docSnap) => {
      if (docSnap.exists()) {
        setDefaultMonthlyLimit(docSnap.data().monthlyHourLimit || 75);
      }
    });
    return () => unsubscribe();
  }, [caregiverId]);

  useEffect(() => {
    if (!caregiverId) return;

    const docRef = doc(db, 'users', caregiverId, 'workLogs', viewedMonthYear);
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      const data = docSnap.exists() ? docSnap.data() : {};
      const { notes, monthlyHourLimit, monthlyMilesLimit, ...logs } = data; // Also safely extract monthlyMilesLimit
      setWorkLogs(logs);
      setMonthlyLimit(monthlyHourLimit !== undefined ? monthlyHourLimit : defaultMonthlyLimit);
    });
    return () => unsubscribe();
  }, [viewedMonthYear, caregiverId, defaultMonthlyLimit]);

  useEffect(() => {
    const allDates = Object.keys(workLogs).filter(dateStr => dateStr.startsWith(viewedMonthYear));
    let totalActual = 0;
    let totalProjected = 0;
    const weekGroups: Record<string, number> = {};
    const dailyArray: { date: string; hrs: number }[] = [];

    allDates.forEach(dateStr => {
      const log = workLogs[dateStr] || {};
      const hrsVal = typeof log === 'object' ? (log.totalHours || 0) : Number(log);
      const isProj = typeof log === 'object' ? !!log.isProjected : false;
      
      if (isProj) {
        totalProjected += hrsVal;
      } else {
        totalActual += hrsVal;
      }

      if (hrsVal > 0) {
        dailyArray.push({ date: dateStr, hrs: hrsVal });

        const dayOfMonth = parseInt(dateStr.split('-')[2]);
        const weekNum = Math.ceil(dayOfMonth / 7);
        const weekLabel = `Week ${weekNum}`;

        weekGroups[weekLabel] = (weekGroups[weekLabel] || 0) + hrsVal;
      }
    });
    
    setHoursWorked(totalActual);
    setProjectedHours(totalProjected); // Now only shows explicitly projected hours

    const weeklyArray = Object.keys(weekGroups).map(key => ({
      week: key,
      hrs: weekGroups[key]
    })).sort((a, b) => a.week.localeCompare(b.week));
    
    setWeeklyTotalsList(weeklyArray);
    setDailyTotalsList(dailyArray.sort((a, b) => a.date.localeCompare(b.date)));

    if (viewedMonthYear === currentMonthYear) {
      const currentWeekNum = Math.ceil(new Date().getDate() / 7);
      const currentWeekLabel = `Week ${currentWeekNum}`;
      setWeeklyTotal(weekGroups[currentWeekLabel] || 0);
    } else {
      setWeeklyTotal(0); 
    }
  }, [workLogs, viewedMonthYear]);

  // Handle Weekly Logs Sync for Modal
  useEffect(() => {
    if (selectedWeek) {
      const weekNum = parseInt(selectedWeek.replace('Week ', ''));
      const logs = Object.keys(workLogs)
        .filter(dateStr => {
           if (!dateStr.startsWith(viewedMonthYear)) return false; // Safety check
           const day = parseInt(dateStr.split('-')[2]);
           return Math.ceil(day / 7) === weekNum;
        })
        .map(dateStr => {
           const log = workLogs[dateStr];
           return {
             date: dateStr,
             in: log.in || '--',
             out: log.out || '--',
             hrs: log.totalHours || 0
           };
        })
        .sort((a, b) => b.date.localeCompare(a.date));
      setWeekLogs(logs);
    }
  }, [workLogs, selectedWeek]);

  const handleLogout = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await signOut(auth);
  };

  const progressHours = Math.min((hoursWorked / monthlyLimit) * 100, 100);
  const colorHours = hoursWorked > monthlyLimit ? "#10b981" : "#3B82F6"; // Use green if they hit goal
  const progressProjected = Math.min((projectedHours / monthlyLimit) * 100, 100);

  // Projected Remaining calculations
  const totalProjectedConsumed = hoursWorked + projectedHours;
  const projectedRemainingHours = monthlyLimit - totalProjectedConsumed;
  const progressProjRemain = Math.min((totalProjectedConsumed / monthlyLimit) * 100, 100);
  const colorProjRemain = projectedRemainingHours < 0 ? "#EF4444" : "#10B981";

  const markedDates: any = {};
  Object.keys(workLogs).forEach(date => {
    if (!date.startsWith(viewedMonthYear)) return; // Filter out legacy fields/other months
    const isProj = workLogs[date]?.isProjected;
    markedDates[date] = { marked: true, dotColor: isProj ? '#F59E0B' : '#3B82F6', isProj };
  });

  if (!user || !caregiverId) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#F8FAFC" />
        <Text style={{ color: '#94A3B8', marginTop: 15, marginBottom: 30 }}>Loading Caregiver Data...</Text>
        <TouchableOpacity 
          style={{ paddingHorizontal: 20, paddingVertical: 12, backgroundColor: '#1E293B', borderRadius: 8, borderWidth: 1, borderColor: '#334155' }}
          onPress={handleLogout}
        >
          <Text style={{ color: '#EF4444', fontWeight: 'bold' }}>Cancel / Reset Login</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, Platform.OS === 'web' && styles.webContainer]}>
      <ScrollView>
        <View style={styles.header}>
          <Text style={styles.title}>Family View</Text>
          <TouchableOpacity onPress={handleLogout}><LogOut color="#EF4444" size={28} /></TouchableOpacity>
        </View>
        
        <View style={styles.dashboardRow}>
          <View style={styles.dashboardCardThird}>
            <Svg height="100" width="100" viewBox="0 0 100 100">
              <Circle cx="50" cy="50" r="45" stroke="#1E293B" strokeWidth="8" fill="none" />
              <Circle cx="50" cy="50" r="45" stroke={colorHours} strokeWidth="8" fill="none"
                strokeDasharray={`${progressHours * 2.82} 282`} strokeLinecap="round" transform="rotate(-90 50 50)" />
            </Svg>
            <View style={styles.centerTextSmall}>
              <Text style={styles.hoursTextSmall}>{(monthlyLimit - hoursWorked).toFixed(1)}</Text>
            </View>
            <Text style={styles.chartLabel} numberOfLines={1}>Remain</Text>
          </View>

          <TouchableOpacity style={styles.dashboardCardThird} onPress={() => setHighlightProjected(!highlightProjected)} activeOpacity={0.7}>
            <Svg height="100" width="100" viewBox="0 0 100 100">
              <Circle cx="50" cy="50" r="45" stroke="#1E293B" strokeWidth="8" fill="none" />
              <Circle cx="50" cy="50" r="45" stroke="#F59E0B" strokeWidth="8" fill="none"
                strokeDasharray={`${progressProjected * 2.82} 282`} strokeLinecap="round" transform="rotate(-90 50 50)" />
            </Svg>
            <View style={styles.centerTextSmall}>
              <Text style={styles.hoursTextSmall}>{projectedHours.toFixed(1)}</Text>
            </View>
            <Text style={[styles.chartLabel, { color: '#F59E0B' }]} numberOfLines={1}>Projected</Text>
          </TouchableOpacity>

          <View style={styles.dashboardCardThird}>
            <Svg height="100" width="100" viewBox="0 0 100 100">
              <Circle cx="50" cy="50" r="45" stroke="#1E293B" strokeWidth="8" fill="none" />
              <Circle cx="50" cy="50" r="45" stroke={colorProjRemain} strokeWidth="8" fill="none"
                strokeDasharray={`${progressProjRemain * 2.82} 282`} strokeLinecap="round" transform="rotate(-90 50 50)" />
            </Svg>
            <View style={styles.centerTextSmall}>
              <Text style={styles.hoursTextSmall}>{projectedRemainingHours.toFixed(1)}</Text>
            </View>
            <Text style={[styles.chartLabel, { color: colorProjRemain }]} numberOfLines={1}>Proj. Rem</Text>
          </View>
        </View>
        
        <View style={styles.calendarContainer}>
          <Calendar 
            theme={{ calendarBackground: '#1E293B', dayTextColor: '#F8FAFC', monthTextColor: '#F8FAFC', todayTextColor: '#3B82F6', arrowColor: '#3B82F6' }}
            markedDates={markedDates}
            onMonthChange={(month: any) => setViewedMonthYear(month.dateString.slice(0, 7))}
            disableAllTouchEventsForDisabledDays={true}
            dayComponent={({date, state}: any) => {
              const marking = markedDates[date.dateString];
              const isMarked = marking?.marked;
              const shouldHighlight = highlightProjected && marking?.isProj;
              return (
                <View style={{alignItems: 'center', justifyContent: 'center', height: 36, width: 36, borderRadius: 18, borderWidth: shouldHighlight ? 2 : 0, borderColor: '#F59E0B'}}>
                   <Text style={{color: state === 'disabled' ? '#475569' : '#F8FAFC'}}>{date.day}</Text>
                   <View style={{flexDirection: 'row', position: 'absolute', bottom: 4, alignItems: 'center', height: 10, zIndex: 10}}>
                     {isMarked && <View style={{width: 4, height: 4, borderRadius: 2, backgroundColor: marking.dotColor || '#3B82F6'}} />}
                   </View>
                </View>
              );
            }}
          />
        </View>

        {(weeklyTotalsList.length > 0 || dailyTotalsList.length > 0) && (
          <View style={styles.weeklyBreakdownContainer}>
            {weeklyTotalsList.length > 0 && (
              <View>
                <Text style={styles.weeklyBreakdownTitle}>{displayMonth} Breakdown</Text>
                {weeklyTotalsList.map((item, index) => (
                  <TouchableOpacity key={index} style={styles.weekRow} onPress={() => setSelectedWeek(item.week)} activeOpacity={0.7}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={styles.weekLabel}>{item.week}</Text>
                      <ChevronRight size={16} color="#475569" style={{ marginLeft: 5 }} />
                    </View>
                    <Text style={styles.weekHours}>{item.hrs.toFixed(1)} hrs</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            {dailyTotalsList.length > 0 && (
              <View style={{ marginTop: weeklyTotalsList.length > 0 ? 30 : 0 }}>
                <Text style={styles.weeklyBreakdownTitle}>Daily Breakdown</Text>
                {dailyTotalsList.map((item, index) => {
                  const dayOfWeek = new Date(item.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' });
                  return (
                  <View key={index} style={styles.weekRow}>
                    <Text style={styles.weekLabel}>{item.date} ({dayOfWeek})</Text>
                    <Text style={styles.weekHours}>{item.hrs.toFixed(1)} hrs</Text>
                  </View>
                )})}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Premium Weekly Breakdown Modal */}
      <Modal visible={selectedWeek !== null} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.premiumModalContainer}>
          <View style={styles.premiumModalHeader}>
            <Text style={styles.premiumModalTitle}>{displayMonth} - {selectedWeek}</Text>
            <TouchableOpacity onPress={() => setSelectedWeek(null)} style={styles.closeModalHeaderBtn}>
              <X size={24} color="#F8FAFC" />
            </TouchableOpacity>
          </View>
          
          <ScrollView contentContainerStyle={{ padding: 20 }}>
            {weekLogs.length === 0 ? (
               <Text style={styles.emptyHistory}>No logs for this week.</Text>
            ) : (
              weekLogs.map((log, index) => (
                <View key={index} style={styles.timelineCard}>
                  <View style={styles.timelineCardHeader}>
                    <Text style={styles.timelineDate}>{log.date} {log.date ? `(${new Date(log.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' })})` : ''}</Text>
                    <View style={styles.timelineBadge}><Text style={styles.timelineBadgeText}>{log.hrs.toFixed(1)} hrs</Text></View>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                     <Text style={{ color: '#94A3B8', fontSize: 16 }}>In: <Text style={{ color: '#F8FAFC', fontWeight: 'bold' }}>{log.in}</Text></Text>
                     <Text style={{ color: '#94A3B8', fontSize: 16 }}>Out: <Text style={{ color: '#F8FAFC', fontWeight: 'bold' }}>{log.out}</Text></Text>
                  </View>
                </View>
              ))
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  webContainer: {
    maxWidth: 800,
    width: '100%',
    marginHorizontal: 'auto',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: '#1E293B'
  },
  header: { padding: 24, paddingTop: 60, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 32, fontWeight: 'bold', color: '#F8FAFC' },
  dashboardRow: { flexDirection: 'row', justifyContent: 'space-evenly', marginVertical: 10 },
  dashboardCardHalf: { alignItems: 'center', position: 'relative', width: '45%' },
  dashboardCardThird: { alignItems: 'center', position: 'relative', width: '32%' },
  centerTextSmall: { position: 'absolute', top: 34, alignItems: 'center', width: '100%' },
  hoursTextSmall: { fontSize: 24, fontWeight: 'bold', color: '#F8FAFC' },
  chartLabel: { color: '#F8FAFC', fontWeight: 'bold', marginTop: 10, fontSize: 14, textAlign: 'center' },
  calendarContainer: { paddingHorizontal: 24, paddingBottom: 20 },
  weeklyBreakdownContainer: { paddingHorizontal: 24, paddingBottom: 60 },
  weeklyBreakdownTitle: { color: '#F8FAFC', fontSize: 18, fontWeight: 'bold', marginBottom: 10 },
  weekRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1E293B', padding: 16, borderRadius: 12, marginBottom: 8 },
  weekLabel: { color: '#94A3B8', fontSize: 16, fontWeight: '600' },
  weekHours: { color: '#3B82F6', fontSize: 17, fontWeight: 'bold' },
  
  // Premium Weekly Breakdown Modal Styles
  premiumModalContainer: { flex: 1, backgroundColor: '#0F172A' },
  premiumModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, paddingTop: Platform.OS === 'ios' ? 60 : 30, backgroundColor: '#1E293B', borderBottomWidth: 1, borderBottomColor: '#334155' },
  premiumModalTitle: { fontSize: 20, fontWeight: 'bold', color: '#F8FAFC' },
  closeModalHeaderBtn: { padding: 5 },
  emptyHistory: { textAlign: 'center', color: '#94A3B8', paddingVertical: 20, fontStyle: 'italic' },
  
  timelineCard: { backgroundColor: '#1E293B', borderRadius: 16, padding: 20, marginBottom: 15 },
  timelineCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  timelineDate: { fontWeight: 'bold', fontSize: 18, color: '#F8FAFC' },
  timelineBadge: { backgroundColor: '#3B82F620', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  timelineBadgeText: { color: '#3B82F6', fontWeight: 'bold', fontSize: 15 },
});