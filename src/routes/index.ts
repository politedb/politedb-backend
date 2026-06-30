import { Router } from 'express';
import { healthRouter } from './health';
import { adminRouter } from './admin';
import { licenseRouter } from './license';
import { polarRouter } from './polar';
import { aiRouter } from './ai';

const indexRouter = Router();

indexRouter.use('/health', healthRouter);
indexRouter.use('/v1', licenseRouter);
indexRouter.use('/v1/polar', polarRouter);
indexRouter.use('/v1/admin', adminRouter);
indexRouter.use('/ai', aiRouter);

export default indexRouter;
