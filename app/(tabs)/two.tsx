import AsyncStorage from '@react-native-async-storage/async-storage';
import { Calculator, Calendar as CalendarIcon, Edit2, History, MapPin, Plus, Save, Trash2 } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { Calendar } from 'react-native-calendars';
import { GooglePlacesAutocomplete } from 'react-native-google-places-autocomplete';

const GOOGLE_MAPS_API_KEY = 'AIzaSyAz-gl-odw9YBia7R4nJxURd5pWioFdvhc';

type Stop = { id: string; address: string; };
type Trip = { id: string; date: string; miles: number; stopsCount: number; };

export default function TabTwoScreen() {
  const [stops, setStops] = useState<Stop[]>([{ id: 'origin', address: '' }, { id: 'dest_1', address: '' }]);
  const [totalMiles, setTotalMiles] = useState<number | null>(null);
  const [history, setHistory] = useState<Trip[]>([]);
  const [isCalculating, setIsCalculating] = useState(false);
  
  // Date Picker State
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [datePickerTarget, setDatePickerTarget] = useState<'new' | 'edit' | null>(null);

  // Edit Modal State
  const [editingTrip, setEditingTrip] = useState<Trip | null>(null);
  const [editMiles, setEditMiles] = useState('');
  const [editDate, setEditDate] = useState('');

  useEffect(() => { loadHistory(); }, []);

  const loadHistory = async () => {
    try {
      const stored = await AsyncStorage.getItem('@mileage_history');
      if (stored) setHistory(JSON.parse(stored));
    } catch (error) { console.error('Failed to load history', error); }
  };

  const addStop = () => {
    setStops([...stops, { id: `stop_${Date.now()}`, address: '' }]);
    setTotalMiles(null);
  };

  const updateStopAddress = (id: string, address: string) => {
    setStops(stops.map(stop => (stop.id === id ? { ...stop, address } : stop)));
    setTotalMiles(null);
  };

  const calculateMileage = async () => {
    const validStops = stops.filter(stop => stop.address.trim() !== '');
    if (validStops.length < 2) {
      Alert.alert('Incomplete Route', 'Please enter at least an origin and a destination.');
      return;
    }
    setIsCalculating(true);
    let totalMeters = 0;
    try {
      for (let i = 0; i < validStops.length - 1; i++) {
        const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(validStops[i].address)}&destinations=${encodeURIComponent(validStops[i+1].address)}&units=imperial&key=${GOOGLE_MAPS_API_KEY}`;
        const data = await (await fetch(url)).json();
        if (data.status === 'OK' && data.rows[0].elements[0].status === 'OK') {
          totalMeters += data.rows[0].elements[0].distance.value;
        } else { throw new Error(data.error_message || `Calculation failed.`); }
      }
      setTotalMiles(parseFloat((totalMeters * 0.000621371).toFixed(2)));
    } catch (error: any) { Alert.alert('Error', error.message); } finally { setIsCalculating(false); }
  };

  const saveTrip = async () => {
    if (totalMiles === null) return;
    const newTrip = { id: Date.now().toString(), date: selectedDate, miles: totalMiles, stopsCount: stops.filter(s => s.address.trim() !== '').length };
    
    // Kept slice to 10 so you can build a bit more history, change to whatever limit you want
    const newHistory = [newTrip, ...history].slice(0, 15);
    setHistory(newHistory);
    await AsyncStorage.setItem('@mileage_history', JSON.stringify(newHistory));
    setStops([{ id: 'origin', address: '' }, { id: 'dest_1', address: '' }]);
    setTotalMiles(null);
    Alert.alert('Success', 'Trip saved!');
  };

  // --- NEW QOL FEATURES ---

  const deleteTrip = (id: string) => {
    Alert.alert('Delete Trip', 'Are you sure you want to remove this trip from your history?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
          const newHistory = history.filter(trip => trip.id !== id);
          setHistory(newHistory);
          await AsyncStorage.setItem('@mileage_history', JSON.stringify(newHistory));
        }
      }
    ]);
  };

  const clearAllHistory = () => {
    Alert.alert('Clear History', 'Are you sure you want to delete ALL saved trips? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear All', style: 'destructive', onPress: async () => {
          setHistory([]);
          await AsyncStorage.removeItem('@mileage_history');
        }
      }
    ]);
  };

  const openEditModal = (trip: Trip) => {
    setEditingTrip(trip);
    setEditMiles(trip.miles.toString());
    setEditDate(trip.date);
  };

  const saveEditedTrip = async () => {
    if (!editingTrip) return;
    const parsedMiles = parseFloat(editMiles);
    
    if (isNaN(parsedMiles)) {
      Alert.alert('Invalid Input', 'Please enter a valid number for miles.');
      return;
    }

    const newHistory = history.map(trip => 
      trip.id === editingTrip.id ? { ...trip, miles: parsedMiles, date: editDate } : trip
    );

    setHistory(newHistory);
    await AsyncStorage.setItem('@mileage_history', JSON.stringify(newHistory));
    setEditingTrip(null);
  };

  const totalHistoryMiles = history.reduce((sum, trip) => sum + trip.miles, 0).toFixed(2);

  // --- RENDER ---

  const renderHeader = () => (
    <View style={styles.content}>
      <View style={styles.header}><Text style={styles.headerTitle}>Mileage Tracker</Text></View>
      
      <View style={styles.dateCard}>
        <Text style={styles.dateLabel}>Work Day:</Text>
        <TouchableOpacity style={styles.dateButton} onPress={() => setDatePickerTarget('new')}>
          <CalendarIcon size={20} color="#0a7ea4" />
          <Text style={styles.dateButtonText}>{selectedDate}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        {stops.map((stop, index) => (
          <View key={stop.id} style={[styles.stopContainer, { zIndex: 100 - index, elevation: 100 - index }]}>
            <View style={styles.stopLabelContainer}>
              <MapPin size={16} color="#0a7ea4" />
              <Text style={styles.stopLabel}>{index === 0 ? 'Origin' : index === stops.length - 1 ? 'Destination' : `Stop ${index + 1}`}</Text>
            </View>
            <GooglePlacesAutocomplete
              placeholder="McDonald's, Taco Bell, or address..."
              onPress={(data) => updateStopAddress(stop.id, data.description)}
              query={{ key: GOOGLE_MAPS_API_KEY, language: 'en' }}
              disableScroll={true} 
              styles={{ textInput: styles.searchTextInput, listView: styles.listView }}
            />
          </View>
        ))}
        <TouchableOpacity style={styles.addButton} onPress={addStop}>
          <Plus size={20} color="#0a7ea4" /><Text style={styles.addButtonText}>Add Stop</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.actionCard}>
        {totalMiles !== null && (<View style={styles.resultContainer}><Text style={styles.resultValue}>{totalMiles} miles</Text></View>)}
        <View style={styles.actionButtons}>
          <TouchableOpacity style={[styles.button, styles.calculateButton]} onPress={calculateMileage} disabled={isCalculating}>
            <Calculator size={20} color="#fff" /><Text style={styles.buttonText}>{isCalculating ? '...' : 'Calculate'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, styles.saveButton, totalMiles === null && styles.buttonDisabled]} onPress={saveTrip} disabled={totalMiles === null}>
            <Save size={20} color="#fff" /><Text style={styles.buttonText}>Save</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.historyCard}>
        <View style={styles.historyHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <History size={20} color="#333" />
            <Text style={styles.historyTitle}>Recent Trips</Text>
          </View>
          {history.length > 0 && (
            <TouchableOpacity onPress={clearAllHistory}>
               <Text style={styles.clearText}>Clear All</Text>
            </TouchableOpacity>
          )}
        </View>

        {history.length > 0 ? (
          <View style={styles.totalSummary}>
             <Text style={styles.totalSummaryLabel}>Total Logged:</Text>
             <Text style={styles.totalSummaryValue}>{totalHistoryMiles} mi</Text>
          </View>
        ) : (
          <Text style={styles.emptyHistory}>No trips logged yet.</Text>
        )}

        {history.map((trip) => (
          <View key={trip.id} style={styles.historyItem}>
            <View style={{ flex: 1 }}>
              <Text style={styles.historyDate}>{trip.date}</Text>
              <Text style={styles.historyStops}>{trip.stopsCount} stops • {trip.miles} mi</Text>
            </View>
            <View style={styles.historyActions}>
              <TouchableOpacity style={styles.iconButton} onPress={() => openEditModal(trip)}>
                <Edit2 size={18} color="#0a7ea4" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.iconButton} onPress={() => deleteTrip(trip.id)}>
                <Trash2 size={18} color="#dc3545" />
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </View>
    </View>
  );

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <FlatList
        data={[]} 
        renderItem={null}
        ListHeaderComponent={renderHeader}
        keyboardShouldPersistTaps="always"
        contentContainerStyle={styles.scrollContent}
      />

      {/* Shared Calendar Modal */}
      <Modal visible={datePickerTarget !== null} transparent={true} animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Calendar 
              onDayPress={(day: any) => { 
                if (datePickerTarget === 'edit') setEditDate(day.dateString);
                else setSelectedDate(day.dateString);
                setDatePickerTarget(null); 
              }} 
              markedDates={{ 
                [datePickerTarget === 'edit' ? editDate : selectedDate]: { selected: true, selectedColor: '#0a7ea4' } 
              }} 
            />
            <TouchableOpacity style={styles.closeModalButton} onPress={() => setDatePickerTarget(null)}>
              <Text style={styles.closeModalText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Edit Trip Modal */}
      <Modal visible={editingTrip !== null} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.editModalContent}>
            <Text style={styles.editModalTitle}>Edit Trip</Text>
            
            <Text style={styles.editLabel}>Date</Text>
            <TouchableOpacity style={styles.dateButton} onPress={() => setDatePickerTarget('edit')}>
              <CalendarIcon size={20} color="#0a7ea4" />
              <Text style={styles.dateButtonText}>{editDate}</Text>
            </TouchableOpacity>

            <Text style={[styles.editLabel, { marginTop: 15 }]}>Miles</Text>
            <TextInput 
              style={styles.editTextInput}
              value={editMiles}
              onChangeText={setEditMiles}
              keyboardType="numeric"
              placeholder="e.g. 15.5"
            />

            <View style={styles.editModalActions}>
               <TouchableOpacity style={[styles.button, { backgroundColor: '#ccc', marginRight: 10 }]} onPress={() => setEditingTrip(null)}>
                 <Text style={styles.buttonText}>Cancel</Text>
               </TouchableOpacity>
               <TouchableOpacity style={[styles.button, styles.saveButton]} onPress={saveEditedTrip}>
                 <Text style={styles.buttonText}>Save Changes</Text>
               </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  scrollContent: { paddingBottom: 40 },
  content: { padding: 20 },
  header: { marginBottom: 20 },
  headerTitle: { fontSize: 24, fontWeight: 'bold' },
  dateCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 15, borderRadius: 10, marginBottom: 20, elevation: 3 },
  dateLabel: { fontSize: 16, fontWeight: 'bold', marginRight: 10, color: '#333' },
  dateButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f0f8ff', paddingHorizontal: 15, paddingVertical: 10, borderRadius: 8 },
  dateButtonText: { fontSize: 16, fontWeight: '600', color: '#0a7ea4', marginLeft: 8 },
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 15, marginBottom: 20, elevation: 3 },
  stopContainer: { marginBottom: 15 },
  stopLabelContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
  stopLabel: { fontSize: 14, fontWeight: '600', marginLeft: 5 },
  searchTextInput: { backgroundColor: '#f0f0f0', borderRadius: 5, height: 45, paddingHorizontal: 10 },
  listView: { backgroundColor: '#fff', position: 'absolute', top: 45, left: 0, right: 0, zIndex: 1000, elevation: 10, borderBottomWidth: 1, borderColor: '#ddd' },
  addButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 10 },
  addButtonText: { color: '#0a7ea4', fontWeight: 'bold', marginLeft: 5 },
  actionCard: { backgroundColor: '#fff', borderRadius: 10, padding: 15, marginBottom: 20, elevation: 3 },
  resultContainer: { alignItems: 'center', padding: 10, backgroundColor: '#f0f8ff', borderRadius: 5, marginBottom: 15 },
  resultValue: { fontSize: 28, fontWeight: 'bold', color: '#0a7ea4' },
  actionButtons: { flexDirection: 'row', gap: 10 },
  button: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 15, borderRadius: 5 },
  calculateButton: { backgroundColor: '#28a745' },
  saveButton: { backgroundColor: '#0a7ea4' },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: 'bold', marginLeft: 5 },
  historyCard: { backgroundColor: '#fff', borderRadius: 10, padding: 15, elevation: 3 },
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  historyTitle: { fontSize: 18, fontWeight: 'bold', marginLeft: 8 },
  clearText: { color: '#dc3545', fontWeight: '600', fontSize: 14 },
  totalSummary: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#e6f2ff', padding: 10, borderRadius: 8, marginBottom: 15 },
  totalSummaryLabel: { fontWeight: '600', color: '#0a7ea4' },
  totalSummaryValue: { fontWeight: 'bold', color: '#0a7ea4' },
  emptyHistory: { textAlign: 'center', color: '#999', paddingVertical: 15, fontStyle: 'italic' },
  historyItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  historyDate: { fontWeight: '600', fontSize: 15, color: '#333' },
  historyStops: { fontSize: 13, color: '#666', marginTop: 2 },
  historyActions: { flexDirection: 'row', gap: 15 },
  iconButton: { padding: 5 },
  modalOverlay: { flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)', padding: 20 },
  modalContent: { backgroundColor: '#fff', borderRadius: 10, padding: 20 },
  closeModalButton: { marginTop: 15, alignItems: 'center', padding: 10 },
  closeModalText: { color: '#dc3545', fontWeight: 'bold', fontSize: 16 },
  editModalContent: { backgroundColor: '#fff', borderRadius: 10, padding: 25 },
  editModalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  editLabel: { fontSize: 14, fontWeight: 'bold', color: '#555', marginBottom: 8 },
  editTextInput: { backgroundColor: '#f0f0f0', borderRadius: 8, padding: 15, fontSize: 16, color: '#333' },
  editModalActions: { flexDirection: 'row', marginTop: 25 }
});