import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { encryptUserFields } from './encrypt-helpers';

const prisma = new PrismaClient();

const DEFAULT_PASSWORD = 'senha123';

async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

async function main() {
  console.log('🌱 Iniciando seed...\n');

  // ========== APP SETTINGS ==========
  await prisma.appSettings.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      maintenanceMode: false,
      openSignup: true,
      dailySummary: true,
      defaultLocale: 'pt-BR',
    },
  });
  console.log('✓ AppSettings');

  // ========== ZONAS EXCLUSIVAS (condomínios) ==========
  // Zonas são privadas - só entra quem tem o código/link de convite
  const zonasData = [
    { name: 'Condomínio Residencial Central', description: 'Condomínio fechado - área central', color: '#14b8a6', centerLat: -23.5505, centerLng: -46.6333, accessCode: 'CONDO-CENTRAL' },
    { name: 'Residencial Jardim Norte', description: 'Condomínio exclusivo - região norte', color: '#3b82f6', centerLat: -23.5100, centerLng: -46.6200, accessCode: 'CONDO-NORTE' },
    { name: 'Condomínio Vista Sul', description: 'Condomínio fechado - região sul', color: '#8b5cf6', centerLat: -23.5900, centerLng: -46.6400, accessCode: 'CONDO-SUL' },
    { name: 'Residencial Parque Leste', description: 'Condomínio exclusivo - região leste', color: '#22c55e', centerLat: -23.5400, centerLng: -46.6000, accessCode: 'CONDO-LESTE' },
    { name: 'Condomínio Industrial Oeste', description: 'Condomínio empresarial - região oeste', color: '#f59e0b', centerLat: -23.5600, centerLng: -46.6600, accessCode: 'CONDO-OESTE' },
  ];

  const zones: Record<string, { id: string; name: string; accessCode: string }> = {};
  for (const z of zonasData) {
    let zone = await prisma.zone.findFirst({ where: { name: z.name } });
    if (!zone) {
      zone = await prisma.zone.create({
        data: {
          name: z.name,
          description: z.description,
          color: z.color,
          active: true,
          isPublic: false, // Zonas exclusivas - só com código/link
          accessCode: z.accessCode,
          centerLat: z.centerLat,
          centerLng: z.centerLng,
        },
      });
    } else {
      // Atualizar zona existente para ser exclusiva
      await prisma.zone.update({
        where: { id: zone.id },
        data: { isPublic: false, accessCode: z.accessCode },
      });
    }
    zones[z.name] = { id: zone.id, name: zone.name, accessCode: z.accessCode };
  }
  console.log(`✓ ${Object.keys(zones).length} zonas exclusivas (condomínios)`);

  const zoneCentral = zones['Condomínio Residencial Central'];
  const zoneNorte = zones['Residencial Jardim Norte'];
  const zoneSul = zones['Condomínio Vista Sul'];
  const zoneLeste = zones['Residencial Parque Leste'];
  const zoneOeste = zones['Condomínio Industrial Oeste'];

  // ========== USUÁRIOS ==========
  const usersData = [
    { email: 'admin@polys.app', name: 'Admin Polys', role: 'ADMIN', password: 'admin123' },
    { email: 'gestor@polys.app', name: 'Maria Gestora', role: 'MANAGER', password: DEFAULT_PASSWORD },
    { email: 'suporte@polys.app', name: 'João Suporte', role: 'SUPPORT', password: DEFAULT_PASSWORD },
    { email: 'ana.vendedora@polys.app', name: 'Ana Silva', role: 'USER', password: DEFAULT_PASSWORD },
    { email: 'carlos.loja@polys.app', name: 'Carlos Mendes', role: 'USER', password: DEFAULT_PASSWORD },
    { email: 'beatriz.artesanato@polys.app', name: 'Beatriz Costa', role: 'USER', password: DEFAULT_PASSWORD },
    { email: 'pedro.eletricista@polys.app', name: 'Pedro Santos', role: 'USER', password: DEFAULT_PASSWORD },
    { email: 'julia.limpeza@polys.app', name: 'Julia Oliveira', role: 'USER', password: DEFAULT_PASSWORD },
    { email: 'roberto.jardineiro@polys.app', name: 'Roberto Lima', role: 'USER', password: DEFAULT_PASSWORD },
    { email: 'maria.usuario@polys.app', name: 'Maria Ferreira', role: 'USER', password: DEFAULT_PASSWORD },
    { email: 'joao.comunidade@polys.app', name: 'João Pereira', role: 'USER', password: DEFAULT_PASSWORD },
  ];

  const users: Record<string, { id: string; email: string; name: string }> = {};
  for (const u of usersData) {
    const existing = await prisma.user.findUnique({ where: { email: u.email } });
    if (!existing) {
      const hash = await hashPassword(u.password);
      // Criptografa dados sensíveis (mesmo formato do cadastro normal)
      const rawData = {
        state: 'SP',
        city: 'São Paulo',
        neighborhood: 'Centro',
        street: 'Rua das Flores',
        houseNumber: '100',
        cep: '01310-100',
      };
      const encryptedData = await encryptUserFields(rawData, u.email);

      const user = await prisma.user.create({
        data: {
          email: u.email,
          passwordHash: hash,
          name: u.name,
          role: u.role,
          authProvider: 'local',
          state: rawData.state,
          city: rawData.city,
          neighborhood: encryptedData.neighborhood ?? rawData.neighborhood,
          street: encryptedData.street ?? rawData.street,
          houseNumber: encryptedData.houseNumber ?? rawData.houseNumber,
          cep: encryptedData.cep ?? rawData.cep,
          residenceLat: -23.5505 + (Math.random() - 0.5) * 0.05,
          residenceLng: -46.6333 + (Math.random() - 0.5) * 0.05,
        },
      });
      users[u.email] = { id: user.id, email: user.email, name: user.name };
    } else {
      users[u.email] = { id: existing.id, email: existing.email, name: existing.name };
    }
  }
  console.log(`✓ ${Object.keys(users).length} usuários`);

  const admin = users['admin@polys.app'];
  const gestor = users['gestor@polys.app'];
  const ana = users['ana.vendedora@polys.app'];
  const carlos = users['carlos.loja@polys.app'];
  const beatriz = users['beatriz.artesanato@polys.app'];
  const pedro = users['pedro.eletricista@polys.app'];
  const julia = users['julia.limpeza@polys.app'];
  const roberto = users['roberto.jardineiro@polys.app'];

  // ========== USER ZONE ACCESS (quem tem acesso a cada zona) ==========
  // Admin e Gestor têm acesso a TODAS as zonas
  // Outros usuários: distribuídos para testar (ana=Norte, carlos=Sul, beatriz=Leste, pedro=Oeste, julia=Central)
  const zoneAccessData = [
    { userId: admin.id, zoneId: zoneCentral.id },
    { userId: admin.id, zoneId: zoneNorte.id },
    { userId: admin.id, zoneId: zoneSul.id },
    { userId: admin.id, zoneId: zoneLeste.id },
    { userId: admin.id, zoneId: zoneOeste.id },
    { userId: gestor.id, zoneId: zoneCentral.id },
    { userId: gestor.id, zoneId: zoneNorte.id },
    { userId: gestor.id, zoneId: zoneSul.id },
    { userId: gestor.id, zoneId: zoneLeste.id },
    { userId: gestor.id, zoneId: zoneOeste.id },
    { userId: ana.id, zoneId: zoneNorte.id },
    { userId: carlos.id, zoneId: zoneSul.id },
    { userId: beatriz.id, zoneId: zoneLeste.id },
    { userId: pedro.id, zoneId: zoneOeste.id },
    { userId: julia.id, zoneId: zoneCentral.id },
    { userId: roberto.id, zoneId: zoneCentral.id },
    { userId: roberto.id, zoneId: zoneNorte.id },
  ];

  for (const acc of zoneAccessData) {
    await prisma.userZoneAccess.upsert({
      where: { userId_zoneId: { userId: acc.userId, zoneId: acc.zoneId } },
      update: {},
      create: acc,
    });
  }
  console.log(`✓ Acessos às zonas (UserZoneAccess)`);

  // Helper para criar produto
  const createProduct = async (p: { title: string; description: string; price: number; category: string; condition: string; seller: { id: string; email: string; name: string }; qty: number; zoneId?: string | null }) => {
    const exists = await prisma.product.findFirst({ where: { title: p.title, sellerId: p.seller.id } });
    if (!exists) {
      await prisma.product.create({
        data: {
          title: p.title,
          description: p.description,
          price: p.price,
          quantityAvailable: p.qty,
          category: p.category,
          condition: p.condition,
          unitType: 'unidade',
          images: ['https://placehold.co/400x400/14b8a6/white?text=Produto'],
          active: true,
          sellerId: p.seller.id,
          sellerEmail: p.seller.email,
          sellerName: p.seller.name,
          zoneId: p.zoneId ?? null,
          lat: -23.5505 + (Math.random() - 0.5) * 0.05,
          lng: -46.6333 + (Math.random() - 0.5) * 0.05,
        },
      });
    }
  };

  // ========== PRODUTOS GLOBAIS (zoneId: null - qualquer pessoa vê) ==========
  const produtosGlobais = [
    { title: 'iPhone 13 Pro 128GB', description: 'Smartphone Apple em excelente estado. Acompanha carregador e caixa original.', price: 4299, category: 'eletronicos', condition: 'usado_otimo', seller: ana, qty: 1 },
    { title: 'Notebook Dell Inspiron 15', description: 'Intel i5, 8GB RAM, 256GB SSD. Ideal para estudos e trabalho.', price: 2799, category: 'eletronicos', condition: 'usado_bom', seller: carlos, qty: 2 },
    { title: 'Camiseta Polo Masculina', description: 'Malha penteada de alta qualidade. Cores: azul, branco, preto.', price: 89.9, category: 'vestuario', condition: 'novo', seller: beatriz, qty: 15 },
    { title: 'Cesta de Café da Manhã', description: 'Cesta com pães, frios, frutas e sucos. Perfeita para presentear.', price: 149, category: 'alimentos', condition: 'novo', seller: beatriz, qty: 10 },
    { title: 'Kit Ferramentas Básico', description: 'Chave de fenda, philips, alicate, martelo e fita métrica.', price: 179, category: 'outros', condition: 'novo', seller: carlos, qty: 5 },
  ];
  for (const p of produtosGlobais) {
    await createProduct({ ...p, zoneId: null });
  }

  // ========== PRODUTOS POR ZONA (exclusivos de cada condomínio) ==========
  const produtosPorZona = [
    { title: 'Sofá 3 lugares cinza', description: 'Sofá retrátil e reclinável, tecido antimancha.', price: 1899, category: 'moveis', condition: 'novo', seller: ana, qty: 1, zoneId: zoneCentral.id },
    { title: 'Ventilador de Teto', description: 'Ventilador 6 pás, 3 velocidades, controle remoto.', price: 299, category: 'eletronicos', condition: 'novo', seller: ana, qty: 3, zoneId: zoneCentral.id },
    { title: 'Mesa de jantar 6 cadeiras', description: 'Conjunto completo em MDF. Mesa 1,40m.', price: 1299, category: 'moveis', condition: 'usado_otimo', seller: carlos, qty: 1, zoneId: zoneNorte.id },
    { title: 'Bicicleta Ergométrica', description: 'Bicicleta ergométrica com display. Pouco uso.', price: 599, category: 'outros', condition: 'usado_otimo', seller: ana, qty: 1, zoneId: zoneNorte.id },
    { title: 'Geladeira Frost Free', description: '310L, duplex. Funcionando perfeitamente.', price: 1599, category: 'eletronicos', condition: 'usado_bom', seller: carlos, qty: 1, zoneId: zoneSul.id },
    { title: 'Micro-ondas 20L', description: 'Inox, grill, 700W. Novo na caixa.', price: 349, category: 'eletronicos', condition: 'novo', seller: beatriz, qty: 2, zoneId: zoneSul.id },
    { title: 'Quadro Pintura Abstrata', description: 'Arte original em tela 40x60cm. Cores vibrantes.', price: 350, category: 'artesanato', condition: 'novo', seller: beatriz, qty: 1, zoneId: zoneLeste.id },
    { title: 'Vaso Decorativo Cerâmica', description: 'Vaso artesanal para plantas. 30cm altura.', price: 89, category: 'artesanato', condition: 'novo', seller: beatriz, qty: 8, zoneId: zoneLeste.id },
    { title: 'Furadeira de Impacto', description: '500W, kit com bits. Uso profissional.', price: 249, category: 'outros', condition: 'usado_otimo', seller: carlos, qty: 2, zoneId: zoneOeste.id },
  ];
  for (const p of produtosPorZona) {
    await createProduct(p);
  }
  console.log(`✓ Produtos: ${produtosGlobais.length} globais + ${produtosPorZona.length} por zona`);

  // Helper para criar serviço
  const createService = async (s: { title: string; description: string; pricePerHour?: number; pricePerDay?: number; pricePerService?: number; type: string; provider: { id: string; email: string; name: string }; zoneId?: string | null }) => {
    const exists = await prisma.service.findFirst({ where: { title: s.title, providerId: s.provider.id } });
    if (!exists) {
      await prisma.service.create({
        data: {
          title: s.title,
          description: s.description,
          price: s.pricePerService ?? s.pricePerHour ?? 0,
          priceType: 'servico',
          pricePerHour: s.pricePerHour ?? null,
          pricePerDay: s.pricePerDay ?? null,
          pricePerService: s.pricePerService ?? null,
          serviceType: s.type,
          images: ['https://placehold.co/400x400/14b8a6/white?text=Serviço'],
          active: true,
          providerId: s.provider.id,
          providerEmail: s.provider.email,
          providerName: s.provider.name,
          zoneId: s.zoneId ?? null,
          lat: -23.5505 + (Math.random() - 0.5) * 0.05,
          lng: -46.6333 + (Math.random() - 0.5) * 0.05,
          rating: 4.5 + Math.random() * 0.5,
          reviewsCount: Math.floor(Math.random() * 15) + 5,
        },
      });
    }
  };

  // ========== SERVIÇOS GLOBAIS (zoneId: null) ==========
  const servicosGlobais = [
    { title: 'Instalação Elétrica Residencial', description: 'Instalação e manutenção elétrica. Orçamento gratuito.', pricePerHour: 80, pricePerService: 350, type: 'eletrica', provider: pedro },
    { title: 'Limpeza Residencial', description: 'Limpeza completa. Produtos inclusos.', pricePerHour: 45, pricePerDay: 280, type: 'limpeza', provider: julia },
    { title: 'Manutenção de Jardim', description: 'Poda, adubação, plantio e paisagismo.', pricePerHour: 60, pricePerService: 200, type: 'jardinagem', provider: roberto },
    { title: 'Aulas de Matemática', description: 'Reforço escolar fundamental e médio. Material incluso.', pricePerHour: 80, type: 'aulas', provider: julia },
  ];
  for (const s of servicosGlobais) {
    await createService({ ...s, zoneId: null });
  }

  // ========== SERVIÇOS POR ZONA ==========
  const servicosPorZona = [
    { title: 'Encanamento e Desentupimento', description: 'Reparos em tubulações, desentupimento. Atendimento rápido.', pricePerHour: 90, pricePerService: 180, type: 'encanamento', provider: pedro, zoneId: zoneCentral.id },
    { title: 'Pintura de Paredes', description: 'Pintura interna e externa. Preparação e acabamento.', pricePerHour: 70, pricePerService: 400, type: 'pintura', provider: roberto, zoneId: zoneCentral.id },
    { title: 'Cuidados com Idosos', description: 'Companhia, medicamentos, alimentação. Cuidadora experiente.', pricePerHour: 50, pricePerDay: 350, type: 'cuidados', provider: julia, zoneId: zoneNorte.id },
    { title: 'Manutenção Geral', description: 'Reparos diversos: portas, janelas, móveis.', pricePerHour: 75, pricePerService: 250, type: 'manutencao', provider: pedro, zoneId: zoneSul.id },
    { title: 'Consultoria em Jardinagem', description: 'Projeto paisagístico e orientação de plantio.', pricePerHour: 90, pricePerService: 350, type: 'jardinagem', provider: roberto, zoneId: zoneLeste.id },
    { title: 'Instalação de Ar Condicionado', description: 'Instalação e manutenção de split e janela.', pricePerService: 450, type: 'eletrica', provider: pedro, zoneId: zoneOeste.id },
  ];
  for (const s of servicosPorZona) {
    await createService(s);
  }
  console.log(`✓ Serviços: ${servicosGlobais.length} globais + ${servicosPorZona.length} por zona`);

  // Helper para criar projeto
  const createProject = async (proj: {
    title: string; shortDesc: string; description: string; category: string; status: string;
    targetAmount: number; currentAmount: number; minVotes: number; votesCount: number;
    owner: { id: string; email: string }; address: string; lat: number; lng: number;
    zoneId?: string | null;
  }) => {
    const exists = await prisma.project.findFirst({ where: { title: proj.title } });
    if (!exists) {
      const project = await prisma.project.create({
        data: {
          title: proj.title,
          shortDescription: proj.shortDesc,
          description: proj.description,
          category: proj.category,
          status: proj.status,
          targetAmount: proj.targetAmount,
          currentAmount: proj.currentAmount,
          minVotes: proj.minVotes,
          votesCount: proj.votesCount,
          ownerId: proj.owner.id,
          ownerEmail: proj.owner.email,
          locationAddress: proj.address,
          latitude: proj.lat,
          longitude: proj.lng,
          zoneId: proj.zoneId ?? null,
          fundingDeadline: proj.status === 'funding' ? new Date(Date.now() + 60 * 24 * 60 * 60 * 1000) : null,
        },
      });
      if (proj.status !== 'proposed' && project.id) {
        await prisma.projectExpense.create({
          data: { projectId: project.id, type: 'produto', description: 'Material principal', cost: proj.targetAmount * 0.5, quantity: 1 },
        });
      }
    }
  };

  // ========== PROJETOS GLOBAIS (zoneId: null - qualquer pessoa vê) ==========
  const projetosGlobais = [
    { title: 'Posto de Saúde na Região', shortDesc: 'Parceria para atendimento básico de saúde', description: 'Projeto em parceria com a prefeitura para trazer um posto de saúde com atendimento básico para a região.', category: 'saude', status: 'proposed', targetAmount: 0, currentAmount: 0, minVotes: 100, votesCount: 0, owner: admin, address: 'A definir com prefeitura', lat: -23.5505, lng: -46.6333 },
    { title: 'Feira de Artesanato Mensal', shortDesc: 'Espaço para moradores venderem produtos artesanais', description: 'Organizar mensalmente uma feira de artesanato. Moradores poderão expor e vender. Estrutura com mesas e toldos.', category: 'cultura', status: 'proposed', targetAmount: 8000, currentAmount: 0, minVotes: 25, votesCount: 8, owner: gestor, address: 'Praça central da cidade', lat: -23.5515, lng: -46.6345 },
  ];
  for (const p of projetosGlobais) {
    await createProject({ ...p, zoneId: null });
  }

  // ========== PROJETOS POR ZONA (exclusivos de cada condomínio) ==========
  const projetosPorZona = [
    { title: 'Iluminação LED nas Áreas Comuns', shortDesc: 'Substituir lâmpadas por LED em corredores e jardins', description: 'Modernizar iluminação trocando por LED. Reduz consumo em até 70%.', category: 'infraestrutura', status: 'voting', targetAmount: 15000, currentAmount: 3200, minVotes: 50, votesCount: 38, owner: gestor, address: 'Áreas comuns', lat: -23.5510, lng: -46.6340, zoneId: zoneCentral.id },
    { title: 'Biblioteca Comunitária', shortDesc: 'Criar espaço de leitura para moradores', description: 'Transformar sala ociosa em biblioteca. Livros, estantes, mesas.', category: 'educacao', status: 'funding', targetAmount: 25000, currentAmount: 18200, minVotes: 30, votesCount: 45, owner: gestor, address: 'Bloco B - Sala 101', lat: -23.5520, lng: -46.6350, zoneId: zoneCentral.id },
    { title: 'Academia ao Ar Livre', shortDesc: 'Instalar equipamentos de ginástica na área comum', description: 'Aparelhos de alongamento, musculação. Piso antiderrapante.', category: 'lazer', status: 'proposed', targetAmount: 35000, currentAmount: 0, minVotes: 60, votesCount: 15, owner: gestor, address: 'Área de lazer Norte', lat: -23.5110, lng: -46.6210, zoneId: zoneNorte.id },
    { title: 'Câmeras de Segurança', shortDesc: 'Sistema de monitoramento 24h nas entradas', description: 'Câmeras IP em todos os acessos. Gravação em nuvem e app.', category: 'seguranca', status: 'voting', targetAmount: 28000, currentAmount: 0, minVotes: 60, votesCount: 52, owner: gestor, address: 'Portaria e acessos', lat: -23.5910, lng: -46.6410, zoneId: zoneSul.id },
    { title: 'Parquinho Infantil', shortDesc: 'Reformar e ampliar parquinho das crianças', description: 'Novos brinquedos, piso de segurança, cercamento.', category: 'lazer', status: 'proposed', targetAmount: 18000, currentAmount: 0, minVotes: 40, votesCount: 12, owner: gestor, address: 'Área verde Leste', lat: -23.5410, lng: -46.6010, zoneId: zoneLeste.id },
    { title: 'Sala de Reuniões', shortDesc: 'Criar espaço para reuniões e eventos', description: 'Sala equipada com projetor, ar condicionado e Wi-Fi.', category: 'infraestrutura', status: 'voting', targetAmount: 22000, currentAmount: 0, minVotes: 35, votesCount: 28, owner: gestor, address: 'Bloco administrativo', lat: -23.5610, lng: -46.6610, zoneId: zoneOeste.id },
  ];
  for (const p of projetosPorZona) {
    await createProject(p);
  }
  console.log(`✓ Projetos: ${projetosGlobais.length} globais + ${projetosPorZona.length} por zona`);

  // ========== NOTÍCIA GLOBAL (zoneId: null) ==========
  const newsGlobal = await prisma.news.findFirst({ where: { title: 'Bem-vindos à Comunidade Polys!' } });
  if (!newsGlobal && gestor) {
    await prisma.news.create({
      data: {
        title: 'Bem-vindos à Comunidade Polys!',
        content: 'Esta é a plataforma da sua comunidade. Aqui você encontra produtos, serviços e projetos. Zonas exclusivas (condomínios) exigem código de acesso - peça ao gestor o link de convite.',
        summary: 'Boas-vindas e informações sobre a plataforma',
        authorId: gestor.id,
        zoneId: null,
        isPublished: true,
        isPinned: true,
        publishedAt: new Date(),
      },
    });
    console.log('✓ Notícia global');
  }

  // ========== RESUMO ==========
  console.log('\n========================================');
  console.log('✅ Seed concluído com sucesso!');
  console.log('========================================\n');
  console.log('📋 Estrutura:');
  console.log('   • Dados GLOBAIS (zoneId: null) = qualquer pessoa vê');
  console.log('   • Dados por ZONA = só quem tem acesso à zona (código/link)\n');
  console.log('🔐 Zonas exclusivas - códigos de acesso:');
  console.log('   CONDO-CENTRAL | CONDO-NORTE | CONDO-SUL | CONDO-LESTE | CONDO-OESTE');
  console.log('   (Use em /zones/join ou via link de convite em /invitelinks)\n');
  console.log('👤 Contas:');
  console.log('   Admin:    admin@polys.app / admin123');
  console.log('   Gestor:   gestor@polys.app / senha123');
  console.log('   Suporte:  suporte@polys.app / senha123');
  console.log('   Outros:   [email] / senha123\n');
}

main()
  .catch((e) => {
    console.error('Erro no seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
