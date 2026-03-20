import { addDoc, collection, deleteDoc, doc, getDocs, onSnapshot, query, setDoc, where, writeBatch } from 'firebase/firestore';
import { ArrowDown, ArrowUp, Calculator, Calendar as CalendarIcon, ChevronLeft, ChevronRight, History, Map, MapPin, Plus, Save, Search, Trash2, X } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { Calendar } from 'react-native-calendars';
import { GooglePlacesAutocomplete } from 'react-native-google-places-autocomplete';
import usePlatform from '../../components/usePlatform';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../firebaseConfig';


// The key is now securely accessed from environment variables
const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

type Stop = { id: string; address: string; };
type Trip = { id: string; date: string; miles: number; stopsCount: number; stops?: Stop[] }; // Keep this type

export default function TabTwoScreen() {
  const { user } = useAuth();
  const flatListRef = useRef<FlatList>(null);
  const [stops, setStops] = useState<Stop[]>([{ id: 'origin', address: '' }, { id: 'dest_1', address: '' }]);
  const [totalMiles, setTotalMiles] = useState<number | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  
  // New State for Monthly History
  const [historyByMonth, setHistoryByMonth] = useState<Record<string, Trip[]>>({});
  const [viewedMonth, setViewedMonth] = useState(new Date().toISOString().slice(0, 7)); // e.g. "2026-03"

  const [activeSearchId, setActiveSearchId] = useState<string | null>(null);
  const [isDatePickerVisible, setDatePickerVisible] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  const [activeEditTripId, setActiveEditTripId] = useState<string | null>(null); 
  // New state for web search
  const [searchQuery, setSearchQuery] = useState('');
  const [autocompleteSuggestions, setAutocompleteSuggestions] = useState<any[]>([]);

  const { isWeb } = usePlatform();

  useEffect(() => {
    if (!user) {
      setHistoryByMonth({});
      return;
    }

    const tripsCollectionRef = collection(db, 'users', user.uid, 'mileage');
    const unsubscribe = onSnapshot(query(tripsCollectionRef), (snapshot) => {
      const newHistory: Record<string, Trip[]> = {};
      snapshot.forEach(doc => {
        const trip = { id: doc.id, ...doc.data() } as Trip;
        const month = trip.date.slice(0, 7);
        if (!newHistory[month]) {
          newHistory[month] = [];
        }
        newHistory[month].push(trip);
      });

      // Sort each month's trips by date
      for (const month in newHistory) {
        newHistory[month].sort((a, b) => b.date.localeCompare(a.date));
      }
      
      setHistoryByMonth(newHistory);
    });

    return () => unsubscribe();
  }, [user]);

  const addStop = () => {
    setStops([...stops, { id: `stop_${Date.now()}`, address: '' }]);
    setTotalMiles(null);
  };

  const removeStop = (id: string) => {
    if (stops.length <= 2) {
      if (Platform.OS === 'web') {
        window.alert("Action Not Allowed: A route must have at least an Origin and a Destination.");
      } else {
        Alert.alert("Action Not Allowed", "A route must have at least an Origin and a Destination.");
      }
      return;
    }
    setStops(stops.filter(s => s.id !== id));
    setTotalMiles(null);
  };

  const moveStop = (index: number, direction: 'up' | 'down') => {
    if ((direction === 'up' && index === 0) || (direction === 'down' && index === stops.length - 1)) return;
    const newStops = [...stops];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    [newStops[index], newStops[targetIndex]] = [newStops[targetIndex], newStops[index]]; // Swap
    setStops(newStops);
    setTotalMiles(null);
  };

  const handlePlaceSelect = (address: string) => {
    if (activeSearchId) {
      setStops(prevStops => prevStops.map(stop => stop.id === activeSearchId ? { ...stop, address } : stop));
      setActiveSearchId(null);
      setTotalMiles(null);
    }
  };

  // Debounced search for web
  useEffect(() => {
    if (!isWeb || !activeSearchId) return;

    const delayDebounceFn = setTimeout(async () => {
      if (searchQuery.length > 2) {
        try {
          const response = await fetch(`/api/places?input=${encodeURIComponent(searchQuery)}`);
          const data = await response.json();
          if (data.status === 'OK') {
            setAutocompleteSuggestions(data.predictions);
          } else {
            console.error('Places Autocomplete API error:', data.error_message);
            setAutocompleteSuggestions([]);
          }
        } catch (error) {
          console.error('Failed to fetch autocomplete suggestions:', error);
          setAutocompleteSuggestions([]);
        }
      } else {
        setAutocompleteSuggestions([]);
      }
    }, 500); // 500ms debounce

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery, isWeb, activeSearchId]);

  const handleWebPlaceSelect = useCallback(async (place_id: string, description: string) => {
    try {
      const response = await fetch('/api/places', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ place_id }) });
      const data = await response.json();
      if (data.status === 'OK' && data.result && data.result.formatted_address) {
        handlePlaceSelect(data.result.formatted_address);
      } else { Alert.alert('Error', data.error_message || 'Failed to get place details.'); }
    } catch (error: any) { Alert.alert('Error', error.message || 'Failed to fetch place details.'); }
  }, [handlePlaceSelect]);


  const calculateMileage = async () => {
    const validStops = stops.filter(stop => stop.address.trim() !== '');
    if (validStops.length < 2) {
      Alert.alert('Incomplete Route', 'Please enter at least two locations.');
      return;
    }
    setIsCalculating(true);
    let totalMeters = 0;
    try {
      for (let i = 0; i < validStops.length - 1; i++) {
        const origins = validStops[i].address;
        const destinations = validStops[i+1].address;
        let data;

        if (isWeb) {
          // On web, call our local proxy API route
          const response = await fetch('/api/distancematrix', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ origins, destinations }),
          });
          data = await response.json();
        } else {
          // On native, we can still call Google directly
          const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origins)}&destinations=${encodeURIComponent(destinations)}&units=imperial&key=${GOOGLE_MAPS_API_KEY}`;
          const response = await fetch(url);
          data = await response.json();
        }

        if (data.status === 'OK' && data.rows[0].elements[0].status === 'OK') {
          totalMeters += data.rows[0].elements[0].distance.value;
        } else { throw new Error(data.error_message || `Calculation failed for a segment.`); }
      }
      setTotalMiles(parseFloat((totalMeters * 0.000621371).toFixed(2)));
    } catch (error: any) { Alert.alert('Mileage Error', error.message); } finally { setIsCalculating(false); }
  };

  const saveTrip = async () => {
    if (!user) return Alert.alert("Not Logged In", "You must be logged in to save a trip.");
    if (totalMiles === null) {
      Alert.alert("Cannot Save", "Please calculate the mileage before saving.");
      return;
    }
    const validStops = stops.filter(s => s.address.trim() !== '');
    const tripToSave = {
      date: selectedDate,
      miles: totalMiles,
      stopsCount: validStops.length,
      stops: validStops
    };

    try {
      if (activeEditTripId) {
        // Update existing trip
        const tripRef = doc(db, 'users', user.uid, 'mileage', activeEditTripId);
        await setDoc(tripRef, tripToSave);
      } else {
        // Add new trip
        await addDoc(collection(db, 'users', user.uid, 'mileage'), tripToSave);
      }
      
      cancelRouteEdit();
      Alert.alert('Success', `Trip ${activeEditTripId ? 'Updated' : 'Saved'}!`);

    } catch (error) {
      console.error("Error saving trip to Firestore:", error);
      Alert.alert('Error', 'There was an issue saving your trip.');
    }
  };

  const deleteTrip = (id: string) => {
    if (!user) return;

    const executeDelete = async () => {
      try {
        // Optimistically update the UI for a better user experience
        const tripToDelete = Object.values(historyByMonth).flat().find(t => t.id === id);
        if (tripToDelete) {
          const month = tripToDelete.date.slice(0, 7);
          setHistoryByMonth(prev => {
            const newHistory = { ...prev };
            const updatedMonthTrips = (newHistory[month] || []).filter(t => t.id !== id);
            
            if (updatedMonthTrips.length > 0) {
              newHistory[month] = updatedMonthTrips;
            } else {
              delete newHistory[month];
            }
            return newHistory;
          });
        }

        // Perform the database operation
        const tripRef = doc(db, 'users', user.uid, 'mileage', id);
        await deleteDoc(tripRef);

        if (activeEditTripId === id) {
          cancelRouteEdit();
        }
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
      if (window.confirm('Are you sure you want to permanently delete this trip?')) {
        executeDelete();
      }
    } else {
      Alert.alert('Delete Trip', 'Are you sure you want to permanently delete this trip?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: executeDelete }
      ]);
    }
  };

  const clearMonthHistory = () => {
    if (!user) return;

    const executeClear = async () => {
      const batch = writeBatch(db);
      const tripsCollectionRef = collection(db, 'users', user.uid, 'mileage');
      const q = query(tripsCollectionRef, where('date', '>=', viewedMonth), where('date', '<', `${viewedMonth}-32`));

      try {
        const snapshot = await getDocs(q);
        snapshot.docs.forEach(doc => {
          batch.delete(doc.ref);
        });
        await batch.commit();
        if (tripsForViewedMonth.some(t => t.id === activeEditTripId)) {
          cancelRouteEdit();
        }
      } catch (error) {
        console.error("Error clearing month history:", error);
        if (Platform.OS === 'web') {
          window.alert('Could not clear month history.');
        } else {
          Alert.alert('Error', 'Could not clear month history.');
        }
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`Are you sure you want to delete all ${tripsForViewedMonth.length} trips for this month? This cannot be undone.`)) {
        executeClear();
      }
    } else {
      Alert.alert(`Clear ${displayMonth}?`, `Are you sure you want to delete all ${tripsForViewedMonth.length} trips for this month? This cannot be undone.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear Month', style: 'destructive', onPress: executeClear }
      ]);
    }
  };

  const loadTripForEditing = (trip: Trip) => {
    setStops(trip.stops && trip.stops.length > 0 ? trip.stops : [{id: 'origin', address: ''}, {id: 'dest_1', address: ''}]);
    setSelectedDate(trip.date);
    setTotalMiles(trip.miles);
    setActiveEditTripId(trip.id);
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
  };

  const cancelRouteEdit = () => {
    setActiveEditTripId(null);
    setStops([{ id: 'origin', address: '' }, { id: 'dest_1', address: '' }]);
    setTotalMiles(null);
    setSelectedDate(new Date().toISOString().split('T')[0]);
  };

  const formatAddress = (address: string) => {
    if (!address) return { title: 'Unknown', sub: '' };
    const parts = address.split(',');
    return { title: parts[0], sub: parts.slice(1).join(',').trim() };
  };

  const changeMonth = (direction: number) => {
    const currentDate = new Date(viewedMonth + '-15T12:00:00Z'); // Use day 15 to avoid month-end issues
    currentDate.setMonth(currentDate.getMonth() + direction);
    setViewedMonth(currentDate.toISOString().slice(0, 7));
  };
  
  const { tripsForViewedMonth, monthMiles, displayMonth } = useMemo(() => {
    const trips = historyByMonth[viewedMonth] || [];
    const miles = trips.reduce((sum, trip) => sum + trip.miles, 0);
    const date = new Date(viewedMonth + '-15T12:00:00Z');
    const monthName = date.toLocaleString('default', { month: 'long', timeZone: 'UTC' });
    const year = date.getUTCFullYear();
    return {
      tripsForViewedMonth: trips,
      monthMiles: miles.toFixed(1),
      displayMonth: `${monthName} ${year}`
    };
  }, [viewedMonth, historyByMonth]);

  const renderHeader = () => (
    <View style={styles.content}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{activeEditTripId ? 'Edit Route' : 'New Route'}</Text>
        {activeEditTripId && <View style={styles.editBadge}><Text style={styles.editBadgeText}>Editing Mode</Text></View>}
      </View>
      
      <View style={styles.dateCard}>
        <Text style={styles.dateLabel}>Trip Date:</Text>
        <TouchableOpacity style={styles.dateButton} onPress={() => setDatePickerVisible(true)}>
          <CalendarIcon size={20} color="#0a7ea4" />
          <Text style={styles.dateButtonText}>{selectedDate}</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.card, activeEditTripId ? styles.cardEditing : null]}>
        {stops.map((stop, index) => (
          <View key={stop.id} style={styles.stopContainer}>
            <View style={styles.stopLabelContainer}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                <MapPin size={16} color={index === 0 ? '#10b981' : index === stops.length - 1 ? '#ef4444' : '#6b7280'} />
                <Text style={styles.stopLabel}>{index === 0 ? 'Origin' : index === stops.length - 1 ? 'Destination' : `Stop ${index + 1}`}</Text>
              </View>
              
              <View style={styles.stopControls}>
                <TouchableOpacity onPress={() => moveStop(index, 'up')} disabled={index === 0} style={styles.controlBtn}>
                   <ArrowUp size={16} color={index === 0 ? "#cbd5e1" : "#6b7280"} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => moveStop(index, 'down')} disabled={index === stops.length - 1} style={styles.controlBtn}>
                   <ArrowDown size={16} color={index === stops.length - 1 ? "#cbd5e1" : "#6b7280"} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => removeStop(stop.id)} style={[styles.controlBtn, { marginLeft: 5 }]}>
                   <Trash2 size={16} color="#ef4444" />
                </TouchableOpacity>
              </View>
            </View>
            
            <TouchableOpacity style={[styles.searchTriggerButton, activeEditTripId && { backgroundColor: '#fffbeb' }]} onPress={() => setActiveSearchId(stop.id)}>
              <Text style={[styles.searchTriggerText, !stop.address && { color: '#9ca3af' }]} numberOfLines={1}>
                {stop.address || 'Search for a location...'}
              </Text>
            </TouchableOpacity>
          </View>
        ))}
        <TouchableOpacity style={styles.addButton} onPress={addStop}>
          <Plus size={20} color={activeEditTripId ? "#d97706" : "#0a7ea4"} />
          <Text style={[styles.addButtonText, activeEditTripId && { color: "#d97706" }]}>Add Stop</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.actionCard}>
        {totalMiles !== null && (<View style={styles.resultContainer}><Text style={styles.resultValue}>{totalMiles.toFixed(2)} miles</Text></View>)}
        <View style={styles.actionButtons}>
          <TouchableOpacity style={[styles.button, styles.calculateButton]} onPress={calculateMileage} disabled={isCalculating}>
            <Calculator size={20} color="#fff" /><Text style={styles.buttonText}>{isCalculating ? 'Calculating...' : 'Calculate'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, activeEditTripId ? styles.updateButton : styles.saveButton, totalMiles === null && styles.buttonDisabled]} onPress={saveTrip} disabled={totalMiles === null}>
            <Save size={20} color="#fff" /><Text style={styles.buttonText}>{activeEditTripId ? 'Update Trip' : 'Save Trip'}</Text>
          </TouchableOpacity>
        </View>
        {activeEditTripId && (
          <TouchableOpacity style={styles.cancelEditButton} onPress={cancelRouteEdit}><Text style={styles.cancelEditText}>Cancel Edit</Text></TouchableOpacity>
        )}
      </View>

      <View style={styles.historySection}>
        <View style={styles.historyHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><History size={22} color="#374151" /><Text style={styles.historyTitle}>Monthly History</Text></View>
        </View>

        <View style={styles.monthNavigator}>
          <TouchableOpacity onPress={() => changeMonth(-1)} style={styles.monthNavButton}><ChevronLeft size={24} color="#0a7ea4" /></TouchableOpacity>
          <Text style={styles.monthDisplayText}>{displayMonth}</Text>
          <TouchableOpacity onPress={() => changeMonth(1)} style={styles.monthNavButton}><ChevronRight size={24} color="#0a7ea4" /></TouchableOpacity>
        </View>
        
        {tripsForViewedMonth.length > 0 ? (
          <>
            <View style={styles.totalSummary}>
              <Text style={styles.totalSummaryLabel}>{displayMonth} Totals:</Text>
              <Text style={styles.totalSummaryValue}>{monthMiles} mi over {tripsForViewedMonth.length} trips</Text>
            </View>
            <TouchableOpacity style={styles.clearMonthButton} onPress={clearMonthHistory}>
                <Trash2 size={14} color="#ef4444" />
                <Text style={styles.clearText}>Clear Month</Text>
            </TouchableOpacity>
          </>
        ) : (
          <Text style={styles.emptyHistory}>No trips logged for {displayMonth}.</Text>
        )}

        {tripsForViewedMonth.map((trip) => {
          const hasStops = trip.stops && trip.stops.length > 0;
          return (
            <View key={trip.id} style={styles.premiumHistoryItem}>
              <View style={styles.premiumHistoryHeader}>
                <Text style={styles.historyDate}>{trip.date}</Text>
                <View style={styles.mileageBadge}><Text style={styles.mileageBadgeText}>{trip.miles.toFixed(1)} mi</Text></View>
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
                          <Text style={styles.timelineTitle} numberOfLines={1}>{addr.title}</Text>
                          {addr.sub ? <Text style={styles.timelineSub} numberOfLines={1}>{addr.sub}</Text> : null}
                        </View>
                      </View>
                    );
                  })}
                </View>
              ) : <Text style={styles.legacyText}>{trip.stopsCount} stops (Legacy Data - cannot edit route)</Text>}
              <View style={styles.premiumActions}>
                <TouchableOpacity style={[styles.actionPill, !hasStops && { opacity: 0.5 }]} onPress={() => loadTripForEditing(trip)} disabled={!hasStops}>
                  <Map size={14} color="#0a7ea4" /><Text style={styles.actionPillText}>Edit Route</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.iconButton} onPress={() => deleteTrip(trip.id)}><Trash2 size={18} color="#ef4444" /></TouchableOpacity>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );

  return (
    <KeyboardAvoidingView style={[styles.container, Platform.OS === 'web' && styles.webContainer]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <FlatList ref={flatListRef} data={[]} renderItem={null} ListHeaderComponent={renderHeader} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scrollContent} />
      
      <Modal visible={activeSearchId !== null} animationType="slide">
        <SafeAreaView style={[styles.searchModalContainer, isWeb && { paddingTop: 0 }]}>
          <View style={styles.searchModalHeader}>
            <TouchableOpacity onPress={() => setActiveSearchId(null)} style={styles.closeModalHeaderBtn}><X size={24} color="#333" /></TouchableOpacity>
            <Text style={styles.searchModalTitle}>Find Location</Text><View style={{ width: 24 }} />
          </View>
          {activeSearchId && (
            isWeb ? 
              <View style={styles.webSearchContainer}>
                <View style={styles.webSearchInputContainer}>
                  <Search size={20} color="#9ca3af" style={{ marginRight: 10 }} />
                  <TextInput
                    style={styles.webSearchInput}
                    placeholder="Search for a location..."
                    placeholderTextColor="#9ca3af"
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    autoFocus
                  />
                </View>
                <FlatList
                  data={autocompleteSuggestions}
                  keyExtractor={(item, index) => item.place_id || index.toString()}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={{ flexGrow: 1, paddingBottom: 20 }}
                  ListEmptyComponent={
                    searchQuery.length > 2 ? (
                      <View style={{ padding: 20, alignItems: 'center' }}>
                        <Text style={{ color: '#6b7280', fontSize: 15 }}>No results found.</Text>
                        <Text style={{ color: '#9ca3af', fontSize: 12, marginTop: 10, textAlign: 'center' }}>
                          (If this persists, please verify your Google Maps API key in Vercel Environment Variables and ensure you clicked "Redeploy")
                        </Text>
                      </View>
                    ) : null
                  }
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={styles.webSuggestionRow}
                      onPress={() => handleWebPlaceSelect(item.place_id, item.description)}
                    >
                      <Text style={styles.webSuggestionText}>{item.description}</Text>
                    </TouchableOpacity>
                  )}
                  ItemSeparatorComponent={() => <View style={styles.webSuggestionSeparator} />}
                />
              </View>
            : // Native GooglePlacesAutocomplete
            <GooglePlacesAutocomplete
              placeholder="Type address..."
              onPress={(data: any) => handlePlaceSelect(data.description)}
              query={{ key: GOOGLE_MAPS_API_KEY, language: 'en' }}
              fetchDetails={true}
              keyboardShouldPersistTaps="handled"
              styles={{
                container: { flex: 1, zIndex: 10 },
                textInputContainer: { paddingHorizontal: 15, paddingBottom: 10 },
                textInput: { backgroundColor: '#f3f4f6', height: 45, borderRadius: 8, paddingHorizontal: 15, fontSize: 16 },
                listView: { flex: 1, zIndex: 1000, elevation: 1000 },
                row: { padding: 15 },
                separator: { height: 1, backgroundColor: '#e5e7eb' },
                description: { fontSize: 15, color: '#1f2937' },
              }}
            />
          )}
        </SafeAreaView>
      </Modal>

      <Modal visible={isDatePickerVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Calendar onDayPress={(day: any) => { setSelectedDate(day.dateString); setDatePickerVisible(false); }} markedDates={{ [selectedDate]: { selected: true, selectedColor: '#0a7ea4' } }} theme={{ todayTextColor: '#0a7ea4', arrowColor: '#0a7ea4' }}/>
            <TouchableOpacity style={styles.closeModalButton} onPress={() => setDatePickerVisible(false)}><Text style={styles.closeModalText}>Cancel</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  webContainer: {
    maxWidth: 800,
    width: '100%',
    marginHorizontal: 'auto',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: '#e5e7eb'
  },
  scrollContent: { paddingBottom: 40 },
  content: { padding: 15 },
  header: { marginBottom: 15, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { fontSize: 28, fontWeight: 'bold', color: '#111827' },
  editBadge: { backgroundColor: '#fef3c7', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: '#fcd34d' },
  editBadgeText: { color: '#d97706', fontSize: 12, fontWeight: 'bold' },
  dateCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 12, borderRadius: 12, marginBottom: 15, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4 },
  dateLabel: { fontSize: 16, fontWeight: '600', marginRight: 10, color: '#374151' },
  dateButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#e0f2fe', paddingHorizontal: 15, paddingVertical: 10, borderRadius: 8 },
  dateButtonText: { fontSize: 16, fontWeight: '700', color: '#0369a1', marginLeft: 8 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 15, marginBottom: 15, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4 },
  cardEditing: { borderColor: '#fcd34d', borderWidth: 2, backgroundColor: '#fffbeb' },
  stopContainer: { marginBottom: 15 },
  stopLabelContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  stopLabel: { fontSize: 14, fontWeight: '600', marginLeft: 8, color: '#4b5563' },
  stopControls: { flexDirection: 'row', alignItems: 'center', marginLeft: 'auto' },
  controlBtn: { padding: 5, backgroundColor: '#f3f4f6', borderRadius: 6, marginLeft: 4, borderWidth: 1, borderColor: '#e5e7eb' },
  searchTriggerButton: { backgroundColor: '#f3f4f6', borderRadius: 8, minHeight: 50, justifyContent: 'center', paddingHorizontal: 12, borderWidth: 1, borderColor: '#e5e7eb' },
  searchTriggerText: { fontSize: 16, color: '#1f2937' },
  addButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, marginTop: 5, borderRadius: 8, backgroundColor: '#e0f2fe' },
  addButtonText: { color: '#0a7ea4', fontWeight: 'bold', marginLeft: 8 },
  actionCard: { backgroundColor: '#fff', borderRadius: 12, padding: 15, marginBottom: 15, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4 },
  resultContainer: { alignItems: 'center', padding: 12, backgroundColor: '#e0f2fe', borderRadius: 8, marginBottom: 15 },
  resultValue: { fontSize: 28, fontWeight: 'bold', color: '#0369a1' },
  actionButtons: { flexDirection: 'row', gap: 10 },
  button: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 15, borderRadius: 8, elevation: 2, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 2 },
  calculateButton: { backgroundColor: '#22c55e' },
  saveButton: { backgroundColor: '#0ea5e9' },
  updateButton: { backgroundColor: '#f97316' },
  cancelEditButton: { marginTop: 15, alignItems: 'center', padding: 10 },
  cancelEditText: { color: '#ef4444', fontWeight: '600', fontSize: 15 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontWeight: 'bold', marginLeft: 8, fontSize: 16 },
  historySection: { backgroundColor: '#fff', borderRadius: 12, padding: 15, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, marginTop: 10 },
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  historyTitle: { fontSize: 20, fontWeight: 'bold', color: '#1f2937' },
  monthNavigator: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, backgroundColor: '#f9fafb', borderRadius: 8, marginBottom: 15 },
  monthNavButton: { padding: 10 },
  monthDisplayText: { fontSize: 18, fontWeight: 'bold', color: '#0369a1' },
  clearMonthButton: { flexDirection: 'row', gap: 6, alignItems: 'center', alignSelf: 'flex-end', padding: 8 },
  clearText: { color: '#ef4444', fontWeight: '600', fontSize: 13 },
  totalSummary: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#e0f2fe', padding: 12, borderRadius: 8, marginBottom: 10 },
  totalSummaryLabel: { fontWeight: '600', color: '#0369a1', fontSize: 16 },
  totalSummaryValue: { fontWeight: 'bold', color: '#0369a1', fontSize: 16 },
  emptyHistory: { textAlign: 'center', color: '#9ca3af', paddingVertical: 25, fontStyle: 'italic', fontSize: 15 },
  premiumHistoryItem: { backgroundColor: '#f9fafb', borderRadius: 10, padding: 15, marginBottom: 10, borderWidth: 1, borderColor: '#e5e7eb' },
  premiumHistoryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  historyDate: { fontWeight: '700', fontSize: 17, color: '#111827' },
  mileageBadge: { backgroundColor: '#e0f2fe', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  mileageBadgeText: { color: '#0369a1', fontWeight: 'bold', fontSize: 15 },
  timelineContainer: { paddingLeft: 5 },
  timelineRow: { flexDirection: 'row', minHeight: 45 },
  timelineVisual: { width: 20, alignItems: 'center', marginRight: 10 },
  timelineDot: { width: 10, height: 10, borderRadius: 5, zIndex: 2 },
  dotOrigin: { backgroundColor: '#10b981' },
  dotDest: { backgroundColor: '#ef4444' },
  dotMid: { backgroundColor: '#9ca3af', width: 8, height: 8 },
  timelineLine: { width: 2, flex: 1, backgroundColor: '#e5e7eb', marginTop: -2, marginBottom: -2, zIndex: 1 },
  timelineText: { flex: 1, paddingBottom: 15, marginTop: -3 },
  timelineTitle: { fontSize: 15, fontWeight: '600', color: '#1f2937' },
  timelineSub: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  legacyText: { fontSize: 13, color: '#6b7280', fontStyle: 'italic', marginBottom: 10, padding: 10, textAlign: 'center' },
  premiumActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#e5e7eb' },
  actionPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#e0f2fe', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16 },
  actionPillText: { color: '#0369a1', fontSize: 13, fontWeight: '600', marginLeft: 6 },
  iconButton: { padding: 8, backgroundColor: '#fee2e2', borderRadius: 8 },
  
  searchModalContainer: { flex: 1, backgroundColor: '#fff' },
  searchModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 15, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  closeModalHeaderBtn: { padding: 5 },
  searchModalTitle: { fontSize: 18, fontWeight: 'bold', color: '#1f2937' }, // Keep this style

  // New styles for web search
  webSearchContainer: { flex: 1, paddingHorizontal: 15, paddingTop: 10 },
  webSearchInputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f3f4f6', borderRadius: 8, paddingHorizontal: 15, height: 45, marginBottom: 10 },
  webSearchInput: { flex: 1, fontSize: 16, color: '#1f2937' },
  webSuggestionRow: { paddingVertical: 15, paddingHorizontal: 5 },
  webSuggestionText: { fontSize: 15, color: '#1f2937' },
  webSuggestionSeparator: { height: 1, backgroundColor: '#e5e7eb', marginLeft: 5 },
  
  modalOverlay: { flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)', padding: 20 },
  modalContent: { backgroundColor: '#fff', borderRadius: 10, padding: 10, overflow: 'hidden' },
  closeModalButton: { marginTop: 10, alignItems: 'center', padding: 12, backgroundColor: '#f3f4f6', borderRadius: 8 },
  closeModalText: { color: '#ef4444', fontWeight: 'bold', fontSize: 16 }
});