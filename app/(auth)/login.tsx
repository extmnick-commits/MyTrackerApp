import { Stack } from 'expo-router';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { FirebaseError } from 'firebase/app';
import { Eye, EyeOff } from 'lucide-react-native';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { auth } from '../../firebaseConfig';

type AuthMode = 'login' | 'family' | 'caregiver';

function authErrorMessage(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : '';

  if (code === 'family/invalid-pin' && error instanceof Error) {
    return error.message;
  }

  if (error instanceof FirebaseError) {
    switch (error.code) {
      case 'auth/invalid-credential':
        return 'Email or password is incorrect.';
      case 'auth/user-not-found':
        return 'No account found for that email.';
      case 'auth/wrong-password':
        return 'Incorrect password.';
      case 'auth/invalid-email':
        return 'Enter a valid email address.';
      case 'auth/email-already-in-use':
        return 'An account with this email already exists.';
      case 'auth/weak-password':
        return 'Password should be at least 6 characters.';
      case 'auth/too-many-requests':
        return 'Too many attempts. Try again later.';
      case 'family/invalid-pin':
        return error.message;
      default:
        break;
    }
  }
  return 'Something went wrong. Please try again.';
}

export default function LoginScreen() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [caregiverId, setCaregiverId] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const switchMode = (next: AuthMode) => {
    setMode(next);
    setError(null);
    setShowPassword(false);
  };

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      setError('Please enter both email and password.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(authErrorMessage(err));
      setSubmitting(false);
    }
  };

  const handleFamilyRegister = async () => {
    if (!email.trim() || !password || !name.trim() || !caregiverId.trim()) {
      setError('Enter your name, Family PIN, email, and password.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await register(email, password, name, caregiverId);
    } catch (err) {
      setError(authErrorMessage(err));
      setSubmitting(false);
    }
  };

  const handleCaregiverRegister = async () => {
    if (!email.trim() || !password) {
      setError('Please enter both email and password.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await createUserWithEmailAndPassword(auth, email.trim(), password);
    } catch (err) {
      setError(authErrorMessage(err));
      setSubmitting(false);
    }
  };

  const title =
    mode === 'family' ? 'Create Family Account' : mode === 'caregiver' ? 'Create Caregiver Account' : 'MyTrackerApp Login';

  const onSubmit = mode === 'family' ? handleFamilyRegister : mode === 'caregiver' ? handleCaregiverRegister : handleLogin;

  return (
    <KeyboardAvoidingView
      style={styles.loginContainer}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.loginBox}>
        <Text style={styles.loginTitle}>{title}</Text>

        {mode === 'family' && (
          <>
            <TextInput
              style={styles.loginInput}
              placeholder="Your Name"
              placeholderTextColor="#94A3B8"
              value={name}
              onChangeText={(value) => {
                setName(value);
                setError(null);
              }}
              autoCapitalize="words"
            />
            <TextInput
              style={styles.loginInput}
              placeholder="Family PIN"
              placeholderTextColor="#94A3B8"
              value={caregiverId}
              onChangeText={(value) => {
                setCaregiverId(value);
                setError(null);
              }}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="number-pad"
            />
          </>
        )}

        <TextInput
          style={styles.loginInput}
          placeholder="Email"
          placeholderTextColor="#94A3B8"
          value={email}
          onChangeText={(value) => {
            setEmail(value);
            setError(null);
          }}
          autoCapitalize="none"
          keyboardType="email-address"
          autoCorrect={false}
        />

        <View style={styles.passwordRow}>
          <TextInput
            style={styles.passwordInput}
            placeholder="Password"
            placeholderTextColor="#94A3B8"
            secureTextEntry={!showPassword}
            value={password}
            onChangeText={(value) => {
              setPassword(value);
              setError(null);
            }}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity
            style={styles.eyeButton}
            onPress={() => setShowPassword((visible) => !visible)}
            accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOff color="#94A3B8" size={22} /> : <Eye color="#94A3B8" size={22} />}
          </TouchableOpacity>
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {submitting ? (
          <ActivityIndicator size="large" color="#3B82F6" style={{ marginVertical: 20 }} />
        ) : (
          <>
            <TouchableOpacity style={styles.loginButton} onPress={onSubmit}>
              <Text style={styles.loginButtonText}>
                {mode === 'login' ? 'Login' : 'Create Account'}
              </Text>
            </TouchableOpacity>

            {mode === 'login' ? (
              <>
                <TouchableOpacity style={styles.toggleButton} onPress={() => switchMode('family')}>
                  <Text style={styles.toggleButtonText}>New family member? Create an account</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.toggleButton} onPress={() => switchMode('caregiver')}>
                  <Text style={[styles.toggleButtonText, { color: '#3B82F6' }]}>
                    New caregiver? Create an account
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity style={styles.toggleButton} onPress={() => switchMode('login')}>
                <Text style={styles.toggleButtonText}>Already have an account? Login</Text>
              </TouchableOpacity>
            )}
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
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderRadius: 12,
    marginBottom: 16,
  },
  passwordInput: {
    flex: 1,
    color: '#F8FAFC',
    padding: 16,
    fontSize: 16,
  },
  eyeButton: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  errorText: {
    color: '#F87171',
    fontSize: 14,
    marginBottom: 8,
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
