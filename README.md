<img src="assets/icons/icon-60.png" alt="Rotato Logo" align="left" style="margin-right: 15px;">

# Rotato

**A simple rota management app for clinical teams**

---

## What is Rotato?

Rotato helps clinical teams manage their on-call rotas and duty schedules. It's designed to be simple enough that anyone can use it, while being powerful enough to handle complex rotating schedules.

### Key Features

- **On-Call Schedules** — Set up rotating on-call patterns for consultants and registrars using a slot-based system
- **Job Plans** — Define weekly duty templates (clinics, theatres, admin) that repeat automatically
- **Supporting Clinicians** — Link registrars to the consultants they're supporting for each clinic/theatre
- **Leave Management** — Track annual leave, study leave, sick days, and professional leave with colour-coded calendar display
- **Rest Days** — Automatic rest day calculation for registrars after on-call shifts
- **Coverage Suggestions** — When a registrar is on leave, get smart suggestions for who can cover (auto-cleanup when leave is cancelled)
- **Shareable Calendar** — Generate a link anyone can view (no login required)
- **iCal Feed** — Sync with Google Calendar, Outlook, or your phone

---

## Getting Started

### For Users

Once Rotato is set up, simply open your web browser and go to the address provided by your IT team (e.g., `http://rota.yourhospital.com:3001`).

**Default login:**
- Email: `admin@example.com`
- Password: `admin123`

> ⚠️ **Important:** Change the default password after your first login!

### For IT Teams

Rotato runs as a single Docker container. See the [Deployment Guide](docs/DEPLOYMENT.md) for step-by-step instructions.

**Quick Setup with Portainer:**

```yaml
version: '3.8'
services:
  rotato:
    image: ghcr.io/shadynafie/rotato:latest
    container_name: rotato
    ports:
      - "3001:3001"
    volumes:
      - rotato_data:/data
    environment:
      - JWT_SECRET=CHANGE-THIS-TO-SOMETHING-RANDOM
    restart: unless-stopped

volumes:
  rotato_data:
```

Then access: `http://YOUR-SERVER-IP:3001`

> See the [Deployment Guide](docs/DEPLOYMENT.md) for alternative storage options (host folder vs Docker volume).

---

## How to Use Rotato

### Navigation Overview

The left-hand menu is organised into two sections:

**Daily Tasks** (top section)
- **Calendar** — View and edit the rota
- **Leave** — Record annual leave, study leave, sick days
- **Coverage** — Assign cover when registrars are away
- **Share Links** — Create links to share the rota

**Settings** (collapsible, click to expand)
- **Clinicians** — Add/remove team members
- **Duty Types** — Define clinic types, theatres, admin
- **Job Plans** — Set up weekly templates
- **On-Call Templates** — Configure on-call rotations
- **Admin Users** — Manage who can edit the rota

---

### Daily Tasks

#### Viewing the Rota

1. Click **Calendar** in the menu
2. Use the tabs to switch between **Day**, **Week**, and **Month** views
3. Click on any cell to edit or add a manual override

#### Recording Leave

1. Click **Leave** in the menu
2. Click **Add Leave**
3. Select the clinician and date range
4. Choose the type: Annual, Study, Sick, or Professional
5. The calendar will show them as unavailable with colour-coded leave:
   - **Red** — Annual Leave, Sick Leave
   - **Purple** — Study Leave, Professional Leave

#### Managing Coverage

When a registrar goes on leave, their supporting consultant may need cover. Rotato helps track this.

1. Click **Coverage** in the menu
2. You'll see pending coverage requests (automatically created when registrars take leave)
3. Click on a request to see suggested registrars who are available
4. Assign a registrar to provide cover, or use **Auto-Assign** for smart suggestions

> **Note:** If a leave is cancelled, any associated coverage requests are automatically removed.

#### Sharing the Rota

1. Click **Share Links** in the menu
2. Click **Create New Link**
3. Copy the link and share it with your team
4. Anyone with the link can view the rota (no login needed)

---

### Settings (One-Time Setup)

These are configured once and rarely need changing.

#### Managing Clinicians

1. Expand **Settings** → click **Clinicians**
2. Click **Add Clinician** to add a new team member
3. Set their role (Consultant or Registrar)
4. For registrars, set their grade (Junior or Senior) — useful for matching cover

#### Setting Up Job Plans

Job plans define what each clinician does on each day of the week, repeating on a 5-week cycle.

1. Expand **Settings** → click **Job Plans**
2. Use the Week 1-5 tabs to set up each week's template
3. For each clinician and day, select their AM and PM duties (Clinic, Theatre, Admin, etc.)
4. **For registrars:** Select which consultant they're supporting from the dropdown
5. Click **Save Changes** when done

> **Tip:** The calendar shows "Nafie Clinic" format — the consultant's surname plus the duty name — so everyone knows who's working together.

#### Setting Up On-Call Rotas

1. Expand **Settings** → click **On-Call Templates**
2. You'll see slots for consultants (7-week cycle) and registrars (49-day cycle)
3. Assign clinicians to their slots using the dropdown
4. When staff change, simply update the assignment — the rotation pattern stays the same

> **Tip:** The slot-based system means when someone leaves or joins, you only need to update their slot assignment. The underlying rotation pattern remains unchanged.

---

## Frequently Asked Questions

**Q: Can multiple people edit the rota at once?**
A: Currently, Rotato has a single admin account. Multiple admin support is planned for a future release.

**Q: What happens if a registrar is on leave?**
A: Rotato automatically creates a coverage request for any clinic/theatre they were supporting. Go to **Settings** → **Coverage** to see pending requests and assign cover. If the leave is cancelled, the coverage request is automatically removed.

**Q: What are rest days?**
A: After on-call shifts, registrars automatically get rest days:
- **Weekend on-call (Saturday):** Friday off, Monday off, Tuesday off
- **Weekday on-call (Mon-Thu):** Next day AM = SPA, PM = off
- These appear automatically in the calendar.

**Q: How do I know which registrar to assign for cover?**
A: Rotato suggests available registrars based on who's free that day. It considers workload balance so no one gets overloaded.

**Q: What does "Supporting" mean in Job Plans?**
A: When a registrar is assigned to a clinic or theatre, the "Supporting" field shows which consultant they're working with. This appears in the calendar as "Nafie Clinic" (surname + duty).

**Q: What happens if someone is on leave during their on-call?**
A: The leave will be shown on the calendar. You'll need to arrange cover manually and can add a manual override if needed.

**Q: Can I export the rota to Excel?**
A: Not yet, but you can use the iCal feed to sync with calendar apps, or use the public view link to share with colleagues.

**Q: Is our data secure?**
A: Rotato stores data locally on your server. No data is sent to external services. For best security, run it behind your hospital's firewall or VPN.

---

## Need Help?

- **User questions:** Contact your local IT support
- **Bug reports:** [Open an issue on GitHub](https://github.com/shadynafie/rotato/issues)
- **Technical documentation:** See the [docs folder](docs/)

---

## Documentation

| Document | Description |
|----------|-------------|
| [Deployment Guide](docs/DEPLOYMENT.md) | How to install and run Rotato |
| [Development Guide](docs/DEVELOPMENT.md) | For developers who want to contribute |
| [Architecture](docs/architecture.md) | System design overview |

---

## License

MIT License — free to use, modify, and distribute.

---

<p align="center">
  <img src="assets/icons/icon-32.png" alt="Rotato">
  <br>
  Made with ❤️ for NHS clinical teams
</p>
