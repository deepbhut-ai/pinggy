# Implementation Plan: Team Seat Sharing & Quota Management

This plan introduces Pro Seat Sharing to the Teams module, allowing Team Owners to allocate their purchased Pro subscription seats to team members while keeping existing Token Sharing 100% intact.

## User Review Required

> [!IMPORTANT]
> - **100% Backward-Compatible**: Existing token sharing (`Share Token`) and all active SSH tunnels continue running without any changes or disruption.
> - **Seat Pool Logic**: A Team Owner with $N$ purchased seats can assign up to $N - 1$ seats to teammates (retaining 1 for themselves) across their teams.
> - **Plan Inheritance**: Members assigned a Pro Seat inherit Pro tier privileges (unlimited tunnel duration, custom domains, high bandwidth) funded by the Owner's subscription.
> - **Seat Reclaiming**: Unassigning a seat or removing a member instantly returns the seat to the Owner's pool.

---

## Proposed Changes

### 1. Database Schema

#### [NEW] [0031_team_member_seats.py](file:///Users/deep/Desktop/pinggy/alembic/versions/0031_team_member_seats.py)
- Add `has_seat BOOLEAN NOT NULL DEFAULT FALSE` to `team_members`.
- Add `seat_assigned_at TIMESTAMPTZ NULL` to `team_members`.

---

### 2. Backend Team & Seat APIs

#### [MODIFY] [teams.py](file:///Users/deep/Desktop/pinggy/app/api/routers/teams.py)
- **Seat Calculation**: Compute `total_seats`, `allocated_seats`, and `available_seats` for each team owned by the user.
- **Member Serialization**: Include `has_seat` and `seat_assigned_at` in team member records.
- **[NEW] Endpoint `GET /teams/{team_id}/seats`**: Retrieve seat allocation details for a team.
- **[NEW] Endpoint `POST /teams/{team_id}/seats/assign`**: Assign 1 Pro seat to an existing team member (validates owner seat quota and permissions).
- **[NEW] Endpoint `POST /teams/{team_id}/seats/unassign`**: Revoke a Pro seat from a member and return it to the owner's pool.
- **Lifecycle Safety**: Update `remove_member` and `delete_team` to cleanly release seats.

---

### 3. Plan & Feature Inheritance

#### [MODIFY] [deps.py](file:///Users/deep/Desktop/pinggy/app/core/deps.py) & [auth.py](file:///Users/deep/Desktop/pinggy/app/api/routers/auth.py)
- When resolving user plan in `/auth/me` and dependency guards:
  - If a user is on the `free` tier but has `has_seat = TRUE` in a team owned by an active Pro user, elevate their effective plan to `pro` with `sponsored_by_team = team_name`.
- In [ssh_server.py](file:///Users/deep/Desktop/pinggy/app/core/ssh_server.py):
  - Check seat sponsorship to grant unlimited tunnel durations for seat holders.

---

### 4. Frontend Dashboard UI

#### [MODIFY] [Teams.jsx](file:///Users/deep/Desktop/pinggy/src/pages/dashboard/Teams.jsx)
- **Seat Tracker Bar**: Display total vs allocated seats with a visual meter and a direct `[+ Buy Seats]` link to billing.
- **Shared Team Seats Panel**:
  - Table of active seat holders with `[Unassign Seat]` button.
  - Dropdown to select an unassigned member + `[Assign Pro Seat]` button.
- **Shared Team Tokens Panel**: Kept intact right below the seats panel.

---

### 5. Admin Panel Integration

#### [MODIFY] [AdminUsers.jsx](file:///Users/deep/Desktop/pinggy/src/pages/admin/AdminUsers.jsx)
- Display seat allocation metrics (Total Seats vs Allocated Team Seats vs Free Seats) for each user.
- Allow Super Admins to inspect and adjust seat limits.

---

## Verification Plan

### Automated Verification
- Run Python unit tests for:
  - `POST /teams/{team_id}/seats/assign` (quota check, duplicate prevention, permission guards).
  - `POST /teams/{team_id}/seats/unassign` (seat return to available pool).
  - Effective plan inheritance in `get_api_user`.
- Build Vite frontend (`npm run build`) to ensure zero syntax or build errors.

### Manual Verification
1. Create a Team as a Pro user with multiple seats.
2. Invite a free user as a member.
3. Assign a Pro seat to the member $\to$ verify seat count updates and member inherits Pro status.
4. Unassign the seat $\to$ verify seat returns to pool and member returns to free tier.
5. Verify Token Sharing still functions seamlessly alongside Seat Sharing.
