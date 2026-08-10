import type { PropsWithChildren, ReactNode } from "react";
import {
  ActivityIndicator,
  KeyboardTypeOptions,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from "react-native";
import { colors, radius } from "./theme";

export function Screen({ children, scroll = true }: PropsWithChildren<{ scroll?: boolean }>) {
  return (
    <SafeAreaView style={styles.safe}>
      {scroll ? <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">{children}</ScrollView> : <View style={styles.screen}>{children}</View>}
    </SafeAreaView>
  );
}

export function BrandHeader({ subtitle }: { subtitle?: string }) {
  return (
    <View style={styles.brandWrap}>
      <View style={styles.mark}><Text style={styles.markText}>M</Text></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.brand}>MiConstructor</Text>
        {subtitle ? <Text style={styles.smallMuted}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

export function Card({ children }: PropsWithChildren) {
  return <View style={styles.card}>{children}</View>;
}

export function SectionTitle({ eyebrow, title, detail }: { eyebrow?: string; title: string; detail?: string }) {
  return (
    <View style={styles.sectionHead}>
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
      <Text style={styles.h2}>{title}</Text>
      {detail ? <Text style={styles.muted}>{detail}</Text> : null}
    </View>
  );
}

export function Field({ label, keyboardType, ...props }: TextInputProps & { label: string; keyboardType?: KeyboardTypeOptions }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        {...props}
        keyboardType={keyboardType}
        placeholderTextColor="#89969C"
        style={[styles.input, props.multiline ? styles.multiline : null, props.style]}
      />
    </View>
  );
}

export function ActionButton({
  label,
  onPress,
  variant = "primary",
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  disabled?: boolean;
}) {
  const palette = variant === "primary"
    ? styles.buttonPrimary
    : variant === "danger"
      ? styles.buttonDanger
      : variant === "ghost"
        ? styles.buttonGhost
        : styles.buttonSecondary;
  const text = variant === "primary" || variant === "danger" ? styles.buttonTextLight : styles.buttonTextDark;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled} style={({ pressed }) => [styles.button, palette, pressed && !disabled ? styles.buttonPressed : null, disabled ? styles.buttonDisabled : null]}>
      <Text style={[styles.buttonText, text]}>{label}</Text>
    </Pressable>
  );
}

export function Badge({ value }: { value: string }) {
  const upper = value.toUpperCase();
  const danger = upper.includes("SUSPEND") || upper.includes("RECHAZ") || upper.includes("FALLIDA") || upper.includes("CANCEL");
  const warn = upper.includes("PENDIENTE") || upper.includes("REVISION") || upper.includes("BORRADOR");
  return (
    <View style={[styles.badge, danger ? styles.badgeDanger : warn ? styles.badgeWarn : styles.badgeOk]}>
      <Text style={[styles.badgeText, danger ? styles.badgeTextDanger : warn ? styles.badgeTextWarn : styles.badgeTextOk]}>{value}</Text>
    </View>
  );
}

export function Loading({ label = "Cargando…" }: { label?: string }) {
  return <View style={styles.loading}><ActivityIndicator size="large" color={colors.cta} /><Text style={styles.muted}>{label}</Text></View>;
}

export function Empty({ title, detail }: { title: string; detail?: string }) {
  return <View style={styles.empty}><Text style={styles.emptyTitle}>{title}</Text>{detail ? <Text style={styles.muted}>{detail}</Text> : null}</View>;
}

export function ErrorNotice({ message }: { message: string }) {
  return <View style={styles.error}><Text style={styles.errorText}>{message}</Text></View>;
}

export function Metric({ label, value, extra }: { label: string; value: string | number; extra?: ReactNode }) {
  return <View style={styles.metric}><View style={{ flex: 1 }}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View>{extra}</View>;
}

export function Tabs({ items, active, onChange }: { items: Array<{ id: string; label: string }>; active: string; onChange: (id: string) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
      {items.map((item) => (
        <Pressable key={item.id} onPress={() => onChange(item.id)} style={[styles.tab, item.id === active ? styles.tabActive : null]}>
          <Text style={[styles.tabText, item.id === active ? styles.tabTextActive : null]}>{item.label}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

export function money(cents?: number | string | null) {
  const value = Number(cents || 0) / 100;
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(value);
}

export function shortDate(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-ES", { dateStyle: "medium" }).format(new Date(value));
}

export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  screen: { flexGrow: 1, paddingHorizontal: 18, paddingVertical: 18, gap: 14, backgroundColor: colors.background },
  brandWrap: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 4 },
  mark: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  markText: { color: "white", fontWeight: "900", fontSize: 22 },
  brand: { fontSize: 22, fontWeight: "900", color: colors.primary, letterSpacing: -0.6 },
  smallMuted: { fontSize: 12, color: colors.muted },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: 18, gap: 12, shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
  sectionHead: { gap: 5 },
  eyebrow: { fontSize: 11, fontWeight: "900", color: colors.cta, letterSpacing: 1.5 },
  h2: { fontSize: 27, fontWeight: "900", color: colors.text, letterSpacing: -0.7 },
  muted: { color: colors.muted, lineHeight: 21 },
  field: { gap: 7 },
  label: { color: colors.primary, fontWeight: "800", fontSize: 13 },
  input: { borderWidth: 1, borderColor: "#BCC6C9", borderRadius: radius.sm, paddingHorizontal: 13, paddingVertical: 12, color: colors.text, backgroundColor: "white", fontSize: 16 },
  multiline: { minHeight: 110, textAlignVertical: "top" },
  button: { minHeight: 48, borderRadius: radius.sm, paddingHorizontal: 16, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  buttonPrimary: { backgroundColor: colors.cta, borderColor: colors.cta },
  buttonSecondary: { backgroundColor: "white", borderColor: colors.primary },
  buttonDanger: { backgroundColor: colors.danger, borderColor: colors.danger },
  buttonGhost: { backgroundColor: "transparent", borderColor: colors.border },
  buttonPressed: { opacity: 0.82 },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { fontWeight: "900", fontSize: 15 },
  buttonTextLight: { color: "white" },
  buttonTextDark: { color: colors.primary },
  badge: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  badgeOk: { backgroundColor: colors.successSoft },
  badgeWarn: { backgroundColor: colors.warningSoft },
  badgeDanger: { backgroundColor: colors.dangerSoft },
  badgeText: { fontSize: 11, fontWeight: "900" },
  badgeTextOk: { color: "#14615D" },
  badgeTextWarn: { color: colors.warning },
  badgeTextDanger: { color: colors.danger },
  loading: { minHeight: 220, alignItems: "center", justifyContent: "center", gap: 12 },
  empty: { borderWidth: 1, borderStyle: "dashed", borderColor: "#AAB6BA", borderRadius: radius.md, padding: 24, gap: 6, alignItems: "center" },
  emptyTitle: { fontWeight: "900", color: colors.primary, fontSize: 16 },
  error: { borderLeftWidth: 4, borderLeftColor: colors.danger, backgroundColor: colors.dangerSoft, borderRadius: 8, padding: 12 },
  errorText: { color: colors.danger, fontWeight: "700", lineHeight: 20 },
  metric: { flexDirection: "row", gap: 10, alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  metricLabel: { fontSize: 12, color: colors.muted, fontWeight: "700" },
  metricValue: { fontSize: 20, color: colors.primary, fontWeight: "900", marginTop: 2 },
  tabs: { gap: 8, paddingVertical: 4 },
  tab: { borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: "white", paddingHorizontal: 14, paddingVertical: 9 },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { color: colors.primary, fontWeight: "800" },
  tabTextActive: { color: "white" },
});
