import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create users
  const adminPassword = await bcrypt.hash('Demo1234!', 10);
  const clientPassword = await bcrypt.hash('Demo1234!', 10);
  const proPassword = await bcrypt.hash('Demo1234!', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@demo.es' },
    update: {},
    create: {
      email: 'admin@demo.es',
      passwordHash: adminPassword,
      role: 'ADMIN',
    },
  });

  const client = await prisma.user.upsert({
    where: { email: 'cliente@demo.es' },
    update: {},
    create: {
      email: 'cliente@demo.es',
      passwordHash: clientPassword,
      role: 'CLIENT',
      clientProfile: {
        create: {
          fullName: 'Cliente Demo',
          city: 'Madrid',
          province: 'Madrid',
          postalCode: '28001',
          phone: '+34600000001',
        },
      },
    },
  });

  const pro = await prisma.user.upsert({
    where: { email: 'pro@demo.es' },
    update: {},
    create: {
      email: 'pro@demo.es',
      passwordHash: proPassword,
      role: 'PRO',
      proProfile: {
        create: {
          displayNameOrCompany: 'Profesional Demo S.L.',
          proType: 'EMPRESA',
          nifNieCif: 'B12345678',
          categories: ['Reformas', 'Electricidad', 'Fontanería'],
          city: 'Madrid',
          province: 'Madrid',
          postalCode: '28002',
          bio: 'Empresa de reformas con más de 10 años de experiencia',
          accreditationStatus: 'ACCREDITED',
          testsPassed: true,
        },
      },
    },
  });

  // Create category tests
  const categories = ['Reformas', 'Electricidad', 'Fontanería'];
  
  for (const category of categories) {
    const test = await prisma.categoryTest.upsert({
      where: { category },
      update: {},
      create: {
        category,
        isActive: true,
      },
    });

    // Create questions for each test
    const questions = [
      {
        questionText: `¿Cuál es el primer paso en un proyecto de ${category}?`,
        optionA: 'Evaluación y presupuesto',
        optionB: 'Comprar materiales',
        optionC: 'Empezar a trabajar',
        correctOption: 'A' as const,
      },
      {
        questionText: `¿Qué normativa es esencial en ${category}?`,
        optionA: 'Ninguna en particular',
        optionB: 'CTE y normativa local',
        optionC: 'Solo experiencia',
        correctOption: 'B' as const,
      },
      {
        questionText: `¿Cuándo se debe informar al cliente sobre cambios?`,
        optionA: 'Al finalizar el proyecto',
        optionB: 'Inmediatamente cuando surgen',
        optionC: 'No es necesario',
        correctOption: 'B' as const,
      },
      {
        questionText: `¿Qué se debe incluir en un presupuesto de ${category}?`,
        optionA: 'Solo el precio final',
        optionB: 'Desglose detallado + IVA',
        optionC: 'Una estimación verbal',
        correctOption: 'B' as const,
      },
      {
        questionText: `¿Cuál es la garantía mínima legal para trabajos de ${category}?`,
        optionA: '6 meses',
        optionB: '1 año',
        optionC: '2 años',
        correctOption: 'C' as const,
      },
      {
        questionText: `¿Qué documentación debe entregarse al cliente?`,
        optionA: 'Ninguna',
        optionB: 'Factura y certificado',
        optionC: 'Solo factura',
        correctOption: 'B' as const,
      },
      {
        questionText: `¿Cómo se deben gestionar los residuos en ${category}?`,
        optionA: 'Dejarlos en la obra',
        optionB: 'Gestión según normativa',
        optionC: 'No importa',
        correctOption: 'B' as const,
      },
      {
        questionText: `¿Qué seguros son necesarios para trabajar en ${category}?`,
        optionA: 'Ninguno',
        optionB: 'RC y daños',
        optionC: 'Solo RC',
        correctOption: 'B' as const,
      },
      {
        questionText: `¿Cuándo se considera completado un trabajo de ${category}?`,
        optionA: 'Cuando el profesional lo dice',
        optionB: 'Cuando el cliente está satisfecho',
        optionC: 'Ambas partes acuerdan',
        correctOption: 'C' as const,
      },
      {
        questionText: `¿Qué hacer si aparece un problema durante ${category}?`,
        optionA: 'Ocultarlo',
        optionB: 'Informar y proponer solución',
        optionC: 'Abandonar el trabajo',
        correctOption: 'B' as const,
      },
    ];

    for (const q of questions) {
      await prisma.testQuestion.create({
        data: {
          testId: test.id,
          ...q,
        },
      });
    }
  }

  // Create sample jobs
  const job1 = await prisma.job.create({
    data: {
      clientId: client.id,
      title: 'Reforma integral de cocina',
      description: 'Necesito reformar la cocina completamente: suelos, azulejos, muebles, electrodomésticos',
      category: 'Reformas',
      city: 'Madrid',
      province: 'Madrid',
      postalCode: '28001',
      estimatedTotalCents: 50000, // 500€
      wantsGuarantee: false,
      status: 'OPEN',
    },
  });

  const job2 = await prisma.job.create({
    data: {
      clientId: client.id,
      title: 'Instalación eléctrica completa',
      description: 'Renovación completa de la instalación eléctrica de un piso de 80m²',
      category: 'Electricidad',
      city: 'Barcelona',
      province: 'Barcelona',
      postalCode: '08001',
      estimatedTotalCents: 120000, // 1200€
      wantsGuarantee: true,
      status: 'DRAFT',
    },
  });

  const job3 = await prisma.job.create({
    data: {
      clientId: client.id,
      title: 'Instalación de sistema de calefacción',
      description: 'Instalación de calefacción central y radiadores en toda la vivienda',
      category: 'Fontanería',
      city: 'Valencia',
      province: 'Valencia',
      postalCode: '46001',
      estimatedTotalCents: 250000, // 2500€
      wantsGuarantee: false,
      status: 'OPEN',
    },
  });

  // Create a paid lead purchase for job1
  const lead = await prisma.leadPurchase.create({
    data: {
      jobId: job1.id,
      proId: pro.id,
      amountCents: 4000, // 8% of 500€ = 40€
      status: 'PAID',
      provider: 'SIMULATED',
    },
  });

  // Create a conversation
  const conversation = await prisma.conversation.create({
    data: {
      jobId: job1.id,
      clientId: client.id,
      proId: pro.id,
      messages: {
        create: {
          senderId: pro.id,
          text: 'Hola, he visto su solicitud de reforma de cocina. Tengo más de 10 años de experiencia en este tipo de proyectos. ¿Podríamos concretar una fecha para ver la cocina?',
        },
      },
    },
  });

  console.log('✅ Seed completed!');
  console.log('👤 Users created:');
  console.log('  - Admin: admin@demo.es / Demo1234!');
  console.log('  - Cliente: cliente@demo.es / Demo1234!');
  console.log('  - Profesional: pro@demo.es / Demo1234! (ACCREDITED)');
  console.log('📝 Jobs created:', 3);
  console.log('🧪 Category tests created:', categories.length);
  console.log('💬 Conversations created: 1');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
