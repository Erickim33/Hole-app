import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react';

import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Linking,
} from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { io } from 'socket.io-client';
import { StatusBar } from 'expo-status-bar';


// =====================================================
// CONFIG
// =====================================================

const BACKEND_URL = 'https://hole-backend.onrender.com';

const MESSAGE_LIFETIME = 30 * 1000;


// =====================================================
// COLORS
// =====================================================

const BG = '#000000';
const SURFACE = '#111111';
const SURFACE2 = '#181818';
const HAIR = '#292929';

const WHITE = '#FFFFFF';
const SUB = '#8E8E93';

const ACCENT = '#FFFFFF';
const RED = '#FF453A';
const BLACK_FIX = '#000000';


// =====================================================
// EMOJIS
// =====================================================

const EMOJI_CHOICES = [
  '😀',
  '😎',
  '🚀',
  '🌙',
  '🐺',
  '🦊',
  '🎮',
  '🎵',
  '🐼',
  '⭐',
  '🔥',
  '🌊',
];


// =====================================================
// APP
// =====================================================

export default function App() {

  // ===================================================
  // AUTH
  // ===================================================

  const [backendUrl, setBackendUrl] =
    useState(BACKEND_URL);

  const [screen, setScreen] =
    useState('setup');

  const [tab, setTab] =
    useState('chats');

  const [settingsSection, setSettingsSection] =
    useState(null);

  const [code, setCode] =
    useState('');

  const [username, setUsername] =
    useState('');

  const [email, setEmail] =
    useState('');

  const [emailVerified, setEmailVerified] =
    useState(false);

  const [verifiedEmail, setVerifiedEmail] =
    useState('');

  const [displayName, setDisplayName] =
    useState('');

  const [password, setPassword] =
    useState('');

  const [authMode, setAuthMode] =
    useState('login');

  const [emoji, setEmoji] =
    useState('😀');

  const [err, setErr] =
    useState('');

  const [busy, setBusy] =
    useState(false);

  const [token, setToken] =
    useState(null);

  const [me, setMe] =
    useState(null);

  const [connected, setConnected] =
    useState(false);


  // ===================================================
  // CHAT
  // ===================================================

  const [conversations, setConversations] =
    useState({});

  const [activeChatId, setActiveChatId] =
    useState(null);

  const [draftText, setDraftText] =
    useState('');

  const [peerTyping, setPeerTyping] =
    useState(false);

  const [showNewChat, setShowNewChat] =
    useState(false);

  const [searchQuery, setSearchQuery] =
    useState('');

  const [searchResults, setSearchResults] =
    useState([]);

  const [peekingId, setPeekingId] =
    useState(null)


  // ===================================================
  // REFS
  // ===================================================

  const socketRef =
    useRef(null);

  const typingTimeoutRef =
    useRef(null);

  const searchDebounceRef =
    useRef(null);

  const scrollRef =
    useRef(null);


  // ===================================================
  // SESSION RESTORE
  // ===================================================

  useEffect(() => {

    async function restoreSession() {

      try {

        const savedToken =
          await AsyncStorage.getItem('hole_token');

        const savedMe =
          await AsyncStorage.getItem('hole_me');

        const savedBackend =
          await AsyncStorage.getItem('hole_backend');

        if (savedBackend) {
          setBackendUrl(savedBackend);
        }

        if (savedToken && savedMe) {

          const parsedMe =
            JSON.parse(savedMe);

          setToken(savedToken);
          setMe(parsedMe);

          setScreen('home');
          setTab('chats');

        }

      } catch (e) {

        console.log(
          'SESSION RESTORE ERROR:',
          e
        );

      }

    }

    restoreSession();

  }, []);


  // ===================================================
  // API HELPER
  // ===================================================

  async function api(
    path,
    options = {}
  ) {

    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };

    if (token) {

      headers.Authorization =
        `Bearer ${token}`;

    }

    const url = `${backendUrl}${path}`;

    try {

      const response =
        await fetch(url, {
          ...options,
          headers,
        });

      if (!response.ok) {

        if (
          response.status === 401 &&
          token
        ) {

          setToken(null);
          setMe(null);
          setScreen('setup');

          await AsyncStorage.removeItem('hole_token');
          await AsyncStorage.removeItem('hole_me');

        }

        throw new Error(
          `API error: ${response.status}`
        );

      }

      const data =
        await response.json();

      return data;

    } catch (e) {

      throw e;

    }

  }


  // ===================================================
  // LOGIN
  // ===================================================

  async function handleLogin(
    email,
    password
  ) {

    setErr('');
    setBusy(true);

    try {

      const result =
        await api('/auth/login', {
          method: 'POST',
          body: JSON.stringify({
            email,
            password,
          }),
        });

      if (!result.token) {

        throw new Error(
          'No token returned'
        );

      }

      setToken(result.token);
      setMe(result.user);

      await AsyncStorage.setItem(
        'hole_token',
        result.token
      );

      await AsyncStorage.setItem(
        'hole_me',
        JSON.stringify(result.user)
      );

      setScreen('home');
      setTab('chats');

    } catch (e) {

      setErr(
        e.message ||
        'Login failed'
      );

    } finally {

      setBusy(false);

    }

  }


  // ===================================================
  // REGISTER / EMAIL OTP
  // ===================================================

  async function handleSendCode(
    email
  ) {

    setErr('');
    setBusy(true);

    try {

      const result =
        await api('/auth/send-code', {
          method: 'POST',
          body: JSON.stringify({
            email,
          }),
        });

      setVerifiedEmail(email);
      setEmailVerified(true);
      setCode('');

    } catch (e) {

      setErr(
        e.message ||
        'Failed to send code'
      );

    } finally {

      setBusy(false);

    }

  }

  async function handleVerifyCode(
    email,
    code
  ) {

    setErr('');
    setBusy(true);

    try {

      const result =
        await api('/auth/verify-code', {
          method: 'POST',
          body: JSON.stringify({
            email,
            code,
          }),
        });

      setVerifiedEmail(email);
      setScreen('profile');

    } catch (e) {

      setErr(
        e.message ||
        'Code verification failed'
      );

    } finally {

      setBusy(false);

    }

  }

  async function handleRegister(
    email,
    username,
    displayName,
    password,
    emoji
  ) {

    setErr('');
    setBusy(true);

    try {

      const result =
        await api('/auth/register', {
          method: 'POST',
          body: JSON.stringify({
            email,
            username,
            displayName,
            password,
            emoji,
          }),
        });

      setToken(result.token);
      setMe(result.user);

      await AsyncStorage.setItem(
        'hole_token',
        result.token
      );

      await AsyncStorage.setItem(
        'hole_me',
        JSON.stringify(result.user)
      );

      setScreen('home');
      setTab('chats');

    } catch (e) {

      setErr(
        e.message ||
        'Registration failed'
      );

    } finally {

      setBusy(false);

    }

  }


  // ===================================================
  // SEARCH
  // ===================================================

  async function handleSearch(
    query
  ) {

    if (!query.trim()) {

      setSearchResults([]);
      return;

    }

    clearTimeout(searchDebounceRef.current);

    searchDebounceRef.current =
      setTimeout(async () => {

        try {

          const results =
            await api(
              `/users?query=${encodeURIComponent(query)}`
            );

          setSearchResults(
            results || []
          );

        } catch (e) {

          console.log(
            'Search error:',
            e
          );

        }

      }, 300);

  }

  async function startChat(user) {

    try {

      const result =
        await api('/chats', {
          method: 'POST',
          body: JSON.stringify({
            peerId: user.id,
          }),
        });

      setShowNewChat(false);
      setSearchQuery('');
      setSearchResults([]);

      setActiveChatId(result.id);
      setScreen('chat');

    } catch (e) {

      setErr(
        e.message ||
        'Failed to start chat'
      );

    }

  }


  // ===================================================
  // SOCKET.IO
  // ===================================================

  useEffect(() => {

    if (!token || !me) {
      return;
    }

    const socket =
      io(backendUrl, {
        auth: {
          token,
        },
      });

    socketRef.current = socket;

    socket.on('connect', () => {

      setConnected(true);

      socket.emit('presence', {
        status: 'online',
      });

    });

    socket.on('disconnect', () => {

      setConnected(false);

    });

    socket.on('message', (data) => {

      setConversations(prev => {

        const chatId = data.chatId;
        const chat = prev[chatId] || {
          id: chatId,
          peer: data.peer,
          messages: [],
        };

        return {
          ...prev,
          [chatId]: {
            ...chat,
            messages: [
              ...chat.messages,
              data,
            ],
          },
        };

      });

    });

    socket.on('typing', (data) => {

      if (
        data.chatId === activeChatId
      ) {

        setPeerTyping(true);

        setTimeout(() => {

          setPeerTyping(false);

        }, 3000);

      }

    });

    socket.on('load-chats', (data) => {

      const chats = {};

      (data || []).forEach(chat => {

        chats[chat.id] = {
          ...chat,
          messages: chat.messages || [],
        };

      });

      setConversations(chats);

    });

    return () => {

      socket.disconnect();

    };

  }, [token, me, backendUrl, activeChatId]);


  // ===================================================
  // MESSAGE LIFECYCLE
  // ===================================================

  useEffect(() => {

    const timers = {};

    Object.values(conversations).forEach(chat => {

      (chat.messages || []).forEach(msg => {

        if (
          msg.expiresAt &&
          !timers[msg.id]
        ) {

          const timeLeft =
            new Date(msg.expiresAt) -
            Date.now();

          if (timeLeft > 0) {

            timers[msg.id] =
              setTimeout(() => {

                setConversations(prev => {

                  const updated = {
                    ...prev,
                  };

                  Object.keys(updated).forEach(
                    key => {

                      updated[key] = {
                        ...updated[key],
                        messages: (
                          updated[key]
                            .messages || []
                        ).filter(m =>
                          m.id !== msg.id
                        ),
                      };

                    }
                  );

                  return updated;

                });

              }, timeLeft);

          }

        }

      });

    });

    return () => {

      Object.values(timers).forEach(
        t => clearTimeout(t)
      );

    };

  }, [conversations]);


  // ===================================================
  // SEND MESSAGE
  // ===================================================

  function sendMessage() {

    if (
      !draftText.trim() ||
      !socketRef.current
    ) {

      return;

    }

    socketRef.current.emit('message', {
      chatId: activeChatId,
      text: draftText,
    });

    setDraftText('');

  }

  function handleTyping() {

    if (socketRef.current) {

      socketRef.current.emit('typing', {
        chatId: activeChatId,
      });

    }

  }


  // ===================================================
  // LOGOUT
  // ===================================================

  async function logout() {

    setToken(null);
    setMe(null);
    setConversations({});
    setActiveChatId(null);
    setTab('chats');
    setScreen('setup');

    await AsyncStorage.removeItem('hole_token');
    await AsyncStorage.removeItem('hole_me');

    if (socketRef.current) {

      socketRef.current.disconnect();

    }

  }


  // ===================================================
  // SETUP / LOGIN SCREEN
  // ===================================================

  if (screen === 'setup') {

    return (

      <SafeAreaView
        style={styles.safe}
      >

        <StatusBar style="light" />

        <ScrollView
          contentContainerStyle={
            styles.authContainer
          }
          keyboardShouldPersistTaps="handled"
        >

          <View
            style={styles.authLogoBox}
          >

            <Text
              style={styles.authLogoText}
            >
              H
            </Text>

            <View
              style={styles.authLogoRing}
            />

            <Text
              style={styles.authLogoText}
            >
              LE
            </Text>

          </View>

          <Text
            style={styles.authTitle}
          >
            Welcome to Hole
          </Text>

          <Text
            style={styles.authSubtitle}
          >
            Simple communication.
            Temporary messages.
          </Text>

          {err && (
            <View
              style={styles.errorBox}
            >

              <Text
                style={styles.errorText}
              >
                {err}
              </Text>

            </View>
          )}

          {authMode === 'login' ? (

            <>

              <TextInput
                style={styles.input}
                placeholder="Email"
                placeholderTextColor={SUB}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                editable={!busy}
              />

              <TextInput
                style={styles.input}
                placeholder="Password"
                placeholderTextColor={SUB}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                editable={!busy}
              />

              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  busy && styles.buttonDisabled,
                ]}
                onPress={() =>
                  handleLogin(email, password)
                }
                disabled={busy}
              >

                <Text
                  style={styles.primaryButtonText}
                >
                  {busy ? 'Logging in...' : 'Log In'}
                </Text>

              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => {
                  setAuthMode('register');
                  setErr('');
                }}
                disabled={busy}
              >

                <Text
                  style={styles.secondaryButtonText}
                >
                  Create an account
                </Text>

              </TouchableOpacity>

            </>

          ) : (

            <>

              <TextInput
                style={styles.input}
                placeholder="Email"
                placeholderTextColor={SUB}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                editable={!busy}
              />

              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  busy && styles.buttonDisabled,
                ]}
                onPress={() =>
                  handleSendCode(email)
                }
                disabled={busy}
              >

                <Text
                  style={styles.primaryButtonText}
                >
                  {busy
                    ? 'Sending...'
                    : 'Send Verification Code'}
                </Text>

              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => {
                  setAuthMode('login');
                  setErr('');
                }}
                disabled={busy}
              >

                <Text
                  style={styles.secondaryButtonText}
                >
                  Back to Log In
                </Text>

              </TouchableOpacity>

            </>

          )}

        </ScrollView>

      </SafeAreaView>

    );

  }


  // ===================================================
  // VERIFY EMAIL CODE
  // ===================================================

  if (screen === 'verify') {

    return (

      <SafeAreaView
        style={styles.safe}
      >

        <StatusBar style="light" />

        <ScrollView
          contentContainerStyle={
            styles.authContainer
          }
          keyboardShouldPersistTaps="handled"
        >

          <View
            style={styles.authLogoBox}
          >

            <Text
              style={styles.authLogoText}
            >
              H
            </Text>

            <View
              style={styles.authLogoRing}
            />

            <Text
              style={styles.authLogoText}
            >
              LE
            </Text>

          </View>

          <Text
            style={styles.authTitle}
          >
            Verify Email
          </Text>

          <Text
            style={styles.authSubtitle}
          >
            We sent a code to {verifiedEmail}
          </Text>

          {err && (
            <View
              style={styles.errorBox}
            >

              <Text
                style={styles.errorText}
              >
                {err}
              </Text>

            </View>
          )}

          <TextInput
            style={[
              styles.input,
              styles.codeInput,
            ]}
            placeholder="000000"
            placeholderTextColor={SUB}
            value={code}
            onChangeText={setCode}
            keyboardType="numeric"
            maxLength={6}
            editable={!busy}
          />

          <TouchableOpacity
            style={[
              styles.primaryButton,
              busy && styles.buttonDisabled,
            ]}
            onPress={() =>
              handleVerifyCode(
                verifiedEmail,
                code
              )
            }
            disabled={busy}
          >

            <Text
              style={styles.primaryButtonText}
            >
              {busy
                ? 'Verifying...'
                : 'Verify Code'}
            </Text>

          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => {
              setScreen('setup');
              setErr('');
            }}
            disabled={busy}
          >

            <Text
              style={styles.secondaryButtonText}
            >
              Back
            </Text>

          </TouchableOpacity>

        </ScrollView>

      </SafeAreaView>

    );

  }


  // ===================================================
  // PROFILE SETUP
  // ===================================================

  if (screen === 'profile') {

    return (

      <SafeAreaView
        style={styles.safe}
      >

        <StatusBar style="light" />

        <ScrollView
          contentContainerStyle={
            styles.authContainer
          }
          keyboardShouldPersistTaps="handled"
        >

          <View
            style={styles.profileEmojiBox}
          >

            <Text
              style={styles.profileEmoji}
            >
              {emoji}
            </Text>

          </View>

          <Text
            style={styles.authTitle}
          >
            Create your profile
          </Text>

          <Text
            style={styles.authSubtitle}
          >
            Choose your avatar and details
          </Text>

          {err && (
            <View
              style={styles.errorBox}
            >

              <Text
                style={styles.errorText}
              >
                {err}
              </Text>

            </View>
          )}

          <Text
            style={styles.emojiLabel}
          >
            Choose an emoji
          </Text>

          <View
            style={styles.emojiGrid}
          >

            {EMOJI_CHOICES.map(e => (

              <TouchableOpacity
                key={e}
                style={[
                  styles.emojiItem,
                  emoji === e &&
                    styles.emojiItemActive,
                ]}
                onPress={() => setEmoji(e)}
              >

                <Text
                  style={styles.emojiText}
                >
                  {e}
                </Text>

              </TouchableOpacity>

            ))}

          </View>

          <TextInput
            style={styles.input}
            placeholder="Username"
            placeholderTextColor={SUB}
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            editable={!busy}
          />

          <TextInput
            style={styles.input}
            placeholder="Display Name"
            placeholderTextColor={SUB}
            value={displayName}
            onChangeText={setDisplayName}
            editable={!busy}
          />

          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor={SUB}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            editable={!busy}
          />

          <TouchableOpacity
            style={[
              styles.primaryButton,
              busy && styles.buttonDisabled,
            ]}
            onPress={() =>
              handleRegister(
                verifiedEmail,
                username,
                displayName,
                password,
                emoji
              )
            }
            disabled={busy}
          >

            <Text
              style={styles.primaryButtonText}
            >
              {busy
                ? 'Creating...'
                : 'Create Account'}
            </Text>

          </TouchableOpacity>

        </ScrollView>

      </SafeAreaView>

    );

  }


  // ===================================================
  // CHAT SCREEN
  // ===================================================

  if (screen === 'chat') {

    const chat =
      conversations[activeChatId];

    const messages =
      chat?.messages || [];

    const peer =
      chat?.peer;

    return (

      <SafeAreaView
        style={styles.safe}
      >

        <StatusBar style="light" />

        <View
          style={styles.chatContainer}
        >

          <View
            style={styles.chatHeader}
          >

            <TouchableOpacity
              onPress={() =>
                setScreen('home')
              }
              style={styles.chatBackButton}
            >

              <Text
                style={styles.chatBackText}
              >
                ‹
              </Text>

            </TouchableOpacity>

            <View
              style={{ flex: 1 }}
            >

              <Text
                style={styles.chatTitle}
              >
                {peer?.displayName ||
                  peer?.username ||
                  'User'}
              </Text>

              <Text
                style={styles.chatStatus}
              >
                {peerTyping
                  ? 'typing...'
                  : 'Online'}
              </Text>

            </View>

            <View
              style={styles.chatAvatar}
            >

              <Text
                style={{
                  fontSize: 20,
                }}
              >
                {peer?.emoji || '😀'}
              </Text>

            </View>

          </View>

          <FlatList
            ref={scrollRef}
            data={messages}
            keyExtractor={item =>
              item.id || Math.random()
            }
            onContentSizeChange={() =>
              scrollRef.current
                ?.scrollToEnd()
            }
            renderItem={({ item }) => {

              const isOwn =
                item.senderId ===
                me?.id;

              const expiredPercent =
                item.expiresAt
                  ? Math.max(
                      0,
                      Math.min(
                        100,
                        (
                          (new Date(
                            item.expiresAt
                          ) - Date.now()) /
                          MESSAGE_LIFETIME
                        ) * 100
                      )
                    )
                  : 0;

              return (

                <View
                  key={item.id}
                  style={[
                    styles.messageRow,
                    isOwn &&
                      styles.messageRowOwn,
                  ]}
                >

                  <View
                    style={[
                      styles.messageBubble,
                      isOwn &&
                        styles.messageBubbleOwn,
                    ]}
                  >

                    <Text
                      style={[
                        styles.messageText,
                        isOwn &&
                          styles.messageTextOwn,
                      ]}
                    >
                      {item.text}
                    </Text>

                    {item.expiresAt && (
                      <View
                        style={[
                          styles.expireBar,
                          {
                            width: `${expiredPercent}%`,
                          },
                          isOwn &&
                            styles.expireBarOwn,
                        ]}
                      />
                    )}

                  </View>

                </View>

              );

            }}
            contentContainerStyle={
              styles.messagesList
            }
            style={styles.messagesArea}
          />

          <KeyboardAvoidingView
            behavior={
              Platform.OS === 'ios'
                ? 'padding'
                : 'height'
            }
            style={styles.inputBox}
          >

            <TextInput
              style={styles.messageInput}
              placeholder="Type a message..."
              placeholderTextColor={SUB}
              value={draftText}
              onChangeText={text => {

                setDraftText(text);
                handleTyping();

              }}
              multiline
              editable={connected}
            />

            <TouchableOpacity
              style={[
                styles.sendButton,
                (!draftText.trim() ||
                  !connected) &&
                  styles.sendButtonDisabled,
              ]}
              onPress={sendMessage}
              disabled={
                !draftText.trim() ||
                !connected
              }
            >

              <Text
                style={styles.sendButtonText}
              >
                Send
              </Text>

            </TouchableOpacity>

          </KeyboardAvoidingView>

        </View>

      </SafeAreaView>

    );

  }


  // ===================================================
  // HOME SCREEN
  // ===================================================

  if (screen === 'home') {

    const chatList =
      Object.values(
        conversations
      );

    return (

      <SafeAreaView
        style={styles.safe}
      >

        <StatusBar style="light" />

        <View
          style={styles.screen}
        >

          <View
            style={styles.topbar}
          >

            <View>

              <Text
                style={styles.brandTitle}
              >
                Hole
              </Text>

              <Text
                style={styles.connectionText}
              >
                {connected
                  ? '🟢 Connected'
                  : '🔴 Connecting...'}
              </Text>

            </View>

            <TouchableOpacity
              style={styles.newChatButton}
              onPress={() =>
                setShowNewChat(true)
              }
            >

              <Text
                style={styles.newChatButtonText}
              >
                +
              </Text>

            </TouchableOpacity>

          </View>

          {chatList.length === 0 ? (

            <View
              style={styles.emptyState}
            >

              <Text
                style={styles.emptyLogo}
              >
                H◯LE
              </Text>

              <Text
                style={styles.emptyTitle}
              >
                No conversations yet
              </Text>

              <Text
                style={styles.emptySubtitle}
              >
                Find someone and start
                a conversation.
              </Text>

              <TouchableOpacity
                style={styles.emptyButton}
                onPress={() =>
                  setShowNewChat(true)
                }
              >

                <Text
                  style={styles.emptyButtonText}
                >
                  + New Chat
                </Text>

              </TouchableOpacity>

            </View>

          ) : (

            <FlatList
              data={chatList}
              keyExtractor={item =>
                item.id
              }
              renderItem={({ item }) => {

                const last =
                  item.messages?.[
                    item.messages.length -
                    1
                  ];

                return (

                  <TouchableOpacity
                    style={styles.chatItem}
                    onPress={() => {

                      setActiveChatId(
                        item.id
                      );

                      setScreen('chat');

                    }}
                  >

                    <View
                      style={styles.chatItemAvatar}
                    >

                      <Text
                        style={{
                          fontSize: 22,
                        }}
                      >
                        {item.peer
                          ?.emoji || '😀'}
                      </Text>

                    </View>

                    <View
                      style={{
                        flex: 1,
                      }}
                    >

                      <Text
                        style={styles.chatItemName}
                      >
                        {item.peer
                          ?.displayName ||
                          item.peer
                          ?.username ||
                          'User'}
                      </Text>

                      <Text
                        style={styles.chatItemPreview}
                        numberOfLines={1}
                      >
                        {last?.text ||
                          'No messages yet'}
                      </Text>

                    </View>

                  </TouchableOpacity>

                );

              }}
              contentContainerStyle={
                styles.chatsList
              }
            />

          )}

          {/* NEW CHAT MODAL */}

          {showNewChat ? (

            <View
              style={styles.modalOverlay}
            >

              <View
                style={styles.modal}
              >

                <View
                  style={styles.modalHeader}
                >

                  <Text
                    style={styles.modalTitle}
                  >
                    Start a new chat
                  </Text>

                  <TouchableOpacity
                    onPress={() => {

                      setShowNewChat(
                        false
                      );

                      setSearchQuery('');
                      setSearchResults([]);

                    }}
                    style={
                      styles.modalCloseButton
                    }
                  >

                    <Text
                      style={styles.modalCloseText}
                    >
                      ✕
                    </Text>

                  </TouchableOpacity>

                </View>

                <TextInput
                  style={styles.searchInput}
                  placeholder="Search for a user..."
                  placeholderTextColor={SUB}
                  value={searchQuery}
                  onChangeText={query => {

                    setSearchQuery(query);
                    handleSearch(query);

                  }}
                  autoFocus
                />

                <FlatList
                  data={searchResults}
                  keyExtractor={item =>
                    item.id
                  }
                  renderItem={({ item }) => (

                    <TouchableOpacity
                      style={
                        styles.userResultItem
                      }
                      onPress={() =>
                        startChat(item)
                      }
                    >

                      <View
                        style={
                          styles.userResultAvatar
                        }
                      >

                        <Text
                          style={{
                            fontSize: 20,
                          }}
                        >
                          {item.emoji ||
                            '😀'}
                        </Text>

                      </View>

                      <View>

                        <Text
                          style={
                            styles.userResultName
                          }
                        >
                          {item
                            .displayName ||
                            item.username}
                        </Text>

                        <Text
                          style={
                            styles.userResultHandle
                          }
                        >
                          @{item.username}
                        </Text>

                      </View>

                    </TouchableOpacity>

                  )}
                  scrollEnabled={false}
                  ListEmptyComponent={
                    searchQuery ? (

                      <Text
                        style={
                          styles.noResults
                        }
                      >
                        No users found
                      </Text>

                    ) : (

                      <Text
                        style={
                          styles.noResults
                        }
                      >
                        Search for users...
                      </Text>

                    )
                  }
                />

              </View>

            </View>

          ) : null}

          {/* BOTTOM NAV */}

          <BottomNav
            tab={tab}
            onChange={setTab}
          />

        </View>

      </SafeAreaView>

    );

  }


  // ===================================================
  // CALLS SCREEN
  // ===================================================

  if (screen === 'calls') {

    return (

      <SafeAreaView
        style={styles.safe}
      >

        <StatusBar style="light" />

        <View
          style={styles.screen}
        >

          <View
            style={styles.topbar}
          >

            <View>

              <Text
                style={styles.brandTitle}
              >
                Calls
              </Text>

              <Text
                style={styles.connectionText}
              >
                Active and recent calls
              </Text>

            </View>

          </View>

          <View
            style={styles.emptyState}
          >

            <Text
              style={styles.emptyLogo}
            >
              📞
            </Text>

            <Text
              style={styles.emptyTitle}
            >
              No calls yet
            </Text>

            <Text
              style={styles.emptySubtitle}
            >
              Start a call from a chat
            </Text>

          </View>

          <BottomNav
            tab={tab}
            onChange={setTab}
          />

        </View>

      </SafeAreaView>

    );

  }


  // ===================================================
  // PROFILE/SETTINGS SCREEN
  // ===================================================

  if (screen === 'profile-tab') {

    return (

      <SafeAreaView
        style={styles.safe}
      >

        <StatusBar style="light" />

        <View
          style={styles.screen}
        >

          <View
            style={styles.topbar}
          >

            <View>

              <Text
                style={styles.brandTitle}
              >
                Settings
              </Text>

              <Text
                style={styles.connectionText}
              >
                Account settings
              </Text>

            </View>

          </View>

          <ScrollView
            contentContainerStyle={
              styles.settingsScroll
            }
          >

            <View
              style={styles.settingsCard}
            >

              <View
                style={styles.profileInfo}
              >

                <View
                  style={styles.profileAvatar}
                >

                  <Text
                    style={{
                      fontSize: 32,
                    }}
                  >
                    {me?.emoji || '😀'}
                  </Text>

                </View>

                <View>

                  <Text
                    style={styles.profileName}
                  >
                    {me?.displayName ||
                      me?.username ||
                      'User'}
                  </Text>

                  <Text
                    style={styles.profileHandle}
                  >
                    @{me?.username}
                  </Text>

                </View>

              </View>

            </View>

            <Text
              style={styles.sectionTitle}
            >
              Profile
            </Text>

            <View
              style={styles.settingsCard}
            >

              <SettingsRow
                title="Display Name"
                subtitle={
                  me?.displayName ||
                  'Not set'
                }
              />

              <View
                style={styles.divider}
              />

              <SettingsRow
                title="Username"
                subtitle={me?.username}
              />

              <View
                style={styles.divider}
              />

              <SettingsRow
                title="Avatar Emoji"
                subtitle={me?.emoji}
              />

            </View>

            <Text
              style={styles.sectionTitle}
            >
              Security
            </Text>

            <View
              style={styles.settingsCard}
            >

              <SettingsRow
                icon="🔐"
                title="Change password"
                subtitle="Update your password"
              />

              <View
                style={styles.divider}
              />

              <SettingsRow
                icon="🔑"
                title="Two-factor auth"
                subtitle="Protect your account"
              />

            </View>

            <Text
              style={styles.sectionTitle}
            >
              Privacy
            </Text>

            <View
              style={styles.settingsCard}
            >

              <SettingsRow
                icon="👁️"
                title="Privacy settings"
                subtitle="Control who can find you"
              />

              <View
                style={styles.divider}
              />

              <SettingsRow
                icon="🚫"
                title="Blocked users"
                subtitle="Manage blocked users"
              />

            </View>

            <Text
              style={styles.sectionTitle}
            >
              Danger Zone
            </Text>

            <TouchableOpacity
              style={styles.dangerCard}
              onPress={logout}
            >

              <Text
                style={styles.dangerCardText}
              >
                Log Out
              </Text>

            </TouchableOpacity>

            <View
              style={{ height: 100 }}
            />

          </ScrollView>

          <BottomNav
            tab={tab}
            onChange={newTab => {

              if (newTab === 'chats') {

                setScreen('home');

              } else if (newTab === 'calls') {

                setScreen('calls');

              } else if (newTab === 'settings') {

                setScreen('profile-tab');

              }

              setTab(newTab);

            }}
          />

        </View>

      </SafeAreaView>

    );

  }


  // ===================================================
  // FALLBACK
  // ===================================================

  return (

    <SafeAreaView
      style={styles.safe}
    >

      <Text
        style={{
          color: WHITE,
          padding: 20,
        }}
      >
        Hole
      </Text>

    </SafeAreaView>

  );

}


