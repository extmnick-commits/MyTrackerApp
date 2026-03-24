import AsyncStorage from '@react-native-async-storage/async-storage';
import * as AuthSession from 'expo-auth-session';
import * as Google from 'expo-auth-session/providers/google';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Camera, CheckCircle2, ChevronLeft, FileText, Folder, FolderPlus, Link as LinkIcon, LogOut, UploadCloud, X } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Animated, FlatList, Image, Modal, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

// Required for web browser functionality in auth session
WebBrowser.maybeCompleteAuthSession();

const SkeletonCard = () => {
  const fadeAnim = React.useRef(new Animated.Value(0.3)).current;
  React.useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(fadeAnim, { toValue: 0.7, duration: 800, useNativeDriver: true }),
        Animated.timing(fadeAnim, { toValue: 0.3, duration: 800, useNativeDriver: true })
      ])
    ).start();
  }, [fadeAnim]);
  return (
    <Animated.View style={[styles.gridCard, { opacity: fadeAnim, marginBottom: 16 }]}>
      <View style={[styles.thumbnailContainer, { backgroundColor: '#1E293B' }]} />
      <View style={{ padding: 12 }}><View style={{ height: 16, backgroundColor: '#334155', borderRadius: 4, width: '80%' }} /></View>
    </Animated.View>
  );
};

