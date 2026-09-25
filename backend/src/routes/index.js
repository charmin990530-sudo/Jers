import authRoutes from './auth.js';
import productRoutes from './products.js';
import cartRoutes from './cart.js';
import orderRoutes from './orders.js';
import userRoutes from './users.js';
import adminRoutes from './admin.js';
import contactRoutes from './contact.js';

export const routes = {
  auth: authRoutes,
  products: productRoutes,
  cart: cartRoutes,
  orders: orderRoutes,
  users: userRoutes,
  admin: adminRoutes,
  contact: contactRoutes,
};