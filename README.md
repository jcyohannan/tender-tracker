# Tender Progress Tracker

A web app for proposal management teams to track tender progress across 10 stages.

## Quick Start (Local)

1. Make sure you have **Node.js 18+** installed ([download here](https://nodejs.org))
2. Open a terminal/command prompt in this folder
3. Run:
   ```
   npm install
   npm start
   ```
4. Open your browser to **http://localhost:3000**
5. Login with: **admin** / **admin123**

## Deploy Free on Render.com

1. Create a free account at [render.com](https://render.com)
2. Push this folder to a GitHub repository
3. On Render, click **New > Web Service**
4. Connect your GitHub repo
5. Render will auto-detect the settings from `render.yaml`
6. Click **Create Web Service**
7. Your app will be live at `https://your-app-name.onrender.com`

Share that URL with your team — everyone can log in from any device!

## Default Login

- **Username:** admin
- **Password:** admin123
- **Role:** Manager

After logging in, go to **Manage Users** to add your team members.

## Features

- 10 custom tender stages with status tracking
- Manager dashboard with stats, deadlines, and team workload
- Team members see only their assigned tenders
- Daily progress notes per tender
- Daily digest showing overdue, due soon, and pending updates
- Deadline notifications
