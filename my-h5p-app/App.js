import React, { useState,useEffect } from 'react';
import { StyleSheet, View, Text, StatusBar, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import { SafeAreaView } from 'react-native-safe-area-context';
// CHANGE THIS TO YOUR SERVER URL
// For Android Emulator use 'http://10.0.2.2:3000'
// For iOS Simulator use 'http://localhost:3000'
// For Physical Device use your machine's IP e.g., 'http://192.168.1.50:3000'
const H5P_SERVER_URL = Platform.OS === 'android' 
  ? 'http://10.0.2.2:3000/play/1007879370' 
  : 'http://localhost:3000/play/1007879370';

export default function App() {
  const [lastEvent, setLastEvent] = useState(null);

  const handleMessage = (event) => {
    try {
      console.log("event data",event.nativeEvent.data)
      const data = JSON.parse(event.nativeEvent.data);
      // console.log("Received from WebView:\n", data);
      
      if (data.type === 'xAPI') {
        setLastEvent(data.data); // Update UI
      }
    } catch (e) {
      console.error("Failed to parse message", e);
    }
  };

  useEffect(() => {
    if (Platform.OS === 'web') {
      // Add event listener for messages from WebView
      window.addEventListener('message', handleMessage);
      return () => window.removeEventListener('message', handleMessage);
    }
  }, []);


  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>H5P xAPI Bridge</Text>
      </View>
      
      <View style={styles.webviewContainer}>
        {Platform.OS === 'web' ? <iframe src={H5P_SERVER_URL} style={{ flex: 1 }} /> : (
          <WebView 
          source={{ uri: H5P_SERVER_URL }}
          onMessage={handleMessage}
          style={{ flex: 1 }}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          onError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            console.warn('WebView error: ', nativeEvent);
          }}
        />
        )}
      </View>

      <View style={styles.logContainer}>
        <Text style={styles.logTitle}>Last xAPI Event:</Text>
        <Text style={styles.logText}>
          {lastEvent 
            ? JSON.stringify(lastEvent, null, 2) 
            : "Interact with the content to see events..."}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    padding: 15,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  webviewContainer: {
    flex: 2, // Take up 2/3 of the screen
    borderBottomWidth: 1,
    borderBottomColor: '#ccc',
  },
  logContainer: {
    flex: 1, // Take up 1/3 of the screen
    padding: 10,
    backgroundColor: '#333',
  },
  logTitle: {
    color: '#fff',
    fontWeight: 'bold',
    marginBottom: 5,
  },
  logText: {
    color: '#0f0',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
  },
});