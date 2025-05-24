import React from 'react';
import {
  StatusBar,
  StyleSheet,
  View,
} from 'react-native';
import BonjourCommunication from '../../services/BonjourCommunication';

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#f5f5f5" />
      <BonjourCommunication />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
