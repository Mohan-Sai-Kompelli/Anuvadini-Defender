# Developer Setup Guide

## Prerequisites

### System Requirements
- **OS**: Windows 10+, macOS 10.15+, or Ubuntu 18.04+
- **RAM**: 8GB minimum (16GB recommended)
- **Disk**: 20GB free space
- **Node.js**: v16.0.0 or higher
- **npm**: v8.0.0 or higher
- **MongoDB**: v4.4 or higher (local or Atlas)

### Required Software

```bash
# Check versions
node --version     # v16+ required
npm --version      # v8+ required
git --version      # v2.25+ required
```

---

## Quick Start (15 minutes)

### 1. Clone Repository

```bash
git clone https://github.com/your-org/attendance-system.git
cd attendance-system
```

### 2. Setup Environment

```bash
# Copy environment template
cp .env.example .env

# Edit with your settings
nano .env
```

**Required variables**:
```bash
MONGODB_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/attendance_dev
JWT_SECRET=your_dev_secret_key_min_32_chars
PORT=5001
NODE_ENV=development
```

### 3. Install Dependencies

```bash
# Backend
cd server && npm install && cd ..

# Web dashboard
cd client && npm install && cd ..

# Mobile (React Native)
cd src && npm install && cd ..
```

### 4. Start Development

```bash
# In separate terminals:

# Terminal 1: Backend
cd server && npm run dev

# Terminal 2: Web dashboard
cd client && npm start

# Terminal 3: Mobile
cd src && npm start
```

---

## Detailed Setup

### MongoDB Setup

#### Option A: Local MongoDB

```bash
# macOS
brew install mongodb-community
brew services start mongodb-community

# Ubuntu
sudo apt-get install -y mongodb
sudo systemctl start mongodb

# Windows (using Chocolatey)
choco install mongodb
```

**Verify installation**:
```bash
mongosh
> db.adminCommand('ping')
{ ok: 1 }
```

#### Option B: MongoDB Atlas (Cloud)

1. Go to https://www.mongodb.com/cloud/atlas
2. Create free account
3. Create cluster
4. Add IP whitelist: 0.0.0.0/0 (for dev)
5. Create database user
6. Get connection string
7. Add to `.env`:
```bash
MONGODB_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/attendance_dev?retryWrites=true&w=majority
```

### Node.js Setup

```bash
# Using Node Version Manager (nvm)

# macOS/Linux
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 18
nvm use 18

# Windows
# Download from https://nodejs.org/en/download/
# Or use Chocolatey: choco install nodejs
```

### IDE Setup

#### VS Code (Recommended)

**Extensions**:
```
- ESLint
- Prettier
- MongoDB for VS Code
- REST Client
- Thunder Client
- Thunder Client
```

**Settings** (`.vscode/settings.json`):
```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "prettier.semi": true,
  "prettier.singleQuote": true,
  "[javascript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  }
}
```

#### WebStorm

1. Open project
2. Configure Node interpreter: Settings → Languages → Node.js
3. Install ESLint: npm install
4. Enable ESLint: Settings → Languages → ESLint

---

## Backend Development

### Project Structure

```
server/
├── config/              # Configuration files
│   ├── featureFlags.js
│   └── passport.js
├── middleware/          # Express middleware
│   └── authMiddleware.js
├── models/              # MongoDB models
│   ├── Attendance.js
│   ├── Student.js
│   ├── Organization.js
│   └── ... (10+ more)
├── routes/              # API routes
│   ├── attendance.js
│   ├── students.js
│   ├── shifts.js
│   └── ... (20+ more)
├── services/            # Business logic
│   ├── pdfExportService.js
│   └── ... (more services)
├── scripts/             # Migration scripts
│   └── migrateOrgLocations.js
├── uploads/             # File storage
├── logs/                # Log files
├── index.js             # Main server file
└── package.json
```

### Running Backend

```bash
cd server

# Development mode (with auto-reload)
npm run dev

# Production mode
npm start

# Debug mode
node --inspect index.js

# Run tests
npm test

# Lint code
npm run lint
```

### Making API Calls

**Using Thunder Client extension**:

