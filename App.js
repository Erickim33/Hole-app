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

    const response =
      await fetch(
        backendUrl.replace(/\/$/, '') + path,
        {
          ...options,
          headers,
        }
      );

    const data =
      await response
        .json()
        .catch(() => ({}));

    if (!response.ok) {

      throw new Error(
        data.error ||
        data.message ||
        `Request failed (${response.status})`
      );

    }

    return data;

  }


  // ===================================================
  // LOGIN
  // ===================================================

 async function loginAccount() {

  setErr('');
  setBusy(true);

  try {

    if (!username.trim()) {
      throw new Error(
        'Username is required'
      );
    }

    if (!password) {
      throw new Error(
        'Password is required'
      );
    }

    const data =
      await api(
        '/auth/login',
        {
          method: 'POST',
          body: JSON.stringify({
            username:
              username.trim(),

            password,
          }),
        }
      );

    await finishAuth(data);

  } catch (e) {

    setErr(
      e.message ||
      'Login failed'
    );

  }

  setBusy(false);

}


  // ===================================================
  // REQUEST EMAIL OTP
  // ===================================================

  async function requestEmailOtp() {

    setErr('');
    setBusy(true);

    try {

      if (!email.trim()) {

        throw new Error(
          'Enter your email address'
        );

      }

      const cleanEmail =
        email.trim().toLowerCase();

      const r =
        await fetch(
          backendUrl.replace(/\/$/, '') +
          '/auth/request-email-otp',
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/json',
            },

            body: JSON.stringify({
              email: cleanEmail,
            }),
          }
        );

      const data =
        await r.json()
          .catch(() => ({}));

      if (!r.ok) {

        throw new Error(
          data.error ||
          'Could not send verification code'
        );

      }

      setEmail(cleanEmail);
      setScreen('verify');

    } catch (e) {

      setErr(
        e.message ||
        'Could not send verification code'
      );

    }

    setBusy(false);

  }


  // ===================================================
  // VERIFY EMAIL OTP
  // ===================================================

  async function verifyEmailAndContinue() {

    setErr('');
    setBusy(true);

    try {

      if (!email.trim()) {

        throw new Error(
          'Enter your email address'
        );

      }

      if (!code.trim()) {

        throw new Error(
          'Enter the verification code'
        );

      }

      const cleanEmail =
        email.trim().toLowerCase();

      const cleanCode =
        code.trim();

      const r =
        await fetch(
          backendUrl.replace(/\/$/, '') +
          '/auth/verify-email-otp',
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/json',
            },

            body: JSON.stringify({
              email: cleanEmail,
              code: cleanCode,
            }),
          }
        );

      const data =
        await r.json()
          .catch(() => ({}));

      if (!r.ok) {

        throw new Error(
          data.error ||
          'Invalid verification code'
        );

      }

      setEmail(cleanEmail);

      setVerifiedEmail(
        cleanEmail
      );

      setEmailVerified(true);

      console.log(
        'HOLE DEBUG: EMAIL VERIFIED SUCCESSFULLY',
        cleanEmail
      );

      setCode('');
      setErr('');

      if (data.existingAccount) {

        if (data.token && data.user) {

          await finishAuth(data);

        } else {

          setScreen('profile');

        }

      } else {

        setScreen('profile');

      }

    } catch (e) {

      setEmailVerified(false);

      setErr(
        e.message ||
        'Verification failed'
      );

    }

    setBusy(false);

  }


  // ===================================================
  // REGISTER
  // ===================================================

  async function registerAccount() {

    console.log(
      '🔥 REGISTER BUTTON FUNCTION RAN'
    );

    setErr('');
    setBusy(true);

    try {

      if (!email.trim()) {

        throw new Error(
          'Email address is required'
        );

      }

      if (!emailVerified) {

        throw new Error(
          'Please verify your email address first'
        );

      }

      if (!username.trim()) {

        throw new Error(
          'Username is required'
        );

      }

      if (!displayName.trim()) {

        throw new Error(
          'Display name is required'
        );

      }

      if (
        !password ||
        password.length < 8
      ) {

        throw new Error(
          'Password must be at least 8 characters'
        );

      }

      const cleanEmail =
        email.trim().toLowerCase();

      const cleanUsername =
        username.trim().toLowerCase();

      const cleanDisplayName =
        displayName.trim();

      console.log(
        '🔥 ABOUT TO CALL /auth/register'
      );

      const r =
        await fetch(
          backendUrl.replace(/\/$/, '') +
          '/auth/register',
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/json',
            },

            body: JSON.stringify({

              email:
                cleanEmail,

              username:
                cleanUsername,

              displayName:
                cleanDisplayName,

              password,

              emoji,

              emailVerified: true,

            }),
          }
        );

      const data =
        await r.json()
          .catch(() => ({}));

      console.log(
        'REGISTER RESPONSE:',
        r.status,
        data
      );

      if (!r.ok) {

        throw new Error(
          data.error ||
          'Registration failed'
        );

      }

      await finishAuth(data);

    } catch (e) {

      setErr(
        e.message ||
        'Registration failed'
      );

    }

    setBusy(false);

  }


  // ===================================================
  // FINISH AUTH
  // ===================================================

  async function finishAuth({
    token: tok,
    user,
  }) {

    if (!tok) {

      throw new Error(
        'Authentication succeeded but no token was returned'
      );

    }

    setToken(tok);
    setMe(user);

    setScreen('home');
    setTab('chats');
    setSettingsSection(null);

    await AsyncStorage.setItem(
      'hole_token',
      tok
    );

    await AsyncStorage.setItem(
      'hole_me',
      JSON.stringify(user)
    );

    await AsyncStorage.setItem(
      'hole_backend',
      backendUrl
    );

    connectSocket(
      tok,
      user
    );

  }


  // ===================================================
  // LOGOUT / LEAVE
  // ===================================================

  async function leaveHole() {

    try {

      if (socketRef.current) {

        socketRef.current.disconnect();

        socketRef.current =
          null;

      }

    } catch (e) {}

    await AsyncStorage.multiRemove([
      'hole_token',
      'hole_me',
    ]);

    setToken(null);
    setMe(null);

    setConversations({});
    setActiveChatId(null);

    setSettingsSection(null);

    setEmail('');
    setPassword('');
    setUsername('');
    setDisplayName('');
    setCode('');
    setEmailVerified(false);

    setScreen('setup');
    setTab('chats');

  }


  // ===================================================
  // SOCKET
  // ===================================================

  const connectSocket =
    useCallback(
      (authToken, currentUser) => {

        try {

          if (socketRef.current) {

            socketRef.current.disconnect();

          }

          const socket =
            io(backendUrl, {
              transports: ['websocket'],
              auth: {
                token: authToken,
              },
            });

          socketRef.current =
            socket;

          socket.on(
            'connect',
            () => {

              console.log(
                '🔥 SOCKET CONNECTED'
              );

              setConnected(true);

            }
          );

          socket.on(
            'disconnect',
            () => {

              console.log(
                '🔥 SOCKET DISCONNECTED'
              );

              setConnected(false);

            }
          );

          socket.on(
            'connect_error',
            error => {

              console.log(
                'SOCKET ERROR:',
                error.message
              );

              setConnected(false);

            }
          );


          // -------------------------------------------
          // Incoming message
          // -------------------------------------------

          socket.on(
            'message',
            message => {

              handleIncomingMessage(
                message
              );

            }
          );


          socket.on(
            'new_message',
            message => {

              handleIncomingMessage(
                message
              );

            }
          );


          socket.on(
            'message:new',
            message => {

              handleIncomingMessage(
                message
              );

            }
          );


          // -------------------------------------------
          // Typing
          // -------------------------------------------

          socket.on(
            'typing',
            data => {

              if (
                data &&
                data.userId !== currentUser?._id
              ) {

                setPeerTyping(true);

                clearTimeout(
                  typingTimeoutRef.current
                );

                typingTimeoutRef.current =
                  setTimeout(() => {

                    setPeerTyping(false);

                  }, 2000);

              }

            }
          );


          socket.on(
            'stop_typing',
            () => {

              setPeerTyping(false);

            }
          );
        } catch (e) {

          console.log(
            'SOCKET SETUP ERROR:',
            e
          );

        }

      },
      [backendUrl]
    );


  // ===================================================
  // CONNECT SOCKET AFTER SESSION RESTORE
  // ===================================================

  useEffect(() => {

    if (
      token &&
      me
    ) {

      connectSocket(
        token,
        me
      );

    }

    return () => {

      if (socketRef.current) {

        socketRef.current.disconnect();

      }

    };

  }, [token, me, connectSocket]);


  // ===================================================
  // HANDLE INCOMING MESSAGE
  // ===================================================

  function handleIncomingMessage(
    message
  ) {

    if (!message) {
      return;
    }

    const conversationId =
      message.conversationId ||
      message.chatId ||
      message.roomId;

    if (!conversationId) {
      return;
    }

    setConversations(prev => {

      const existing =
        prev[conversationId] || {
          id: conversationId,
          messages: [],
        };

      const exists =
        existing.messages.some(
          m =>
            String(m._id || m.id) ===
            String(message._id || message.id)
        );

      if (exists) {
        return prev;
      }

      return {

        ...prev,

        [conversationId]: {

          ...existing,

          messages: [
            ...existing.messages,
            {
              ...message,
              receivedAt:
                Date.now(),
            },
          ],

        },

      };

    });

  }


  // ===================================================
  // OPEN CHAT
  // ===================================================

  function openChat(user) {

    if (!user) {
      return;
    }

    const id =
      String(
        user._id ||
        user.id ||
        user.username
      );

    setConversations(prev => {

      if (prev[id]) {
        return prev;
      }

      return {

        ...prev,

        [id]: {

          id,

          peer: user,

          messages: [],

        },

      };

    });

    setActiveChatId(id);

    setShowNewChat(false);

    setSearchQuery('');

    setSearchResults([]);

    setScreen('chat');

  }


  // ===================================================
  // SEND MESSAGE
  // ===================================================

  async function sendMessage() {

    const text =
      draftText.trim();

    if (!text) {
      return;
    }

    if (!activeChatId) {
      return;
    }

    const chat =
      conversations[activeChatId];

    const peer =
      chat?.peer;

    if (!peer) {
      return;
    }

    const recipientId =
      peer._id ||
      peer.id;

    try {

      const socket =
        socketRef.current;

      const localMessage = {

        id:
          `local-${Date.now()}`,

        senderId:
          me?._id ||
          me?.id,

        recipientId,

        conversationId:
          activeChatId,

        text,

        createdAt:
          new Date().toISOString(),

        expiresAt:
          new Date(
            Date.now() +
            MESSAGE_LIFETIME
          ).toISOString(),

        localOnly: true,

      };


      setConversations(prev => {

        const current =
          prev[activeChatId] || {
            id: activeChatId,
            peer,
            messages: [],
          };

        return {

          ...prev,

          [activeChatId]: {

            ...current,

            peer,

            messages: [
              ...current.messages,
              localMessage,
            ],

          },

        };

      });

      setDraftText('');


      if (socket?.connected) {

        socket.emit(
          'message',
          {
            recipientId,
            text,
          }
        );

        socket.emit(
          'send_message',
          {
            recipientId,
            text,
          }
        );

      } else {

        await api(
          '/messages',
          {
            method: 'POST',

            body: JSON.stringify({
              recipientId,
              text,
            }),
          }
        );

      }

    } catch (e) {

      console.log(
        'SEND MESSAGE ERROR:',
        e
      );

      setErr(
        e.message ||
        'Could not send message'
      );

    }

  }


  // ===================================================
  // TYPING
  // ===================================================

  function handleTyping(
    text
  ) {

    setDraftText(text);

    const socket =
      socketRef.current;

    if (
      !socket ||
      !socket.connected ||
      !activeChatId
    ) {

      return;

    }

    socket.emit(
      'typing',
      {
        conversationId:
          activeChatId,
      }
    );

    clearTimeout(
      typingTimeoutRef.current
    );

    typingTimeoutRef.current =
      setTimeout(() => {

        socket.emit(
          'stop_typing',
          {
            conversationId:
              activeChatId,
          }
        );

      }, 1000);

  }


  // ===================================================
  // REMOVE EXPIRED MESSAGES
  // ===================================================

  useEffect(() => {

    const interval =
      setInterval(() => {

        const now =
          Date.now();

        setConversations(prev => {

          const next = {
            ...prev,
          };

          Object.keys(next)
            .forEach(id => {

              const chat =
                next[id];

              if (!chat) {
                return;
              }

              const messages =
                (chat.messages || [])
                  .filter(message => {

                    if (
                      !message.expiresAt
                    ) {

                      return true;

                    }

                    return (
                      new Date(
                        message.expiresAt
                      ).getTime() > now
                    );

                  });

              next[id] = {
                ...chat,
                messages,
              };

            });

          return next;

        });

      }, 1000);

    return () => {
      clearInterval(interval);
    };

  }, []);


  // ===================================================
  // SEARCH USERS
  // ===================================================

  useEffect(() => {

    if (!showNewChat) {
      return;
    }

    clearTimeout(
      searchDebounceRef.current
    );

    if (
      searchQuery.trim().length < 2
    ) {

      setSearchResults([]);

      return;

    }

    searchDebounceRef.current =
      setTimeout(async () => {

        try {

          const result =
            await api(
              `/users/search?q=${encodeURIComponent(
                searchQuery.trim()
              )}`,
              {
                method: 'GET',
              }
            );

          setSearchResults(
            result.users ||
            result.results ||
            []
          );

        } catch (e) {

          console.log(
            'SEARCH ERROR:',
            e
          );

          setSearchResults([]);

        }

      }, 400);

    return () => {

      clearTimeout(
        searchDebounceRef.current
      );

    };

  }, [
    searchQuery,
    showNewChat,
    token,
  ]);


  // ===================================================
  // ACTIVE CHAT
  // ===================================================

  const activeChat =
    activeChatId
      ? conversations[activeChatId]
      : null;


  // ===================================================
  // NAVIGATION
  // ===================================================

  function setTabScreen(t) {

    setTab(t);

    setSettingsSection(null);

    setScreen(
      t === 'chats'
        ? 'home'
        : t === 'profile'
        ? 'profile-tab'
        : t
    );

  }


  // ===================================================
  // SETUP SCREEN
  // ===================================================

  if (screen === 'setup') {

    return (

      <SafeAreaView
        style={styles.safe}
      >

        <StatusBar
          style="light"
        />

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={
            Platform.OS === 'ios'
              ? 'padding'
              : undefined
          }
        >

          <ScrollView
            contentContainerStyle={
              styles.authContainer
            }
            keyboardShouldPersistTaps="handled"
          >

            <View
              style={styles.logoCircle}
            >
              <Text
                style={styles.logoText}
              >
                H
              </Text>

              <Text
                style={styles.logoRing}
              >
                
              </Text>

              <Text
                style={styles.logoText}
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
              {'\n'}
              Temporary messages.
            </Text>


            {err ? (

              <View
                style={styles.errorBox}
              >

                <Text
                  style={styles.errorText}
                >
                  {err}
                </Text>

              </View>

            ) : null}


            {authMode === 'login' ? (

              <>

                <TextInput
                  style={styles.input}
                  placeholder="Username"
                  placeholderTextColor="#666"
                  autoCapitalize="none"
                  value={username}
                  onChangeText={setUsername}
                />

                <TextInput
                  style={styles.input}
                  placeholder="Password"
                  placeholderTextColor="#666"
                  secureTextEntry
                  value={password}
                  onChangeText={setPassword}
                />

                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={loginAccount}
                  disabled={busy}
                >

                  <Text
                    style={styles.primaryButtonText}
                  >
                    {busy
                      ? 'Please wait...'
                      : 'Log In'}
                  </Text>

                </TouchableOpacity>


                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => {

                    setAuthMode(
                      'register'
                    );

                    setErr('');

                  }}
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
                  placeholder="Email address"
                  placeholderTextColor="#666"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
                />


                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={
                    requestEmailOtp
                  }
                  disabled={busy}
                >

                  <Text
                    style={styles.primaryButtonText}
                  >
                    {busy
                      ? 'Sending...'
                      : 'Verify Email'}
                  </Text>

                </TouchableOpacity>


                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => {

                    setAuthMode(
                      'login'
                    );

                    setErr('');

                  }}
                >

                  <Text
                    style={styles.secondaryButtonText}
                  >
                    I already have an account
                  </Text>

                </TouchableOpacity>

              </>

            )}

          </ScrollView>

        </KeyboardAvoidingView>

      </SafeAreaView>

    );

  }


  // ===================================================
  // VERIFY SCREEN
  // ===================================================

  if (screen === 'verify') {

    return (

      <SafeAreaView
        style={styles.safe}
      >

        <StatusBar
          style="light"
        />

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={
            Platform.OS === 'ios'
              ? 'padding'
              : undefined
          }
        >

          <ScrollView
            contentContainerStyle={
              styles.authContainer
            }
          >

            <Text
              style={styles.authTitle}
            >
              Verify your email
            </Text>

            <Text
              style={styles.authSubtitle}
            >
              We sent a verification code to
            </Text>

            <Text
              style={styles.emailDisplay}
            >
              {email}
            </Text>


            {err ? (

              <View
                style={styles.errorBox}
              >

                <Text
                  style={styles.errorText}
                >
                  {err}
                </Text>

              </View>

            ) : null}


            <TextInput
              style={[
                styles.input,
                styles.codeInput,
              ]}
              placeholder="Verification code"
              placeholderTextColor="#666"
              keyboardType="number-pad"
              value={code}
              onChangeText={setCode}
              maxLength={8}
            />


            <TouchableOpacity
              style={styles.primaryButton}
              onPress={
                verifyEmailAndContinue
              }
              disabled={busy}
            >

              <Text
                style={styles.primaryButtonText}
              >
                {busy
                  ? 'Checking...'
                  : 'Verify'}
              </Text>

            </TouchableOpacity>


            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={
                requestEmailOtp
              }
            >

              <Text
                style={styles.secondaryButtonText}
              >
                Send another code
              </Text>

            </TouchableOpacity>


            <TouchableOpacity
              onPress={() => {

                setScreen('setup');
                setCode('');
                setErr('');

              }}
            >

              <Text
                style={styles.backText}
              >
                ← Back
              </Text>

            </TouchableOpacity>

          </ScrollView>

        </KeyboardAvoidingView>

      </SafeAreaView>

    );

  }


  // ===================================================
  // PROFILE CREATION
  // ===================================================

  if (screen === 'profile') {

    return (

      <SafeAreaView
        style={styles.safe}
      >

        <StatusBar
          style="light"
        />

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={
            Platform.OS === 'ios'
              ? 'padding'
              : undefined
          }
        >

          <ScrollView
            contentContainerStyle={
              styles.authContainer
            }
            keyboardShouldPersistTaps="handled"
          >

            <Text
              style={styles.authTitle}
            >
              Create your profile
            </Text>

            <Text
              style={styles.authSubtitle}
            >
              Your identity inside Hole
            </Text>


            {err ? (

              <View
                style={styles.errorBox}
              >

                <Text
                  style={styles.errorText}
                >
                  {err}
                </Text>

              </View>

            ) : null}


            <TextInput
              style={styles.input}
              placeholder="Username"
              placeholderTextColor="#666"
              autoCapitalize="none"
              value={username}
              onChangeText={setUsername}
            />

            <TextInput
              style={styles.input}
              placeholder="Display name"
              placeholderTextColor="#666"
              value={displayName}
              onChangeText={setDisplayName}
            />

            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#666"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />


            <Text
              style={styles.emojiLabel}
            >
              Choose your profile icon
            </Text>


            <View
              style={styles.emojiGrid}
            >

              {EMOJI_CHOICES.map(item => (

                <TouchableOpacity
                  key={item}
                  style={[
                    styles.emojiButton,

                    emoji === item &&
                      styles.emojiButtonSelected,
                  ]}
                  onPress={() =>
                    setEmoji(item)
                  }
                >

                  <Text
                    style={{
                      fontSize: 27,
                    }}
                  >
                    {item}
                  </Text>

                </TouchableOpacity>

              ))}

            </View>


            <TouchableOpacity
              style={styles.primaryButton}
              onPress={registerAccount}
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


            <Text
              style={styles.verifiedText}
            >
              ✓ Email verified
            </Text>

          </ScrollView>

        </KeyboardAvoidingView>

      </SafeAreaView>

    );

  }


  // ===================================================
  // CHAT SCREEN
  // ===================================================

  if (screen === 'chat') {

    const messages =
      activeChat?.messages || [];

    return (

      <SafeAreaView
        style={styles.safe}
      >

        <StatusBar
          style="light"
        />

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={
            Platform.OS === 'ios'
              ? 'padding'
              : undefined
          }
        >

          <View
            style={styles.chatHeader}
          >

            <TouchableOpacity
              onPress={() => {
                setScreen('home');
                setActiveChatId(null);
              }}
            >

              <Text
                style={styles.backButton}
              >
                ←
              </Text>

            </TouchableOpacity>


            <View
              style={{ flex: 1 }}
            >

              <Text
                style={styles.chatTitle}
              >
                {activeChat?.peer
                  ?.displayName ||
                  activeChat?.peer
                  ?.username ||
                  'Chat'}
              </Text>

              <Text
                style={styles.chatSubtitle}
              >
                @{activeChat?.peer
                  ?.username || ''}
              </Text>

            </View>


            <View
              style={[
                styles.connectionDot,

                connected &&
                  styles.connectionDotOn,
              ]}
            />

          </View>


          {peerTyping ? (

            <Text
              style={styles.typingText}
            >
              typing...
            </Text>

          ) : null}


          <FlatList
            ref={scrollRef}
            data={messages}
            keyExtractor={(item, index) =>
              String(
                item._id ||
                item.id ||
                index
              )
            }
            contentContainerStyle={
              styles.messageList
            }
            renderItem={({
              item,
            }) => {

              const mine =
                String(
                  item.senderId ||
                  item.sender?._id ||
                  item.sender?.id
                ) ===
                String(
                  me?._id ||
                  me?.id
                );

              return (

                <View
                  style={[
                    styles.messageBubble,

                    mine
                      ? styles.myMessage
                      : styles.theirMessage,
                  ]}
                >

                  <Text
                    style={styles.messageText}
                  >
                    {item.text}
                  </Text>

                  <Text
                    style={styles.messageTimer}
                  >
                    30s
                  </Text>

                </View>

              );

            }}
          />


          <View
            style={styles.messageInputRow}
          >

            <TextInput
              style={styles.messageInput}
              placeholder="Message"
              placeholderTextColor="#666"
              value={draftText}
              onChangeText={
                handleTyping
              }
              multiline
            />

            <TouchableOpacity
              style={styles.sendButton}
              onPress={sendMessage}
            >

              <Text
                style={styles.sendButtonText}
              >
                ↑
              </Text>

            </TouchableOpacity>

          </View>

        </KeyboardAvoidingView>

      </SafeAreaView>

    );

  }


  // ===================================================
  // HOME / CHATS
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

        <StatusBar
          style="light"
        />

        <View
          style={styles.screen}
        >

          <View
            style={styles.topbar}
          >

            <View>

              <Text
                style={styles.title}
              >
                Hole
              </Text>

              <Text
                style={styles.connectionText}
              >
                {connected
                  ? 'Connected'
                  : 'Connecting...'}
              </Text>

            </View>


            <TouchableOpacity
              style={styles.newChatButton}
              onPress={() =>
                setShowNewChat(true)
              }
            >

              <Text
                style={styles.newChatText}
              >
                +
              </Text>

            </TouchableOpacity>

          </View>


          {chatList.length === 0 ? (

            <View
              style={styles.emptyScreen}
            >

              <Text
                style={styles.emptyLogo}
              >
                HOLE
              </Text>

              <Text
                style={styles.emptyTitle}
              >
                No conversations yet
              </Text>

              <Text
                style={styles.emptySubtitle}
              >
                Find someone and start a conversation.
              </Text>

              <TouchableOpacity
                style={styles.primaryButtonSmall}
                onPress={() =>
                  setShowNewChat(true)
                }
              >

                <Text
                  style={styles.primaryButtonText}
                >
                  New Chat
                </Text>

              </TouchableOpacity>

            </View>

          ) : (

            <FlatList
              data={chatList}
              keyExtractor={item =>
                item.id
              }
              contentContainerStyle={{
                paddingBottom: 100,
              }}
              renderItem={({
                item,
              }) => {

                const last =
                  item.messages?.[
                    item.messages.length - 1
                  ];

                return (

                  <TouchableOpacity
                    style={styles.chatRow}
                    onPress={() => {

                      setActiveChatId(
                        item.id
                      );

                      setScreen('chat');

                    }}
                  >

                    <View
                      style={styles.chatAvatar}
                    >

                      <Text
                        style={{
                          fontSize: 23,
                        }}
                      >
                        {item.peer?.emoji ||
                          '😀'}
                      </Text>

                    </View>


                    <View
                      style={{
                        flex: 1,
                      }}
                    >

                      <Text
                        style={styles.chatName}
                      >
                        {item.peer
                          ?.displayName ||
                          item.peer
                          ?.username ||
                          'User'}
                      </Text>

                      <Text
                        style={styles.chatPreview}
                        numberOfLines={1}
                      >
                        {last?.text ||
                          'No messages yet'}
                      </Text>

                    </View>

                  </TouchableOpacity>

                );

              }}
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
                    New Chat
                  </Text>

                  <TouchableOpacity
                    onPress={() => {

                      setShowNewChat(
                        false
                      );

                      setSearchQuery('');
                      setSearchResults([]);

                    }}
                  >

                    <Text
                      style={styles.closeText}
                    >
                      ×
                    </Text>

                  </TouchableOpacity>

                </View>


                <TextInput
                  style={styles.input}
                  placeholder="@username"
                  placeholderTextColor="#666"
                  autoCapitalize="none"
                  value={searchQuery}
                  onChangeText={
                    setSearchQuery
                  }
                  autoFocus
                />


                {searchResults.map(
                  user => (

                    <TouchableOpacity
                      key={
                        String(
                          user._id ||
                          user.id ||
                          user.username
                        )
                      }
                      style={styles.searchResult}
                      onPress={() =>
                        openChat(user)
                      }
                    >

                      <View
                        style={styles.searchAvatar}
                      >

                        <Text
                          style={{
                            fontSize: 20,
                          }}
                        >
                          {user.emoji ||
                            '😀'}
                        </Text>

                      </View>

                      <View
                        style={{
                          flex: 1,
                        }}
                      >

                        <Text
                          style={styles.searchName}
                        >
                          {user.displayName ||
                            user.username}
                        </Text>

                        <Text
                          style={styles.searchUsername}
                        >
                          @{user.username}
                        </Text>

                      </View>

                    </TouchableOpacity>

                  )
                )}

              </View>

            </View>

          ) : null}


          <BottomNav
            tab={tab}
            onChange={
              setTabScreen
            }
          />

        </View>

      </SafeAreaView>

    );

  }


  // ===================================================
  // CALLS
  // ===================================================

  if (screen === 'calls') {

    return (

      <SafeAreaView
        style={styles.safe}
      >

        <StatusBar
          style="light"
        />

        <View
          style={styles.screen}
        >

          <View
            style={styles.topbar}
          >

            <Text
              style={styles.title}
            >
              Calls
            </Text>

          </View>


          <View
            style={styles.emptyScreen}
          >

            <Text
              style={styles.emptyLogo}
            >
              📞
            </Text>

            <Text
              style={styles.emptyTitle}
            >
              Calls
            </Text>

            <Text
              style={styles.emptySubtitle}
            >
              Voice and video calls are coming to Hole.
            </Text>

          </View>


          <BottomNav
            tab={tab}
            onChange={
              setTabScreen
            }
          />

        </View>

      </SafeAreaView>

    );

  }


  // ===================================================
  // SETTINGS
  // ===================================================

  if (screen === 'profile-tab') {

    return (

      <SafeAreaView
        style={styles.safe}
      >

        <StatusBar
          style="light"
        />

        <View
          style={styles.screen}
        >

          <View
            style={styles.topbar}
          >

            <Text
              style={styles.title}
            >
              Settings
            </Text>

          </View>


          {/* =========================================
              SETTINGS HOME
          ========================================= */}

          {settingsSection === null && (

            <ScrollView
              contentContainerStyle={{
                padding: 16,
                paddingBottom: 100,
              }}
            >

              <TouchableOpacity
                style={styles.settingsProfile}
                onPress={() =>
                  setSettingsSection(
                    'profile'
                  )
                }
              >

                <View
                  style={styles.settingsAvatar}
                >

                  <Text
                    style={{
                      fontSize: 28,
                    }}
                  >
                    {me?.emoji ||
                      '😊'}
                  </Text>

                </View>


                <View
                  style={{
                    flex: 1,
                  }}
                >

                  <Text
                    style={
                      styles.settingsProfileName
                    }
                  >
                    {me?.displayName ||
                      'Your profile'}
                  </Text>

                  <Text
                    style={
                      styles.settingsProfileHandle
                    }
                  >
                    @{me?.username || ''}
                  </Text>

                </View>


                <Text
                  style={
                    styles.settingsArrow
                  }
                >
                  ›
                </Text>

              </TouchableOpacity>


              <Text
                style={
                  styles.settingsCategory
                }
              >
                ACCOUNT
              </Text>


              <SettingsRow
                icon="👤"
                title="Profile"
                subtitle="Manage your identity"
                onPress={() =>
                  setSettingsSection(
                    'profile'
                  )
                }
              />


              <SettingsRow
                icon="🔐"
                title="Security"
                subtitle="Password and account security"
                onPress={() =>
                  setSettingsSection(
                    'security'
                  )
                }
              />


              <Text
                style={
                  styles.settingsCategory
                }
              >
                PRIVACY
              </Text>


              <SettingsRow
                icon="🛡️"
                title="Privacy & Data"
                subtitle="Control and understand your data"
                onPress={() =>
                  setSettingsSection(
                    'privacy'
                  )
                }
              />


              <SettingsRow
                icon="📜"
                title="Privacy Policy"
                subtitle="How Hole handles information"
                onPress={() =>
                  setSettingsSection(
                    'privacyPolicy'
                  )
                }
              />


              <Text
                style={
                  styles.settingsCategory
                }
              >
                RULES & INFORMATION
              </Text>


              <SettingsRow
                icon="📋"
                title="Terms of Service"
                subtitle="Rules for using Hole"
                onPress={() =>
                  setSettingsSection(
                    'terms'
                  )
                }
              />


              <SettingsRow
                icon="👥"
                title="Community Guidelines"
                subtitle="Keep Hole safe for everyone"
                onPress={() =>
                  setSettingsSection(
                    'community'
                  )
                }
              />


              <Text
                style={
                  styles.settingsCategory
                }
              >
                ABOUT
              </Text>


              <SettingsRow
                icon="❓"
                title="Help & How Hole Works"
                subtitle="Learn how to use Hole"
                onPress={() =>
                  setSettingsSection(
                    'help'
                  )
                }
              />

              <SettingsRow
                icon="👤"
                title="About Hole"
                subtitle="App information"
                onPress={() =>
                  setSettingsSection(
                    'about'
                  )
                }
              />


              <TouchableOpacity
                style={
                  styles.leaveSettingsRow
                }
                onPress={leaveHole}
              >

                <Text
                  style={
                    styles.leaveSettingsText
                  }
                >
                  Leave the Hole
                </Text>

              </TouchableOpacity>

            </ScrollView>

          )}


          {/* =========================================
              PROFILE
          ========================================= */}

          {settingsSection ===
            'profile' && (

            <ScrollView
              contentContainerStyle={
                styles.settingsPage
              }
            >

              <SettingsBack
                onPress={() =>
                  setSettingsSection(null)
                }
              />


              <View
                style={
                  styles.settingsLargeAvatar
                }
              >

                <Text
                  style={{
                    fontSize: 42,
                  }}
                >
                  {me?.emoji ||
                    '😊'}
                </Text>

              </View>


              <Text
                style={
                  styles.settingsPageTitle
                }
              >
                Profile
              </Text>

              <Text
                style={
                  styles.settingsPageDescription
                }
              >
                This is the identity other people see on Hole.
              </Text>


              <InfoBox
                label="Display name"
                value={
                  me?.displayName ||
                  'Not available'
                }
              />


              <InfoBox
                label="Username"
                value={
                  `@${me?.username || ''}`
                }
              />


              <InfoBox
                label="Email"
                value={
                  me?.email ||
                  verifiedEmail ||
                  'Verified email'
                }
              />


              <InfoBox
                label="Profile icon"
                value={
                  me?.emoji ||
                  '😊'
                }
              />

            </ScrollView>

          )}


          {/* =========================================
              SECURITY
          ========================================= */}

          {settingsSection ===
            'security' && (

            <ScrollView
              contentContainerStyle={
                styles.settingsPage
              }
            >

              <SettingsBack
                onPress={() =>
                  setSettingsSection(null)
                }
              />


              <Text
                style={
                  styles.settingsPageTitle
                }
              >
                Security
              </Text>

              <Text
                style={
                  styles.settingsPageDescription
                }
              >
                Information about protecting your Hole account.
              </Text>


              <InfoBox
                label="Email verification"
                value="Your email address is verified during account registration."
              />


              <InfoBox
                label="Password"
                value="Your password should be unique and should not be shared with anyone."
              />


              <InfoBox
                label="Temporary messages"
                value="Messages are designed to expire. However, recipients can still copy or capture content."
              />


              <Text
                style={
                  styles.settingsBody
                }
              >
                If you believe someone has gained unauthorized access to your account, stop using the account and contact the Hole operator.
              </Text>

            </ScrollView>

          )}


          {/* =========================================
              PRIVACY & DATA
          ========================================= */}

          {settingsSection ===
            'privacy' && (

            <ScrollView
              contentContainerStyle={
                styles.settingsPage
              }
            >

              <SettingsBack
                onPress={() =>
                  setSettingsSection(null)
                }
              />


              <Text
                style={
                  styles.settingsPageTitle
                }
              >
                Privacy & Data
              </Text>

              <Text
                style={
                  styles.settingsPageDescription
                }
              >
                Hole is designed around simple communication and disappearing messages.
              </Text>


              <SectionTitle>
                Information we may collect
              </SectionTitle>

              <BodyText>
                Hole may collect information needed to create and operate your account, including your email address, username, display name and profile icon.
              </BodyText>


              <SectionTitle>
                Account information
              </SectionTitle>

              <BodyText>
                Your account information is used to identify your account, authenticate you and allow other users to find you when your account is discoverable.
              </BodyText>


              <SectionTitle>
                Messages
              </SectionTitle>

              <BodyText>
                Hole is designed so that messages are temporary. Messages may be automatically deleted after the applicable expiration period.
              </BodyText>


              <SectionTitle>
                Security information
              </SectionTitle>

              <BodyText>
                We may process technical information such as authentication information, connection data and security logs where necessary to operate and protect the service.
              </BodyText>


              <SectionTitle>
                Your choices
              </SectionTitle>

              <BodyText>
                You can stop using Hole at any time. You may also contact the app operator regarding questions about your personal information or account.
              </BodyText>

            </ScrollView>

          )}


          {/* =========================================
              PRIVACY POLICY
          ========================================= */}

          {settingsSection ===
            'privacyPolicy' && (

            <ScrollView
              contentContainerStyle={
                styles.settingsPage
              }
            >

              <SettingsBack
                onPress={() =>
                  setSettingsSection(null)
                }
              />


              <Text
                style={
                  styles.settingsPageTitle
                }
              >
                Privacy Policy
              </Text>

              <Text
                style={
                  styles.settingsPageDescription
                }
              >
                Last updated: September 2026
              </Text>


              <SectionTitle>
                1. Introduction
              </SectionTitle>

              <BodyText>
                Hole is a messaging application operated by Eric Mwangi Kimani. This Privacy Policy explains what information Hole may collect, how it may be used, and the choices available to users.
              </BodyText>


              <SectionTitle>
                2. Information we collect
              </SectionTitle>

              <BodyText>
                When you create an account, Hole may collect your email address, username, display name, password credentials and selected profile icon.
              </BodyText>


              <SectionTitle>
                3. How information is used
              </SectionTitle>

              <BodyText>
                Information may be used to create and maintain your account, authenticate you, provide messaging functionality, protect the service and prevent abuse.
              </BodyText>


              <SectionTitle>
                4. Messages
              </SectionTitle>

              <BodyText>
                Hole is designed around temporary messaging. Messages are intended to disappear according to the application's expiration rules. Temporary messaging does not mean that users should assume that information can never be copied, photographed or otherwise captured by another person.
              </BodyText>


              <SectionTitle>
                5. Third-party services
              </SectionTitle>

              <BodyText>
                Hole may use third-party infrastructure providers to operate authentication, databases, email delivery, hosting and other technical services. Such providers may process information as necessary to provide those services.
              </BodyText>


              <SectionTitle>
                6. Data security
              </SectionTitle>

              <BodyText>
                Reasonable technical and organizational measures are used to protect account information. However, no internet service can guarantee absolute security.
              </BodyText>


              <SectionTitle>
                7. Your rights
              </SectionTitle>

              <BodyText>
                Depending on applicable law, you may have rights relating to access, correction, deletion or other processing of your personal information.
              </BodyText>


              <SectionTitle>
                8. Contact
              </SectionTitle>

              <BodyText>
                Privacy questions or requests may be directed to the operator of Hole.
              </BodyText>

            </ScrollView>

          )}


          {/* =========================================
              TERMS
          ========================================= */}

          {settingsSection ===
            'terms' && (

            <ScrollView
              contentContainerStyle={
                styles.settingsPage
              }
            >

              <SettingsBack
                onPress={() =>
                  setSettingsSection(null)
                }
              />


              <Text
                style={
                  styles.settingsPageTitle
                }
              >
                Terms of Service
              </Text>

              <Text
                style={
                  styles.settingsPageDescription
                }
              >
                Last updated: September 2026
              </Text>


              <SectionTitle>
                1. Acceptance
              </SectionTitle>

              <BodyText>
                By creating or using a Hole account, you agree to follow these Terms and applicable laws.
              </BodyText>


              <SectionTitle>
                2. Your account
              </SectionTitle>

              <BodyText>
                You are responsible for maintaining the confidentiality of your account credentials and for activity performed through your account.
              </BodyText>


              <SectionTitle>
                3. Prohibited conduct
              </SectionTitle>

              <BodyText>
                Users must not use Hole to threaten, harass, impersonate, defraud, abuse, exploit or otherwise harm another person.
              </BodyText>


              <SectionTitle>
                4. Temporary messages
              </SectionTitle>

              <BodyText>
                The disappearing-message feature is not a guarantee that content cannot be preserved by another person. Users should avoid sending information that they would not want another person to retain.
              </BodyText>


              <SectionTitle>
                5. Service availability
              </SectionTitle>

              <BodyText>
                Hole may occasionally be unavailable because of maintenance, technical problems, network failures or other circumstances.
              </BodyText>


              <SectionTitle>
                6. Account termination
              </SectionTitle>

              <BodyText>
                Accounts may be restricted or terminated when necessary to protect users, comply with law or enforce these rules.
              </BodyText>


              <SectionTitle>
                7. Changes
              </SectionTitle>

              <BodyText>
                These terms may be updated as Hole develops. Continued use after applicable changes may constitute acceptance of the updated terms.
              </BodyText>

            </ScrollView>

          )}


          {/* =========================================
              COMMUNITY
          ========================================= */}

          {settingsSection ===
            'community' && (

            <ScrollView
              contentContainerStyle={
                styles.settingsPage
              }
            >

              <SettingsBack
                onPress={() =>
                  setSettingsSection(null)
                }
              />


              <Text
                style={
                  styles.settingsPageTitle
                }
              >
                Community Guidelines
              </Text>

              <Text
                style={
                  styles.settingsPageDescription
                }
              >
                Hole should be a place for communication, not abuse.
              </Text>


              <SectionTitle>
                Be respectful
              </SectionTitle>

              <BodyText>
                Do not harass, threaten, bully or intentionally intimidate other users.
              </BodyText>


              <SectionTitle>
                Do not impersonate
              </SectionTitle>

              <BodyText>
                Do not pretend to be another person, organization or public figure in order to deceive others.
              </BodyText>


              <SectionTitle>
                Do not abuse the service
              </SectionTitle>

              <BodyText>
                Do not attempt to compromise accounts, disrupt the service, bypass security controls or misuse another person's information.
              </BodyText>


              <SectionTitle>
                Protect yourself
              </SectionTitle>

              <BodyText>
                Never share passwords, verification codes or sensitive personal information with people you do not trust.
              </BodyText>

            </ScrollView>

          )}

          {/* =========================================
              HELP
          ========================================= */}

          {settingsSection ===
            'help' && (

            <ScrollView
              contentContainerStyle={
                styles.settingsPage
              }
            >

              <SettingsBack
                onPress={() =>
                  setSettingsSection(null)
                }
              />

              <Text
                style={
                  styles.settingsPageTitle
                }
              >
                Help & How Hole Works
              </Text>

              <Text
                style={
                  styles.settingsPageDescription
                }
              >
                Everything you need to know about using Hole.
              </Text>

              <SectionTitle>
                Getting started
              </SectionTitle>

              <BodyText>
                Create a Hole account using your email address, username, display name and password. You will need to verify your email before completing registration.
              </BodyText>

              <SectionTitle>
                Finding people
              </SectionTitle>

              <BodyText>
                Use the search feature to find another Hole user by their username, then start a conversation.
              </BodyText>

              <SectionTitle>
                Sending messages
              </SectionTitle>

              <BodyText>
                Open a conversation, type your message and press Send. Hole is designed for temporary communication, so messages are automatically removed after their lifetime.
              </BodyText>

              <SectionTitle>
                Your profile
              </SectionTitle>

              <BodyText>
                Your profile contains your display name, username and profile icon. You can manage your identity from Settings.
              </BodyText>

              <SectionTitle>
                Staying safe
              </SectionTitle>

              <BodyText>
                Never share your password or email verification codes with anyone. Do not send sensitive information to people you do not trust.
              </BodyText>

              <SectionTitle>
                Need more help?
              </SectionTitle>

              <BodyText>
                Visit the official Hole website for more information about the application.
              </BodyText>

            </ScrollView>

          )}


          {/* =========================================
              ABOUT
          ========================================= */}

          {settingsSection ===
            'about' && (

            <ScrollView
              contentContainerStyle={
                styles.settingsPage
              }
            >

              <SettingsBack
                onPress={() =>
                  setSettingsSection(null)
                }
              />


              <View
                style={styles.aboutLogo}
              >

                <Text
                  style={
                    styles.aboutLogoText
                  }
                >
                  H
                  <Text
                    style={
                      styles.ringChar
                    }
                  >
                    ◯
                  </Text>
                  LE
                </Text>

              </View>


              <Text
                style={
                  styles.settingsPageTitle
                }
              >
                Hole
              </Text>

              <Text
                style={
                  styles.settingsPageDescription
                }
              >
                Simple communication. Temporary messages.
              </Text>


              <InfoBox
                label="Operator"
                value="Eric Mwangi Kimani"
              />


              <InfoBox
                label="Application"
                value="Hole Messaging"
              />


              <BodyText>
                Hole is an independent messaging application designed around simple identities and temporary communication.
              </BodyText>


              <BodyText>
                © 2026 Eric Mwangi Kimani. All rights reserved.
              </BodyText>

            </ScrollView>

          )}


          <BottomNav
            tab={tab}
            onChange={
              setTabScreen
            }
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

      <Text
        style={styles.settingsIcon}
      >
        {icon}
      </Text>


      <View
        style={{
          flex: 1,
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
// SETTINGS BACK
// =====================================================

function SettingsBack({
  onPress,
}) {

  return (

    <TouchableOpacity
      onPress={onPress}
    >

      <Text
        style={styles.settingsBack}
      >
        ← Settings
      </Text>

    </TouchableOpacity>

  );

}


// =====================================================
// INFO BOX
// =====================================================

function InfoBox({
  label,
  value,
}) {

  return (

    <View
      style={styles.infoBox}
    >

      <Text
        style={styles.infoLabel}
      >
        {label}
      </Text>

      <Text
        style={styles.infoValue}
      >
        {value}
      </Text>

    </View>

  );

}


// =====================================================
// SECTION TITLE
// =====================================================

function SectionTitle({
  children,
}) {

  return (

    <Text
      style={styles.settingsSectionTitle}
    >
      {children}
    </Text>

  );

}


// =====================================================
// BODY TEXT
// =====================================================

function BodyText({
  children,
}) {

  return (

    <Text
      style={styles.settingsBody}
    >
      {children}
    </Text>

  );

}


// =====================================================
// BOTTOM NAVIGATION
// =====================================================

function BottomNav({
  tab,
  onChange,
}) {

  const items = [

    {
      key: 'chats',
      label: 'Chats',
      ico: '💬',
    },

    {
      key: 'calls',
      label: 'Calls',
      ico: '📞',
    },

    {
      key: 'profile',
      label: 'Settings',
      ico: '⚙️',
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
    // AUTH
    // ===============================================

    authContainer: {
      flexGrow: 1,
      padding: 24,
      paddingTop: 80,
      paddingBottom: 50,
      justifyContent: 'center',
    },


    logoCircle: {
      width: 80,
      height: 80,
      borderRadius: 40,
      borderWidth: 2,
      borderColor: HAIR,
      backgroundColor: SURFACE,
      alignSelf: 'center',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      marginBottom: 24,
    },


    logoText: {
      color: WHITE,
      fontSize: 19,
      fontWeight: '600',
    },


    logoRing: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: WHITE,
      marginHorizontal: 2,
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


    emailDisplay: {
      color: WHITE,
      fontSize: 14,
      textAlign: 'center',
      marginTop: -15,
      marginBottom: 24,
    },


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
      letterSpacing: 5,
      fontSize: 18,
    },


    primaryButton: {
      backgroundColor: WHITE,
      borderRadius: 10,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 8,
      marginBottom: 12,
    },


    primaryButtonSmall: {
      backgroundColor: WHITE,
      borderRadius: 14,
      paddingVertical: 13,
      paddingHorizontal: 25,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 18,
    },


    primaryButtonText: {
      color: BLACK_FIX,
      fontSize: 13,
      fontWeight: '600',
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
      fontSize: 13,
    },


    backText: {
      color: SUB,
      textAlign: 'center',
      fontSize: 13,
      marginTop: 12,
    },


    errorBox: {
      backgroundColor: 'rgba(255,69,58,0.08)',
      borderWidth: 1,
      borderColor: 'rgba(255,69,58,0.25)',
      borderRadius: 12,
      padding: 12,
      marginBottom: 15,
    },


    errorText: {
      color: RED,
      fontSize: 12,
      lineHeight: 18,
      textAlign: 'center',
    },


    verifiedText: {
      color: '#4CD964',
      fontSize: 12,
      textAlign: 'center',
      marginTop: 15,
    },


    emojiLabel: {
      color: SUB,
      fontSize: 12,
      marginTop: 5,
      marginBottom: 10,
    },


    emojiGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginBottom: 20,
    },


    emojiButton: {
      width: 50,
      height: 50,
      borderRadius: 14,
      backgroundColor: SURFACE,
      borderWidth: 1,
      borderColor: HAIR,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 8,
      marginBottom: 8,
    },


    emojiButtonSelected: {
      borderColor: WHITE,
      backgroundColor: SURFACE2,
    },


    // ===============================================
    // TOP BAR
    // ===============================================

    topbar: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottomWidth: 1,
      borderBottomColor: HAIR,
    },


    title: {
      color: WHITE,
      fontSize: 20,
      fontWeight: '700',
      marginBottom: 4,
    },


    connectionText: {
      color: SUB,
      fontSize: 10,
      marginTop: 3,
    },


    newChatButton: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: SURFACE2,
      alignItems: 'center',
      justifyContent: 'center',
    },


    newChatText: {
      color: WHITE,
      fontSize: 25,
      fontWeight: '300',
      marginTop: -2,
    },


    // ===============================================
    // EMPTY
    // ===============================================

    emptyScreen: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 35,
    },


    emptyLogo: {
      color: SUB,
      fontSize: 48,
      fontWeight: '700',
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
      lineHeight: 20,
      textAlign: 'center',
      marginBottom: 20,
    },


    // ===============================================
    // CHAT LIST
    // ===============================================

    chatRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginHorizontal: 12,
      marginVertical: 4,
      borderRadius: 12,
      backgroundColor: SURFACE,
      gap: 12,
    },


    chatAvatar: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: SURFACE2,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },


    chatName: {
      color: WHITE,
      fontSize: 14,
      fontWeight: '500',
    },


    chatPreview: {
      color: SUB,
      fontSize: 11,
      marginTop: 4,
    },


    // ===============================================
    // CHAT
    // ===============================================

    chatHeader: {
      height: 65,
      borderBottomWidth: 1,
      borderBottomColor: HAIR,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
    },


    backButton: {
      color: WHITE,
      fontSize: 27,
      marginRight: 15,
    },


    chatTitle: {
      color: WHITE,
      fontSize: 15,
      fontWeight: '500',
    },


    chatSubtitle: {
      color: SUB,
      fontSize: 10,
      marginTop: 3,
    },


    connectionDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: '#555',
    },


    connectionDotOn: {
      backgroundColor: '#4CD964',
    },


    typingText: {
      color: SUB,
      fontSize: 10,
      paddingHorizontal: 17,
      paddingTop: 6,
    },


    messageList: {
      padding: 15,
      paddingBottom: 20,
    },


    messageBubble: {
      maxWidth: '78%',
      paddingHorizontal: 13,
      paddingVertical: 9,
      borderRadius: 17,
      marginBottom: 7,
    },


    myMessage: {
      alignSelf: 'flex-end',
      backgroundColor: WHITE,
      borderBottomRightRadius: 5,
    },


    theirMessage: {
      alignSelf: 'flex-start',
      backgroundColor: SURFACE2,
      borderBottomLeftRadius: 5,
    },


    messageText: {
      color: WHITE,
      fontSize: 13,
      lineHeight: 18,
    },


    myMessageText: {
      color: BLACK_FIX,
    },


    messageTimer: {
      color: SUB,
      fontSize: 8,
      marginTop: 4,
      textAlign: 'right',
    },


    messageInputRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      padding: 10,
      borderTopWidth: 1,
      borderTopColor: HAIR,
      backgroundColor: BG,
    },


    messageInput: {
      flex: 1,
      minHeight: 42,
      maxHeight: 110,
      backgroundColor: SURFACE,
      borderWidth: 1,
      borderColor: HAIR,
      borderRadius: 20,
      color: WHITE,
      paddingHorizontal: 15,
      paddingVertical: 10,
      fontSize: 13,
      marginRight: 8,
    },


    sendButton: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: WHITE,
      alignItems: 'center',
      justifyContent: 'center',
    },


    sendButtonText: {
      color: '#000000',
      fontSize: 22,
      fontWeight: '600',
    },


    // ===============================================
    // NEW CHAT
    // ===============================================

    modalOverlay: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0,
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
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 15,
    },


    modalTitle: {
      color: WHITE,
      fontSize: 18,
      fontWeight: '600',
    },


    closeText: {
      color: SUB,
      fontSize: 30,
      fontWeight: '200',
    },


    searchResult: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginVertical: 4,
      borderRadius: 10,
      backgroundColor: SURFACE2,
      gap: 12,
    },


    searchAvatar: {
      width: 40,
      height: 40,
      borderRadius: 10,
      backgroundColor: HAIR,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },


    searchName: {
      color: WHITE,
      fontSize: 13,
      fontWeight: '500',
    },


    searchUsername: {
      color: SUB,
      fontSize: 11,
      marginTop: 3,
    },


    // ===============================================
    // SETTINGS
    // ===============================================

    settingsProfile: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: SURFACE,
      borderWidth: 1,
      borderColor: HAIR,
      borderRadius: 18,
      padding: 14,
      marginBottom: 20,
    },


    settingsAvatar: {
      width: 54,
      height: 54,
      borderRadius: 27,
      backgroundColor: BG,
      borderWidth: 1,
      borderColor: HAIR,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },


    settingsProfileName: {
      color: WHITE,
      fontSize: 15,
      fontWeight: '500',
    },


    settingsProfileHandle: {
      color: SUB,
      fontSize: 12,
      marginTop: 3,
    },


    settingsCategory: {
      color: SUB,
      fontSize: 10,
      fontWeight: '600',
      letterSpacing: 0.8,
      marginTop: 18,
      marginBottom: 7,
      marginLeft: 4,
    },


    settingsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: SURFACE,
      borderBottomWidth: 1,
      borderBottomColor: HAIR,
      paddingVertical: 14,
      paddingHorizontal: 12,
    },


    settingsIcon: {
      width: 34,
      fontSize: 19,
      textAlign: 'center',
      marginRight: 10,
    },


    settingsRowTitle: {
      color: WHITE,
      fontSize: 13.5,
      fontWeight: '500',
    },


    settingsRowSub: {
      color: SUB,
      fontSize: 11,
      marginTop: 3,
    },


    settingsArrow: {
      color: SUB,
      fontSize: 24,
      fontWeight: '300',
      marginLeft: 8,
    },


    settingsPage: {
      padding: 20,
      paddingBottom: 100,
    },


    settingsBack: {
      color: ACCENT,
      fontSize: 13,
      marginBottom: 24,
    },


    settingsPageTitle: {
      color: WHITE,
      fontSize: 22,
      fontWeight: '600',
      marginBottom: 8,
    },


    settingsPageDescription: {
      color: SUB,
      fontSize: 12.5,
      lineHeight: 19,
      marginBottom: 20,
    },


    settingsSectionTitle: {
      color: WHITE,
      fontSize: 14,
      fontWeight: '600',
      marginTop: 18,
      marginBottom: 7,
    },


    settingsBody: {
      color: '#B0B0B5',
      fontSize: 12.5,
      lineHeight: 20,
      marginBottom: 6,
    },


    infoBox: {
      backgroundColor: SURFACE,
      borderWidth: 1,
      borderColor: HAIR,
      borderRadius: 14,
      padding: 14,
      marginBottom: 10,
    },


    infoLabel: {
      color: SUB,
      fontSize: 10.5,
      marginBottom: 5,
    },


    infoValue: {
      color: WHITE,
      fontSize: 13,
      lineHeight: 19,
    },


    settingsLargeAvatar: {
      width: 88,
      height: 88,
      borderRadius: 44,
      backgroundColor: SURFACE,
      borderWidth: 1,
      borderColor: HAIR,
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'center',
      marginBottom: 14,
    },


    leaveSettingsRow: {
      marginTop: 30,
      borderWidth: 1,
      borderColor: 'rgba(255,69,58,0.35)',
      borderRadius: 14,
      padding: 14,
      alignItems: 'center',
    },


    leaveSettingsText: {
      color: RED,
      fontSize: 13,
      fontWeight: '500',
    },


    aboutLogo: {
      width: 82,
      height: 82,
      borderRadius: 41,
      backgroundColor: SURFACE,
      borderWidth: 1,
      borderColor: HAIR,
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'center',
      marginBottom: 16,
    },


    aboutLogoText: {
      color: WHITE,
      fontSize: 18,
      fontWeight: '500',
    },


    ringChar: {
      color: WHITE,
      fontSize: 18,
    },


    // ===============================================
    // BOTTOM NAV
    // ===============================================

    bottomNav: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: SURFACE,
      borderTopWidth: 1,
      borderTopColor: HAIR,
      flexDirection: 'row',
      paddingBottom: 4,
    },


    navItem: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
    },

    navIcon: {
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.5,
      color: SUB,
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