import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Zeroconf from "react-native-zeroconf";

const BonjourCommunication = () => {
  const [services, setServices] = useState([]);
  const [connectedService, setConnectedService] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  const zeroconf = useRef(null);
  const wsRef = useRef(null);

  // Centralized setup for Zeroconf listeners
  const setupZeroconfListeners = () => {
    if (!zeroconf.current) {
      console.error(
        "[setupZeroconfListeners] zeroconf.current is null. Cannot setup listeners."
      );
      Alert.alert("错误", "设备发现服务实例丢失，无法设置监听器。");
      return;
    }

    console.log("[setupZeroconfListeners] Setting up Zeroconf listeners...");

    zeroconf.current.on("start", () => {
      console.log("Zeroconf scan started");
      setIsScanning(true);
    });

    zeroconf.current.on("stop", () => {
      console.log("Zeroconf scan stopped");
      setIsScanning(false);
    });

    zeroconf.current.on("found", (name) => {
      // Note: 'found' event in some versions might give just the name or a partial service object.
      // 'resolved' is usually more reliable for getting full service details.
      console.log("Found service (raw name):", name);
    });

    zeroconf.current.on("resolved", (service) => {
      console.log("Resolved service:", service);
      if (service && service.name) {
        // Ensure service object and name are valid
        setServices((prevServices) => {
          const serviceExists = prevServices.some(
            (s) => s.name === service.name
          );
          if (!serviceExists) {
            return [...prevServices, service];
          }
          return prevServices;
        });
      } else {
        console.warn(
          "Resolved an invalid or incomplete service object:",
          service
        );
      }
    });

    zeroconf.current.on("remove", (serviceName) => {
      console.log("Service removed:", serviceName);
      setServices((prevServices) =>
        prevServices.filter((s) => s.name !== serviceName)
      );
    });

    zeroconf.current.on("error", (error) => {
      console.error("Zeroconf error event:", error);
      Alert.alert("扫描服务错误", error.message || error.toString());
      setIsScanning(false);
    });

    console.log("[setupZeroconfListeners] Zeroconf listeners set up.");
  };

  const startScan = () => {
    console.log("[startScan] Attempting to start scan...");
    if (!zeroconf.current) {
      console.error("[startScan] zeroconf.current is null. Cannot start scan.");
      Alert.alert("扫描失败", "设备发现服务未初始化。");
      setIsScanning(false);
      return;
    }

    if (typeof zeroconf.current.scan !== "function") {
      console.error(
        "[startScan] zeroconf.current.scan is not a function.",
        zeroconf.current
      );
      Alert.alert("扫描失败", "设备发现服务实例不完整或已损坏。");
      setIsScanning(false);
      return;
    }

    try {
      console.log(
        "[startScan] Clearing previous services and setting isScanning to true."
      );
      setServices([]);
      setIsScanning(true); // Set scanning true before the actual scan call

      // Log the state of zeroconf.current right before calling scan
      console.log(
        "[startScan] About to call scan. zeroconf.current:",
        zeroconf.current
      );

      zeroconf.current.scan("easypasta", "tcp", "local.");
      console.log(
        "[startScan] zeroconf.current.scan('easypasta', 'tcp', 'local.') called successfully."
      );
    } catch (error) {
      console.error("[startScan] Error during scan method call:", error);
      Alert.alert("启动扫描失败", error.message || error.toString());
      setIsScanning(false);
    }
  };

  useEffect(() => {
    console.log(
      "BonjourCommunication component mounted. Initializing Zeroconf..."
    );
    let instanceCreated = false;

    try {
      const zeroconfInstance = new Zeroconf();
      console.log("Zeroconf instance created in useEffect:", zeroconfInstance);

      if (zeroconfInstance && typeof zeroconfInstance.scan === "function") {
        zeroconf.current = zeroconfInstance;
        instanceCreated = true;
        console.log(
          "zeroconf.current assigned in useEffect:",
          zeroconf.current
        );

        setupZeroconfListeners(); // Setup listeners on the new instance
        startScan(); // Start scanning immediately

        Alert.alert("设备发现服务已初始化", "请确保在同一 WiFi 网络中");
      } else {
        console.error(
          "Failed to create a valid Zeroconf instance or instance lacks a scan method.",
          zeroconfInstance
        );
        Alert.alert(
          "初始化失败",
          "无法创建有效的设备发现服务实例。请检查库安装和原生链接。"
        );
      }
    } catch (error) {
      console.error("Error during Zeroconf instantiation in useEffect:", error);
      Alert.alert("初始化严重失败", `无法实例化设备发现服务: ${error.message}`);
    }

    return () => {
      console.log(
        "BonjourCommunication component unmounting. Cleaning up Zeroconf..."
      );
      if (zeroconf.current) {
        try {
          console.log("Stopping scan and removing listeners.");
          zeroconf.current.stop();
          zeroconf.current.removeAllListeners(); // Crucial to prevent leaks and errors on re-init
          console.log("Zeroconf cleanup successful.");
        } catch (cleanupError) {
          console.error("Error during Zeroconf cleanup:", cleanupError);
        } finally {
          zeroconf.current = null; // Ensure it's nullified
        }
      }
      disconnectService(); // Also disconnect WebSocket if connected
    };
  }, []); // Empty dependency array ensures this runs only on mount and unmount

  const stopScan = () => {
    if (zeroconf.current && typeof zeroconf.current.stop === "function") {
      try {
        console.log("[stopScan] Stopping Zeroconf scan.");
        zeroconf.current.stop();
      } catch (error) {
        console.error("Error stopping scan:", error);
        Alert.alert("停止扫描失败", error.toString());
      }
    } else {
      console.warn(
        "[stopScan] Cannot stop scan: zeroconf.current is null or stop method is missing."
      );
    }
  };

  const connectToService = async (service) => {
    if (
      !service ||
      !service.addresses ||
      service.addresses.length === 0 ||
      !service.port
    ) {
      Alert.alert("连接失败", "服务信息不完整或无效。");
      console.error("Invalid service object for connection:", service);
      return;
    }
    // Ensure we are trying to connect to a service with an IP address.
    // Zeroconf might resolve hostnames that need further resolution or are not IP addresses.
    // For `react-native-zeroconf`, addresses[0] is usually the IP.
    const address = service.addresses[0];
    const port = service.port;

    // Basic IP validation (very simple, consider a robust library if needed)
    // This regex checks for IPv4 format. For IPv6, it would be more complex.
    const ipRegex = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/;
    if (!ipRegex.test(address)) {
      Alert.alert("连接失败", `服务地址 "${address}" 不是有效的 IPv4 地址。`);
      console.error("Invalid IP address for WebSocket connection:", address);
      return;
    }

    try {
      stopScan(); // Stop scanning when attempting to connect
      setConnectedService(service);

      const wsUrl = `ws://${address}:${port}/ws`;
      console.log("Attempting to connect to WebSocket:", wsUrl);

      // Close existing WebSocket connection if any
      if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
        console.log(
          "Closing existing WebSocket connection before opening a new one."
        );
        wsRef.current.close();
      }

      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log("WebSocket connected to:", wsUrl);
        setIsConnected(true);
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now(),
            type: "system",
            content: `已连接到 ${service.name}`,
            timestamp: new Date().toLocaleTimeString(),
          },
        ]);
      };

      wsRef.current.onmessage = (event) => {
        console.log("Received WebSocket message:", event.data);
        try {
          const message = JSON.parse(event.data);
          setMessages((prev) => [
            ...prev,
            {
              id: Date.now(),
              type: "received",
              content: message.content || event.data, // Fallback to raw data if content is missing
              timestamp: new Date().toLocaleTimeString(),
            },
          ]);
        } catch (e) {
          // If JSON.parse fails, treat as plain text message
          setMessages((prev) => [
            ...prev,
            {
              id: Date.now(),
              type: "received",
              content: event.data,
              timestamp: new Date().toLocaleTimeString(),
            },
          ]);
        }
      };

      wsRef.current.onerror = (error) => {
        // WebSocket errors are often generic. The console might have more details.
        console.error("WebSocket error:", error.message || error); // error object might be simple
        Alert.alert(
          "连接错误",
          `无法连接到服务 ${service.name}. 请检查网络和服务器状态。`
        );
        setIsConnected(false);
        setConnectedService(null); // Reset connected service on error
      };

      wsRef.current.onclose = (event) => {
        console.log(
          "WebSocket disconnected. Code:",
          event.code,
          "Reason:",
          event.reason
        );
        setIsConnected(false);
        // Only add "连接已断开" if it wasn't an immediate failure to connect
        if (connectedService && connectedService.name === service.name) {
          // Check if it was the service we were trying to connect to
          setMessages((prev) => [
            ...prev,
            {
              id: Date.now(),
              type: "system",
              content: "连接已断开",
              timestamp: new Date().toLocaleTimeString(),
            },
          ]);
        }
        setConnectedService(null); // Clear connected service
      };
    } catch (error) {
      console.error("Error setting up WebSocket connection:", error);
      Alert.alert("连接失败", error.toString());
      setConnectedService(null);
      setIsConnected(false);
    }
  };

  const disconnectService = () => {
    if (wsRef.current) {
      try {
        console.log("Disconnecting WebSocket manually.");
        wsRef.current.close();
      } catch (error) {
        console.error("Error disconnecting WebSocket:", error);
      }
      wsRef.current = null; // Clear the ref
    }
    setConnectedService(null);
    setIsConnected(false);
    // Optionally, restart scanning after disconnect
    // startScan();
  };

  const sendMessage = () => {
    if (!inputText.trim()) {
      Alert.alert("无法发送", "消息内容不能为空。");
      return;
    }
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      Alert.alert("发送失败", "WebSocket 未连接或未准备好。");
      console.warn(
        "Attempted to send message but WebSocket is not open. State:",
        wsRef.current ? wsRef.current.readyState : "null"
      );
      return;
    }

    try {
      const messagePayload = {
        type: "text_message",
        content: inputText.trim(),
        timestamp: Date.now(),
        device_id: Platform.OS === "ios" ? "ios_device" : "android_device", // Use Platform for device_id
      };

      const messageString = JSON.stringify(messagePayload);
      wsRef.current.send(messageString);
      console.log("Sent message:", messageString);

      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(), // Use a more unique ID if messages can arrive very quickly
          type: "sent",
          content: inputText.trim(),
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
      setInputText("");
    } catch (error) {
      console.error("Error sending message:", error);
      Alert.alert("发送失败", error.toString());
    }
  };

  const renderService = ({ item }) => (
    <TouchableOpacity
      style={styles.serviceItem}
      onPress={() => connectToService(item)}
      disabled={isConnected && connectedService?.name === item.name} // Disable only if connected to THIS service
    >
      <View style={styles.serviceInfo}>
        <Text style={styles.serviceName}>{item.name}</Text>
        <Text style={styles.serviceDetails}>
          {item.addresses && item.addresses[0]
            ? `${item.addresses[0]}:${item.port}`
            : "地址未知"}
        </Text>
        {item.txt && Object.keys(item.txt).length > 0 && (
          <Text
            style={styles.serviceAttributes}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {Object.entries(item.txt)
              .map(([key, value]) => `${key}: ${value}`)
              .join(", ")}
          </Text>
        )}
      </View>
      <Text
        style={[
          styles.connectButton,
          isConnected &&
            connectedService?.name === item.name &&
            styles.connectButtonConnected,
          isConnected &&
            connectedService?.name !== item.name &&
            styles.connectButtonDisabled, // Disabled if connected to another service
        ]}
      >
        {isConnected && connectedService?.name === item.name
          ? "已连接"
          : "连接"}
      </Text>
    </TouchableOpacity>
  );

  const renderMessage = ({ item }) => (
    <View
      style={[
        styles.messageContainer,
        item.type === "sent" && styles.sentMessage,
        item.type === "received" && styles.receivedMessage, // Added style for received messages
        item.type === "system" && styles.systemMessage,
      ]}
    >
      <Text
        style={[
          styles.messageContent,
          item.type === "sent" && styles.sentMessageText,
          item.type === "received" && styles.receivedMessageText, // Added style
          item.type === "system" && styles.systemMessageText,
        ]}
      >
        {item.content}
      </Text>
      <Text
        style={[
          styles.messageTime,
          item.type === "sent"
            ? styles.sentMessageTime
            : styles.receivedMessageTime,
        ]}
      >
        {item.timestamp}
      </Text>
    </View>
  );

  // UI for when not connected to a service (discovery mode)
  if (!connectedService || !isConnected) {
    // Show discovery if not connected OR connection attempt failed
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>EasyPasta 设备发现</Text>
          <View style={styles.scanStatusContainer}>
            {isScanning && (
              <ActivityIndicator
                size="small"
                color="#007AFF"
                style={styles.activityIndicator}
              />
            )}
            <TouchableOpacity
              style={[
                styles.refreshButton,
                isScanning && styles.refreshButtonDisabled,
              ]}
              onPress={startScan}
              disabled={isScanning}
            >
              <Text style={styles.refreshButtonText}>
                {isScanning ? "扫描中..." : "刷新列表"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <FlatList
          data={services}
          renderItem={renderService}
          keyExtractor={(item, index) => item.name + index} // Ensure unique keys if names can repeat before full resolution
          style={styles.servicesList}
          ListEmptyComponent={
            <View style={styles.emptyListContainer}>
              <Text style={styles.emptyListText}>
                {isScanning ? "正在搜索设备..." : "未发现 EasyPasta 设备"}
              </Text>
              <Text style={styles.emptyListSubText}>
                请确保 Mac 端 EasyPasta 服务正在运行，并且手机与 Mac 在同一 WiFi
                网络中。
              </Text>
            </View>
          }
          extraData={isConnected || connectedService} // Helps FlatList re-render items when connection state changes
        />
      </SafeAreaView>
    );
  }

  // UI for when connected to a service (chat mode)
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.chatHeader}>
        <TouchableOpacity style={styles.backButton} onPress={disconnectService}>
          <Text style={styles.backButtonText}>← 返回列表</Text>
        </TouchableOpacity>
        <View style={styles.connectionInfo}>
          <Text
            style={styles.deviceName}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {connectedService.name}
          </Text>
          <Text
            style={[
              styles.connectionStatus,
              isConnected ? styles.connectedText : styles.disconnectedText,
            ]}
          >
            {isConnected ? "已连接" : "尝试连接中..."}
          </Text>
        </View>
      </View>

      <FlatList
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id.toString()}
        style={styles.messagesList}
        inverted // Common for chat UIs, new messages at the bottom
        ListEmptyComponent={
          <View style={styles.emptyChatContainer}>
            <Text style={styles.emptyChatText}>
              开始对话吧！发送的消息将同步到 {connectedService.name}。
            </Text>
          </View>
        }
      />

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.textInput}
          value={inputText}
          onChangeText={setInputText}
          placeholder="输入消息..."
          placeholderTextColor="#999"
          multiline
          maxLength={500} // Good to have a limit
          editable={isConnected} // Only allow input if connected
        />
        <TouchableOpacity
          style={[
            styles.sendButton,
            (!inputText.trim() || !isConnected) && styles.sendButtonDisabled,
          ]}
          onPress={sendMessage}
          disabled={!inputText.trim() || !isConnected}
        >
          <Text style={styles.sendButtonText}>发送</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F0F0F0", // Slightly off-white background
  },
  // Header for service discovery
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
  },
  title: {
    fontSize: 20,
    fontWeight: "600", // Semibold
    color: "#333",
  },
  scanStatusContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  activityIndicator: {
    marginRight: 8,
  },
  refreshButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#007AFF",
    borderRadius: 8,
    marginLeft: 8,
  },
  refreshButtonDisabled: {
    backgroundColor: "#B0C4DE", // Lighter blue when disabled
  },
  refreshButtonText: {
    color: "white",
    fontSize: 14,
    fontWeight: "500",
  },
  // Services List
  servicesList: {
    flex: 1,
  },
  serviceItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "white",
    padding: 16,
    marginHorizontal: 12,
    marginVertical: 6,
    borderRadius: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  serviceInfo: {
    flex: 1, // Allow text to take available space
    marginRight: 12,
  },
  serviceName: {
    fontSize: 17,
    fontWeight: "bold",
    color: "#222",
  },
  serviceDetails: {
    fontSize: 14,
    color: "#555",
    marginTop: 2,
  },
  serviceAttributes: {
    fontSize: 12,
    color: "#777",
    marginTop: 4,
    fontStyle: "italic",
  },
  connectButton: {
    fontSize: 14,
    fontWeight: "600",
    color: "#007AFF",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "#007AFF",
  },
  connectButtonConnected: {
    color: "#34C759", // Green for connected
    borderColor: "#34C759",
  },
  connectButtonDisabled: {
    color: "#A0A0A0", // Grey for disabled (e.g., connected to another service)
    borderColor: "#D0D0D0",
  },
  // Empty list styles
  emptyListContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    marginTop: 50,
  },
  emptyListText: {
    fontSize: 17,
    color: "#666",
    textAlign: "center",
    marginBottom: 8,
  },
  emptyListSubText: {
    fontSize: 14,
    color: "#888",
    textAlign: "center",
    lineHeight: 20,
  },
  // Chat Header
  chatHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
  },
  backButton: {
    padding: 8, // Make tap target larger
    marginRight: 8,
  },
  backButtonText: {
    fontSize: 16,
    color: "#007AFF",
    fontWeight: "500",
  },
  connectionInfo: {
    flex: 1, // Take remaining space
    alignItems: "flex-start", // Align text to the start
  },
  deviceName: {
    fontSize: 17,
    fontWeight: "600",
    color: "#333",
  },
  connectionStatus: {
    fontSize: 13,
    marginTop: 2,
  },
  connectedText: {
    // Renamed from 'connected' to avoid conflict
    color: "#34C759", // Green
  },
  disconnectedText: {
    // Renamed from 'disconnected'
    color: "#FF9800", // Orange
  },
  // Messages List
  messagesList: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  messageContainer: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginVertical: 5,
    borderRadius: 18, // More rounded bubbles
    maxWidth: "80%",
    minWidth: "20%", // Ensure some minimum width
  },
  sentMessage: {
    backgroundColor: "#007AFF",
    alignSelf: "flex-end",
    marginLeft: "20%", // Ensure it doesn't take full width if short
  },
  receivedMessage: {
    // Added style for received messages
    backgroundColor: "#E5E5EA", // Light grey for received
    alignSelf: "flex-start",
    marginRight: "20%",
  },
  systemMessage: {
    backgroundColor: "#F0F0F0",
    alignSelf: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    marginVertical: 8,
  },
  messageContent: {
    fontSize: 16,
  },
  sentMessageText: {
    color: "white",
  },
  receivedMessageText: {
    // Added style
    color: "#2C2C2E", // Dark grey for received text
  },
  systemMessageText: {
    color: "#555",
    fontSize: 13,
    fontStyle: "italic",
  },
  messageTime: {
    fontSize: 11,
    marginTop: 5,
  },
  sentMessageTime: {
    color: "#E0E0E0", // Lighter time for sent messages
    alignSelf: "flex-end",
  },
  receivedMessageTime: {
    color: "#8E8E93", // Darker grey for received time
    alignSelf: "flex-end",
  },
  // Input Area
  inputContainer: {
    flexDirection: "row",
    alignItems: "center", // Align items vertically for multiline input
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "white",
    borderTopWidth: 1,
    borderTopColor: "#E0E0E0",
  },
  textInput: {
    flex: 1,
    backgroundColor: "#F8F8F8",
    borderWidth: 1,
    borderColor: "#E0E0E0",
    borderRadius: 20, // Rounded input field
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "ios" ? 10 : 8, // Adjust padding for OS
    paddingBottom: Platform.OS === "ios" ? 10 : 8,
    fontSize: 16,
    marginRight: 10,
    maxHeight: 100, // For multiline
  },
  sendButton: {
    backgroundColor: "#007AFF",
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20, // Match text input
    justifyContent: "center",
    alignItems: "center",
  },
  sendButtonDisabled: {
    backgroundColor: "#B0C4DE",
  },
  sendButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  // Empty chat styles
  emptyChatContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    transform: [{ scaleY: -1 }], // Counteract FlatList inversion for centered text
  },
  emptyChatText: {
    fontSize: 15,
    color: "#777",
    textAlign: "center",
    lineHeight: 22,
  },
});

export default BonjourCommunication;
