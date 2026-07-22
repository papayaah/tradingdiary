# Specification: Authentication & Cloud Persistence System

## 1. Objective
To provide a robust, "offline-ready" but "online-synced" architecture that allows users to sign in via Google and have their data seamlessly persisted to a cloud database across devices.

## 2. Technology Stack
Our standardized stack for authentication and persistence across applications:

*   **Authentication**: [Better-Auth](https://www.better-auth.com/) (using Google Provider).
*   **Database**: PostgreSQL (Running as a local service on the **Hetzner VPS** for ultra-low latency).
*   **Database Connectivity**: Local unix sockets or `localhost` connection strings via `postgress.js`.
*   **ORM & Migrations**: [Drizzle ORM](https://orm.drizzle.team/) + `drizzle-kit`.
*   **Local Persistence**: `idb` (IndexedDB) for large assets or `localStorage` for simple state.
*   **State Management**: [Zustand](https://zustand-demo.pmnd.rs/) with middleware for persistence.

### 2.1 The Date Serialization Fix (CRITICAL)
Better-Auth passes JavaScript `Date` objects to the database adapter. However, the `postgres-js` driver does not automatically serialize them, leading to errors like:
*"The 'string' argument must be of type string... Received an instance of Date"*

**The Solution**: Wrap the postgres client to intercept and serialize Dates before they reach the driver:

```typescript
// wrapPostgres.ts
export function serializeDates<T>(obj: T): T {
  if (obj instanceof Date) return obj.toISOString() as T;
  if (Array.isArray(obj)) return obj.map(serializeDates) as T;
  if (obj !== null && typeof obj === 'object') {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = serializeDates(value);
    }
    return result;
  }
  return obj;
}

export function wrapPostgres(client: any) {
  const originalUnsafe = client.unsafe.bind(client);
  client.unsafe = (query: string, params?: any[]) => {
    return originalUnsafe(query, params ? serializeDates(params) : params);
  };
  return client;
}
```
Use this wrapper in your `db/index.ts` setup.

### 3.1 Authentication Flow (Better-Auth)
We use Better-Auth for its native React 19 support and clean API.
*   **Packages**: `better-auth`, `@reactkits.dev/better-auth-connect` (shared utility).
*   **Provider**: Google OAuth 2.0.
*   **Session Management**: Server-side sessions with client-side hooks (`useSession`).
*   **Protected Routes**: Middleware-based redirection for authenticated-only pages.

### 3.2 Persistence Strategy: "Sync-on-Save"
The application follows a "Locally Persistent, Cloud Enhanced" model.

#### Guest Mode (Offline/Unauthenticated)
*   **Storage Boundary**: Data **MUST NOT** leave the client. No server-side persistence is used for guests.
*   **Primary Store**: IndexedDB (via `idb`) for project JSON and metadata.
*   **Assets**: Large files (images/videos) are stored in the **Origin Private File System (OPFS)** locally.

#### 3.3 The Full Authentication Lifecycle

| User State | Persistence Rule | Network Activity |
| :--- | :--- | :--- |
| **Guest** | IndexedDB / OPFS only. | **None** (for data). |
| **Logging In** | Perform "Migration Check" (Local -> Cloud). | Pull server list, Push local-onlys. |
| **Logged In** | Auto-Sync active (Debounced Pushes). | Pull on tab focus, Push on edit. |
| **Logging Out**| Stop Sync Engine, Flush local cache. | **Cease all Cloud Sync logic.** |

#### 3.4 Termination Protocol (Log Out)
When the user triggers a sign-out:
1.  **Kill the Engine**: The `SyncManager` must immediately `stopAutoSync()`, removing all network event listeners (`online`, `visibilitychange`).
2.  **State Reset**: The Zustand/Redux store must clear the `session` object, returning the app to its **"Guest Boundary"**.
3.  **Clear Sync Errors**: Any pending "Retry" or "Conflict" timers must be cleared to prevent phantom background requests.
4.  **Local Preservation**: Existing projects in IndexedDB remain available for the user as local-only files (unless a "Secure Wipe" is explicitly requested).

#### 3.5 Use of Shared Connectors
Always leverage the `@reactkits.dev/better-auth-connect` package. It provides the standardized `wrapPostgres` utility and the base Drizzle schema, ensuring that **App A** and **App B** share the same user database structure.

1.  **Event-Driven Triggering**:
    *   **Tab Visibility**: Sync pulls when the user returns to the tab.
    *   **Network Status**: Sync pulls when the device comes back online.
    *   **Activity Debounce**: Pushes are debounced (e.g., 5 seconds of idle time) to avoid spamming the API during rapid edits.

2.  **Media Resolution & Stripping**:
    *   **The Problem**: Local unique IDs (like auto-incrementing IndexedDB IDs) are device-specific and will break on other devices.
    *   **The Rule**: During sync, all local media references must be converted to **Server Media Paths** (upload to S3/Object Storage first).
    *   **Resolution**: The client-side sync service iterates through the data, uploads any local-only assets, replaces references with predictable paths, and only then sends the JSON to the DB.

3.  **Conflict Resolution (Last Write Wins)**:
    *   We use a **Revision Number** system.
    *   If a push fails with a `409 Conflict` (server revision > client base revision), the client performs an automatic "Client-Wins" retry by pulling the latest revision number and immediately re-applying its local state.

4.  **Claiming Local Data**:
    *   On the first successful sign-in, the app performs a **"Migration Check"**.
    *   Local-only projects that don't exist on the server are "linked" to the user's new ID and pushed to the cloud.
    *   Empty "Default" projects are discarded to prevent account clutter.

## 4. Database Schema (Drizzle)
Schemas should be defined in `db/schema.ts`. Every persistent entity must include:
*   `id`: UUID (Primary Key).
*   `userId`: Reference to the auth user.
*   `data`: JSONB (to allow for flexible schema evolution without frequent migrations).
*   `createdAt` & `updatedAt`: Timestamps for conflict resolution.

```typescript
// 4.1 App-Specific Project Schema
export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => user.id),
  name: text("name").notNull(),
  data: jsonb("data").notNull(), // Stores project-specific JSON
  updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
});

// 4.2 Standard Better-Auth Schema (Postgres)
// IMPORTANT: Use { mode: 'string' } for timestamps to ensure 
// compatibility with postgres-js and Better-Auth serialization logic.

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name'),
  email: text('email'),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).notNull().defaultNow(),
});

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  providerId: text('provider_id').notNull(),
  accountId: text('account_id').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { mode: 'string' }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { mode: 'string' }),
  scope: text('scope'),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).notNull().defaultNow(),
});

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  token: text('token').notNull(),
  expiresAt: timestamp('expires_at', { mode: 'string' }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).notNull().defaultNow(),
});

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  token: text('token'),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { mode: 'string' }).notNull(),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).notNull().defaultNow(),
});
```

## 5. Migration & Database Deployment
To avoid the common "out-of-sync" issues with Drizzle, follow this strict procedure:

### 5.1 Environment Configuration
`drizzle-kit` does **not** automatically load `.env.local` (the Next.js default). Your `drizzle.config.ts` must explicitly load it using `dotenv`:
```typescript
import { config } from 'dotenv';
config({ path: '.env.local' }); // Ensure secrets are available for migrations
```

### 5.2 The "Generate & Migrate" Flow (Production)
Use this flow for all stable releases. It creates a versioned SQL history in the `/drizzle` folder.

1.  **Generate**: `npm run db:generate`
    *   Creates a new `.sql` file representing the delta.
    *   Verify the SQL to ensure it matches your expectations (e.g., no unintended table drops).
2.  **Migrate**: `npm run db:migrate`
    *   Applies the pending SQL files to the target database.
    *   **Hetzner Note**: Ensure `DATABASE_URL` in your server's `.env` uses `127.0.0.1` instead of `localhost` if you encounter DNS resolution delays with unix sockets.

### 5.3 The "Push" Strategy (Prototyping)
For rapid local development *only*, you can use `npx drizzle-kit push`. 
*   **Pros**: Instant schema sync without SQL files.
*   **Cons**: **WARNING!** It can result in data loss if you rename a column (it drops and recreates). 
*   **Rule**: Never use `push` against a production (Hetzner) database.

### 5.4 Better-Auth Table Management
Better-Auth manages its own internal state but expects specific tables (`user`, `session`, `account`). 
*   Always include these in your `db/schema.ts` so Drizzle is aware of them.
*   If you add custom fields to the `user` table, you must update both the Drizzle schema and the Better-Auth `user.additionalFields` config.

## 6. Shared Packages & Logic
To ensure consistency, use these internal patterns:
*   **`useSyncStatus`**: A hook that displays a "cloud cloud" or "offline" icon to the user.
*   **`Conflict Resolver`**: Logic to handle "LWW" (Last Write Wins) based on the `updatedAt` timestamp if a project is edited on two devices simultaneously.

## 7. Implementation Steps for New Apps
1.  Install dependencies: `npm add better-auth drizzle-orm postgres zustand`.
2.  Initialize Drizzle with the connection string (targeting `localhost` for Hetzner deployments).
3.  Set up Better-Auth handlers in `app/api/auth/[...all]/route.ts`.
4.  Create a Zustand store with the `persist` middleware targeting IndexedDB.
5.  Implement a `SyncManager` component that activates *only* when `session` is present, triggering the "Migration Check" and subsequent auto-pushes.
6.  Ensure the Hetzner server has a local PostgreSQL instance running with a dedicated database for the app.
