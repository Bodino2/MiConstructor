import { useEffect, useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import { API_BASE_URL, runtimeConfig } from "../api";
import { colors } from "../theme";
import type { AuthUser, RuntimeConfig } from "../types";
import { ActionButton, Badge, Card, ErrorNotice, Loading, Metric, SectionTitle } from "../ui";

export function LegalScreen() {
  const [config, setConfig] = useState<RuntimeConfig | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void runtimeConfig().then(setConfig).catch((caught) => setError(caught instanceof Error ? caught.message : "No se ha podido cargar la información legal."));
  }, []);

  if (!config && !error) return <Loading label="Cargando información legal…" />;
  return (
    <View style={styles.wrap}>
      <SectionTitle eyebrow="LEGAL Y PRIVACIDAD" title="Información y condiciones" detail="La app utiliza sesiones nativas almacenadas de forma segura. Las condiciones completas están publicadas en miconstructor.es." />
      {error ? <ErrorNotice message={error} /> : null}
      {config ? (
        <Card>
          <Text style={styles.title}>{config.legalEntityName || "MiConstructor"}</Text>
          <Text style={styles.meta}>{config.legalEntityType === "persona_fisica" ? "Persona física" : "Sociedad"}</Text>
          {config.legalTaxId ? <Text style={styles.text}>NIF/NIE: {config.legalTaxId}</Text> : null}
          {config.legalAddress ? <Text style={styles.text}>{config.legalAddress}</Text> : null}
          <Text style={styles.text}>{config.contactEmail}</Text>
          {config.contactPhone ? <Text style={styles.text}>{config.contactPhone}</Text> : null}
          <Badge value={config.legalIdentityComplete ? "IDENTIDAD LEGAL COMPLETA" : "PRE-LANZAMIENTO"} />
        </Card>
      ) : null}
      <LegalLink label="Aviso legal" path="/aviso-legal" />
      <LegalLink label="Política de Privacidad" path="/privacidad" />
      <LegalLink label="Política de Cookies (web)" path="/cookies" />
      <LegalLink label="Términos y Condiciones" path="/terminos" />
      <LegalLink label="Mandato y condiciones SEPA" path="/sepa" />
      <LegalLink label="Contacto y soporte" path="/contacto" />
      <Text style={styles.copyright}>© 2026 MiConstructor. Todos los derechos reservados.</Text>
    </View>
  );
}

function LegalLink({ label, path }: { label: string; path: string }) {
  return <ActionButton label={label} variant="secondary" onPress={() => void Linking.openURL(`${API_BASE_URL}${path}`)} />;
}

export function AccountScreen({ user, onLogout }: { user: AuthUser; onLogout: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <View style={styles.wrap}>
      <SectionTitle eyebrow="CUENTA" title={user.name} detail={user.email} />
      <Card>
        <Metric label="Rol" value={user.role} />
        <View style={styles.badges}><Badge value={user.accountStatus} /><Badge value={user.verificationStatus} /></View>
        <Text style={styles.meta}>La sesión móvil se guarda cifrada mediante el almacén seguro del sistema operativo. Al cerrar sesión, el token también se revoca en el servidor.</Text>
      </Card>
      <Card>
        <Text style={styles.title}>MiConstructor Mobile</Text>
        <Text style={styles.meta}>Versión 1.0.0 · iOS y Android</Text>
        <Text style={styles.meta}>API: {API_BASE_URL}</Text>
      </Card>
      <ActionButton label={busy ? "Cerrando sesión…" : "Cerrar sesión"} variant="danger" disabled={busy} onPress={() => { setBusy(true); void onLogout().finally(() => setBusy(false)); }} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  title: { color: colors.primary, fontWeight: "900", fontSize: 19 },
  meta: { color: colors.muted, lineHeight: 20 },
  text: { color: colors.text, lineHeight: 21 },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  copyright: { textAlign: "center", color: colors.muted, fontSize: 12, paddingVertical: 10 },
});
