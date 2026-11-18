import * as React from "react";
import { DatabaseProvider } from "@nozbe/watermelondb/DatabaseProvider";
import { database } from "./db";
import { LoginScreen } from "./LoginScreen";
import { SplashScreen } from "./SplashScreen";
import { AttendanceScreen } from "./AttendanceScreen";
import { RequestScreen } from "./RequestScreen";
// Everything below is reachable via tab/navigation, not needed the instant the
// app opens — eagerly importing all ~20 of these (the previous state) meant
// every one of these files' top-level code, including heavy ones like
// CameraStream's ML Kit/TFLite/vision-camera dependencies pulled in by the
// biometric-auth screens, got parsed and initialized during cold start
// regardless of which tab (if any) the user actually opens first.
// React.lazy() defers that to first navigation instead. Attendance and
// Request stay eager above — they're the two flows used on essentially every
// app open, so deferring them would trade a cold-start win for a visible
// flash on the most common path.
const AttendanceDashboard = React.lazy(() =>
  import("./AttendanceDashboard").then((m) => ({ default: m.AttendanceDashboard }))
);
const CalendarReportScreen = React.lazy(() =>
  import("./CalendarReportScreen").then((m) => ({ default: m.CalendarReportScreen }))
);
const Settings = React.lazy(() => import("./Settings").then((m) => ({ default: m.Settings })));
const IrisAuthScreen = React.lazy(() =>
  import("./IrisAuthScreen").then((m) => ({ default: m.IrisAuthScreen }))
);
const VoiceAuthScreen = React.lazy(() =>
  import("./VoiceAuthScreen").then((m) => ({ default: m.VoiceAuthScreen }))
);
const ThumbAuthScreen = React.lazy(() =>
  import("./ThumbAuthScreen").then((m) => ({ default: m.ThumbAuthScreen }))
);
const PalmAuthScreen = React.lazy(() =>
  import("./PalmAuthScreen").then((m) => ({ default: m.PalmAuthScreen }))
);
const HolidayCalendarScreen = React.lazy(() =>
  import("./HolidayCalendarScreen").then((m) => ({ default: m.HolidayCalendarScreen }))
);
const TeachingScreen = React.lazy(() =>
  import("./TeachingScreen").then((m) => ({ default: m.TeachingScreen }))
);
const OutreachScreen = React.lazy(() =>
  import("./OutreachScreen").then((m) => ({ default: m.OutreachScreen }))
);
const ScheduleScreen = React.lazy(() =>
  import("./ScheduleScreen").then((m) => ({ default: m.ScheduleScreen }))
);
const RegularizationScreen = React.lazy(() => import("./RegularizationScreen"));
const MemosScreen = React.lazy(() => import("./MemosScreen"));
const PairWorkPCScreen = React.lazy(() => import("./PairWorkPCScreen"));
const LeaveBalanceScreen = React.lazy(() =>
  import("./LeaveBalanceScreen").then((m) => ({ default: m.LeaveBalanceScreen }))
);
// UserDashboardNew import kept eager below — not lazy, see note at its usage.
import { UserDashboardNew } from "./UserDashboardNew";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { type RootTabParamList } from "./navigation";
import Ionicons from "react-native-vector-icons/Ionicons";
import type { AppSettings } from "./app-settings";
import { SettingsContext } from "./app-settings";
import { AuthProvider, useAuth } from "./AuthContext";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Image } from 'react-native';
import { appInitService } from './services/appInitService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { requestNotificationPermission } from './utils/location';
import { Theme } from './theme';
import { FloatingTabBar } from './components/ui/FloatingTabBar';
import { TabBarScrollProvider } from './components/ui/tabBarScroll';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import './services/backgroundMessageHandler';

const Tab = createBottomTabNavigator<RootTabParamList>();

