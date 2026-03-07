import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { UsersService } from '../users/users.service';
import { FirebaseService } from '../firebase/firebase.service';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { CreateUserDto } from '../users/dto/create-user.dto';

@Injectable()
export class AuthService {
  private readonly refreshTokenTtlDays: number;

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly firebaseService: FirebaseService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.refreshTokenTtlDays = this.config.get<number>('REFRESH_TOKEN_TTL_DAYS', 4);
  }

  async validateUser(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    if (!user.passwordHash) {
      throw new UnauthorizedException(
        'Esta conta usa login social. Use o Google para entrar.',
      );
    }

    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatch) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    return user;
  }

  async login(dto: LoginDto, userAgent?: string, ipAddress?: string) {
    const user = await this.validateUser(dto.email, dto.password);
    return this.generateTokenPair(user, userAgent, ipAddress);
  }

  async register(dto: CreateUserDto) {
    const user = await this.usersService.create(dto);
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };
  }

  async loginWithGoogle(firebaseIdToken: string, userAgent?: string, ipAddress?: string) {
    if (!this.firebaseService.isConfigured) {
      throw new UnauthorizedException(
        'Login com Google não está configurado no servidor.',
      );
    }

    const firebaseUser =
      await this.firebaseService.verifyIdToken(firebaseIdToken);
    if (!firebaseUser) {
      throw new UnauthorizedException('Token do Google inválido ou expirado.');
    }

    let user = await this.usersService.findByEmail(firebaseUser.email);

    if (!user) {
      user = await this.usersService.createFromFirebase({
        email: firebaseUser.email,
        name: firebaseUser.name,
        firebaseUid: firebaseUser.uid,
        avatarUrl: firebaseUser.photoUrl,
        authProvider: 'google',
      });
    } else if (!user.firebaseUid) {
      await this.usersService.linkFirebase(user.id, firebaseUser.uid);
    }

    return this.generateTokenPair(user, userAgent, ipAddress);
  }

  async refreshTokens(refreshToken: string, userAgent?: string, ipAddress?: string) {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
    });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      // If token was already revoked, revoke all tokens for that user (token reuse detected)
      if (stored?.revokedAt) {
        await this.prisma.refreshToken.updateMany({
          where: { userId: stored.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      throw new UnauthorizedException('Refresh token inválido ou expirado');
    }

    const user = await this.usersService.findByEmail(
      (await this.prisma.user.findUnique({ where: { id: stored.userId }, select: { email: true } }))?.email || '',
    );

    if (!user) {
      throw new UnauthorizedException('Usuário não encontrado');
    }

    // Rotate: revoke old, create new
    const newRefreshToken = uuidv4();

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date(), replacedBy: newRefreshToken },
    });

    await this.prisma.refreshToken.create({
      data: {
        token: newRefreshToken,
        userId: user.id,
        userAgent,
        ipAddress,
        expiresAt: new Date(Date.now() + this.refreshTokenTtlDays * 24 * 3600 * 1000),
      },
    });

    const payload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = await this.jwtService.signAsync(payload);

    return {
      access_token: accessToken,
      refresh_token: newRefreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatarUrl: user.avatarUrl,
        authProvider: user.authProvider,
      },
    };
  }

  async revokeRefreshToken(token: string) {
    await this.prisma.refreshToken.updateMany({
      where: { token, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllUserTokens(userId: string) {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async generateTokenPair(
    user: any,
    userAgent?: string,
    ipAddress?: string,
  ) {
    const payload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = await this.jwtService.signAsync(payload);

    const refreshToken = uuidv4();
    await this.prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        userAgent,
        ipAddress,
        expiresAt: new Date(Date.now() + this.refreshTokenTtlDays * 24 * 3600 * 1000),
      },
    });

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatarUrl: user.avatarUrl,
        authProvider: user.authProvider,
      },
    };
  }
}
