export const HOME_SERVICE_PASS_SCORE = 80;
export const HOME_SERVICE_QUESTION_COUNT = 15;

function createBank(slug, label, rows) {
  if (rows.length !== HOME_SERVICE_QUESTION_COUNT) throw new Error(`${slug} debe tener 15 preguntas.`);
  return {
    slug,
    label,
    version: `2026-08-11-${slug}-1`,
    questions: rows.map(([id, prompt, correct, wrongOne, wrongTwo], index) => {
      const correctPosition = index % 3;
      const options = [wrongOne, wrongTwo];
      options.splice(correctPosition, 0, correct);
      return {
        id: `${slug}_${id}`,
        prompt,
        options: options.map((text, optionIndex) => ({ id: ["a", "b", "c"][optionIndex], label: text })),
        correctOption: ["a", "b", "c"][correctPosition],
      };
    }),
  };
}

const BANKS = {
  limpieza_profesional: createBank("limpieza_profesional", "Limpieza profesional", [
    ["superficies", "Antes de aplicar un producto sobre una superficie desconocida, ¿qué debe hacerse?", "Identificar el material, revisar el producto y probar en una zona poco visible", "Aplicar el producto más fuerte disponible", "Mezclar dos productos para aumentar su efecto"],
    ["mezclas", "¿Qué regla es esencial al trabajar con productos químicos de limpieza?", "No mezclar productos incompatibles y respetar etiqueta y ficha de seguridad", "Mezclar lejía con productos ácidos si hay ventilación", "Cambiar el envase por uno sin etiqueta para trabajar más rápido"],
    ["microfibra", "¿Cómo se reduce la contaminación cruzada entre baño, cocina y otras zonas?", "Separando paños/equipos por zonas y aplicando un orden de trabajo definido", "Usando el mismo paño si se aclara con agua", "Limpiando primero las zonas más sucias con todo el material"],
    ["alto_bajo", "En una limpieza general, ¿qué secuencia ayuda a evitar rehacer trabajo?", "Trabajar de arriba hacia abajo y de zonas menos contaminadas a más contaminadas", "Fregar el suelo antes de quitar el polvo", "Empezar siempre por el baño y terminar por superficies altas"],
    ["dilucion", "Un producto concentrado indica una dilución concreta. ¿Qué debe hacer el profesional?", "Medir y respetar la dilución indicada", "Usarlo puro para reducir el tiempo", "Diluirlo a ojo según el olor"],
    ["piedra", "¿Por qué hay que extremar precauciones con mármol y otras piedras calcáreas?", "Los ácidos pueden atacar la superficie y producir daños irreversibles", "Solo se dañan con agua fría", "Admiten cualquier desincrustante si se seca rápido"],
    ["electricidad", "Al limpiar cerca de enchufes, equipos o cuadros eléctricos, ¿qué principio debe seguirse?", "Evitar humedad peligrosa y aplicar un procedimiento seguro según el equipo y la instalación", "Pulverizar directamente para arrastrar el polvo", "Introducir paños húmedos dentro de cualquier equipo desconectado"],
    ["cristales", "¿Qué debe comprobarse antes de limpiar cristales en altura o zonas de difícil acceso?", "Acceso seguro, estabilidad, riesgo de caída y método adecuado", "Solo que haya suficiente producto", "Que el cristal esté caliente para que seque antes"],
    ["fin_obra", "En una limpieza fin de obra con polvo fino, ¿qué método es más adecuado?", "Retirada controlada con aspiración/equipos adecuados antes de limpieza húmeda", "Barrer en seco rápidamente para levantar todo el polvo", "Aplicar ambientador antes de retirar residuos"],
    ["residuos", "¿Cómo deben gestionarse residuos o envases de productos que requieren tratamiento específico?", "Separarlos y seguir las indicaciones y circuito de gestión aplicable", "Verter restos líquidos en cualquier desagüe", "Mezclarlos con residuos domésticos sin revisar etiquetas"],
    ["textiles", "Antes de tratar una mancha en tapicería o alfombra, ¿qué debe comprobarse?", "Composición, solidez del color y compatibilidad del método/producto", "Solo el tamaño de la mancha", "Aplicar agua caliente en todos los tejidos"],
    ["higiene", "¿Qué práctica mejora la higiene de útiles reutilizables al terminar el servicio?", "Limpiar, desinfectar cuando corresponda, secar y almacenar correctamente", "Guardarlos húmedos en una bolsa cerrada", "Usarlos en el siguiente domicilio sin tratamiento si parecen limpios"],
    ["ventilacion", "Si un producto exige ventilación durante su uso, ¿qué debe hacerse?", "Asegurar la ventilación indicada y utilizar los equipos de protección necesarios", "Cerrar puertas y ventanas para concentrar el efecto", "Reducir el tiempo de contacto por debajo de lo indicado"],
    ["plan", "¿Qué hace profesional un servicio recurrente de limpieza?", "Definir alcance, frecuencia, prioridades, tiempos y registro de incidencias", "Cambiar las tareas cada visita sin informar", "Limpiar únicamente lo que sea visualmente evidente"],
    ["incidencia", "Se detecta una fuga de agua o daño relevante durante la limpieza. ¿Qué actuación es correcta?", "Detener la tarea afectada, limitar el riesgo y comunicar/documentar la incidencia", "Ocultarla y continuar para terminar a tiempo", "Intentar una reparación no autorizada aunque no sea de su competencia"],
  ]),
  jardineria: createBank("jardineria", "Jardinería y mantenimiento exterior", [
    ["especie", "Antes de podar una planta o árbol, ¿qué debe identificarse?", "Especie, estado, época adecuada, objetivo y riesgos de la intervención", "Solo la altura", "Únicamente la herramienta disponible"],
    ["riego", "¿Cómo debe decidirse la frecuencia de riego?", "Según especie, suelo, clima, exposición, estación y humedad real", "Con la misma frecuencia todo el año", "Regando siempre a diario"],
    ["poda", "¿Qué característica debe tener un corte de poda correcto?", "Ser limpio, bien ubicado y adecuado al diámetro y estructura de la planta", "Dejar siempre un tocón largo", "Romper la rama para que cicatrice más rápido"],
    ["herramientas", "¿Qué debe hacerse con herramientas de corte entre trabajos cuando existe riesgo fitosanitario?", "Limpiarlas y desinfectarlas conforme al procedimiento adecuado", "Guardarlas con restos vegetales", "Mojarlas únicamente con agua de riego"],
    ["maquinaria", "Antes de usar una desbrozadora o cortacésped, ¿qué comprobación es prioritaria?", "Estado del equipo, protecciones, entorno, proyecciones y EPI necesarios", "Solo el nivel de combustible", "Retirar las protecciones para mejorar la visibilidad"],
    ["fitosanitarios", "Si un tratamiento fitosanitario requiere habilitación específica, ¿quién debe realizarlo?", "Una persona habilitada y conforme a las condiciones legales y de aplicación", "Cualquier jardinero si usa poca cantidad", "El cliente sin leer la etiqueta"],
    ["suelo", "¿Qué dato ayuda a decidir una mejora de suelo o abonado?", "Características del suelo, necesidades de la planta y síntomas observados", "El color del saco de abono", "Aplicar siempre la dosis máxima"],
    ["cesped", "¿Por qué no conviene retirar una proporción excesiva de altura del césped en una sola siega?", "Puede estresar la planta y debilitar el césped", "Porque aumenta el consumo de agua de la máquina", "Porque impide recoger los restos"],
    ["arbol", "Antes de trabajar en un árbol con ramas sobre una zona de paso, ¿qué debe planificarse?", "Zona de exclusión, caída controlada, acceso y medios de trabajo seguros", "Solo dónde dejar los restos", "Trabajar mientras haya peatones para terminar antes"],
    ["riego_fuga", "Se observa una zona encharcada junto a una línea de riego. ¿Qué debe revisarse?", "Fugas, emisores, presión, tiempos de riego y drenaje", "Aumentar automáticamente el tiempo de riego", "Cubrir el agua con tierra sin revisar la instalación"],
    ["residuos_verdes", "¿Cómo debe gestionarse el residuo vegetal de poda o desbroce?", "Según el servicio acordado y el circuito de gestión o valorización aplicable", "Quemándolo siempre en la parcela", "Abandonándolo fuera de la propiedad"],
    ["piscina", "En mantenimiento exterior con piscina, ¿qué práctica es básica antes de manipular productos?", "Seguir instrucciones, evitar mezclas incompatibles y controlar almacenamiento y dosificación", "Mezclar productos concentrados para ahorrar tiempo", "Guardar productos abiertos junto a cualquier herramienta"],
    ["plaga", "Ante síntomas de una posible plaga, ¿qué enfoque es correcto?", "Identificar el problema antes de decidir tratamiento y priorizar medidas adecuadas", "Aplicar insecticida de amplio espectro sin diagnóstico", "Podar toda la planta inmediatamente"],
    ["programado", "¿Qué debe registrar un mantenimiento programado de jardín?", "Tareas realizadas, incidencias, evolución y próximas necesidades", "Solo la hora de llegada", "Nada si el cliente no está presente"],
    ["meteorologia", "Si hay viento fuerte o condiciones que vuelven insegura una tarea de altura o aplicación, ¿qué debe hacerse?", "Aplazar o adaptar la tarea hasta disponer de condiciones seguras", "Continuar reduciendo el tiempo de trabajo", "Usar más producto para compensar el viento"],
  ]),
};

