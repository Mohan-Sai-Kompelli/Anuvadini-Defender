/**
 * LEGACY palette kept for backward compatibility with unmigrated screens.
 * Values are remapped to the SAACMS design tokens (src/design/tokens.ts).
 * New code should use useTheme() from src/design/ThemeContext instead.
 */
export const CustomColors = {
  teal: '#2C8395', // brand 500
  elecBlue: '#59B4C2', // brand 400
  backgroundGrayBlue: '#F0F9FA', // brand 50
  deepSkyBlue: '#0284C7', // info
  lightGray: '#F1F5F9', // slate 100
  // Additional colors for authentication system
  background: '#F8FAFC', // slate 50
  primary: '#2C8395', // brand 500
  text: '#0F172A', // slate 900
  textSecondary: '#64748B', // slate 500
  surface: '#FFFFFF',
  white: '#FFFFFF',
  border: '#E2E8F0', // slate 200
  success: '#16A34A',
  error: '#DC2626',
  warning: '#F59E0B',
  shadow: '#0F172A',
};
