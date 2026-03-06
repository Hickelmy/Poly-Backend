import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CaptchaService } from './captcha.service';
import { CaptchaGuard } from './captcha.guard';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [CaptchaService, CaptchaGuard],
  exports: [CaptchaService, CaptchaGuard],
})
export class CaptchaModule {}
