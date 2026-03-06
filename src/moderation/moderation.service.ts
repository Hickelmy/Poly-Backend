import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ModerationResult {
  flagged: boolean;
  categories?: Record<string, boolean>;
  categoryScores?: Record<string, number>;
  blockedBy?: 'keywords' | 'openai';
}

/** Palavras-chave que bloqueiam imediatamente (produtos/serviços sexuais, etc.) */
const BLOCKED_KEYWORDS = [
  // Brinquedos sexuais
  'penis de borracha', 'pênis de borracha', 'vibrador', 'dildo', 'consolo', 'masturbador',
  'sex toy', 'sextoy', 'brinquedo sexual', 'boneca inflável', 'boneca sexual',
  'lingerie erótica', 'fantasia sexual', 'estimulador', 'sugador de clitóris',
  'loja de sex shop', 'sex shop', 'adult store', 'loja adulta',
  // Serviços sexuais
  'serviço sexual', 'serviços sexuais', 'prostituição', 'prostituta', 'prostituto',
  'acompanhante', 'escort', 'garota de programa', 'garoto de programa',
  'massagem erótica', 'massagem sensual', 'programa sexual',
  'massagem tantrica', 'terapia sexual',
  // Conteúdo explícito
  'conteúdo adulto', 'conteúdo erótico', 'onlyfans', 'only fans',
  'vídeo pornô', 'video pornô', 'pornografia', 'xxx', 'conteúdo +18',
];

function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '') // remove acentos
    .replace(/\s+/g, ' ');
}

function containsBlockedKeyword(text: string): boolean {
  if (!text || text.trim().length === 0) return false;
  const normalized = normalizeForMatch(text);
  return BLOCKED_KEYWORDS.some((kw) => normalized.includes(normalizeForMatch(kw)));
}

@Injectable()
export class ModerationService {
  private readonly logger = new Logger(ModerationService.name);
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.openai.com/v1/moderations';
  private readonly model = 'omni-moderation-latest';

  constructor(private config: ConfigService) {
    this.apiKey = this.config.get<string>('OPENAI_API_KEY') || '';
  }

  private isConfigured(): boolean {
    return !!this.apiKey && this.apiKey.length > 10;
  }

  /**
   * Modera texto. Retorna { flagged: true } se conteúdo inadequado.
   * Primeiro verifica palavras-chave bloqueadas, depois OpenAI.
   */
  async moderateText(text: string): Promise<ModerationResult> {
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return { flagged: false };
    }

    if (containsBlockedKeyword(text)) {
      return { flagged: true, blockedBy: 'keywords' };
    }

    if (!this.isConfigured()) {
      this.logger.warn('OPENAI_API_KEY não configurada - moderação desabilitada');
      return { flagged: false };
    }

    try {
      const input = [{ type: 'text' as const, text: text.trim().slice(0, 32000) }];
      const res = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          input,
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        this.logger.error(`OpenAI Moderation API error: ${res.status} - ${err}`);
        return { flagged: false }; // Em caso de erro, permite (fail-open para não bloquear usuários)
      }

      const data = (await res.json()) as { results?: Array<{ flagged?: boolean; categories?: Record<string, boolean>; category_scores?: Record<string, number> }> };
      const result = data.results?.[0];
      if (!result) return { flagged: false };

      return {
        flagged: !!result.flagged,
        categories: result.categories,
        categoryScores: result.category_scores,
        blockedBy: result.flagged ? 'openai' : undefined,
      };
    } catch (err) {
      this.logger.error('Erro ao moderar texto:', err);
      return { flagged: false };
    }
  }

  /**
   * Modera texto e imagens (URLs). Retorna { flagged: true } se conteúdo inadequado.
   */
  async moderateTextAndImages(
    text: string,
    imageUrls: string[] = [],
  ): Promise<ModerationResult> {
    if (text && containsBlockedKeyword(text)) {
      return { flagged: true, blockedBy: 'keywords' };
    }

    if (!this.isConfigured()) {
      this.logger.warn('OPENAI_API_KEY não configurada - moderação desabilitada');
      return { flagged: false };
    }

    const input: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> = [];

    if (text && text.trim().length > 0) {
      input.push({ type: 'text', text: text.trim().slice(0, 32000) });
    }

    const validUrls = (imageUrls || []).filter((u) => u && (u.startsWith('http') || u.startsWith('data:')));
    for (const url of validUrls.slice(0, 5)) {
      input.push({ type: 'image_url', image_url: { url } });
    }

    if (input.length === 0) return { flagged: false };

    try {
      const res = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          input,
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        this.logger.error(`OpenAI Moderation API error: ${res.status} - ${err}`);
        return { flagged: false };
      }

      const data = (await res.json()) as { results?: Array<{ flagged?: boolean; categories?: Record<string, boolean>; category_scores?: Record<string, number> }> };
      const result = data.results?.[0];
      if (!result) return { flagged: false };

      return {
        flagged: !!result.flagged,
        categories: result.categories,
        categoryScores: result.category_scores,
        blockedBy: result.flagged ? 'openai' : undefined,
      };
    } catch (err) {
      this.logger.error('Erro ao moderar conteúdo:', err);
      return { flagged: false };
    }
  }

  /**
   * Modera múltiplos textos concatenados (ex: título + conteúdo + resumo).
   */
  async moderateTextFields(fields: Record<string, string | null | undefined>): Promise<ModerationResult> {
    const combined = Object.values(fields)
      .filter((v): v is string => !!v && typeof v === 'string')
      .join('\n\n');
    return this.moderateText(combined);
  }
}
