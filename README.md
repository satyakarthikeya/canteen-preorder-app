# College Canteen Preorder App

A simple college canteen pre-order website with student verification and a canteen owner portal.

## Features

- Student account creation with Karunya email and student ID
- OTP verification for student login
- Welcome page for K-Bites before entering the ordering flow
- Multiple canteens in a single app
- Canteen menu selection and cart ordering
- Mock payment selection
- Owner portal with login, open/closed control, and item availability management
- Owner menu image OCR import (upload menu photo, extract items + prices, review, and bulk import)
- Orders stored in `data/orders.json`

## Run locally

1. Open a terminal in `canteen-preorder-app`
2. Run `npm install`
3. Run `npm start`
4. Open `http://localhost:3000`

## Real OTP Email Setup

To send OTP to real student email inboxes:

1. Copy `.env.example` to `.env`
2. Fill your SMTP credentials in `.env`
3. Restart the server

Required environment variables:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `OTP_FROM_EMAIL`
- `OTP_APP_NAME` (optional)

For Gmail, use an App Password instead of your normal account password.

## Owner login

- Username: `canteen1`
- Password: `password123`

or

- Username: `canteen2`
- Password: `password123`

## Admin Approval Flow

- New canteen registrations are not activated immediately.
- Owner registration creates a pending request.
- Admin must approve or reject from Admin Panel.

Admin panel route:

- `http://localhost:3000/admin.html`

Set admin password in `.env`:

- `ADMIN_PANEL_PASSWORD=your-secure-password`

## Owner OCR Menu Import

From the Owner Portal dashboard:

1. Go to `Menu Availability` -> `Import From Menu Photo`
2. Upload a clear menu image
3. Click `Extract Items From Image`
4. Review/edit extracted names and prices
5. Click `Import Extracted Items`

Notes:

- OCR accuracy depends on image clarity and text quality.
- Keep a plain background and avoid blur for better extraction.
- Duplicate items (same name + price) are skipped during import.

## Owner CSV Export/Import

From the Owner Portal dashboard:

1. Click `Export Menu CSV` to download current menu
2. Edit file in Excel/Google Sheets
3. Keep columns: `name`, `price`, optional `status`
4. Upload CSV in `Import Edited CSV`
5. Click `Import CSV`

Notes:

- Duplicate rows (same name + price) are skipped.
- `status` can be `available` or `unavailable`.

## Notes

- This app uses file storage for demo purposes. For production, use a database.
- Payment is mocked and should be replaced with a real gateway for a live deployment.
