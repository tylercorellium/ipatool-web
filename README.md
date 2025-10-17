# ipatool-web

A web-based graphical user interface for the `ipatool` command-line application. This application allows users to search for iOS applications and download `.ipa` files through an intuitive web interface.

## Features

- **iCloud Authentication**: Secure login with Apple ID credentials
- **Two-Factor Authentication (2FA)**: Support for 2FA verification codes
- **App Search**: Search for iOS applications by name or Bundle ID
- **App Download**: Download `.ipa` files directly to your device
- **Material Design UI**: Clean, modern interface using Material-UI components
- **Secure**: Credentials are never stored on the server

## Prerequisites

Before running this application, make sure you have:

1. **Node.js** (v16 or higher) installed
2. **ipatool** CLI installed and available in your PATH
   - Install via: `brew install ipatool` (macOS)
   - Or follow instructions at: https://github.com/majd/ipatool

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd ipatool-web
```

2. Install backend dependencies:
```bash
cd backend
npm install
```

3. Install frontend dependencies:
```bash
cd ../ipatool-frontend
npm install
```

## Running the Application

You need to run both the backend and frontend servers:

### Start the Backend Server

```bash
cd backend
npm start
```

The backend server listens on port `3001` by default. Override it with:

```bash
BACKEND_PORT=3101 npm start
```

### Start the Frontend Server

In a new terminal window:

```bash
cd ipatool-frontend
npm start
```

The frontend application will open in your browser at `http://localhost:3000`.
If you move the backend to a different host or port, point the frontend at it with:

```bash
REACT_APP_BACKEND_HOST=your.server.ip \
REACT_APP_BACKEND_PORT=3101 \
npm start
```

Alternatively set `REACT_APP_API_URL` (for example `https://your.server.ip:3101/api`) to fully specify the backend URL.
See `ipatool-frontend/.env.sample` for a template you can copy to `.env`.

> **Tip:** When you serve the frontend over HTTPS, the backend must also be reachable via HTTPS (or the browser will block requests as mixed content). Use `setup-ssl.sh` to generate certs or run the frontend with `npm run start:http` during local development.

## Usage

1. **Login**: Enter your Apple ID (email) and password on the login page
2. **2FA**: If prompted, enter the two-factor authentication code sent to your trusted device
3. **Search**: Once authenticated, use the search bar to find iOS applications
4. **Download**: Click the "Download" button on any app to download its `.ipa` file

## Project Structure

```
ipatool-web/
├── backend/              # Node.js/Express backend
│   ├── index.js         # Main server file with API endpoints
│   └── package.json     # Backend dependencies
├── ipatool-frontend/    # React/TypeScript frontend
│   ├── src/
│   │   ├── components/  # React components
│   │   │   ├── LoginForm.tsx
│   │   │   ├── SearchBar.tsx
│   │   │   └── AppList.tsx
│   │   ├── api.ts       # API client
│   │   ├── types.ts     # TypeScript type definitions
│   │   ├── App.tsx      # Main application component
│   │   └── index.tsx    # Application entry point
│   └── package.json     # Frontend dependencies
└── PRD.md               # Product Requirements Document
```

## API Endpoints

### Authentication
- `POST /api/auth/login` - Authenticate with iCloud credentials

### Search
- `POST /api/search` - Search for iOS applications

### Download
- `POST /api/download` - Download an `.ipa` file

### Health Check
- `GET /api/health` - Check server status

## Security Notes

- User credentials are passed directly to the `ipatool` process and are never stored
- In production, ensure HTTPS is configured for secure communication
- Session tokens are stored in memory (consider using Redis or similar for production)

## Technology Stack

**Frontend:**
- React 19
- TypeScript
- Material-UI (MUI)
- Axios
- Create React App

**Backend:**
- Node.js
- Express 5
- Child Process API (for ipatool integration)

## Development

To run the application in development mode with hot reloading:

- Backend: Uses `nodemon` for automatic restarts
- Frontend: Uses Create React App's built-in hot reload

## Future Enhancements

See `PRD.md` for planned features including:
- Download history
- Batch downloads
- Account management
- Multiple account support

## Troubleshooting

**ipatool not found:**
- Ensure `ipatool` is installed and available in your PATH
- Test by running `ipatool --version` in your terminal

**Authentication fails:**
- Verify your Apple ID credentials are correct
- Check if 2FA is enabled on your account
- Ensure `ipatool` can authenticate independently

**Search returns no results:**
- Try different search terms
- Verify you're authenticated successfully
- Check backend logs for errors

## License

See LICENSE file for details.
