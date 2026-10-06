import { Stack, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';

export default function AuthLayout() {
  const { user, familyProfile, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading || !user) return;
    router.replace(familyProfile ? '/family' : '/(tabs)');
  }, [isLoading, user, familyProfile, router]);

  return <Stack screenOptions={{ headerShown: false }} />;
}
