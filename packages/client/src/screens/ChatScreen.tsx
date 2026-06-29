import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRoute, RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../navigation';
import { useAuth } from '../hooks/useAuth';
import { api } from '../services/api';
import { getSocket, connectSocket } from '../services/socket';

/**
 * Community Chat Screen — Lvl1+ gated real-time messaging per cat.
 *
 * Requirements:
 * - 8.1: Lvl1+ owners can read and send messages
 * - 8.2: Non-owners get 403 rejection; chat interface NOT displayed
 * - 8.3: Messages persisted first, then broadcast in real time
 * - 8.4: Chat auto-unlocks on Lvl1 promotion without page refresh
 */

interface ChatMessage {
  id: string;
  catId: string;
  senderId: string;
  senderName?: string;
  content: string;
  createdAt: string;
}

type ChatScreenRoute = RouteProp<RootStackParamList, 'Chat'>;

export function ChatScreen() {
  const route = useRoute<ChatScreenRoute>();
  const { catId } = route.params;
  const { token, userId } = useAuth();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const flatListRef = useRef<FlatList<ChatMessage>>(null);
  const socketJoined = useRef(false);

  // Load message history via REST fallback
  const loadMessages = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.get<ChatMessage[]>(`/cats/${catId}/messages`);
      // Messages come in desc order from server; reverse for display
      setMessages(data.reverse());
      setForbidden(false);
    } catch (err: any) {
      if (err?.message?.includes('403')) {
        setForbidden(true);
      } else {
        setError('Failed to load messages');
      }
    } finally {
      setLoading(false);
    }
  }, [catId]);

  // Connect socket and join room
  useEffect(() => {
    if (!token) return;

    let socket = getSocket();
    if (!socket) {
      socket = connectSocket(token);
    }

    const handleJoinedRoom = (data: { catId: string }) => {
      if (data.catId === catId) {
        socketJoined.current = true;
        // Auto-unlock: if we were previously forbidden, reload messages
        if (forbidden) {
          setForbidden(false);
          loadMessages();
        }
      }
    };

    const handleNewMessage = (message: ChatMessage) => {
      if (message.catId === catId) {
        setMessages((prev) => [...prev, message]);
      }
    };

    const handleSocketError = (data: { code: number; message: string }) => {
      if (data.code === 403) {
        setForbidden(true);
        setLoading(false);
      }
    };

    socket.on('joined_room', handleJoinedRoom);
    socket.on('new_message', handleNewMessage);
    socket.on('error', handleSocketError);

    // Join the cat's chat room
    socket.emit('join_room', catId);

    return () => {
      socket?.off('joined_room', handleJoinedRoom);
      socket?.off('new_message', handleNewMessage);
      socket?.off('error', handleSocketError);
      if (socketJoined.current) {
        socket?.emit('leave_room', catId);
        socketJoined.current = false;
      }
    };
  }, [token, catId, forbidden, loadMessages]);

  // Load initial messages
  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  // Req 8.4: Poll for ownership promotion to auto-unlock chat
  useEffect(() => {
    if (!forbidden) return;

    const interval = setInterval(async () => {
      try {
        // Try to load messages again — if user was promoted to Lvl1+,
        // the server will now allow access
        await api.get<ChatMessage[]>(`/cats/${catId}/messages`);
        // If successful, user has been promoted
        setForbidden(false);
        loadMessages();
        // Re-join socket room
        const socket = getSocket();
        if (socket) {
          socket.emit('join_room', catId);
        }
      } catch {
        // Still forbidden, continue polling
      }
    }, 5000); // Check every 5 seconds

    return () => clearInterval(interval);
  }, [forbidden, catId, loadMessages]);

  // Send message via REST (persist first per req 8.3), socket broadcasts
  const handleSend = useCallback(async () => {
    const trimmed = inputText.trim();
    if (!trimmed || sending) return;

    setSending(true);
    setInputText('');

    // Optimistic update
    const optimisticMessage: ChatMessage = {
      id: `temp-${Date.now()}`,
      catId,
      senderId: userId || '',
      content: trimmed,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticMessage]);

    try {
      const savedMessage = await api.post<ChatMessage>(`/cats/${catId}/messages`, {
        content: trimmed,
      });
      // Replace optimistic message with persisted one
      setMessages((prev) =>
        prev.map((msg) => (msg.id === optimisticMessage.id ? savedMessage : msg)),
      );
    } catch (err: any) {
      // Remove optimistic message on failure
      setMessages((prev) => prev.filter((msg) => msg.id !== optimisticMessage.id));
      if (err?.message?.includes('403')) {
        setForbidden(true);
      } else {
        setError('Failed to send message');
      }
    } finally {
      setSending(false);
    }
  }, [inputText, sending, catId, userId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (messages.length > 0 && flatListRef.current) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length]);

  // Forbidden / 403 screen for non-owners
  if (forbidden) {
    return (
      <View style={styles.forbiddenContainer}>
        <Text style={styles.forbiddenIcon}>🔒</Text>
        <Text style={styles.forbiddenTitle}>Chat Locked</Text>
        <Text style={styles.forbiddenMessage}>
          You must be a Level 1+ owner of this cat to access the community chat.
        </Text>
        <Text style={styles.forbiddenHint}>
          Keep scanning and donating to level up! Chat will unlock automatically when you reach
          Level 1.
        </Text>
      </View>
    );
  }

  // Loading state
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={styles.loadingText}>Loading chat...</Text>
      </View>
    );
  }

  // Error state
  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadMessages}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isOwnMessage = item.senderId === userId;
    return (
      <View
        style={[
          styles.messageBubble,
          isOwnMessage ? styles.ownMessage : styles.otherMessage,
        ]}
      >
        {!isOwnMessage && (
          <Text style={styles.senderName}>
            {item.senderName || item.senderId.slice(0, 8)}
          </Text>
        )}
        <Text style={styles.messageContent}>{item.content}</Text>
        <Text style={styles.messageTime}>
          {new Date(item.createdAt).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Text>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.messageList}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No messages yet. Start the conversation!</Text>
          </View>
        }
      />
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.textInput}
          value={inputText}
          onChangeText={setInputText}
          placeholder="Type a message..."
          placeholderTextColor="#999"
          multiline
          maxLength={2000}
          returnKeyType="send"
          onSubmitEditing={handleSend}
          blurOnSubmit={false}
        />
        <TouchableOpacity
          style={[styles.sendButton, (!inputText.trim() || sending) && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!inputText.trim() || sending}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.sendButtonText}>Send</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  // Forbidden / 403 screen
  forbiddenContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#f5f5f5',
  },
  forbiddenIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  forbiddenTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  forbiddenMessage: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 8,
  },
  forbiddenHint: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  // Loading state
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  // Error state
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#f5f5f5',
  },
  errorText: {
    fontSize: 16,
    color: '#d32f2f',
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  // Message list
  messageList: {
    padding: 12,
    flexGrow: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
  },
  // Message bubbles
  messageBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 16,
    marginBottom: 8,
  },
  ownMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#4CAF50',
    borderBottomRightRadius: 4,
  },
  otherMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#fff',
    borderBottomLeftRadius: 4,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    elevation: 1,
  },
  senderName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4CAF50',
    marginBottom: 4,
  },
  messageContent: {
    fontSize: 15,
    color: '#333',
  },
  messageTime: {
    fontSize: 11,
    color: '#999',
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  // Input area
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 8,
    paddingBottom: Platform.OS === 'ios' ? 20 : 8,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  textInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    backgroundColor: '#f0f0f0',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: '#333',
  },
  sendButton: {
    marginLeft: 8,
    backgroundColor: '#4CAF50',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 40,
  },
  sendButtonDisabled: {
    backgroundColor: '#A5D6A7',
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
