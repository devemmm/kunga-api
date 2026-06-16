# Release Regression Checklist

Manual verification checklist for user-facing flows. Run through this before
promoting `staging` → `prod`. Check off each item; note any failures with a
screenshot or log snippet.

Mark with ✅ pass · ❌ fail · ⏭ skipped (explain why)

---

## 1. Authentication

- [ ] **Register** — create a new account with email + password → child setup screen appears
- [ ] **Register duplicate** — same email twice → "Email already in use" error shown
- [ ] **Login valid** — correct credentials → home tab visible, user name shown
- [ ] **Login invalid** — wrong password → "Login failed" alert, not logged in
- [ ] **MFA flow** — account with MFA enabled → OTP screen → correct code → home
- [ ] **Forgot password** — enter email → reset link received → new password accepted → login works
- [ ] **Token refresh** — leave app idle >15 min → resume → still logged in (refresh interceptor)
- [ ] **Logout** — tap logout in Settings → back to onboarding/login, no stale session

---

## 2. Onboarding

- [ ] **Slides** — 3 slides advance with Next; Skip jumps to slide 3
- [ ] **Get Started** → Register screen
- [ ] **I already have an account** → Login screen
- [ ] **Fresh install** — onboarding shown; after login, not shown again on re-open

---

## 3. Home Screen

- [ ] **Greeting** — correct time-of-day greeting with user first name
- [ ] **Child label** — "Supporting [childName]" shown
- [ ] **Today's Routine** — locked card for free user; task list for subscribed user
- [ ] **Streak** — 🔥 streak count shown for subscribed user
- [ ] **Announcement banner** — visible when admin has published one
- [ ] **Your Modules** — at least one module group card visible; "View all" navigates to Modules tab
- [ ] **Pull to refresh** — data reloads without crash

---

## 4. Modules

- [ ] **List loads** — module groups with lesson counts visible
- [ ] **Search** — typing filters lessons in real time; "Clear search" resets
- [ ] **Expand / Collapse** — tapping group header toggles lesson list
- [ ] **FREE badge** — free lessons accessible without subscription
- [ ] **PREMIUM lock** — locked lessons show lock icon; tapping opens paywall
- [ ] **Module detail** — tap lesson → detail screen with video list
- [ ] **Video playback** — tap video → player opens, video plays (Cloudflare Stream / YouTube)
- [ ] **Bookmark** — toggle bookmark on a video; persists after leaving screen
- [ ] **Notes** — add/edit/delete a note on a video

---

## 5. Progress

- [ ] **Progress screen loads** — no crash, charts render
- [ ] **Module completion %** — reflects actual watched videos
- [ ] **Journal** — add a journal entry for today; entry appears in list
- [ ] **Milestone report** — weekly milestone card visible for subscribed user
- [ ] **Routine streak** — streak count matches Home screen

---

## 6. Ask Dr. Gad

- [ ] **Free user** — "Premium feature" message with subscribe CTA
- [ ] **Subscribed (quota remaining)** — question count shown; form visible
- [ ] **Submit question** — fill in text + optional video → success message
- [ ] **Quota reached** — correct "Limit reached" message + buy credit CTA
- [ ] **Buy Question Credit** — Flutterwave WebView opens; after payment, quota resets

---

## 7. Settings

- [ ] **Profile** — name, email, child name/DOB shown correctly
- [ ] **Edit profile** — change name → saved, reflected on Home screen greeting
- [ ] **Change password** — wrong current password → error; correct → success
- [ ] **Subscription status** — "Active" badge for subscribed; "Upgrade to Premium" for free
- [ ] **Notifications** — toggle each category; preference persists after re-open
- [ ] **Language switch** — change to FR/KIN/SW → UI language updates; confirmation prompt shown
- [ ] **Theme toggle** — light / dark / system; persists after re-open
- [ ] **Data export** — triggers download / share sheet without error
- [ ] **Delete account** — confirmation dialog; after confirm, session cleared + account anonymised
- [ ] **Logout** — clears tokens, returns to onboarding

---

## 8. Paywall & Subscriptions

- [ ] **Paywall screen** — Annual + Monthly plans shown with correct prices from admin config
- [ ] **Subscribe (Annual)** — Flutterwave WebView opens; after payment, subscription active
- [ ] **Subscribe (Monthly)** — same flow
- [ ] **Subscription active** — locked screens (Routine, Milestones, Modules) unlock
- [ ] **Expired subscription** — content re-locks; upgrade CTA shown

---

## 9. Notifications

- [ ] **Permission prompt** — shown once on first login; not re-prompted if denied
- [ ] **Push received (foreground)** — in-app banner shown
- [ ] **Push tap** — deep-links to correct screen (e.g. announcement → Announcements)
- [ ] **Routine reminder** — received at scheduled time (requires device notification permission)

---

## 10. Admin Portal

- [ ] **Login** — super-admin credentials → dashboard loads
- [ ] **Dashboard** — stat cards show real data (users, subscriptions, revenue)
- [ ] **Support Team** — list members; create new member → credentials modal shown
- [ ] **Roles** — list roles; create role; assign permissions via checkboxes
- [ ] **Audit Log** — list entries; filter by module; date range filter
- [ ] **Announcements** — create draft; publish → mobile app shows banner
- [ ] **Pricing / App Config** — update monthly price → reflected in mobile app paywall
- [ ] **Ask Dr. Gad queue** — assign question to agent; agent can respond

---

## 11. API / Backend

- [ ] **Health check** — `GET /health` → `{"status":"ok"}`
- [ ] **Public pricing** — `GET /app/pricing` returns current plan prices
- [ ] **Public stats** — `GET /analytics/public-stats` returns families supported count
- [ ] **JWT expiry** — expired token returns 401; refresh token returns new access token
- [ ] **RBAC** — support agent cannot access finance routes (403)

---

## Sign-off

| Role | Name | Date | Result |
|------|------|------|--------|
| Dev | | | |
| QA | | | |
| Release manager | | | |

**Build / version tested:** `v______` (iOS `______` · Android `______`)

**Branch promoted:** `staging` → `prod`

**Rollback plan:** `eas update --branch staging --channel prod` to revert OTA;
full rollback requires re-submitting previous App Store build.
