import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, StatusBar, Platform, ScrollView } from 'react-native';
import { WebView } from 'react-native-webview';
import { SafeAreaView } from 'react-native-safe-area-context';

// CHANGE THIS TO YOUR SERVER URL
const H5P_SERVER_URL = Platform.OS === 'android' 
  ? 'http://10.0.2.2:3000/play/666999583'
  : 'http://localhost:3000/play/666999583';

export default function App() {
  console.log("app launch");
  const [lastEvent, setLastEvent] = useState(null);
  const [eventLog, setEventLog] = useState([]);

  const handleMessage = (event) => {
  try {
    const rawData = Platform.OS === 'web' 
      ? (typeof event.data === 'string' ? event.data : JSON.stringify(event.data))
      : event.nativeEvent.data;
    
    const data = JSON.parse(rawData);
    
    // Add to event log with color coding
    const newEvent = {
      timestamp: new Date().toLocaleTimeString(),
      type: data.type,
      data: data.data,
      color: getEventColor(data.type) // Add this
    };
    
    setEventLog(prev => [newEvent, ...prev].slice(0, 50)); // Increase to 50 events
    setLastEvent(data.data);
    
    // Enhanced logging with emojis
    switch(data.type) {
      case 'h5p-initialized':
        console.log('✅ H5P Content Loaded');
        break;
        
      case 'interaction-appeared':
        console.log('🎯 INTERACTION APPEARED at', data.data.videoTime + 's');
        break;
        
      case 'interaction-clicked':
        console.log('👆 USER CLICKED INTERACTION #' + data.data.interactionNumber);
        break;
        
      case 'video-play':
        console.log('▶️ Video Playing at', data.data.currentTime + 's');
        break;
        
      case 'video-seeked':
        console.log('⏩ Video Skipped to', data.data.currentTime + 's');
        break;
        
      case 'xAPI':
        const verb = data.data.verb;
        console.log('🎯 xAPI:', verb, '|', data.data.objectName);
        
        if (verb === 'interacted') {
          console.log('   👉 USER INTERACTED WITH:', data.data.objectName);
        } else if (verb === 'answered') {
          console.log('   ✏️ ANSWER:', data.data.result?.response);
        }
        break;
        
      default:
        console.log('📨', data.type);
    }
  } catch (e) {
    console.error("Failed to parse message:", e);
  }
};

// Helper function for event colors
const getEventColor = (type) => {
  const colorMap = {
    'xAPI': '#ff00ff',
    'interaction-appeared': '#00ffff',
    'interaction-clicked': '#ffff00',
    'video-play': '#00ff00',
    'video-pause': '#ff8800',
    'video-seeked': '#ff0088',
    'h5p-interacted': '#ff00ff',
    'h5p-answered': '#00ff00',
  };
  return colorMap[type] || '#00ff00';
};

  useEffect(() => {
    if (Platform.OS === 'web') {
      // Add event listener for messages from iframe
      const messageHandler = (event) => {
        handleMessage({ data: event.data });
      };
      
      window.addEventListener('message', messageHandler);
      console.log('Web message listener added');
      
      return () => {
        window.removeEventListener('message', messageHandler);
      };
    }
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      
      <View style={styles.header}>
        <Text style={styles.headerTitle}>H5P xAPI Bridge</Text>
        <Text style={styles.headerSubtitle}>
          {Platform.OS === 'web' ? '🌐 Web Mode' : '📱 Native Mode'}
        </Text>
      </View>
      
      <View style={styles.webviewContainer}>
        {Platform.OS === 'web' ? (
          // Web iframe with proper styling
          <iframe 
            src={H5P_SERVER_URL}
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              display: 'block'
            }}
            allow="autoplay; fullscreen"
            title="H5P Content"
          />
        ) : (
          // React Native WebView
          <WebView 
            source={{ uri: H5P_SERVER_URL }}
            onMessage={handleMessage}
            style={styles.webview}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            mediaPlaybackRequiresUserAction={false}
            allowsInlineMediaPlayback={true}
            onError={(syntheticEvent) => {
              const { nativeEvent } = syntheticEvent;
              console.warn('WebView error:', nativeEvent);
            }}
            onLoadStart={() => console.log('🔄 Loading H5P...')}
            onLoadEnd={() => console.log('✅ H5P Loaded')}
          />
        )}
      </View>

      <ScrollView style={styles.logContainer}>
        <Text style={styles.logTitle}>Event Log ({eventLog.length} events):</Text>
        
        {eventLog.length === 0 ? (
          <Text style={styles.placeholderText}>
            ⏳ Waiting for events... Play the video to see activity!
          </Text>
        ) : (
          eventLog.map((event, index) => (
            <View key={index} style={styles.eventItem}>
              <Text style={styles.eventTime}>{event.timestamp}</Text>
              <Text style={styles.eventType}>{event.type}</Text>
              <Text style={styles.eventData}>
                {JSON.stringify(event.data, null, 2)}
              </Text>
            </View>
          ))
        )}
        
        <View style={styles.separator} />
        
        <Text style={styles.logTitle}>Last Event Detail:</Text>
        <Text style={styles.logText}>
          {lastEvent 
            ? JSON.stringify(lastEvent, null, 2) 
            : "No events yet..."}
        </Text>
      </ScrollView>
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
    color: '#333',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  webviewContainer: {
    flex: 2,
    borderBottomWidth: 1,
    borderBottomColor: '#ccc',
    backgroundColor: '#000',
  },
  webview: {
    flex: 1,
    backgroundColor: '#000',
  },
  logContainer: {
    flex: 1,
    padding: 10,
    backgroundColor: '#1a1a1a',
  },
  logTitle: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
    marginBottom: 10,
    marginTop: 5,
  },
  placeholderText: {
    color: '#888',
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 20,
  },
  eventItem: {
    backgroundColor: '#2a2a2a',
    padding: 10,
    marginBottom: 8,
    borderRadius: 5,
    borderLeftWidth: 3,
    borderLeftColor: '#00ff00',
  },
  eventTime: {
    color: '#888',
    fontSize: 10,
    marginBottom: 4,
  },
  eventType: {
    color: '#00ff00',
    fontWeight: 'bold',
    fontSize: 12,
    marginBottom: 4,
  },
  eventData: {
    color: '#0ff',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 10,
  },
  separator: {
    height: 1,
    backgroundColor: '#444',
    marginVertical: 15,
  },
  logText: {
    color: '#0f0',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 11,
    lineHeight: 16,
  },
});