// =====================================================
// SETTINGS ROW
// =====================================================

function SettingsRow({
  icon,
  title,
  subtitle,
  onPress,
}) {

  return (

    <TouchableOpacity
      style={styles.settingsRow}
      onPress={onPress}
    >

      {icon && (

        <Text
          style={styles.settingsIcon}
        >
          {icon}
        </Text>

      )}

      <View
        style={{
          flex: 1,
          marginLeft: icon ? 12 : 0,
        }}
      >

        <Text
          style={styles.settingsRowTitle}
        >
          {title}
        </Text>

        <Text
          style={styles.settingsRowSub}
        >
          {subtitle}
        </Text>

      </View>

      <Text
        style={styles.settingsArrow}
      >
        ›
      </Text>

    </TouchableOpacity>

  );

}


// =====================================================
// BOTTOM NAV
// =====================================================

function BottomNav({
  tab,
  onChange,
}) {

  const items = [

    {
      key: 'chats',
      label: 'Chats',
      ico: 'CHAT',
    },

    {
      key: 'calls',
      label: 'Calls',
      ico: 'CALL',
    },

    {
      key: 'settings',
      label: 'Settings',
      ico: 'SET',
    },

  ];

  return (

    <View
      style={styles.bottomNav}
    >

      {items.map(item => (

        <TouchableOpacity
          key={item.key}
          style={styles.navItem}
          onPress={() =>
            onChange(item.key)
          }
        >

          <Text
            style={[
              styles.navIcon,

              tab === item.key &&
                styles.navIconActive,
            ]}
          >
            {item.ico}
          </Text>

          <Text
            style={[
              styles.navLabel,

              tab === item.key &&
                styles.navLabelActive,
            ]}
          >
            {item.label}
          </Text>

        </TouchableOpacity>

      ))}

    </View>

  );

}


