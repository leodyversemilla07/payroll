import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return API metadata with an ok status', () => {
      expect(appController.getInfo()).toEqual({
        name: 'payroll-api',
        version: expect.any(String),
        status: 'ok',
        timestamp: expect.any(String),
        endpoints: { trpc: '/trpc' },
      });
    });
  });
});
