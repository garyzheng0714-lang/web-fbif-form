import { Router } from 'express';
import { csrfGuard, issueCsrfToken } from '../middleware/csrf.js';

export const csrfRouter = Router();

csrfRouter.get('/', issueCsrfToken);

export { csrfGuard };