```
POST /api/auth/login
Content-Type: application/json

{
  "uid": "STU001",
  "password": "password123"
}
```

**Using cURL**:

```bash
curl -X POST http://localhost:5001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"uid":"STU001","password":"password123"}'
```

**Using REST Client**:

Create `requests.http`:
```
### Login
POST http://localhost:5001/api/auth/login
Content-Type: application/json

{
  "uid": "STU001",
  "password": "password123"
}

### Get Attendance
GET http://localhost:5001/api/attendance
Authorization: Bearer <token>
```

---

## Web Dashboard Development

### Project Structure

```
client/
├── src/
│   ├── pages/              # React pages
│   │   ├── AdminDashboard.js
│   │   ├── Attendance.js
│   │   ├── ShiftManagement.js
│   │   └── ... (5+ more)
│   ├── components/         # Reusable components
│   ├── services/           # API integration
│   ├── App.js
│   └── index.js
├── public/                 # Static assets
├── package.json
└── .env.local             # Local config
```

### Running Dashboard

```bash
cd client

# Start dev server
npm start

# The app opens at http://localhost:3000

# Build for production
npm run build

# Run tests
npm test

# Lint code
npm run lint
```

### Environment Setup

```bash
# .env.local
REACT_APP_API_URL=http://localhost:5001/api
REACT_APP_ENV=development
```

---

## Mobile Development

### Android Setup

```bash
# Install Android Studio
# https://developer.android.com/studio

# Set ANDROID_HOME
export ANDROID_HOME=$HOME/Android/Sdk
export PATH=$PATH:$ANDROID_HOME/emulator
export PATH=$PATH:$ANDROID_HOME/platform-tools

# Start emulator
$ANDROID_HOME/emulator/emulator -avd <avd_name>

# Run mobile app
cd src
npm run android
```

### iOS Setup (macOS only)

```bash
# Install dependencies
cd src
npm install

# Install pods
cd ios
pod install
cd ..

# Start Metro bundler
npm start

# In another terminal, run on iOS
npm run ios

# Or open Xcode
open ios/attendance.xcworkspace
```

### React Native CLI

```bash
# Clear cache
npx react-native start --reset-cache

# Run on Android
npx react-native run-android

# Run on iOS
npx react-native run-ios

# Open debugger
https://localhost:8081/debugger-ui/
```

---

## Testing

### Backend Tests

```bash
cd server

# Run all tests
npm test

# Run specific test file
npm test -- attendance.test.js

# Run with coverage
npm test -- --coverage

# Watch mode
npm test -- --watch
```

**Example test**:
```javascript
// server/__tests__/attendance.test.js
describe('POST /api/attendance/mark', () => {
  test('should mark attendance with valid data', async () => {
    const response = await request(app)
      .post('/api/attendance/mark')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'in',
        latitude: 28.7041,
        longitude: 77.1025
      });
    
    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
  });
});
```

### Frontend Tests

```bash
cd client

# Run all tests
npm test

# Run specific test
npm test -- Attendance

# Watch mode
npm test -- --watch
```

---

## Debugging

### Backend Debugging

**VSCode Debug Configuration** (`.vscode/launch.json`):
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Launch Backend",
      "program": "${workspaceFolder}/server/index.js",
      "restart": true,
      "console": "integratedTerminal"
    }
  ]
}
```

**Add breakpoints**: Click line number in code editor

**Inspect values**: Hover over variables in debug mode

### Web Dashboard Debugging

```bash
# Chrome DevTools (F12)
# - Sources tab for breakpoints
# - Console for logging
# - Network tab for API calls
# - Application tab for localStorage
```

### Mobile Debugging

```bash
# Flipper (cross-platform debugger)
npm install flipper-plugin-react-native-console

# React Native Debugger
# Download from: https://github.com/jhen0409/react-native-debugger

# Chrome DevTools (for React Native web)
chrome://inspect/#devices
```

---

## Database Management

### Create Test Data

```bash
# Connect to MongoDB
mongosh

# Create test organization
db.organizations.insertOne({
  name: "Test Medical College",
  organizationType: "medical_college",
  isActive: true,
  createdAt: new Date()
})

