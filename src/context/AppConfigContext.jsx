import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  defaultAppConfig,
  getAppConfig,
  saveAppConfig,
} from "../services/configuracionService";

const AppConfigContext = createContext(null);

function applyTheme(config) {
  const root = document.documentElement;

  root.style.setProperty("--primary", config.primaryColor || defaultAppConfig.primaryColor);
  root.style.setProperty("--secondary", config.secondaryColor || defaultAppConfig.secondaryColor);
  root.style.setProperty("--aqua", config.accentColor || defaultAppConfig.accentColor);
  root.style.setProperty("--soft-aqua", `${config.accentColor || defaultAppConfig.accentColor}22`);
}

export function AppConfigProvider({ children }) {
  const [config, setConfig] = useState(defaultAppConfig);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);

  async function refreshConfig() {
    setLoadingConfig(true);

    try {
      const data = await getAppConfig();
      setConfig(data);
      applyTheme(data);
      return data;
    } finally {
      setLoadingConfig(false);
    }
  }

  async function updateConfig(nextConfig) {
    setSavingConfig(true);

    try {
      const saved = await saveAppConfig(nextConfig);
      setConfig(saved);
      applyTheme(saved);
      return saved;
    } finally {
      setSavingConfig(false);
    }
  }

  useEffect(() => {
    refreshConfig();
  }, []);

  useEffect(() => {
    applyTheme(config);
  }, [config]);

  const value = useMemo(
    () => ({
      config,
      setConfig,
      loadingConfig,
      savingConfig,
      refreshConfig,
      updateConfig,
    }),
    [config, loadingConfig, savingConfig]
  );

  return (
    <AppConfigContext.Provider value={value}>
      {children}
    </AppConfigContext.Provider>
  );
}

export function useAppConfig() {
  const context = useContext(AppConfigContext);

  if (!context) {
    throw new Error("useAppConfig debe usarse dentro de AppConfigProvider");
  }

  return context;
}