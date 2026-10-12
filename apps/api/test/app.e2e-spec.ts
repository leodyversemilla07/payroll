import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Content-Type', /json/)
      .expect((response) => {
        if (response.body?.name !== 'payroll-api') {
          throw new Error(`Unexpected API name: ${response.text}`);
        }
        if (response.body?.status !== 'ok') {
          throw new Error(`Unexpected API status: ${response.text}`);
        }
      });
  });

  afterEach(async () => {
    await app.close();
  });
});
