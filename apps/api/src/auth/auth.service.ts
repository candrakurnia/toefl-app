import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthTokens, UserPublic } from '@toefl/shared';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';

const REFRESH_COOKIE = 'refresh_token';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(email: string, password: string): Promise<UserPublic> {
    const normalized = email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email: normalized } });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await this.prisma.user.create({
      data: { email: normalized, passwordHash },
    });
    return this.toPublic(user);
  }

  async login(email: string, password: string, res: Response): Promise<AuthTokens> {
    const normalized = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email: normalized } });
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const matches = await bcrypt.compare(password, user.passwordHash);
    if (!matches) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return this.issueTokens(user.id, user.email, res);
  }

  async refresh(refreshToken: string | undefined, res: Response): Promise<AuthTokens> {
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token is required');
    }
    const tokenHash = this.hash(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!stored || stored.expiresAt.getTime() <= Date.now()) {
      if (stored) {
        await this.prisma.refreshToken.delete({ where: { id: stored.id } });
      }
      throw new UnauthorizedException('Refresh token is invalid');
    }
    await this.prisma.refreshToken.delete({ where: { id: stored.id } });
    return this.issueTokens(stored.user.id, stored.user.email, res);
  }

  private async issueTokens(userId: string, email: string, res: Response): Promise<AuthTokens> {
    const accessTtl = Number(process.env.JWT_ACCESS_TTL_SEC ?? 900);
    const refreshTtl = Number(process.env.JWT_REFRESH_TTL_SEC ?? 604800);
    const accessToken = await this.jwt.signAsync({ sub: userId, email }, { expiresIn: accessTtl });
    const refreshToken = randomBytes(32).toString('hex');
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hash(refreshToken),
        expiresAt: new Date(Date.now() + refreshTtl * 1000),
      },
    });
    res.cookie(REFRESH_COOKIE, refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: refreshTtl * 1000,
    });
    return { accessToken, refreshToken };
  }

  private hash(token: string) {
    const pepper = process.env.JWT_REFRESH_SECRET ?? '';
    return createHash('sha256').update(`${pepper}:${token}`).digest('hex');
  }

  private toPublic(user: { id: string; email: string; createdAt: Date }): UserPublic {
    return {
      id: user.id,
      email: user.email,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
