# PrescoPad Quick Start Guide

Get up and running with PrescoPad in 5 minutes!

## Prerequisites
- ✅ Node.js 18+ installed (you have v25.6.0)
- ✅ npm installed
- ✅ Expo Go app on your phone (optional for physical device testing)

## Step 1: Install Dependencies

### Backend
```bash
cd backend_python
python -m venv .venv
# On Windows PowerShell:
.\.venv\Scripts\Activate.ps1
# On macOS/Linux:
source .venv/bin/activate
pip install -r requirements.txt
```

### Frontend
```bash
cd frontend
npm install
```

**Note**: If npm install fails due to cache issues:
```bash
cd frontend
npm cache clean --force
npm install
```

## Step 2: Configure Environment

### For Emulator (Default - Already Configured ✓)
No changes needed! The app is pre-configured for emulator use.

### For Physical Device
Run the configuration helper:
```bash
# Auto-detect your IP and configure
node setup-env.js device

# Or manually specify your IP
node setup-env.js 192.168.1.100
```

**Manual Configuration** (if script doesn't work):
1. Find your computer's IP address:
   - Windows: Run `ipconfig` (look for IPv4 Address)
   - macOS/Linux: Run `ifconfig` or `ip addr`

2. Edit `frontend/src/constants/config.ts`:
   ```typescript
   api: {
     baseUrl: 'http://YOUR_IP_HERE:3000/api',  // Replace YOUR_IP_HERE
     timeout: 10000,
   }
   ```

## Step 3: Start Backend Server

```bash
cd backend_python
# Activate virtual environment if not already activated
.\.venv\Scripts\Activate.ps1  # Windows
# or source .venv/bin/activate # macOS/Linux

python main.py
```

You should see:
```
INFO:     Started server process [12345]
INFO:     Waiting for application startup.
INFO:     Connected to MongoDB: prescopad
INFO:     Indexes created.
INFO:     Uvicorn running on http://0.0.0.0:3000 (Press CTRL+C to quit)
```

**Verify backend is running**:
```bash
curl http://localhost:3000/api/health
```

Expected output:
```json
{"status":"ok","service":"PrescoPad API","version":"2.0.0",...}
```

## Step 4: Start Frontend App

Open a new terminal:

```bash
cd frontend
npm start
```

### Run on Android Emulator
```bash
cd frontend
npm run android
# or press 'a' in the Expo dev server
```

### Run on iOS Simulator (macOS only)
```bash
cd frontend
npm run ios
# or press 'i' in the Expo dev server
```

### Run on Physical Device
1. Install **Expo Go** app from App Store/Play Store
2. Make sure your phone is on the **same WiFi** as your computer
3. Scan the QR code shown in terminal with Expo Go app

## Step 5: Login and Test

### Demo Credentials
When the app opens, you'll see the login screen.

Use these credentials:
- **Phone Number**: `9876543210`
- **OTP**: `123456`
- **Role**: Choose "Doctor" or "Assistant"

The app works in two modes:
1. **Online Mode** (backend running) - Full features with cloud sync
2. **Offline Mode** (backend not running) - Demo mode with local storage only

## Verify Everything Works

### Test Checklist
- [ ] Backend health endpoint responds
- [ ] Frontend connects to backend (shows "Online Mode")
- [ ] Can login with demo credentials
- [ ] Can navigate to different screens
- [ ] Wallet balance shows
- [ ] Can create a prescription
- [ ] Can view prescription history
- [ ] PDF generation works

## Common Issues & Quick Fixes

### Issue: Backend won't start
**Error**: `Port 3000 already in use`

**Fix**:
```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# macOS/Linux
lsof -ti:3000 | xargs kill -9
```

### Issue: Frontend can't connect to backend
**Symptoms**: App immediately shows "Offline Mode"

**Fix**:
1. Verify backend is running: `curl http://localhost:3000/api/health`
2. For physical device: Ensure you're using your computer's IP (not localhost)
3. Check firewall: Allow port 3000
4. Ensure same WiFi network

### Issue: Database connection error
**Error**: `connect ECONNREFUSED`

**Fix**: Backend is already configured with Supabase. If you see this error:
1. Check internet connection
2. Verify DATABASE_URL in `backend/.env`
3. Supabase instance might be sleeping (first request wakes it up)

### Issue: Frontend crashes on start
**Error**: `Cannot find module 'expo-file-system'`

**Fix**:
```bash
cd frontend
npm install
# If that doesn't work:
rm -rf node_modules package-lock.json
npm install
```

### Issue: Physical device can't reach backend
**Fix**:
1. Check IP: `ipconfig` (Windows) or `ifconfig` (Mac/Linux)
2. Update config: `node setup-env.js device`
3. Check firewall settings (allow port 3000)
4. Test connection: `curl http://<YOUR_IP>:3000/api/health`

## Architecture at a Glance

```
┌─────────────────────────────────────────────────────────┐
│                  React Native App                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │   Zustand    │  │   SQLite     │  │ SecureStore  │  │
│  │   Stores     │  │  (Local DB)  │  │   (Tokens)   │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│           │                │                 │           │
│           └────────────────┴─────────────────┘           │
│                            │                             │
│                      axios (HTTP)                        │
└────────────────────────────┬─────────────────────────────┘
                             │
                    http://localhost:3000/api
                             │
┌────────────────────────────┴─────────────────────────────┐
│               Express.js Backend API                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │
│  │   JWT    │  │  Wallet  │  │  Clinic  │  │  Auth   │ │
│  │  Auth    │  │  Routes  │  │  Routes  │  │ Routes  │ │
│  └──────────┘  └──────────┘  └──────────┘  └─────────┘ │
│                            │                             │
└────────────────────────────┬─────────────────────────────┘
                             │
                      PostgreSQL (Supabase)
                             │
┌────────────────────────────┴─────────────────────────────┐
│                   Cloud Database                         │
│  - User accounts, roles, authentication                  │
│  - Wallet balances & transactions                        │
│  - Clinic profiles                                       │
│  - Notifications                                         │
│                                                          │
│  ⚠️ Patient data stored LOCALLY only (privacy)          │
└──────────────────────────────────────────────────────────┘
```

## What's Stored Where

### Local Only (SQLite on device)
- 👤 Patient records
- 💊 Prescriptions
- 🧪 Lab tests
- 💉 Medicine database
- 🔬 Lab test templates

### Cloud + Local Cache
- 🔐 Auth tokens (SecureStore)
- 💰 Wallet balance
- 🏥 Clinic profile

### Cloud Only (PostgreSQL)
- 💳 Transaction history
- 🔔 Notifications
- 📊 Analytics (future)

## Next Steps

1. **Explore the app**: Try creating a prescription, checking wallet balance
2. **Read the docs**: See [BACKEND_FRONTEND_INTEGRATION.md](docs/BACKEND_FRONTEND_INTEGRATION.md)
3. **Understand the sync**: See [SYNC_AND_WALLET.md](docs/SYNC_AND_WALLET.md)
4. **Review the code**: Check out the architecture in `frontend/src/` and `backend/src/`
5. **Customize**: Update branding, add features, deploy to production

## Useful Commands

### Development
```bash
# Start backend
cd backend_python && .venv\Scripts\python main.py

# Start frontend
cd frontend && npm start

# Lint frontend
cd frontend && npm run lint
```

### Testing
```bash
# Test backend health
curl http://localhost:3000/api/health

# Test authentication
curl -X POST http://localhost:3000/api/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{"phone":"9876543210","role":"doctor"}'

# Test wallet (requires token)
curl http://localhost:3000/api/wallet/balance \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### Database
```bash
# Database is MongoDB Atlas.
# Collections and indexes are created automatically on startup.
# Admin user is seeded automatically on first startup if SEED_ADMIN=true in .env.
```

## Support

- 📖 Full Documentation: [docs/](docs/)
- 🐛 Issues: Check logs and error messages
- 💡 Tips: See [BACKEND_FRONTEND_INTEGRATION.md](docs/BACKEND_FRONTEND_INTEGRATION.md)

## Pro Tips

1. **Keep backend running**: The frontend works offline but limited features
2. **Use emulator first**: Easier than physical device for initial development
3. **Check logs**: Expo dev tools show React Native errors clearly
4. **Hot reload**: Edit code and see changes instantly
5. **Demo mode**: Works even without backend (great for demos!)

---

🎉 **You're all set!** Happy coding with PrescoPad!
