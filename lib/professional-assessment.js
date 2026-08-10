export const PROFESSIONAL_PASS_SCORE = 80;
export const PROFESSIONAL_QUESTION_COUNT = 15;

function createQuestionBank(slug, label, rows) {
  if (rows.length !== PROFESSIONAL_QUESTION_COUNT) {
    throw new Error(`La evaluación ${slug} debe contener exactamente ${PROFESSIONAL_QUESTION_COUNT} preguntas.`);
  }

  return {
    slug,
    label,
    version: `2026-08-09-${slug}-1`,
    questions: rows.map(([id, prompt, correct, wrongOne, wrongTwo], index) => {
      const correctPosition = index % 3;
      const labels = [wrongOne, wrongTwo];
      labels.splice(correctPosition, 0, correct);
      return {
        id: `${slug}_${id}`,
        prompt,
        options: labels.map((optionLabel, optionIndex) => ({
          id: ["a", "b", "c"][optionIndex],
          label: optionLabel,
        })),
        correctOption: ["a", "b", "c"][correctPosition],
      };
    }),
  };
}

const assessmentBanks = {
  reformas_integrales: createQuestionBank("reformas_integrales", "Reformas integrales", [
    ["secuencia", "Antes de iniciar una reforma integral, ¿qué documento técnico debe coordinar todas las partidas?", "Un alcance medido con planos, partidas, secuencia e hitos", "Una lista aproximada de materiales", "Un calendario sin mediciones"],
    ["demolicion", "Antes de demoler un tabique, ¿qué comprobación es imprescindible?", "Confirmar si es estructural y localizar instalaciones ocultas", "Comprobar únicamente el acabado de pintura", "Retirar primero todas las puertas"],
    ["instalaciones", "¿Cuándo deben coordinarse los recorridos de electricidad, fontanería y climatización?", "Antes de cerrar rozas, falsos techos y trasdosados", "Después de pintar", "Solo cuando aparece una interferencia"],
    ["humedad", "Se detecta humedad al retirar un revestimiento. ¿Cuál es la actuación correcta?", "Diagnosticar y resolver la causa antes de cerrar y revestir", "Cubrirla con una pintura impermeable", "Aumentar el espesor del enlucido"],
    ["cambios", "El cliente solicita un cambio que afecta a precio y plazo. ¿Cómo debe gestionarse?", "Mediante una modificación documentada y aceptada antes de ejecutarla", "Ejecutándolo y regularizando el importe al final", "Repartiendo el coste entre otras partidas"],
    ["impermeabilizacion", "¿Qué debe ocurrir antes de colocar el acabado sobre una zona húmeda impermeabilizada?", "Verificar continuidad, encuentros y tiempos de curado del sistema", "Instalar el mobiliario", "Sellar únicamente las juntas visibles"],
    ["soportes", "¿Qué condición debe cumplir un soporte antes de recibir un acabado?", "Estar estable, limpio, compatible y con la humedad adecuada", "Tener siempre una capa de pintura previa", "Estar recién ejecutado aunque no haya curado"],
    ["cotas", "¿Cómo se evitan incompatibilidades de altura entre pavimentos, puertas y sanitarios?", "Definiendo cotas y espesores de todas las capas antes de ejecutar", "Ajustando cada elemento al final", "Usando el mismo material en toda la vivienda"],
    ["residuos", "¿Qué debe contemplar la planificación de residuos de una reforma?", "Separación, retirada autorizada, trazabilidad y protección de zonas comunes", "Solo el número de sacos", "Almacenarlos hasta finalizar toda la obra"],
    ["pruebas", "¿Cuándo se prueban las instalaciones que quedarán ocultas?", "Antes de taparlas, documentando el resultado", "Después de entregar la obra", "Solo si el cliente lo solicita"],
    ["hito", "¿Qué evidencia permite aprobar correctamente un hito de obra?", "Fotos fechadas, mediciones y comprobaciones vinculadas a las partidas", "Un mensaje indicando que está terminado", "La compra de los materiales"],
    ["protecciones", "Durante una reforma parcial en una vivienda ocupada, ¿qué es prioritario?", "Sectorizar, proteger recorridos y controlar polvo y riesgos", "Trabajar únicamente con las ventanas abiertas", "Acumular herramientas en la zona de paso"],
    ["recepcion", "¿Qué debe incluir la entrega final de una reforma integral?", "Repaso de defectos, garantías, manuales, certificados y planos actualizados", "Solo la factura final", "Únicamente fotografías generales"],
    ["presupuesto", "¿Qué hace comparable un presupuesto de reforma integral?", "Partidas medidas, materiales definidos, exclusiones, impuestos y plazo", "Un precio total redondeado", "Un listado de oficios sin importes"],
    ["seguridad", "Aparece un riesgo no previsto durante los trabajos. ¿Qué debe hacer el responsable?", "Detener la tarea afectada, proteger la zona y reevaluar el procedimiento", "Continuar si queda poco trabajo", "Trasladar toda la responsabilidad al cliente"],
  ]),
  albanileria: createQuestionBank("albanileria", "Albañilería", [
    ["muro", "Antes de abrir un hueco en un muro, ¿qué debe comprobarse?", "Su función estructural, cargas, apoyos y solución técnica autorizada", "Solo el espesor del revestimiento", "La disponibilidad del premarco"],
    ["replanteo", "¿Qué define un replanteo correcto de una fábrica?", "Ejes, cotas, encuentros, huecos, niveles y tolerancias", "Únicamente el punto de inicio", "Solo la cantidad de ladrillos"],
    ["mortero", "¿Cómo debe elegirse el mortero de una fábrica?", "Según el soporte, la pieza, la exposición y la prestación requerida", "Usando siempre la mezcla más rígida", "Añadiendo agua hasta facilitar al máximo la aplicación"],
    ["trabazon", "¿Cuál es la finalidad principal de la trabazón en una fábrica?", "Asegurar continuidad y reparto adecuado de esfuerzos", "Reducir el consumo de mortero", "Facilitar el corte de las piezas"],
    ["juntas", "¿Por qué deben respetarse las juntas de movimiento previstas?", "Para absorber deformaciones y evitar fisuras o empujes no deseados", "Para acelerar el secado de la pintura", "Para ocultar diferencias de color"],
    ["dintel", "Al ejecutar un dintel, ¿qué debe verificarse antes de retirar el apeo?", "Apoyos, armado o sistema previsto y resistencia suficiente", "Que el hueco esté pintado", "Que la carpintería esté instalada"],
    ["base", "¿Qué condición necesita una base antes de ejecutar una recrecida?", "Estabilidad, limpieza, preparación y nivel definidos", "Una superficie completamente pulida", "Humedad visible para mejorar la adherencia"],
    ["curado", "¿Por qué se controla el curado de morteros y hormigones?", "Para favorecer el desarrollo previsto de resistencia y limitar fisuración", "Para cambiar el color final", "Para poder aplicar pintura inmediatamente"],
    ["aplome", "¿Cómo se controla una fábrica durante la ejecución?", "Con referencias de nivel, alineación, planeidad y aplome", "Solo observándola desde lejos", "Midiendo únicamente al terminar"],
    ["encuentros", "¿Qué debe resolverse en el encuentro entre materiales distintos?", "Compatibilidad, anclaje y posibles movimientos diferenciales", "Aplicar más pintura", "Eliminar cualquier junta"],
    ["humedad", "En un cerramiento con riesgo de humedad, ¿qué debe preservarse?", "La continuidad de las barreras y detalles de evacuación previstos", "Solo el acabado exterior", "La cámara completamente rellena de mortero"],
    ["rozas", "Antes de realizar rozas en una fábrica, ¿qué debe evaluarse?", "Tipo de muro, dirección, profundidad e instalaciones existentes", "Solo la herramienta disponible", "El color del revestimiento posterior"],
    ["adhesion", "Un revestimiento se desprende al poco tiempo. ¿Cuál es una causa probable que debe investigarse?", "Soporte inestable, sucio o incompatible y preparación insuficiente", "Exceso de iluminación", "Uso de reglas de nivel"],
    ["medicion", "¿Cómo se acredita una partida de albañilería ejecutada?", "Con medición, ubicación, fotos y conformidad con la solución definida", "Con una fotografía general sin referencia", "Con el albarán de herramientas"],
    ["proteccion", "Al cortar piezas minerales, ¿qué control es esencial?", "Reducir y extraer polvo, usar protección adecuada y aislar la zona", "Cerrar toda ventilación sin protección", "Trabajar sin humedecer para avanzar más rápido"],
  ]),
  electricidad: createQuestionBank("electricidad", "Electricidad", [
    ["ausencia", "Antes de intervenir en un circuito, ¿qué secuencia protege al instalador?", "Desconectar, impedir la reconexión y verificar ausencia de tensión", "Bajar solo un interruptor y comenzar", "Comprobar la tensión después de tocar los conductores"],
    ["diferencial", "¿Qué protección está destinada principalmente a detectar corrientes de fuga a tierra?", "El interruptor diferencial", "El contador de energía", "El interruptor horario"],
    ["magnetotermico", "¿Qué protege principalmente un interruptor magnetotérmico?", "El circuito frente a sobrecargas y cortocircuitos", "La vivienda frente a fugas de agua", "La señal de telecomunicaciones"],
    ["tierra", "¿Cuál es la finalidad del conductor de protección?", "Conectar masas a tierra para facilitar la actuación de las protecciones", "Transportar la corriente de trabajo habitual", "Sustituir al conductor neutro"],
    ["seccion", "¿De qué depende la elección de sección de un conductor?", "Intensidad prevista, instalación, longitud, caída de tensión y protección", "Solo del color del aislamiento", "Únicamente del diámetro del tubo"],
    ["bano", "En un local con bañera o ducha, ¿qué debe determinar la ubicación del material eléctrico?", "Los volúmenes de protección y el grado de protección exigible", "La proximidad a la puerta", "El diseño del revestimiento"],
    ["colores", "¿Qué identificación debe reservarse al conductor de protección?", "Verde-amarillo", "Azul claro", "Marrón"],
    ["cajas", "¿Cómo deben quedar las conexiones y derivaciones?", "Dentro de envolventes adecuadas, accesibles y correctamente identificadas", "Empotradas sin caja para ahorrar espacio", "Ocultas detrás de cualquier revestimiento sin registro"],
    ["continuidad", "Antes de poner en servicio, ¿qué comprobación confirma el recorrido del conductor de protección?", "La medida de continuidad", "La lectura del contador", "La comprobación visual del cuadro"],
    ["aislamiento", "¿Qué ensayo ayuda a detectar deterioro del aislamiento de los circuitos?", "La medida de resistencia de aislamiento", "La medida del consumo mensual", "La prueba de iluminación ambiente"],
    ["cuadro", "¿Cómo debe entregarse un cuadro eléctrico reformado?", "Con circuitos identificados, protecciones coordinadas y documentación actualizada", "Sin etiquetas para permitir cambios", "Con todos los circuitos unidos bajo una única protección"],
    ["empalme", "Se encuentra un empalme recalentado. ¿Qué debe hacerse?", "Eliminar la causa, rehacer la conexión adecuada y verificar carga y apriete", "Cubrirlo con más cinta sin desconectar", "Aumentar el calibre de la protección sin cálculo"],
    ["documentacion", "¿Qué documento representa la distribución y protección de los circuitos?", "El esquema unifilar", "El plano de pintura", "El albarán de residuos"],
    ["prueba", "¿Cuándo deben realizarse las verificaciones de la instalación?", "Antes de la puesta en servicio y tras modificaciones relevantes", "Solo cuando falla un receptor", "Después de cerrar toda la documentación"],
    ["competencia", "Si una intervención exige habilitación o certificado reglamentario, ¿quién debe asumirla?", "Una empresa o persona instaladora habilitada para esa actuación", "Cualquier operario con herramientas", "El propietario sin documentación"],
  ]),
  fontaneria: createQuestionBank("fontaneria", "Fontanería", [
    ["corte", "Antes de modificar una red de agua, ¿qué debe hacerse?", "Identificar el tramo, cerrar el suministro y descargar la presión", "Cortar la tubería directamente", "Abrir todos los grifos después de desmontar"],
    ["materiales", "¿Qué debe comprobarse al unir tuberías o accesorios?", "Compatibilidad de materiales, sistema de unión y condiciones de servicio", "Que tengan el mismo color", "Que el accesorio sea siempre metálico"],
    ["presion", "Antes de ocultar una instalación nueva, ¿qué comprobación es prioritaria?", "Realizar y documentar la prueba de estanqueidad o presión correspondiente", "Pintar las llaves de corte", "Instalar el mobiliario"],
    ["valvulas", "¿Cómo deben quedar las llaves de corte necesarias para mantenimiento?", "Accesibles, identificables y operables", "Selladas dentro del tabique", "Situadas únicamente junto al contador"],
    ["pendiente", "¿Qué condición permite evacuar correctamente una tubería de desagüe por gravedad?", "Pendiente, sección, ventilación y trazado adecuados", "Máximo número de codos", "Ausencia total de registros"],
    ["sifon", "¿Cuál es la función del cierre hidráulico de un sifón?", "Evitar el paso de gases desde la red de evacuación", "Aumentar la presión de agua", "Filtrar la cal del suministro"],
    ["ruidos", "Una instalación produce golpes al cerrar rápidamente un grifo. ¿Qué debe revisarse?", "Presión, velocidades, sujeciones y protección frente al golpe de ariete", "Solo el color de las tuberías", "La ventilación de la habitación"],
    ["dilatacion", "En tuberías con cambios de temperatura, ¿qué debe preverse?", "Dilatación, puntos fijos, soportes y aislamiento adecuados", "Empotramiento rígido en todo el recorrido", "Eliminación de todas las juntas"],
    ["caliente", "¿Qué medida reduce pérdidas y condensaciones en las conducciones?", "Aplicar el aislamiento adecuado según servicio y ubicación", "Aumentar siempre la presión", "Pintar la tubería con esmalte"],
    ["trazado", "Antes de taladrar en un baño reformado, ¿qué información debe conservarse?", "El trazado documentado de tuberías y otros servicios ocultos", "Solo la referencia del azulejo", "La factura del sanitario"],
    ["contaminacion", "¿Qué criterio protege la calidad del agua de consumo?", "Evitar retornos, conexiones indebidas y materiales no aptos", "Compartir la conducción con cualquier circuito técnico", "Mantener tramos muertos innecesarios"],
    ["fuga", "Aparece una fuga tras la prueba inicial. ¿Cuál es la respuesta correcta?", "Localizar la causa, reparar y repetir la prueba completa", "Reducir la presión y tapar", "Cerrar el registro sin documentarlo"],
    ["evacuacion", "¿Qué debe evitarse en una red de evacuación?", "Contrapendientes, cambios bruscos y puntos sin acceso de mantenimiento", "Registros accesibles", "Ventilación de la red"],
    ["medicion", "¿Qué evidencia debe acompañar una instalación oculta terminada?", "Fotos del trazado, materiales, prueba realizada y ubicación de llaves", "Solo una foto del baño acabado", "El catálogo del fabricante"],
    ["puesta", "Antes de entregar una instalación, ¿qué debe verificarse?", "Estanqueidad, caudal, funcionamiento, evacuación y ausencia de fugas", "Solo que los grifos sean nuevos", "Únicamente la temperatura ambiente"],
  ]),
  climatizacion: createQuestionBank("climatizacion", "Climatización", [
    ["dimensionado", "¿Qué debe preceder a la selección de un equipo de climatización?", "El cálculo de cargas y las condiciones de uso del edificio", "Elegir siempre el equipo de mayor potencia", "Copiar la potencia de otra vivienda"],
    ["competencia", "¿Quién debe ejecutar una actuación sometida al RITE o a normativa de refrigerantes?", "Personal o empresa habilitada para el alcance correspondiente", "Cualquier operario de reformas", "Exclusivamente el propietario"],
    ["emplazamiento", "¿Qué debe verificarse al ubicar una unidad exterior?", "Ventilación, distancias, evacuación, vibraciones, ruido y mantenimiento", "Solo que no sea visible", "Que quede encerrada para protegerla"],
    ["condensados", "¿Cómo debe resolverse el desagüe de condensados?", "Con pendiente, aislamiento cuando proceda, prueba y punto de vertido adecuado", "Conectándolo sin prueba al desagüe más cercano", "Dejándolo descargar sobre la fachada"],
    ["estanqueidad", "Antes de cargar o poner en servicio un circuito frigorífico, ¿qué debe comprobarse?", "Estanqueidad, vacío y procedimiento indicado para el refrigerante y equipo", "Solo la temperatura del mando", "Únicamente el consumo eléctrico"],
    ["conductos", "¿Qué debe controlarse en una red de conductos?", "Sección, estanqueidad, aislamiento, soportes y equilibrado de caudales", "Solo la forma de las rejillas", "El color del aislamiento"],
    ["filtros", "¿Por qué debe facilitarse el acceso a filtros y equipos?", "Para inspección, limpieza y mantenimiento seguro", "Para aumentar la potencia instalada", "Para evitar documentar la instalación"],
    ["refrigerante", "¿Cómo se gestiona un refrigerante retirado de una instalación?", "Recuperándolo con equipo adecuado y trazabilidad conforme al procedimiento aplicable", "Liberándolo al exterior si queda poca cantidad", "Mezclándolo con otro refrigerante"],
    ["aislamiento", "¿Qué problema evita un aislamiento continuo en tuberías frías?", "Condensaciones y pérdidas energéticas", "La caída de tensión", "El ruido de la bomba de desagüe únicamente"],
    ["electricidad", "Antes de alimentar el equipo, ¿qué debe coordinarse?", "Circuito, protección, seccionamiento, tierra y requisitos del fabricante", "Un enchufe cualquiera", "La iluminación de la estancia"],
    ["caudal", "Una estancia no alcanza confort aunque el equipo funciona. ¿Qué debe revisarse?", "Carga, caudal, distribución, control, filtros y posibles obstrucciones", "Solo el acabado de la pared", "Aumentar la consigna al máximo sin medir"],
    ["puesta", "¿Qué incluye una puesta en marcha profesional?", "Mediciones, pruebas funcionales, ajustes, registro de parámetros y explicación al usuario", "Encender y apagar con el mando", "Entregar únicamente la factura"],
    ["ruido", "Aparecen vibraciones después del montaje. ¿Qué debe comprobarse?", "Anclajes, silentblocks, tuberías, contacto estructural y equilibrado", "Solo el volumen del mando", "La pintura de la unidad"],
    ["documentacion", "¿Qué debe conservar el cliente al finalizar?", "Manual, garantías, datos de puesta en marcha, mantenimiento y documentación exigible", "Solo la caja del equipo", "Un folleto publicitario"],
    ["mantenimiento", "¿Por qué se define un plan de mantenimiento?", "Para conservar seguridad, eficiencia, higiene y funcionamiento", "Para sustituir el cálculo inicial", "Para evitar cualquier inspección"],
  ]),
  pintura: createQuestionBank("pintura", "Pintura y revestimientos", [
    ["diagnostico", "Antes de pintar, ¿qué debe diagnosticarse en el soporte?", "Estabilidad, humedad, suciedad, adherencia y naturaleza del acabado existente", "Solo el color actual", "Únicamente la superficie aproximada"],
    ["humedad", "Si una pared presenta humedad activa, ¿qué actuación es correcta?", "Resolver la causa y acondicionar el soporte antes de pintar", "Aplicar más capas de pintura", "Cubrir la zona con masilla sin esperar"],
    ["proteccion", "¿Qué debe incluir la preparación de una vivienda ocupada?", "Protección de mobiliario, suelos, carpinterías, mecanismos y recorridos", "Solo retirar los cuadros", "Apilar los muebles en el centro sin cubrir"],
    ["adherencia", "¿Qué se hace cuando la pintura antigua tiene mala adherencia?", "Eliminar las zonas no firmes y preparar hasta obtener un soporte estable", "Pintar directamente con una capa más gruesa", "Humedecer la superficie sin limpiar"],
    ["imprimacion", "¿Cuándo es necesaria una imprimación específica?", "Cuando el soporte o acabado lo requiere para sellar, adherir o uniformar absorción", "Siempre como sustituto de la limpieza", "Solo sobre colores oscuros"],
    ["compatibilidad", "¿Qué debe comprobarse antes de aplicar un producto nuevo sobre otro existente?", "Compatibilidad, adherencia y preparación recomendada por el sistema", "Que ambos envases tengan igual tamaño", "Que el acabado nuevo sea más brillante"],
    ["fisura", "Aparece una fisura que vuelve a abrirse. ¿Qué debe hacerse?", "Determinar su causa y movimiento antes de elegir la reparación", "Cubrirla repetidamente con pintura", "Aplicar únicamente una capa de acabado"],
    ["secado", "¿Por qué deben respetarse condiciones ambientales y tiempos entre capas?", "Para lograr curado, adherencia y acabado previstos", "Para reducir la superficie medida", "Para cambiar la tonalidad del soporte"],
    ["mezcla", "¿Cómo se prepara un producto de dos componentes?", "Respetando proporción, mezcla, vida útil y ficha técnica", "Añadiendo disolvente hasta que fluya", "Mezclando cantidades sin medir"],
    ["rendimiento", "¿Cómo se estima correctamente el material necesario?", "Midiendo superficies y considerando rendimiento, absorción, manos y mermas", "Usando únicamente los metros de suelo", "Comprando siempre una cantidad fija"],
    ["acabado", "¿Cómo se controla la uniformidad del acabado?", "Con iluminación adecuada, espesor y aplicación homogéneos y revisión por paños", "Solo desde un punto de la estancia", "Antes de que seque la primera capa"],
    ["pulverizacion", "Al aplicar pintura por pulverización, ¿qué control adicional es esencial?", "Ventilación, protección respiratoria, confinamiento y control de niebla", "Cerrar la estancia sin equipos de protección", "Aumentar la presión para terminar antes"],
    ["exterior", "Antes de pintar una fachada, ¿qué debe revisarse?", "Estado del soporte, fisuras, humedad, exposición y compatibilidad del sistema", "Solo la previsión de color", "Únicamente la altura del edificio"],
    ["residuos", "¿Cómo deben gestionarse restos, envases y disolventes?", "Según su naturaleza, separados y mediante el circuito de gestión aplicable", "Vertiéndolos en el desagüe", "Mezclándolos con escombros"],
    ["entrega", "¿Qué debe comprobarse antes de dar por terminada la pintura?", "Cobertura, uniformidad, remates, limpieza y correspondencia con el acabado acordado", "Solo que no quede producto", "Únicamente el número de horas trabajadas"],
  ]),
};