// =====================================================
// STYLES
// =====================================================

const styles =
  StyleSheet.create({

    safe: {
      flex: 1,
      backgroundColor: BG,
    },


    screen: {
      flex: 1,
      backgroundColor: BG,
    },


    // ===============================================
    // TOPBAR
    // ===============================================

    topbar: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: HAIR,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },

    brandTitle: {
      color: WHITE,
      fontSize: 20,
      fontWeight: '700',
      marginBottom: 4,
    },

    connectionText: {
      color: SUB,
      fontSize: 12,
      fontWeight: '400',
    },

    newChatButton: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: SURFACE2,
      alignItems: 'center',
      justifyContent: 'center',
    },

    newChatButtonText: {
      color: WHITE,
      fontSize: 24,
      fontWeight: '600',
    },


    // ===============================================
    // AUTH
    // ===============================================

    authContainer: {
      flexGrow: 1,
      padding: 20,
      paddingTop: 40,
      paddingBottom: 40,
      justifyContent: 'center',
    },

    authLogoBox: {
      width: 60,
      height: 60,
      borderRadius: 30,
      borderWidth: 2,
      borderColor: HAIR,
      backgroundColor: SURFACE,
      alignSelf: 'center',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      marginBottom: 24,
    },

    authLogoText: {
      color: WHITE,
      fontSize: 18,
      fontWeight: '700',
      letterSpacing: -1,
    },

    authLogoRing: {
      width: 12,
      height: 12,
      borderRadius: 6,
      borderWidth: 1.5,
      borderColor: WHITE,
      marginHorizontal: 3,
    },

    authTitle: {
      color: WHITE,
      fontSize: 24,
      fontWeight: '700',
      textAlign: 'center',
      marginBottom: 8,
    },

    authSubtitle: {
      color: SUB,
      fontSize: 14,
      lineHeight: 20,
      textAlign: 'center',
      marginBottom: 24,
    },


    // ===============================================
    // INPUTS
    // ===============================================

    input: {
      backgroundColor: SURFACE,
      borderWidth: 1,
      borderColor: HAIR,
      borderRadius: 10,
      color: WHITE,
      fontSize: 14,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginBottom: 12,
    },

    codeInput: {
      textAlign: 'center',
      letterSpacing: 4,
      fontSize: 16,
      fontWeight: '600',
    },


    // ===============================================
    // BUTTONS
    // ===============================================

    primaryButton: {
      backgroundColor: WHITE,
      borderRadius: 10,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 4,
      marginBottom: 12,
    },

    primaryButtonText: {
      color: BLACK_FIX,
      fontSize: 14,
      fontWeight: '600',
    },

    buttonDisabled: {
      opacity: 0.5,
    },

    secondaryButton: {
      borderWidth: 1,
      borderColor: HAIR,
      borderRadius: 10,
      paddingVertical: 13,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    },

    secondaryButtonText: {
      color: WHITE,
      fontSize: 14,
      fontWeight: '500',
    },


    // ===============================================
    // PROFILE SETUP
    // ===============================================

    profileEmojiBox: {
      width: 80,
      height: 80,
      borderRadius: 20,
      backgroundColor: SURFACE,
      alignSelf: 'center',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 20,
    },

    profileEmoji: {
      fontSize: 40,
    },

    emojiLabel: {
      color: WHITE,
      fontSize: 12,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginVertical: 16,
      marginLeft: 4,
    },

    emojiGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 16,
      justifyContent: 'center',
    },

    emojiItem: {
      width: '22%',
      aspectRatio: 1,
      borderRadius: 10,
      backgroundColor: SURFACE,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: 'transparent',
    },

    emojiItemActive: {
      borderColor: ACCENT,
      backgroundColor: SURFACE2,
    },

    emojiText: {
      fontSize: 28,
    },


    // ===============================================
    // ERROR
    // ===============================================

    errorBox: {
      backgroundColor: 'rgba(255,69,58,0.08)',
      borderWidth: 1,
      borderColor: 'rgba(255,69,58,0.25)',
      borderRadius: 10,
      padding: 12,
      marginBottom: 16,
    },

    errorText: {
      color: RED,
      fontSize: 13,
      fontWeight: '500',
    },


    // ===============================================
    // EMPTY STATE
    // ===============================================

    emptyState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    },

    emptyLogo: {
      fontSize: 48,
      fontWeight: '700',
      color: SUB,
      marginBottom: 16,
      letterSpacing: -2,
    },

    emptyTitle: {
      color: WHITE,
      fontSize: 20,
      fontWeight: '600',
      marginBottom: 8,
      textAlign: 'center',
    },

    emptySubtitle: {
      color: SUB,
      fontSize: 14,
      textAlign: 'center',
      marginBottom: 20,
    },

    emptyButton: {
      backgroundColor: WHITE,
      borderRadius: 10,
      paddingVertical: 12,
      paddingHorizontal: 20,
    },

    emptyButtonText: {
      color: BLACK_FIX,
      fontSize: 14,
      fontWeight: '600',
    },


    // ===============================================
    // CHATS LIST
    // ===============================================

    chatsList: {
      paddingHorizontal: 12,
      paddingVertical: 8,
    },

    chatItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginVertical: 4,
      borderRadius: 12,
      backgroundColor: SURFACE,
      gap: 12,
    },

    chatItemAvatar: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: SURFACE2,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },

    chatItemName: {
      color: WHITE,
      fontSize: 15,
      fontWeight: '600',
      marginBottom: 2,
    },

    chatItemPreview: {
      color: SUB,
      fontSize: 13,
    },


    // ===============================================
    // CHAT SCREEN
    // ===============================================

    chatContainer: {
      flex: 1,
      backgroundColor: BG,
    },

    chatHeader: {
      paddingHorizontal: 12,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: HAIR,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },

    chatBackButton: {
      width: 40,
      height: 40,
      borderRadius: 8,
      backgroundColor: SURFACE,
      alignItems: 'center',
      justifyContent: 'center',
    },

    chatBackText: {
      color: WHITE,
      fontSize: 24,
      fontWeight: '600',
    },

    chatTitle: {
      color: WHITE,
      fontSize: 16,
      fontWeight: '600',
    },

    chatStatus: {
      color: SUB,
      fontSize: 12,
    },

    chatAvatar: {
      width: 40,
      height: 40,
      borderRadius: 8,
      backgroundColor: SURFACE2,
      alignItems: 'center',
      justifyContent: 'center',
    },


    // ===============================================
    // MESSAGES
    // ===============================================

    messagesArea: {
      flex: 1,
      backgroundColor: BG,
    },

    messagesList: {
      paddingHorizontal: 12,
      paddingVertical: 12,
    },

    messageRow: {
      marginVertical: 6,
      flexDirection: 'row',
      justifyContent: 'flex-start',
    },

    messageRowOwn: {
      justifyContent: 'flex-end',
    },

    messageBubble: {
      maxWidth: '75%',
      backgroundColor: SURFACE,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },

    messageBubbleOwn: {
      backgroundColor: WHITE,
    },

    messageText: {
      color: WHITE,
      fontSize: 14,
      lineHeight: 18,
    },

    messageTextOwn: {
      color: BLACK_FIX,
    },

    expireBar: {
      height: 2,
      backgroundColor: 'rgba(255,255,255,0.3)',
      borderRadius: 1,
      marginTop: 6,
    },

    expireBarOwn: {
      backgroundColor: 'rgba(0,0,0,0.2)',
    },


    // ===============================================
    // INPUT BOX
    // ===============================================

    inputBox: {
      paddingHorizontal: 12,
      paddingVertical: 12,
      borderTopWidth: 1,
      borderTopColor: HAIR,
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 8,
    },

    messageInput: {
      flex: 1,
      backgroundColor: SURFACE,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: HAIR,
      color: WHITE,
      fontSize: 14,
      paddingHorizontal: 12,
      paddingVertical: 10,
      maxHeight: 100,
    },

    sendButton: {
      backgroundColor: WHITE,
      borderRadius: 10,
      paddingHorizontal: 16,
      paddingVertical: 10,
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 60,
    },

    sendButtonDisabled: {
      opacity: 0.4,
    },

    sendButtonText: {
      color: BLACK_FIX,
      fontSize: 14,
      fontWeight: '600',
    },


    // ===============================================
    // MODAL
    // ===============================================

    modalOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.8)',
      justifyContent: 'flex-end',
      zIndex: 1000,
    },

    modal: {
      backgroundColor: SURFACE,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 24,
      maxHeight: '85%',
    },

    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },

    modalTitle: {
      color: WHITE,
      fontSize: 18,
      fontWeight: '600',
    },

    modalCloseButton: {
      width: 32,
      height: 32,
      borderRadius: 8,
      backgroundColor: SURFACE2,
      alignItems: 'center',
      justifyContent: 'center',
    },

    modalCloseText: {
      color: SUB,
      fontSize: 18,
      fontWeight: '600',
    },

    searchInput: {
      backgroundColor: SURFACE2,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: HAIR,
      color: WHITE,
      fontSize: 14,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 12,
    },


    // ===============================================
    // SEARCH RESULTS
    // ===============================================

    userResultItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginVertical: 4,
      borderRadius: 10,
      backgroundColor: SURFACE2,
      gap: 12,
    },

    userResultAvatar: {
      width: 40,
      height: 40,
      borderRadius: 10,
      backgroundColor: HAIR,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },

    userResultName: {
      color: WHITE,
      fontSize: 14,
      fontWeight: '600',
    },

    userResultHandle: {
      color: SUB,
      fontSize: 12,
      marginTop: 2,
    },

    noResults: {
      color: SUB,
      fontSize: 14,
      textAlign: 'center',
      marginVertical: 20,
    },


    // ===============================================
    // SETTINGS
    // ===============================================

    settingsScroll: {
      paddingHorizontal: 12,
      paddingVertical: 16,
    },

    settingsCard: {
      backgroundColor: SURFACE,
      borderRadius: 12,
      marginBottom: 12,
      overflow: 'hidden',
    },

    profileInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      gap: 16,
    },

    profileAvatar: {
      width: 56,
      height: 56,
      borderRadius: 14,
      backgroundColor: SURFACE2,
      alignItems: 'center',
      justifyContent: 'center',
    },

    profileName: {
      color: WHITE,
      fontSize: 16,
      fontWeight: '600',
      marginBottom: 4,
    },

    profileHandle: {
      color: SUB,
      fontSize: 13,
    },

    sectionTitle: {
      color: SUB,
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginVertical: 12,
      marginLeft: 4,
    },

    settingsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 14,
      gap: 12,
    },

    settingsIcon: {
      fontSize: 20,
    },

    settingsRowTitle: {
      color: WHITE,
      fontSize: 14,
      fontWeight: '600',
      marginBottom: 2,
    },

    settingsRowSub: {
      color: SUB,
      fontSize: 12,
    },

    settingsArrow: {
      color: SUB,
      fontSize: 18,
      fontWeight: '600',
    },

    divider: {
      height: 1,
      backgroundColor: HAIR,
      marginHorizontal: 16,
    },

    dangerCard: {
      backgroundColor: 'rgba(255,69,58,0.1)',
      borderWidth: 1,
      borderColor: RED,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    },

    dangerCardText: {
      color: RED,
      fontSize: 14,
      fontWeight: '600',
    },


    // ===============================================
    // BOTTOM NAV
    // ===============================================

    bottomNav: {
      flexDirection: 'row',
      borderTopWidth: 1,
      borderTopColor: HAIR,
      backgroundColor: SURFACE,
      paddingBottom: 4,
    },

    navItem: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
    },

    navIcon: {
      color: SUB,
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.5,
      marginBottom: 4,
    },

    navIconActive: {
      color: WHITE,
    },

    navLabel: {
      color: SUB,
      fontSize: 11,
      fontWeight: '500',
    },

    navLabelActive: {
      color: WHITE,
    },

  });