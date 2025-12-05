import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth() {
    return {
      status: 'ok',
      message: 'Polys API is running',
      timestamp: new Date().toISOString(),
    };
  }
}


