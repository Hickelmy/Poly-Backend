import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      throw new ConflictException('E-mail já está em uso');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    return this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        name: dto.name,
        role: dto.role || 'USER',
      },
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

    // Map to frontend format
    return {
      ...user,
      residence_lat: user.residenceLat,
      residence_lng: user.residenceLng,
      residence_zone_id: user.residenceZoneId,
      current_zone_id: user.currentZoneId,
    };
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.ensureExists(id);

    const data: any = {
      name: dto.name,
      role: dto.role,
      avatarUrl: dto.avatarUrl,
      bannerUrl: dto.bannerUrl,
      pixKeyRandom: dto.pixKeyRandom,
      pixKeyPhone: dto.pixKeyPhone,
      pixKeyEmail: dto.pixKeyEmail,
      pixKeyCpf: dto.pixKeyCpf,
      phone: dto.phone,
      cep: dto.cep,
      state: dto.state,
      city: dto.city,
      neighborhood: dto.neighborhood,
      street: dto.street,
      houseNumber: dto.houseNumber,
    };

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

    return {
      ...user,
      residence_lat: user.residenceLat,
      residence_lng: user.residenceLng,
      residence_zone_id: user.residenceZoneId,
      current_zone_id: user.currentZoneId,
    };
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


