import { Controller, Get } from '@nestjs/common';
import { type ApiInfo, AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getInfo(): ApiInfo {
    return this.appService.getInfo();
  }
}
