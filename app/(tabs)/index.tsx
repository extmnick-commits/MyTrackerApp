import * as Haptics from 'expo-haptics';
import * as Print from 'expo-print';
import { useNavigation } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { signOut } from 'firebase/auth';
import { collection, deleteDoc, deleteField, doc, onSnapshot, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { CheckCircle2, ChevronRight, Clock, Edit2, FileText, LogOut, MapPin, Printer, Settings, Trash2, TrendingUp, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { useAuth } from '../../context/AuthContext';
import { auth, db } from '../../firebaseConfig';

// Added Types for the imported Timeline Sync
type Stop = { id: string; address: string; };
type Trip = { id: string; date: string; miles: number; stopsCount: number; stops?: Stop[] };

export default function WorkTracker() {
  const navigation = useNavigation();
  const { user } = useAuth();

  // Limits
  const [monthlyLimit, setMonthlyLimit] = useState(75);
  const [monthlyMilesLimit, setMonthlyMilesLimit] = useState(500); 

  // Current Stats
  const [hoursWorked, setHoursWorked] = useState(0);
  const [monthlyMiles, setMonthlyMiles] = useState(0); 
  const [weeklyTotal, setWeeklyTotal] = useState(0);
  const [weeklyTotalsList, setWeeklyTotalsList] = useState<{ week: string; hrs: number; miles: number }[]>([]);
  const [dailyTotalsList, setDailyTotalsList] = useState<{ date: string; hrs: number; miles: number }[]>([]);
  const [workLogs, setWorkLogs] = useState<Record<string, any>>({});
  const [mileageHistory, setMileageHistory] = useState<Trip[]>([]); 
  
  // Weekly Breakdown Details State
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
  const [weekTrips, setWeekTrips] = useState<Trip[]>([]);
  const [manualEditTrip, setManualEditTrip] = useState<Trip | null>(null);
  const [manualEditMiles, setManualEditMiles] = useState('');

  // Modals
  const [isModalVisible, setModalVisible] = useState(false);
  const [limitModalType, setLimitModalType] = useState<'hours' | 'miles' | null>(null);
  const [isSettingsVisible, setSettingsVisible] = useState(false);
  const [newLimitInput, setNewLimitInput] = useState('');
  const [familyPin, setFamilyPin] = useState('');
  const [isFamilyPinModalVisible, setFamilyPinModalVisible] = useState(false);
  const [familyMembersList, setFamilyMembersList] = useState<{id: string, name: string, lastLogin?: string}[]>([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [dayMiles, setDayMiles] = useState(0); 
  
  // Notes State
  const [isNotesModalVisible, setNotesModalVisible] = useState(false);
  const [monthlyNotes, setMonthlyNotes] = useState('');
  const [notesInput, setNotesInput] = useState('');

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

  // Sync monthly goals with Firebase
  useEffect(() => {
    if (!user) return;

    const userDocRef = doc(db, 'users', user.uid);
    const unsubscribe = onSnapshot(userDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setMonthlyLimit(data.monthlyHourLimit || 75);
        setMonthlyMilesLimit(data.monthlyMilesLimit || 500);
        setFamilyPin(data.familyPin || '');
      }
    });
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!user) {
      setMileageHistory([]);
      return;
    }

    const tripsCollectionRef = collection(db, 'users', user.uid, 'mileage');
    const q = query(tripsCollectionRef);

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allTrips: Trip[] = [];
      snapshot.forEach(doc => {
        allTrips.push({ id: doc.id, ...doc.data() } as Trip);
      });
      // Sort trips by date to ensure consistent ordering
      allTrips.sort((a, b) => b.date.localeCompare(a.date));
      setMileageHistory(allTrips);
    });

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    
    const q = query(collection(db, 'familyMembers'), where('caregiverId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const members: {id: string, name: string, lastLogin?: string}[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        members.push({ id: docSnap.id, name: data.name || 'Unknown Viewer', lastLogin: data.lastLogin });
      });
      setFamilyMembersList(members);
    });
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    const tripsThisMonth = mileageHistory.filter(t => t.date.startsWith(viewedMonthYear));
    const totalM = tripsThisMonth.reduce((sum, t) => sum + t.miles, 0);
    setMonthlyMiles(totalM);
  }, [mileageHistory, viewedMonthYear]);

  // Handle Weekly Trips Sync
  useEffect(() => {
    if (selectedWeek) {
      const weekNum = parseInt(selectedWeek.replace('Week ', ''));
      const trips = mileageHistory.filter(t => {
        if (!t.date.startsWith(viewedMonthYear)) return false;
        const day = parseInt(t.date.split('-')[2]);
        return Math.ceil(day / 7) === weekNum;
      }).sort((a, b) => b.date.localeCompare(a.date)); 
      setWeekTrips(trips);
    }
  }, [mileageHistory, selectedWeek, viewedMonthYear]);

  useEffect(() => {
    if (!user) return;

    const docRef = doc(db, 'users', user.uid, 'workLogs', viewedMonthYear);
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      const data = docSnap.exists() ? docSnap.data() : {};
      const { notes, ...logs } = data;
      setWorkLogs(logs);
      setMonthlyNotes(notes || '');
    });
    return () => unsubscribe();
  }, [viewedMonthYear, user]);

  useEffect(() => {
    if (!user) return;

    const tripsThisMonth = mileageHistory.filter(t => t.date.startsWith(viewedMonthYear));
    const allDates = new Set([...Object.keys(workLogs), ...tripsThisMonth.map(t => t.date)]);
    
    let totalHours = 0;
    const weekGroups: Record<string, { hrs: number; miles: number }> = {};
    const dailyArray: { date: string; hrs: number; miles: number }[] = [];

    allDates.forEach(dateStr => {
      const log = workLogs[dateStr] || {};
      const hrsVal = typeof log === 'object' ? (log.totalHours || 0) : Number(log);
      totalHours += hrsVal;

      const tripsThisDay = mileageHistory.filter(t => t.date === dateStr);
      const dayMilesVal = tripsThisDay.reduce((sum, t) => sum + t.miles, 0);

      if (hrsVal > 0 || dayMilesVal > 0) {
        dailyArray.push({
          date: dateStr,
          hrs: hrsVal,
          miles: dayMilesVal
        });

        const dayOfMonth = parseInt(dateStr.split('-')[2]);
        const weekNum = Math.ceil(dayOfMonth / 7);
        const weekLabel = `Week ${weekNum}`;

        if (!weekGroups[weekLabel]) {
          weekGroups[weekLabel] = { hrs: 0, miles: 0 };
        }
        weekGroups[weekLabel].hrs += hrsVal;
        weekGroups[weekLabel].miles += dayMilesVal;
      }
    });
    
    setHoursWorked(totalHours);

    const weeklyArray = Object.keys(weekGroups).map(key => ({
      week: key,
      hrs: weekGroups[key].hrs,
      miles: weekGroups[key].miles
    })).sort((a, b) => a.week.localeCompare(b.week));
    
    setWeeklyTotalsList(weeklyArray);
    setDailyTotalsList(dailyArray.sort((a, b) => a.date.localeCompare(b.date)));

    if (viewedMonthYear === currentMonthYear) {
      const currentWeekNum = Math.ceil(new Date().getDate() / 7);
      const currentWeekLabel = `Week ${currentWeekNum}`;
      setWeeklyTotal(weekGroups[currentWeekLabel]?.hrs || 0);
    } else {
      setWeeklyTotal(0); 
    }
  }, [workLogs, mileageHistory, user, viewedMonthYear]);

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

  const handleLogout = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await signOut(auth);
  };

  const saveCustomLimit = async () => {
    if (!user) return;
    const parsed = parseInt(newLimitInput);
    if (!isNaN(parsed) && parsed > 0) {
      const userDocRef = doc(db, 'users', user.uid);
      try {
        if (limitModalType === 'hours') {
          await setDoc(userDocRef, { monthlyHourLimit: parsed }, { merge: true });
        } else {
          await setDoc(userDocRef, { monthlyMilesLimit: parsed }, { merge: true });
        }
        setLimitModalType(null);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (error) {
        Alert.alert('Update Error', 'Failed to save new goal to your account.');
      }
    }
  };

  const saveFamilyPin = async () => {
    if (!user) return;
    if (familyPin.length < 4) {
      if (Platform.OS === 'web') return window.alert('PIN must be at least 4 characters long.');
      return Alert.alert('Invalid PIN', 'PIN must be at least 4 characters long.');
    }
    try {
      await setDoc(doc(db, 'users', user.uid), { familyPin }, { merge: true });
      setFamilyPinModalVisible(false);
      setTimeout(() => {
        if (Platform.OS === 'web') {
          window.alert('Success: Family PIN has been updated.');
        } else {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          Alert.alert('Success', 'Family PIN has been updated.');
        }
      }, 100);
    } catch (error) {
      if (Platform.OS === 'web') window.alert('Failed to update Family PIN.');
      else Alert.alert('Error', 'Failed to update Family PIN.');
    }
  };

  const removeFamilyPin = () => {
    if (!user) return;

    const executeRemove = async () => {
      try {
        const userDocRef = doc(db, 'users', user.uid);
        await updateDoc(userDocRef, { familyPin: deleteField() });
        // The onSnapshot listener on the user doc will automatically clear the local `familyPin` state.
        setFamilyPinModalVisible(false);
        setTimeout(() => {
          if (Platform.OS === 'web') {
            window.alert('Success: Family PIN has been removed.');
          } else {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            Alert.alert('Success', 'Family PIN has been removed. Family access is now disabled.');
          }
        }, 100);
      } catch (error) {
        if (Platform.OS === 'web') window.alert('Failed to remove Family PIN.');
        else Alert.alert('Error', 'Failed to remove Family PIN.');
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm("This will disable family access immediately. Are you sure?")) {
        executeRemove();
      }
    } else {
      Alert.alert(
        "Remove PIN?",
        "This will disable family access immediately. Are you sure?",
        [ { text: "Cancel", style: "cancel" }, { text: "Yes, Remove PIN", style: "destructive", onPress: executeRemove } ]
      );
    }
  };

  const removeFamilyMember = (memberId: string, memberName: string) => {
    if (!user) return;

    const executeRemove = async () => {
      try {
        await deleteDoc(doc(db, 'familyMembers', memberId));
        if (Platform.OS === 'web') {
          window.alert(`Success: ${memberName} has been removed.`);
        } else {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          Alert.alert('Success', `${memberName} has been removed.`);
        }
      } catch (error) {
        if (Platform.OS === 'web') window.alert('Failed to remove family member.');
        else Alert.alert('Error', 'Failed to remove family member.');
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`Remove ${memberName} from active viewers?`)) executeRemove();
    } else {
      Alert.alert("Remove Viewer?", `Remove ${memberName} from active viewers?`, [ { text: "Cancel", style: "cancel" }, { text: "Yes, Remove", style: "destructive", onPress: executeRemove } ]);
    }
  };

  const saveNotes = async () => {
    if (!user) return;
    try {
      const docRef = doc(db, 'users', user.uid, 'workLogs', viewedMonthYear);
      await setDoc(docRef, { notes: notesInput }, { merge: true });
      setNotesModalVisible(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error: any) {
      if (Platform.OS === 'web') {
        window.alert(error.message);
      } else {
        Alert.alert("Error", error.message);
      }
    }
  };

  // Helper for Premium UI Timeline and PDF
  const formatAddress = (address: string) => {
    if (!address) return { title: 'Unknown', sub: '' };
    const parts = address.split(',');
    return { title: parts[0], sub: parts.slice(1).join(',').trim() };
  };

  // --- UPGRADED PREMIUM PDF GENERATOR ---
  const generatePDF = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    const currentDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    
    // Add notes section if there are any
    let notesHtml = '';
    if (monthlyNotes) {
      notesHtml = `
        <div class="notes-section">
          <h3 class="notes-title">Caregiver Notes</h3>
          <p class="notes-content">${monthlyNotes}</p>
        </div>
      `;
    }

    // Filter trips for the currently viewed month
    const tripsThisMonth = mileageHistory.filter(t => t.date.startsWith(viewedMonthYear));
    
    // Get a unique set of all dates that have EITHER a work log or a trip
    const allDates = new Set([
      ...Object.keys(workLogs),
      ...tripsThisMonth.map(t => t.date)
    ]);
    const sortedDates = Array.from(allDates).sort();

    // Build the dynamic rows
    const htmlRows = sortedDates.map(date => {
      const log = workLogs[date] || {};
      const dayTrips = tripsThisMonth.filter(t => t.date === date);
      const dayMiles = dayTrips.reduce((sum, t) => sum + t.miles, 0);
      
      // Construct the route timeline string
      let routeHtml = '<span style="color: #9ca3af; font-style: italic;">No travel logged</span>';
      if (dayTrips.length > 0) {
          const routes = dayTrips.map(trip => {
              if (trip.stops && trip.stops.length > 0) {
                  return trip.stops.map((s, i) => {
                      const isFirst = i === 0;
                      const isLast = i === trip.stops!.length - 1;
                      const color = isFirst ? '#10b981' : isLast ? '#ef4444' : '#6b7280';
                      const label = isFirst ? '<strong>[Start]</strong>' : isLast ? '<strong>[End]</strong>' : '<strong>[Stop]</strong>';
                      return `<div style="color: ${color}; padding: 3px 0;">${label} <span style="color: #374151;">${s.address}</span></div>`;
                  }).join('<div style="color: #cbd5e1; font-size: 16px; padding-left: 10px;">&darr;</div>');
              }
              return '<div style="color: #6b7280; font-style: italic;">Legacy Route Data</div>';
          }).join('<hr style="border: 0; border-top: 1px dashed #e5e7eb; margin: 15px 0;" />');
          routeHtml = `<div style="font-size: 12px; line-height: 1.4;">${routes}</div>`;
      }

      return `
        <tr>
          <td class="val-cell">${date}</td>
          <td>${log.in || '--'}</td>
          <td>${log.out || '--'}</td>
          <td class="val-cell">${log.totalHours ? log.totalHours.toFixed(2) : '0'}</td>
          <td class="miles-cell">${dayMiles > 0 ? dayMiles.toFixed(1) : '--'}</td>
          <td>${routeHtml}</td>
        </tr>
      `;
    }).join('');

    const estDeduction = (monthlyMiles * 0.67).toFixed(2);
    const totalDaysWorked = sortedDates.length;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1f2937; margin: 0; padding: 40px; background-color: #ffffff; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #e5e7eb; padding-bottom: 20px; margin-bottom: 30px; }
          .header h1 { margin: 0 0 5px 0; font-size: 28px; color: #111827; letter-spacing: -0.5px; }
          .header p { margin: 0; color: #6b7280; font-size: 14px; }
          .brand { text-align: right; }
          .brand-title { font-size: 20px; font-weight: 800; color: #0369a1; margin: 0 0 5px 0; letter-spacing: -0.5px; }
          
          .summary-grid { display: flex; gap: 20px; margin-bottom: 30px; }
          .summary-box { flex: 1; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 15px 20px; }
          .summary-box.highlight { background: #f0fdf4; border-color: #34d399; }
          .summary-label { font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; margin-bottom: 5px; font-weight: 600; }
          .summary-box.highlight .summary-label { color: #059669; }
          .summary-value { font-size: 24px; font-weight: 700; color: #111827; margin: 0; }
          .summary-box.highlight .summary-value { color: #059669; }
          .summary-subtext { font-size: 13px; color: #9ca3af; margin-top: 5px; }

          .notes-section { background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 20px; margin-bottom: 30px; }
          .notes-title { font-size: 14px; font-weight: 700; color: #d97706; margin: 0 0 10px 0; text-transform: uppercase; letter-spacing: 0.5px; }
          .notes-content { margin: 0; font-size: 14px; color: #92400e; line-height: 1.6; white-space: pre-wrap; }

          table { width: 100%; border-collapse: collapse; margin-bottom: 40px; font-size: 13px; }
          th { background: #f3f4f6; padding: 12px 15px; text-align: left; font-weight: 600; color: #4b5563; border-bottom: 2px solid #e5e7eb; text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px; }
          td { padding: 15px 12px; border-bottom: 1px solid #e5e7eb; vertical-align: top; color: #374151; }
          tr:nth-child(even) { background-color: #f9fafb; }
          .val-cell { font-weight: 600; color: #111827; }
          .miles-cell { font-weight: 600; color: #0369a1; }
          
          .table-footer { background: #f3f4f6; font-weight: bold; font-size: 14px; }
          .table-footer td { color: #111827; border-top: 2px solid #e5e7eb; border-bottom: none; }

          .signatures { display: flex; justify-content: space-between; margin-top: 60px; page-break-inside: avoid; }
          .sig-block { width: 45%; }
          .sig-line { border-top: 1px solid #9ca3af; margin-bottom: 10px; padding-top: 5px; }
          .sig-text { font-size: 12px; color: #6b7280; font-style: italic; }

          .footer { text-align: center; font-size: 11px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 20px; margin-top: 40px; }

          @media print {
            @page { margin: 15mm; }
            body { padding: 0; margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
            table { page-break-inside: auto; width: 100%; }
            tr { page-break-inside: avoid; page-break-after: auto; }
            td, th { page-break-inside: avoid; }
            thead { display: table-header-group; }
            tfoot { display: table-footer-group; }
            .signatures { page-break-inside: avoid; break-inside: avoid; margin-top: 40px; }
            .summary-grid, .summary-box, .notes-section { page-break-inside: avoid; break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1>Caregiver Timesheet & Mileage</h1>
            <p><strong>Period:</strong> ${displayMonth}</p>
            <p><strong>Caregiver:</strong> ${user?.email || 'N/A'}</p>
          </div>
          <div class="brand">
            <h2 class="brand-title">MyTrackerApp</h2>
            <p>Generated: ${currentDate}</p>
          </div>
        </div>
        
        <div class="summary-grid">
          <div class="summary-box">
            <div class="summary-label">Total Hours</div>
            <p class="summary-value">${hoursWorked.toFixed(2)}</p>
            <div class="summary-subtext">${totalDaysWorked} Shifts Logged</div>
          </div>
          <div class="summary-box">
            <div class="summary-label">Total Mileage</div>
            <p class="summary-value">${monthlyMiles.toFixed(1)} <span style="font-size: 14px; font-weight: 400;">mi</span></p>
            <div class="summary-subtext">Across all trips</div>
          </div>
          <div class="summary-box highlight">
            <div class="summary-label">Est. IRS Tax Deduction</div>
            <p class="summary-value">$${estDeduction}</p>
            <div class="summary-subtext">@ $0.67 per mile</div>
          </div>
        </div>

          ${notesHtml}

        <table>
          <thead>
            <tr>
              <th style="width: 12%;">Date</th>
              <th style="width: 12%;">Time In</th>
              <th style="width: 12%;">Time Out</th>
              <th style="width: 10%;">Hours</th>
              <th style="width: 10%;">Miles</th>
              <th style="width: 44%;">Route Breakdown</th>
            </tr>
          </thead>
          <tbody>
            ${htmlRows.length > 0 ? htmlRows : '<tr><td colspan="6" style="text-align: center; padding: 30px; color: #9ca3af; font-style: italic;">No records found for this month.</td></tr>'}
          </tbody>
          ${htmlRows.length > 0 ? `
          <tfoot>
            <tr class="table-footer">
              <td colspan="3" style="text-align: right;">MONTHLY TOTALS:</td>
              <td class="val-cell">${hoursWorked.toFixed(2)}</td>
              <td class="miles-cell">${monthlyMiles.toFixed(1)}</td>
              <td></td>
            </tr>
          </tfoot>
          ` : ''}
        </table>
        
        <div class="signatures">
          <div class="sig-block">
            <div class="sig-line">Caregiver Signature</div>
            <div class="sig-text">I certify that the hours and mileage accurately represent the work performed.</div>
          </div>
          <div class="sig-block">
            <div class="sig-line">Client / Employer Signature</div>
            <div class="sig-text">Approved and verified.</div>
          </div>
        </div>
        
        <div class="footer">
          <p style="margin: 0 0 5px 0;">Generated securely by MyTrackerApp</p>
          <p style="margin: 0;">* Mileage deduction is estimated using the 2024 IRS standard mileage rate of 67 cents per mile.</p>
        </div>
        </body>
      </html>
    `;

    try {
      if (Platform.OS === 'web') {
        await Print.printAsync({ html: htmlContent });
      } else {
        const file = await Print.printToFileAsync({ html: htmlContent, base64: false });
        await Sharing.shareAsync(file.uri, { 
          mimeType: 'application/pdf', 
          dialogTitle: `${displayMonth.replace(' ', '_')}_Timesheet`, 
          UTI: 'com.adobe.pdf' 
        });
      }
    } catch (error) {
      Alert.alert("PDF Error", "Failed to generate PDF.");
    }
  };

  const handleDayPress = (day: { dateString: string }) => {
    setSelectedDate(day.dateString);
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
    if (!user) return;
    setModalVisible(false); 
    try {
      const shiftMonthYear = selectedDate.slice(0, 7);
      const docRef = doc(db, 'users', user.uid, 'workLogs', shiftMonthYear);
      const inTime = `${inHour.padStart(2, '0')}:${inMin.padStart(2, '0')} ${inAmPm}`;
      const outTime = `${outHour.padStart(2, '0')}:${outMin.padStart(2, '0')} ${outAmPm}`;
      await setDoc(docRef, {
        [selectedDate]: { totalHours: calculatedShift, in: inTime, out: outTime, miles: dayMiles }
      }, { merge: true });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error: any) {
      Alert.alert("Firestore Error", error.message);
    }
  };

  const deleteShift = async () => {
    if (!user) return;
    setModalVisible(false);
    try {
      const shiftMonthYear = selectedDate.slice(0, 7);
      const docRef = doc(db, 'users', user.uid, 'workLogs', shiftMonthYear);
      await updateDoc(docRef, { [selectedDate]: deleteField() });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } catch (error: any) {
      Alert.alert("Delete Error", error.message);
    }
  };

  const deleteCalendarTrip = (id: string) => {
    if (!user) return;

    const executeDelete = async () => {
      try {
        setMileageHistory(prev => prev.filter(trip => trip.id !== id));
        const tripRef = doc(db, 'users', user.uid, 'mileage', id);
        await deleteDoc(tripRef);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (error) {
        console.error("Error deleting trip:", error);
        if (Platform.OS === 'web') {
          window.alert('Failed to delete trip. The list will be automatically synced to reflect the correct data.');
        } else {
          Alert.alert('Delete Error', 'Failed to delete trip. The list will be automatically synced to reflect the correct data.');
        }
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm('Remove this trip from your records?')) {
        executeDelete();
      }
    } else {
      Alert.alert('Delete Trip', 'Remove this trip from your records?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: executeDelete }
      ]);
    }
  };

  const saveManualTripEdit = async () => {
    if (!user || !manualEditTrip) return;
    const parsed = parseFloat(manualEditMiles);
    if (isNaN(parsed)) return;

    try {
      // Optimistically update UI
      const newHistory = mileageHistory.map(t => t.id === manualEditTrip.id ? { ...t, miles: parsed } : t);
      setMileageHistory(newHistory);
      setManualEditTrip(null);

      // Perform database operation
      const tripRef = doc(db, 'users', user.uid, 'mileage', manualEditTrip.id);
      await updateDoc(tripRef, { miles: parsed });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      Alert.alert('Update Error', 'Failed to save changes to the database. The list will refresh.');
    }
  };

  const promptWipeMonth = () => {
    setSettingsVisible(false); 

    const executeWipe = async () => {
      if (!user) return;
      try {
        const docRef = doc(db, 'users', user.uid, 'workLogs', viewedMonthYear);
        await deleteDoc(docRef);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (error: any) {
        if (Platform.OS === 'web') {
          window.alert(error.message);
        } else {
          Alert.alert("Wipe Error", error.message);
        }
      }
    };

    if (Platform.OS === 'web') {
      setTimeout(() => {
        if (window.confirm(`Are you sure you want to delete ALL shifts for ${displayMonth}? This cannot be undone.`)) {
          executeWipe();
        }
      }, 100);
    } else {
      Alert.alert(
        "Wipe Calendar",
        `Are you sure you want to delete ALL shifts for ${displayMonth}? This cannot be undone.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Yes, Wipe It", style: "destructive", onPress: executeWipe }
        ]
      );
    }
  };

  const progressHours = Math.min((hoursWorked / monthlyLimit) * 100, 100);
  const colorHours = hoursWorked > monthlyLimit ? "#EF4444" : "#3B82F6";
  const progressMiles = Math.min((monthlyMiles / monthlyMilesLimit) * 100, 100);
  const colorMiles = monthlyMiles > monthlyMilesLimit ? "#EF4444" : "#0a7ea4";

  const markedDates: any = {};
  Object.keys(workLogs).forEach(date => markedDates[date] = { marked: true, dotColor: '#3B82F6' });
  if (selectedDate) markedDates[selectedDate] = { ...markedDates[selectedDate], selected: true, selectedColor: '#3B82F6' };

  if (!user) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#F8FAFC" />
        <Text style={{ color: '#94A3B8', marginTop: 15 }}>Waiting for user session...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, Platform.OS === 'web' && styles.webContainer]}>
      <ScrollView>
        <View style={styles.header}>
          <Text style={styles.title}>Work Tracker</Text>
          <View style={styles.headerIcons}>
            <TouchableOpacity onPress={() => { setNotesInput(monthlyNotes); setNotesModalVisible(true); }} style={{ marginRight: 20 }}><FileText color="#94A3B8" size={28} /></TouchableOpacity>
            <TouchableOpacity onPress={generatePDF} style={{ marginRight: 20 }}><Printer color="#F8FAFC" size={28} /></TouchableOpacity>
            <TouchableOpacity onPress={() => setSettingsVisible(true)} style={{ marginRight: 20 }}><Settings color="#94A3B8" size={28} /></TouchableOpacity>
            <TouchableOpacity onPress={handleLogout}><LogOut color="#EF4444" size={28} /></TouchableOpacity>
          </View>
        </View>
        
        <View style={styles.dashboardRow}>
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
            onMonthChange={(month: any) => setViewedMonthYear(month.dateString.slice(0, 7))}
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
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={styles.weekHours}>{item.hrs.toFixed(1)} hrs</Text>
                      <View style={{ width: 1, height: 15, backgroundColor: '#475569', marginHorizontal: 10 }} />
                      <Text style={[styles.weekHours, { color: '#0a7ea4' }]}>{item.miles.toFixed(1)} mi</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            {dailyTotalsList.length > 0 && (
              <View style={{ marginTop: weeklyTotalsList.length > 0 ? 30 : 0 }}>
                <Text style={styles.weeklyBreakdownTitle}>Daily Breakdown</Text>
                {dailyTotalsList.map((item, index) => (
                  <TouchableOpacity key={index} style={styles.weekRow} onPress={() => handleDayPress({ dateString: item.date })} activeOpacity={0.7}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={styles.weekLabel}>{item.date}</Text>
                      <ChevronRight size={16} color="#475569" style={{ marginLeft: 5 }} />
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={styles.weekHours}>{item.hrs.toFixed(1)} hrs</Text>
                      <View style={{ width: 1, height: 15, backgroundColor: '#475569', marginHorizontal: 10 }} />
                      <Text style={[styles.weekHours, { color: '#0a7ea4' }]}>{item.miles.toFixed(1)} mi</Text>
                    </View>
                  </TouchableOpacity>
                ))}
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
            {/* IRS Est Deduction Premium Feature */}
            <View style={styles.deductionCard}>
               <Text style={styles.deductionLabel}>Est. IRS Tax Deduction ($0.67/mi)</Text>
               <Text style={styles.deductionValue}>${(weekTrips.reduce((sum, t) => sum + t.miles, 0) * 0.67).toFixed(2)}</Text>
            </View>

            {weekTrips.length === 0 ? (
               <Text style={styles.emptyHistory}>No trips logged for this week.</Text>
            ) : (
              weekTrips.map((trip) => {
                const hasStops = trip.stops && trip.stops.length > 0;
                return (
                  <View key={trip.id} style={styles.timelineCard}>
                    <View style={styles.timelineCardHeader}>
                      <Text style={styles.timelineDate}>{trip.date}</Text>
                      <View style={styles.timelineBadge}><Text style={styles.timelineBadgeText}>{trip.miles} mi</Text></View>
                    </View>

                    {hasStops ? (
                      <View style={styles.timelineContainer}>
                        {trip.stops!.map((stop, i) => {
                          const addr = formatAddress(stop.address);
                          return (
                            <View key={i} style={styles.timelineRow}>
                              <View style={styles.timelineVisual}>
                                <View style={[styles.timelineDot, i === 0 ? styles.dotOrigin : i === trip.stops!.length - 1 ? styles.dotDest : styles.dotMid]} />
                                {i < trip.stops!.length - 1 && <View style={styles.timelineLine} />}
                              </View>
                              <View style={styles.timelineText}>
                                <Text style={styles.timelineLocTitle} numberOfLines={1}>{addr.title}</Text>
                                {addr.sub ? <Text style={styles.timelineLocSub} numberOfLines={1}>{addr.sub}</Text> : null}
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    ) : <Text style={styles.legacyText}>{trip.stopsCount} stops (Legacy Data)</Text>}

                    <View style={styles.premiumActions}>
                      <TouchableOpacity style={styles.actionPill} onPress={() => { setManualEditTrip(trip); setManualEditMiles(trip.miles.toString()); }}>
                        <Edit2 size={14} color="#0a7ea4" /><Text style={styles.actionPillText}>Quick Edit Miles</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.iconButton} onPress={() => deleteCalendarTrip(trip.id)}><Trash2 size={18} color="#EF4444" /></TouchableOpacity>
                    </View>
                    {!hasStops && <Text style={{ fontSize: 10, color: '#475569', textAlign: 'center', marginTop: 5 }}>For full route re-building, use the Tracker tab.</Text>}
                  </View>
                );
              })
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* Manual Miles Edit Popup inside Calendar */}
      <Modal visible={manualEditTrip !== null} transparent animationType="fade">
        <View style={styles.modalOverlay}>
           <View style={[styles.modalContent, { borderRadius: 20, margin: 20 }]}>
              <Text style={styles.modalTitle}>Quick Override Miles</Text>
              <Text style={{ color: '#94A3B8', marginBottom: 15, fontSize: 12 }}>Note: To change locations, please edit this route in the Tracker tab.</Text>
              <TextInput 
                value={manualEditMiles} 
                onChangeText={setManualEditMiles} 
                keyboardType="numeric"
                inputMode="numeric"
                style={[styles.loginInput, { textAlign: 'center', fontSize: 24, width: '100%' }]}
              />
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                <TouchableOpacity style={[styles.saveButton, { flex: 1, backgroundColor: '#475569' }]} onPress={() => setManualEditTrip(null)}><Text style={styles.saveButtonText}>Cancel</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.saveButton, { flex: 1, backgroundColor: '#0a7ea4' }]} onPress={saveManualTripEdit}><Text style={styles.saveButtonText}>Save</Text></TouchableOpacity>
              </View>
           </View>
        </View>
      </Modal>

      <Modal visible={isNotesModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { borderRadius: 20, margin: 20 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{displayMonth} Notes</Text>
              <TouchableOpacity onPress={() => setNotesModalVisible(false)}><X color="#94A3B8" size={24} /></TouchableOpacity>
            </View>
            <TextInput
              style={[styles.loginInput, { minHeight: 120, textAlignVertical: 'top' }]}
              multiline
              placeholder="Type your notes here..."
              placeholderTextColor="#94A3B8"
              value={notesInput}
              onChangeText={setNotesInput}
            />
            <TouchableOpacity style={styles.saveButton} onPress={saveNotes}>
              <Text style={styles.saveButtonText}>Save Notes</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={isSettingsVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { borderRadius: 20, margin: 20, paddingBottom: 30 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>App Settings</Text>
              <TouchableOpacity onPress={() => setSettingsVisible(false)}><X color="#94A3B8" size={24} /></TouchableOpacity>
            </View>
            <TouchableOpacity style={[styles.saveButton, { backgroundColor: '#3B82F6', marginBottom: 15, flexDirection: 'row', justifyContent: 'center' }]} onPress={() => { setSettingsVisible(false); setFamilyPinModalVisible(true); }}>
              <Text style={styles.saveButtonText}>{familyPin ? 'Manage Family PIN' : 'Set Family Access PIN'}</Text>
              {familyPin ? (
                <View style={{ backgroundColor: '#10B981', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12, marginLeft: 10, justifyContent: 'center' }}>
                  <Text style={{ color: '#FFF', fontSize: 12, fontWeight: 'bold' }}>Active</Text>
                </View>
              ) : null}
            </TouchableOpacity>
            <TouchableOpacity style={[styles.saveButton, { backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#EF4444' }]} onPress={promptWipeMonth}>
              <Text style={[styles.saveButtonText, { color: '#EF4444' }]}>Wipe {displayMonth} Data</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={isFamilyPinModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { borderRadius: 20, margin: 20, paddingBottom: 30 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Family Access PIN</Text>
              <TouchableOpacity onPress={() => setFamilyPinModalVisible(false)}><X color="#94A3B8" size={24} /></TouchableOpacity>
            </View>
            <Text style={{ color: '#94A3B8', marginBottom: 15 }}>Set a PIN to allow family members to view your work hours (miles are hidden).</Text>
            <TextInput 
              style={[styles.loginInput, { textAlign: 'center', fontSize: 24 }]} 
              value={familyPin} 
              onChangeText={setFamilyPin} 
              placeholder="Enter PIN..." 
              keyboardType="numeric"
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
              {familyPin ? (
                <TouchableOpacity style={[styles.saveButton, { flex: 1, backgroundColor: '#EF4444' }]} onPress={removeFamilyPin}><Text style={styles.saveButtonText}>Remove</Text></TouchableOpacity>
              ) : null}
              <TouchableOpacity style={[styles.saveButton, { flex: 2 }]} onPress={saveFamilyPin}><Text style={styles.saveButtonText}>Save PIN</Text></TouchableOpacity>
            </View>

            {familyMembersList.length > 0 && (
              <View style={{ marginTop: 25, borderTopWidth: 1, borderTopColor: '#334155', paddingTop: 15 }}>
                <Text style={{ color: '#F8FAFC', fontWeight: 'bold', fontSize: 16, marginBottom: 10 }}>Active Family Viewers</Text>
                {familyMembersList.map(member => (
                  <View key={member.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 15 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981', marginRight: 10 }} />
                      <View>
                        <Text style={{ color: '#F8FAFC', fontSize: 16 }}>{member.name}</Text>
                        <Text style={{ color: '#64748B', fontSize: 12 }}>
                          {member.lastLogin ? new Date(member.lastLogin).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Unknown time'}
                        </Text>
                      </View>
                    </View>
                    <TouchableOpacity onPress={() => removeFamilyMember(member.id, member.name)} style={{ padding: 8, backgroundColor: '#ef444420', borderRadius: 8 }}>
                      <Trash2 size={18} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={isModalVisible} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          {/* This TouchableWithoutFeedback allows tapping the background to close the modal, without interfering with inputs */}
          <TouchableWithoutFeedback onPress={() => setModalVisible(false)}>
            <View style={{ flex: 1 }} />
          </TouchableWithoutFeedback>

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
                  <TextInput style={styles.timeInput} keyboardType="numeric" inputMode="numeric" value={row.h} onChangeText={row.setH} selectTextOnFocus onFocus={Platform.OS === 'web' ? (e: any) => e.target.select() : undefined} maxLength={2} />
                  <Text style={styles.colon}>:</Text>
                  <TextInput style={styles.timeInput} keyboardType="numeric" inputMode="numeric" value={row.m} onChangeText={row.setM} selectTextOnFocus onFocus={Platform.OS === 'web' ? (e: any) => e.target.select() : undefined} maxLength={2} />
                  <TouchableOpacity style={styles.amPmToggle} onPress={() => { if(row.t==='in') setInAmPm(p=>p==='AM'?'PM':'AM'); else setOutAmPm(p=>p==='AM'?'PM':'AM'); }}><Text style={styles.amPmText}>{row.ap}</Text></TouchableOpacity>
                </View>
              </View>
            ))}
            
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
      </Modal>

      <Modal visible={limitModalType !== null} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { borderRadius: 20, margin: 20, paddingBottom: 30 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Set Monthly {limitModalType === 'hours' ? 'Hours' : 'Miles'} Goal</Text>
              <TouchableOpacity onPress={() => setLimitModalType(null)}><X color="#94A3B8" size={24} /></TouchableOpacity>
            </View>
            <TextInput style={[styles.loginInput, { textAlign: 'center', fontSize: 24 }]} keyboardType="numeric" inputMode="numeric" value={newLimitInput} onChangeText={setNewLimitInput} placeholder="Enter number..." />
            <TouchableOpacity style={styles.saveButton} onPress={saveCustomLimit}><Text style={styles.saveButtonText}>Update Goal</Text></TouchableOpacity>
          </View>
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
  headerIcons: { flexDirection: 'row', alignItems: 'center' },
  title: { fontSize: 32, fontWeight: 'bold', color: '#F8FAFC' },
  dashboardRow: { flexDirection: 'row', justifyContent: 'space-evenly', marginVertical: 10 },
  dashboardCardHalf: { alignItems: 'center', position: 'relative', width: '45%' },
  centerTextSmall: { position: 'absolute', top: 40, alignItems: 'center' },
  hoursTextSmall: { fontSize: 30, fontWeight: 'bold', color: '#F8FAFC' },
  limitTextSmall: { fontSize: 12, color: '#94A3B8' },
  chartLabel: { color: '#F8FAFC', fontWeight: 'bold', marginTop: 10, fontSize: 16 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 24 },
  statBox: { backgroundColor: '#1E293B', padding: 16, borderRadius: 16, width: '48%', alignItems: 'center' },
  statValue: { fontSize: 28, fontWeight: 'bold', color: '#F8FAFC', marginTop: 8 },
  statLabel: { fontSize: 12, color: '#94A3B8' },
  calendarContainer: { paddingHorizontal: 24, paddingBottom: 20 },
  weeklyBreakdownContainer: { paddingHorizontal: 24, paddingBottom: 60 },
  weeklyBreakdownTitle: { color: '#F8FAFC', fontSize: 18, fontWeight: 'bold', marginBottom: 10 },
  weekRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1E293B', padding: 16, borderRadius: 12, marginBottom: 8 },
  weekLabel: { color: '#94A3B8', fontSize: 16, fontWeight: '600' },
  weekHours: { color: '#3B82F6', fontSize: 17, fontWeight: 'bold' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#1E293B', padding: 30, borderTopLeftRadius: 30, borderTopRightRadius: 30 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 30 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#F8FAFC' },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, backgroundColor: '#0F172A', padding: 12, borderRadius: 12 },
  timeLabel: { color: '#94A3B8', fontWeight: '600' },
  timeInputGroup: { flexDirection: 'row', alignItems: 'center' },
  timeInput: { backgroundColor: '#1E293B', color: '#F8FAFC', fontSize: 20, fontWeight: 'bold', padding: 8, borderRadius: 8, textAlign: 'center', width: 50 },
  colon: { color: '#94A3B8', marginHorizontal: 5, fontWeight: 'bold' },
  amPmToggle: { backgroundColor: '#3B82F6', padding: 10, borderRadius: 8, marginLeft: 10 },
  amPmText: { color: '#FFF', fontWeight: 'bold' },
  durationContainer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginVertical: 15 },
  durationText: { color: '#F8FAFC', fontWeight: 'bold', marginLeft: 8, fontSize: 18 },
  saveButton: { backgroundColor: '#3B82F6', padding: 18, borderRadius: 16, alignItems: 'center' },
  saveButtonText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
  loginContainer: { flex: 1, backgroundColor: '#0F172A', justifyContent: 'center', padding: 24 },
  loginBox: { backgroundColor: '#1E293B', padding: 30, borderRadius: 20 },
  loginTitle: { fontSize: 28, fontWeight: 'bold', color: '#F8FAFC', marginBottom: 30, textAlign: 'center' },
  loginInput: { backgroundColor: '#0F172A', color: '#F8FAFC', padding: 16, borderRadius: 12, marginBottom: 16, fontSize: 16 },
  rememberRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, paddingLeft: 5 },
  rememberText: { color: '#94A3B8', fontSize: 16, marginLeft: 10 },
  loginButton: { backgroundColor: '#3B82F6', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 10 },
  loginButtonText: { color: '#FFF', fontWeight: 'bold', fontSize: 18 },

  // Premium Weekly Breakdown Modal Styles
  premiumModalContainer: { flex: 1, backgroundColor: '#0F172A' },
  premiumModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, paddingTop: Platform.OS === 'ios' ? 60 : 30, backgroundColor: '#1E293B', borderBottomWidth: 1, borderBottomColor: '#334155' },
  premiumModalTitle: { fontSize: 20, fontWeight: 'bold', color: '#F8FAFC' },
  closeModalHeaderBtn: { padding: 5 },
  emptyHistory: { textAlign: 'center', color: '#94A3B8', paddingVertical: 20, fontStyle: 'italic' },
  deductionCard: { backgroundColor: '#10b98120', borderColor: '#10b981', borderWidth: 1, padding: 15, borderRadius: 12, alignItems: 'center', marginBottom: 20 },
  deductionLabel: { color: '#10b981', fontWeight: 'bold', fontSize: 14, marginBottom: 5 },
  deductionValue: { color: '#10b981', fontSize: 28, fontWeight: '900' },
  
  timelineCard: { backgroundColor: '#1E293B', borderRadius: 16, padding: 20, marginBottom: 15 },
  timelineCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  timelineDate: { fontWeight: 'bold', fontSize: 18, color: '#F8FAFC' },
  timelineBadge: { backgroundColor: '#0a7ea420', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  timelineBadgeText: { color: '#38bdf8', fontWeight: 'bold', fontSize: 15 },
  
  timelineContainer: { paddingLeft: 5 },
  timelineRow: { flexDirection: 'row', minHeight: 45 },
  timelineVisual: { width: 20, alignItems: 'center', marginRight: 15 },
  timelineDot: { width: 12, height: 12, borderRadius: 6, zIndex: 2 },
  dotOrigin: { backgroundColor: '#10b981' }, 
  dotDest: { backgroundColor: '#ef4444' }, 
  dotMid: { backgroundColor: '#94A3B8', width: 8, height: 8 }, 
  timelineLine: { width: 2, flex: 1, backgroundColor: '#334155', marginTop: -2, marginBottom: -2, zIndex: 1 },
  timelineText: { flex: 1, paddingBottom: 20, marginTop: -4 },
  timelineLocTitle: { fontSize: 16, fontWeight: 'bold', color: '#F8FAFC' },
  timelineLocSub: { fontSize: 13, color: '#94A3B8', marginTop: 3 },
  legacyText: { fontSize: 14, color: '#94A3B8', fontStyle: 'italic', marginBottom: 15 },
  
  premiumActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 15, borderTopWidth: 1, borderTopColor: '#334155' },
  actionPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0a7ea420', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20 },
  actionPillText: { color: '#38bdf8', fontSize: 14, fontWeight: 'bold', marginLeft: 8 },
  iconButton: { padding: 8, backgroundColor: '#ef444420', borderRadius: 8 }
});