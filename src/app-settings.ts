import * as React from "react";

// Was previously the Delegate enum from react-native-mediapipe (GPU/CPU).
// That library is incompatible with this React Native version, so we keep a
// plain string type for backwards-compatibility with existing settings.
export type Delegate = "GPU" | "CPU";

export type AppSettings = {
  maxResults: number;
  threshold: number;
  processor: Delegate;
  model: string;
};

export const SettingsContext = React.createContext<
  | {
      settings: AppSettings;
      setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
    }
  | undefined
>(undefined);

export const useSettings = () => {
  const context = React.useContext(SettingsContext);
  if (!context) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return context;
};
