import { Contact } from '../models/index.js';
import { sendContactEmail } from '../services/emailService.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';

export const createContact = asyncHandler(async (req, res) => {
  if (req.body.website) {
    return res.status(202).json({ success: true, message: 'Mensaje recibido.' });
  }

  const contact = await Contact.create({
    nombre: req.body.nombre,
    email: req.body.email,
    telefono: req.body.telefono,
    mensaje: req.body.mensaje,
  });

  try {
    await sendContactEmail(contact.toObject());
  } catch {
    console.error('No se pudo notificar el mensaje de contacto');
  }

  res.status(201).json({
    success: true,
    message: 'Mensaje recibido. Te responderemos pronto.',
    contact: { id: contact._id, createdAt: contact.createdAt },
  });
});

export const getContacts = asyncHandler(async (req, res) => {
  const page = req.query.page || 1;
  const limit = req.query.limit || 20;
  const filter = {};
  if (req.query.estado) filter.estado = req.query.estado;

  const [contacts, total] = await Promise.all([
    Contact.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Contact.countDocuments(filter),
  ]);

  res.status(200).json({ success: true, count: contacts.length, total, page, pages: Math.ceil(total / limit), contacts });
});

export const updateContact = asyncHandler(async (req, res, next) => {
  const contact = await Contact.findByIdAndUpdate(req.params.id, { estado: req.body.estado }, { new: true, runValidators: true });
  if (!contact) return next(new AppError('Mensaje no encontrado', 404, 'CONTACT_NOT_FOUND'));
  res.status(200).json({ success: true, message: 'Mensaje actualizado', contact });
});