function normalize(value) {
  const normalized = String(value ?? "").trim().toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[\s-]+/g, "_");
  if (["limpieza", "limpieza_profesional", "limpieza_hogar"].includes(normalized)) return "limpieza_profesional";
  if (["jardineria", "jardin", "jardinero", "jardineros"].includes(normalized)) return "jardineria";
  return BANKS[normalized] ? normalized : null;
}

export function getHomeServiceProfessionalSpecialties() {
  return Object.values(BANKS).map((bank) => ({ slug: bank.slug, label: bank.label, questionCount: bank.questions.length }));
}

export function getPublicHomeServiceAssessment(value) {
  const slug = normalize(value);
  const bank = slug ? BANKS[slug] : null;
  if (!bank) return null;
  return {
    specialty: { slug: bank.slug, label: bank.label },
    version: bank.version,
    passScore: HOME_SERVICE_PASS_SCORE,
    questionCount: bank.questions.length,
    questions: bank.questions.map(({ id, prompt, options }) => ({ id, prompt, options })),
  };
}

export function evaluateHomeServiceAssessment(payload) {
  const slug = normalize(payload?.especialidad ?? payload?.specialty);
  const bank = slug ? BANKS[slug] : null;
  if (!bank) return { valid: false, passed: false, score: 0, answered: 0, total: 0, specialtySlug: null, specialtyLabel: null, version: null, error: "Especialidad no válida." };
  const answers = payload?.respuestas && typeof payload.respuestas === "object" ? payload.respuestas : {};
  if (payload?.version !== bank.version) return { valid: false, passed: false, score: 0, answered: 0, total: bank.questions.length, specialtySlug: bank.slug, specialtyLabel: bank.label, version: bank.version, error: "La evaluación ha cambiado. Recarga las preguntas." };
  const answered = bank.questions.filter((q) => typeof answers[q.id] === "string").length;
  const correct = bank.questions.filter((q) => answers[q.id] === q.correctOption).length;
  const score = Math.round((correct / bank.questions.length) * 100);
  return {
    valid: answered === bank.questions.length,
    passed: answered === bank.questions.length && score >= HOME_SERVICE_PASS_SCORE,
    score,
    answered,
    total: bank.questions.length,
    specialtySlug: bank.slug,
    specialtyLabel: bank.label,
    version: bank.version,
    error: answered === bank.questions.length ? null : "Debes responder las 15 preguntas de tu especialidad.",
  };
}

export function normalizeHomeServiceProfessionalSpecialty(value) {
  return normalize(value);
}
