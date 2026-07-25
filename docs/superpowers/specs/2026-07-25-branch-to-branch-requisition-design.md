# Branch-to-Branch Requisition & Approval System

## Overview
Add a requisition workflow where a delivery incharge at one branch can request a vehicle from another branch. The request goes to the PPDA incharge (stockyard worker) and delivery incharge at the source branch — first one to approve wins. The requesting delivery incharge is then notified the car is available for transfer. Includes 16 delivery incharge accounts (one per Nippon Toyota branch) and admin-configurable branch-to-yard mapping.

---

## Database Schema

### New Tables

#### `branches`
Logical branch grouping for Nissan Toyota dealerships.

| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK, default gen_random_uuid() |
| name | text | NOT NULL — e.g. "Kalamassery (Nippon Towers)" |
| active | boolean | DEFAULT true |
| created_at | timestamptz | DEFAULT now() |
| updated_at | timestamptz | DEFAULT now() |

#### `branch_yards`
Many-to-many mapping: which physical yards belong to which logical branch. Admin configurable.

| Column | Type | Constraints |
|--------|------|-------------|
| branch_id | uuid | FK → branches.id |
| yard_id | text | FK → yards.id |
| PRIMARY KEY | (branch_id, yard_id) | |

#### `requisitions`
Branch-to-branch vehicle request.

| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK, default gen_random_uuid() |
| requesting_branch_id | uuid | FK → branches.id (who wants the car) |
| source_branch_id | uuid | FK → branches.id (where car currently is) |
| vehicle_id | uuid | FK → vehicles.id |
| status | text | NOT NULL DEFAULT 'pending' — enum: pending \| approved \| rejected \| fulfilled |
| requested_by | text | NOT NULL — username of requesting delivery_incharge |
| requested_at | timestamptz | DEFAULT now() |
| approved_by | text | — username of approver |
| approved_at | timestamptz | |
| rejected_by | text | |
| rejected_at | timestamptz | |
| rejection_reason | text | |
| fulfilled_at | timestamptz | — when car physically transferred |

#### `notifications`
In-app notifications for status changes.

| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK, default gen_random_uuid() |
| user_role | text | NOT NULL — 'delivery_incharge' \| 'stockyard' |
| branch_id | uuid | FK → branches.id |
| message | text | NOT NULL |
| type | text | NOT NULL — 'requisition_created' \| 'requisition_approved' \| 'requisition_rejected' |
| related_req_id | uuid | FK → requisitions.id |
| read | boolean | DEFAULT false |
| created_at | timestamptz | DEFAULT now() |

### Changes to Existing Tables

#### `credentials`
| Change | Details |
|--------|---------|
| role | Add `delivery_incharge` to allowed values (currently `admin` \| `yard`) |
| branch_id | Add nullable uuid FK → branches.id (links delivery_incharge to their branch) |

### Supabase Auth Seed
Create 16 users with `app_metadata: { role: 'delivery_incharge', branch_id: '...' }`. Username pattern: `{branch_slug}@delivery.nippon` where branch_slug = branch name lowercased, spaces/parens replaced with hyphens (e.g., "Kalamassery (Nippon Towers)" → `kalamassery-nippon-towers@delivery.nippon`). Default password same as username (change on first login — matches existing pattern). Branch slug mapping in seed.ts.

---

## Auth Layer Changes

### `AuthUser` interface (middleware/auth.ts)
```typescript
role: 'stockyard' | 'admin' | 'delivery_incharge'
branch_id: string | null  // NEW: for delivery_incharge (FK to branches); for stockyard derives from yard_id → branch
```

### New middleware
- `requireBranchAccess(branchId)` — validates user's branch_id matches the branch in the request context

### Role semantics
| Role | Source | Purpose |
|------|--------|---------|
| `delivery_incharge` | New accounts (16) | Create requisitions, view incoming/outgoing |
| `stockyard` | Existing users | Acts as **PPDA approver** for their branch (via yard → branch mapping) |
| `admin` | Existing | Full access |

---

## API Endpoints

All endpoints require `authenticate` middleware.

### Admin: Branch Management
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/admin/branches | List all branches with yard counts |
| POST | /api/admin/branches | Create branch (body: { name }) |
| PATCH | /api/admin/branches/:id | Update name / active status |
| DELETE | /api/admin/branches/:id | Deactivate (soft delete) |
| POST | /api/admin/branches/:id/yards | Assign yards (body: { yard_ids: string[] }) |
| DELETE | /api/admin/branches/:id/yards/:yard_id | Unassign yard |

### Requisitions
| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | /api/requisitions | any authenticated | List filtered by user's branch & direction |
| POST | /api/requisitions | delivery_incharge | Create requisition (body: { source_branch_id, vehicle_id }) |
| POST | /api/requisitions/:id/approve | stockyard / delivery_incharge | Approve (first one wins) |
| POST | /api/requisitions/:id/reject | stockyard / delivery_incharge | Reject with reason (body: { reason }) |

