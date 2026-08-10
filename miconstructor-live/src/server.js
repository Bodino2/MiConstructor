import http from 'node:http';
import { URL } from 'node:url';

const PORT = Number(process.env.PORT || 8080);

const services = [
  { slug: 'reformas-integrales', name: 'Reformas integrales' },
  { slug: 'reformas-de-banos', name: 'Reformas de baños' },
  { slug: 'reformas-de-cocinas', name: 'Reformas de cocinas' },
  { slug: 'pintores', name: 'Pintura' },
  { slug: 'electricistas', name: 'Electricidad' },
  { slug: 'fontaneros', name: 'Fontanería' },
  { slug: 'alicatadores', name: 'Alicatado' }
];

const testBank = {
  electricistas: [
    '¿Qué comprobación realizarías antes de intervenir en un cuadro eléctrico?',
    '¿Cómo verificas la ausencia de tensión de forma segura?',
    '¿Qué función tiene un interruptor diferencial?',
    '¿Qué criterio usarías para dimensionar la sección de un conductor?',
    '¿Qué diferencia hay entre magnetotérmico y diferencial?',
    '¿Cómo identificarías un defecto de aislamiento?',
    '¿Qué protecciones aplicarías en un cuarto de baño?',
    '¿Cómo documentarías una modificación de instalación?',
    '¿Qué harías si detectas una toma de tierra deficiente?',
    '¿Cómo comprobarías continuidad de protección?',
    '¿Qué factores influyen en la caída de tensión?',
    '¿Cuándo debe sustituirse un elemento recalentado?',
    '¿Qué equipo de protección individual usarías?',
    '¿Qué señales indican una sobrecarga recurrente?',
    '¿Cómo dejarías la instalación antes de reenergizarla?'
  ],
  fontaneros: [
    '¿Cómo localizarías una fuga no visible?', '¿Qué prueba realizarías después de reparar una tubería?',
    '¿Cuándo elegirías PEX frente a cobre?', '¿Cómo evitarías golpes de ariete?', '¿Cómo comprobarías presión y caudal?',
    '¿Qué pendiente debe respetarse en una evacuación?', '¿Qué harías ante una unión con corrosión galvánica?',
    '¿Cómo sellarías una conexión roscada?', '¿Qué precauciones tomarías con agua caliente sanitaria?',
    '¿Cómo diagnosticarías un sifón que pierde el cierre hidráulico?', '¿Cómo actuarías ante baja presión general?',
    '¿Qué pasos seguirías para sustituir una llave de paso?', '¿Cómo verificarías estanqueidad?',
    '¿Qué documentación entregarías al terminar?', '¿Cómo protegerías la zona de trabajo?'
  ]
};

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'access-control-allow-origin': '*'
  });
  res.end(body);
}

function estimate(query) {
  const type = query.get('type') || 'reformas-integrales';
  const sqm = Math.max(1, Number(query.get('sqm') || 50));
  const quality = query.get('quality') || 'estandar';
  const base = {
    'reformas-integrales': 650,
    'reformas-de-banos': 900,
    'reformas-de-cocinas': 850,
    pintores: 18,
    electricistas: 55,
    fontaneros: 60,
    alicatadores: 42
  }[type] || 650;
  const factor = { basico: 0.8, estandar: 1, premium: 1.35 }[quality] || 1;
  const midpoint = Math.round(base * sqm * factor);
  return {
    type, sqm, quality,
    min: Math.round(midpoint * 0.85),
    max: Math.round(midpoint * 1.2),
    currency: 'EUR',
    breakdown: {
      manoDeObra: Math.round(midpoint * 0.45),
      materiales: Math.round(midpoint * 0.45),
      residuosYLogistica: Math.round(midpoint * 0.1)
    }
  };
}

export function createServer() {
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET,OPTIONS',
        'access-control-allow-headers': 'content-type'
      });
      return res.end();
    }

    if (req.method === 'GET' && url.pathname === '/api/health') {
      return json(res, 200, { status: 'ok', service: 'miconstructor-live', version: '0.1.0' });
    }

    if (req.method === 'GET' && url.pathname === '/api/v1/services') {
      return json(res, 200, { services });
    }

    if (req.method === 'GET' && url.pathname === '/api/v1/estimate') {
      return json(res, 200, estimate(url.searchParams));
    }

    const testMatch = url.pathname.match(/^\/api\/v1\/professional-tests\/([^/]+)$/);
    if (req.method === 'GET' && testMatch) {
      const specialty = decodeURIComponent(testMatch[1]);
      const questions = testBank[specialty];
      if (!questions) return json(res, 404, { error: 'specialty_not_found' });
      return json(res, 200, { specialty, minimumRequired: 12, questions });
    }

    return json(res, 404, { error: 'not_found' });
  });
}

if (process.env.NODE_ENV !== 'test') {
  createServer().listen(PORT, '0.0.0.0', () => {
    console.log(`MiConstructor API listening on ${PORT}`);
  });
}
