import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import {
  assessment as loadAssessment,
  forgotPassword,
  mobileLogin,
  registerAccount,
  specialties as loadSpecialties,
} from "../api";
import { colors } from "../theme";
import type { Assessment, AuthUser, Specialty } from "../types";
import { ActionButton, BrandHeader, Card, ErrorNotice, Field, Loading, Screen, SectionTitle } from "../ui";

export type MobileLoginResult = { token: string; user: AuthUser };

type Mode = "login" | "register" | "forgot" | "registered";

export function AuthScreen({ onAuthenticated }: { onAuthenticated: (result: MobileLoginResult) => Promise<void> }) {
  const [mode, setMode] = useState<Mode>("login");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function signIn() {
    setError("");
    setBusy(true);
    try {
      const result = await mobileLogin(email.trim(), password);
      await onAuthenticated({ token: result.token, user: result.user });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se ha podido iniciar sesión.");
    } finally {
      setBusy(false);
    }
  }

  async function requestReset() {
    setError("");
    setBusy(true);
    try {
      await forgotPassword(email.trim());
      Alert.alert("Revisa tu email", "Si la cuenta existe, recibirás las instrucciones para restablecer la contraseña.");
      setMode("login");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se ha podido solicitar el restablecimiento.");
    } finally {
      setBusy(false);
    }
  }

  if (mode === "register") return <RegisterScreen onBack={() => setMode("login")} onRegistered={() => setMode("registered")} />;
  if (mode === "registered") {
    return (
      <Screen>
        <BrandHeader subtitle="iOS · Android" />
        <Card>
          <SectionTitle eyebrow="CUENTA CREADA" title="Verifica tu email" detail="Te hemos enviado un enlace de activación. Después podrás iniciar sesión desde la app." />
          <ActionButton label="Volver al acceso" onPress={() => setMode("login")} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <BrandHeader subtitle="Reformas con control y trazabilidad" />
      <Card>
        <SectionTitle eyebrow="ACCESO SEGURO" title={mode === "forgot" ? "Recupera tu acceso" : "Entrar en MiConstructor"} detail={mode === "forgot" ? "Te enviaremos un enlace seguro al email de tu cuenta." : "Gestiona proyectos, profesionales, verificaciones y soporte desde tu móvil."} />
        {error ? <ErrorNotice message={error} /> : null}
        <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="emailAddress" />
        {mode === "login" ? <Field label="Contraseña" value={password} onChangeText={setPassword} secureTextEntry textContentType="password" /> : null}
        <ActionButton label={busy ? "Procesando…" : mode === "forgot" ? "Enviar enlace" : "Entrar"} disabled={busy || !email.trim() || (mode === "login" && !password)} onPress={mode === "forgot" ? requestReset : signIn} />
        {mode === "login" ? (
          <>
            <ActionButton label="He olvidado mi contraseña" variant="ghost" onPress={() => { setError(""); setMode("forgot"); }} />
            <ActionButton label="Crear cuenta" variant="secondary" onPress={() => { setError(""); setMode("register"); }} />
          </>
        ) : <ActionButton label="Volver" variant="ghost" onPress={() => setMode("login")} />}
      </Card>
      <Text style={styles.legal}>Al usar MiConstructor se aplican la Política de Privacidad y los Términos y Condiciones vigentes.</Text>
    </Screen>
  );
}

function RegisterScreen({ onBack, onRegistered }: { onBack: () => void; onRegistered: () => void }) {
  const [role, setRole] = useState<"cliente" | "profesional">("cliente");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [taxId, setTaxId] = useState("");
  const [password, setPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [phone, setPhone] = useState("");
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [specialty, setSpecialty] = useState("");
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadingAssessment, setLoadingAssessment] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void loadSpecialties().then((result) => setSpecialties(result.specialties)).catch(() => setSpecialties([]));
  }, []);

  useEffect(() => {
    if (role !== "profesional" || !specialty) {
      setAssessment(null);
      setAnswers({});
      return;
    }
    setLoadingAssessment(true);
    void loadAssessment(specialty)
      .then((result) => { setAssessment(result.assessment); setAnswers({}); })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "No se ha podido cargar la evaluación."))
      .finally(() => setLoadingAssessment(false));
  }, [role, specialty]);

  const answeredCount = useMemo(() => Object.values(answers).filter(Boolean).length, [answers]);

  async function submit() {
    setError("");
    if (!privacyAccepted || !termsAccepted) {
      setError("Debes aceptar la Política de Privacidad y los Términos y Condiciones.");
      return;
    }
    if (role === "profesional") {
      if (!companyName.trim() || !phone.trim() || !specialty || !assessment) {
        setError("Empresa, teléfono, especialidad y test técnico son obligatorios para profesionales.");
        return;
      }
      if (answeredCount !== assessment.questions.length) {
        setError(`Debes responder las ${assessment.questions.length} preguntas del test técnico.`);
        return;
      }
    }
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        email: email.trim(),
        password,
        role,
        taxId: taxId.trim(),
        privacyAccepted: true,
        termsAccepted: true,
      };
      if (role === "profesional" && assessment) {
        payload.companyName = companyName.trim();
        payload.phone = phone.trim();
        payload.specialty = specialty;
        payload.assessment = { version: assessment.version, respuestas: answers };
      }
      await registerAccount(payload);
      onRegistered();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se ha podido crear la cuenta.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <BrandHeader subtitle="Alta de usuario" />
      <Card>
        <SectionTitle eyebrow="REGISTRO" title="Crea tu cuenta" detail="Los profesionales deben superar el test específico de su oficio antes de solicitar verificación." />
        {error ? <ErrorNotice message={error} /> : null}
        <Text style={styles.label}>Tipo de cuenta</Text>
        <View style={styles.choiceRow}>
          <Choice label="Cliente" selected={role === "cliente"} onPress={() => setRole("cliente")} />
          <Choice label="Profesional / empresa" selected={role === "profesional"} onPress={() => setRole("profesional")} />
        </View>
        <Field label="Nombre completo" value={name} onChangeText={setName} textContentType="name" />
        <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" />
        <Field label="NIF / NIE / CIF" value={taxId} onChangeText={setTaxId} autoCapitalize="characters" autoCorrect={false} />
        <Field label="Contraseña" value={password} onChangeText={setPassword} secureTextEntry textContentType="newPassword" placeholder="12+ caracteres, mayúscula, minúscula y número" />

        {role === "profesional" ? (
          <>
            <Field label="Empresa / razón social" value={companyName} onChangeText={setCompanyName} />
            <Field label="Teléfono" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
            <Text style={styles.label}>Especialidad principal</Text>
            <View style={styles.optionList}>
              {specialties.map((item) => <Choice key={item.slug} label={item.label} selected={specialty === item.slug} onPress={() => setSpecialty(item.slug)} />)}
            </View>
            {loadingAssessment ? <Loading label="Cargando test técnico…" /> : null}
            {assessment ? (
              <View style={styles.assessment}>
                <Text style={styles.assessmentTitle}>Test técnico · {answeredCount}/{assessment.questions.length}</Text>
                <Text style={styles.muted}>Debes obtener al menos {assessment.passScore}%.</Text>
                {assessment.questions.map((question, index) => (
                  <View key={question.id} style={styles.question}>
                    <Text style={styles.questionTitle}>{index + 1}. {question.prompt}</Text>
                    {question.options.map((option) => (
                      <Pressable key={option.id} onPress={() => setAnswers((current) => ({ ...current, [question.id]: option.id }))} style={[styles.answer, answers[question.id] === option.id ? styles.answerSelected : null]}>
                        <Text style={[styles.answerText, answers[question.id] === option.id ? styles.answerTextSelected : null]}>{option.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                ))}
              </View>
            ) : null}
          </>
        ) : null}

        <CheckRow label="Acepto la Política de Privacidad y el tratamiento necesario para prestar el servicio." checked={privacyAccepted} onPress={() => setPrivacyAccepted((value) => !value)} />
        <CheckRow label="He leído y acepto los Términos y Condiciones de MiConstructor." checked={termsAccepted} onPress={() => setTermsAccepted((value) => !value)} />
        <ActionButton label={busy ? "Creando cuenta…" : "Crear cuenta"} disabled={busy || !name.trim() || !email.trim() || !taxId.trim() || password.length < 12} onPress={submit} />
        <ActionButton label="Volver al acceso" variant="ghost" onPress={onBack} />
      </Card>
    </Screen>
  );
}

function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.choice, selected ? styles.choiceSelected : null]}>
      <Text style={[styles.choiceText, selected ? styles.choiceTextSelected : null]}>{label}</Text>
    </Pressable>
  );
}

