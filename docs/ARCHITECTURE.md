# ZinvainOS Technical Architecture

## Overview
ZinvainOS is an enterprise operating system built with a modern, scalable architecture.

## Architecture Layers

### 1. Presentation Layer (Frontend)
- **Framework**: React with Vite
- **Desktop**: Tauri
- **Web**: React SPA
- **Mobile**: Tauri Android
- **Styling**: Tailwind CSS + Glassmorphism

### 2. Application Layer (Backend)
- **Framework**: Node.js + Express.js
- **Architecture**: MVC with Service Layer
- **Authentication**: JWT with refresh tokens
- **Authorization**: RBAC with module-level permissions

### 3. Data Layer (Database)
- **Database**: PostgreSQL via Supabase
- **ORM**: Raw SQL with connection pooling
- **Caching**: Supabase cache
- **Backup**: Automated daily backups

### 4. Infrastructure Layer
- **Hosting**: 
  - Web: Vercel
  - API: Render
  - Database: Supabase
- **Monitoring**: Custom health checks
- **Logging**: Winston with file rotation

## Security Architecture

### Authentication Flow
1. User registers → PENDING status
2. CEO approves → ACTIVE status
3. User logs in → JWT token issued
4. Token stored in session table
5. Refresh token rotation on each request

### Authorization Flow
1. Request arrives → Authenticate middleware
2. User role extracted → RBAC check
3. Module permission validated → Access granted/denied
4. Audit log created for all actions

## Data Flow

### Request Lifecycle