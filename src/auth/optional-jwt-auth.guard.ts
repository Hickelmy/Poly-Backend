import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  // Retorna o usuário se autenticado, mas não bloqueia se não estiver
  handleRequest(err: any, user: any) {
    // Retorna o usuário se existir, ou undefined se não
    return user || undefined;
  }

  // Permite que a requisição continue mesmo sem token
  canActivate(context: ExecutionContext) {
    // Tenta extrair e validar o token, mas não falha se não existir
    return super.canActivate(context);
  }
}
