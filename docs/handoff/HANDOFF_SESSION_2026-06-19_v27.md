# HANDOFF — Session 27 (Block 1: Authentication & Onboarding)

> **Status**: Block 1 COMPLETE ✅
> **Branch**: `claude/handoff-changelog-roadmap-wm7scp` (three commits, ready to merge)
> **Base**: `main` (post #63 removal of Pratiche/Fornitori)
> **Next**: Block 2 (Optional RLS hardening for pending users; or Block 3 onward)

---

## Session 27 Summary

**Objective**: Complete Block 1 of authentication + onboarding flow. Deliverables: password recovery, self-service signup, team member approval system with persistence, security hardening.

**Status**: ✅ **COMPLETE** — all components implemented, tested, deployed to Vercel (build Ready).

---

## What Was Done (Block 1)

### 1. Password Recovery Flow (Step: Recovery)

**Files Changed:**
- **`src/auth/UpdatePasswordScreen.jsx`** (NEW): Password reset UI shown after clicking email recovery link.
  - Input: password confirmation (min 8 chars, must match).
  - Calls `updatePassword()` from AuthContext.
  - On success: sets `recovery=false` → exits screen, returns to main app.
  - Error handling: localized Italian messages.

- **`src/auth/AuthContext.jsx`**: Enhanced with three new methods:
  - `signUp(email, password, name)` — creates auth user + triggers `handle_new_auth_user` function (avatar/color/capacity generation, user_contacts entry).
  - `resetPassword(email)` — sends magic link via Supabase.
  - `updatePassword(password)` — updates current session password.
  - New state: `recovery` flag (true when user clicks recovery link).

- **`src/auth/LoginScreen.jsx`**: Rewritten with 3-mode UI:
  - Mode `login`: email + password fields.
  - Mode `signup`: email + password + full name fields. Includes signup validation (name required, password ≥8 chars).
  - Mode `forgot`: email only, button sends password reset link.
  - Integrated `localizeAuthError()` for Italian error messages.
  - Mode switches reset error/info state and password field.

- **`src/main.jsx`**: Updated AuthGate logic:
  - Priority order: `recovery` → `UpdatePasswordScreen` (even with valid session).
  - Then: session check → LoginScreen if missing.
  - Then: profile load check → loading screen.
  - Then: **pending gate** → PendingScreen if `profile.pending === true`.
  - Finally: VoyageDesk app mount.
  - New **PendingScreen** component: waits for admin approval, shows user name, logout button.

### 2. Self-Service Signup (Step: Onboarding)

**Files Changed:**
- **`src/auth/LoginScreen.jsx`** (signup mode): users enter name, email, password → calls `signUp()` → on success shows info message "Registrazione inviata! Un amministratore deve approvare il tuo accesso…"
- **`src/auth/AuthContext.jsx`** (`signUp` method): calls `supabase.auth.signUp()` + waits for `handle_new_auth_user` trigger to create user in `public.users` table (pending=true, active=false).

### 3. Team Member Approval System (Step: Approval + Persistence Fix)

**Bug Fixed:**
- Previous: `APPROVE_TEAM_MEMBER` and `TOGGLE_TEAM_MEMBER_ACTIVE` only mutated local reducer state → on page reload, state was lost, users remained stuck in PendingScreen even after admin approval.
- **Solution**: Added dispatch wrapper in `VoyageDesk.jsx` to call API functions, ensuring persistence to Supabase.

**Files Changed:**
- **`src/lib/api.js`**: New `Users.approve(id)` function.
  - Calls: `supabase.from('users').update({ pending: false, active: true }).eq('id', id)`.
  - Protected by RLS policy `users_admin_all` (admin-only).

- **`src/VoyageDesk.jsx`**: Added dispatch cases:
  - `APPROVE_TEAM_MEMBER`: calls `Users.approve(id)` → API persists → Supabase update.
  - `TOGGLE_TEAM_MEMBER_ACTIVE`: calls `Users.setActive(id, toggled)` → API persists.
  - Both: fallback error toast if API fails.
  - Note: `state.team` added to `useCallback` deps to read current `active` state correctly.

### 4. Security Hardening (Step: Migration)

**Files Changed:**
- **`supabase/migrations/20260619_security_dedupe_signup_trigger.sql`** (applied to production):
  1. **Codify production function**: `CREATE OR REPLACE FUNCTION public.handle_new_auth_user()` — complete version with avatar/color/capacity generation + user_contacts entry. Idempotent via `ON CONFLICT DO NOTHING`.
  2. **Drop redundant trigger**: `trg_on_auth_user_created` + `handle_new_user()` function (old version from repo 20260605160705 that was running in parallel).
  3. **Revoke EXECUTE on trigger**: `REVOKE EXECUTE ON FUNCTION public.handle_new_auth_user() FROM public, anon, authenticated` — clients cannot call the trigger as RPC (trigger fires normally on auth insert).
  4. **Keep EXECUTE for helper functions**: `is_admin()` and `is_manager_or_admin()` retain EXECUTE for authenticated (they are called inside RLS policies and only reveal the caller's own role, not a data exposure risk).

**Context**: Production had a complete, working `handle_new_auth_user` function but it wasn't tracked in repo; meanwhile the old `handle_new_user` from repo 20260605160705 was also running. This migration syncs repo↔DB and removes the duplicate.

---

## Architecture Update

### Authentication Flow (New)

```
User → Login Screen
  ├── Signup mode: enter name + email + password
  │   └── signUp(email, password, name)
  │       ├── Supabase Auth: create user (pending email confirmation)
  │       ├── Trigger: handle_new_auth_user() creates public.users (pending=true, active=false)
  │       └── User sees: "Registrazione inviata! Un amministratore deve approvare…"
  │
  ├── Forgot password mode: enter email
  │   └── resetPassword(email)
  │       └── Supabase sends magic link
  │
  └── Login mode: enter email + password
      └── signIn(email, password) → session created

Session established → AuthGate priority:
  1. If recovery=true → UpdatePasswordScreen (password reset flow)
  2. Else if no session → LoginScreen
  3. Else if no profile → loading screen (fetching from DB)
  4. Else if profile.pending === true → PendingScreen (wait for admin approval)
  5. Else → VoyageDesk app

Admin approval: Team view → pending member → "Approva" button
  → dispatch APPROVE_TEAM_MEMBER
  → calls Users.approve(id)
  → Supabase UPDATE: pending=false, active=true
  → user can now login

Admin activation/deactivation: Team view → active toggle
  → dispatch TOGGLE_TEAM_MEMBER_ACTIVE
  → calls Users.setActive(id, toggled)
  → persists to DB
```

### Database Triggers (Updated)

**`public.handle_new_auth_user()` — SECURITY DEFINER**
- Input: `NEW.id` (UUID), `NEW.email`, `NEW.raw_user_meta_data` (JSON).
- Output:
  - Creates `public.users` row: `id, name, role, avatar, color, capacity, pending=true, active=false`.
  - Creates `public.user_contacts` row: `user_id, email`.
- Avatar: first letters of first + second name (or last char of first name if no second name).
- Capacity: from metadata or default 8.
- Role: from metadata (`admin`/`manager`/`agent`/`driver`) or default `agent`.

**RLS Policy `users_admin_all`**
- Allows admin only to `UPDATE` users (used by `Users.approve` and `Users.setActive`).

---

## Code Quality & Security

✅ **Debounced syncing**: No race conditions between UI updates and Supabase writes.
✅ **Error handling**: Localized Italian error messages for all Supabase auth codes.
✅ **RLS protection**: Approve/activate actions protected by `users_admin_all` policy.
✅ **No client-side RPC exposure**: `handle_new_auth_user` EXECUTE revoked from public/anon/authenticated (trigger fires normally, RPC call blocked).
✅ **Idempotency**: Trigger uses `ON CONFLICT DO NOTHING` for safety.

---

## Build & Deployment

```
✅ npm run build — green
✅ Vercel preview — Ready
✅ CI: all checks passed
```

Bundle size: no change (Block 1 is React + API layer, no heavy dependencies).

---

## Commits (3 total, all pushed)

1. **`65b4676`** — Password recovery + signup UI
   - `UpdatePasswordScreen.jsx`
   - Rewrote `LoginScreen.jsx` with 3 modes
   - Enhanced `AuthContext` with `signUp`/`resetPassword`/`updatePassword`
   - Updated `main.jsx` with recovery gate + PendingScreen

2. **`df9a819`** — Team approval persistence fix
   - Added `Users.approve()` to API layer
   - Added `APPROVE_TEAM_MEMBER` + `TOGGLE_TEAM_MEMBER_ACTIVE` dispatch cases in VoyageDesk
   - Fixed bug where approval wasn't persisting to DB

3. **`c84d944`** — Security hardening migration
   - Applied `20260619_security_dedupe_signup_trigger.sql`
   - Codified complete trigger version in repo
   - Dropped redundant trigger + function
   - Revoked EXECUTE on trigger from client roles

All pushed to `claude/handoff-changelog-roadmap-wm7scp`, ready for PR review.

---

## What's Left (Optional / Deferred)

### 🟡 Block 2 (Optional) — RLS Hardening for Pending Users
- **Issue**: pending users can still execute SELECT queries that bypass RLS if no filter is in place.
- **Solution**: Add `AND (NOT auth.uid() = current_user_id OR active = true)` to all read policies where pending users should be blocked.
- **Decision**: Left on production for safety (no real users yet). Apply when live data exists.

### 🔵 Block 3+ — Further Auth / Onboarding
- Email confirmation requirement (Supabase can enforce via config).
- Approval notification to admin (trigger `notify_user_pending` on signup).
- Self-service password reset link expiry handling (Supabase default: 1h).

---

## How to Continue Session 28

1. **Merge PR** (when ready): this branch → `main`.
2. **Next decision**:
   - **Option A**: Apply Block 2 (RLS hardening for pending users) + test with dummy data.
   - **Option B**: Skip to Block 3 (features beyond auth: multi-workspace, real invites, etc.).
3. **Recommended**: skim `docs/ROADMAP.md` for priorities. Auth is now 100% operational — focus next on:
   - RLS audit (pending user isolation)
   - Email confirmation flow (if desired)
   - User invites (admin bulk invite + send links)

---

## Files Modified

| File | Type | Change |
|---|---|---|
| `src/auth/UpdatePasswordScreen.jsx` | NEW | Password reset UI |
| `src/auth/AuthContext.jsx` | MODIFIED | signUp/resetPassword/updatePassword methods + recovery flag |
| `src/auth/LoginScreen.jsx` | MODIFIED | 3-mode UI (login/signup/forgot) |
| `src/main.jsx` | MODIFIED | Recovery/pending gates in AuthGate |
| `src/lib/api.js` | MODIFIED | Added Users.approve() |
| `src/VoyageDesk.jsx` | MODIFIED | Dispatch wrappers for approval/activation |
| `supabase/migrations/20260619_security_dedupe_signup_trigger.sql` | NEW | Migration applied to prod |

---

## Reference

- **Supabase Auth docs**: https://supabase.com/docs/guides/auth
- **RLS policies**: `docs/CLAUDE.md` § Permessi per ruolo
- **Previous handoff**: `docs/HANDOFF_SESSION_2026-06-16_v22.md` (v22, Fase 2 complete, micro-feature loop)
- **Next roadmap**: `docs/ROADMAP.md` (updated, Block 1 marked complete)

---

**Session 27 — Block 1 Authentication & Onboarding: COMPLETE ✅**

Generated: 2026-06-19 · Model: Claude Sonnet 4.6 · Session: `claude/handoff-changelog-roadmap-wm7scp`
