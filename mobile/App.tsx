import { useEffect, useMemo, useState } from "react";
import { StatusBar, StyleSheet, Text, View } from "react-native";
import { currentUser, logout, setApiToken } from "./src/api";
import { clearSessionToken, readSessionToken, writeSessionToken } from "./src/storage";
import type { AuthUser } from "./src/types";
import { colors } from "./src/theme";
import { BrandHeader, ErrorNotice, Loading, Screen, Tabs } from "./src/ui";
import { AdminScreen } from "./src/screens/AdminScreen";
import { AuthScreen, type MobileLoginResult } from "./src/screens/AuthScreen";
import { ClientProjectsScreen } from "./src/screens/ClientProjectsScreen";
import { HomeScreen } from "./src/screens/HomeScreen";
import { AccountScreen, LegalScreen } from "./src/screens/LegalAccountScreen";
import { ProfessionalBillingScreen, ProfessionalOpportunitiesScreen } from "./src/screens/ProfessionalScreen";
import { SupportScreen } from "./src/screens/SupportScreen";

type TabId = "home" | "projects" | "billing" | "admin" | "support" | "legal" | "account";

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [booting, setBooting] = useState(true);
  const [bootError, setBootError] = useState("");
  const [tab, setTab] = useState<TabId>("home");

  useEffect(() => {
    let alive = true;
    async function restore() {
      try {
        const token = await readSessionToken();
        if (!token) return;
        setApiToken(token);
        const result = await currentUser();
        if (alive) setUser(result.user);
      } catch {
        setApiToken(null);
        await clearSessionToken().catch(() => undefined);
        if (alive) setBootError("La sesión anterior ha caducado. Inicia sesión de nuevo.");
      } finally {
        if (alive) setBooting(false);
      }
    }
    void restore();
    return () => { alive = false; };
  }, []);

  async function onAuthenticated(result: MobileLoginResult) {
    await writeSessionToken(result.token);
    setApiToken(result.token);
    setUser(result.user);
    setBootError("");
    setTab("home");
  }

  async function onLogout() {
    try {
      await logout();
    } catch {
      // Local logout still completes if the network is unavailable. The server token expires/revokes later.
    }
    setApiToken(null);
    await clearSessionToken().catch(() => undefined);
    setUser(null);
    setTab("home");
  }

  const tabs = useMemo(() => {
    if (!user) return [];
    if (user.role === "cliente") return [
      { id: "home", label: "Inicio" },
      { id: "projects", label: "Proyectos" },
      { id: "support", label: "Soporte" },
      { id: "legal", label: "Legal" },
      { id: "account", label: "Cuenta" },
    ];
    if (user.role === "profesional") return [
      { id: "home", label: "Inicio" },
      { id: "projects", label: "Oportunidades" },
      { id: "billing", label: "Facturación" },
      { id: "support", label: "Soporte" },
      { id: "legal", label: "Legal" },
      { id: "account", label: "Cuenta" },
    ];
    return [
      { id: "home", label: "Inicio" },
      { id: "admin", label: "Administración" },
      { id: "support", label: "Soporte" },
      { id: "legal", label: "Legal" },
      { id: "account", label: "Cuenta" },
    ];
  }, [user]);

  if (booting) {
    return (
      <Screen>
        <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
        <BrandHeader subtitle="iOS · Android" />
        <Loading label="Abriendo MiConstructor…" />
      </Screen>
    );
  }

  if (!user) {
    return (
      <>
        <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
        {bootError ? <View style={styles.bootError}><ErrorNotice message={bootError} /></View> : null}
        <AuthScreen onAuthenticated={onAuthenticated} />
      </>
    );
  }

  return (
    <Screen>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      <BrandHeader subtitle={`${roleLabel(user.role)} · ${user.email}`} />
      <Tabs items={tabs} active={tab} onChange={(id) => setTab(id as TabId)} />
      <View style={styles.content}>{renderTab(tab, user, onLogout)}</View>
      <Text style={styles.footer}>MiConstructor Mobile · sincronizado con miconstructor.es</Text>
    </Screen>
  );
}

function renderTab(tab: TabId, user: AuthUser, onLogout: () => Promise<void>) {
  if (tab === "home") return <HomeScreen user={user} />;
  if (tab === "support") return <SupportScreen user={user} />;
  if (tab === "legal") return <LegalScreen />;
  if (tab === "account") return <AccountScreen user={user} onLogout={onLogout} />;
  if (tab === "admin" && user.role === "admin") return <AdminScreen />;
  if (tab === "projects" && user.role === "cliente") return <ClientProjectsScreen />;
  if (tab === "projects" && user.role === "profesional") return <ProfessionalOpportunitiesScreen />;
  if (tab === "billing" && user.role === "profesional") return <ProfessionalBillingScreen />;
  return <HomeScreen user={user} />;
}

function roleLabel(role: AuthUser["role"]) {
  if (role === "cliente") return "Cliente";
  if (role === "profesional") return "Profesional";
  return "Administración";
}

const styles = StyleSheet.create({
  content: { marginTop: 6 },
  footer: { color: colors.muted, fontSize: 11, textAlign: "center", paddingTop: 10, paddingBottom: 4 },
  bootError: { position: "absolute", top: 16, left: 16, right: 16, zIndex: 10 },
});