const aliases = {
  reformas_integrales: "reformas_integrales",
  reforma_integral: "reformas_integrales",
  "reformas integrales": "reformas_integrales",
  "reforma integral": "reformas_integrales",
  cocinas: "reformas_integrales",
  cocina: "reformas_integrales",
  "reformas de banos": "reformas_integrales",
  "reforma de bano": "reformas_integrales",
  albanileria: "albanileria",
  electricidad: "electricidad",
  electricistas: "electricidad",
  fontaneria: "fontaneria",
  fontaneros: "fontaneria",
  climatizacion: "climatizacion",
  pintura: "pintura",
  pintores: "pintura",
  "pintura y revestimientos": "pintura",
};

function comparable(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ");
}

export function normalizeProfessionalSpecialty(value) {
  const normalized = comparable(value);
  return aliases[normalized] ?? aliases[normalized.replace(/ /g, "_")] ?? null;
}

export function getProfessionalSpecialties() {
  return Object.values(assessmentBanks).map(({ slug, label, questions }) => ({
    slug,
    label,
    questionCount: questions.length,
  }));
}

export function getSpecialtySlugForProjectCategory(category) {
  return normalizeProfessionalSpecialty(category);
}

export function getPublicProfessionalAssessment(specialty) {
  const slug = normalizeProfessionalSpecialty(specialty);
  const bank = slug ? assessmentBanks[slug] : null;
  if (!bank) return null;

  return {
    specialty: { slug: bank.slug, label: bank.label },
    version: bank.version,
    passScore: PROFESSIONAL_PASS_SCORE,
    questionCount: bank.questions.length,
    questions: bank.questions.map((question) => ({
      id: question.id,
      prompt: question.prompt,
      options: question.options,
    })),
  };
}

