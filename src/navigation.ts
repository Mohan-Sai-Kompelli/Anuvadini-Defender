export type RootTabParamList = {
  Login: undefined;
  OrganizationSetup: undefined;
  AuthSelection: undefined;
  Home: undefined;
  Attendance: { method?: 'face' | 'iris' | 'voice' | 'thumb' | 'palm' } | undefined;
  IrisAuth: undefined;
  VoiceAuth: undefined;
  ThumbAuth: undefined;
  PalmAuth: undefined;
  StudentManagement: undefined;
  Photo: undefined;
  Profile: undefined;
  AttendanceDashboard: undefined;
  CalendarReport: undefined;
  UserDashboard: undefined;
  Request: undefined;
  HolidayCalendar: { month?: number; year?: number } | undefined;
  LeaveBalance: undefined;
  Teaching: undefined;
  Outreach: undefined;
  Schedule: undefined;
  Regularization: undefined;
  Memos: undefined;
  PairWorkPC: undefined;
};

export type DrawerParamList = {
  HomeTabs: undefined;
  AttendanceStack: undefined;
  LeaveStack: undefined;
  Settings: undefined;
};

export type AuthStackParamList = {
  Login: undefined;
  OrganizationSetup: undefined;
  AuthSelection: undefined;
  IrisAuth: undefined;
  VoiceAuth: undefined;
  ThumbAuth: undefined;
  PalmAuth: undefined;
  MainApp: undefined;
};