function CheckRow({ label, checked, onPress }: { label: string; checked: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.checkRow}>
      <View style={[styles.checkBox, checked ? styles.checkBoxOn : null]}><Text style={styles.checkMark}>{checked ? "✓" : ""}</Text></View>
      <Text style={styles.checkText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  legal: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: "center", paddingHorizontal: 14 },
  label: { color: colors.primary, fontWeight: "800", fontSize: 13 },
  choiceRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  optionList: { gap: 8 },
  choice: { borderWidth: 1, borderColor: colors.border, backgroundColor: "white", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  choiceSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  choiceText: { color: colors.primary, fontWeight: "800" },
  choiceTextSelected: { color: "white" },
  assessment: { gap: 12, marginTop: 4 },
  assessmentTitle: { fontWeight: "900", fontSize: 18, color: colors.primary },
  muted: { color: colors.muted },
  question: { backgroundColor: "#FBFBF9", borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 13, gap: 8 },
  questionTitle: { fontWeight: "800", color: colors.text, lineHeight: 20 },
  answer: { padding: 10, borderRadius: 9, borderWidth: 1, borderColor: colors.border, backgroundColor: "white" },
  answerSelected: { backgroundColor: "#EDF8F6", borderColor: colors.accent },
  answerText: { color: colors.text, lineHeight: 19 },
  answerTextSelected: { color: "#14615D", fontWeight: "800" },
  checkRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 4 },
  checkBox: { width: 24, height: 24, borderWidth: 1, borderColor: colors.neutral, borderRadius: 6, alignItems: "center", justifyContent: "center", backgroundColor: "white" },
  checkBoxOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkMark: { color: "white", fontWeight: "900" },
  checkText: { flex: 1, color: colors.text, lineHeight: 20 },
});