export default function ReceiptsScreen() {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [files, setFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [activeXhr, setActiveXhr] = useState<XMLHttpRequest | null>(null);
  const [folderStack, setFolderStack] = useState<string[]>(['root']);
  const [defaultFolderId, setDefaultFolderId] = useState<string | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [setupFolders, setSetupFolders] = useState<any[]>([]);
  const [isFolderModalVisible, setFolderModalVisible] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  const [isActionModalVisible, setActionModalVisible] = useState(false);
  const [isRenameModalVisible, setRenameModalVisible] = useState(false);
  const [renameInput, setRenameInput] = useState('');

  // Generate and log the exact redirect URI expected by Expo
  const redirectUri = AuthSession.makeRedirectUri();

  // Replace these with your actual Client IDs from Google Cloud Console
  const [request, response, promptAsync] = Google.useAuthRequest({
    webClientId: '227348535128-k3nj9opn7v87kherceneda0h1o2ja2r7.apps.googleusercontent.com',
    iosClientId: '227348535128-k3nj9opn7v87kherceneda0h1o2ja2r7.apps.googleusercontent.com',
    androidClientId: '227348535128-k3nj9opn7v87kherceneda0h1o2ja2r7.apps.googleusercontent.com',
    redirectUri,
    scopes: [
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/drive.readonly'
    ],
  });

  useFocusEffect(
    useCallback(() => {
      const loadToken = async () => {
        const storedToken = await AsyncStorage.getItem('googleDriveToken');
        if (storedToken !== accessToken) {
          setAccessToken(storedToken);
        }
      };
      loadToken();
    }, [accessToken])
  );

  useEffect(() => {
    if (response?.type === 'success') {
      const token = response.authentication?.accessToken || null;
      if (token) AsyncStorage.setItem('googleDriveToken', token);
      setAccessToken(token);
    }
  }, [response]);

  useEffect(() => {
    const checkSetup = async () => {
      if (accessToken) {
        const savedId = await AsyncStorage.getItem('defaultFolderId');
        if (!savedId) {
          setNeedsSetup(true);
          fetchSetupFolders(accessToken);
        } else {
          setNeedsSetup(false);
          setDefaultFolderId(savedId);
          if (folderStack.length === 1) setFolderStack([savedId]);
        }
      }
    };
    checkSetup();
  }, [accessToken]);

  useEffect(() => {
    if (accessToken && !needsSetup) {
      fetchFiles();
    }
  }, [accessToken, folderStack, needsSetup]);

  const fetchSetupFolders = async (token: string) => {
    setLoading(true);
    try {
      const res = await fetch("https://www.googleapis.com/drive/v3/files?q=mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id,name)", { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setSetupFolders(data.files || []);
    } catch (error) { console.error(error); } finally { setLoading(false); }
  };

  const selectMasterFolder = async (id: string) => {
    await AsyncStorage.setItem('defaultFolderId', id);
    setDefaultFolderId(id);
    setFolderStack([id]);
    setNeedsSetup(false);
  };

  const createMasterFolder = async () => {
    setLoading(true);
    try {
      const res = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'MyTrackerApp Receipts', mimeType: 'application/vnd.google-apps.folder' }),
      });
      const data = await res.json();
      if (data.id) await selectMasterFolder(data.id);
    } catch (e) { Alert.alert("Error", "Could not create folder."); } finally { setLoading(false); }
  };

  const fetchFiles = async () => {
    setLoading(true);
    try {
      const currentFolderId = folderStack[folderStack.length - 1];
      const query = `'${currentFolderId}' in parents and trashed=false`;
      const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,webViewLink,thumbnailLink)`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (res.status === 401) {
        await AsyncStorage.removeItem('googleDriveToken');
        setAccessToken(null);
        return;
      }

      const data = await res.json();
      if (data.files) {
        setFiles(data.files);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to fetch receipts');
    } finally {
      setLoading(false);
    }
  };

  const uploadToGoogleDrive = async (uri: string, mimeType: string, name: string) => {
    setLoading(true);
    setUploadProgress(0);
    let createdFileId = '';
    try {
      const currentFolderId = folderStack[folderStack.length - 1];

      // Step 1: Create file metadata on Google Drive
      const metadataRes = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: name,
          mimeType: mimeType,
          parents: [currentFolderId],
        }),
      });
      
      const metadata = await metadataRes.json();
      if (!metadata.id) throw new Error('Failed to create file metadata');
      createdFileId = metadata.id;

      // Step 2: Upload file content
      const localFile = await fetch(uri);
      const blob = await localFile.blob();

      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        setActiveXhr(xhr);
        xhr.open('PATCH', `https://www.googleapis.com/upload/drive/v3/files/${metadata.id}?uploadType=media`);
        xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
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

      Alert.alert('Success', 'Receipt uploaded successfully!');
      fetchFiles(); // Refresh list
    } catch (error: any) {
      console.error(error);
      if (error.message === 'Upload cancelled') {
        if (createdFileId) {
          fetch(`https://www.googleapis.com/drive/v3/files/${createdFileId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } }).catch(e => console.error("Failed to cleanup file", e));
        }
      } else {
        Alert.alert('Error', 'An unexpected error occurred during upload.');
      }
    } finally {
      setLoading(false);
      setActiveXhr(null);
    }
  };

  const uploadReceipt = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/*', 'application/pdf'],
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;
      const file = result.assets[0];
      await uploadToGoogleDrive(file.uri, file.mimeType || 'application/octet-stream', file.name);
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'An unexpected error occurred while picking the file.');
    }
  };

  const takePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Sorry, we need camera permissions to make this work!');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        quality: 0.4, // Aggressively compress image to save Google Drive storage
      });

      if (!result.canceled) {
        const asset = result.assets[0];
        const fileName = asset.uri?.split('/').pop() || `Photo_${Date.now()}.jpg`;
        await uploadToGoogleDrive(asset.uri, 'image/jpeg', fileName);
      }
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'An unexpected error occurred while taking a photo.');
    }
  };


  const createFolder = async () => {
    if (!newFolderName.trim()) return;
    setFolderModalVisible(false);
    setLoading(true);
    try {
      const currentFolderId = folderStack[folderStack.length - 1];
      const res = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: newFolderName.trim(),
          mimeType: 'application/vnd.google-apps.folder',
          parents: [currentFolderId],
        }),
      });
      
      if (res.ok) {
        setNewFolderName('');
        fetchFiles(); // Refresh list to show new folder
      } else {
        throw new Error('Failed to create folder');
      }
    } catch (error) {
      Alert.alert('Error', 'Could not create new folder.');
    } finally {
      setLoading(false);
    }
  };

  const confirmDelete = () => {
    Alert.alert('Delete Item', `Are you sure you want to delete "${selectedItem?.name}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: deleteItem }
    ]);
  };

  const deleteItem = async () => {
    if (!selectedItem) return;
    setActionModalVisible(false);
    setLoading(true);
    try {
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${selectedItem.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok || res.status === 204) {
        fetchFiles();
      } else {
        throw new Error('Failed to delete');
      }
    } catch (error) {
      Alert.alert('Error', 'Could not delete the item.');
    } finally {
      setLoading(false);
      setSelectedItem(null);
    }
  };

  const openRenameModal = () => {
    setRenameInput(selectedItem?.name || '');
    setActionModalVisible(false);
    setRenameModalVisible(true);
  };

  const renameItem = async () => {
    if (!selectedItem || !renameInput.trim()) return;
    setRenameModalVisible(false);
    setLoading(true);
    try {
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${selectedItem.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: renameInput.trim() }),
      });
      if (res.ok) fetchFiles();
      else throw new Error('Failed to rename');
    } catch (error) {
      Alert.alert('Error', 'Could not rename the item.');
    } finally {
      setLoading(false);
      setSelectedItem(null);
    }
  };

  const openLink = async (url: string) => {
    try {
      await WebBrowser.openBrowserAsync(url, { presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN });
    } catch (error) {
      Alert.alert('Error', 'Could not open the link.');
    }
  };

  const handleChangeMasterFolder = () => {
    Alert.alert('Change Master Folder', 'Are you sure you want to select a new master folder for your receipts?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Change',
        onPress: async () => {
          await AsyncStorage.removeItem('defaultFolderId');
          setDefaultFolderId(null);
          setNeedsSetup(true);
          setFolderStack(['root']);
          if (accessToken) fetchSetupFolders(accessToken);
        }
      }
    ]);
  };

  const handleSignOut = () => {
    Alert.alert('Disconnect Drive', 'Are you sure you want to sign out of Google Drive?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await AsyncStorage.removeItem('defaultFolderId');
          await AsyncStorage.removeItem('googleDriveToken');
          setAccessToken(null);
          setFiles([]);
          setFolderStack(['root']);
          setDefaultFolderId(null);
          setNeedsSetup(false);
        }
      }
    ]);
  };

  return (
    <View style={[styles.container, Platform.OS === 'web' && styles.webContainer]}>
      <View style={styles.header}>
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={styles.title}>Receipts</Text>
            {accessToken && !needsSetup && (
              <View style={{ backgroundColor: '#1E293B', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginLeft: 10 }}>
                <Text style={{ color: '#3B82F6', fontSize: 14, fontWeight: 'bold' }}>{files.length} {files.length === 1 ? 'item' : 'items'}</Text>
              </View>
            )}
          </View>
          {accessToken && (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
              <CheckCircle2 size={12} color="#10B981" style={{ marginRight: 4 }} />
              <Text style={{ color: '#10B981', fontSize: 12, fontWeight: '600' }}>Connected to Drive</Text>
            </View>
          )}
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {accessToken && (
            <TouchableOpacity onPress={handleChangeMasterFolder} style={[styles.signOutButton, { backgroundColor: '#3b82f620' }]}>
              <Folder size={24} color="#3B82F6" />
            </TouchableOpacity>
          )}
          {accessToken && (
            <TouchableOpacity onPress={handleSignOut} style={styles.signOutButton}>
              <LogOut size={24} color="#EF4444" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {!accessToken ? (
        <View style={styles.authContainer}>
          <FileText size={64} color="#94A3B8" style={{ marginBottom: 20 }} />
          <Text style={styles.authText}>Connect to Google Drive to securely upload and view your receipts.</Text>
          <TouchableOpacity style={styles.connectButton} disabled={!request} onPress={() => promptAsync()}>
            <LinkIcon size={20} color="#FFF" style={{ marginRight: 8 }} />
            <Text style={styles.connectButtonText}>Link Google Drive</Text>
          </TouchableOpacity>
        </View>
      ) : needsSetup ? (
        <View style={styles.content}>
          <Text style={{ color: '#F8FAFC', fontSize: 24, fontWeight: 'bold', marginBottom: 10 }}>Master Folder Setup</Text>
          <Text style={{ color: '#94A3B8', fontSize: 16, marginBottom: 24, lineHeight: 24 }}>To keep your Google Drive perfectly organized, please select or create a main folder. All future receipts and monthly folders will be stored neatly inside here.</Text>
          
          <TouchableOpacity style={styles.uploadButton} onPress={createMasterFolder} disabled={loading}>
            <FolderPlus size={24} color="#FFF" style={{ marginRight: 8 }} />
            <Text style={styles.uploadButtonText}>{loading ? 'Creating...' : 'Create "MyTrackerApp" Folder'}</Text>
          </TouchableOpacity>

          {setupFolders.length > 0 && (
            <View style={{ flex: 1, marginTop: 10 }}>
              <Text style={{ color: '#94A3B8', fontSize: 13, marginBottom: 15, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1 }}>Or Select Existing Folder:</Text>
              <FlatList 
                data={setupFolders}
                keyExtractor={item => item.id}
                renderItem={({item}) => (
                  <TouchableOpacity style={styles.receiptItem} onPress={() => selectMasterFolder(item.id)}>
                    <Folder size={24} color="#3B82F6" />
                    <Text style={styles.receiptItemText}>{item.name}</Text>
                  </TouchableOpacity>
                )}
              />
            </View>
          )}
        </View>
      ) : (
        <View style={styles.content}>
          <View style={styles.uploadRow}>
            <TouchableOpacity style={styles.uploadButtonHalf} onPress={takePhoto} disabled={loading}>
              {loading ? <ActivityIndicator size="small" color="#FFF" style={{ marginRight: 8 }} /> : <Camera size={24} color="#FFF" style={{ marginRight: 8 }} />}
              <Text style={styles.uploadButtonText}>{loading ? 'Processing' : 'Take Photo'}</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.uploadButtonHalf} onPress={uploadReceipt} disabled={loading}>
              {loading ? <ActivityIndicator size="small" color="#FFF" style={{ marginRight: 8 }} /> : <UploadCloud size={24} color="#FFF" style={{ marginRight: 8 }} />}
              <Text style={styles.uploadButtonText}>{loading ? 'Processing' : 'Upload File'}</Text>
            </TouchableOpacity>
          </View>
      
        {loading && uploadProgress > 0 && (
          <View style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
              <Text style={{ color: '#94A3B8', fontSize: 12, fontWeight: 'bold' }}>UPLOADING...</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ color: '#3B82F6', fontSize: 12, fontWeight: 'bold', marginRight: 10 }}>{uploadProgress}%</Text>
                {activeXhr && (
                  <TouchableOpacity onPress={() => activeXhr.abort()}>
                    <X size={16} color="#EF4444" />
                  </TouchableOpacity>
                )}
              </View>
            </View>
            <View style={{ height: 6, backgroundColor: '#1E293B', borderRadius: 3, overflow: 'hidden' }}>
              <View style={{ height: '100%', width: `${uploadProgress}%`, backgroundColor: '#3B82F6' }} />
            </View>
          </View>
        )}

          <View style={styles.actionRow}>
            {folderStack.length > 1 ? (
              <TouchableOpacity onPress={() => setFolderStack(prev => prev.slice(0, -1))} style={styles.actionButton}>
                <ChevronLeft size={20} color="#3B82F6" />
                <Text style={[styles.actionButtonText, { color: '#3B82F6' }]}>Back</Text>
              </TouchableOpacity>
            ) : <View />}
            
            <View style={styles.rightActions}>
              <TouchableOpacity onPress={() => setFolderModalVisible(true)} style={styles.actionButton}>
                <FolderPlus size={18} color="#10B981" style={{ marginRight: 4 }} />
                <Text style={[styles.actionButtonText, { color: '#10B981' }]}>New Folder</Text>
              </TouchableOpacity>
            </View>
          </View>

          {loading && !files.length ? (
            <View style={styles.skeletonContainer}>
              {[1, 2, 3, 4, 5, 6].map(key => <SkeletonCard key={key} />)}
            </View>
          ) : (
            <FlatList 
              data={files} 
              keyExtractor={(item) => item.id} 
              numColumns={2}
              columnWrapperStyle={styles.rowWrapper}
              contentContainerStyle={{ paddingBottom: 20 }}
              ListEmptyComponent={
                <View style={styles.emptyStateContainer}>
                  <FileText size={60} color="#334155" style={{ marginBottom: 15 }} />
                  <Text style={styles.emptyStateTitle}>No files found</Text>
                  <Text style={styles.emptyStateSub}>Upload your first receipt or create a folder to get started!</Text>
                </View>
              }
              renderItem={({ item }) => (
                <TouchableOpacity 
                  style={styles.gridCard} 
                  activeOpacity={0.8} 
                  onPress={() => {
                    if (item.mimeType === 'application/vnd.google-apps.folder') {
                      setFolderStack(prev => [...prev, item.id]);
                    } else if (item.webViewLink) {
                      openLink(item.webViewLink);
                    }
                  }}
                  onLongPress={() => {
                    setSelectedItem(item);
                    setActionModalVisible(true);
                  }}
                >
                  <View style={styles.thumbnailContainer}>
                    {item.thumbnailLink ? (
                      <Image source={{ uri: item.thumbnailLink }} style={styles.thumbnail} resizeMode="cover" />
                    ) : item.mimeType === 'application/vnd.google-apps.folder' ? (
                      <Folder size={48} color="#3B82F6" />
                    ) : (
                      <FileText size={48} color="#94A3B8" />
                    )}
                  </View>
                  <View style={styles.cardInfo}><Text style={styles.fileName} numberOfLines={2}>{item.name}</Text></View>
                </TouchableOpacity>
              )}
            />
          )}

          <Modal visible={isFolderModalVisible} transparent animationType="fade">
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Create New Folder</Text>
                  <TouchableOpacity onPress={() => setFolderModalVisible(false)}><X color="#94A3B8" size={24} /></TouchableOpacity>
                </View>
                <TextInput style={styles.input} placeholder="Folder Name" placeholderTextColor="#94A3B8" value={newFolderName} onChangeText={setNewFolderName} autoFocus />
                <TouchableOpacity style={styles.saveFolderButton} onPress={createFolder}>
                  <Text style={styles.saveFolderText}>Create</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>

          <Modal visible={isActionModalVisible} transparent animationType="fade">
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <View style={styles.modalHeader}>
                  <Text style={[styles.modalTitle, { flex: 1, marginRight: 15 }]} numberOfLines={1} ellipsizeMode="middle">{selectedItem?.name}</Text>
                  <TouchableOpacity onPress={() => setActionModalVisible(false)}><X color="#94A3B8" size={24} /></TouchableOpacity>
                </View>
                <TouchableOpacity style={[styles.saveFolderButton, { backgroundColor: '#3B82F6', marginBottom: 12 }]} onPress={openRenameModal}>
                  <Text style={styles.saveFolderText}>Rename</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.saveFolderButton, { backgroundColor: '#EF4444' }]} onPress={confirmDelete}>
                  <Text style={styles.saveFolderText}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>

          <Modal visible={isRenameModalVisible} transparent animationType="fade">
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Rename Item</Text>
                  <TouchableOpacity onPress={() => setRenameModalVisible(false)}><X color="#94A3B8" size={24} /></TouchableOpacity>
                </View>
                <TextInput style={styles.input} placeholder="New Name" placeholderTextColor="#94A3B8" value={renameInput} onChangeText={setRenameInput} autoFocus />
                <TouchableOpacity style={[styles.saveFolderButton, { backgroundColor: '#3B82F6' }]} onPress={renameItem}>
                  <Text style={styles.saveFolderText}>Save Changes</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        </View>
      )}
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
  header: { padding: 24, paddingTop: 60, borderBottomWidth: 1, borderBottomColor: '#1E293B', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 32, fontWeight: 'bold', color: '#F8FAFC' },
  signOutButton: { padding: 10, backgroundColor: '#ef444420', borderRadius: 12 },
  authContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30 },
  authText: { color: '#94A3B8', fontSize: 16, textAlign: 'center', marginBottom: 30, lineHeight: 24 },
  connectButton: { flexDirection: 'row', backgroundColor: '#3B82F6', paddingHorizontal: 24, paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  connectButtonText: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
  content: { flex: 1, padding: 24 },
  uploadRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24, gap: 10 },
  uploadButtonHalf: { flex: 1, flexDirection: 'row', backgroundColor: '#3B82F6', padding: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 4 },
  uploadButtonText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  actionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  rightActions: { flexDirection: 'row', gap: 10 },
  actionButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1E293B', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12 },
  actionButtonText: { fontSize: 14, fontWeight: 'bold' },
  rowWrapper: { justifyContent: 'space-between', marginBottom: 16 },
  gridCard: { width: '48%', backgroundColor: '#1E293B', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#334155' },
  thumbnailContainer: { height: 120, backgroundColor: '#0b1120', justifyContent: 'center', alignItems: 'center' },
  thumbnail: { width: '100%', height: '100%' },
  cardInfo: { padding: 12 },
  fileName: { color: '#F8FAFC', fontSize: 14, fontWeight: '500', lineHeight: 20 },
  emptyStateContainer: { alignItems: 'center', justifyContent: 'center', marginTop: 60 },
  emptyStateTitle: { color: '#F8FAFC', fontSize: 18, fontWeight: 'bold', marginBottom: 8 },
  emptyStateSub: { color: '#94A3B8', fontSize: 14, textAlign: 'center', paddingHorizontal: 20, lineHeight: 20 },
  skeletonContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingBottom: 20 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#1E293B', borderRadius: 20, padding: 24 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#F8FAFC' },
  input: { backgroundColor: '#0F172A', color: '#F8FAFC', padding: 16, borderRadius: 12, fontSize: 16, marginBottom: 20, borderWidth: 1, borderColor: '#334155' },
  saveFolderButton: { backgroundColor: '#10B981', padding: 16, borderRadius: 12, alignItems: 'center' },
  saveFolderText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  receiptItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1E293B', padding: 16, borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: '#334155' },
  receiptItemText: { color: '#F8FAFC', marginLeft: 12, fontSize: 16, fontWeight: '500' },
});