# Create test student
db.students.insertOne({
  uid: "STU001",
  fullName: "John Doe",
  email: "john@test.com",
  organization: ObjectId("..."),
  password: "$2b$10$...",  // hashed password
  isActive: true
})
```

### Reset Database

```bash
# CAUTION: This deletes all data!
mongosh
> use attendance_dev
> db.dropDatabase()
```

### Backup Database

```bash
# Local backup
mongodump --uri="mongodb://localhost:27017/attendance_dev" --out=./backup

# Restore from backup
mongorestore ./backup
```

---

## Git Workflow

### Feature Development

```bash
# Create feature branch
git checkout -b feature/your-feature

# Make changes
# Test locally
# Commit
git add .
git commit -m "add: your feature description"

# Push
git push origin feature/your-feature

# Create Pull Request on GitHub
```

### Branch Naming

- `feature/` - New feature
- `fix/` - Bug fix
- `refactor/` - Code cleanup
- `docs/` - Documentation
- `test/` - Test additions

### Commit Messages

```
add: add new feature
fix: fix specific bug
refactor: improve code structure
docs: update documentation
test: add tests for feature
```

---

## Common Tasks

### Add New API Endpoint

1. **Create route handler** in `server/routes/example.js`
2. **Register route** in `server/index.js`
3. **Add API method** in `client/src/services/api.js`
4. **Test locally** with Thunder Client
5. **Create tests** in `server/__tests__/`

### Add New Mobile Screen

1. **Create component** in `src/screens/ExampleScreen.tsx`
2. **Add route** in `src/navigation.ts`
3. **Add navigation item** in `src/App.tsx`
4. **Test on emulator/device**

### Add New Web Page

1. **Create component** in `client/src/pages/Example.js`
2. **Add route** in `client/src/App.js`
3. **Add navigation link** in sidebar
4. **Test in browser**

---

## Performance Optimization

### Backend Performance

```bash
# Monitor performance
npm run dev:monitor

# Check memory usage
node --max-old-space-size=4096 server/index.js

# Profile with clinic
npm install -g clinic
clinic doctor -- node server/index.js
```

### Frontend Performance

```bash
# Build analysis
npm run build
npm install -g webpack-bundle-analyzer
webpack-bundle-analyzer client/build/stats.json
```

### Mobile Performance

```bash
# React Native Debugger profiler
# Monitor→Profiler tab

# Android Studio profiler
# Build → Analyzer Bundle
```

---

## Troubleshooting

### Port Already in Use

```bash
# Kill process on port 5001 (macOS/Linux)
lsof -i :5001 | grep LISTEN | awk '{print $2}' | xargs kill -9

# Windows
netstat -ano | findstr :5001
taskkill /PID <PID> /F
```

### MongoDB Connection Issues

```bash
# Check if MongoDB is running
mongosh

# If not running, start it
sudo systemctl start mongodb  # Linux
brew services start mongodb-community  # macOS
```

### Node Modules Issues

```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
```

### Git Conflicts

```bash
# Check status
git status

# Resolve conflicts manually
# Then:
git add .
git commit -m "fix: resolve merge conflicts"
```

---

## Useful Commands

```bash
# Backend
cd server && npm run dev       # Start dev server
npm test                       # Run tests
npm run lint                   # Lint code
npm run lint:fix              # Auto-fix lint issues

# Web Dashboard
cd client && npm start        # Start dev server
npm run build                 # Production build
npm test                      # Run tests

# Mobile
cd src && npm start           # Start Metro bundler
npm run android/ios          # Run on emulator/device

# Database
mongosh                       # Connect to MongoDB
mongodump --out=backup       # Backup database
mongorestore backup          # Restore database

# Git
git status                    # Check status
git log --oneline            # View commits
git diff                      # View changes
```

---

## Support Resources

- **Documentation**: See `API_DOCUMENTATION.md`, `DEPLOYMENT_GUIDE.md`
- **Architecture**: See `PROJECT_SUMMARY.md`
- **Database**: See `DATABASE_SCHEMA.md`
- **Testing**: See `QA_TESTING_CHECKLIST.md`

---

**Last Updated**: June 5, 2026  
**Version**: 1.0
