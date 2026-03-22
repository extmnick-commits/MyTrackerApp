import {
  createUserWithEmailAndPassword,
  signInAnonymously,
  signInWithEmailAndPassword
} from 'firebase/auth';
import { collection, doc, getDocs, query, setDoc, where } from 'firebase/firestore';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { auth, db } from '../../firebaseConfig';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [familyName, setFamilyName] = useState('');
  const [loading, setLoading] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [isPinLogin, setIsPinLogin] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      return Alert.alert('Error', 'Please enter both email and password.');
    }
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // Navigation will be handled by the root layout
    } catch (error: any) {
      Alert.alert('Login Failed', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!email || !password) {
      return Alert.alert('Error', 'Please enter both email and password.');
    }
    setLoading(true);
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      // Navigation will be handled by the root layout
    } catch (error: any) {
      Alert.alert('Registration Failed', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePinLogin = async () => {
    if (!pin || pin.length < 4) {
      return Alert.alert('Error', 'Please enter a valid PIN.');
    }
    if (!familyName.trim()) {
      return Alert.alert('Error', 'Please enter your name.');
    }
    setLoading(true);
    try {
      const q = query(collection(db, 'users'), where('familyPin', '==', pin));
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        Alert.alert('Invalid PIN', 'No account found with this Family PIN.');
        setLoading(false);
        return;
      }
      
      const caregiverId = snapshot.docs[0].id;
      const userCred = await signInAnonymously(auth);
      
      // Save mapping so the family view knows which caregiver to load
      await setDoc(doc(db, 'familyMembers', userCred.user.uid), { 
        caregiverId, 
        name: familyName.trim(),
        lastLogin: new Date().toISOString()
      });
    } catch (error: any) {
      Alert.alert('PIN Login Failed', error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.loginContainer}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.loginBox}>
        <Text style={styles.loginTitle}>
          {isPinLogin ? 'Family Access' : isRegistering ? 'Create Account' : 'MyTrackerApp Login'}
        </Text>
        
        {isPinLogin ? (
          <>
            <TextInput
              style={styles.loginInput}
              placeholder="Your Name"
              placeholderTextColor="#94A3B8"
              value={familyName}
              onChangeText={setFamilyName}
              autoCapitalize="words"
            />
            <TextInput
              style={styles.loginInput}
              placeholder="Enter Family PIN"
              placeholderTextColor="#94A3B8"
              value={pin}
              onChangeText={setPin}
              keyboardType="numeric"
              secureTextEntry
            />
          </>
        ) : (
          <>
            <TextInput
              style={styles.loginInput}
              placeholder="Email"
              placeholderTextColor="#94A3B8"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <TextInput
              style={styles.loginInput}
              placeholder="Password"
              placeholderTextColor="#94A3B8"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
          </>
        )}

        {loading ? (
          <ActivityIndicator size="large" color="#3B82F6" style={{ marginVertical: 20 }}/>
        ) : (
          <>
            <TouchableOpacity
              style={styles.loginButton}
              onPress={isPinLogin ? handlePinLogin : isRegistering ? handleRegister : handleLogin}
            >
              <Text style={styles.loginButtonText}>
                {isPinLogin ? 'Access' : isRegistering ? 'Register' : 'Login'}
              </Text>
            </TouchableOpacity>
            
            {!isPinLogin && (
              <TouchableOpacity
                style={styles.toggleButton}
                onPress={() => setIsRegistering(!isRegistering)}
              >
                <Text style={styles.toggleButtonText}>
                  {isRegistering
                    ? 'Already have an account? Login'
                    : "Don't have an account? Register"}
                </Text>
              </TouchableOpacity>
            )}
            
            <TouchableOpacity
              style={[styles.toggleButton, { marginTop: 30 }]}
              onPress={() => {
                setIsPinLogin(!isPinLogin);
                setIsRegistering(false);
              }}
            >
              <Text style={[styles.toggleButtonText, { color: '#3B82F6' }]}>
                {isPinLogin ? 'Caregiver Login' : 'Family Access (PIN)'}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  loginContainer: {
    flex: 1,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    padding: 24,
  },
  loginBox: {
    backgroundColor: '#1E293B',
    padding: 30,
    borderRadius: 20,
  },
  loginTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#F8FAFC',
    marginBottom: 30,
    textAlign: 'center',
  },
  loginInput: {
    backgroundColor: '#0F172A',
    color: '#F8FAFC',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    fontSize: 16,
  },
  loginButton: {
    backgroundColor: '#3B82F6',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  loginButtonText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 18,
  },
  toggleButton: {
    marginTop: 20,
    alignItems: 'center',
  },
  toggleButtonText: {
    color: '#94A3B8',
    fontSize: 16,
  },
});
