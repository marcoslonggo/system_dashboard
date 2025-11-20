# TrueNAS & Unraid Management Dashboard

A comprehensive web-based dashboard for monitoring and managing TrueNAS and Unraid systems with real-time data visualization and application control capabilities.

## 📋 Table of Contents

- [Project Overview](#project-overview)
- [Features](#features)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [Installation & Setup](#installation--setup)
- [Configuration](#configuration)
- [API Documentation](#api-documentation)
- [Deployment](#deployment)
- [Development](#development)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

## 🎯 Project Overview

This dashboard provides a centralized interface for managing and monitoring TrueNAS and Unraid servers. It connects directly to the native APIs of both systems to provide real-time system metrics, application status, and control capabilities.

### Key Capabilities

- **Real-time Monitoring**: Live CPU, memory, storage, and temperature data
- **Application Management**: Start, stop, and restart Docker containers and jails
- **Multi-system Support**: Manage multiple TrueNAS and Unraid servers
- **Responsive Design**: Works on desktop, tablet, and mobile devices
- **Secure Authentication**: API key-based authentication for both systems
- **Error Handling**: Graceful degradation when systems are unavailable

## ✨ Features

### System Monitoring
- **System Overview Cards**: Display CPU, memory, storage, and temperature metrics
- **Status Indicators**: Visual indicators for online/offline status
- **Uptime Tracking**: Shows system uptime information
- **Auto-refresh**: Configurable refresh intervals (1s to 1 minute)

### Application Management
- **Docker Container Control**: Start, stop, restart containers
- **Jail Management** (TrueNAS): Control TrueNAS jails
- **Application Links**: Direct links to application web interfaces
- **Resource Usage**: CPU and memory usage per application
- **Status Tracking**: Real-time application status monitoring

### User Interface
- **Tabbed Navigation**: Separate views for all apps, TrueNAS, and Unraid
- **Settings Dialog**: Configure system connections and preferences
- **Dark/Light Theme**: Built-in theme support
- **Responsive Layout**: Mobile-friendly design
- **Error Feedback**: Clear error messages and status indicators

## 🛠 Technology Stack

### Frontend
- **Framework**: Next.js 15 with App Router
- **Language**: TypeScript 5
- **Styling**: Tailwind CSS 4 with shadcn/ui components
- **Icons**: Lucide React
- **State Management**: React hooks and Zustand
- **Data Fetching**: TanStack Query for server state

### Backend
- **API Routes**: Next.js API routes
- **HTTP Client**: Axios for API communication
- **Authentication**: Bearer token authentication
- **Error Handling**: Comprehensive error handling and logging

### API Integration
- **TrueNAS**: REST API v2.0 with Bearer token authentication
- **Unraid**: Native API endpoints with Bearer token authentication
- **Real-time Updates**: Polling-based updates with configurable intervals

## 📁 Project Structure

```
src/
├── app/                          # Next.js app directory
│   ├── api/                      # API routes
│   │   ├── apps/
│   │   │   └── action/          # App control endpoints
│   │   │       └── route.ts     # Start/stop/restart apps
│   │   ├── systems/              # System monitoring endpoints
│   │   │   └── route.ts        # System information API
│   │   └── socket/             # WebSocket support
│   │       └── io/
│   │           └── route.ts     # Socket.io endpoint
│   ├── globals.css              # Global styles
│   ├── layout.tsx              # Root layout component
│   └── page.tsx               # Main dashboard page
├── components/                 # React components
│   └── ui/                    # shadcn/ui components
│       ├── button.tsx
│       ├── card.tsx
│       ├── badge.tsx
│       ├── progress.tsx
│       ├── tabs.tsx
│       ├── dialog.tsx
│       ├── input.tsx
│       ├── label.tsx
│       ├── select.tsx
│       ├── switch.tsx
│       ├── separator.tsx
│       └── [40+ other UI components]
├── lib/                       # Utility libraries
│   ├── api-clients.ts          # TrueNAS/Unraid API clients
│   ├── db.ts                  # Database utilities
│   └── utils.ts               # General utilities
└── hooks/                     # Custom React hooks
    ├── use-mobile.ts
    └── use-toast.ts
```

## 🚀 Installation & Setup

### Prerequisites

- Node.js 18+ and npm
- TrueNAS server with API access
- Unraid server with API access
- Git for cloning the repository

### Installation Steps

1. **Clone the Repository**
   ```bash
   git clone <repository-url>
   cd truenas-unraid-dashboard
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Environment Configuration**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Start Development Server**
   ```bash
   npm run dev
   ```

5. **Access Dashboard**
   Open http://localhost:3000 in your browser

## ⚙️ Configuration

### Environment Variables

Create a `.env` file in the project root with the following variables:

```bash
# TrueNAS Configuration
TRUENAS_HOST=192.168.1.100
TRUENAS_API_KEY=your_truenas_api_key
TRUENAS_PORT=443
TRUENAS_ENABLED=true

# Unraid Configuration
UNRAID_HOST=192.168.1.200
UNRAID_API_KEY=your_unraid_api_key
UNRAID_PORT=80
UNRAID_ENABLED=true
```

### API Key Setup

#### TrueNAS API Key
1. Log in to your TrueNAS web interface
2. Go to Settings → API Keys
3. Click "Add" to create a new API key
4. Give it a descriptive name (e.g., "Dashboard")
5. Set appropriate permissions (read system info, control Docker/jails)
6. Copy the generated API key to your `.env` file

#### Unraid API Key
1. Log in to your Unraid web interface
2. Go to Settings → Management Access
3. Under "API", enable API access
4. Generate or copy your API key
5. Add the API key to your `.env` file

### Dashboard Settings

You can also configure systems through the dashboard UI:
1. Click the "Settings" button in the top-right
2. Configure host/IP addresses and API keys
3. Set refresh intervals and notification preferences
4. Save your configuration

## 📡 API Documentation

### System Information API

**Endpoint**: `GET /api/systems`

**Parameters**:
- `type` (optional): Filter by system type (`truenas`, `unraid`)

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "name": "TrueNAS Server",
      "type": "truenas",
      "status": "online",
      "uptime": "15 days, 7 hours",
      "cpu": 25,
      "memory": 60,
      "storage": 45,
      "temperature": 42,
      "apps": [
        {
          "id": "plex",
          "name": "Plex Media Server",
          "status": "running",
          "cpu": 15,
          "memory": 2048,
          "url": "http://192.168.1.100:32400"
        }
      ]
    }
  ],
  "timestamp": "2023-11-20T12:59:19.027Z"
}
```

### Application Control API

**Endpoint**: `POST /api/apps/action`

**Request Body**:
```json
{
  "systemId": "TrueNAS Server",
  "appId": "plex",
  "action": "start"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Successfully started plex on TrueNAS Server",
  "systemType": "truenas",
  "appId": "plex",
  "action": "start",
  "timestamp": "2023-11-20T13:05:23.123Z"
}
```

### Error Responses

All API endpoints return consistent error responses:

```json
{
  "success": false,
  "error": "API key required. Configure it in settings or environment variables.",
  "timestamp": "2023-11-20T13:05:23.123Z"
}
```

## 🌐 Deployment

### Production Build

1. **Build the Application**
   ```bash
   npm run build
   ```

2. **Start Production Server**
   ```bash
   npm run start
   ```

### Docker Deployment

1. **Build Docker Image**
   ```bash
   docker build -t truenas-unraid-dashboard .
   ```

2. **Run Docker Container**
   ```bash
   docker run -d \
     --name dashboard \
     -p 3000:3000 \
     --env-file .env \
     truenas-unraid-dashboard
   ```

### Environment-Specific Configuration

For production deployment, ensure:

1. **HTTPS**: Use HTTPS in production environments
2. **Firewall**: Configure firewall rules to allow API access
3. **API Keys**: Use secure, randomly generated API keys
4. **Network**: Ensure dashboard can reach your TrueNAS/Unraid systems
5. **Monitoring**: Set up monitoring for the dashboard itself

## 🧪 Development

### Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint for code quality checks

### Code Style

The project follows these conventions:

- **TypeScript**: Strict typing throughout the codebase
- **ESLint**: Enforced code quality and consistency
- **Component Structure**: Functional components with hooks
- **API Design**: RESTful endpoints with consistent responses
- **Error Handling**: Comprehensive error handling and user feedback

### Adding New Features

1. **UI Components**: Use existing shadcn/ui components when possible
2. **API Endpoints**: Follow the established pattern in `/src/app/api/`
3. **State Management**: Use React hooks for local state
4. **Styling**: Use Tailwind CSS classes and shadcn/ui components
5. **Error Handling**: Include proper error handling and user feedback

## 🔧 Troubleshooting

### Common Issues

#### "API Key Required" Message
- **Cause**: Missing or incorrect API keys in environment variables
- **Solution**: Verify API keys are correctly set in `.env` file

#### Connection Timeout
- **Cause**: Network connectivity issues or incorrect host/port
- **Solution**: Check network connectivity and verify host/port settings

#### Application Control Not Working
- **Cause**: Insufficient API permissions or incorrect app IDs
- **Solution**: Verify API key permissions and check app IDs in system responses

#### Dashboard Not Loading
- **Cause**: Missing dependencies or build errors
- **Solution**: Run `npm install` and check for build errors

### Debug Mode

Enable debug logging by setting:
```bash
DEBUG=true npm run dev
```

### Log Locations

- **Development**: Console output and `dev.log` file
- **Production**: Application logs and system logs
- **API Errors**: Server console and error responses

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Contribution Guidelines

- Follow the existing code style and conventions
- Include tests for new features
- Update documentation as needed
- Ensure all tests pass before submitting

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- **TrueNAS**: For providing a robust API for system management
- **Unraid**: For the comprehensive API for Docker and system monitoring
- **shadcn/ui**: For the excellent UI component library
- **Next.js**: For the powerful React framework
- **Tailwind CSS**: For the utility-first CSS framework

## 📞 Support

For support and questions:

1. Check the troubleshooting section above
2. Review the API documentation
3. Search existing issues in the repository
4. Create a new issue with detailed information

---

**Note**: This dashboard requires proper API keys to function. Without valid API keys, it will display "API Key Required" messages instead of system data.