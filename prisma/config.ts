import { defineDatasource } from '@prisma/internals';

export default defineDatasource({
  provider: 'postgresql',
  url: process.env.DATABASE_URL,
});

