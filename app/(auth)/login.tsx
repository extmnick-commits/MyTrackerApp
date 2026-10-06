import { Stack } from 'expo-router';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { FirebaseError } from 'firebase/app';
import { Eye, EyeOff } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
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
import { SeasonalDecor, SeasonalSnow } from '../../components/SeasonalDecor';
import { SeasonalTheme } from '../../constants/Theme';
import { useAuth } from '../../context/AuthContext';
import { useSeasonalTheme } from '../../context/SeasonalThemeContext';
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
  const { theme } = useSeasonalTheme();
  const styles = useMemo(() => createLoginStyles(theme), [theme]);
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
      <SeasonalSnow theme={theme} />
      <View style={styles.loginBox}>
        <Text style={styles.loginTitle}>{title}</Text>
        <View style={{ alignItems: 'center', marginTop: -18, marginBottom: 20 }}>
          <SeasonalDecor theme={theme} />
        </View>

        {mode === 'family' && (
          <>
            <TextInput
              style={styles.loginInput}
              placeholder="Your Name"
              placeholderTextColor={theme.muted}
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
              placeholderTextColor={theme.muted}
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
          placeholderTextColor={theme.muted}
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
            placeholderTextColor={theme.muted}
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
            {showPassword ? <EyeOff color={theme.muted} size={22} /> : <Eye color={theme.muted} size={22} />}
          </TouchableOpacity>
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {submitting ? (
          <ActivityIndicator size="large" color={theme.accent} style={{ marginVertical: 20 }} />
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
                  <Text style={[styles.toggleButtonText, { color: theme.accent }]}>
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

function createLoginStyles(theme: SeasonalTheme) {
  return StyleSheet.create({
  loginContainer: {
    flex: 1,
    backgroundColor: theme.bg,
    justifyContent: 'center',
    padding: 24,
  },
  loginBox: {
    backgroundColor: theme.card,
    padding: 30,
    borderRadius: 20,
  },
  loginTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: theme.title,
    marginBottom: 30,
    textAlign: 'center',
  },
  loginInput: {
    backgroundColor: theme.bg,
    color: theme.text,
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    fontSize: 16,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.bg,
    borderRadius: 12,
    marginBottom: 16,
  },
  passwordInput: {
    flex: 1,
    color: theme.text,
    padding: 16,
    fontSize: 16,
  },
  eyeButton: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  errorText: {
    color: theme.danger,
    fontSize: 14,
    marginBottom: 8,
  },
  loginButton: {
    backgroundColor: theme.accent,
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
    color: theme.muted,
    fontSize: 16,
  },
});
}
