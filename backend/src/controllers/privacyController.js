import { User, Cart, Order, DataRequest } from '../models/index.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { ErrorCodes } from '../middleware/apiError.js';
import GameReward from '../models/GameReward.js';
import GameAttempt from '../models/GameAttempt.js';

const reauthenticate = async req => {
  const user = await User.findById(req.userId).select('+password');
  if (!user || !user.activo || !await user.compararPassword(req.body.currentPassword)) {
    throw new AppError('Confirma tu contraseña actual', 403, ErrorCodes.FORBIDDEN);
  }
  return user;
};

export const exportData = asyncHandler(async (req, res) => {
  const user = await reauthenticate(req);
  const [orders, cart, requests, rewards, attempts] = await Promise.all([
    Order.find({ usuario: req.userId }).select('-__v').sort({ createdAt: -1 }).limit(1001).maxTimeMS(5000).lean(),
    Cart.findOne({ usuario: req.userId }).select('items').lean(),
    DataRequest.find({ usuario: req.userId }).select('tipo mensaje estado respuesta createdAt resueltaEn').sort({ createdAt: -1 }).limit(100).lean(),
    GameReward.find({ usuario: req.userId }).select('kind sourceChallenge createdAt redeemedAt').limit(2).lean(),
    GameAttempt.find({ usuario: req.userId, expiresAt: { $gt: new Date() } }).select('challenge steps participated completed createdAt expiresAt').limit(40).lean(),
  ]);
  res.set('Cache-Control', 'no-store');
  res.set('Content-Disposition', 'attachment; filename="by-jers-mis-datos.json"');
  res.json({ success: true, export: {
    generadoEn: new Date().toISOString(),
    perfil: { nombre: user.nombre, apellido: user.apellido, email: user.email, telefono: user.telefono,
      direcciones: user.direcciones, createdAt: user.createdAt, aceptoTerminos: user.aceptoTerminos,
      aceptoPrivacidad: user.aceptoPrivacidad, fechaAceptacionPrivacidad: user.fechaAceptacionPrivacidad },
    carrito: cart?.items ?? [], pedidos: orders.slice(0, 1000), solicitudes: requests,
    premiosJuego: rewards, sesionesJuego: attempts,
    parcial: orders.length > 1000 || requests.length === 100,
    nota: 'Los mensajes de contacto no se vinculan automáticamente a cuentas sin verificar su correo. Puedes solicitar revisión de esos datos y una exportación adicional mediante una solicitud de acceso.',
  } });
});

export const getMyDataRequests = asyncHandler(async (req, res) => {
  const requests = await DataRequest.find({ usuario: req.userId }).select('tipo estado respuesta createdAt resueltaEn').sort({ createdAt: -1 }).limit(100).lean();
  res.json({ success: true, requests });
});

export const requestDataAction = asyncHandler(async (req, res) => {
  await reauthenticate(req);
  const filter = { usuario: req.userId, tipo: req.body.tipo, estado: 'pendiente' };
  let item;
  try {
    item = await DataRequest.findOneAndUpdate(filter, { $setOnInsert: { ...filter, mensaje: req.body.mensaje || '' } }, { new: true, upsert: true, runValidators: true });
  } catch (error) {
    if (error.code !== 11000) throw error;
    item = await DataRequest.findOne(filter);
  }
  res.status(202).json({ success: true, message: 'Solicitud registrada para revisión. No elimina datos automáticamente ni garantiza que todos puedan suprimirse.', request: { id: item._id, tipo: item.tipo, estado: item.estado, createdAt: item.createdAt } });
});

export const getDataRequests = asyncHandler(async (req, res) => {
  const page = req.query.page || 1, limit = req.query.limit || 20;
  const filter = req.query.estado ? { estado: req.query.estado } : {};
  const [requests, total] = await Promise.all([
    DataRequest.find(filter).populate('usuario', 'nombre apellido email').sort({ createdAt: 1 }).skip((page - 1) * limit).limit(limit).lean(),
    DataRequest.countDocuments(filter),
  ]);
  res.json({ success: true, requests, page, total, pages: Math.ceil(total / limit) });
});

export const resolveDataRequest = asyncHandler(async (req, res) => {
  const item = await DataRequest.findByIdAndUpdate(req.params.id, { estado: 'resuelta', respuesta: req.body.respuesta, resueltaEn: new Date() }, { new: true, runValidators: true });
  if (!item) throw new AppError('Solicitud no encontrada', 404, ErrorCodes.NOT_FOUND);
  res.json({ success: true, request: item });
});
