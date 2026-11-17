# VerifyAddress NG

**Verify. Trust. Connect.**

VerifyAddress NG is a digital address verification and management platform designed to improve address reliability and trust in Nigeria.

The project aims to integrate with the NIPOST National Digital Postcode API to support postcode validation, address lookup and location-based address services.

## Project Status

🚧 Under active development.

## Technology Stack

### Frontend
- React
- Vite
- TypeScript
- Tailwind CSS (planned)

### Backend
- Node.js
- Express.js
- TypeScript

### Database
- MongoDB
- Mongoose

### API Integration
- NIPOST National Digital Postcode API

## Planned Features

- Digital postcode validation
- Address lookup
- Postcode assembly and disassembly
- Address search and autocomplete
- Nearby address search
- Secure API integration
- User address management

## Project Structure

```text
verifyaddress-ng/
├── backend/
├── frontend/
├── docs/
├── .gitignore
└── README.md
```

## Getting Started

### Prerequisites

- Node.js
- npm
- Git
- MongoDB Atlas account

### Backend Setup

```bash
cd backend
npm install
npm run dev
```

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

## Environment Variables

Create a `.env` file in the backend directory:

```env
PORT=5000
POSTCODE_API_KEY=your_nipost_api_key
```

Create a `.env` file in the frontend directory:

```env
VITE_API_BASE_URL=http://localhost:5000
```

**Security:** Never expose your NIPOST API secret key in frontend code or commit private environment files to GitHub.

### Email verification delivery

In development, Brevo settings may be left blank. In production, configure all three backend values: `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, and `BREVO_SENDER_NAME`. Delivery status is recorded in safe server logs as provider acceptance, not proof that a message reached the inbox.

If the initial verification email does not arrive, request another with `POST /api/auth/resend-verification` and a JSON body containing the account email. Each resend replaces the previous token and starts the configured account cooldown (`EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS`, default 120 seconds). If a resend delivery fails, wait for that cooldown and request another resend. The application stores only the token hash; it cannot recover or replay a raw token from a failed attempt.

## Project Vision

To make digital address verification more accessible, reliable and useful across Nigeria.

## Developer

**Mustee Digital Labs**

Built with dedication to solving real-world problems through technology.

---

*VerifyAddress NG — Verify. Trust. Connect.*
