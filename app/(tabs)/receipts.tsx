import AsyncStorage from '@react-native-async-storage/async-storage';
import * as AuthSession from 'expo-auth-session';
import * as Google from 'expo-auth-session/providers/google';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser';
import { Camera, ChevronLeft, FileText, Folder, FolderPlus, Link as LinkIcon, LogOut, Star, UploadCloud, X } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Linking, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

// Required for web browser functionality in auth session
WebBrowser.maybeCompleteAuthSession();

export default function ReceiptsScreen() {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [files, setFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
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

  useEffect(() => {
    if (response?.type === 'success') {
      setAccessToken(response.authentication?.accessToken || null);
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
          if (folderStack.length === 1) setFolderStack(['root', savedId]);
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
    setFolderStack(['root', id]);
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

      // Step 2: Upload file content
      const localFile = await fetch(uri);
      const blob = await localFile.blob();

      const uploadRes = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${metadata.id}?uploadType=media`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': mimeType,
        },
        body: blob,
      });

      if (uploadRes.ok) {
        Alert.alert('Success', 'Receipt uploaded successfully!');
        fetchFiles(); // Refresh list
      } else {
        throw new Error('Failed to upload file content');
      }
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'An unexpected error occurred during upload.');
    } finally {
      setLoading(false);
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
        quality: 0.8, // Slightly compress image to save Google Drive storage space
      });

      if (!result.canceled) {
        const asset = result.assets[0];
        const fileName = asset.uri.split('/').pop() || `Photo_${Date.now()}.jpg`;
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

  const saveDefaultFolder = async () => {
    const currentFolderId = folderStack[folderStack.length - 1];
    try {
      await AsyncStorage.setItem('defaultFolderId', currentFolderId);
      setDefaultFolderId(currentFolderId);
      Alert.alert('Success', 'This folder is now your default!');
    } catch (e) {
      Alert.alert('Error', 'Could not save default folder.');
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

  const openLink = (url: string) => {
    Linking.openURL(url).catch(() => {
      Alert.alert('Error', 'Could not open the link.');
    });
  };

  const handleSignOut = () => {
    Alert.alert('Disconnect Drive', 'Are you sure you want to sign out of Google Drive?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await AsyncStorage.removeItem('defaultFolderId');
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
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Receipts</Text>
        {accessToken && (
          <TouchableOpacity onPress={handleSignOut} style={styles.signOutButton}>
            <LogOut size={24} color="#EF4444" />
          </TouchableOpacity>
        )}
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
              <Camera size={24} color="#FFF" style={{ marginRight: 8 }} />
              <Text style={styles.uploadButtonText}>Take Photo</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.uploadButtonHalf} onPress={uploadReceipt} disabled={loading}>
              <UploadCloud size={24} color="#FFF" style={{ marginRight: 8 }} />
              <Text style={styles.uploadButtonText}>Upload File</Text>
            </TouchableOpacity>
          </View>

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
              
              {folderStack.length > 1 && folderStack[folderStack.length - 1] !== defaultFolderId && (
                <TouchableOpacity onPress={saveDefaultFolder} style={styles.actionButton}>
                  <Star size={18} color="#F59E0B" style={{ marginRight: 4 }} />
                  <Text style={[styles.actionButtonText, { color: '#F59E0B' }]}>Set Default</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {loading && !files.length ? (
            <ActivityIndicator size="large" color="#3B82F6" style={{ marginTop: 40 }} />
          ) : (
            <FlatList 
              data={files} 
              keyExtractor={(item) => item.id} 
              numColumns={2}
              columnWrapperStyle={styles.rowWrapper}
              contentContainerStyle={{ paddingBottom: 20 }}
              ListEmptyComponent={<Text style={styles.emptyText}>No receipts found. Upload your first one above!</Text>}
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
  header: { padding: 24, paddingTop: 60, borderBottomWidth: 1, borderBottomColor: '#1E293B', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 32, fontWeight: 'bold', color: '#F8FAFC' },
  signOutButton: { padding: 10, backgroundColor: '#ef444420', borderRadius: 12 },
  authContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30 },
  authText: { color: '#94A3B8', fontSize: 16, textAlign: 'center', marginBottom: 30, lineHeight: 24 },
  connectButton: { flexDirection: 'row', backgroundColor: '#3B82F6', paddingHorizontal: 24, paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  connectButtonText: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
  content: { flex: 1, padding: 24 },
  uploadRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24, gap: 10 },
  uploadButtonHalf: { flex: 1, flexDirection: 'row', backgroundColor: '#10B981', padding: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
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
  emptyText: { color: '#94A3B8', textAlign: 'center', marginTop: 40, fontSize: 16, fontStyle: 'italic' },
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