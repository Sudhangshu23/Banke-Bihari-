# Banke Bihari Cafe – Smart Restaurant Management System (core build)
One server, one website (`public/index.html`), role-based access: customer (QR), kitchen, waiter, POS, admin.

## Run
    npm install
    cp .env.example .env   # set JWT_SECRET
    npm start
Pages: landing `/` (your design), table QR `/?t=<token>` (customer ordering), staff `/app.html#staff`. Table QR links print to the console at start (also in Admin > Table QR links). Turn each link into a QR image with any QR tool.
Dev logins (username = role, password = DEV_PASSWORD, default `aldo123`): admin, kitchen, waiter, pos. **Development only.**
Flow: Admin adds menu items -> customer opens table link -> order -> kitchen (accept/preparing/ready) -> waiter (served) -> POS (cash) -> admin report.

## What works now
QR-token validation, server-side pricing, JWT roles, order status flow with role checks, Socket.IO live updates, waiter call, cash payment, basic report, audit log, rate limiting.
## NOT built yet (honest list)
MySQL/Prisma wiring (schema is ready in `prisma/schema.prisma`; runtime store is in-memory and resets on restart), TypeScript/Next.js/Tailwind migration, UPI/card gateway + webhook verification, GST invoices, inventory/recipes, bookings, split/partial payments, refunds, printing, CSV/PDF export, reviews, event-recovery queue, automated tests.
Menu starts empty on purpose: add your real items and prices in Admin.

## Dashboards (sidebar per role)
Admin: Dashboard, Orders, POS, Menu, Tables (+QR print), Bookings, Inventory, Staff, Reports (CSV), Settings (GST). Kitchen: Orders board. Waiter: Orders, Tables, Requests. POS: POS, Orders, Tables, Bookings.
Still missing: recipe-based stock deduction, split/partial payments, refunds, online gateway, MySQL wiring.

## Phones, tablets & QR codes (important)
- QR codes open the **Public URL** (Admin > Settings). `localhost` only works on the computer running the server.
- Same Wi-Fi: start the server, use the `http://<laptop-IP>:3000` addresses printed in the console. On Windows allow Node.js through the firewall (Private networks). Customers must be on the cafe Wi-Fi.
- Customers on mobile data: host the app online (Render/Railway/VPS with HTTPS), set `PUBLIC_URL=https://your-domain` in `.env`, and reprint the QR codes (Tables > QR code).
- Staff open `<Public URL>/staff` on any phone/tablet. Waiter/kitchen screens stay awake, beep and vibrate on new events.

## Menu photos (landing page)
Drop a photo for each dish into `public/images/menu/` using these exact names (jpg). Until then the card shows an "Banke Bihari – photo coming soon" panel:
Banke Bihari-truffle-sourdough-open-toast, smoked-salmon-and-poached-egg-brioche, signature-burrata-and-heirloom-salad, honeycomb-sea-salt-affogato, Banke Bihari-botanical-cold-brew-and-citrus, single-origin-flat-white-and-pistachio-sabl

## Deploy the website on Vercel

This project is configured to publish the static website from `public/` without trying to start the Express server. In Vercel, set the Project Root Directory to this folder (the one containing `vercel.json`), then redeploy. The landing page and local menu/cart UI are static; the staff dashboard and `/api/*` ordering endpoints still require the Express backend and are not hosted by this static deployment.

If the build log shows `npm warn Unknown env config "cache-dir"`, that comes from an npm environment variable in Vercel, not from this project's files. Open **Project Settings → Environment Variables**, remove `NPM_CONFIG_CACHE_DIR` (or `npm_config_cache-dir`), then redeploy. If you intentionally need a custom npm cache, use the supported `NPM_CONFIG_CACHE` setting. This warning alone is not a build failure.