const MainApp: React.FC = () => {
  const { user, logout } = useAuth();
  const [settings, setSettings] = React.useState<AppSettings>({
    maxResults: 5,
    threshold: 20,
    processor: "GPU",
    model: "efficientdet-lite0",
  });

  // Initialize app services when user logs in
  React.useEffect(() => {
    if (user?.role === 'student') {
      console.log('User logged in, initializing app services...');
      
      // Initialize services with proper error handling
      const initializeServices = async () => {
        try {
          await appInitService.initialize();
          console.log('App services initialized successfully');
        } catch (error) {
          console.error('Failed to initialize app services:', error);
          // Retry initialization after 2 seconds
          setTimeout(() => {
            appInitService.initialize().catch(err => {
              console.error('Retry failed:', err);
            });
          }, 2000);
        }
      };
      
      initializeServices();
    }

    // Cleanup when user logs out
    return () => {
      if (user?.role === 'student') {
        appInitService.cleanup().catch(error => {
          console.error('Failed to cleanup app services:', error);
        });
      }
    };
  }, [user]);

  return (
    <SettingsContext.Provider value={{ settings, setSettings }}>
      <TabBarScrollProvider>
      {/* Covers every React.lazy() screen above — required for React.lazy to
          work with React Navigation at all: without a Suspense boundary
          somewhere above the lazy component, navigating to one throws
          instead of showing the fallback while it loads. Reuses the same
          SplashScreen already used for the app's initial load, so a lazy
          screen's first-open moment looks like "briefly reappeared splash",
          not a jarring blank frame. */}
      <React.Suspense fallback={<SplashScreen />}>
      <Tab.Navigator
        initialRouteName="Attendance"
        tabBar={(props) => <FloatingTabBar {...props} />}
        screenOptions={() => ({
          headerStyle: { backgroundColor: '#FFFFFF' },
          headerTintColor: '#0F172A',
          headerShadowVisible: false,
          headerRight: () => (
            <Ionicons
              name="log-out-outline"
              size={22}
              color="#8B92A2"
              style={{ marginRight: 16 }}
              onPress={() => logout()}
            />
          ),
        })}
      >
        {user?.role === 'student' && (
          // Student screens
          <>
            <Tab.Screen
              name="Attendance"
              component={AttendanceScreen}
              options={{
                title: 'Attendance',
                headerShown: false,
                headerTitle: () => (
                  <Image
                    source={require('./assets/anuvadini-logo-removebg-preview.png')}
                    style={{ width: 200, height: 60, resizeMode: 'contain' }}
                  />
                ),
                headerStyle: {
                  backgroundColor: '#FFFFFF',
                },
              }}
            />
            <Tab.Screen
              name="UserDashboard"
              component={CalendarReportScreen}
              options={{
                title: 'Dashboard',
                // Immersive: the calendar dashboard renders its own header.
                headerShown: false,
              }}
            />
            <Tab.Screen
              name="Request"
              component={RequestScreen}
              options={{
                title: 'Requests',
                headerTitle: () => (
                  <Image
                    source={require('./assets/anuvadini-logo-removebg-preview.png')}
                    style={{ width: 200, height: 60, resizeMode: 'contain' }}
                  />
                ),
                headerStyle: {
                  backgroundColor: '#FFFFFF',
                },
              }}
            />
            <Tab.Screen
              name="IrisAuth"
              component={IrisAuthScreen}
              options={{
                title: "Iris Authentication",
                headerTitle: () => (
                  <Image
                    source={require('./assets/anuvadini-logo-removebg-preview.png')}
                    style={{ width: 200, height: 60, resizeMode: 'contain' }}
                  />
                ),
                headerStyle: { backgroundColor: '#FFFFFF' },
                tabBarButton: () => null,
                tabBarStyle: { display: 'none' },
              }}
            />
            <Tab.Screen
              name="VoiceAuth"
              component={VoiceAuthScreen}
              options={{
                title: "Voice Authentication",
                headerTitle: () => (
                  <Image
                    source={require('./assets/anuvadini-logo-removebg-preview.png')}
                    style={{ width: 200, height: 60, resizeMode: 'contain' }}
                  />
                ),
                headerStyle: { backgroundColor: '#FFFFFF' },
                tabBarButton: () => null,
                tabBarStyle: { display: 'none' },
              }}
            />
            <Tab.Screen
              name="ThumbAuth"
              component={ThumbAuthScreen}
              options={{
                title: "Thumb Authentication",
                headerTitle: () => (
                  <Image
                    source={require('./assets/anuvadini-logo-removebg-preview.png')}
                    style={{ width: 200, height: 60, resizeMode: 'contain' }}
                  />
                ),
                headerStyle: { backgroundColor: '#FFFFFF' },
                tabBarButton: () => null,
                tabBarStyle: { display: 'none' },
              }}
            />
            <Tab.Screen
              name="PalmAuth"
              component={PalmAuthScreen}
              options={{
                title: "Palm Authentication",
                headerTitle: () => (
                  <Image
                    source={require('./assets/anuvadini-logo-removebg-preview.png')}
                    style={{ width: 200, height: 60, resizeMode: 'contain' }}
                  />
                ),
                headerStyle: { backgroundColor: '#FFFFFF' },
                tabBarButton: () => null,
                tabBarStyle: { display: 'none' },
              }}
            />
            <Tab.Screen
              name="PairWorkPC"
              component={PairWorkPCScreen}
              options={{
                headerShown: false,
                tabBarButton: () => null,
              }}
            />
            <Tab.Screen
              name="AttendanceDashboard"
              component={AttendanceDashboard}
              options={{
                title: 'Attendance Report',
                headerTitle: () => (
                  <Image
                    source={require('./assets/anuvadini-logo-removebg-preview.png')}
                    style={{ width: 200, height: 60, resizeMode: 'contain' }}
                  />
                ),
                headerStyle: { backgroundColor: '#FFFFFF' },
                tabBarButton: () => null,
              }}
            />
            <Tab.Screen
              name="CalendarReport"
              component={CalendarReportScreen}
              options={{
                title: 'Calendar Report',
                headerTitle: () => (
                  <Image
                    source={require('./assets/anuvadini-logo-removebg-preview.png')}
                    style={{ width: 200, height: 60, resizeMode: 'contain' }}
                  />
                ),
                headerStyle: { backgroundColor: '#FFFFFF' },
                tabBarButton: () => null,
              }}
            />
            <Tab.Screen
              name="HolidayCalendar"
              component={HolidayCalendarScreen}
              options={{
                title: 'Holiday Calendar',
                headerTitle: () => (
                  <Image
                    source={require('./assets/anuvadini-logo-removebg-preview.png')}
                    style={{ width: 200, height: 60, resizeMode: 'contain' }}
                  />
                ),
                headerStyle: { backgroundColor: '#FFFFFF' },
                tabBarButton: () => null,
              }}
            />
            <Tab.Screen
              name="LeaveBalance"
              component={LeaveBalanceScreen}
              options={{
                title: 'Leave Balance',
                headerTitle: () => (
                  <Image
                    source={require('./assets/anuvadini-logo-removebg-preview.png')}
                    style={{ width: 200, height: 60, resizeMode: 'contain' }}
                  />
                ),
                headerStyle: { backgroundColor: '#FFFFFF' },
                tabBarButton: () => null,
              }}
            />
            <Tab.Screen
              name="Teaching"
              component={TeachingScreen}
              options={{
                title: 'Teaching Log',
                headerTitle: () => (
                  <Image
                    source={require('./assets/anuvadini-logo-removebg-preview.png')}
                    style={{ width: 200, height: 60, resizeMode: 'contain' }}
                  />
                ),
                headerStyle: { backgroundColor: '#FFFFFF' },
                tabBarButton: () => null,
              }}
            />
            <Tab.Screen
              name="Outreach"
              component={OutreachScreen}
              options={{
                title: 'Outreach',
                headerTitle: () => (
                  <Image
                    source={require('./assets/anuvadini-logo-removebg-preview.png')}
                    style={{ width: 200, height: 60, resizeMode: 'contain' }}
                  />
                ),
                headerStyle: { backgroundColor: '#FFFFFF' },
                tabBarButton: () => null,
              }}
            />
            <Tab.Screen
              name="Schedule"
              component={ScheduleScreen}
              options={{
                title: 'My Schedule',
                headerTitle: () => (
                  <Image
                    source={require('./assets/anuvadini-logo-removebg-preview.png')}
                    style={{ width: 200, height: 60, resizeMode: 'contain' }}
                  />
                ),
                headerStyle: { backgroundColor: '#FFFFFF' },
                tabBarButton: () => null,
              }}
            />
        <Tab.Screen
          name="Profile"
          component={Settings}
          options={{
            headerTitle: () => (
              <Image
                source={require('./assets/anuvadini-logo-removebg-preview.png')}
                style={{ width: 200, height: 60, resizeMode: 'contain' }}
              />
            ),
            headerStyle: {
              backgroundColor: '#FFFFFF',
            },
          }}
            />
          </>
        )}
            <Tab.Screen
              name="Regularization"
              component={RegularizationScreen}
              options={{
                title: 'Regularization',
                headerTitle: () => (
                  <Image
                    source={require('./assets/anuvadini-logo-removebg-preview.png')}
                    style={{ width: 200, height: 60, resizeMode: 'contain' }}
                  />
                ),
                headerStyle: { backgroundColor: '#FFFFFF' },
                tabBarButton: () => null,
              }}
            />
            <Tab.Screen
              name="Memos"
              component={MemosScreen}
              options={{
                title: 'Compliance Warnings',
                headerTitle: () => (
                  <Image
                    source={require('./assets/anuvadini-logo-removebg-preview.png')}
                    style={{ width: 200, height: 60, resizeMode: 'contain' }}
                  />
                ),
                headerStyle: { backgroundColor: '#FFFFFF' },
                tabBarButton: () => null,
              }}
            />
          </Tab.Navigator>
      </React.Suspense>
      {/* key={user.id} forces a full remount (fresh activeId/handledIdsRef/etc.)
          whenever the logged-in account changes. SpotCheckResponder is mounted
          once here for the whole app session and was never unmounted across a
          logout → different-account login on the SAME device — its internal
          refs (which spot-check is active, which ids are "already handled")
          silently carried over from the previous account. The next account to
          log in on that phone could then see a brand new spot-check meant for
          THEM get immediately dismissed as "already handled on another
          device", because the component still thought the PREVIOUS account's
          (already-resolved/expired) spot-check was the active one. */}
      </TabBarScrollProvider>
    </SettingsContext.Provider>
  );
};

