import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { EncryptionService } from '../common/encryption.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
  ) {}

  async create(dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      throw new ConflictException('E-mail já está em uso');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    // Os dados sensíveis já vêm criptografados do frontend
    // Apenas salvamos no banco (a descriptografia acontece no findOne)
    const userData: any = {
      email: dto.email,
      passwordHash,
      name: dto.name,
      role: 'USER',
    };

    // Adiciona campos de endereço se fornecidos (já criptografados)
    if (dto.phone) userData.phone = dto.phone;
    if (dto.cep) userData.cep = dto.cep;
    if (dto.state) userData.state = dto.state;
    if (dto.city) userData.city = dto.city;
    if (dto.neighborhood) userData.neighborhood = dto.neighborhood;
    if (dto.street) userData.street = dto.street;
    if (dto.houseNumber) userData.houseNumber = dto.houseNumber;

    return this.prisma.user.create({
      data: userData,
    });
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        avatarUrl: true,
        bannerUrl: true,
        pixKeyRandom: true,
        pixKeyPhone: true,
        pixKeyEmail: true,
        pixKeyCpf: true,
        phone: true,
        cep: true,
        state: true,
        city: true,
        neighborhood: true,
        street: true,
        houseNumber: true,
        residenceLat: true,
        residenceLng: true,
        residenceZoneId: true,
        currentZoneId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    // Descriptografa campos sensíveis
    const sensitiveFields = [
      'phone',
      'cep',
      'street',
      'houseNumber',
      'neighborhood',
      'pixKeyRandom',
      'pixKeyPhone',
      'pixKeyEmail',
      'pixKeyCpf',
    ];

    const decryptedUser = await this.encryptionService.decryptObject(
      user,
      sensitiveFields,
      user.email,
    );

    // Map to frontend format
    return {
      ...decryptedUser,
      residence_lat: decryptedUser.residenceLat,
      residence_lng: decryptedUser.residenceLng,
      residence_zone_id: decryptedUser.residenceZoneId,
      current_zone_id: decryptedUser.currentZoneId,
    };
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.ensureExists(id);

    // Busca o email do usuário para descriptografar se necessário
    const existingUser = await this.prisma.user.findUnique({
      where: { id },
      select: { email: true },
    });

    // Os dados já vêm criptografados do frontend, então apenas salvamos
    // A descriptografia acontece no findOne quando os dados são lidos
    // Só inclui campos que foram enviados (evita sobrescrever com undefined)
    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    // role is excluded — use updateRole() to change roles
    if (dto.avatarUrl !== undefined) data.avatarUrl = dto.avatarUrl;
    if (dto.bannerUrl !== undefined) data.bannerUrl = dto.bannerUrl;
    if (dto.pixKeyRandom !== undefined) data.pixKeyRandom = dto.pixKeyRandom;
    if (dto.pixKeyPhone !== undefined) data.pixKeyPhone = dto.pixKeyPhone;
    if (dto.pixKeyEmail !== undefined) data.pixKeyEmail = dto.pixKeyEmail;
    if (dto.pixKeyCpf !== undefined) data.pixKeyCpf = dto.pixKeyCpf;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.cep !== undefined) data.cep = dto.cep;
    if (dto.state !== undefined) data.state = dto.state;
    if (dto.city !== undefined) data.city = dto.city;
    if (dto.neighborhood !== undefined) data.neighborhood = dto.neighborhood;
    if (dto.street !== undefined) data.street = dto.street;
    if (dto.houseNumber !== undefined) data.houseNumber = dto.houseNumber;

    // Handle residence fields (snake_case from frontend)
    if ((dto as any).residence_lat !== undefined) {
      data.residenceLat = (dto as any).residence_lat;
    }
    if ((dto as any).residence_lng !== undefined) {
      data.residenceLng = (dto as any).residence_lng;
    }
    if ((dto as any).residence_zone_id !== undefined) {
      data.residenceZoneId = (dto as any).residence_zone_id;
    }
    if ((dto as any).current_zone_id !== undefined) {
      data.currentZoneId = (dto as any).current_zone_id;
    }

    // Also handle camelCase versions
    if ((dto as any).residenceLat !== undefined) {
      data.residenceLat = (dto as any).residenceLat;
    }
    if ((dto as any).residenceLng !== undefined) {
      data.residenceLng = (dto as any).residenceLng;
    }
    if ((dto as any).residenceZoneId !== undefined) {
      data.residenceZoneId = (dto as any).residenceZoneId;
    }
    if ((dto as any).currentZoneId !== undefined) {
      data.currentZoneId = (dto as any).currentZoneId;
    }

    const user = await this.prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        avatarUrl: true,
        bannerUrl: true,
        pixKeyRandom: true,
        pixKeyPhone: true,
        pixKeyEmail: true,
        pixKeyCpf: true,
        phone: true,
        cep: true,
        state: true,
        city: true,
        neighborhood: true,
        street: true,
        houseNumber: true,
        residenceLat: true,
        residenceLng: true,
        residenceZoneId: true,
        currentZoneId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Descriptografa campos sensíveis antes de retornar
    const sensitiveFields = [
      'phone',
      'cep',
      'street',
      'houseNumber',
      'neighborhood',
      'pixKeyRandom',
      'pixKeyPhone',
      'pixKeyEmail',
      'pixKeyCpf',
    ];

    const decryptedUser = await this.encryptionService.decryptObject(
      user,
      sensitiveFields,
      user.email,
    );

    return {
      ...decryptedUser,
      residence_lat: decryptedUser.residenceLat,
      residence_lng: decryptedUser.residenceLng,
      residence_zone_id: decryptedUser.residenceZoneId,
      current_zone_id: decryptedUser.currentZoneId,
    };
  }

  async createFromFirebase(data: {
    email: string;
    name: string;
    firebaseUid: string;
    avatarUrl?: string;
    authProvider: string;
  }) {
    const existing = await this.prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existing) {
      throw new ConflictException('E-mail já está em uso');
    }

    return this.prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        firebaseUid: data.firebaseUid,
        avatarUrl: data.avatarUrl,
        authProvider: data.authProvider,
        role: 'USER',
      },
    });
  }

  async linkFirebase(userId: string, firebaseUid: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { firebaseUid, authProvider: 'google' },
    });
  }

  async updateRole(id: string, role: string) {
    await this.ensureExists(id);
    const allowed = ['USER', 'MANAGER', 'ADMIN', 'SUPPORT'];
    if (!allowed.includes(role)) {
      throw new Error(`Role inválida: ${role}`);
    }
    return this.prisma.user.update({ where: { id }, data: { role }, select: { id: true, email: true, role: true } });
  }

  async remove(id: string) {
    await this.ensureExists(id);
    await this.prisma.user.delete({ where: { id } });
    return { success: true };
  }

  private async ensureExists(id: string) {
    const exists = await this.prisma.user.findUnique({ where: { id } });
    if (!exists) {
      throw new NotFoundException('Usuário não encontrado');
    }
  }
}


