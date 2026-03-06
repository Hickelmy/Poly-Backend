import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService implements OnModuleInit {
  private client!: SupabaseClient;
  private adminClient!: SupabaseClient;
  private readonly logger = new Logger(SupabaseService.name);

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const url = this.configService.get<string>('SUPABASE_URL');
    const anonKey = this.configService.get<string>('SUPABASE_ANON_KEY');
    const serviceKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    if (!url || !anonKey) {
      this.logger.warn(
        'SUPABASE_URL or SUPABASE_ANON_KEY not configured. Supabase features disabled.',
      );
      return;
    }

    this.client = createClient(url, anonKey);

    if (serviceKey) {
      this.adminClient = createClient(url, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
    }

    this.logger.log('Supabase client initialized');
  }

  getClient(): SupabaseClient | null {
    return this.client || null;
  }

  getAdminClient(): SupabaseClient | null {
    return this.adminClient || null;
  }

  async uploadFile(
    bucket: string,
    path: string,
    file: Buffer,
    contentType: string,
  ): Promise<string | null> {
    const storage = (this.adminClient || this.client)?.storage;
    if (!storage) return null;

    const { error } = await storage.from(bucket).upload(path, file, {
      contentType,
      upsert: true,
    });

    if (error) {
      this.logger.error(`Upload error: ${error.message}`);
      return null;
    }

    const { data: urlData } = storage.from(bucket).getPublicUrl(path);
    return urlData.publicUrl;
  }

  async deleteFile(bucket: string, path: string): Promise<boolean> {
    const storage = (this.adminClient || this.client)?.storage;
    if (!storage) return false;

    const { error } = await storage.from(bucket).remove([path]);
    if (error) {
      this.logger.error(`Delete error: ${error.message}`);
      return false;
    }
    return true;
  }
}
