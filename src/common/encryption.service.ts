import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

const isDev = process.env.NODE_ENV !== 'production';

/**
 * Serviço de descriptografia para dados sensíveis
 * Descriptografa dados que foram criptografados no frontend usando AES-GCM
 */
@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name);
  /**
   * Deriva uma chave de criptografia a partir de uma string
   */
  private async deriveKey(password: string, salt: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      crypto.pbkdf2(password, salt, 100000, 32, 'sha256', (err, derivedKey) => {
        if (err) reject(err);
        else resolve(derivedKey);
      });
    });
  }

  /**
   * Obtém a chave de criptografia para um usuário
   */
  private async getEncryptionKey(userEmail: string): Promise<Buffer> {
    const masterKey = process.env.ENCRYPTION_MASTER_KEY || 'polys-master-key-change-in-production';
    const keyString = `${masterKey}-${userEmail}`;
    const salt = Buffer.from('polys-salt-fixed', 'utf-8');
    
    // Removido logs para melhorar performance
    return this.deriveKey(keyString, salt);
  }

  /**
   * Descriptografa um texto criptografado
   */
  async decrypt(encryptedText: string, userEmail: string): Promise<string | null> {
    if (!encryptedText || !userEmail) return encryptedText as any;

    // Verifica se o texto parece estar criptografado antes de tentar
    if (!this.isEncrypted(encryptedText)) {
      if (isDev) this.logger.log(`Texto não passou na validação isEncrypted para ${userEmail}`);
      return encryptedText; // Retorna o texto original se não estiver criptografado
    }

    // Decodifica de base64 uma vez
    const combined = Buffer.from(encryptedText, 'base64');
    if (combined.length < 28) {
      if (isDev) this.logger.log(`Dados muito curtos (${combined.length} bytes), mínimo esperado: 28 bytes`);
      return encryptedText;
    }
    
    const iv = combined.slice(0, 12);
    const encrypted = combined.slice(12);
    const authTag = encrypted.slice(-16);
    const ciphertext = encrypted.slice(0, -16);

    // Tenta primeiro com a chave configurada
    try {
      const key = await this.getEncryptionKey(userEmail);
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);
      
      let decrypted = decipher.update(ciphertext, undefined, 'utf-8');
      decrypted += decipher.final('utf-8');
      
      return decrypted;
    } catch (error) {
      // Se falhar, tenta com a chave padrão (para dados antigos)
      const defaultMasterKey = 'polys-master-key-change-in-production';
      const currentMasterKey = process.env.ENCRYPTION_MASTER_KEY;
      
      // Só tenta com chave padrão se a chave atual for diferente da padrão
      if (currentMasterKey && currentMasterKey !== defaultMasterKey) {
        try {
          const keyString = `${defaultMasterKey}-${userEmail}`;
          const salt = Buffer.from('polys-salt-fixed', 'utf-8');
          const defaultKey = await this.deriveKey(keyString, salt);
          
          const decipher = crypto.createDecipheriv('aes-256-gcm', defaultKey, iv);
          decipher.setAuthTag(authTag);
          
          let decrypted = decipher.update(ciphertext, undefined, 'utf-8');
          decrypted += decipher.final('utf-8');
          
          return decrypted;
        } catch (defaultError) {
          // Se também falhar com a chave padrão, retorna null
        }
      }
      
      // Se todas as tentativas falharem, retorna null (sem logs para melhorar performance)
      return null;
    }
  }

  /**
   * Descriptografa um objeto com campos sensíveis
   */
  async decryptObject<T extends Record<string, any>>(
    obj: T,
    sensitiveFields: string[],
    userEmail: string,
  ): Promise<T> {
    if (!obj || !userEmail) return obj;

    const decrypted: any = { ...obj };

    for (const field of sensitiveFields) {
      // Ignora campos null, undefined, ou que não são strings
      if (decrypted[field] == null || typeof decrypted[field] !== 'string') {
        continue; // Mantém o valor original (null/undefined)
      }

      // Ignora strings vazias
      if (decrypted[field].trim() === '') {
        continue; // Mantém o valor original (string vazia)
      }

      // Verifica se o campo parece estar criptografado antes de tentar descriptografar
      const isEncrypted = this.isEncrypted(decrypted[field]);
      
      if (isEncrypted) {
        try {
          const decryptedValue = await this.decrypt(decrypted[field], userEmail);
          if (decryptedValue === null) {
            // Descriptografia falhou (chave diferente), retorna string vazia para forçar recriptografia
            decrypted[field] = '';
          } else {
            decrypted[field] = decryptedValue;
          }
        } catch (error) {
          // Se falhar, retorna string vazia para forçar recriptografia (sem logs para melhorar performance)
          decrypted[field] = '';
        }
      }
      // Se não estiver criptografado, mantém o valor original
    }

    return decrypted as T;
  }

  /**
   * Verifica se um texto está criptografado
   */
  isEncrypted(text: string): boolean {
    if (!text || typeof text !== 'string' || text.trim() === '') return false;
    
    // Verifica se é base64 válido
    if (!/^[A-Za-z0-9+/=]+$/.test(text)) return false;
    
    // Verifica se tem tamanho suficiente para ser criptografado
    // Mínimo: 12 bytes (IV) + 16 bytes (auth tag) = 28 bytes = ~38 caracteres em base64
    if (text.length < 38) return false;
    
    // Verifica se o tamanho é múltiplo de 4 (base64 válido)
    // Mas base64 pode ter padding, então aceita se tiver padding válido
    const paddingLength = (text.match(/=+$/) || [''])[0].length;
    if (paddingLength > 2) return false;
    
    // Se passou em todas as validações, provavelmente está criptografado
    return true;
  }
}