const AppContent: React.FC = () => {
  const { user, isLoading } = useAuth();

  // Ask for notification permission once, on first launch after install — so
  // spot-checks and alerts can reach the device (even before the first login).
  React.useEffect(() => {
    (async () => {
      try {
        const asked = await AsyncStorage.getItem('notifPermAsked');
        if (!asked) {
          await requestNotificationPermission();
          await AsyncStorage.setItem('notifPermAsked', '1');
        }
      } catch {
        /* best-effort */
      }
    })();
  }, []);

  if (isLoading) {
    return <SplashScreen />;
  }

  if (!user) {
    return <LoginScreen />;
  }

  return <MainApp />;
};

function App() {
  return (
    // Root safety net — catches any uncaught render error anywhere below
    // (login, security gate, every screen) and shows a recoverable "Something
    // went wrong" screen instead of leaving the user on a dead white/blank
    // screen or a full native crash. Must wrap EVERYTHING, including
    // SafeAreaProvider, since a provider failing counts too.
    <AppErrorBoundary>
      <SafeAreaProvider>
        <DatabaseProvider database={database}>
          <AuthProvider>
            <NavigationContainer>
              <AppContent />
            </NavigationContainer>
          </AuthProvider>
        </DatabaseProvider>
      </SafeAreaProvider>
    </AppErrorBoundary>
  );
}

export default App;
