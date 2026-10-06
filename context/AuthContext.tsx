import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  User,
} from 'firebase/auth';
import { collection, doc, getDoc, getDocs, onSnapshot, query, setDoc, updateDoc, where } from 'firebase/firestore';
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { auth, db } from '../firebaseConfig';

async function resolveCaregiverId(code: string): Promise<string> {
  const trimmed = code.trim();
  if (!trimmed) {
    const error = new Error('Enter the caregiver Family PIN.');
    (error as Error & { code?: string }).code = 'family/invalid-pin';
    throw error;
  }

  if (trimmed.length > 16) {
    const directSnap = await getDoc(doc(db, 'users', trimmed));
    if (directSnap.exists()) return trimmed;
  }

  const pinQuery = query(collection(db, 'users'), where('familyPin', '==', trimmed));
  const pinSnap = await getDocs(pinQuery);
  if (pinSnap.empty) {
    const error = new Error('No caregiver found with that Family PIN.');
    (error as Error & { code?: string }).code = 'family/invalid-pin';
    throw error;
  }

  return pinSnap.docs[0].id;
}

export interface FamilyProfile {
  name: string;
  caregiverId: string;
}

interface AuthContextType {
  user: User | null;
  familyProfile: FamilyProfile | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string, caregiverId: string) => Promise<void>;
  switchCaregiver: (familyPin: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  familyProfile: null,
  isLoading: true,
  login: async () => {},
  register: async () => {},
  switchCaregiver: async () => {},
  logout: async () => {},
});

export const useAuth = () => {
  return useContext(AuthContext);
};

interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<User | null>(null);
  const [familyProfile, setFamilyProfile] = useState<FamilyProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const registeringRef = useRef(false);

  useEffect(() => {
    let unsubscribeProfile: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      unsubscribeProfile?.();
      unsubscribeProfile = undefined;
      setUser(currentUser);

      if (!currentUser) {
        setFamilyProfile(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      const profileRef = doc(db, 'familyMembers', currentUser.uid);
      let wroteLastLogin = false;

      unsubscribeProfile = onSnapshot(
        profileRef,
        (snapshot) => {
          if (!snapshot.exists()) {
            if (registeringRef.current) return;
            setFamilyProfile(null);
            setIsLoading(false);
            return;
          }

          const data = snapshot.data();
          const storedCaregiverId = typeof data.caregiverId === 'string' ? data.caregiverId : '';
          setFamilyProfile({
            name: typeof data.name === 'string' ? data.name : '',
            caregiverId: storedCaregiverId,
          });

          if (!wroteLastLogin) {
            wroteLastLogin = true;
            updateDoc(profileRef, { lastLogin: new Date().toISOString() }).catch(() => {});
          }

          if (storedCaregiverId) {
            getDoc(doc(db, 'users', storedCaregiverId)).then((caregiverSnap) => {
              if (caregiverSnap.exists()) return;
              return resolveCaregiverId(storedCaregiverId).then((resolvedId) => {
                if (resolvedId !== storedCaregiverId) {
                  return updateDoc(profileRef, { caregiverId: resolvedId });
                }
              });
            }).catch(() => {});
          }

          setIsLoading(false);
        },
        () => {
          if (registeringRef.current) return;
          setFamilyProfile(null);
          setIsLoading(false);
        }
      );
    });

    return () => {
      unsubscribeAuth();
      unsubscribeProfile?.();
    };
  }, []);

  const login = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email.trim(), password);
  };

  const register = async (email: string, password: string, name: string, caregiverId: string) => {
    registeringRef.current = true;
    try {
      const resolvedCaregiverId = await resolveCaregiverId(caregiverId);
      const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
      await setDoc(doc(db, 'familyMembers', credential.user.uid), {
        name: name.trim(),
        caregiverId: resolvedCaregiverId,
        lastLogin: new Date().toISOString(),
      });
    } catch (error) {
      setFamilyProfile(null);
      setIsLoading(false);
      throw error;
    } finally {
      registeringRef.current = false;
    }
  };

  const switchCaregiver = async (familyPin: string) => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      const error = new Error('Sign in to switch caregivers.');
      (error as Error & { code?: string }).code = 'family/invalid-pin';
      throw error;
    }

    const resolvedCaregiverId = await resolveCaregiverId(familyPin);
    await updateDoc(doc(db, 'familyMembers', currentUser.uid), {
      caregiverId: resolvedCaregiverId,
      lastLogin: new Date().toISOString(),
    });
  };

  const logout = () => signOut(auth);

  const value = {
    user,
    familyProfile,
    isLoading,
    login,
    register,
    switchCaregiver,
    logout,
  };

  return <AuthContext.Provider value={value}>{!isLoading && children}</AuthContext.Provider>;
};