export function evaluateProfessionalAssessment(payload) {
  const specialtySlug = normalizeProfessionalSpecialty(
    payload?.especialidad ?? payload?.specialty,
  );
  const bank = specialtySlug ? assessmentBanks[specialtySlug] : null;
  const version = typeof payload?.version === "string" ? payload.version : "";
  const answers = payload?.respuestas && typeof payload.respuestas === "object"
    ? payload.respuestas
    : {};

  if (!bank) {
    return {
      valid: false,
      passed: false,
      score: 0,
      answered: 0,
      total: 0,
      specialtySlug: null,
      specialtyLabel: null,
      version: null,
      error: "Selecciona una especialidad profesional válida antes de realizar el test.",
    };
  }

  if (version !== bank.version) {
    return {
      valid: false,
      passed: false,
      score: 0,
      answered: 0,
      total: bank.questions.length,
      specialtySlug: bank.slug,
      specialtyLabel: bank.label,
      version: bank.version,
      error: "La evaluación de esta especialidad ha cambiado. Recarga las preguntas antes de continuar.",
    };
  }

  const answered = bank.questions.filter((question) =>
    typeof answers[question.id] === "string",
  ).length;
  const correct = bank.questions.filter(
    (question) => answers[question.id] === question.correctOption,
  ).length;
  const score = Math.round((correct / bank.questions.length) * 100);

  return {
    valid: answered === bank.questions.length,
    passed: answered === bank.questions.length && score >= PROFESSIONAL_PASS_SCORE,
    score,
    answered,
    total: bank.questions.length,
    specialtySlug: bank.slug,
    specialtyLabel: bank.label,
    version: bank.version,
    error: answered === bank.questions.length ? null : "Debes responder las 15 preguntas de tu especialidad.",
  };
}
