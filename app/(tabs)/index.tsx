import AsyncStorage from '@react-native-async-storage/async-storage';
import * as AuthSession from 'expo-auth-session';
import * as Google from 'expo-auth-session/providers/google';
import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as MailComposer from 'expo-mail-composer';
import * as Print from 'expo-print';
import { router, useFocusEffect, useNavigation } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { signOut } from 'firebase/auth';
import { collection, deleteDoc, deleteField, doc, onSnapshot, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { Camera, CheckCircle2, ChevronRight, Edit2, FileText, LogOut, MapPin, Paperclip, Printer, Settings, Trash2, UploadCloud, X } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
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
  const [projectedHours, setProjectedHours] = useState(0);
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
  const [highlightProjected, setHighlightProjected] = useState(false);

  // App Settings State
  const [companyName, setCompanyName] = useState('');
  const [isCompanyModalVisible, setCompanyModalVisible] = useState(false);
  const [companyNameInput, setCompanyNameInput] = useState('');

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
  const [isProjectedShift, setIsProjectedShift] = useState(false);
  
  // Google Drive Upload State
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [isUploadingReceipt, setIsUploadingReceipt] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [activeXhr, setActiveXhr] = useState<XMLHttpRequest | null>(null);
  const [monthReceipts, setMonthReceipts] = useState<Record<string, any[]>>({});
  const [receiptCategory, setReceiptCategory] = useState('Food');
  const [customCategory, setCustomCategory] = useState('');

  const redirectUri = AuthSession.makeRedirectUri();
  const [request, response, promptAsync] = Google.useAuthRequest({
    webClientId: '227348535128-k3nj9opn7v87kherceneda0h1o2ja2r7.apps.googleusercontent.com',
    iosClientId: '227348535128-k3nj9opn7v87kherceneda0h1o2ja2r7.apps.googleusercontent.com',
    androidClientId: '227348535128-k3nj9opn7v87kherceneda0h1o2ja2r7.apps.googleusercontent.com',
    redirectUri,
    scopes: [
      'https://www.googleapis.com/auth/drive.file',
    ],
  });

  const now = new Date();
  const currentDateString = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;
  const currentMonthYear = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
  const todayFormatted = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const [viewedMonthYear, setViewedMonthYear] = useState(currentMonthYear);

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const [yearStr, monthStr] = viewedMonthYear.split('-');
  const displayMonth = `${monthNames[parseInt(monthStr, 10) - 1]} ${yearStr}`;

  // Keep Google Token perfectly in sync across tabs!
  useFocusEffect(
    useCallback(() => {
      const loadToken = async () => {
        const storedToken = await AsyncStorage.getItem('googleDriveToken');
        if (storedToken !== googleToken) {
          setGoogleToken(storedToken);
        }
      };
      loadToken();
    }, [googleToken])
  );

  useEffect(() => {
    if (response?.type === 'success') {
      const token = response.authentication?.accessToken || null;
      if (token) AsyncStorage.setItem('googleDriveToken', token);
      setGoogleToken(token);
    }
  }, [response]);

  const fetchMonthlyReceipts = async () => {
    if (!googleToken || !viewedMonthYear) return;
    try {
      const masterFolderId = await AsyncStorage.getItem('defaultFolderId');
      if (!masterFolderId) return; // Silent return, let them set it up in Receipts tab

      const folderName = `Receipts - ${viewedMonthYear}`;
      const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`name='${folderName}' and '${masterFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`)}&fields=files(id)`, { headers: { Authorization: `Bearer ${googleToken}` } });
      
      // If the session token is expired, clear it out.
      if (searchRes.status === 401) {
        await AsyncStorage.removeItem('googleDriveToken');
        setGoogleToken(null);
        return;
      }

      const searchData = await searchRes.json();
      
      if (!searchData.files || searchData.files.length === 0) return setMonthReceipts({});
      
      const folderId = searchData.files[0].id;
      const itemsRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`'${folderId}' in parents and trashed=false`)}&fields=files(id,name,mimeType,webViewLink)`, { headers: { Authorization: `Bearer ${googleToken}` } });
      const itemsData = await itemsRes.json();

      let allFiles: any[] = [];
      if (itemsData.files) {
        const subFolderIds = itemsData.files.filter((f: any) => f.mimeType === 'application/vnd.google-apps.folder').map((f: any) => f.id);
        allFiles = itemsData.files.filter((f: any) => f.mimeType !== 'application/vnd.google-apps.folder');

        if (subFolderIds.length > 0) {
          const parentQueries = subFolderIds.map((id: string) => `'${id}' in parents`).join(' or ');
          const subFilesRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`(${parentQueries}) and trashed=false`)}&fields=files(id,name,webViewLink)`, { headers: { Authorization: `Bearer ${googleToken}` } });
          const subFilesData = await subFilesRes.json();
          if (subFilesData.files) {
            allFiles = [...allFiles, ...subFilesData.files];
          }
        }
      }

      const receiptsByDate: Record<string, any[]> = {};
      allFiles.forEach((file: any) => {
        const match = file.name.match(/^\d{4}-\d{2}-\d{2}/);
        if (match) {
          const date = match[0];
          if (!receiptsByDate[date]) receiptsByDate[date] = [];
          receiptsByDate[date].push(file);
        }
      });
      setMonthReceipts(receiptsByDate);
    } catch (error) { console.error("Error fetching month receipts:", error); }
  };

  useEffect(() => {
    fetchMonthlyReceipts();
  }, [googleToken, viewedMonthYear]);

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
        setCompanyName(data.companyName || '');
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
    
    let totalActual = 0;
    let totalProjected = 0;
    const weekGroups: Record<string, { hrs: number; miles: number }> = {};
    const dailyArray: { date: string; hrs: number; miles: number }[] = [];

    allDates.forEach(dateStr => {
      const log = workLogs[dateStr] || {};
      const hrsVal = typeof log === 'object' ? (log.totalHours || 0) : Number(log);
      const isProj = typeof log === 'object' ? !!log.isProjected : false;

      if (isProj) {
        totalProjected += hrsVal;
      } else {
        totalActual += hrsVal;
      }

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
    
    setHoursWorked(totalActual);
    setProjectedHours(totalActual + totalProjected);

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

  const saveCompanyName = async () => {
    if (!user) return;
    try {
      await setDoc(doc(db, 'users', user.uid), { companyName: companyNameInput }, { merge: true });
      setCompanyModalVisible(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      Alert.alert('Error', 'Failed to update company name.');
    }
  };

  // Helper for Premium UI Timeline and PDF
  const formatAddress = (address: string) => {
    if (!address) return { title: 'Unknown', sub: '' };
    const parts = address.split(',');
    return { title: parts[0], sub: parts.slice(1).join(',').trim() };
  };

  const handleExportOptions = () => {
    if (Platform.OS === 'web') {
      generatePDF('share');
    } else {
      Alert.alert(
        "Export Timesheet",
        "How would you like to share this PDF?",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Share / Save", onPress: () => generatePDF('share') },
          { text: "Send via Email", onPress: () => generatePDF('email') }
        ]
      );
    }
  };

  // --- UPGRADED PREMIUM PDF GENERATOR ---
  const generatePDF = async (action: 'share' | 'email' = 'share') => {
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
      const isProj = !!log.isProjected;
      const dayOfWeek = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' });
      
      // Construct the route timeline string
      let routeHtml = '<span style="color: #9ca3af; font-style: italic;">No travel logged</span>';
      if (dayTrips.length > 0) {
          const routes = dayTrips.map(trip => {
              if (trip.stops && trip.stops.length > 0) {
                  return trip.stops.map((s, i) => {
                      const isFirst = i === 0;
                      const isLast = i === trip.stops!.length - 1;
                      const color = isFirst ? '#10B981' : isLast ? '#EF4444' : '#94A3B8';
                      const label = isFirst ? '<strong>[Start]</strong>' : isLast ? '<strong>[End]</strong>' : '<strong>[Stop]</strong>';
                      return `<div style="color: ${color}; padding: 3px 0;">${label} <span style="color: #334155;">${s.address}</span></div>`;
                  }).join('<div style="color: #CBD5E1; font-size: 16px; padding-left: 10px;">&darr;</div>');
              }
              return '<div style="color: #94A3B8; font-style: italic;">Legacy Route Data</div>';
          }).join('<hr style="border: 0; border-top: 1px dashed #E2E8F0; margin: 15px 0;" />');
          routeHtml = `<div style="font-size: 12px; line-height: 1.4;">${routes}</div>`;
      }

      return `
        <tr>
          <td class="val-cell">${date} (${dayOfWeek}) ${isProj ? '<br><span style="color:#F59E0B; font-size:10px;">(Projected)</span>' : ''}</td>
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

    // Generate Receipts Breakdown Table
    let receiptsHtml = '';
    let hasReceipts = false;
    const categoryMap: Record<string, any[]> = {};

    Object.keys(monthReceipts).forEach(date => {
      monthReceipts[date].forEach(r => {
        hasReceipts = true;
        const parts = r.name.split('_');
        let cat = 'Uncategorized';
        let originalName = r.name;
        if (parts.length >= 3 && parts[0] === date) {
           cat = parts[1];
           originalName = parts.slice(2).join('_');
        }
        if (!categoryMap[cat]) categoryMap[cat] = [];
        categoryMap[cat].push({ date, name: originalName });
      });
    });

    if (hasReceipts) {
      const receiptRows = Object.keys(categoryMap).sort().flatMap(cat => {
        return categoryMap[cat].map(r => `<tr><td class="val-cell">${cat}</td><td>${r.date}</td><td>${r.name}</td></tr>`);
      }).join('');

      receiptsHtml = `
        <div style="margin-top: 40px; page-break-inside: avoid;">
          <h3 style="color: #0F172A; margin-bottom: 15px; border-bottom: 2px solid #E2E8F0; padding-bottom: 5px; font-size: 16px; text-transform: uppercase; letter-spacing: 0.5px;">Attached Receipts Breakdown</h3>
          <table><thead><tr><th style="width: 25%;">Category</th><th style="width: 20%;">Date</th><th style="width: 55%;">Document Name</th></tr></thead><tbody>${receiptRows}</tbody></table>
        </div>
      `;
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; color: #334155; margin: 0; padding: 40px; background-color: #ffffff; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1E293B; padding-bottom: 20px; margin-bottom: 30px; }
          .header h1 { margin: 0 0 5px 0; font-size: 28px; color: #0F172A; letter-spacing: -0.5px; font-weight: 800; }
          .header p { margin: 0; color: #64748B; font-size: 14px; }
          .brand { text-align: right; }
          .brand-title { font-size: 20px; font-weight: 800; color: #3B82F6; margin: 0 0 5px 0; letter-spacing: -0.5px; }
          
          .summary-grid { display: flex; gap: 20px; margin-bottom: 30px; }
          .summary-box { flex: 1; background: #F8FAFC; border: 1px solid #E2E8F0; border-top: 4px solid #3B82F6; border-radius: 8px; padding: 15px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
          .summary-box.highlight { background: #ECFDF5; border-color: #E2E8F0; border-top: 4px solid #10B981; }
          .summary-label { font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: #64748B; margin-bottom: 5px; font-weight: 700; }
          .summary-box.highlight .summary-label { color: #059669; }
          .summary-value { font-size: 24px; font-weight: 800; color: #0F172A; margin: 0; }
          .summary-box.highlight .summary-value { color: #10B981; }
          .summary-subtext { font-size: 13px; color: #94A3B8; margin-top: 5px; }

          .notes-section { background: #FFFBEB; border: 1px solid #FEF3C7; border-left: 4px solid #F59E0B; border-radius: 8px; padding: 20px; margin-bottom: 30px; }
          .notes-title { font-size: 14px; font-weight: 800; color: #B45309; margin: 0 0 10px 0; text-transform: uppercase; letter-spacing: 0.5px; }
          .notes-content { margin: 0; font-size: 14px; color: #92400E; line-height: 1.6; white-space: pre-wrap; }

          table { width: 100%; border-collapse: collapse; margin-bottom: 40px; font-size: 13px; }
          th { background: #1E293B; padding: 14px 15px; text-align: left; font-weight: 700; color: #F8FAFC; text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px; }
          td { padding: 15px 12px; border-bottom: 1px solid #E2E8F0; vertical-align: top; color: #334155; }
          tr:nth-child(even) { background-color: #F8FAFC; }
          .val-cell { font-weight: 700; color: #0F172A; }
          .miles-cell { font-weight: 700; color: #3B82F6; }
          
          .table-footer { background: #F1F5F9; font-weight: bold; font-size: 14px; }
          .table-footer td { color: #0F172A; border-top: 2px solid #CBD5E1; border-bottom: none; }

          .signatures { display: flex; justify-content: space-between; margin-top: 60px; page-break-inside: avoid; }
          .sig-block { width: 45%; }
          .sig-line { border-top: 1px solid #94A3B8; margin-bottom: 10px; padding-top: 5px; font-weight: 600; color: #0F172A; }
          .sig-text { font-size: 12px; color: #64748B; font-style: italic; }

          .footer { text-align: center; font-size: 11px; color: #94A3B8; border-top: 1px solid #E2E8F0; padding-top: 20px; margin-top: 40px; }

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
            <h2 class="brand-title">${companyName || 'MyTrackerApp'}</h2>
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
        
        ${receiptsHtml}

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
          <p style="margin: 0 0 5px 0;">Generated securely by ${companyName || 'MyTrackerApp'}</p>
          <p style="margin: 0;">* Mileage deduction is estimated using the 2024 IRS standard mileage rate of 67 cents per mile.</p>
        </div>
        </body>
      </html>
    `;

    try {
      if (Platform.OS === 'web') {
        const isMobileWeb = /iPhone|iPad|iPod|Android|Mobi/i.test(navigator.userAgent);
        
        if (isMobileWeb) {
          // Mobile browsers (especially Safari) often fail to print hidden iframes.
          // Opening a new window/tab is the most reliable way to print on mobile web.
          const printWindow = window.open('', '_blank');
          if (printWindow) {
            printWindow.document.open();
            printWindow.document.write(htmlContent);
            printWindow.document.close();
            
            setTimeout(() => {
              printWindow.focus();
              printWindow.print();
            }, 500);
          } else {
            window.alert("Please allow pop-ups in your browser settings to view and print the timesheet.");
          }
        } else {
          // Desktop web: The invisible iframe works perfectly and is less intrusive.
          const iframe = document.createElement('iframe');
          iframe.style.position = 'absolute';
          iframe.style.top = '-10000px';
          iframe.style.left = '-10000px';
          iframe.style.width = '100%';
          iframe.style.height = '100%';
          iframe.style.border = 'none';
          document.body.appendChild(iframe);
          
          const doc = iframe.contentWindow?.document;
          if (doc) {
            doc.open();
            doc.write(htmlContent);
            doc.close();
          }
          
          // Give the browser time to load and render the iframe before printing
          setTimeout(() => {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
            // Clean up the iframe after the print dialog is triggered
            setTimeout(() => {
              if (document.body.contains(iframe)) {
                document.body.removeChild(iframe);
              }
            }, 2000);
          }, 500);
        }
      } else {
        const file = await Print.printToFileAsync({ html: htmlContent, base64: false });
        
        if (action === 'email') {
          const isAvailable = await MailComposer.isAvailableAsync();
          if (isAvailable) {
            await MailComposer.composeAsync({
              subject: `${displayMonth} Timesheet & Mileage`,
              body: `Please find attached the timesheet and mileage log for ${displayMonth}.`,
              attachments: [file.uri],
            });
          } else {
            Alert.alert("Email Unavailable", "No email app is configured on this device. Using standard share instead.");
            await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', dialogTitle: `${displayMonth.replace(' ', '_')}_Timesheet`, UTI: 'com.adobe.pdf' });
          }
        } else {
          await Sharing.shareAsync(file.uri, { 
            mimeType: 'application/pdf', 
            dialogTitle: `${displayMonth.replace(' ', '_')}_Timesheet`, 
            UTI: 'com.adobe.pdf' 
          });
        }
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
      setIsProjectedShift(!!log.isProjected);
    } else {
      setInHour('09'); setInMin('00'); setInAmPm('AM');
      setOutHour('05'); setOutMin('00'); setOutAmPm('PM');
      setIsProjectedShift(false);
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
        [selectedDate]: { totalHours: calculatedShift, in: inTime, out: outTime, miles: dayMiles, isProjected: isProjectedShift }
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

  const handleDriveUpload = async (uri: string, mimeType: string, fileName: string, shiftDate: string, category: string) => {
    let token = googleToken;
    if (!token) {
      if (request) {
        const result = await promptAsync();
        if (result?.type === 'success') {
          token = result.authentication?.accessToken || null;
          setGoogleToken(token);
        } else return; // User cancelled auth
      } else {
        Alert.alert("Not Ready", "Google Drive authentication is initializing.");
        return;
      }
    }
    if (!token) return;

    setIsUploadingReceipt(true);
    setUploadProgress(0);
    let createdFileId = '';
    try {
      const masterFolderId = await AsyncStorage.getItem('defaultFolderId');
      if (!masterFolderId) {
        Alert.alert('Setup Required', 'To keep your Google Drive organized, please open the Receipts tab first to set up your master folder!');
        setIsUploadingReceipt(false);
        return;
      }

      const monthString = shiftDate.slice(0, 7); // e.g., "2024-03"
      const monthFolderName = `Receipts - ${monthString}`;

      // 1. Get or Create Month Folder
      const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`name='${monthFolderName}' and '${masterFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`)}&fields=files(id)`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const searchData = await searchRes.json();
      
      let monthFolderId = '';
      if (searchData.files && searchData.files.length > 0) {
        monthFolderId = searchData.files[0].id;
      } else {
        const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: monthFolderName, mimeType: 'application/vnd.google-apps.folder', parents: [masterFolderId] }),
        });
        const createData = await createRes.json();
        if (!createData.id) throw new Error("Failed to create folder");
        monthFolderId = createData.id;
      }

      // 2. Get or Create Category Subfolder inside Month Folder
      const catSearchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`name='${category}' and '${monthFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`)}&fields=files(id)`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const catSearchData = await catSearchRes.json();
      
      let categoryFolderId = '';
      if (catSearchData.files && catSearchData.files.length > 0) {
        categoryFolderId = catSearchData.files[0].id;
      } else {
        const createCatRes = await fetch('https://www.googleapis.com/drive/v3/files', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: category, mimeType: 'application/vnd.google-apps.folder', parents: [monthFolderId] }),
        });
        const createCatData = await createCatRes.json();
        categoryFolderId = createCatData.id;
      }

      // 3. Upload file into the specific Category Folder
      const metadataRes = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `${shiftDate}_${category}_${fileName}`, mimeType, parents: [categoryFolderId] }),
      });
      const metadata = await metadataRes.json();
      if (!metadata.id) throw new Error('Failed to create file metadata');
      createdFileId = metadata.id;

      const localFile = await fetch(uri);
      const blob = await localFile.blob();

      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        setActiveXhr(xhr);
        xhr.open('PATCH', `https://www.googleapis.com/upload/drive/v3/files/${metadata.id}?uploadType=media`);
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.setRequestHeader('Content-Type', mimeType);
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            setUploadProgress(Math.round((event.loaded / event.total) * 100));
          }
        };
        xhr.onload = () => {
          setActiveXhr(null);
          if (xhr.status >= 200 && xhr.status < 300) resolve(true);
          else reject(new Error('Failed to upload file content'));
        };
        xhr.onerror = () => {
          setActiveXhr(null);
          reject(new Error('Network error during upload'));
        };
        xhr.onabort = () => {
          setActiveXhr(null);
          reject(new Error('Upload cancelled'));
        };
        xhr.send(blob);
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Success', `Receipt saved directly to your ${category} folder in Google Drive!`);
      fetchMonthlyReceipts(); // Refresh the visible cache
    } catch (error: any) {
      console.error(error);
      if (error.message === 'Upload cancelled') {
        if (createdFileId) {
          fetch(`https://www.googleapis.com/drive/v3/files/${createdFileId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }).catch(e => console.error("Failed to cleanup file", e));
        }
      } else {
        Alert.alert('Upload Error', 'Failed to upload receipt. Your Google session may have expired.');
        await AsyncStorage.removeItem('googleDriveToken');
        setGoogleToken(null);
      }
    } finally {
      setIsUploadingReceipt(false);
      setActiveXhr(null);
    }
  };

  const pickReceiptForShift = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['image/*', 'application/pdf'], copyToCacheDirectory: true });
      if (result.canceled) return;
      const file = result.assets[0];
      const finalCat = receiptCategory === 'Custom' ? (customCategory.trim().replace(/'/g, "") || 'Other') : receiptCategory;
      await handleDriveUpload(file.uri, file.mimeType || 'application/octet-stream', file.name, selectedDate, finalCat);
    } catch (error) { Alert.alert('Error', 'Failed to pick document.'); }
  };

  const takePhotoForShift = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') return Alert.alert('Permission Denied', 'Camera access is required to take photos.');
      const result = await ImagePicker.launchCameraAsync({ quality: 0.4, base64: true });
      if (!result.canceled) {
        setIsUploadingReceipt(true);
        try {
          const asset = result.assets[0];
          // Automatically convert the photo directly to a PDF using Expo Print
          const htmlContent = `
            <!DOCTYPE html>
            <html>
              <head>
                <style>
                  @page { margin: 0; }
                  body { margin: 0; display: flex; justify-content: center; align-items: center; height: 100vh; background-color: white; }
                  img { max-width: 100%; max-height: 100%; object-fit: contain; }
                </style>
              </head>
              <body><img src="data:image/jpeg;base64,${asset.base64}" /></body>
            </html>
          `;
          const { uri: pdfUri } = await Print.printToFileAsync({ html: htmlContent, base64: false });
          const fileName = `Photo_${Date.now()}.pdf`;
          
          const finalCat = receiptCategory === 'Custom' ? (customCategory.trim().replace(/'/g, "") || 'Other') : receiptCategory;
          await handleDriveUpload(pdfUri, 'application/pdf', fileName, selectedDate, finalCat);
        } catch(e) {
          Alert.alert('Error', 'Failed to convert photo to PDF.');
          setIsUploadingReceipt(false);
        }
      }
    } catch (error) { Alert.alert('Error', 'Failed to take photo.'); }
  };

  const deleteReceipt = (fileId: string, fileName: string) => {
    const executeDelete = async () => {
      try {
        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${googleToken}` },
        });
        if (res.ok || res.status === 204) {
          fetchMonthlyReceipts();
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else throw new Error("Failed to delete");
      } catch(e) { Alert.alert("Error", "Could not delete receipt"); }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`Are you sure you want to delete ${fileName}?`)) executeDelete();
    } else {
      Alert.alert("Delete Receipt", `Are you sure you want to delete ${fileName}?`, [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: executeDelete }
      ]);
    }
  };

  const progressHours = Math.min((hoursWorked / monthlyLimit) * 100, 100);
  const colorHours = hoursWorked > monthlyLimit ? "#EF4444" : "#3B82F6";
  const progressProjected = Math.min((projectedHours / monthlyLimit) * 100, 100);
  const progressMiles = Math.min((monthlyMiles / monthlyMilesLimit) * 100, 100);
  const colorMiles = monthlyMiles > monthlyMilesLimit ? "#EF4444" : "#0a7ea4";

  const markedDates: any = {};
  Object.keys(workLogs).forEach(date => {
    const isProj = workLogs[date]?.isProjected;
    markedDates[date] = { marked: true, dotColor: isProj ? '#F59E0B' : '#3B82F6', hasReceipt: !!(monthReceipts[date] && monthReceipts[date].length > 0), isProj };
  });
  Object.keys(monthReceipts).forEach(date => {
    if (!markedDates[date]) {
      markedDates[date] = { marked: false, hasReceipt: true };
    } else {
      markedDates[date].hasReceipt = true;
    }
  });
  if (selectedDate) {
    const isProj = workLogs[selectedDate]?.isProjected;
    markedDates[selectedDate] = { ...markedDates[selectedDate], selected: true, selectedColor: isProj ? '#F59E0B' : '#3B82F6' };
  }
  // Add today's date marking
  if (viewedMonthYear === currentMonthYear) { // Only mark today if viewing the current month
    if (!markedDates[currentDateString]) {
      markedDates[currentDateString] = { today: true };
    } else {
      markedDates[currentDateString].today = true;
    }
  }

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
            <TouchableOpacity onPress={handleExportOptions} style={{ marginRight: 20 }}><Printer color="#F8FAFC" size={28} /></TouchableOpacity>
            <TouchableOpacity onPress={() => setSettingsVisible(true)} style={{ marginRight: 20 }}><Settings color="#94A3B8" size={28} /></TouchableOpacity>
            <TouchableOpacity onPress={handleLogout}><LogOut color="#EF4444" size={28} /></TouchableOpacity>
          </View>
        </View>
        
        <View style={{ paddingHorizontal: 24, marginBottom: 10, marginTop: -5 }}>
          <Text style={{ color: '#3B82F6', fontWeight: 'bold', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1.2 }}>Today is {todayFormatted}</Text>
        </View>

        <View style={styles.dashboardRow}>
          <TouchableOpacity style={styles.dashboardCardThird} onPress={() => { setNewLimitInput(monthlyLimit.toString()); setLimitModalType('hours'); }}>
            <Svg height="100" width="100" viewBox="0 0 100 100">
              <Circle cx="50" cy="50" r="40" stroke="#1E293B" strokeWidth="8" fill="none" />
              <Circle cx="50" cy="50" r="40" stroke={colorHours} strokeWidth="8" fill="none"
                strokeDasharray={`${progressHours * 2.51} 251`} strokeLinecap="round" transform="rotate(-90 50 50)" />
            </Svg>
            <View style={styles.centerTextSmall}>
              <Text style={styles.hoursTextSmall}>{(monthlyLimit - hoursWorked).toFixed(1)}</Text>
            </View>
            <Text style={styles.chartLabel}>Remaining Hrs</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.dashboardCardThird} onPress={() => setHighlightProjected(!highlightProjected)} activeOpacity={0.7}>
            <Svg height="100" width="100" viewBox="0 0 100 100">
              <Circle cx="50" cy="50" r="40" stroke="#1E293B" strokeWidth="8" fill="none" />
              <Circle cx="50" cy="50" r="40" stroke="#F59E0B" strokeWidth="8" fill="none"
                strokeDasharray={`${progressProjected * 2.51} 251`} strokeLinecap="round" transform="rotate(-90 50 50)" />
            </Svg>
            <View style={styles.centerTextSmall}>
              <Text style={styles.hoursTextSmall}>{projectedHours.toFixed(1)}</Text>
            </View>
            <Text style={[styles.chartLabel, { color: '#F59E0B' }]}>Projected</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.dashboardCardThird} onPress={() => { setNewLimitInput(monthlyMilesLimit.toString()); setLimitModalType('miles'); }}>
            <Svg height="100" width="100" viewBox="0 0 100 100">
              <Circle cx="50" cy="50" r="40" stroke="#1E293B" strokeWidth="8" fill="none" />
              <Circle cx="50" cy="50" r="40" stroke={colorMiles} strokeWidth="8" fill="none"
                strokeDasharray={`${progressMiles * 2.51} 251`} strokeLinecap="round" transform="rotate(-90 50 50)" />
            </Svg>
            <View style={styles.centerTextSmall}>
              <Text style={styles.hoursTextSmall}>{monthlyMiles.toFixed(1)}</Text>
            </View>
            <Text style={[styles.chartLabel, { color: '#0a7ea4' }]}>Miles</Text>
          </TouchableOpacity>
        </View>
        
        <View style={styles.calendarContainer}>
          <Calendar 
            theme={{ calendarBackground: '#1E293B', dayTextColor: '#F8FAFC', monthTextColor: '#F8FAFC', todayTextColor: '#3B82F6', arrowColor: '#3B82F6' }}
            onDayPress={handleDayPress} 
            markedDates={markedDates}
            onMonthChange={(month: any) => setViewedMonthYear(month.dateString.slice(0, 7))}
            dayComponent={({date, state}: any) => {
              const marking = markedDates[date.dateString];
              const isSelected = marking?.selected;
              const hasReceipt = marking?.hasReceipt;
              const isMarked = marking?.marked;
              const isProjected = marking?.isProj;
              const isToday = marking?.today;

              let containerStyle: any = {
                alignItems: 'center',
                justifyContent: 'center',
                height: 36,
                width: 36,
                borderRadius: 18,
                borderWidth: 0,
                borderColor: 'transparent',
                backgroundColor: 'transparent',
              };

              let textColor = state === 'disabled' ? '#475569' : '#F8FAFC';

              if (isSelected) {
                containerStyle.backgroundColor = marking.selectedColor || '#3B82F6';
                textColor = '#FFF';
              } else if (isToday) {
                containerStyle.backgroundColor = '#0a7ea4'; // Bright cyan for today
                containerStyle.borderWidth = 2;
                containerStyle.borderColor = '#0891B2'; // Darker cyan border
                textColor = '#0F172A'; // Dark text for better contrast
                containerStyle.shadowColor = '#0a7ea4';
                containerStyle.shadowOpacity = 0.5;
                containerStyle.shadowRadius = 4;
                containerStyle.elevation = 8;
              }

              if (highlightProjected && isProjected) {
                containerStyle.borderWidth = 2;
                containerStyle.borderColor = '#F59E0B';
              }
              return (
                <View style={containerStyle}>
                   <TouchableOpacity onPress={() => handleDayPress(date)} style={{ position: 'absolute', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'flex-start', paddingTop: 5 }}>
                     <Text style={{color: textColor}}>{date.day}</Text>
                   </TouchableOpacity>
                   <View style={{flexDirection: 'row', position: 'absolute', bottom: 4, alignItems: 'center', height: 10, zIndex: 10}}>
                     {isMarked && <View style={{width: 4, height: 4, borderRadius: 2, backgroundColor: marking.dotColor || '#3B82F6', marginRight: hasReceipt ? 4 : 0}} />}
                     {hasReceipt && (
                       <TouchableOpacity onPress={() => router.push('/receipts')} hitSlop={{top: 15, bottom: 15, left: 15, right: 15}}>
                         <Paperclip size={10} color={isSelected ? '#FFF' : '#10B981'} />
                       </TouchableOpacity>
                     )}
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
                {dailyTotalsList.map((item, index) => {
                  const dayOfWeek = new Date(item.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' });
                  const isToday = item.date === currentDateString;
                  return (
                  <TouchableOpacity key={index} style={[styles.weekRow, isToday && { borderColor: '#3B82F6', borderWidth: 1 }]} onPress={() => handleDayPress({ dateString: item.date })} activeOpacity={0.7}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={[styles.weekLabel, isToday && { color: '#F8FAFC' }]}>{item.date} ({dayOfWeek}){isToday ? " - TODAY" : ""}</Text>
                      <ChevronRight size={16} color={isToday ? "#3B82F6" : "#475569"} style={{ marginLeft: 5 }} />
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={[styles.weekHours, isToday && { color: '#3B82F6' }]}>{item.hrs.toFixed(1)} hrs</Text>
                      <View style={{ width: 1, height: 15, backgroundColor: '#475569', marginHorizontal: 10 }} />
                      <Text style={[styles.weekHours, { color: '#0a7ea4' }, isToday && { color: '#38bdf8' }]}>{item.miles.toFixed(1)} mi</Text>
                    </View>
                  </TouchableOpacity>
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
                      <Text style={styles.timelineDate}>{trip.date} {trip.date ? `(${new Date(trip.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' })})` : ''}</Text>
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

                    {monthReceipts[trip.date] && monthReceipts[trip.date].length > 0 && (
                      <View style={{ marginTop: 15, borderTopWidth: 1, borderTopColor: '#334155', paddingTop: 15 }}>
                        <Text style={{ color: '#94A3B8', fontSize: 12, fontWeight: 'bold', marginBottom: 8, textTransform: 'uppercase' }}>Attached Receipts</Text>
                        {monthReceipts[trip.date].map(r => (
                           <View key={r.id} style={[styles.receiptItem, { backgroundColor: '#0F172A', marginBottom: 5, padding: 10 }]}>
                             <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }} onPress={() => Linking.openURL(r.webViewLink)}>
                               <FileText size={16} color="#3B82F6" />
                               <Text style={[styles.receiptItemText, { fontSize: 13 }]} numberOfLines={1} ellipsizeMode="middle">{r.name}</Text>
                             </TouchableOpacity>
                           </View>
                        ))}
                      </View>
                    )}

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
            <TouchableOpacity style={[styles.saveButton, { backgroundColor: '#3B82F6', marginBottom: 15, flexDirection: 'row', justifyContent: 'center' }]} onPress={() => { setCompanyNameInput(companyName); setSettingsVisible(false); setCompanyModalVisible(true); }}>
              <Text style={styles.saveButtonText}>{companyName ? 'Edit Company Name' : 'Set Company Name'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={isCompanyModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { borderRadius: 20, margin: 20, paddingBottom: 30 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Company Name</Text>
              <TouchableOpacity onPress={() => setCompanyModalVisible(false)}><X color="#94A3B8" size={24} /></TouchableOpacity>
            </View>
            <Text style={{ color: '#94A3B8', marginBottom: 15 }}>This name will appear in the top right corner of your exported PDF timesheets.</Text>
            <TextInput 
              style={[styles.loginInput, { textAlign: 'center', fontSize: 20 }]} 
              value={companyNameInput} 
              onChangeText={setCompanyNameInput} 
              placeholder="Enter company name..." 
              placeholderTextColor="#94A3B8"
            />
            <TouchableOpacity style={styles.saveButton} onPress={saveCompanyName}>
              <Text style={styles.saveButtonText}>Save Name</Text>
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
              <Text style={styles.modalTitle}>Shift: {selectedDate} {selectedDate ? `(${new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' })})` : ''}</Text>
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

            <TouchableOpacity 
              style={[styles.timeRow, { justifyContent: 'center', backgroundColor: isProjectedShift ? '#F59E0B20' : '#1E293B', borderColor: isProjectedShift ? '#F59E0B' : 'transparent', borderWidth: 1 }]} 
              onPress={() => setIsProjectedShift(!isProjectedShift)}
            >
              <CheckCircle2 color={isProjectedShift ? "#F59E0B" : "#475569"} size={20} style={{ marginRight: 10 }} />
              <Text style={[styles.timeLabel, { color: isProjectedShift ? '#F59E0B' : '#94A3B8', fontSize: 15 }]}>
                {isProjectedShift ? 'Projected Shift (Tap for Actual)' : 'Actual Shift (Tap for Projected)'}
              </Text>
            </TouchableOpacity>
            
            <View style={styles.durationContainer}>
              <CheckCircle2 color="#3B82F6" size={20} />
              <Text style={styles.durationText}>{calculatedShift} hrs</Text>
              <View style={{ width: 25 }} /> 
              <MapPin color="#0a7ea4" size={20} />
              <Text style={[styles.durationText, { color: '#0a7ea4' }]}>{dayMiles.toFixed(1)} mi</Text>
            </View>

            <View style={{ marginBottom: 15 }}>
              <Text style={{ color: '#94A3B8', fontSize: 12, fontWeight: 'bold', marginBottom: 8, textTransform: 'uppercase' }}>Select Category</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {['Food', 'Outings', 'Gas', 'Supplies', 'Other', 'Custom'].map(cat => (
                  <TouchableOpacity 
                    key={cat} 
                    onPress={() => setReceiptCategory(cat)}
                    style={{ 
                      backgroundColor: receiptCategory === cat ? '#3B82F6' : '#1E293B', 
                      paddingVertical: 8, 
                      paddingHorizontal: 12, 
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: receiptCategory === cat ? '#3B82F6' : '#334155'
                    }}>
                    <Text style={{ color: receiptCategory === cat ? '#FFF' : '#94A3B8', fontSize: 13, fontWeight: 'bold' }}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {receiptCategory === 'Custom' && (
                <TextInput
                  style={[styles.loginInput, { marginTop: 10, marginBottom: 0, paddingVertical: 10, fontSize: 14 }]}
                  placeholder="Enter custom category name..."
                  placeholderTextColor="#94A3B8"
                  value={customCategory}
                  onChangeText={setCustomCategory}
                  maxLength={30}
                />
              )}
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginBottom: 15 }}>
               <TouchableOpacity style={[styles.saveButton, { flex: 1, backgroundColor: '#10B981', flexDirection: 'row', justifyContent: 'center' }]} onPress={takePhotoForShift} disabled={isUploadingReceipt}>
                  {isUploadingReceipt ? <ActivityIndicator color="#fff" size="small" /> : <Camera size={18} color="#fff" style={{ marginRight: 5 }} />}
                  <Text style={[styles.saveButtonText, { fontSize: 14 }]}>Photo Receipt</Text>
               </TouchableOpacity>
               <TouchableOpacity style={[styles.saveButton, { flex: 1, backgroundColor: '#10B981', flexDirection: 'row', justifyContent: 'center' }]} onPress={pickReceiptForShift} disabled={isUploadingReceipt}>
                  {isUploadingReceipt ? <ActivityIndicator color="#fff" size="small" /> : <UploadCloud size={18} color="#fff" style={{ marginRight: 5 }} />}
                  <Text style={[styles.saveButtonText, { fontSize: 14 }]}>File Receipt</Text>
               </TouchableOpacity>
            </View>

        {isUploadingReceipt && uploadProgress > 0 && (
          <View style={{ marginBottom: 15 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
              <Text style={{ color: '#10B981', fontSize: 12, fontWeight: 'bold' }}>UPLOADING...</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ color: '#10B981', fontSize: 12, fontWeight: 'bold', marginRight: 10 }}>{uploadProgress}%</Text>
                {activeXhr && (
                  <TouchableOpacity onPress={() => activeXhr.abort()}>
                    <X size={16} color="#EF4444" />
                  </TouchableOpacity>
                )}
              </View>
            </View>
            <View style={{ height: 6, backgroundColor: '#1E293B', borderRadius: 3, overflow: 'hidden' }}>
              <View style={{ height: '100%', width: `${uploadProgress}%`, backgroundColor: '#10B981' }} />
            </View>
          </View>
        )}

            <View style={{ marginBottom: 20 }}>
               {!googleToken ? (
                 <TouchableOpacity onPress={() => promptAsync()} style={styles.viewReceiptsBtn}>
                   <Text style={styles.viewReceiptsText}>Sign in to view Receipts</Text>
                 </TouchableOpacity>
               ) : !monthReceipts[selectedDate] || monthReceipts[selectedDate].length === 0 ? (
                 <Text style={{ color: '#94A3B8', textAlign: 'center', fontSize: 13, fontStyle: 'italic' }}>No receipts attached to this shift.</Text>
               ) : (
                 <View style={{ gap: 8 }}>
                   <Text style={{ color: '#94A3B8', fontSize: 12, fontWeight: 'bold', marginBottom: 2, textTransform: 'uppercase' }}>ATTACHED RECEIPTS</Text>
                   {monthReceipts[selectedDate].map(r => (
                     <View key={r.id} style={styles.receiptItem}>
                       <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }} onPress={() => Linking.openURL(r.webViewLink)}>
                         <FileText size={18} color="#3B82F6" />
                         <Text style={styles.receiptItemText} numberOfLines={1} ellipsizeMode="middle">{r.name}</Text>
                       </TouchableOpacity>
                       <TouchableOpacity onPress={() => deleteReceipt(r.id, r.name)} style={{ padding: 8 }}>
                         <Trash2 size={18} color="#EF4444" />
                       </TouchableOpacity>
                     </View>
                   ))}
                 </View>
               )}
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
  dashboardCardThird: { alignItems: 'center', position: 'relative', width: '32%' },
  centerTextSmall: { position: 'absolute', top: 34, alignItems: 'center' },
  hoursTextSmall: { fontSize: 24, fontWeight: 'bold', color: '#F8FAFC' },
  limitTextSmall: { fontSize: 12, color: '#94A3B8' },
  chartLabel: { color: '#F8FAFC', fontWeight: 'bold', marginTop: 8, fontSize: 14 },
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
  viewReceiptsBtn: { alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 15, backgroundColor: '#3b82f620', borderRadius: 12 },
  viewReceiptsText: { color: '#3B82F6', fontWeight: 'bold', fontSize: 14 },
  receiptItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0F172A', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#1E293B' },
  receiptItemText: { color: '#F8FAFC', marginLeft: 10, fontSize: 14, flex: 1, fontWeight: '500' },

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