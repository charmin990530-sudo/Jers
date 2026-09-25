import { Router } from 'express';
import { createContact } from '../controllers/contactController.js';
import { validate, schemas } from '../middleware/validation.js';

const router = Router();

router.post('/', validate(schemas.contact), createContact);

export default router;
