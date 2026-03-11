import AsyncStorage from '@react-native-async-storage/async-storage';
import { Calculator, History, MapPin, Plus, Save } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { GooglePlacesAutocomplete } from 'react-native-google-places-autocomplete';

// TODO: Replace this with your actual Google Maps API Key
const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';
type Stop = {
  id: string;
  address: string;
};

type Trip = {
  id: string;
  date: string;
  miles: number;
  stopsCount: number;
};

export default function TabTwoScreen() {
  const [stops, setStops] = useState<Stop[]>([
    { id: 'origin', address: '' },
    { id: 'dest_1', address: '' },
  ]);
  const [totalMiles, setTotalMiles] = useState<number | null>(null);
  const [history, setHistory] = useState<Trip[]>([]);
  const [isCalculating, setIsCalculating] = useState(false);

  // Load history when component mounts
  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      const storedHistory = await AsyncStorage.getItem('@mileage_history');
      if (storedHistory) {
        setHistory(JSON.parse(storedHistory));
      }
    } catch (error) {
      console.error('Failed to load history', error);
    }
  };

  const addStop = () => {
    setStops([...stops, { id: `stop_${Date.now()}`, address: '' }]);
    setTotalMiles(null); // Reset calculation whenever route is modified
  };

  const updateStopAddress = (id: string, address: string) => {
    setStops(stops.map(stop => (stop.id === id ? { ...stop, address } : stop)));
    setTotalMiles(null); // Reset calculation whenever route is modified
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
      // Calculate distance between each consecutive stop using Google Distance Matrix API
      for (let i = 0; i < validStops.length - 1; i++) {
        const origin = validStops[i].address;
        const destination = validStops[i + 1].address;
        
        const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origin)}&destinations=${encodeURIComponent(destination)}&units=imperial&key=${GOOGLE_MAPS_API_KEY}`;
        
        const response = await fetch(url);
        const data = await response.json();

        if (data.status === 'OK' && data.rows[0].elements[0].status === 'OK') {
          // Add the distance value (which is returned in meters)
          totalMeters += data.rows[0].elements[0].distance.value;
        } else {
          throw new Error(`Could not calculate distance between stop ${i + 1} and ${i + 2}`);
        }
      }

      // Convert meters to miles (1 meter = 0.000621371 miles)
      const miles = (totalMeters * 0.000621371).toFixed(2);
      setTotalMiles(parseFloat(miles));
    } catch (error: any) {
      Alert.alert('Calculation Error', error.message || 'Failed to calculate mileage. Please verify your addresses.');
    } finally {
      setIsCalculating(false);
    }
  };

  const saveTrip = async () => {
    if (totalMiles === null) {
      Alert.alert('Action Required', 'Please calculate the mileage before saving the trip.');
      return;
    }

    const validStops = stops.filter(stop => stop.address.trim() !== '');
    
    const newTrip: Trip = {
      id: Date.now().toString(),
      date: new Date().toLocaleDateString(),
      miles: totalMiles,
      stopsCount: validStops.length,
    };

    // Keep only the last 5 trips
    const newHistory = [newTrip, ...history].slice(0, 5); 
    setHistory(newHistory);

    try {
      await AsyncStorage.setItem('@mileage_history', JSON.stringify(newHistory));
      Alert.alert('Success', 'Trip saved successfully!');
      
      // Reset fields for the next trip
      setStops([
        { id: 'origin', address: '' },
        { id: 'dest_1', address: '' },
      ]);
      setTotalMiles(null);
    } catch (error) {
      Alert.alert('Error', 'Failed to save trip.');
    }
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* keyboardShouldPersistTaps="handled" is critical for Google Places autocomplete dropdown to be tappable */}
      <ScrollView 
        keyboardShouldPersistTaps="handled" 
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Mileage Tracker</Text>
          <Text style={styles.headerSubtitle}>Plan multi-stop routes and log miles.</Text>
        </View>

        {/* Dynamic Route Inputs Section */}
        <View style={styles.card}>
          {stops.map((stop, index) => (
            <View 
              key={stop.id} 
              // Reverse zIndex is necessary so top dropdowns overlap the inputs below them
              style={[styles.stopContainer, { zIndex: stops.length - index }]}
            >
              <View style={styles.stopLabelContainer}>
                <MapPin size={16} color="#0a7ea4" />
                <Text style={styles.stopLabel}>
                  {index === 0 ? 'Origin' : index === stops.length - 1 ? 'Destination' : `Stop ${index + 1}`}
                </Text>
              </View>
              
              <GooglePlacesAutocomplete
                placeholder={`Enter ${index === 0 ? 'starting point' : 'destination'}`}
                fetchDetails={false}
                onPress={(data) => {
                  updateStopAddress(stop.id, data.description);
                }}
                textInputProps={{
                  onChangeText: (text) => updateStopAddress(stop.id, text),
                  value: stop.address,
                  placeholderTextColor: '#999',
                }}
                query={{
                  key: GOOGLE_MAPS_API_KEY,
                  language: 'en',
                  components: 'country:us', // Bias to US addresses (optional)
                }}
                styles={{
                  container: styles.autocompleteContainer,
                  textInput: styles.textInput,
                  listView: styles.listView,
                  row: styles.listRow,
                }}
              />
            </View>
          ))}

          <TouchableOpacity style={styles.addButton} onPress={addStop}>
            <Plus size={20} color="#0a7ea4" />
            <Text style={styles.addButtonText}>Add Stop</Text>
          </TouchableOpacity>
        </View>

        {/* Calculation & Save Section */}
        <View style={styles.actionCard}>
          {totalMiles !== null && (
            <View style={styles.resultContainer}>
              <Text style={styles.resultLabel}>Total Distance:</Text>
              <Text style={styles.resultValue}>{totalMiles} miles</Text>
            </View>
          )}

          <View style={styles.actionButtons}>
            <TouchableOpacity 
              style={[styles.button, styles.calculateButton]} 
              onPress={calculateMileage}
              disabled={isCalculating}
            >
              <Calculator size={20} color="#fff" />
              <Text style={styles.buttonText}>{isCalculating ? 'Calculating...' : 'Calculate Route'}</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.button, styles.saveButton, totalMiles === null && styles.buttonDisabled]} 
              onPress={saveTrip}
              disabled={totalMiles === null}
            >
              <Save size={20} color="#fff" />
              <Text style={styles.buttonText}>Save Trip</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* History Section */}
        <View style={styles.historyCard}>
          <View style={styles.historyHeader}>
            <History size={20} color="#333" />
            <Text style={styles.historyTitle}>Recent Trips (Last 5)</Text>
          </View>
          
          {history.length === 0 ? (
            <Text style={styles.emptyHistoryText}>No trips saved yet.</Text>
          ) : (
            history.map((trip) => (
              <View key={trip.id} style={styles.historyItem}>
                <View>
                  <Text style={styles.historyDate}>{trip.date}</Text>
                  <Text style={styles.historyStops}>{trip.stopsCount} route stops</Text>
                </View>
                <Text style={styles.historyMiles}>{trip.miles} mi</Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 20,
    marginTop: 10,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#666',
    marginTop: 4,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  stopContainer: {
    marginBottom: 16,
  },
  stopLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  stopLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginLeft: 6,
  },
  autocompleteContainer: {
    flex: 0, // Critical to prevent the flatlist consuming entire screen
  },
  textInput: {
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#e9ecef',
    borderRadius: 8,
    height: 48,
    paddingHorizontal: 12,
    fontSize: 15,
  },
  listView: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 8,
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
  },
  listRow: {
    padding: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#0a7ea4',
    borderRadius: 8,
    backgroundColor: '#f0f8ff',
  },
  addButtonText: {
    color: '#0a7ea4',
    fontWeight: '600',
    marginLeft: 8,
    fontSize: 15,
  },
  actionCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  resultContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f0f8ff',
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
  },
  resultLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  resultValue: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#0a7ea4',
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 8,
  },
  calculateButton: {
    backgroundColor: '#28a745',
  },
  saveButton: {
    backgroundColor: '#0a7ea4',
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 15,
    marginLeft: 8,
  },
  historyCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    paddingBottom: 12,
  },
  historyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginLeft: 8,
  },
  historyItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f8f9fa',
  },
  historyDate: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
  },
  historyStops: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  historyMiles: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0a7ea4',
  },
  emptyHistoryText: {
    textAlign: 'center',
    color: '#999',
    fontStyle: 'italic',
    paddingVertical: 20,
  },
});