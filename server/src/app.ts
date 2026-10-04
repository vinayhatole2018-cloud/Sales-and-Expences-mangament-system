import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import { requireAuth } from './middleware/auth';
import { errorHandler, notFoundHandler } from './middleware/error';
import { authRouter } from './routes/auth';
import { customersRouter } from './routes/customers';
import { collegesRouter } from './routes/colleges';
import { conferenceEventsRouter } from './routes/conferenceEvents';
import { servicesRouter } from './routes/services';
import { ordersRouter, paymentsRouter, salesRouter } from './routes/orders';
import { modulesRouter } from './routes/modules';
import { expensesRouter } from './routes/expenses';
import { employeesRouter, meRouter, rolesRouter } from './routes/employees';
import { dashboardRouter } from './routes/dashboard';
import { invoicesRouter, reportsRouter } from './routes/reports';
import { attachmentsRouter } from './routes/attachments';
import { auditRouter, backupsRouter, notificationsRouter, searchRouter, settingsRouter } from './routes/system';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || config.corsOrigins.includes(origin)),
      credentials: false,
      exposedHeaders: ['Content-Disposition'],
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

  app.use(
    '/api',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: config.rateLimitMax,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: { error: 'Too many requests. Please wait a moment and try again.' },
    }),
  );

  // Sign-in against the system's own user database (public endpoints).
  app.use('/api/auth', authRouter);

  // Everything below requires a signed-in, active employee.
  app.use('/api', requireAuth);
  app.use('/api/me', meRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/customers', customersRouter);
  app.use('/api/colleges', collegesRouter);
  app.use('/api/conference-events', conferenceEventsRouter);
  app.use('/api/services', servicesRouter);
  app.use('/api/orders', ordersRouter);
  app.use('/api/sales', salesRouter);
  app.use('/api/payments', paymentsRouter);
  app.use('/api/modules/:moduleKey', modulesRouter);
  app.use('/api/expenses', expensesRouter);
  app.use('/api/employees', employeesRouter);
  app.use('/api/roles', rolesRouter);
  app.use('/api/reports', reportsRouter);
  app.use('/api/invoices', invoicesRouter);
  app.use('/api/attachments', attachmentsRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/audit-logs', auditRouter);
  app.use('/api/search', searchRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/backups', backupsRouter);

  app.use('/api', notFoundHandler);
  app.use(errorHandler);
  return app;
}