### Notifications
| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | /api/notifications | any authenticated | List unread for user's role+branch |
| POST | /api/notifications/:id/read | any authenticated | Mark single as read |
| POST | /api/notifications/read-all | any authenticated | Mark all read |

### Branch Stock Browsing
| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | /api/branches/:id/stock | delivery_incharge | Vehicles currently at any yard in this branch (aggregates vehicle_status) |

---

## Business Logic

### Create Requisition
1. Validate: `requesting_branch_id !== source_branch_id`
2. Validate: vehicle current_status = 'in' AND vehicle at a yard within source_branch
3. Validate: no existing pending requisition for same vehicle_id
4. Insert requisition with status='pending'
5. Create notifications for:
   - stockyard at source_branch (type: requisition_created)
   - delivery_incharge at source_branch (type: requisition_created)

### Approve (First-One-Wins)
```sql
UPDATE requisitions 
SET status = 'approved', approved_by = ?, approved_at = now()
WHERE id = ? AND status = 'pending'
```
- If rows_affected = 0 → conflict ("Already approved/rejected")
- On success: create notification for requesting branch's delivery_incharge (type: requisition_approved)

### Reject
- Validate: user is stockyard or delivery_incharge at source_branch
- Update status = 'rejected', rejected_by, rejected_at, rejection_reason
- Create notification for requester (type: requisition_rejected)

---

## Frontend Components

### New Components
| Component | Purpose |
|-----------|---------|
| `RequisitionsTab.jsx` | Incoming/Outgoing tabs with status badges, actions |
| `CreateRequisitionModal.jsx` | Browse source branch stock, select VIN, confirm |
| `ApproveRequisitionPanel.jsx` | Inline approve/reject buttons in incoming view |
| `NotificationBell.jsx` | Header bell icon with unread count + dropdown panel |
| `BranchesTab.jsx` | Admin: CRUD branches, assign yards (multi-select) |

### Nav Changes
| Role | Nav Items |
|------|-----------|
| admin | Dashboard, Stock, Delivered, Admin → **+ Branches tab** |
| stockyard | Scan, Stock, Dashboard → **+ Requisitions (incoming only)** |
| delivery_incharge | Scan, Stock, Dashboard → **+ Requisitions (incoming + outgoing)** |

### Route
- `/requisitions` → RequisitionsTab

### Polling
Existing 5s `fetchServerData` in `main.jsx` extended to also fetch:
- `GET /api/notifications` (unread)
- `GET /api/requisitions` (for current user's branch)

---

## Edge Cases & Human Error Handling

| Scenario | Handling |
|----------|----------|
| **Both approvers click approve simultaneously** | Atomic UPDATE with `WHERE status='pending'`; rows_affected=0 → 409 conflict error; frontend toast + refresh |
| **Vehicle already OUT/transit** | Backend validates `vehicle_status.current_status='in'` before create; 400 if not available |
| **Requesting same branch** | Backend & frontend block `requesting_branch_id === source_branch_id` |
| **Same vehicle requested twice** | 409 if pending requisition exists for same vehicle_id |
| **Branch has no yards assigned** | Stock browse returns empty; create modal shows warning "No yards assigned to this branch" |
| **Self-approve** | Backend blocks if `approved_by === requested_by` |
| **Approver leaves company** | Remaining approver on branch can still act; admin warned in CredentialsTab if branch has <2 approvers |
| **Offline** | Requisition creation requires server (no queue); shows offline warning on requisition page |
| **Notification delivery** | Polling-based; optimistic UI update on mark-read, server confirms |
| **Yard unassigned mid-requisition** | Requisition references branch (logical); stock browse reflects real-time vehicle_status |

---

## Implementation Phases

1. **DB Migration** — Create 4 tables + add columns to credentials
2. **Auth Updates** — AuthUser type, requireBranchAccess middleware, seed 16 delivery_incharge users
3. **Admin Branch API** — CRUD + yard mapping
4. **Requisition API** — Create, list, approve, reject with notifications
5. **Notification API** — List, mark read
6. **Branch Stock API** — Aggregate vehicle_status across branch_yards
7. **Frontend Components** — RequisitionsTab, CreateRequisitionModal, ApproveRequisitionPanel, NotificationBell, BranchesTab
8. **Nav & Routing** — Role-based nav, /requisitions route
9. **Polling Integration** — Extend fetchServerData
10. **Seed & Test** — Run seed, test full flow with 2 browser sessions

---

## Acceptance Criteria

1. Admin can create 16 branches and assign yards to each
2. 16 delivery_incharge accounts created and can log in
3. Delivery incharge at Branch A browses Branch B stock, selects car, creates requisition
4. PPDA AND delivery_incharge at Branch B see incoming request
5. First one to click Approve wins; other sees "Already approved"
6. Requesting delivery incharge at Branch A sees notification "Car approved for transfer"
7. Requisition shows in both Outgoing (requester) and Incoming (source) tabs with correct status
8. Reject with reason works and notifies requester
9. Notification bell shows unread count, dropdown marks read on click
10. No duplicate requests for same vehicle; proper error handling