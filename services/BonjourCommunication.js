import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
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

  useEffect(() => {
    initializeZeroconf();

    return () => {
      cleanupZeroconf();
      disconnectService();
    };
  }, []);

  const initializeZeroconf = () => {
    try {
      // 创建新的 Zeroconf 实例
      const zeroconfInstance = new Zeroconf();
      zeroconf.current = zeroconfInstance;
      setupZeroconf();
      startScan();
    } catch (error) {
      console.error("Initialize Zeroconf error:", error);
      Alert.alert("初始化失败", "无法初始化设备发现服务");
    }
  };

  const setupZeroconf = () => {
    if (!zeroconf.current) {
      Alert.alert("设备发现服务未初始化", "请检查网络连接");
      return;
    }
    Alert.alert("设备发现服务已初始化", "请确保在同一 WiFi 网络中");

    zeroconf.current.on("start", () => {
      console.log("Zeroconf scan started");
      setIsScanning(true);
    });

    zeroconf.current.on("stop", () => {
      console.log("Zeroconf scan stopped");
      setIsScanning(false);
    });

    zeroconf.current.on("found", (name) => {
      console.log("Found service:", name);
    });

    zeroconf.current.on("resolved", (service) => {
      console.log("Resolved service:", service);
      setServices((prev) => {
        const exists = prev.find((s) => s.name === service.name);
        if (!exists) {
          return [...prev, service];
        }
        return prev;
      });
    });

    zeroconf.current.on("remove", (name) => {
      console.log("Service removed:", name);
      setServices((prev) => prev.filter((s) => s.name !== name));
    });

    zeroconf.current.on("error", (error) => {
      console.error("Zeroconf error:", error);
      Alert.alert("扫描错误", error.toString());
      setIsScanning(false);
    });
  };

  const startScan = () => {
    if (!zeroconf.current) {
      console.error("Zeroconf not initialized");
      Alert.alert("扫描失败", "设备发现服务未初始化");
      return;
    }

    try {
      setServices([]);
      setIsScanning(true);
      // 在调用 scan 之前再次打印日志
      console.log(
        "[startScan] Right before scan call. zeroconf.current is:",
        zeroconf.current
      );

      // 可以再加一个防御性检查
      if (!zeroconf.current) {
        console.error(
          "[startScan] CRITICAL: zeroconf.current became null unexpectedly just before scan call!"
        );
        Alert.alert("扫描严重错误", "设备发现服务实例丢失");
        setIsScanning(false); // 重置状态
        return;
      }
      zeroconf.current.scan("easypasta", "tcp", "local.");
      console.log("[startScan] Scan method called successfully.");
    } catch (error) {
      console.error("[startScan] ERROR during scan:", error);
      setIsScanning(false);
      Alert.alert("启动扫描失败", error.toString());
    }
  };

  const stopScan = () => {
    if (!zeroconf.current) return;

    try {
      zeroconf.current.stop();
    } catch (error) {
      console.error("Stop scan error:", error);
    }
  };

  const cleanupZeroconf = () => {
    if (zeroconf.current) {
      try {
        zeroconf.current.stop();
        zeroconf.current.removeAllListeners();
        zeroconf.current = null;
      } catch (error) {
        console.error("Cleanup Zeroconf error:", error);
      }
    }
  };

  const connectToService = async (service) => {
    try {
      setConnectedService(service);

      // 确保有有效的地址
      if (!service.addresses || service.addresses.length === 0) {
        Alert.alert("连接失败", "服务地址无效");
        return;
      }

      const wsUrl = `ws://${service.addresses[0]}:${service.port}/ws`;
      console.log("Connecting to:", wsUrl);

      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log("WebSocket connected");
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
        console.log("Received message:", event.data);
        try {
          const message = JSON.parse(event.data);
          setMessages((prev) => [
            ...prev,
            {
              id: Date.now(),
              type: "received",
              content: message.content || event.data,
              timestamp: new Date().toLocaleTimeString(),
            },
          ]);
        } catch (e) {
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
        console.error("WebSocket error:", error);
        Alert.alert("连接错误", "无法连接到服务");
        setIsConnected(false);
      };

      wsRef.current.onclose = () => {
        console.log("WebSocket disconnected");
        setIsConnected(false);
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now(),
            type: "system",
            content: "连接已断开",
            timestamp: new Date().toLocaleTimeString(),
          },
        ]);
      };
    } catch (error) {
      console.error("Connect error:", error);
      Alert.alert("连接失败", error.toString());
    }
  };

  const disconnectService = () => {
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch (error) {
        console.error("Disconnect WebSocket error:", error);
      }
      wsRef.current = null;
    }
    setConnectedService(null);
    setIsConnected(false);
  };

  const sendMessage = () => {
    if (!inputText.trim() || !wsRef.current || !isConnected) {
      return;
    }

    try {
      const message = {
        type: "text_message",
        content: inputText.trim(),
        timestamp: Date.now(),
        device_id: "mobile_device",
      };

      wsRef.current.send(JSON.stringify(message));

      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          type: "sent",
          content: inputText.trim(),
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);

      setInputText("");
    } catch (error) {
      console.error("Send message error:", error);
      Alert.alert("发送失败", error.toString());
    }
  };

  const renderService = ({ item }) => (
    <TouchableOpacity
      style={styles.serviceItem}
      onPress={() => connectToService(item)}
      disabled={isConnected}
    >
      <View style={styles.serviceInfo}>
        <Text style={styles.serviceName}>{item.name}</Text>
        <Text style={styles.serviceDetails}>
          {item.addresses && item.addresses[0]
            ? `${item.addresses[0]}:${item.port}`
            : "地址未知"}
        </Text>
        {item.txt && Object.keys(item.txt).length > 0 && (
          <Text style={styles.serviceAttributes}>
            {Object.entries(item.txt)
              .map(([key, value]) => `${key}: ${value}`)
              .join(", ")}
          </Text>
        )}
      </View>
      <Text
        style={[
          styles.connectButton,
          isConnected && styles.connectButtonDisabled,
        ]}
      >
        {connectedService?.name === item.name ? "已连接" : "连接"}
      </Text>
    </TouchableOpacity>
  );

  const renderMessage = ({ item }) => (
    <View
      style={[
        styles.messageContainer,
        item.type === "sent" && styles.sentMessage,
        item.type === "system" && styles.systemMessage,
      ]}
    >
      <Text
        style={[
          styles.messageContent,
          item.type === "sent" && styles.sentMessageText,
          item.type === "system" && styles.systemMessageText,
        ]}
      >
        {item.content}
      </Text>
      <Text style={styles.messageTime}>{item.timestamp}</Text>
    </View>
  );

  if (!connectedService) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>EasyPasta 设备发现</Text>
          <View style={styles.scanStatus}>
            {isScanning && <ActivityIndicator size="small" color="#007AFF" />}
            <TouchableOpacity
              style={styles.refreshButton}
              onPress={startScan}
              disabled={isScanning}
            >
              <Text style={styles.refreshButtonText}>
                {isScanning ? "扫描中..." : "刷新"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <FlatList
          data={services}
          renderItem={renderService}
          keyExtractor={(item) => item.name}
          style={styles.servicesList}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                {isScanning ? "正在搜索设备..." : "未发现设备"}
              </Text>
              <Text style={styles.emptySubText}>
                请确保 Mac 端 EasyPasta 服务正在运行，且在同一 WiFi 网络中
              </Text>
            </View>
          }
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.chatHeader}>
        <TouchableOpacity style={styles.backButton} onPress={disconnectService}>
          <Text style={styles.backButtonText}>← 返回</Text>
        </TouchableOpacity>
        <View style={styles.connectionInfo}>
          <Text style={styles.deviceName}>{connectedService.name}</Text>
          <Text
            style={[
              styles.connectionStatus,
              isConnected ? styles.connected : styles.disconnected,
            ]}
          >
            {isConnected ? "已连接" : "连接中..."}
          </Text>
        </View>
      </View>

      <FlatList
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id.toString()}
        style={styles.messagesList}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>开始对话吧！</Text>
          </View>
        }
      />

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.textInput}
          value={inputText}
          onChangeText={setInputText}
          placeholder="输入消息..."
          multiline
          maxLength={500}
          editable={isConnected}
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
    backgroundColor: "#f5f5f5",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
  },
  scanStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  refreshButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#007AFF",
    borderRadius: 6,
  },
  refreshButtonText: {
    color: "white",
    fontSize: 14,
  },
  servicesList: {
    flex: 1,
  },
  serviceItem: {
    flexDirection: "row",
    padding: 16,
    backgroundColor: "white",
    marginHorizontal: 16,
    marginVertical: 4,
    borderRadius: 8,
    alignItems: "center",
  },
  serviceInfo: {
    flex: 1,
  },
  serviceName: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
  },
  serviceDetails: {
    fontSize: 14,
    color: "#666",
    marginTop: 2,
  },
  serviceAttributes: {
    fontSize: 12,
    color: "#999",
    marginTop: 2,
  },
  connectButton: {
    color: "#007AFF",
    fontSize: 14,
    fontWeight: "500",
  },
  connectButtonDisabled: {
    color: "#999",
  },
  chatHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  backButton: {
    marginRight: 16,
  },
  backButtonText: {
    fontSize: 16,
    color: "#007AFF",
  },
  connectionInfo: {
    flex: 1,
  },
  deviceName: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
  },
  connectionStatus: {
    fontSize: 12,
    marginTop: 2,
  },
  connected: {
    color: "#4CAF50",
  },
  disconnected: {
    color: "#FF9800",
  },
  messagesList: {
    flex: 1,
    padding: 16,
  },
  messageContainer: {
    padding: 12,
    marginVertical: 4,
    borderRadius: 12,
    maxWidth: "80%",
  },
  sentMessage: {
    backgroundColor: "#007AFF",
    alignSelf: "flex-end",
  },
  systemMessage: {
    backgroundColor: "#e0e0e0",
    alignSelf: "center",
  },
  messageContent: {
    fontSize: 16,
    color: "#333",
  },
  sentMessageText: {
    color: "white",
  },
  systemMessageText: {
    color: "#666",
    fontSize: 14,
  },
  messageTime: {
    fontSize: 12,
    color: "#999",
    marginTop: 4,
    alignSelf: "flex-end",
  },
  inputContainer: {
    flexDirection: "row",
    padding: 16,
    backgroundColor: "white",
    borderTopWidth: 1,
    borderTopColor: "#e0e0e0",
    gap: 12,
  },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    maxHeight: 100,
    fontSize: 16,
  },
  sendButton: {
    backgroundColor: "#007AFF",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    justifyContent: "center",
  },
  sendButtonDisabled: {
    backgroundColor: "#ccc",
  },
  sendButtonText: {
    color: "white",
    fontWeight: "500",
  },
  emptyContainer: {
    padding: 32,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
  },
  emptySubText: {
    fontSize: 14,
    color: "#999",
    textAlign: "center",
    marginTop: 8,
  },
});

export default BonjourCommunication;
