import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import 'react-native-reanimated';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { SeasonalThemeProvider } from '../context/SeasonalThemeContext';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary
} from 'expo-router';

export const unstable_settings = {
  // Ensure that reloading on `/modal` keeps a back button present.
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

function InitialLayout() {
  const { user, familyProfile, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const segment = segments[0] as string;
  const inTabsGroup = segment === '(tabs)';
  const inFamilyGroup = segment === 'family';
  const inAuthGroup = segment === '(auth)';

  useEffect(() => {
    if (isLoading) return;

    if (!user) {
      if (inTabsGroup || inFamilyGroup) {
        router.replace('/(auth)/login');
      }
      return;
    }

    if (familyProfile) {
      if (inTabsGroup || inAuthGroup) {
        router.replace('/family');
      }
      return;
    }

    if (inFamilyGroup || inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [user, familyProfile, isLoading, inTabsGroup, inFamilyGroup, inAuthGroup, router]);

  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded && !isLoading) {
      SplashScreen.hideAsync();
    }
  }, [loaded, isLoading]);

  const awaitingRedirect =
    !isLoading &&
    ((!user && (inTabsGroup || inFamilyGroup)) ||
      (!!user && !!familyProfile && (inTabsGroup || inAuthGroup)) ||
      (!!user && !familyProfile && (inFamilyGroup || inAuthGroup)));

  if (!loaded || isLoading || awaitingRedirect) {
    return null;
  }

  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="family" options={{ headerShown: false }} />
    </Stack>
  );
}


export default function RootLayout() {
  return (
    <AuthProvider>
      <SeasonalThemeProvider>
        <InitialLayout />
      </SeasonalThemeProvider>
    </AuthProvider>
  );
}
